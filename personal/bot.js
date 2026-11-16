// 電腦玩家（Bot）。介面與模擬共用同一套決策。
// 低：幾乎隨機，或只偏好一種選擇（隨機派／賭徒／保守派）
// 中：想照最佳策略走，但估算有誤差、常常失誤
// 高：幾乎不失誤地執行最佳策略
import {chanceOptions,cardById,roleById,baseSalary,totalDebt,housePlan,canBuyGoal,val,goalProgress,responder,activeAlliance} from './engine.js';
import {INTERACT} from './data.js';

export const BOT_LEVELS={
  low:{label:'低',desc:'幾乎隨機，或只偏好一種選擇'},
  mid:{label:'中',desc:'想照最佳策略走，但經常失誤'},
  high:{label:'高',desc:'幾乎不失誤地執行最佳策略'}
};
export const LOW_STYLES={
  random:{label:'隨機派',desc:'所有選擇都隨機'},
  gambler:{label:'賭徒',desc:'永遠押最大、天天爆肝、從不提前還款'},
  cautious:{label:'保守派',desc:'從不冒險、從不加班、有錢就還債'}
};
const MID={randomChoice:.3,evNoise:.6,overtimeSlip:.35,forgetRepay:.4,forgetBuy:.25};
const HIGH={slip:.03};

export function makeBot(level,rng=Math.random){
  if(!BOT_LEVELS[level])return null;
  if(level==='low'){const styles=Object.keys(LOW_STYLES);return {level,style:styles[Math.floor(rng()*styles.length)]}}
  return {level};
}
export function botLabel(bot){if(!bot)return '';return `Bot·${BOT_LEVELS[bot.level].label}${bot.style?`（${LOW_STYLES[bot.style].label}）`:''}`}

/* ---------- 估值 ---------- */
// 估計一個結果對自己的價值（萬元）。自由業重視收入成長，因為目標是連續高收入。
export function outcomeValue(s,p,o,stake){
  const left=Math.max(1,s.maxRounds-s.round),v=x=>val(x,p.roleId),pay=baseSalary(p),free=p.roleId==='free';
  let x=0;
  if(o.cash)x+=v(o.cash);
  if(o.stakeX)x+=stake*o.stakeX;
  if(o.salary)x+=pay*v(o.salary)/100*left*(free?2:1);
  if(o.delayedSalary)x+=pay*v(o.delayedSalary.pct)/100*Math.max(0,left-o.delayedSalary.after)*(free?2:1);
  if(o.flatIncome)x+=o.flatIncome.amount*Math.min(left,o.flatIncome.rounds)*(free?2:1);
  if(o.unemployed)x-=pay*o.unemployed*(free?3:1);
  if(o.fatigue)x-=p.fatigue+o.fatigue>=70?pay*.2:0;
  if(o.investment){const i=o.investment;x+=i.maturity?(i.payout+i.income*i.maturity):(i.income*left+i.value*.5)}
  if(o.insurance)x+=left*.2;
  if(o.delayedCash)x+=o.delayedCash.amount;
  return x;
}
// 合作的期望值（對自己）：答應機率 × [順利 × 收入加成 − 鬧翻 × 收入減少]。
function allianceValue(s,p,acceptP=.75){
  const A=INTERACT.alliance,left=Math.max(1,s.maxRounds-s.round),pay=baseSalary(p),w=p.roleId==='free'?2:1;
  return acceptP*(A.accept*pay*A.pct/100*Math.min(left,A.rounds)-(1-A.accept)*pay*-A.falloutPct/100*Math.min(left,A.falloutRounds))*w;
}
// 搶案的期望值：成功率（預估對方有一半機會反制）× 兩季收入 − 投標費；搶合作夥伴還要扣掉官司與失去的合作。
function stealValue(s,p,o){
  const S=INTERACT.steal,L=INTERACT.lawsuit,left=Math.max(1,s.maxRounds-s.round),w=p.roleId==='free'?2:1;
  const chance=o.chance*.75;
  let x=chance*o.amount*Math.min(left,S.rounds)*w-S.fee;
  if(o.betray){
    const t=s.players.find(q=>q.id===o.targetId),ally=activeAlliance(s,p),rest=Math.max(0,ally.until-s.round+1);
    x-=L.win*(rest*L.pct/100*baseSalary(t)+chance*o.amount*S.rounds)+baseSalary(p)*INTERACT.alliance.pct/100*rest*w;
  }
  return x;
}
const optionEV=(s,p,o)=>o.kind==='invite'?allianceValue(s,p):o.kind==='steal'?stealValue(s,p,o):o.outcomes.reduce((t,out)=>t+out.p*outcomeValue(s,p,out,o.stake),0)-o.stake;
const risky=o=>o.outcomes.length>1||o.outcomes.some(x=>x.unemployed||x.fatigue);
const pick=(rng,items)=>items[Math.floor(rng()*items.length)];

