// 依「最佳路徑」自動遊玩並統計各企業勝率。用法：node simulate.mjs [局數] [每局人數]
import {ROLES,BOARD} from './data.js';
import {createGame,rollDice,confirmMove,drawEvent,resolveChoice,endTurn,adjustStaff,companyPosition} from './engine.js';
import {makeBot,botAdjust,botChoice,botManageStep,BOT_LEVELS,LOW_STYLES} from './bot.js';

let seed=20261015;
const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};

// 決策全部來自 bot.js（單機版、連線版的 Bot 也用同一套）。
function playTurn(s,rng=rand){
  const p=s.players[s.turnIndex];
  rollDice(s);
  if(s.phase==='adjust')confirmMove(s,p.id,botAdjust(s,p,rng));
  if(s.phase==='draw')drawEvent(s);
  if(s.phase==='choice')resolveChoice(s,p.id,botChoice(s,p,rng));
  if(s.phase==='manage'){const memo={};let step;while((step=botManageStep(s,p,memo,rng)))adjustStaff(s,p.id,step.delta)}
  return endTurn(s);
}

export function runSim(games,size,{quiet=false,offset=0,levels=null}={}){
  const byLevel={};
  seed=20261015+offset;
  const stats=Object.fromEntries(ROLES.map(r=>[r.id,{games:0,wins:0,worth:0,bankrupt:0}]));
  const ends={goal:0,round_limit:0,bankruptcy:0};let seasons=0;
  const t0=Date.now();
  for(let g=0;g<games;g++){
    const roles=shuffle(ROLES.map(r=>r.id)).slice(0,size);
    const s=createGame({players:roles.map((roleId,i)=>({name:`P${i+1}`,roleId,bot:makeBot(levels?levels[Math.floor(rand()*levels.length)]:'high',rand)})),seed:offset+g+1});
    while(s.status==='playing')playTurn(s);
    ends[s.status]++;seasons+=s.round;
    for(const p of s.players){const k=p.bot.style?`low-${p.bot.style}`:p.bot.level,b=(byLevel[k]??={seats:0,wins:0});b.seats++;if(s.winnerIds.includes(p.id))b.wins+=1/s.winnerIds.length}
    for(const p of s.players){
      const st=stats[p.roleId],w=companyPosition(s,p.roleId).netWorth;
      st.games++;st.worth+=w;if(w<=0)st.bankrupt++;
      if(s.winnerIds.includes(p.id))st.wins+=1/s.winnerIds.length;
    }
  }
  const fair=100/size;
  if(!quiet){
    console.log(`${games} 局 · 每局 ${size} 人 · 公平勝率 ${fair.toFixed(1)}% · 平均 ${(seasons/games).toFixed(1)} 季結束 · 達標 ${ends.goal}／季數上限 ${ends.round_limit}／破產 ${ends.bankruptcy} · ${((Date.now()-t0)/1000).toFixed(1)} 秒`);
    for(const r of [...ROLES].sort((a,b)=>stats[b.id].wins/stats[b.id].games-stats[a.id].wins/stats[a.id].games)){
      const st=stats[r.id],rate=100*st.wins/st.games;
      console.log(`${r.name.padEnd(7,'　')} 勝率 ${rate.toFixed(1).padStart(5)}%（${(rate/fair).toFixed(2)} 倍）  平均淨資產 ${Math.round(st.worth/st.games).toString().padStart(5)}  破產 ${st.bankrupt}`);
    }
  }
  if(!quiet&&levels){console.log('— 依 Bot 難度 —');for(const [k,b] of Object.entries(byLevel).sort()){const name=k.startsWith('low-')?`低（${LOW_STYLES[k.slice(4)].label}）`:BOT_LEVELS[k].label;const rate=100*b.wins/b.seats;console.log(`${name.padEnd(7,'　')} 勝率 ${rate.toFixed(1).padStart(5)}%（${(rate/fair).toFixed(2)} 倍） 座位數 ${b.seats}`)}}
  return {stats,seasons:seasons/games,fair,byLevel};
}
if(import.meta.url===`file://${process.argv[1]}`){
  if(process.argv[2]==='levels')runSim(Number(process.argv[3]||600),Number(process.argv[4]||4),{levels:['low','mid','high'],offset:777});
  else runSim(Number(process.argv[2]||2000),Number(process.argv[3]||4),{offset:Number(process.argv[4]||0)});
}
