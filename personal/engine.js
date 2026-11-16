import {ROLES,BOARD,FORTUNE_CARDS,MARKET_EVENTS,CHANCE_CARDS,LOSS_CARDS,ECONOMY,INSURANCE,FATIGUE,OVERTIME,CREDIT,CENTRAL_BANK_RULES,RATE_BOUNDS,ECON_TILES} from './data.js';

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const round2=n=>Math.round((n+Number.EPSILON)*100)/100;
export const roleById=id=>ROLES.find(r=>r.id===id);
export const cardById=id=>[...FORTUNE_CARDS,...MARKET_EVENTS,...CHANCE_CARDS,...LOSS_CARDS].find(c=>c.id===id);
// 角色相關數值：可以是數字，或 {low:..,office:..,exec:..,free:..,default:..}
export const val=(x,roleId)=>x!==null&&typeof x==='object'&&!Array.isArray(x)?(x[roleId]??x.default??0):x??0;
const nextRandom=state=>{let x=state.rng|0;x^=x<<13;x^=x>>>17;x^=x<<5;state.rng=x|0;return (x>>>0)/4294967296};
const weightedPick=(state,items)=>{const total=items.reduce((s,x)=>s+x.weight,0);let r=nextRandom(state)*total;for(const x of items){r-=x.weight;if(r<0)return x}return items.at(-1)};
const pickOutcome=(state,outcomes)=>{let r=nextRandom(state);for(const o of outcomes){r-=o.p;if(r<0)return o}return outcomes.at(-1)};
const playerById=(state,id)=>state.players.find(p=>p.id===id);
const current=state=>state.players[state.turnIndex];
const say=(state,text)=>state.log.unshift(`第 ${state.round} 季｜${text}`);
/* ---------- 景氣改變棋盤 ---------- */
export function economyRegime(state){
  const g=state.economy.growth;
  return g<=ECON_TILES.recession.growth?'recession':g>=ECON_TILES.boom.growth?'boom':'normal';
}
// 這一格目前實際的類型（衰退時部分市場格會變成災難格）。
export function tileType(state,i){
  const base=BOARD[i].type,r=ECON_TILES.recession;
  return economyRegime(state)==='recession'&&r.flip.includes(i)&&base==='market'?r.to:base;
}
export function tileFlipped(state,i){return tileType(state,i)!==BOARD[i].type}
export const money=n=>`${round2(n).toLocaleString('zh-TW',{maximumFractionDigits:2})} 萬`;

/* ---------- 建立對局 ---------- */
export function createGame({players,seed=Date.now(),maxRounds=24}){
  if(!Array.isArray(players)||players.length<2||players.length>8)throw Error('請選擇 2 至 8 位玩家。');
  if(players.some(p=>!roleById(p.roleId)))throw Error('角色無效。');
  if(players.some(p=>p.bot&&!['low','mid','high'].includes(p.bot.level)))throw Error('Bot 難度無效。');
  const names=players.map(p=>String(p.name||'').trim());
  if(names.some(n=>!n)||new Set(names).size!==names.length)throw Error('玩家名稱不得空白或重複。');
  const n=Number(seed),limit=Number(maxRounds);
  if(!Number.isInteger(n)||!Number.isInteger(limit)||limit<4||limit>60)throw Error('種子或回合上限無效。');
  const state={version:1,game:'life',round:1,maxRounds:limit,turnIndex:0,phase:'roll',rng:n|0||1,seed:n,
    players:players.map((p,i)=>newPlayer(p,names[i],i)),
    economy:{...ECONOMY,priceLevel:1,housePrice:1000,carPrice:100,prevStock:ECONOMY.stock},
    marketActive:[],marketThisRound:null,economyHistory:[],decisions:[],lastRateChangeRound:null,
    log:[],dice:null,reels:null,lastDraw:null,pendingChoice:null,lastResult:null,status:'playing',winnerIds:[],winReason:null};
  delete state.economy.noise;
  say(state,'對局開始。');
  return state;
}
function newPlayer({roleId,bot},name,i){
  const r=roleById(roleId);
  return {id:`player-${i+1}`,name,roleId,bot:bot?{level:bot.level,...(bot.style?{style:bot.style}:{})}:null,color:i,position:0,cash:r.cash,
    debts:r.debts.map((d,k)=>({id:`${d.type}-${k}`,...d})),initialDebt:r.debts.reduce((s,d)=>s+d.balance,0),
    salaryFactor:1,fatigue:0,overtime:0,insured:false,investments:[],effects:[],flatIncomes:[],pendingSalary:[],delayedCash:[],
    unemployedRounds:0,skipNext:false,streak:0,bestStreak:0,lastIncome:null,lastNet:null,lastBreakdown:null,
    owns:{car:false,house:false},bankrupt:false,history:[]};
}

