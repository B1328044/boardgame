// 電腦玩家（Bot）。介面、連線版與模擬共用同一套決策，兩種玩法（工作卡版／角色版）都適用。
// 低：幾乎隨機，或只偏好一種選擇（隨機派／賭徒／保守派）
// 中：想照最佳策略走，但估算有誤差、常常失誤
// 高：幾乎不失誤地執行最佳策略
import {ABROAD_CARDS,INSURANCE,INTERACT} from './data.js';
import {chanceOptions,cardById,isJobCard,jobOf,roleById,baseSalary,totalDebt,computeQuarter,carOffer,canBuyHouse,housePlan,examTarget,goalProgress,activeAlliance,val} from './engine.js';

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
// 一回合不能移動，約等於少抽一次卡的價值（萬元，粗估）。
const TURN_VALUE=2.5;
// 估值的時間範圍：剩餘季數，但最多看 16 季（多數對局在那之前就分出勝負）。
const horizon=s=>Math.max(1,Math.min(16,s.maxRounds-s.round));
const role=p=>p.variant==='roles'?roleById(p.roleId):null;
// 角色版的自由業目標是「連續高收入」，所以收入成長的價值加倍。
const incomeWeight=p=>role(p)?.goal.type==='streak'?2:1;

export function makeBot(level,rng=Math.random){
  if(!BOT_LEVELS[level])return null;
  if(level==='low'){const styles=Object.keys(LOW_STYLES);return {level,style:styles[Math.floor(rng()*styles.length)]}}
  return {level};
}
export function botLabel(bot){if(!bot)return '';return `Bot·${BOT_LEVELS[bot.level].label}${bot.style?`（${LOW_STYLES[bot.style].label}）`:''}`}

/* ---------- 估值 ---------- */
export function outcomeValue(s,p,o,stake){
  const left=horizon(s),v=x=>val(x,p.roleId),pay=baseSalary(p),w=incomeWeight(p);
  let x=0;
  if(o.cash)x+=v(o.cash);
  if(o.stakeX)x+=stake*o.stakeX;
  if(o.salary)x+=pay*v(o.salary)/100*left*w;
  if(o.delayedSalary)x+=pay*v(o.delayedSalary.pct)/100*Math.max(0,left-o.delayedSalary.after)*w;
  if(o.flatIncome)x+=o.flatIncome.amount*Math.min(left,o.flatIncome.rounds)*w;
  if(o.unemployed)x-=pay*o.unemployed*(w>1?3:1);
  if(o.fatigue)x-=p.fatigue+o.fatigue>=70?pay*.2:0;
  if(o.investment){const i=o.investment;x+=i.maturity?(i.payout+i.income*i.maturity):(i.income*left+i.value*.5)}
  if(o.insurance)x+=left*.2;
  if(o.delayedCash)x+=o.delayedCash.amount;
  return x;
}
// 合作的期望值（對自己）：答應機率 × [順利 × 收入加成 − 鬧翻 × 收入減少]。
function allianceValue(s,p,acceptP=.75){
  const A=INTERACT.alliance,left=horizon(s),pay=baseSalary(p);
  return acceptP*(A.accept*pay*A.pct/100*Math.min(left,A.rounds)-(1-A.accept)*pay*-A.falloutPct/100*Math.min(left,A.falloutRounds))*incomeWeight(p);
}
// 搶案的期望值：成功率（預估對方有一半機會反制）× 兩季收入 − 投標費；搶合作夥伴還要扣掉官司與失去的合作。
function stealValue(s,p,o){
  const S=INTERACT.steal,L=INTERACT.lawsuit,left=horizon(s),w=incomeWeight(p);
  const chance=o.chance*.75;
  let x=chance*o.amount*Math.min(left,S.rounds)*w-S.fee;
  if(o.betray){
    const t=s.players.find(q=>q.id===o.targetId),ally=activeAlliance(s,p),rest=Math.max(0,ally.until-s.round+1);
    x-=L.win*(rest*L.pct/100*baseSalary(t)+chance*o.amount*S.rounds)+baseSalary(p)*INTERACT.alliance.pct/100*rest*w;
  }
  return x;
}
const optionEV=(s,p,o)=>o.kind==='invite'?allianceValue(s,p):o.kind==='steal'?stealValue(s,p,o):o.outcomes.reduce((t,out)=>t+out.p*outcomeValue(s,p,out,o.stake),0)-o.stake;
// 每季淨收入（薪水－生活費）的估計，用來比較工作。
function jobNet(p,job){
  const pay=job.salary*p.salaryFactor;
  let net=pay-job.living;
  if(job.fatigue)net-=pay*.15;          // 爆肝：等於失去加班的空間
  if(job.skipChance)net-=job.skipChance*TURN_VALUE;
  return net;
}
export function jobValue(s,p,job){
  const c=job.cond||{},{need,bonus}=c.dice?examTarget(p,job):{need:0,bonus:0};
  const prob=c.dice?Math.max(0,Math.min(1,(7-(need-bonus))/6)):1;
  const wait=Math.max(0,(c.wait||0)-(p.destinyId==='D02'?1:0));
  const gain=jobNet(p,job)-jobNet(p,jobOf(p));
  return prob*gain*Math.max(0,horizon(s)-wait-(c.wait?1:0))-(c.cost||0)-wait*TURN_VALUE;
}
// 國外一趟：約停 2 次國外格；扣掉不在主地圖的機會成本。
export function abroadCardValue(s,p,card){
  const left=horizon(s),pay=baseSalary(p);
  let x=card.cash||0;
  if(card.flatIncome)x+=card.flatIncome.amount*Math.min(left,card.flatIncome.rounds);
  if(card.salary)x+=pay*card.salary/100*left;
  if(card.cost)x-=card.cost*(card.insurable&&p.insured?1-INSURANCE.coverage:1);
  if(card.cashPct)x-=Math.min(card.cap??Infinity,Math.max(0,p.cash)*card.cashPct/100);
  if(card.wait)x-=card.wait*TURN_VALUE;
  if(card.fatigue)x-=p.fatigue+card.fatigue>=70?pay*.2:0;
  return x;
}
export function tripValue(s,p){
  const w=ABROAD_CARDS.reduce((t,c)=>t+c.weight,0);
  const ev=ABROAD_CARDS.reduce((t,c)=>t+c.weight*abroadCardValue(s,p,c),0)/w;
  return 2*ev-2*TURN_VALUE;
}
const risky=o=>o.outcomes.length>1||o.outcomes.some(x=>x.unemployed||x.fatigue);
const pick=(rng,items)=>items[Math.floor(rng()*items.length)];
const bufferOf=p=>jobOf(p).living*1.5;
const playerOf=(s,id)=>s.players.find(x=>x.id===id);

