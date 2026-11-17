import {TIERS,ROLES,START,GOAL,BASE_JOB,JOBS,DESTINIES,BOARD,HIGHWAY,ABROAD,CAR,FORTUNE_CARDS,MARKET_EVENTS,CHANCE_CARDS,LOSS_CARDS,ABROAD_CARDS,ECONOMY,INSURANCE,FATIGUE,OVERTIME,CREDIT,CENTRAL_BANK_RULES,RATE_BOUNDS,ECON_TILES,INTERACT} from './data.js';

// 兩種玩法共用同一套引擎：
//   jobs（A 工作卡版）：所有人從基本工作與學貸開始，靠工作卡換工作，淨資產先到目標者獲勝。
//   roles（B 角色版）：開局選四種角色之一，各有收入、負債與勝利目標，沒有工作卡。
// 天命卡、家鄉、買車與高速公路、機場與國外、合作／搶案子、景氣改變棋盤兩版都有。
export const VARIANTS={jobs:{label:'工作卡版',short:'A'},roles:{label:'角色版',short:'B'}};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const round2=n=>Math.round((n+Number.EPSILON)*100)/100;
export const tierById=id=>TIERS.find(r=>r.id===id);
export const roleById=id=>ROLES.find(r=>r.id===id);
export const jobById=id=>id?JOBS.find(j=>j.id===id):BASE_JOB;
// 角色版沒有工作卡：把角色當成一份固定的「工作」，收入、生活費與階層都來自角色。
const roleJob=r=>({id:`R-${r.id}`,name:r.title,icon:r.icon,tier:r.id,salary:r.salary,living:r.living,bonusMonths:r.bonusMonths,desc:r.story,role:true});
export const jobOf=p=>p.variant==='roles'?roleJob(roleById(p.roleId)):jobById(p.jobId);
export const destinyById=id=>DESTINIES.find(d=>d.id===id);
export const hasDestiny=(p,id)=>p.destinyId===id;
export const cardById=id=>[...FORTUNE_CARDS,...MARKET_EVENTS,...CHANCE_CARDS,...LOSS_CARDS,...JOBS,...ABROAD_CARDS].find(c=>c.id===id);
export const isJobCard=card=>!!card&&card.id.startsWith('J');
// 階層相關數值：可以是數字，或 {low:..,office:..,exec:..,free:..,default:..}
export const val=(x,tier)=>x!==null&&typeof x==='object'&&!Array.isArray(x)?(x[tier]??x.default??0):x??0;
const nextRandom=state=>{let x=state.rng|0;x^=x<<13;x^=x>>>17;x^=x<<5;state.rng=x|0;return (x>>>0)/4294967296};
const weightedPick=(state,items)=>{const total=items.reduce((s,x)=>s+x.weight,0);let r=nextRandom(state)*total;for(const x of items){r-=x.weight;if(r<0)return x}return items.at(-1)};
const pickOutcome=(state,outcomes)=>{let r=nextRandom(state);for(const o of outcomes){r-=o.p;if(r<0)return o}return outcomes.at(-1)};
const d6=state=>1+Math.floor(nextRandom(state)*6);
const playerById=(state,id)=>state.players.find(p=>p.id===id);
const current=state=>state.players[state.turnIndex];
const say=(state,text)=>state.log.unshift(`第 ${state.round} 季｜${text}`);
export const money=n=>`${round2(n).toLocaleString('zh-TW',{maximumFractionDigits:2})} 萬`;

/* ---------- 景氣改變棋盤 ---------- */
export function economyRegime(state){
  const g=state.economy.growth;
  return g<=ECON_TILES.recession.growth?'recession':g>=ECON_TILES.boom.growth?'boom':'normal';
}

/* ---------- 地圖 ---------- */
export const TRACKS={main:BOARD,highway:HIGHWAY.tiles,abroad:ABROAD.tiles};
// 這一格目前實際的類型（主地圖衰退時，部分市場格會變成災難格）。
export function tileAt(track,i,state){
  const tile=TRACKS[track][i];
  if(state&&track==='main'&&tile.type==='market'&&economyRegime(state)==='recession'&&ECON_TILES.recession.flip.includes(i))return {...tile,type:ECON_TILES.recession.to,flipped:true};
  return tile;
}
export const tileType=(state,i,track='main')=>tileAt(track,i,state).type;
export const tileFlipped=(state,i,track='main')=>!!tileAt(track,i,state).flipped;
export const nodeKey=n=>`${n.t}-${n.i}`;
const TILE_NAMES={home:'家鄉',fortune:'好運',market:'市場',chance:'機會',loss:'災難',airport:'機場',ramp:'交流道',toll:'收費站',arrival:'入境',abroad:'國外',return:'回國'};
export function tileLabel(track,i,state){if(typeof track==='number'){state=i;i=track;track='main'}const t=tileAt(track,i,state).type;return `${track==='highway'?'高速公路·':track==='abroad'?'國外·':''}${TILE_NAMES[t]}`}
export function nextNode(n,p){
  if(n.t==='main'){if(n.i===HIGHWAY.from&&p.owns.car&&p.useHighway)return {t:'highway',i:0};return {t:'main',i:(n.i+1)%BOARD.length}}
  if(n.t==='highway')return n.i<HIGHWAY.tiles.length-1?{t:'highway',i:n.i+1}:{t:'main',i:HIGHWAY.to};
  return {t:'abroad',i:Math.min(n.i+1,ABROAD.tiles.length-1)};
}
// 從玩家目前位置走 steps 步的路徑（不含起點）；在國外走到「回國」就停。
export function movementPath(p,steps){
  const path=[];let n={t:p.track,i:p.position};
  for(let k=0;k<steps;k++){n=nextNode(n,p);path.push(n);if(n.t==='abroad'&&tileAt('abroad',n.i).type==='return')break}
  return path;
}