/* ---------- 計算工具 ---------- */
export const totalDebt=p=>round2(p.debts.reduce((s,d)=>s+d.balance,0));
export function debtRate(state,d){
  if(d.type==='mortgage'&&d.variable)return round2(state.economy.rate+.6);
  if(d.type==='credit')return round2(state.economy.rate+CREDIT.spread);
  return d.rate;
}
export function quarterlyPayments(state,p){return round2(p.debts.reduce((s,d)=>s+Math.min(d.payment,d.balance+d.balance*debtRate(state,d)/400),0))}
export const baseSalary=p=>round2(roleById(p.roleId).salary*p.salaryFactor);
export function creditLimit(p){return round2(roleById(p.roleId).salary*CREDIT.limitQuarters)}
export function creditUsed(p){return round2(p.debts.filter(d=>d.type==='credit').reduce((s,d)=>s+d.balance,0))}
function annuity(principal,annualRate,quarters){const r=annualRate/400;return r===0?principal/quarters:principal*r/(1-(1+r)**-quarters)}
export function marketPct(state,roleId,key){
  return state.marketActive.reduce((s,a)=>{const e=cardById(a.eventId),age=state.round-a.startedRound;return s+(age>=0&&age<e.duration?(e.roles?.[roleId]?.[key]||0)*e.decay[age]:0)},0);
}
export function housePlan(state,p){
  const price=state.economy.housePrice,down=round2(price*.3),loan=round2(price-down);
  const newPayment=round2(annuity(loan,state.economy.rate+.6,120));
  const dsr=round2(100*(quarterlyPayments(state,p)+newPayment)/Math.max(1,baseSalary(p)));
  return {price,down,loan,newPayment,dsr,ok:p.cash>=down&&dsr<=roleById('exec').goal.dsr};
}

// 預估或實際計算一季收支。random=false 時自由業收入取期望值（供介面預覽）。
export function computeQuarter(state,p,{random=null}={}){
  const r=roleById(p.roleId),e=state.economy,round=state.round;
  const lines=[];
  let salary=baseSalary(p);
  if(r.incomeType==='freelance'){
    const u=random??.5;
    salary=round2(salary*(.35+1.3*u)*(1+.06*(e.growth-2)));
  }
  let pct=marketPct(state,p.roleId,'income')+p.effects.filter(x=>x.until>=round).reduce((s,x)=>s+(x.income||0),0);
  if(p.overtime)pct+=OVERTIME[p.overtime].income;
  if(p.fatigue>=FATIGUE.burnout)pct+=FATIGUE.burnoutIncome;
  let earned=round2(salary*Math.max(.1,1+clamp(pct,-80,150)/100));
  if(p.unemployedRounds>0){
    earned=['low','office'].includes(p.roleId)?round2(baseSalary(p)*.6):0;
    lines.push({label:p.roleId==='free'?'案源斷炊':'失業中',amount:earned});
  } else lines.push({label:r.incomeType==='freelance'?'接案收入':'薪資',amount:earned});
  if(p.roleId==='exec'&&round%4===0&&p.unemployedRounds===0){
    const bonus=round2(r.salary/3*r.bonusMonths*p.salaryFactor*clamp(1+.15*(e.growth-2),.3,1.8)*(1+marketPct(state,'exec','income')/100));
    earned+=bonus;lines.push({label:'年終獎金',amount:bonus});
  }
  const flats=new Map();
  for(const x of p.flatIncomes.filter(x=>x.until>=round)){const k=x.label||'長期合約';flats.set(k,round2((flats.get(k)||0)+x.amount))}
  for(const [label,amount] of flats){earned+=amount;lines.push({label,amount})}
  const dividends=round2(p.investments.filter(x=>x.income>0).reduce((s,x)=>s+x.income,0));
  if(dividends){earned+=dividends;lines.push({label:'投資分紅',amount:dividends})}
  earned=round2(earned);
  const living=round2(r.living*e.priceLevel*(1+marketPct(state,p.roleId,'living')/100));
  lines.push({label:'生活費',amount:-living});
  const premium=p.insured?INSURANCE.premium:0;
  if(premium)lines.push({label:'保險費',amount:-premium});
  const contributions=round2(p.investments.filter(x=>x.income<0).reduce((s,x)=>s-x.income,0));
  if(contributions)lines.push({label:'互助會會款',amount:-contributions});
  const debt=quarterlyPayments(state,p);
  if(debt)lines.push({label:'還款',amount:-debt});
  const savings=p.cash>0?round2(p.cash*Math.max(0,e.rate-.4)/400):0;
  if(savings)lines.push({label:'存款利息',amount:savings});
  const net=round2(earned+savings-living-premium-contributions-debt);
  return {earned,living,premium,contributions,debt,savings,net,lines};
}

