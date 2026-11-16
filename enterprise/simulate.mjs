// 依「最佳路徑」自動遊玩並統計各企業勝率。用法：node simulate.mjs [局數] [每局人數]
import {ROLES,BOARD} from './data.js';
import {createGame,rollDice,confirmMove,drawEvent,resolveChoice,endTurn,adjustStaff,financials,companyPosition,staffPreview,layoffRoom,availableLabor,customerRivals} from './engine.js';

let seed=20261015;
const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};

// 員工：在剩餘季數內，比較各種調整的總淨效果（扣資遣費與士氣損失），反覆取最佳。
function bestStaffing(s,p){
  const remaining=s.maxRounds-s.round+1;
  for(let iter=0;iter<4;iter++){
    const pool=availableLabor(s),room=layoffRoom(s,p.roleId);
    const deltas=[...new Set([5,10,20,40,pool].filter(n=>n>0&&n<=pool).concat([-5,-10,-20,-room].filter(n=>n<0&&-n<=room)))];
    let best=null;
    for(const d of deltas){
      const pv=staffPreview(s,p.roleId,d);if(!pv)continue;
      const moraleLoss=pv.moraleHit?pv.moraleHit/100*.2*financials(s,p.roleId).revenue*remaining:0;
      const value=pv.net*remaining-pv.severance-moraleLoss;
      if(value>0&&(!best||value>best.value))best={d,value};
    }
    if(!best)return;
    adjustStaff(s,p.id,best.d);
  }
}
function decide(s,p){
  const pending=s.pendingChoice,f=financials(s,p.roleId),remaining=s.maxRounds-s.round+1;
  const wealth=x=>companyPosition(s,x.roleId).netWorth;
  switch(pending.eventId){
    case 'P10':return [...s.players].filter(x=>x.id!==p.id).sort((a,b)=>wealth(a)-wealth(b))[0].id; // 和最落後的人結盟，避免幫到領先者
    case 'P14':return customerRivals(s,p).sort((a,b)=>financials(s,b.roleId).revenue-financials(s,a.roleId).revenue)[0].id;
    case 'P11':return 500-.25*Math.max(0,f.profit)*Math.min(4,remaining)>0?'accept':'decline';
    case 'P12':return 'decline'; // 淨資產不變，只多付租金
    case 'P13':return 300<f.revenue+f.otherIncome?'pay':'refuse';
  }
}
function playTurn(s){
  const p=s.players[s.turnIndex];
  rollDice(s);
  if(s.phase==='adjust'){
    const dice=s.pendingRoll.dice,opts=[0,1,-1].filter(a=>dice+a>=0);
    const safe=opts.find(a=>(p.position+dice+a)%BOARD.length!==s.ghostPosition||p.strikeShield);
    confirmMove(s,p.id,safe??0);
  }
  if(s.phase==='draw')drawEvent(s);
  if(s.phase==='choice')resolveChoice(s,p.id,decide(s,p));
  if(s.phase==='manage')bestStaffing(s,p);
  return endTurn(s);
}

export function runSim(games,size,{quiet=false,offset=0}={}){
  seed=20261015+offset;
  const stats=Object.fromEntries(ROLES.map(r=>[r.id,{games:0,wins:0,worth:0,bankrupt:0}]));
  const ends={goal:0,round_limit:0,bankruptcy:0};let seasons=0;
  const t0=Date.now();
  for(let g=0;g<games;g++){
    const roles=shuffle(ROLES.map(r=>r.id)).slice(0,size);
    const s=createGame({players:roles.map((roleId,i)=>({name:`P${i+1}`,roleId})),seed:offset+g+1});
    while(s.status==='playing')playTurn(s);
    ends[s.status]++;seasons+=s.round;
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
  return {stats,seasons:seasons/games,fair};
}
if(import.meta.url===`file://${process.argv[1]}`)runSim(Number(process.argv[2]||2000),Number(process.argv[3]||4),{offset:Number(process.argv[4]||0)});
