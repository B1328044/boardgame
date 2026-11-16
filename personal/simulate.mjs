// 讓電腦依「最佳策略」自動對戰並統計各角色勝率。
// 用法：node simulate.mjs [局數] [每局人數] [種子位移]　全部為高難度 Bot
//      node simulate.mjs levels [局數] [每局人數]　混合低／中／高難度
import {ROLES} from './data.js';
import {createGame,rollDice,drawEvent,resolveChoice,respond,responder,endTurn,setOvertime,repayDebt,buyGoal,goalProgress,chanceOptions,cardById} from './engine.js';
import {makeBot,botChoice,botRespond,botManageStep,BOT_LEVELS,LOW_STYLES} from './bot.js';
// 互動卡統計：每個選項被選幾次、回應結果。
export const usage={};const count=k=>usage[k]=(usage[k]||0)+1;

let seed=1;
const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};

function playTurn(s,rng){
  const p=s.players[s.turnIndex];
  if(s.phase==='skip')return endTurn(s);
  rollDice(s);
  if(s.phase==='draw')drawEvent(s);
  let guard=0;
  while(['choice','respond'].includes(s.phase)&&guard++<10){
    if(s.phase==='choice'){
      const card=cardById(s.pendingChoice.cardId),i=botChoice(s,p,rng),o=chanceOptions(s,p,card)[i];
      if(card.interactive)count(`${card.id} ${o.kind==='invite'?'邀請':o.kind==='steal'?(o.betray?'搶（背叛）':'搶'):'不參與'}`);
      resolveChoice(s,p.id,i);
    } else {
      const t=responder(s),r=s.pendingResponse,yes=botRespond(s,t,rng);
      count(r.type==='alliance'?(yes?'C13 對方答應':'C13 對方拒絕'):(yes?'C14 對方反制':'C14 對方不反制'));
      respond(s,t.id,yes);
      const text=s.lastResult?.text||'';
      if(r.type==='alliance'&&yes)count(text.includes('鬧翻')?'C13 鬧翻':'C13 合作成功');
      if(r.type==='counter'){count(text.includes('搶到了')?'C14 搶到':'C14 沒搶到');if(text.includes('告贏'))count('背叛 官司告贏');if(text.includes('敗訴'))count('背叛 官司敗訴')}
    }
  }
  const memo={};let step;
  while(s.status==='playing'&&s.phase==='manage'&&(step=botManageStep(s,p,memo,rng))){
    if(step.type==='overtime')setOvertime(s,p.id,step.level);
    else if(step.type==='repay')repayDebt(s,p.id,step.debtId,step.amount);
    else if(step.type==='buy')buyGoal(s,p.id);
  }
  if(s.status==='playing')return endTurn(s);
}

export function runSim(games,size,{quiet=false,offset=0,maxRounds=24,fixedRoles=null,levels=null}={}){
  seed=987654+offset;
  const stats=Object.fromEntries(ROLES.map(r=>[r.id,{seats:0,wins:0,bankrupt:0,progress:0,winRound:0,goalWins:0}]));
  const reasons={goal:0,progress:0,survivor:0,bankruptcy:0};let rounds=0;const byLevel={};
  for(let g=0;g<games;g++){
    const roles=fixedRoles??Array.from({length:size},()=>ROLES[Math.floor(rand()*ROLES.length)].id);
    const seatLevels=levels?roles.map(()=>levels[Math.floor(rand()*levels.length)]):roles.map(()=>'high');
    const s=createGame({players:roles.map((roleId,i)=>({name:`P${i+1}`,roleId,bot:makeBot(seatLevels[i],rand)})),seed:offset+g+1,maxRounds});
    let guard=0;while(s.status==='playing'&&guard++<5000)playTurn(s,rand);
    for(const p of s.players){const key=p.bot.level==='low'?`low-${p.bot.style}`:p.bot.level;const b=(byLevel[key]??={seats:0,wins:0});b.seats++;if(s.winnerIds.includes(p.id))b.wins+=1/s.winnerIds.length}
    reasons[s.winReason]++;rounds+=s.round;
    for(const p of s.players){
      const st=stats[p.roleId];st.seats++;st.progress+=goalProgress(s,p);if(p.bankrupt)st.bankrupt++;
      if(s.winnerIds.includes(p.id)){st.wins+=1/s.winnerIds.length;if(s.winReason==='goal'){st.goalWins++;st.winRound+=s.round}}
    }
  }
  const fair=100/size;
  if(!quiet){
    console.log(`${games} 局 · ${size} 人 · 公平勝率 ${fair.toFixed(1)}% · 平均 ${(rounds/games).toFixed(1)} 季結束 · 達成目標 ${reasons.goal}／比進度 ${reasons.progress}／倖存 ${reasons.survivor}`);
    for(const r of ROLES){const st=stats[r.id],rate=100*st.wins/st.seats;
      console.log(`${r.name.padEnd(4,'　')} 勝率 ${rate.toFixed(1).padStart(5)}%（${(rate/fair).toFixed(2)} 倍） 達標平均季數 ${st.goalWins?(st.winRound/st.goalWins).toFixed(1):'—'}  平均進度 ${(100*st.progress/st.seats).toFixed(0)}%  破產率 ${(100*st.bankrupt/st.seats).toFixed(1)}%`)}
  }
  if(!quiet&&Object.keys(usage).length){console.log('— 互動卡 —');console.log(Object.entries(usage).sort().map(([k,v])=>`${k} ${v}`).join('　'))}
  if(!quiet&&levels){console.log('— 依 Bot 難度 —');for(const [k,b] of Object.entries(byLevel).sort()){const name=k.startsWith('low-')?`低（${LOW_STYLES[k.slice(4)].label}）`:BOT_LEVELS[k].label;const rate=100*b.wins/b.seats;console.log(`${name.padEnd(7,'　')} 勝率 ${rate.toFixed(1).padStart(5)}%（${(rate/fair).toFixed(2)} 倍） 座位數 ${b.seats}`)}}
  return {stats,fair,rounds:rounds/games,reasons,byLevel};
}
// node simulate.mjs levels [局數] [人數]：混合低／中／高難度對戰，比較勝率
if(import.meta.url===`file://${process.argv[1]}`){
  if(process.argv[2]==='levels')runSim(Number(process.argv[3]||1500),Number(process.argv[4]||4),{levels:['low','mid','high'],offset:31337});
  else runSim(Number(process.argv[2]||1000),Number(process.argv[3]||4),{offset:Number(process.argv[4]||0)});
}