/* ---------- 回合流程 ---------- */
export function movementPath(from,steps,length=BOARD.length){return Array.from({length:steps},(_,i)=>(from+i+1)%length)}
export function rollDice(state,forced){
  if(state.status!=='playing'||state.phase!=='roll')throw Error('現在無法啟動拉霸。');
  const p=current(state);
  const reels=forced??[0,0].map(()=>Math.floor(nextRandom(state)*7));
  if(reels.length!==2||reels.some(n=>!Number.isInteger(n)||n<0||n>6))throw Error('拉霸須有兩個 0–6 的數字。');
  const dice=reels[0]+reels[1],from=p.position,path=movementPath(from,dice);
  p.position=path.at(-1)??from;
  state.dice=dice;state.reels=[...reels];state.lastDraw=null;state.lastResult=null;
  const tile={type:tileType(state,p.position)};
  say(state,`${p.name}拉出 ${reels.join(' + ')}，${dice?`前進 ${dice} 格，停在「${tileLabel(p.position,state)}」`:'停留原地'}。`);
  if(dice&&tile.type==='start'){p.fatigue=clamp(p.fatigue+FATIGUE.restStop,0,100);say(state,`${p.name}在休息站放鬆，疲勞 ${FATIGUE.restStop}。`)}
  state.phase=dice&&tile.type!=='start'?'draw':'manage';
  return {dice,reels,path,from,tile};
}
export function tileLabel(i,state){const t=state?tileType(state,i):BOARD[i].type;return {start:'休息站',fortune:'好運',market:'市場',chance:'機會',loss:'災難'}[t]}