/* ---------- 選擇（機會卡、工作卡、機場） ---------- */
export function botChoice(s,p,rng=Math.random){
  const bot=p.bot||{level:'high'},pc=s.pendingChoice,card=pc.cardId?cardById(pc.cardId):null;
  const all=chanceOptions(s,p,card),opts=all.filter(o=>o.affordable),key=k=>opts.find(o=>o.key===k);
  if(pc.kind==='airport'){
    const fly=key('fly');if(!fly)return key('stay').index;
    if(bot.level==='low')return bot.style==='gambler'?fly.index:bot.style==='cautious'?key('stay').index:pick(rng,opts).index;
    if(bot.level==='mid'&&rng()<MID.randomChoice)return pick(rng,opts).index;
    let v=tripValue(s,p)-fly.stake;
    if(bot.level==='mid')v+=(rng()*2-1)*MID.evNoise*6;
    return v>0&&p.cash-fly.stake>=bufferOf(p)?fly.index:key('stay').index;
  }
  if(isJobCard(card)){
    const take=key('take'),redraw=key('redraw'),pass=key('pass');
    if(bot.level==='low'){
      if(bot.style==='gambler')return (take??redraw??pass).index;
      if(bot.style==='cautious')return (take&&!card.cond?.cost&&!card.cond?.wait&&card.salary>jobOf(p).salary?take:pass).index;
      return pick(rng,opts).index;
    }
    if(bot.level==='mid'&&rng()<MID.randomChoice)return pick(rng,opts).index;
    let v=take?jobValue(s,p,card):-Infinity;
    if(take&&card.cond?.cost&&p.cash-card.cond.cost<bufferOf(p)&&bot.level==='high')v=-Infinity;
    if(bot.level==='mid'&&Number.isFinite(v))v=v*(1+(rng()*2-1)*MID.evNoise);
    if(bot.level==='high'&&rng()<HIGH.slip)return pick(rng,opts).index;
    if(v>0)return take.index;
    return (redraw??pass).index;
  }
  if(bot.level==='low'){
    if(bot.style==='gambler')return [...opts].sort((a,b)=>b.stake-a.stake||Number(risky(b))-Number(risky(a))||a.index-b.index)[0].index;
    if(bot.style==='cautious')return [...opts].sort((a,b)=>a.stake-b.stake||Number(risky(a))-Number(risky(b))||Number(b.outcomes.some(x=>x.insurance))-Number(a.outcomes.some(x=>x.insurance)))[0].index;
    return pick(rng,opts).index;
  }
  if(bot.level==='mid'&&rng()<MID.randomChoice)return pick(rng,opts).index;
  const buffer=bufferOf(p);
  let best=null;
  for(const o of opts){
    if(bot.level==='high'&&o.stake>0&&p.cash-o.stake<buffer)continue;
    let ev=optionEV(s,p,o);
    // 合作找目標進度最低的人，避免幫到領先者；搶案優先搶領先者。
    if(o.kind==='invite')ev-=.01*goalProgress(s,playerOf(s,o.targetId));
    if(o.kind==='steal')ev+=.01*goalProgress(s,playerOf(s,o.targetId));
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
  const from=playerOf(s,r.fromId);
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
  const left=horizon(s),amount=Math.min(S.cap,baseSalary(p)*S.share);
  const gain=r.chance/2*amount*Math.min(left,S.rounds)+(1-r.chance/2)*S.fee;
  return gain>S.counterFee&&p.cash-S.counterFee>=jobOf(p).living;
}

/* ---------- 經營階段：一次回傳一個動作，null 代表結束 ---------- */
// memo 記住這回合已經考慮過的項目，避免重複操作。carPolicy 可在模擬中覆寫（'never'／'always'／'auto'）。
export function botManageStep(s,p,memo,rng=Math.random,{carPolicy='auto'}={}){
  const bot=p.bot||{level:'high'},buffer=bufferOf(p);
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
  if(!memo.house){
    memo.house=true;
    const wants=bot.level==='high'||bot.level==='mid'&&rng()>MID.forgetBuy||bot.level==='low'&&(bot.style!=='random'||rng()<.5);
    if(wants&&canBuyHouse(s,p).ok)return {type:'house'};
  }
  if(!memo.car&&!p.owns.car){
    memo.car=true;
    const mode=carMode(s,p,bot,buffer,rng,carPolicy);
    if(mode)return {type:'car',mode};
  }
  return null;
}
function carMode(s,p,bot,buffer,rng,policy){
  const o=carOffer(s,p),r=role(p);
  // 角色版的上班族：全額買車就是勝利目標，買得起就買。
  if(r?.goal.type==='car'){
    const wants=bot.level==='high'||bot.level==='mid'&&rng()>MID.forgetBuy||bot.level==='low'&&(bot.style!=='random'||rng()<.5);
    return wants&&o.cashOk?'cash':null;
  }
  if(policy==='never')return null;
  const net=computeQuarter(s,p).net;
  if(policy==='always')return o.cashOk&&p.cash-o.price>=buffer?'cash':o.loanOk&&p.cash-o.down>=buffer?'loan':null;
  if(bot.level==='low'){
    if(bot.style==='gambler')return o.loanOk?'loan':null;
    if(bot.style==='cautious')return o.cashOk&&p.cash-o.price>=buffer*4?'cash':null;
    return rng()<.15?(o.cashOk?'cash':o.loanOk?'loan':null):null;
  }
  if(bot.level==='mid'&&rng()<MID.forgetBuy)return null;
  // 角色版的其他人：車子只是代步，不要為了車拖慢自己的目標（存錢、還債、買房）。
  if(r)return r.goal.type==='streak'&&o.cashOk&&p.cash-o.price>=buffer*3?'cash':null;
  // 工作卡版：等收入夠穩再買：全額付清後仍留足緩衝，或貸款後每季仍有盈餘。
  if(o.cashOk&&p.cash-o.price>=buffer*3)return 'cash';
  if(o.loanOk&&p.cash-o.down>=buffer*2&&net-o.payment>=2&&jobOf(p).salary>=15)return 'loan';
  return null;
}
function overtimeLevel(p,bot,rng){
  if(p.unemployedRounds)return 0;
  const extra=jobOf(p).fatigue||0,best=p.fatigue+10+extra<70?1:0;
  if(bot.level==='low')return bot.style==='gambler'?2:bot.style==='cautious'?0:Math.floor(rng()*3);
  if(bot.level==='mid'&&rng()<MID.overtimeSlip)return Math.floor(rng()*3);
  return best;
}
function repayAmount(s,p,d,bot,buffer,rng){
  const floor2=x=>Math.floor(x*100)/100,r=role(p);
  if(d.type==='mortgage')return 0;
  if(bot.level==='low'){
    if(bot.style==='cautious')return floor2(Math.min(d.balance,p.cash-buffer));
    return 0;
  }
  if(bot.level==='mid'&&rng()<MID.forgetRepay)return 0;
  if(r?.goal.type==='debtFree'&&p.cash>=r.goal.amount+totalDebt(p))return d.balance;
  if(d.type==='card'||d.type==='credit')return floor2(Math.min(d.balance,p.cash-buffer));
  if(r?.goal.type==='house'&&d.type==='auto'){const h=housePlan(s,p);if(p.cash>=h.down+d.balance)return d.balance}
  if(r)return 0;
  // 工作卡版：存款利率約為政策利率－0.4%；負債利率比存款高才值得提前還。
  const deposit=Math.max(0,s.economy.rate-.4);
  if(d.rate>deposit&&p.cash-buffer*3>=d.balance)return d.balance;
  return 0;
}
