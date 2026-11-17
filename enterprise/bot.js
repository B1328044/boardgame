// 企業版電腦玩家（Bot）。單機版、連線版與 simulate.mjs 共用同一套決策。
// 高：照模擬校準用的「最佳策略」；中：同樣的策略但常失誤；低：開局隨機一種個性。
import {BOARD,SPECIAL} from './data.js';
import {financials,companyPosition,staffPreview,layoffRoom,availableLabor,customerRivals,assetValue} from './engine.js';

export const BOT_LEVELS={
  low:{label:'低',desc:'幾乎隨機，或只偏好一種做法'},
  mid:{label:'中',desc:'想照最佳策略經營，但常常失誤'},
  high:{label:'高',desc:'幾乎不失誤地執行最佳策略'}
};
export const LOW_STYLES={
  random:{label:'隨機派',desc:'所有決定都隨機'},
  aggressive:{label:'擴張派',desc:'能聘就聘、增資照收、拒付贖金'},
  cautious:{label:'保守派',desc:'不聘不裁、能放棄就放棄、贖金照付'}
};
const MID={randomChoice:.3,skipStaff:.35,noise:.5};

export function makeBot(level,rng=Math.random){
  if(!BOT_LEVELS[level])return null;
  if(level==='low'){const styles=Object.keys(LOW_STYLES);return {level,style:styles[Math.floor(rng()*styles.length)]}}
  return {level};
}
export function botLabel(bot){if(!bot)return '';return `Bot·${BOT_LEVELS[bot.level].label}${bot.style?`（${LOW_STYLES[bot.style].label}）`:''}`}
const pickOne=(rng,items)=>items[Math.floor(rng()*items.length)];

/* ---------- AEO：拉霸後調整 ±1 格，盡量避開罷工幽靈 ---------- */
export function botAdjust(s,p,rng=Math.random){
  const dice=s.pendingRoll.dice,opts=[0,1,-1].filter(a=>dice+a>=0);
  const bot=p.bot||{level:'high'};
  if(bot.level==='low'&&bot.style==='random')return pickOne(rng,opts);
  const safe=opts.find(a=>(p.position+dice+a)%BOARD.length!==s.ghostPosition||p.strikeShield);
  return safe??0;
}

/* ---------- 需要選擇的個人事件 ---------- */
// 回傳 resolveChoice 需要的值：玩家 id、'accept'/'decline' 或 'pay'/'refuse'。
export function choiceOptions(s,p){
  const e=s.pendingChoice;
  if(e.eventId==='P10')return s.players.filter(x=>x.id!==p.id).map(x=>x.id);
  if(e.eventId==='P14')return customerRivals(s,p).map(x=>x.id);
  if(e.eventId==='P12')return assetValue(s,p.roleId)>0?['accept','decline']:['decline'];
  if(e.kind==='ransom')return ['pay','refuse'];
  return ['accept','decline'];
}
function bestChoice(s,p){
  const pending=s.pendingChoice,f=financials(s,p.roleId),remaining=s.maxRounds-s.round+1;
  const wealth=x=>companyPosition(s,x.roleId).netWorth;
  switch(pending.eventId){
    case 'P10':return [...s.players].filter(x=>x.id!==p.id).sort((a,b)=>wealth(a)-wealth(b))[0].id; // 和最落後的人結盟，避免幫到領先者
    case 'P14':return customerRivals(s,p).sort((a,b)=>financials(s,b.roleId).revenue-financials(s,a.roleId).revenue)[0].id;
    case 'P11':return SPECIAL.equityCash-SPECIAL.equityShare*Math.max(0,f.profit)*Math.min(4,remaining)>0?'accept':'decline';
    case 'P12':return 'decline'; // 淨資產不變，只多付租金
    case 'P13':return SPECIAL.ransomCost<f.revenue+f.otherIncome?'pay':'refuse';
  }
  return choiceOptions(s,p)[0];
}
export function botChoice(s,p,rng=Math.random){
  const bot=p.bot||{level:'high'},opts=choiceOptions(s,p),kind=s.pendingChoice.kind;
  if(bot.level==='low'){
    if(bot.style==='random')return pickOne(rng,opts);
    if(kind==='target')return bot.style==='aggressive'?bestChoice(s,p):pickOne(rng,opts);
    if(kind==='ransom')return bot.style==='aggressive'?'refuse':'pay';
    return bot.style==='aggressive'&&opts.includes('accept')?'accept':'decline';
  }
  if(bot.level==='mid'&&rng()<MID.randomChoice)return pickOne(rng,opts);
  return bestChoice(s,p);
}

/* ---------- 經營：一次回傳一個動作，null 代表結束這回合 ---------- */
// 員工：在剩餘季數內比較各種調整的總淨效果（扣資遣費與士氣損失），取最佳；最多調整 4 次。
function bestStaffDelta(s,p,noise=0,rng=Math.random){
  const remaining=s.maxRounds-s.round+1,pool=availableLabor(s),room=layoffRoom(s,p.roleId);
  const deltas=[...new Set([5,10,20,40,pool].filter(n=>n>0&&n<=pool).concat([-5,-10,-20,-room].filter(n=>n<0&&-n<=room)))];
  let best=null;
  for(const d of deltas){
    const pv=staffPreview(s,p.roleId,d);if(!pv)continue;
    const moraleLoss=pv.moraleHit?pv.moraleHit/100*.2*financials(s,p.roleId).revenue*remaining:0;
    let value=pv.net*remaining-pv.severance-moraleLoss;
    if(noise)value=value*(1+(rng()*2-1)*noise)+(rng()*2-1)*noise*20;
    if(value>0&&(!best||value>best.value))best={d,value};
  }
  return best?.d??null;
}
export function botManageStep(s,p,memo,rng=Math.random){
  const bot=p.bot||{level:'high'};
  memo.staff=(memo.staff||0);
  if(memo.staff>=4)return null;
  memo.staff++;
  if(bot.level==='low'){
    if(bot.style==='cautious'||memo.staff>1)return null;
    if(bot.style==='aggressive'){const n=Math.min(20,availableLabor(s));return n>0?{type:'staff',delta:n}:null}
    if(rng()<.5)return null;
    const d=pickOne(rng,[5,10,-5,-10]),ok=d>0?d<=availableLabor(s):-d<=layoffRoom(s,p.roleId);
    return ok?{type:'staff',delta:d}:null;
  }
  if(bot.level==='mid'&&memo.staff===1&&rng()<MID.skipStaff)return null;
  const d=bestStaffDelta(s,p,bot.level==='mid'?MID.noise:0,rng);
  return d?{type:'staff',delta:d}:null;
}