export function drawEvent(state,forcedId){
  if(state.status!=='playing'||state.phase!=='draw')throw Error('現在不需要抽卡。');
  const p=current(state);let type=tileType(state,p.position),note=null;
  // 每季最多一張市場事件，避免人數越多事件越密集。
  if(type==='market'&&state.marketThisRound&&!(forcedId&&forcedId.startsWith('M'))){type='chance';note='本季已發生市場事件，改抽機會卡'}
  const forced=forcedId?cardById(forcedId):null;
  if(type==='fortune'){
    const card=forced??weightedPick(state,FORTUNE_CARDS),boom=economyRegime(state)==='boom';
    const amount=round2(val(card.cash,p.roleId)*(boom?ECON_TILES.boom.fortuneMultiplier:1));
    p.cash=round2(p.cash+amount);
    const extra=boom?`（景氣過熱，獎金 ×${ECON_TILES.boom.fortuneMultiplier}）`:'';
    state.lastDraw={type,cardId:card.id,note};state.lastResult={text:`現金 +${money(amount)}${extra}`,cash:amount};
    say(state,`${p.name}抽到「${card.name}」，現金 +${money(amount)}${extra}。`);
    state.phase='manage';
  } else if(type==='market'){
    const card=forced??MARKET_EVENTS[Math.floor(nextRandom(state)*MARKET_EVENTS.length)];
    applyMarket(state,card);
    state.lastDraw={type,cardId:card.id,note};state.phase='manage';
  } else if(type==='chance'){
    const card=forced??CHANCE_CARDS[Math.floor(nextRandom(state)*CHANCE_CARDS.length)];
    state.lastDraw={type:'chance',cardId:card.id,note};state.pendingChoice={cardId:card.id,playerId:p.id};
    say(state,`${p.name}${note?`（${note}）`:''}抽到機會卡「${card.name}」。`);
    state.phase='choice';
  } else if(type==='loss'){
    if(tileFlipped(state,p.position))note='景氣衰退，這格市場格變成災難格';
    const card=forced??LOSS_CARDS[Math.floor(nextRandom(state)*LOSS_CARDS.length)];
    applyLoss(state,p,card);
    state.lastDraw={type,cardId:card.id,note};state.phase='manage';
  } else throw Error('目前停格沒有事件卡。');
  return state.lastDraw;
}
function applyMarket(state,card){
  state.marketThisRound=card.id;
  state.marketActive.push({eventId:card.id,startedRound:state.round});
  const e=state.economy,parts=[];
  if(card.rateShock){e.rate=round2(clamp(e.rate+card.rateShock,...RATE_BOUNDS));parts.push(`政策利率 ${card.rateShock>0?'+':''}${card.rateShock}`)}
  if(card.prices?.house){e.housePrice=round2(e.housePrice*(1+card.prices.house/100));parts.push(`房價 ${card.prices.house>0?'+':''}${card.prices.house}%`)}
  if(card.prices?.car){e.carPrice=round2(e.carPrice*(1+card.prices.car/100));parts.push(`車價 ${card.prices.car>0?'+':''}${card.prices.car}%`)}
  for(const p of state.players.filter(x=>!x.bankrupt)){
    const c=val(card.cash,p.roleId);if(c)p.cash=round2(p.cash+c);
    const s=card.permanent?.[p.roleId]?.salary;if(s)p.salaryFactor=round2(p.salaryFactor*(1+s/100)*10000)/10000;
  }
  say(state,`市場事件「${card.name}」${parts.length?`：${parts.join('、')}`:''}。`);
}
function applyLoss(state,p,card){
  let lost=0;const notes=[];
  if(card.wipeInvestments&&p.investments.length){lost+=p.investments.reduce((s,x)=>s+(x.value||0),0);p.investments=[];notes.push('所有投資歸零')}
  else if(card.cost){let c=val(card.cost,p.roleId);if(card.insurable&&p.insured){c=round2(c*(1-INSURANCE.coverage));notes.push('保險理賠八成')}p.cash=round2(p.cash-c);lost+=c}
  if(card.cashPct&&p.cash>0){const c=round2(Math.min(card.cap??Infinity,p.cash*card.cashPct/100));p.cash=round2(p.cash-c);lost+=c}
  if(card.income)p.effects.push({source:card.id,income:card.income,until:state.round});
  if(card.unemployed){p.unemployedRounds+=val(card.unemployed,p.roleId);notes.push(`失去收入 ${val(card.unemployed,p.roleId)} 季`)}
  if(card.skip){p.skipNext=true;notes.push('下一回合無法行動')}
  state.lastResult={text:[lost?`損失 ${money(lost)}`:'',...notes].filter(Boolean).join('，'),cash:-lost};
  say(state,`${p.name}遭遇「${card.name}」：${state.lastResult.text||'無直接損失'}。`);
}
// 互動卡的 target 選項會依其他（未破產的）玩家展開成多個選項，例如「與 玩家 2 合作」。
export function chanceOptions(state,p,card){
  const list=[];
  for(const o of card.options){
    const base={label:val(o.label,p.roleId),stake:val(o.stake,p.roleId),outcomes:Array.isArray(o.outcomes)?o.outcomes:o.outcomes[p.roleId]??o.outcomes.default};
    if(o.target){
      for(const t of state.players.filter(x=>x.id!==p.id&&!x.bankrupt)){
        const outcomes=base.outcomes.map(out=>{
          const x={...out,targetId:t.id};
          if(out.steal){const amount=round2(Math.min(out.steal.cap??Infinity,baseSalary(t)*out.steal.share));x.flatIncome={amount,rounds:out.steal.rounds,label:'搶下的案子'};x.victim={id:t.id,amount,rounds:out.steal.rounds}}
          return x;
        });
        list.push({...base,label:card.id==='C13'?`與 ${t.name} 合作`:card.id==='C14'?`搶 ${t.name} 的案子`:`${base.label}：${t.name}`,targetId:t.id,outcomes});
      }
    } else list.push(base);
  }
  return list.map((o,index)=>({...o,index,affordable:p.cash>=o.stake}));
}
export function resolveChoice(state,playerId,index){
  const p=current(state);
  if(state.status!=='playing'||state.phase!=='choice'||p.id!==playerId||!state.pendingChoice)throw Error('現在沒有需要決定的機會卡。');
  const card=cardById(state.pendingChoice.cardId),opt=chanceOptions(state,p,card)[index];
  if(!opt)throw Error('請選擇一個選項。');
  if(!opt.affordable)throw Error(`現金不足，需要 ${money(opt.stake)}。`);
  p.cash=round2(p.cash-opt.stake);
  const o=pickOutcome(state,opt.outcomes),before=p.cash;
  applyEffects(state,p,o,opt.stake);
  const delta=round2(p.cash-before-opt.stake);
  state.lastResult={text:o.text,cash:delta,option:opt.label};
  say(state,`${p.name}選擇「${opt.label}」：${o.text}`);
  state.pendingChoice=null;state.phase='manage';
  checkGoal(state,p);
  return o;
}
function applyEffects(state,p,o,stake){
  const r=state.round,v=x=>val(x,p.roleId);
  if(o.cash)p.cash=round2(p.cash+v(o.cash));
  if(o.stakeX)p.cash=round2(p.cash+stake*o.stakeX);
  if(o.salary)p.salaryFactor=round2(p.salaryFactor*(1+v(o.salary)/100)*10000)/10000;
  if(o.delayedSalary)p.pendingSalary.push({at:r+o.delayedSalary.after,pct:v(o.delayedSalary.pct)});
  if(o.flatIncome)p.flatIncomes.push({amount:o.flatIncome.amount,until:r+o.flatIncome.rounds-1,label:o.flatIncome.label});
  if(o.alliance){
    const partner=playerById(state,o.targetId),until=r+o.alliance.rounds-1;
    for(const x of [p,partner])x.effects.push({source:'C13',income:o.alliance.pct,until,partnerId:x===p?partner.id:p.id});
    say(state,`${p.name}與${partner.name}合作，雙方收入 +${o.alliance.pct}%，到第 ${until} 季。`);
  }
  if(o.victim){
    const target=playerById(state,o.victim.id),until=r+o.victim.rounds-1;
    target.flatIncomes.push({amount:-o.victim.amount,until,label:'被搶走的案子',byId:p.id});
    say(state,`${p.name}搶下${target.name}的案子，到第 ${until} 季每季轉走 ${money(o.victim.amount)}。`);
  }
  if(o.fatigue)p.fatigue=clamp(p.fatigue+o.fatigue,0,100);
  if(o.unemployed)p.unemployedRounds+=o.unemployed;
  if(o.investment){const x=o.investment;p.investments.push({id:`inv-${r}-${p.investments.length}`,name:x.name,value:x.value||0,income:x.income||0,maturity:x.maturity?r+x.maturity:null,payout:x.payout??0,collapse:!!x.collapse})}
  if(o.insurance)p.insured=true;
  if(o.skip)p.skipNext=true;
  if(o.delayedCash)p.delayedCash.push({at:r+o.delayedCash.after,amount:o.delayedCash.amount});
}

