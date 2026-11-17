// 讓 Bot 自動對戰並統計。每一局、每個座位都記成一筆資料，可輸出 JSON 給 tools/build_sim_report.py 產生試算表。
// 用法：node personal/simulate.mjs [局數] [每局人數] [種子位移] [--variant=jobs|roles] [--levels] [--car=auto|never|mixed] [--json=檔名] [--label=說明]
//   --variant：jobs＝A 工作卡版（預設），roles＝B 角色版（角色隨機分配）
//   預設全部為高難度 Bot；--levels 改為混合低／中／高難度。
import {writeFileSync} from 'node:fs';
import {DESTINIES,ROLES,GOAL} from './data.js';
import {createGame,rollDice,drawEvent,resolveChoice,respond,responder,takeExam,endTurn,setOvertime,repayDebt,buyCar,buyHouse,netWorth,totalDebt,jobOf,goalProgress,chanceOptions,cardById} from './engine.js';
import {makeBot,botChoice,botRespond,botManageStep} from './bot.js';

// 互動卡統計：每個選項被選幾次、回應結果。
export const usage={};const count=k=>usage[k]=(usage[k]||0)+1;
let seed=1;
const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};

function playTurn(s,rng,opts){
  const p=s.players[s.turnIndex];
  if(opts.carPolicy==='mixed')opts={...opts,carPolicy:p.simCar};
  if(s.phase==='skip')return endTurn(s);
  if(s.phase==='exam')takeExam(s);
  rollDice(s);
  let guard=0;
  while(s.status==='playing'&&['draw','choice','respond'].includes(s.phase)&&guard++<60){
    if(s.phase==='draw')drawEvent(s);
    else if(s.phase==='choice'){
      const pc=s.pendingChoice,card=pc.cardId?cardById(pc.cardId):null,i=botChoice(s,p,rng);
      if(card?.interactive){const o=chanceOptions(s,p,card)[i];count(`${card.id} ${o.kind==='invite'?'邀請':o.kind==='steal'?(o.betray?'搶（背叛）':'搶'):'不參與'}`)}
      resolveChoice(s,p.id,i);
    } else {
      const t=responder(s),r=s.pendingResponse,yes=botRespond(s,t,rng);
      count(r.type==='alliance'?(yes?'C13 對方答應':'C13 對方拒絕'):(yes?'C14 對方反制':'C14 對方不反制'));
      respond(s,t.id,yes);
    }
  }
  const memo={};let step;
  while(s.status==='playing'&&s.phase==='manage'&&(step=botManageStep(s,p,memo,rng,opts))){
    if(step.type==='overtime')setOvertime(s,p.id,step.level);
    else if(step.type==='repay')repayDebt(s,p.id,step.debtId,step.amount);
    else if(step.type==='car')buyCar(s,p.id,step.mode);
    else if(step.type==='house')buyHouse(s,p.id);
  }
  if(s.status==='playing')return endTurn(s);
}