/* ---------- 建立對局 ---------- */
// variant：'jobs'（A 工作卡版）或 'roles'（B 角色版，每位玩家要給 roleId）。
// dealDestinies=true 時直接發完天命卡（模擬與測試用）；否則對局從「抽天命卡」階段開始，每位玩家輪流自己抽。
export function createGame({players,seed=Date.now(),maxRounds=24,dealDestinies=false,variant='jobs'}){
  if(!VARIANTS[variant])throw Error('玩法無效。');
  if(!Array.isArray(players)||players.length<2||players.length>8)throw Error('請選擇 2 至 8 位玩家。');
  if(variant==='roles'&&players.some(p=>!roleById(p.roleId)))throw Error('角色無效。');
  if(players.some(p=>p.bot&&!['low','mid','high'].includes(p.bot.level)))throw Error('Bot 難度無效。');
  if(players.some(p=>p.destinyId&&!destinyById(p.destinyId)))throw Error('天命卡無效。');
  const names=players.map(p=>String(p.name||'').trim());
  if(names.some(n=>!n)||new Set(names).size!==names.length)throw Error('玩家名稱不得空白或重複。');
  const n=Number(seed),limit=Number(maxRounds);
  if(!Number.isInteger(n)||!Number.isInteger(limit)||limit<4||limit>60)throw Error('種子或回合上限無效。');
  const state={version:4,game:'life',variant,round:1,maxRounds:limit,turnIndex:0,phase:'roll',rng:n|0||1,seed:n,players:[],
    economy:{...ECONOMY,priceLevel:1,housePrice:1000,carPrice:variant==='roles'?CAR.rolesPrice:CAR.price,prevStock:ECONOMY.stock},
    marketActive:[],marketThisRound:null,economyHistory:[],decisions:[],lastRateChangeRound:null,
    log:[],dice:null,reels:null,lastMove:null,queue:[],drawSeq:0,lastDraw:null,pendingChoice:null,pendingResponse:null,lastResult:null,skipReason:null,status:'playing',winnerIds:[],winReason:null};
  delete state.economy.noise;
  // 小種子的 xorshift 前幾個數字偏小，先暖機避免開局抽牌偏向固定結果。
  for(let k=0;k<12;k++)nextRandom(state);
  // 天命卡：先發指定的，其餘從牌堆隨機發（不重複）。
  const pool=DESTINIES.map(d=>d.id).filter(id=>!players.some(p=>p.destinyId===id));
  for(let i=pool.length-1;i>0;i--){const j=Math.floor(nextRandom(state)*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]]}
  state.destinyDeck=pool;state.destinySeq=0;state.lastDestiny=null;state.turnCards=[];
  state.players=players.map((p,i)=>newPlayer(p,names[i],i,variant));
  say(state,variant==='roles'?'對局開始，每個人扮演自己選的角色。':'對局開始，所有人都從基本工作與學貸起步。');
  for(const [i,p] of state.players.entries()){const id=players[i].destinyId||(dealDestinies?pool.shift():null);if(id)assignDestiny(state,p,id)}
  const first=state.players.findIndex(p=>!p.destinyId);
  if(first>=0){state.phase='destiny';state.turnIndex=first}
  return state;
}
function assignDestiny(state,p,id){
  p.destinyId=id;
  if(id==='D09')for(const d of p.debts)if(d.type==='student')d.balance=round2(d.balance/2);
  p.initialDebt=totalDebt(p);
  say(state,`${p.name}抽到天命卡「${destinyById(id).name}」。`);
}
// 開局：目前玩家從天命牌堆抽一張，接著輪到下一位還沒抽的玩家；全部抽完後開始第一季。
export function drawDestiny(state,forcedId){
  if(state.status!=='playing'||state.phase!=='destiny')throw Error('現在不是抽天命卡的時候。');
  const p=current(state);
  let id=forcedId??state.destinyDeck.shift();
  if(forcedId){if(!destinyById(forcedId)||state.players.some(x=>x.destinyId===forcedId))throw Error('天命卡無效。');state.destinyDeck=state.destinyDeck.filter(x=>x!==forcedId)}
  assignDestiny(state,p,id);
  state.destinySeq++;state.lastDestiny={playerId:p.id,destinyId:id,seq:state.destinySeq};
  const next=state.players.findIndex(x=>!x.destinyId);
  if(next>=0)state.turnIndex=next;
  else {state.turnIndex=0;state.phase='roll';say(state,'天命卡都抽完了，第 1 季開始！')}
  return id;
}
function newPlayer({bot,roleId},name,i,variant){
  const r=variant==='roles'?roleById(roleId):null;
  const debts=(r?r.debts:START.debts).map((d,k)=>({id:`${d.type}-${k}`,...d}));
  return {id:`player-${i+1}`,name,variant,bot:bot?{level:bot.level,...(bot.style?{style:bot.style}:{})}:null,color:i,destinyId:null,jobId:null,roleId:r?r.id:BASE_JOB.tier,
    track:'main',position:0,cash:r?r.cash:START.cash,debts,initialDebt:debts.reduce((s,d)=>s+d.balance,0),salaryFactor:1,fatigue:0,overtime:0,insured:false,investments:[],effects:[],flatIncomes:[],pendingSalary:[],delayedCash:[],
    unemployedRounds:0,waitTurns:0,waitReason:null,training:null,streak:0,bestStreak:0,feuds:[],stealImmuneUntil:0,lastIncome:null,lastNet:null,lastBreakdown:null,
    owns:{car:false,house:false},carValue:0,useHighway:true,bankrupt:false,history:[],stats:{flights:0,homePasses:0,jobs:[]}};
}

/* ---------- 計算工具 ---------- */
export const totalDebt=p=>round2(p.debts.reduce((s,d)=>s+d.balance,0));
export const netWorth=p=>round2(p.cash+p.investments.reduce((s,x)=>s+(x.value||0),0)+(p.carValue||0)-totalDebt(p));
export function debtRate(state,d){
  if(d.type==='mortgage'&&d.variable)return round2(state.economy.rate+.6);
  if(d.type==='credit')return round2(state.economy.rate+CREDIT.spread);
  return d.rate;
}
// 每筆負債本季要繳多少：至少繳清利息（利率上升時月付金不夠付利息，差額也要付），最多繳到還清。
// 預估（computeQuarter）與季結算都用這一個函式，避免「畫面扣的錢」和「實際扣的錢」不一樣。
export function debtDue(state,d){const interest=round2(d.balance*debtRate(state,d)/400);return {interest,pay:round2(Math.min(d.balance+interest,Math.max(d.payment,interest)))}}
export function quarterlyPayments(state,p){return round2(p.debts.reduce((s,d)=>s+debtDue(state,d).pay,0))}
export const baseSalary=p=>round2(jobOf(p).salary*p.salaryFactor);
export function creditLimit(p){return round2(jobOf(p).salary*CREDIT.limitQuarters)}
export function creditUsed(p){return round2(p.debts.filter(d=>d.type==='credit').reduce((s,d)=>s+d.balance,0))}
function annuity(principal,annualRate,quarters){const r=annualRate/400;return r===0?principal/quarters:principal*r/(1-(1+r)**-quarters)}
export function marketPct(state,tier,key){
  return state.marketActive.reduce((s,a)=>{const e=cardById(a.eventId),age=state.round-a.startedRound;return s+(age>=0&&age<e.duration?(e.roles?.[tier]?.[key]||0)*e.decay[age]:0)},0);
}
// 疲勞：增加的部分在「鐵人體質」下減半。
function addFatigue(p,n){p.fatigue=clamp(p.fatigue+(n>0&&hasDestiny(p,'D04')?n/2:n),0,100)}
// 等待回合：「學習天才」少等一回合。回傳實際等待回合數。
function addWait(p,n,reason){const w=Math.max(0,n-(hasDestiny(p,'D02')?1:0));if(w>0){p.waitTurns+=w;p.waitReason=reason}return w}