/* ---------- 經營動作 ---------- */
function requireManage(state,playerId){const p=current(state);if(state.status!=='playing'||state.phase!=='manage'||p.id!==playerId)throw Error('只能在自己的經營階段操作。');return p}
export function setOvertime(state,playerId,level){const p=requireManage(state,playerId);if(![0,1,2].includes(level))throw Error('加班程度無效。');p.overtime=level}
export function repayDebt(state,playerId,debtId,amount){
  const p=requireManage(state,playerId),d=p.debts.find(x=>x.id===debtId);
  if(!d)throw Error('找不到這筆負債。');
  amount=round2(Math.min(amount,d.balance));
  if(!(amount>0))throw Error('請輸入還款金額。');
  if(amount>p.cash)throw Error('現金不足。');
  p.cash=round2(p.cash-amount);d.balance=round2(d.balance-amount);
  if(d.balance<=0.001)p.debts=p.debts.filter(x=>x!==d);
  say(state,`${p.name}提前償還${d.name} ${money(amount)}。`);
  checkGoal(state,p);
}
export function borrow(state,playerId,amount){
  const p=requireManage(state,playerId);
  const room=round2(creditLimit(p)-creditUsed(p));
  if(!(amount>0)||amount>room)throw Error(`信用貸款額度剩 ${money(Math.max(0,room))}。`);
  addCredit(p,amount);p.cash=round2(p.cash+amount);
  say(state,`${p.name}申請信用貸款 ${money(amount)}。`);
}
function addCredit(p,amount){
  let d=p.debts.find(x=>x.type==='credit');
  if(!d){d={id:'credit-0',type:'credit',name:'信用貸款',balance:0,rate:0,payment:0,variable:true};p.debts.push(d)}
  d.balance=round2(d.balance+amount);d.payment=round2(Math.max(1,d.balance/8+d.balance*.03));
}
export function canBuyGoal(state,p){
  if(p.roleId==='office')return {ok:p.cash>=state.economy.carPrice,price:state.economy.carPrice};
  if(p.roleId==='exec'){const h=housePlan(state,p);return {ok:h.ok,price:h.down,plan:h}}
  return {ok:false};
}
export function buyGoal(state,playerId){
  const p=requireManage(state,playerId),c=canBuyGoal(state,p);
  if(!c.ok)throw Error(p.roleId==='exec'?'頭期款不足，或銀行核貸條件（月付 ≤ 收入 50%）未達成。':'現金不足。');
  if(p.roleId==='office'){p.cash=round2(p.cash-c.price);p.owns.car=true;say(state,`${p.name}一次付清，買下 ${money(c.price)} 的新車！`)}
  else {const h=c.plan;p.cash=round2(p.cash-h.down);p.owns.house=true;p.debts.push({id:`mortgage-new`,type:'mortgage',name:'新屋房貸',balance:h.loan,rate:0,payment:h.newPayment,variable:true});say(state,`${p.name}付了頭期款 ${money(h.down)}，買下 ${money(h.price)} 的房子！`)}
  win(state,[p],'goal');
}