export function runSim(games,size,{quiet=false,offset=0,maxRounds=24,levels=null,carPolicy='auto',records=null,variant='jobs'}={}){
  seed=987654+offset;
  const byDestiny=Object.fromEntries(DESTINIES.map(d=>[d.id,{seats:0,wins:0}])),byLevel={},byJob={},byRole={},byCarPolicy={};
  const reasons={goal:0,progress:0,survivor:0,bankruptcy:0};let rounds=0,carSeats=0,carWins=0,flights=0;
  for(let g=0;g<games;g++){
    const seatLevels=Array.from({length:size},()=>levels?levels[Math.floor(rand()*levels.length)]:'high');
    const players=seatLevels.map((lv,i)=>({name:`P${i+1}`,bot:makeBot(lv,rand),...(variant==='roles'?{roleId:ROLES[Math.floor(rand()*ROLES.length)].id}:{})}));
    const s=createGame({players,seed:offset+g+1,maxRounds,dealDestinies:true,variant});
    if(carPolicy==='mixed')for(const p of s.players)p.simCar=rand()<.5?'auto':'never';
    let guard=0;while(s.status==='playing'&&guard++<5000)playTurn(s,rand,{carPolicy});
    reasons[s.winReason]++;rounds+=s.round;
    s.players.forEach((p,seat)=>{
      const share=s.winnerIds.includes(p.id)?1/s.winnerIds.length:0,job=jobOf(p);
      const key=p.bot.level==='low'?`low-${p.bot.style}`:p.bot.level;
      (byLevel[key]??={seats:0,wins:0}).seats++;byLevel[key].wins+=share;
      byDestiny[p.destinyId].seats++;byDestiny[p.destinyId].wins+=share;
      const jk=variant==='roles'?p.roleId:job.id;
      (byJob[jk]??={name:job.name,seats:0,wins:0}).seats++;byJob[jk].wins+=share;
      if(p.simCar){(byCarPolicy[p.simCar]??={seats:0,wins:0}).seats++;byCarPolicy[p.simCar].wins+=share}
      if(p.owns.car){carSeats++;carWins+=share}flights+=p.stats.flights;
      records?.push({game:offset+g+1,players:size,seat:seat+1,variant,level:p.bot.level,style:p.bot.style||'',destiny:p.destinyId,
        job:variant==='roles'?p.roleId:job.id,jobName:job.name,tier:p.roleId,jobsTaken:p.stats.jobs.length,car:p.owns.car?1:0,carPolicy:p.simCar||carPolicy,flights:p.stats.flights,homePasses:p.stats.homePasses,
        cash:p.cash,debt:totalDebt(p),netWorth:netWorth(p),progress:goalProgress(s,p),bankrupt:p.bankrupt?1:0,win:Math.round(share*10000)/10000,rounds:s.round,reason:s.winReason});
    });
  }
  const fair=100/size,seats=games*size;
  if(!quiet){
    console.log(`${variant==='roles'?'B 角色版':'A 工作卡版'} · ${games} 局 · ${size} 人 · 公平勝率 ${fair.toFixed(1)}% · 平均 ${(rounds/games).toFixed(1)} 季結束 · 達標 ${reasons.goal}／比分數 ${reasons.progress}／倖存 ${reasons.survivor} · 買車率 ${(100*carSeats/seats).toFixed(0)}% · 平均出國 ${(flights/seats).toFixed(2)} 次`);
    console.log('— 天命卡 —');for(const d of DESTINIES){const b=byDestiny[d.id];if(b.seats){const r=100*b.wins/b.seats;console.log(`${d.id} ${d.name.padEnd(7,'　')} 勝率 ${r.toFixed(1).padStart(5)}%（${(r/fair).toFixed(2)} 倍） 座位 ${b.seats}`)}}
    console.log(variant==='roles'?'— 角色 —':'— 最終工作 —');for(const [id,b] of Object.entries(byJob).sort()){const r=100*b.wins/b.seats;console.log(`${id.padEnd(6)} ${b.name.padEnd(8,'　')} 占比 ${(100*b.seats/seats).toFixed(1).padStart(5)}%  勝率 ${r.toFixed(1).padStart(5)}%（${(r/fair).toFixed(2)} 倍）`)}
    for(const [k,b] of Object.entries(byCarPolicy)){const r=100*b.wins/b.seats;console.log(`買車策略 ${k}：勝率 ${r.toFixed(1)}%（${(r/fair).toFixed(2)} 倍） 座位 ${b.seats}`)}
    if(levels){console.log('— Bot 難度 —');for(const [k,b] of Object.entries(byLevel).sort()){const r=100*b.wins/b.seats;console.log(`${k.padEnd(14)} 勝率 ${r.toFixed(1).padStart(5)}%（${(r/fair).toFixed(2)} 倍） 座位 ${b.seats}`)}}
  }
  return {fair,rounds:rounds/games,reasons,byLevel,byDestiny,byJob,byCarPolicy,carRate:carSeats/seats,carWinRate:carSeats?carWins/carSeats:0};
}

if(import.meta.url===`file://${process.argv[1]}`){
  const args=process.argv.slice(2),flags=Object.fromEntries(args.filter(a=>a.startsWith('--')).map(a=>{const [k,v]=a.slice(2).split('=');return [k,v??true]}));
  const [games=1000,size=4,offset=0]=args.filter(a=>!a.startsWith('--')).map(Number);
  const records=flags.json?[]:null,variant=flags.variant||'jobs';
  const opts={offset,levels:flags.levels?['low','mid','high']:null,carPolicy:flags.car||'auto',records,variant};
  const r=runSim(games,size,opts);
  if(flags.usage)console.log(usage);
  if(flags.json){
    writeFileSync(flags.json,JSON.stringify({meta:{label:flags.label||'',variant,games,players:size,offset,levels:!!flags.levels,carPolicy:opts.carPolicy,goal:variant==='roles'?'各角色目標':GOAL.netWorth,createdAt:new Date().toISOString(),avgRounds:r.rounds},records},null,1));
    console.log(`已輸出 ${records.length} 筆座位資料到 ${flags.json}`);
  }
}