// 預估或實際計算一季收支。random=null 時浮動收入取期望值（供介面預覽）。
export function computeQuarter(state,p,{random=null}={}){
  const job=jobOf(p),tier=p.roleId,e=state.economy,round=state.round;
  const lines=[];
  let salary=baseSalary(p);
  if(job.tier==='free'){
    const [lo,span]=job.vol??[.35,1.3],u=random??.5;
    salary=round2(salary*(lo+span*u)*(1+.06*(e.growth-2)));
  }
  let pct=marketPct(state,tier,'income')+p.effects.filter(x=>x.until>=round).reduce((s,x)=>s+(x.income||0),0);
  // 過勞（疲勞 ≥ 70）時效率很差：收入 −20%，加班也沒有額外收入。
  if(p.overtime&&p.fatigue<FATIGUE.burnout)pct+=OVERTIME[p.overtime].income;
  if(p.fatigue>=FATIGUE.burnout)pct+=FATIGUE.burnoutIncome;
  let earned=round2(salary*Math.max(.1,1+clamp(pct,-80,150)/100));
  if(p.unemployedRounds>0){
    earned=['low','office'].includes(tier)?round2(baseSalary(p)*.6):0;
    lines.push({label:tier==='free'?'案源斷炊':'失業中',amount:earned});
  } else lines.push({label:job.tier==='free'?'接案收入':job.role?'薪資':`薪資·${job.name}`,amount:earned});
  if(job.bonusMonths&&round%4===0&&p.unemployedRounds===0){
    const bonus=round2(job.salary/3*job.bonusMonths*p.salaryFactor*clamp(1+.15*(e.growth-2),.3,1.8)*(1+marketPct(state,tier,'income')/100));
    earned+=bonus;lines.push({label:'年終獎金',amount:bonus});
  }
  const flats=new Map();
  for(const x of p.flatIncomes.filter(x=>x.until>=round)){const k=x.label||'長期合約';flats.set(k,round2((flats.get(k)||0)+x.amount))}
  for(const [label,amount] of flats){earned+=amount;lines.push({label,amount})}
  const dividends=round2(p.investments.filter(x=>x.income>0).reduce((s,x)=>s+x.income,0));
  if(dividends){earned+=dividends;lines.push({label:'投資分紅',amount:dividends})}
  earned=round2(earned);
  const living=round2(job.living*e.priceLevel*(1+marketPct(state,tier,'living')/100)*(hasDestiny(p,'D06')?.9:1));
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

/* ---------- 擲骰與移動 ---------- */
// 有車（且不在國外）時，每個轉輪的 1／2／3 視為 4／5／6；在國外只用第一個轉輪。
export function effectiveReels(p,reels){
  if(p.track==='abroad')return [reels[0],0];
  return p.owns.car?reels.map(v=>CAR.boost[v]??v):[...reels];
}
export function rollDice(state,forced){
  if(state.status!=='playing'||state.phase!=='roll')throw Error('現在無法啟動拉霸。');
  const p=current(state);
  const reels=forced??[0,0].map(()=>Math.floor(nextRandom(state)*7));
  if(reels.length!==2||reels.some(n=>!Number.isInteger(n)||n<0||n>6))throw Error('拉霸須有兩個 0–6 的數字。');
  const eff=effectiveReels(p,reels),dice=eff[0]+eff[1],from={t:p.track,i:p.position},path=movementPath(p,dice);
  state.dice=dice;state.reels=[...reels];state.effReels=eff;state.lastDraw=null;state.lastResult=null;state.queue=[];
  const boosted=eff.some((v,k)=>v!==reels[k])&&p.track!=='abroad';
  say(state,`${p.name}拉出 ${reels.join(' + ')}${boosted?`（有車加成為 ${eff.join(' + ')}）`:p.track==='abroad'?'（國外只算第一個轉輪）':''}，${dice?`前進 ${dice} 格`:'停留原地'}。`);
  let homePasses=0,tolls=0;
  for(const n of path){
    if(n.t==='main'&&n.i===0)homePasses++;
    if(n.t==='highway'&&HIGHWAY.tiles[n.i].type==='toll')tolls++;
  }
  const end=path.at(-1)??from;
  p.track=end.t;p.position=end.i;
  state.lastMove={playerId:p.id,from,path,returned:false};
  if(tolls){const fee=HIGHWAY.toll*tolls;p.cash=round2(p.cash-fee);say(state,`${p.name}通過高速公路收費站，付 ${money(fee)}。`)}
  if(dice){
    const tile=tileAt(p.track,p.position,state),type=tile.type;
    if(type==='return'){p.track='main';p.position=ABROAD.airport;state.lastMove.returned=true;say(state,`${p.name}走完國外行程，搭機回到機場。`)}
    else if(['fortune','market','chance','loss','abroad'].includes(type))state.queue.push({kind:type,...(tile.flipped?{flipped:true}:{})});
    else if(type==='airport'&&p.track==='main')state.queue.push({kind:'airport'});
    else if(type==='home'){addFatigue(p,FATIGUE.restStop);say(state,`${p.name}回到家鄉休息，疲勞 ${FATIGUE.restStop}。`)}
    if(type!=='return')say(state,`${p.name}停在「${tileLabel(p.track,p.position,state)}」。`);
  }
  for(let k=0;k<homePasses;k++){
    p.stats.homePasses++;state.queue.push({kind:'chance',source:'home'});
    if(hasDestiny(p,'D10')){p.cash=round2(p.cash+2);say(state,`${p.name}經過家鄉，家人塞了 2 萬。`)}
  }
  if(homePasses)say(state,`${p.name}經過家鄉，可以抽 ${homePasses} 張機會卡。`);
  advanceQueue(state);
  return {dice,reels,eff,path,from};
}
// 依佇列決定下一步：還有卡要抽就進入 draw；機場直接進入選擇；都處理完進入 manage。
function advanceQueue(state){
  if(state.status!=='playing')return;
  const p=current(state);
  if(!state.queue.length){state.phase='manage';return}
  if(state.queue[0].kind==='airport'){
    state.queue.shift();
    state.pendingChoice={kind:'airport',playerId:p.id};state.phase='choice';
    return;
  }
  state.phase='draw';
}

/* ---------- 抽卡 ---------- */
export const heldJobIds=state=>state.players.flatMap(p=>[p.jobId,p.training?.jobId]).filter(Boolean);
// 機會牌堆：工作卡版混入還沒被人拿走的工作卡；角色版只有機會卡。
export function chanceDeck(state){
  if(state.variant==='roles')return [...CHANCE_CARDS];
  const held=new Set(heldJobIds(state));return [...CHANCE_CARDS,...JOBS.filter(j=>!held.has(j.id))];
}
const drawChanceCard=state=>{const deck=chanceDeck(state);return deck[Math.floor(nextRandom(state)*deck.length)]};
export function drawEvent(state,forcedId){
  if(state.status!=='playing'||state.phase!=='draw')throw Error('現在不需要抽卡。');
  const p=current(state),head=state.queue.shift()||{kind:tileAt(p.track,p.position,state).type};
  let type=head.kind,note=head.source==='home'?'經過家鄉的獎勵':head.flipped?'景氣衰退，這格市場格變成災難格':null;
  // 每季最多一張市場事件，避免人數越多事件越密集。
  if(type==='market'&&state.marketThisRound&&!(forcedId&&forcedId.startsWith('M'))){type='chance';note='本季已發生市場事件，改抽機會卡'}
  const forced=forcedId?cardById(forcedId):null;
  state.drawSeq=(state.drawSeq||0)+1;
  const keep=x=>{(state.turnCards??=[]).push(x.id);return x};
  if(type==='fortune'){
    const card=keep(forced??weightedPick(state,FORTUNE_CARDS)),boom=economyRegime(state)==='boom',lucky=hasDestiny(p,'D03');
    const amount=round2(val(card.cash,p.roleId)*(boom?ECON_TILES.boom.fortuneMultiplier:1)*(lucky?1.5:1));
    p.cash=round2(p.cash+amount);
    const extra=[boom?`景氣過熱 ×${ECON_TILES.boom.fortuneMultiplier}`:'',lucky?'幸運星 ×1.5':''].filter(Boolean).join('、');
    state.lastDraw={type,cardId:card.id,note,seq:state.drawSeq};state.lastResult={text:`現金 +${money(amount)}${extra?`（${extra}）`:''}`,cash:amount};
    say(state,`${p.name}抽到「${card.name}」，現金 +${money(amount)}${extra?`（${extra}）`:''}。`);
  } else if(type==='market'){
    const card=keep(forced??MARKET_EVENTS[Math.floor(nextRandom(state)*MARKET_EVENTS.length)]);
    applyMarket(state,card);
    state.lastDraw={type,cardId:card.id,note,seq:state.drawSeq};
  } else if(type==='chance'){
    const card=keep(forced??drawChanceCard(state));
    state.lastDraw={type:'chance',cardId:card.id,note,seq:state.drawSeq};
    state.pendingChoice={kind:isJobCard(card)?'job':'chance',cardId:card.id,playerId:p.id};
    say(state,`${p.name}${note?`（${note}）`:''}抽到${isJobCard(card)?'工作卡':'機會卡'}「${card.name}」。`);
    state.phase='choice';
    return state.lastDraw;
  } else if(type==='loss'){
    const card=keep(forced??LOSS_CARDS[Math.floor(nextRandom(state)*LOSS_CARDS.length)]);
    applyLoss(state,p,card);
    state.lastDraw={type,cardId:card.id,note,seq:state.drawSeq};
  } else if(type==='abroad'){
    const card=keep(forced??weightedPick(state,ABROAD_CARDS));
    applyAbroad(state,p,card);
    state.lastDraw={type,cardId:card.id,note,seq:state.drawSeq};
  } else throw Error('目前停格沒有事件卡。');
  checkGoal(state,p);
  advanceQueue(state);
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
// 合作期間：現金損失（保險理賠後）由夥伴分擔 20%。回傳夥伴分擔的金額。
function shareLoss(state,p,cashLost,notes){
  const ally=activeAlliance(state,p),partner=ally&&playerById(state,ally.partnerId);
  if(!(cashLost>0)||!partner||partner.bankrupt)return 0;
  const share=round2(cashLost*INTERACT.alliance.share);
  partner.cash=round2(partner.cash-share);p.cash=round2(p.cash+share);
  notes.push(`${partner.name}分擔 ${money(share)}`);
  return share;
}
function applyLoss(state,p,card){
  let lost=0,cashLost=0;const notes=[];
  if(card.wipeInvestments&&p.investments.length){lost+=p.investments.reduce((s,x)=>s+(x.value||0),0);p.investments=[];notes.push('所有投資歸零')}
  else if(card.cost){let c=val(card.cost,p.roleId);if(card.insurable&&p.insured){c=round2(c*(1-INSURANCE.coverage));notes.push('保險理賠八成')}p.cash=round2(p.cash-c);lost+=c;cashLost+=c}
  if(card.cashPct&&p.cash>0){const c=round2(Math.min(card.cap??Infinity,p.cash*card.cashPct/100));p.cash=round2(p.cash-c);lost+=c;cashLost+=c}
  lost=round2(lost-shareLoss(state,p,round2(cashLost),notes));
  if(card.income)p.effects.push({source:card.id,income:card.income,until:state.round});
  if(card.unemployed){p.unemployedRounds+=val(card.unemployed,p.roleId);notes.push(`失去收入 ${val(card.unemployed,p.roleId)} 季`)}
  if(card.skip){const w=addWait(p,1,'車禍休養');notes.push(w?'下一回合無法行動':'學習天才：不用休養')}
  state.lastResult={text:[lost?`損失 ${money(lost)}`:'',...notes].filter(Boolean).join('，'),cash:-lost};
  say(state,`${p.name}遭遇「${card.name}」：${state.lastResult.text||'無直接損失'}。`);
}
function applyAbroad(state,p,card){
  const before=p.cash,notes=[];let cashLost=0;
  if(card.cash)p.cash=round2(p.cash+card.cash);
  if(card.flatIncome){p.flatIncomes.push({amount:card.flatIncome.amount,until:state.round+card.flatIncome.rounds-1,label:'海外客戶'});notes.push(`未來 ${card.flatIncome.rounds} 季每季 +${money(card.flatIncome.amount)}`)}
  if(card.salary){p.salaryFactor=round2(p.salaryFactor*(1+card.salary/100)*10000)/10000;notes.push(`薪水永久 +${card.salary}%`)}
  if(card.cost){let c=card.cost;if(card.insurable&&p.insured){c=round2(c*(1-INSURANCE.coverage));notes.push('保險理賠八成')}p.cash=round2(p.cash-c);cashLost+=c}
  if(card.cashPct&&p.cash>0){const c=Math.min(card.cap??Infinity,p.cash*card.cashPct/100);p.cash=round2(p.cash-c);cashLost+=c}
  shareLoss(state,p,round2(cashLost),notes);
  if(card.wait){const w=addWait(p,card.wait,'受困國外');notes.push(w?`受困 ${w} 回合`:'學習天才：馬上脫困')}
  if(card.fatigue){addFatigue(p,card.fatigue);notes.push(`疲勞 +${hasDestiny(p,'D04')?card.fatigue/2:card.fatigue}`)}
  const delta=round2(p.cash-before);
  state.lastResult={text:[delta?`現金 ${delta>0?'+':'−'}${money(Math.abs(delta))}`:'',...notes].filter(Boolean).join('，'),cash:delta};
  say(state,`${p.name}在國外遇到「${card.name}」：${state.lastResult.text}。`);
}

/* ---------- 互動卡：合作與搶案 ---------- */
export function activeAlliance(state,p){return p.effects.find(x=>x.source==='C13'&&x.until>=state.round)||null}
const allied=(state,a,b)=>activeAlliance(state,a)?.partnerId===b.id;
const beingRobbed=(state,t)=>t.flatIncomes.some(x=>x.label==='被搶走的案子'&&x.until>=state.round);
// 搶案成功率：自己的平均薪資 ÷（自己＋對方），限制在 20%～80%；
// 天命卡「人脈王」再 +15 個百分點。
export function stealChance(p,t){const S=INTERACT.steal;return round2(clamp(baseSalary(p)/(baseSalary(p)+baseSalary(t))+(hasDestiny(p,'D05')?.15:0),S.minChance,S.maxChance))}
export const stealAmount=t=>round2(Math.min(INTERACT.steal.cap,baseSalary(t)*INTERACT.steal.share));
function inviteBlock(state,p,t,declined){
  if(declined.includes(t.id))return '已經拒絕過你';
  if((p.feuds??[]).includes(t.id))return '你們之間有過背叛，不能再合作';
  if(activeAlliance(state,t))return '已經有合作對象';
  return '';
}
function stealBlock(state,t){
  if(t.unemployedRounds>0)return '失業中，沒有案子可搶';
  if(beingRobbed(state,t))return '案子正在被別人搶';
  if((t.stealImmuneUntil??0)>=state.round)return `剛被搶過，第 ${t.stealImmuneUntil+1} 季後才能再選`;
  return '';
}
// 等誰回覆：合作邀請由被邀請的人回答；搶案由被搶的人決定要不要反制。
export const responder=state=>state.phase==='respond'&&state.pendingResponse?playerById(state,state.pendingResponse.targetId):null;
export function respondOptions(state){
  const r=state.pendingResponse;if(!r)return null;
  const from=playerById(state,r.fromId),t=playerById(state,r.targetId),A=INTERACT.alliance,S=INTERACT.steal;
  if(r.type==='alliance')return {type:r.type,from:from.name,to:t.name,
    question:`${from.name}邀請你合作，要答應嗎？`,
    yes:{label:'答應合作',detail:`${Math.round(A.accept*100)}% 合作順利：雙方收入 +${A.pct}%，持續 ${A.rounds} 季，期間災難損失互相分擔 ${Math.round(A.share*100)}%；${Math.round((1-A.accept)*100)}% 鬧翻：雙方收入 ${A.falloutPct}%，持續 ${A.falloutRounds} 季。`},
    no:{label:'拒絕',detail:state.players.filter(x=>!x.bankrupt).length>2?`如果${from.name}之後邀到別人合作成功，你收入 ${A.declinePct}%，持續 ${A.declineRounds} 季。`:'兩人局拒絕沒有風險。'}};
  const betray=allied(state,from,t),amount=stealAmount(t);
  return {type:r.type,from:from.name,to:t.name,
    question:`${from.name}要搶你的案子${betray?'（你們正在合作，這是背叛）':''}，要花 ${money(S.counterFee)} 反制嗎？`,
    yes:{label:`反制（${money(S.counterFee)}）`,detail:`對方成功率從 ${Math.round(r.chance*100)}% 降到 ${Math.round(r.chance*50)}%；對方沒搶到的話，投標費 ${money(S.fee)} 歸你。`,affordable:t.cash>=S.counterFee},
    no:{label:'不反制',detail:`對方有 ${Math.round(r.chance*100)}% 機會搶到，2 季內每季轉走你 ${money(amount)}。`}};
}
export function respond(state,playerId,yes){
  const r=state.pendingResponse,t=responder(state);
  if(state.status!=='playing'||!t||t.id!==playerId)throw Error('現在不需要你回覆。');
  const p=playerById(state,r.fromId),A=INTERACT.alliance,S=INTERACT.steal;
  state.pendingResponse=null;
  if(r.type==='alliance'){
    if(yes){
      const ok=nextRandom(state)<A.accept;
      if(ok){
        const until=state.round+A.rounds-1;
        for(const x of [p,t])x.effects.push({source:'C13',income:A.pct,until,partnerId:x===p?t.id:p.id});
        const losers=r.declined.map(id=>playerById(state,id)).filter(x=>x&&!x.bankrupt);
        for(const x of losers)x.effects.push({source:'C13-decline',income:A.declinePct,until:state.round+A.declineRounds-1});
        const extra=losers.length?`；拒絕邀請的${losers.map(x=>x.name).join('、')}收入 ${A.declinePct}%，持續 ${A.declineRounds} 季`:'';
        state.lastResult={text:`${t.name}答應了，合作順利：雙方收入 +${A.pct}%，到第 ${until} 季${extra}。`,cash:0,option:`邀請 ${t.name} 合作`};
        say(state,`${p.name}與${t.name}合作，雙方收入 +${A.pct}%，到第 ${until} 季${extra}。`);
      } else {
        const until=state.round+A.falloutRounds-1;
        for(const x of [p,t])x.effects.push({source:'C13-fallout',income:A.falloutPct,until});
        state.lastResult={text:`${t.name}答應了，但合作鬧翻：雙方收入 ${A.falloutPct}%，到第 ${until} 季。`,cash:0,option:`邀請 ${t.name} 合作`};
        say(state,`${p.name}和${t.name}合作鬧翻，雙方收入 ${A.falloutPct}%，到第 ${until} 季。`);
      }
      advanceQueue(state);
    } else {
      const declined=[...r.declined,t.id];
      say(state,`${t.name}拒絕了${p.name}的合作邀請。`);
      const card=cardById(r.cardId),again=r.invites<A.maxInvites&&!activeAlliance(state,p);
      state.pendingChoice={kind:'chance',cardId:r.cardId,playerId:p.id,declined,invites:r.invites};
      if(again&&chanceOptions(state,p,card).some(o=>o.kind==='invite'&&o.affordable)){state.phase='choice';state.lastResult={text:`${t.name}拒絕了，可以再邀另一位。`,cash:0,option:`邀請 ${t.name} 合作`}}
      else {state.pendingChoice=null;state.lastResult={text:`${t.name}拒絕了，這次沒找到合作夥伴。`,cash:0,option:`邀請 ${t.name} 合作`};advanceQueue(state)}
    }
    return state.lastResult;
  }
  // 搶案：被搶的人決定要不要反制
  let countered=false;
  if(yes){
    if(t.cash<S.counterFee)throw Error(`現金不足，反制需要 ${money(S.counterFee)}。`);
    t.cash=round2(t.cash-S.counterFee);countered=true;
  }
  resolveSteal(state,p,t,{countered,chance:r.chance});
  return state.lastResult;
}
function resolveSteal(state,p,t,{countered,chance=stealChance(p,t)}){
  const S=INTERACT.steal,L=INTERACT.lawsuit,round=state.round;
  const ally=activeAlliance(state,p),betray=ally?.partnerId===t.id;
  const finalChance=countered?chance/2:chance,ok=nextRandom(state)<finalChance;
  const parts=[];let gained=0;
  if(countered)parts.push(`${t.name}花 ${money(S.counterFee)} 反制，成功率降到 ${Math.round(finalChance*100)}%`);
  let stolen=null;
  if(ok){
    const amount=stealAmount(t),until=round+S.rounds-1;
    stolen={amount,until};
    p.flatIncomes.push({amount,until,label:'搶下的案子',victimId:t.id});
    t.flatIncomes.push({amount:-amount,until,label:'被搶走的案子',byId:p.id});
    t.stealImmuneUntil=until+S.immunity;
    parts.push(`搶到了！到第 ${until} 季每季轉走${t.name} ${money(amount)}`);
  } else {
    parts.push('沒搶到');
    if(countered){t.cash=round2(t.cash+S.fee);parts.push(`投標費 ${money(S.fee)} 歸${t.name}`)}
  }
  if(betray){
    // 背叛：合作立刻結束、兩人不能再合作，並自動打官司。
    const left=Math.max(0,ally.until-round+1);
    for(const x of [p,t])x.effects=x.effects.filter(e=>!(e.source==='C13'&&(e.partnerId===p.id||e.partnerId===t.id)));
    p.feuds=[...new Set([...(p.feuds??[]),t.id])];t.feuds=[...new Set([...(t.feuds??[]),p.id])];
    parts.push('背叛了合作，合作立刻結束');
    if(nextRandom(state)<L.win){
      const comp=round2(left*L.pct/100*baseSalary(t));
      p.cash=round2(p.cash-comp);t.cash=round2(t.cash+comp);gained-=comp;
      if(stolen){p.flatIncomes=p.flatIncomes.filter(x=>!(x.label==='搶下的案子'&&x.victimId===t.id&&x.until===stolen.until));t.flatIncomes=t.flatIncomes.filter(x=>!(x.label==='被搶走的案子'&&x.byId===p.id&&x.until===stolen.until))}
      parts.push(`${t.name}告贏了，${p.name}賠償 ${money(comp)}${stolen?'，案子也還回去':''}`);
    } else parts.push(`${t.name}的官司敗訴，沒有拿到賠償`);
  }
  const text=parts.join('；')+'。';
  state.lastResult={text,cash:round2(gained-S.fee),option:`搶 ${t.name} 的案子`};
  say(state,`${p.name}搶${t.name}的案子：${text}`);
  state.pendingResponse=null;
  checkGoal(state,p);checkGoal(state,t);
  advanceQueue(state);
}

/* ---------- 選擇：機會卡、工作卡、機場 ---------- */
export function ticketPrice(state,p){
  const job=jobOf(p);
  if(job.perk==='flyFree'||hasDestiny(p,'D07'))return 0;
  return round2(ABROAD.ticket*state.economy.priceLevel*(job.perk==='flyHalf'?.5:1));
}
export function jobConditionText(job){
  const c=job.cond||{},bits=[];
  if(c.car)bits.push('需要有車');
  if(c.cost)bits.push(`付 ${c.cost} 萬學費`);
  if(c.wait)bits.push(`停留 ${c.wait} 回合後擲骰 ≥ ${c.dice}`);
  else if(c.dice)bits.push(`當場擲骰 ≥ ${c.dice}`);
  return bits.length?bits.join('、'):'無條件';
}
// 選項清單。互動卡的選項會依其他（未破產的）玩家展開成多個；不能選的對象會附上原因。
export function chanceOptions(state,p,card){
  if(state.pendingChoice?.kind==='airport'&&!card){
    const price=ticketPrice(state,p);
    return [{index:0,key:'fly',label:price?`買機票出國（${money(price)}）`:'免費出國',stake:price,affordable:price<=0||p.cash>=price,outcomes:[],reason:''},
      {index:1,key:'stay',label:'不出國',stake:0,affordable:true,outcomes:[],reason:''}];
  }
  if(isJobCard(card)){
    const c=card.cond||{},stake=c.cost||0,reason=c.car&&!p.owns.car?'需要有車':stake>0&&p.cash<stake?'現金不足':'';
    const opts=[{index:0,key:'take',label:`${p.jobId?'換工作':'應徵'}（${jobConditionText(card)}）`,stake,affordable:!reason,outcomes:[],reason},
      {index:1,key:'pass',label:'不要',stake:0,affordable:true,outcomes:[],reason:''}];
    if(p.jobId)opts.push({index:2,key:'redraw',label:'洗回牌堆，重抽一張',stake:0,affordable:true,outcomes:[],reason:''});
    return opts;
  }
  const list=[],S=INTERACT.steal,pc=state.pendingChoice;
  const declined=pc?.cardId===card.id?pc.declined??[]:[],invites=pc?.cardId===card.id?pc.invites??0:0;
  const others=state.players.filter(x=>x.id!==p.id&&!x.bankrupt);
  for(const o of card.options){
    const base={key:'option',label:val(o.label,p.roleId),stake:val(o.stake,p.roleId),outcomes:Array.isArray(o.outcomes)?o.outcomes:o.outcomes[p.roleId]??o.outcomes.default};
    if(o.invite){
      const own=activeAlliance(state,p);
      for(const t of others)list.push({...base,kind:'invite',label:`${invites?'改邀':'邀請'} ${t.name} 合作`,targetId:t.id,reason:own?'你已經有合作對象':inviteBlock(state,p,t,declined)});
    } else if(o.steal){
      for(const t of others){
        const chance=stealChance(p,t),amount=stealAmount(t),betray=allied(state,p,t);
        list.push({...base,kind:'steal',label:`搶 ${t.name} 的案子${betray?'（背叛合作）':''}`,targetId:t.id,chance,amount,betray,reason:stealBlock(state,t),
          outcomes:[{p:chance,text:`搶到：2 季內每季轉走 ${money(amount)}${betray?'；但這是背叛，合作立刻結束，對方 70% 告贏求償':''}`},{p:round2(1-chance),text:`沒搶到，投標費 ${money(S.fee)} 拿不回來${betray?'；背叛照樣成立':''}`}]});
      }
    } else list.push({...base,label:invites&&card.id==='C13'?'不找了，自己來':base.label});
  }
  return list.map((o,index)=>({...o,index,reason:o.reason||'',affordable:!o.reason&&(o.stake<=0||p.cash>=o.stake)}));
}
export function examTarget(p,job){return {need:job.cond.dice,bonus:hasDestiny(p,'D05')?1:0}}
function setJob(state,p,jobId){
  const job=jobById(jobId);
  p.jobId=jobId;p.roleId=job.tier;p.stats.jobs.push(jobId);
  say(state,`${p.name}成為「${job.name}」，每季薪水 ${money(job.salary)}。`);
}
export function resolveChoice(state,playerId,index){
  const p=current(state),pc=state.pendingChoice;
  if(state.status!=='playing'||state.phase!=='choice'||p.id!==playerId||!pc)throw Error('現在沒有需要決定的卡片。');
  const card=pc.cardId?cardById(pc.cardId):null,opt=chanceOptions(state,p,card)[index];
  if(!opt)throw Error('請選擇一個選項。');
  if(opt.reason)throw Error(opt.reason);
  if(!opt.affordable)throw Error(`現金不足，需要 ${money(opt.stake)}。`);
  let text='',cash=0;
  if(pc.kind==='airport'){
    if(opt.key==='fly'){p.cash=round2(p.cash-opt.stake);p.track='abroad';p.position=0;p.stats.flights++;text=`${opt.stake?`付了 ${money(opt.stake)} 機票，`:''}飛到國外！之後在國外只用一個轉輪移動。`;cash=-opt.stake}
    else text='留在國內。';
    say(state,`${p.name}在機場：${text}`);
  } else if(pc.kind==='job'){
    if(opt.key==='redraw'){
      const next=drawChanceCard(state);(state.turnCards??=[]).push(next.id);
      state.drawSeq=(state.drawSeq||0)+1;
      state.lastDraw={type:'chance',cardId:next.id,note:`把「${card.name}」洗回牌堆後重抽`,seq:state.drawSeq};
      state.pendingChoice={kind:isJobCard(next)?'job':'chance',cardId:next.id,playerId:p.id};
      say(state,`${p.name}把工作卡「${card.name}」洗回牌堆，重抽到「${next.name}」。`);
      return {redraw:next.id};
    }
    if(opt.key==='take'){
      const c=card.cond||{};
      if(c.cost){p.cash=round2(p.cash-c.cost);cash-=c.cost}
      if(c.wait){
        p.training={jobId:card.id,need:c.dice};
        const w=addWait(p,c.wait,`準備「${card.name}」`);
        text=w?`開始受訓，停留 ${w} 回合後擲骰應考（需 ≥ ${c.dice}）。`:`學習天才不用等，下回合直接應考（需 ≥ ${c.dice}）。`;
      } else if(c.dice){
        const {need,bonus}=examTarget(p,card),roll=d6(state),ok=roll+bonus>=need;
        state.lastExam={jobId:card.id,roll,bonus,need,ok};
        if(ok){setJob(state,p,card.id);text=`擲出 ${roll}${bonus?`＋${bonus}`:''}，錄取！`}
        else text=`擲出 ${roll}${bonus?`＋${bonus}`:''}，沒有錄取${c.cost?'，學費不退':''}。`;
      } else {setJob(state,p,card.id);text='直接上工！'}
    } else text='你沒有接下這份工作。';
    say(state,`${p.name}對「${card.name}」：${text}`);
  } else {
    const t=opt.targetId?playerById(state,opt.targetId):null;
    if(opt.kind==='invite'){
      state.pendingResponse={type:'alliance',fromId:p.id,targetId:t.id,cardId:card.id,declined:pc.declined??[],invites:(pc.invites??0)+1};
      state.pendingChoice=null;state.phase='respond';state.lastResult=null;
      say(state,`${p.name}邀請${t.name}合作，等待回覆。`);
      return {pending:true};
    }
    if(opt.kind==='steal'){
      p.cash=round2(p.cash-opt.stake);state.pendingChoice=null;
      say(state,`${p.name}付了投標費，要搶${t.name}的案子${opt.betray?'（對方是合作夥伴）':''}。`);
      if(t.cash<INTERACT.steal.counterFee){resolveSteal(state,p,t,{countered:false});return {done:true}}
      state.pendingResponse={type:'counter',fromId:p.id,targetId:t.id,cardId:card.id,chance:opt.chance};
      state.phase='respond';state.lastResult=null;
      return {pending:true};
    }
    p.cash=round2(p.cash-opt.stake);
    const o=pickOutcome(state,opt.outcomes),before=p.cash;
    applyEffects(state,p,o,opt.stake);
    cash=round2(p.cash-before-opt.stake);text=o.text;
    say(state,`${p.name}選擇「${opt.label}」：${o.text}`);
  }
  state.lastResult={text,cash,option:opt.label};
  state.pendingChoice=null;
  checkGoal(state,p);
  advanceQueue(state);
  return {key:opt.key};
}
function applyEffects(state,p,o,stake){
  const r=state.round,v=x=>val(x,p.roleId);
  if(o.cash)p.cash=round2(p.cash+v(o.cash));
  if(o.stakeX)p.cash=round2(p.cash+stake*o.stakeX);
  if(o.salary)p.salaryFactor=round2(p.salaryFactor*(1+v(o.salary)/100)*10000)/10000;
  if(o.delayedSalary)p.pendingSalary.push({at:r+o.delayedSalary.after,pct:v(o.delayedSalary.pct)});
  if(o.flatIncome)p.flatIncomes.push({amount:o.flatIncome.amount,until:r+o.flatIncome.rounds-1,label:o.flatIncome.label});
  if(o.fatigue)addFatigue(p,o.fatigue);
  if(o.unemployed)p.unemployedRounds+=o.unemployed;
  if(o.investment){const x=o.investment;p.investments.push({id:`inv-${r}-${p.investments.length}`,name:x.name,value:x.value||0,income:x.income||0,maturity:x.maturity?r+x.maturity:null,payout:x.payout??0,collapse:!!x.collapse})}
  if(o.insurance)p.insured=true;
  if(o.skip)addWait(p,1,'休養');
  if(o.delayedCash)p.delayedCash.push({at:r+o.delayedCash.after,amount:o.delayedCash.amount});
}
// 受訓結束後的應考：擲一顆骰子。
export function takeExam(state,forced){
  if(state.status!=='playing'||state.phase!=='exam')throw Error('現在不需要應考。');
  const p=current(state),job=jobById(p.training.jobId),{need,bonus}=examTarget(p,job);
  const roll=forced??d6(state),ok=roll+bonus>=need;
  state.lastExam={jobId:job.id,roll,bonus,need,ok};
  p.training=null;
  if(ok)setJob(state,p,job.id);
  else say(state,`${p.name}應考「${job.name}」擲出 ${roll}${bonus?`＋${bonus}`:''}（需 ≥ ${need}），沒有通過，工作卡洗回牌堆。`);
  state.phase='roll';
  return state.lastExam;
}

/* ---------- 經營動作 ---------- */
function requireManage(state,playerId){const p=current(state);if(state.status!=='playing'||state.phase!=='manage'||p.id!==playerId)throw Error('只能在自己的經營階段操作。');return p}
export function setOvertime(state,playerId,level){const p=requireManage(state,playerId);if(![0,1,2].includes(level))throw Error('加班程度無效。');p.overtime=level}
export function setHighway(state,playerId,on){const p=playerById(state,playerId);if(!p)throw Error('找不到玩家。');p.useHighway=!!on}
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
// 買車：全額付清，或頭期 20% 加車貸（明牌）。車貸需通過銀行審核：所有每季還款 ≤ 薪水 50%。
// 角色版的上班族全額付清買車＝達成目標。
export function carOffer(state,p){
  const price=round2(state.economy.carPrice*(hasDestiny(p,'D08')?.8:1)),down=round2(price*CAR.downPct/100),loan=round2(price-down);
  const payment=round2(annuity(loan,CAR.rate,CAR.quarters)),dsr=round2(100*(quarterlyPayments(state,p)+payment)/Math.max(1,baseSalary(p)));
  return {price,down,loan,payment,dsr,cashOk:!p.owns.car&&p.cash>=price,loanOk:!p.owns.car&&p.cash>=down&&dsr<=50};
}
export function buyCar(state,playerId,mode){
  const p=requireManage(state,playerId),o=carOffer(state,p);
  if(p.owns.car)throw Error('你已經有車了。');
  if(mode==='cash'){
    if(!o.cashOk)throw Error('現金不足以全額付清。');
    p.cash=round2(p.cash-o.price);
    say(state,`${p.name}全額付清，買下 ${money(o.price)} 的車！`);
  } else if(mode==='loan'){
    if(p.cash<o.down)throw Error('頭期款不足。');
    if(o.dsr>50)throw Error(`銀行不核貸：每季還款會占薪水 ${o.dsr}%（上限 50%）。`);
    p.cash=round2(p.cash-o.down);
    p.debts.push({id:`auto-${state.round}`,type:'auto',name:'車貸',balance:o.loan,rate:CAR.rate,payment:o.payment,public:true});
    say(state,`${p.name}付頭期款 ${money(o.down)}，貸款 ${money(o.loan)} 買車（每季繳 ${money(o.payment)}）。`);
  } else throw Error('付款方式無效。');
  p.owns.car=true;p.carValue=round2(o.price*CAR.resale);
  if(p.variant==='roles'&&roleById(p.roleId).goal.type==='car'&&mode==='cash'){p.owns.goalCar=true;win(state,[p],'goal');say(state,`${p.name}達成目標：${roleById(p.roleId).goal.text}！`);return}
  checkGoal(state,p);
}
// 角色版的高管：買房（頭期 30%，銀行核貸條件：所有每季還款 ≤ 薪水 50%）。
export function housePlan(state,p){
  const price=state.economy.housePrice,down=round2(price*.3),loan=round2(price-down);
  const newPayment=round2(annuity(loan,state.economy.rate+.6,120));
  const dsr=round2(100*(quarterlyPayments(state,p)+newPayment)/Math.max(1,baseSalary(p)));
  return {price,down,loan,newPayment,dsr,ok:p.cash>=down&&dsr<=roleById('exec').goal.dsr};
}
export function canBuyHouse(state,p){return p.variant==='roles'&&roleById(p.roleId)?.goal.type==='house'?housePlan(state,p):{ok:false}}
export function buyHouse(state,playerId){
  const p=requireManage(state,playerId),h=canBuyHouse(state,p);
  if(!h.ok)throw Error('頭期款不足，或銀行核貸條件（月付 ≤ 收入 50%）未達成。');
  p.cash=round2(p.cash-h.down);p.owns.house=true;
  p.debts.push({id:'mortgage-new',type:'mortgage',name:'新屋房貸',balance:h.loan,rate:0,payment:h.newPayment,variable:true});
  say(state,`${p.name}付了頭期款 ${money(h.down)}，買下 ${money(h.price)} 的房子！`);
  win(state,[p],'goal');
}

/* ---------- 勝利判定 ---------- */
export function goalText(p){return p.variant==='roles'?roleById(p.roleId).goal.text:GOAL.text}
export function goalProgress(state,p){
  if(p.variant!=='roles')return round2(clamp(netWorth(p)/GOAL.netWorth,0,1));
  const r=roleById(p.roleId);
  if(r.goal.type==='debtFree'){const a=p.initialDebt?1-clamp(totalDebt(p)/p.initialDebt,0,1):1,b=clamp(p.cash/r.goal.amount,0,1);return round2(.5*a+.5*b)}
  if(r.goal.type==='car')return p.owns.goalCar?1:round2(clamp(p.cash/carOffer(state,p).price,0,1));
  if(r.goal.type==='house'){if(p.owns.house)return 1;const h=housePlan(state,p);const a=clamp(p.cash/h.down,0,1),b=h.dsr<=r.goal.dsr?1:clamp(r.goal.dsr/h.dsr,0,1);return round2(.75*a+.25*b)}
  if(r.goal.type==='streak')return round2(clamp(Math.max(p.streak,p.bestStreak*.6)/r.goal.rounds,0,1));
  return 0;
}
function goalReached(state,p){
  if(p.variant!=='roles')return netWorth(p)>=GOAL.netWorth;
  const g=roleById(p.roleId).goal;
  return g.type==='debtFree'?totalDebt(p)===0&&p.cash>=g.amount:g.type==='streak'?p.streak>=g.rounds:false;
}
function checkGoal(state,p){
  if(state.status!=='playing'||p.bankrupt)return false;
  if(goalReached(state,p)){win(state,[p],'goal');say(state,`${p.name}達成目標：${goalText(p)}！`);return true}
  return false;
}
function win(state,winners,reason){state.status='finished';state.phase='finished';state.winnerIds=winners.map(p=>p.id);state.winReason=reason;state.pendingResponse=null}
// 季數用完時的排名分數：工作卡版比淨資產，角色版比目標進度。
const finalScore=(state,p)=>p.variant==='roles'?goalProgress(state,p):netWorth(p);

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
  state.turnIndex=i;state.dice=null;state.reels=null;state.effReels=null;state.lastDraw=null;state.lastResult=null;state.lastMove=null;state.lastExam=null;state.queue=[];state.skipReason=null;state.turnCards=[];
  const p=current(state),job=jobOf(p);
  if(p.waitTurns>0){p.waitTurns--;state.phase='skip';state.skipReason=p.waitReason||'暫停';say(state,`${p.name}本回合無法移動（${state.skipReason}）。`);if(!p.waitTurns)p.waitReason=null}
  else if(p.training)state.phase='exam';
  else if(job.skipChance&&p.track==='main'&&nextRandom(state)<job.skipChance){state.phase='skip';state.skipReason='出海作業中';say(state,`${p.name}出海作業，本回合無法移動。`)}
  else state.phase='roll';
  return null;
}

/* ---------- 季結算 ---------- */
// 有人破產：合作直接結束（另一方不用替他負責），他搶來或被搶的案子也一併結束。
function endTiesWith(state,p){
  for(const x of state.players){
    x.effects=x.effects.filter(e=>!(e.source==='C13'&&e.partnerId===p.id));
    x.flatIncomes=x.flatIncomes.filter(f=>f.victimId!==p.id&&f.byId!==p.id);
  }
  p.effects=p.effects.filter(e=>e.source!=='C13');
}
export function settleRound(state){
  const round=state.round,e=state.economy;
  for(const p of state.players.filter(x=>!x.bankrupt)){
    for(const s of p.pendingSalary.filter(x=>x.at<=round))p.salaryFactor=round2(p.salaryFactor*(1+s.pct/100)*10000)/10000;
    p.pendingSalary=p.pendingSalary.filter(x=>x.at>round);
    const q=computeQuarter(state,p,{random:nextRandom(state)});
    // 還款：先算利息，再攤還本金。
    for(const d of p.debts){const {interest,pay}=debtDue(state,d);d.balance=round2(d.balance-(pay-interest))}
    p.debts=p.debts.filter(d=>d.balance>0.001);
    let extra=0;
    for(const x of p.investments.filter(x=>x.maturity&&x.maturity<=round)){extra+=x.payout;say(state,x.collapse?`${p.name}的${x.name}會頭倒會，會款全部拿不回來。`:`${p.name}的${x.name}到期，拿回 ${money(x.payout)}。`)}
    p.investments=p.investments.filter(x=>!(x.maturity&&x.maturity<=round));
    for(const x of p.delayedCash.filter(x=>x.at<=round)){extra+=x.amount;say(state,`${p.name}收回借款 ${money(x.amount)}。`)}
    p.delayedCash=p.delayedCash.filter(x=>x.at>round);
    // 富爸爸：收入比上一季高就發零用錢。
    if(hasDestiny(p,'D01')&&p.lastIncome!==null&&q.earned>p.lastIncome+.001){const pocket=round2(Math.max(1,(q.earned-p.lastIncome)/2));extra+=pocket;say(state,`${p.name}收入增加，富爸爸發了 ${money(pocket)} 零用錢。`)}
    p.cash=round2(p.cash+q.net+extra);
    if(p.unemployedRounds>0)p.unemployedRounds--;
    addFatigue(p,p.overtime===2?FATIGUE.overtime2:p.overtime===1?FATIGUE.overtime1:FATIGUE.none);
    if(jobOf(p).fatigue)addFatigue(p,jobOf(p).fatigue);
    p.overtime=0;
    if(p.variant==='roles'){const g=roleById('free').goal;p.streak=q.earned>=g.amount?p.streak+1:0;p.bestStreak=Math.max(p.bestStreak,p.streak)}
    p.lastIncome=q.earned;p.lastNet=round2(q.net+extra);p.lastBreakdown=q.lines;
    if(round%4===0&&p.unemployedRounds===0){
      if(p.roleId==='office')p.salaryFactor=round2(p.salaryFactor*(1+Math.max(0,(e.growth+e.inflation)/2)/100)*10000)/10000;
      if(p.roleId==='low')p.salaryFactor=round2(p.salaryFactor*(1+Math.max(0,e.inflation/2)/100)*10000)/10000;
    }
    if(p.cash<0){
      const room=round2(creditLimit(p)-creditUsed(p)),need=round2(-p.cash);
      if(need<=room){addCredit(p,need);p.cash=0;say(state,`${p.name}現金不足，自動動用信用貸款 ${money(need)}。`)}
      else {p.bankrupt=true;say(state,`${p.name}現金與信用額度都用盡，宣告破產。`);endTiesWith(state,p)}
    }
    p.effects=p.effects.filter(x=>x.until>round);p.flatIncomes=p.flatIncomes.filter(x=>x.until>round);
    p.history.push({round,income:q.earned,net:p.lastNet,cash:p.cash,debt:totalDebt(p),netWorth:netWorth(p),progress:goalProgress(state,p)});
  }
  updateEconomy(state);
  const alive=state.players.filter(p=>!p.bankrupt);
  const reached=alive.filter(p=>goalReached(state,p));
  if(reached.length){const best=Math.max(...reached.map(p=>finalScore(state,p)));win(state,reached.filter(p=>finalScore(state,p)===best),'goal');say(state,`季結算後${reached.map(p=>p.name).join('、')}達成目標。`);return {round}}
  if(alive.length===1&&state.players.length>1){win(state,alive,'survivor');say(state,`其他玩家都破產了，${alive[0].name}獲勝。`);return {round}}
  if(!alive.length){win(state,[],'bankruptcy');return {round}}
  if(round>=state.maxRounds){
    const best=Math.max(...alive.map(p=>finalScore(state,p)));
    win(state,alive.filter(p=>finalScore(state,p)===best),'progress');
    say(state,state.variant==='roles'?'季數上限到了，目標進度最高的玩家獲勝。':'季數上限到了，淨資產最高的玩家獲勝。');
    return {round};
  }
  state.round++;state.marketThisRound=null;
  state.marketActive=state.marketActive.filter(a=>state.round-a.startedRound<cardById(a.eventId).duration);
  return {round};
}

/* ---------- 景氣與 AI 央行 ---------- */
function shock(state,key){return state.marketActive.reduce((s,a)=>{const e=cardById(a.eventId),age=state.round-a.startedRound;return s+(age>=0&&age<e.duration?(e.macro?.[key]||0)*e.decay[age]:0)},0)}
export function evaluateCentralBank(state,snap){
  const facts={inflation:snap.inflation,growth:snap.growth,unemployment:snap.unemployment,rate:snap.rate,stockDrop:snap.prevStock?100*(1-snap.stock/snap.prevStock):0};
  // 條件可以用 && 串接，例如 'rate>=2.5&&inflation<=2.5'；value 顯示第一個條件的數值。
  const items=CENTRAL_BANK_RULES.map(r=>{
    const conds=r.test.split('&&').map(c=>{const [k,op,v]=c.trim().match(/(\w+)(>=|<=)(-?[\d.]+)/).slice(1);const x=facts[k];return {x,ok:op==='>='?x>=Number(v):x<=Number(v)}});
    return {...r,value:round2(conds[0].x),matched:conds.every(c=>c.ok)};
  });
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
export function importGame(json){const s=JSON.parse(json);if(s.version!==4||s.game!=='life'||!VARIANTS[s.variant]||!Array.isArray(s.players)||!s.economy)throw Error('存檔格式不正確（舊版存檔請開新遊戲）。');return s}