/* ---------- 勝利判定 ---------- */
export function goalProgress(state,p){
  const r=roleById(p.roleId);
  if(r.goal.type==='debtFree'){const a=p.initialDebt?1-clamp(totalDebt(p)/p.initialDebt,0,1):1,b=clamp(p.cash/r.goal.amount,0,1);return round2(.5*a+.5*b)}
  if(r.goal.type==='car')return round2(clamp(p.cash/state.economy.carPrice,0,1));
  if(r.goal.type==='house'){const h=housePlan(state,p);const a=clamp(p.cash/h.down,0,1),b=h.dsr<=r.goal.dsr?1:clamp(r.goal.dsr/h.dsr,0,1);return round2(.75*a+.25*b)}
  if(r.goal.type==='streak')return round2(clamp(Math.max(p.streak,p.bestStreak*.6)/r.goal.rounds,0,1));
  return 0;
}
function checkGoal(state,p){
  if(state.status!=='playing'||p.bankrupt)return false;
  const g=roleById(p.roleId).goal;
  const done=g.type==='debtFree'?totalDebt(p)===0&&p.cash>=g.amount:g.type==='streak'?p.streak>=g.rounds:p.owns.car||p.owns.house;
  if(done&&g.type!=='car'&&g.type!=='house'){win(state,[p],'goal');say(state,`${p.name}達成目標：${g.text}！`)}
  return done;
}
function win(state,winners,reason){state.status='finished';state.phase='finished';state.winnerIds=winners.map(p=>p.id);state.winReason=reason}