/* ---------- 機會卡選擇 ---------- */
export function botChoice(s,p,rng=Math.random){
  const bot=p.bot||{level:'high'},card=cardById(s.pendingChoice.cardId);
  const opts=chanceOptions(s,p,card).filter(o=>o.affordable);
  if(bot.level==='low'){
    if(bot.style==='gambler')return [...opts].sort((a,b)=>b.stake-a.stake||Number(risky(b))-Number(risky(a))||a.index-b.index)[0].index;
    if(bot.style==='cautious')return [...opts].sort((a,b)=>a.stake-b.stake||Number(risky(a))-Number(risky(b))||Number(b.outcomes.some(x=>x.insurance))-Number(a.outcomes.some(x=>x.insurance)))[0].index;
    return pick(rng,opts).index;
  }
  if(bot.level==='mid'&&rng()<MID.randomChoice)return pick(rng,opts).index;
  const buffer=roleById(p.roleId).living*1.5;
  let best=null;
  for(const o of opts){
    if(bot.level==='high'&&o.stake>0&&p.cash-o.stake<buffer)continue;
    let ev=optionEV(s,p,o);
    // 合作找目標進度最低的人，避免幫到領先者；搶案優先搶領先者。
    if(o.kind==='invite')ev-=.01*goalProgress(s,s.players.find(x=>x.id===o.targetId));
    if(o.kind==='steal')ev+=.01*goalProgress(s,s.players.find(x=>x.id===o.targetId));
    if(bot.level==='mid')ev=ev*(1+(rng()*2-1)*MID.evNoise)+(rng()*2-1)*MID.evNoise*Math.max(2,o.stake);
    if(!best||ev>best.ev)best={o,ev};
  }
  if(bot.level==='high'&&rng()<HIGH.slip)return pick(rng,opts).index;
  return (best?.ev>0?best.o:opts.find(o=>o.stake===0)??opts.at(-1)).index;
}

/* ---------- 回應別人的合作邀請或搶案 ---------- */
// 回傳 true＝答應合作／反制，false＝拒絕／不反制。
export function botRespond(s,p,rng=Math.random){
  const bot=p.bot||{level:'high'},r=s.pendingResponse,S=INTERACT.steal;
  const from=s.players.find(x=>x.id===r.fromId);
  if(r.type==='alliance'){
    if(bot.level==='low')return bot.style==='gambler'?true:bot.style==='cautious'?false:rng()<.5;
    if(bot.level==='mid'&&rng()<MID.randomChoice)return rng()<.5;
    // 不幫明顯領先的人；其餘情況合作的期望值是正的。
    const lead=goalProgress(s,from)-goalProgress(s,p);
    return allianceValue(s,p,1)>0&&lead<.25;
  }
  if(p.cash<S.counterFee)return false;
  if(bot.level==='low')return bot.style==='cautious'?true:bot.style==='gambler'?false:rng()<.5;
  if(bot.level==='mid'&&rng()<MID.randomChoice)return rng()<.5;
  // 反制的價值：少被搶的期望損失＋對方失敗時拿到的投標費，減掉反制費。
  const left=Math.max(1,s.maxRounds-s.round),amount=Math.min(S.cap,baseSalary(p)*S.share);
  const gain=r.chance/2*amount*Math.min(left,S.rounds)+(1-r.chance/2)*S.fee;
  return gain>S.counterFee&&p.cash-S.counterFee>=roleById(p.roleId).living;
}

/* ---------- 經營階段：一次回傳一個動作，null 代表結束 ---------- */
// memo 記住這回合已經考慮過的項目，避免重複操作。
export function botManageStep(s,p,memo,rng=Math.random){
  const bot=p.bot||{level:'high'},r=roleById(p.roleId),buffer=r.living*1.5;
  if(!memo.overtime){
    memo.overtime=true;
    const level=overtimeLevel(p,bot,rng);
    if(level!==p.overtime)return {type:'overtime',level};
  }
  const repayable=[...p.debts].filter(d=>d.balance>0&&!memo.debts?.includes(d.id)).sort((a,b)=>b.rate-a.rate);
  for(const d of repayable){
    (memo.debts??=[]).push(d.id);
    const amount=repayAmount(s,p,d,bot,buffer,rng);
    if(amount>=.01)return {type:'repay',debtId:d.id,amount};
  }
  if(!memo.buy){
    memo.buy=true;
    const wants=bot.level==='high'||bot.level==='mid'&&rng()>MID.forgetBuy||bot.level==='low'&&(bot.style!=='random'||rng()<.5);
    if(wants&&canBuyGoal(s,p).ok)return {type:'buy'};
  }
  return null;
}
function overtimeLevel(p,bot,rng){
  if(p.unemployedRounds)return 0;
  const best=p.fatigue+10<70?1:0;
  if(bot.level==='low')return bot.style==='gambler'?2:bot.style==='cautious'?0:Math.floor(rng()*3);
  if(bot.level==='mid'&&rng()<MID.overtimeSlip)return Math.floor(rng()*3);
  return best;
}
function repayAmount(s,p,d,bot,buffer,rng){
  const r=roleById(p.roleId),floor2=x=>Math.floor(x*100)/100;
  if(d.type==='mortgage')return 0;
  if(bot.level==='low'){
    if(bot.style==='cautious')return floor2(Math.min(d.balance,p.cash-buffer));
    return 0;
  }
  if(bot.level==='mid'&&rng()<MID.forgetRepay)return 0;
  if(r.goal.type==='debtFree'&&p.cash>=r.goal.amount+totalDebt(p))return d.balance;
  if(d.type==='card'||d.type==='credit')return floor2(Math.min(d.balance,p.cash-buffer));
  if(r.goal.type==='house'&&d.type==='auto'){const h=housePlan(s,p);if(p.cash>=h.down+d.balance)return d.balance}
  return 0;
}