export function endTurn(state){
  if(state.status!=='playing'||!['manage','skip'].includes(state.phase))throw Error('請先完成本回合。');
  checkGoal(state,current(state));
  if(state.status!=='playing')return {finished:true};
  return advance(state);
}
function advance(state){
  let i=state.turnIndex;
  while(true){
    i++;
    if(i>=state.players.length){const r=settleRound(state);if(state.status!=='playing')return {...r,finished:true};i=-1;continue}
    if(!state.players[i].bankrupt)break;
  }
  state.turnIndex=i;state.dice=null;state.reels=null;state.lastDraw=null;state.lastResult=null;
  const p=current(state);
  if(p.skipNext){p.skipNext=false;state.phase='skip';say(state,`${p.name}本回合無法行動。`)}
  else state.phase='roll';
  return null;
}

/* ---------- 季結算 ---------- */
export function settleRound(state){
  const round=state.round,e=state.economy;
  for(const p of state.players.filter(x=>!x.bankrupt)){
    for(const s of p.pendingSalary.filter(x=>x.at<=round))p.salaryFactor=round2(p.salaryFactor*(1+s.pct/100)*10000)/10000;
    p.pendingSalary=p.pendingSalary.filter(x=>x.at>round);
    const q=computeQuarter(state,p,{random:nextRandom(state)});
    // 還款：先算利息，再攤還本金。
    for(const d of p.debts){
      const interest=round2(d.balance*debtRate(state,d)/400),pay=round2(Math.min(d.balance+interest,Math.max(d.payment,interest)));
      d.balance=round2(d.balance-(pay-interest));
    }
    p.debts=p.debts.filter(d=>d.balance>0.001);
    let extra=0;
    for(const x of p.investments.filter(x=>x.maturity&&x.maturity<=round)){extra+=x.payout;say(state,x.collapse?`${p.name}的${x.name}會頭倒會，會款全部拿不回來。`:`${p.name}的${x.name}到期，拿回 ${money(x.payout)}。`)}
    p.investments=p.investments.filter(x=>!(x.maturity&&x.maturity<=round));
    for(const x of p.delayedCash.filter(x=>x.at<=round)){extra+=x.amount;say(state,`${p.name}收回借款 ${money(x.amount)}。`)}
    p.delayedCash=p.delayedCash.filter(x=>x.at>round);
    p.cash=round2(p.cash+q.net+extra);
    if(p.unemployedRounds>0)p.unemployedRounds--;
    p.fatigue=clamp(p.fatigue+(p.overtime===2?FATIGUE.overtime2:p.overtime===1?FATIGUE.overtime1:FATIGUE.none),0,100);
    p.overtime=0;
    p.streak=q.earned>=roleById('free').goal.amount?p.streak+1:0;p.bestStreak=Math.max(p.bestStreak,p.streak);
    p.lastIncome=q.earned;p.lastNet=round2(q.net+extra);p.lastBreakdown=q.lines;
    if(round%4===0&&p.unemployedRounds===0){
      if(p.roleId==='office')p.salaryFactor=round2(p.salaryFactor*(1+Math.max(0,(e.growth+e.inflation)/2)/100)*10000)/10000;
      if(p.roleId==='low')p.salaryFactor=round2(p.salaryFactor*(1+Math.max(0,e.inflation/2)/100)*10000)/10000;
    }
    if(p.cash<0){
      const room=round2(creditLimit(p)-creditUsed(p)),need=round2(-p.cash);
      if(need<=room){addCredit(p,need);p.cash=0;say(state,`${p.name}現金不足，自動動用信用貸款 ${money(need)}。`)}
      else {p.bankrupt=true;say(state,`${p.name}現金與信用額度都用盡，宣告破產。`)}
    }
    p.effects=p.effects.filter(x=>x.until>round);p.flatIncomes=p.flatIncomes.filter(x=>x.until>round);
    p.history.push({round,income:q.earned,net:p.lastNet,cash:p.cash,debt:totalDebt(p)});
  }
  updateEconomy(state);
  const alive=state.players.filter(p=>!p.bankrupt);
  for(const p of alive)checkGoal(state,p);
  if(state.status!=='playing')return {round};
  if(alive.length===1&&state.players.length>1){win(state,alive,'survivor');say(state,`其他玩家都破產了，${alive[0].name}獲勝。`);return {round}}
  if(!alive.length){win(state,[],'bankruptcy');return {round}}
  if(round>=state.maxRounds){
    const best=Math.max(...alive.map(p=>goalProgress(state,p)));
    win(state,alive.filter(p=>goalProgress(state,p)===best),'progress');
    say(state,`季數上限到了，目標進度最高的玩家獲勝。`);
    return {round};
  }
  state.round++;state.marketThisRound=null;
  state.marketActive=state.marketActive.filter(a=>state.round-a.startedRound<cardById(a.eventId).duration);
  return {round};
}

/* ---------- 景氣與 AI 央行 ---------- */
function shock(state,key){return state.marketActive.reduce((s,a)=>{const e=cardById(a.eventId),age=state.round-a.startedRound;return s+(age>=0&&age<e.duration?(e.macro?.[key]||0)*e.decay[age]:0)},0)}
export function evaluateCentralBank(state,snap){
  const facts={inflation:snap.inflation,growth:snap.growth,unemployment:snap.unemployment,stockDrop:snap.prevStock?100*(1-snap.stock/snap.prevStock):0};
  const items=CENTRAL_BANK_RULES.map(r=>{const [k,op,v]=r.test.match(/(\w+)(>=|<=)(-?[\d.]+)/).slice(1);const x=facts[k];return {...r,value:round2(x),matched:op==='>='?x>=Number(v):x<=Number(v)}});
  const chosen=items.find(x=>x.matched)||null;
  const cooling=state.lastRateChangeRound!==null&&state.round-state.lastRateChangeRound<2;
  return {items,chosen,cooling};
}
function updateEconomy(state){
  const e=state.economy,noise=()=>(nextRandom(state)*2-1)*ECONOMY.noise;
  e.prevStock=e.stock;
  e.growth=round2(ECONOMY.growth+shock(state,'growth')+noise());
  e.inflation=round2(ECONOMY.inflation+shock(state,'inflation')+noise()/2);
  e.unemployment=round2(clamp(ECONOMY.unemployment+shock(state,'unemployment')-.25*(e.growth-ECONOMY.growth),1.5,15));
  e.stock=round2(Math.max(20,ECONOMY.stock*(1+shock(state,'stock')/100)*(1+.03*(e.growth-ECONOMY.growth))));
  e.priceLevel=round2(e.priceLevel*(1+e.inflation/400)*10000)/10000;
  e.housePrice=round2(e.housePrice*(1+(e.growth+e.inflation)/400));
  e.carPrice=round2(e.carPrice*(1+e.inflation/800));
  const snap={round:state.round,...e};
  const cb=evaluateCentralBank(state,snap);
  let decision={round:state.round,ruleId:null,action:'維持利率',delta:0};
  if(cb.chosen){
    if(cb.cooling)decision={round:state.round,ruleId:cb.chosen.id,action:'冷卻中，維持利率',delta:0};
    else {const before=e.rate;e.rate=round2(clamp(e.rate+cb.chosen.action,...RATE_BOUNDS));decision={round:state.round,ruleId:cb.chosen.id,action:`${cb.chosen.action>0?'升息':'降息'} ${Math.abs(cb.chosen.action)} 個百分點`,delta:round2(e.rate-before)};if(decision.delta)state.lastRateChangeRound=state.round}
  }
  state.decisions.push({...decision,items:cb.items});
  state.economyHistory.push({...snap,rate:e.rate});
  say(state,`季結算完成｜成長 ${e.growth}%、通膨 ${e.inflation}%、失業 ${e.unemployment}%，AI 央行：${decision.action}（利率 ${e.rate}%）。`);
}

export function exportGame(state){return JSON.stringify(state,null,2)}
export function importGame(json){const s=JSON.parse(json);if(s.version!==1||s.game!=='life'||!Array.isArray(s.players)||!s.economy)throw Error('存檔格式不正確。');return s}
