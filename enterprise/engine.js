import {METRICS,ROLES,GLOBAL_EVENTS,PERSONAL_EVENTS,SECTOR_EVENTS,ALL_EVENTS,FED_RULES,FED_PRIORITY,BOARD,SPECIAL,STAFF,OUTPUT_METRICS,VARIABLE_COST_METRICS,CUSTOMER_GROUPS,MACRO_SENSITIVITY,MACRO_WINDOW,RATE_SENSITIVITY} from './data.js';

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const round2=n=>Math.round((n+Number.EPSILON)*100)/100;
const div=(a,b)=>b===0||b==null?null:a/b;
const pct=(a,b)=>{const x=div(a,b);return x===null?null:100*(x-1)};
const roleById=id=>ROLES.find(r=>r.id===id);
const eventById=id=>ALL_EVENTS.find(e=>e.id===id);
const playerById=(state,id)=>state.players.find(p=>p.id===id);
const ownerOf=(state,roleId)=>state.players.find(p=>p.roleId===roleId)?.id;
const inWindow=(until,round)=>Number.isFinite(until)&&round<=until;
const nextRandom=state=>{let x=state.rng|0;x^=x<<13;x^=x>>>17;x^=x<<5;state.rng=x|0;return (x>>>0)/4294967296};
const ghostSeed=seed=>((Number(seed)|0)^0x6d2b79f5)||1;
const nextGhostRandom=state=>{let x=state.ghostRng|0;x^=x<<13;x^=x>>>17;x^=x<<5;state.ghostRng=x|0;return (x>>>0)/4294967296};
function ensureGhostState(state){
  if(!Number.isInteger(state.ghostRng)||state.ghostRng===0)state.ghostRng=ghostSeed(state.seed);
  if(!Number.isInteger(state.ghostPosition)||state.ghostPosition<0||state.ghostPosition>=BOARD.length)state.ghostPosition=1+Math.floor(nextGhostRandom(state)*(BOARD.length-1));
  if(!Array.isArray(state.ghostTrail))state.ghostTrail=[];
  if(!Array.isArray(state.struckPlayerIds))state.struckPlayerIds=[];
}
// 舊存檔補上員工機制與特殊事件所需的欄位。
function ensureExtendedState(state){
  if(!Number.isFinite(state.laborForce))state.laborForce=STAFF.laborForce;
  for(const r of ROLES){
    const c=state.companies[r.id];if(!c)continue;
    if(!Number.isFinite(c.morale))c.morale=100;
    if(!Number.isFinite(c.startHeadcount))c.startHeadcount=c.headcount;
    if(!Number.isFinite(c.prevStartHeadcount))c.prevStartHeadcount=c.startHeadcount;
    if(!Number.isFinite(c.layoffsThis))c.layoffsThis=0;
    if(!Number.isFinite(c.layoffsPrev))c.layoffsPrev=0;
    for(const k of ['hedgeUntil','leaseUntil','equityUntil'])if(c[k]===undefined)c[k]=null;
  }
  for(const p of state.players){
    if(typeof p.strikeShield!=='boolean')p.strikeShield=false;
    if(!Number.isInteger(p.moveAdjust))p.moveAdjust=0;
    if(typeof p.stallNext!=='boolean')p.stallNext=false;
  }
  if(state.pendingChoice===undefined)state.pendingChoice=null;
  if(state.pendingRoll===undefined)state.pendingRoll=null;
  if(state.ghostPinnedBy===undefined)state.ghostPinnedBy=null;
  if(state.strikeCause===undefined)state.strikeCause=null;
  if(state.moveAdjustUsed===undefined)state.moveAdjustUsed=0;
}
function moveGhost(state){
  const steps=1+Math.floor(nextGhostRandom(state)*3),direction=nextGhostRandom(state)<.5?-1:1;
  const from=state.ghostPosition;
  state.ghostTrail=[from,...Array.from({length:steps},(_,i)=>(from+direction*(i+1)+BOARD.length)%BOARD.length)];
  state.ghostPosition=state.ghostTrail.at(-1);
}
const pick=(state,items)=>items[Math.floor(nextRandom(state)*items.length)];
const hasTarget=(effect,role)=>effect.target==='all'||effect.target==='interest_negative'&&role.base.interest<0||effect.target==='except_technology'&&role.id!=='technology'||effect.target.split(',').includes(role.id);
const eventAffects=(active,role,state)=>active.scope==='global'||active.scope==='sector'&&active.sector===role.sector||active.scope==='personal'&&state.players.some(p=>(p.id===active.ownerId||p.id===active.partnerId)&&p.roleId===role.id);

/* ---------- 員工：產值曲線、薪資、勞動力 ---------- */
export function staffCurve(x){return Math.max(0,1+STAFF.curveLinear*(x-1)-STAFF.curveQuadratic*(x-1)**2)}
export function employedTotal(state){return Object.values(state.companies).reduce((s,c)=>s+c.headcount,0)}
export function laborForce(state){return state.laborForce??STAFF.laborForce}
export function availableLabor(state){return Math.max(0,Math.floor(laborForce(state))-employedTotal(state))}
export function unemploymentPct(state,employed=employedTotal(state)){const lf=laborForce(state);return 100*(lf-employed)/lf}
export function wageFactor(unemployment){return 1+STAFF.wageSlope*Math.max(0,STAFF.naturalUnemploymentPct-unemployment)}
export function moraleFactor(morale=100){return STAFF.moraleFloor+(1-STAFF.moraleFloor)*clamp(morale,0,100)/100}
export function outputFactor(state,roleId,headcount){
  const role=roleById(roleId),c=state.companies[roleId];
  return staffCurve((headcount??c.headcount)/role.baseHeadcount)*moraleFactor(c.morale);
}
export function severancePerHead(roleId){const r=roleById(roleId);return round2(Math.abs(r.base.labor)/r.baseHeadcount)}
export function layoffCap(state,roleId){return Math.floor(state.companies[roleId].startHeadcount*STAFF.layoffCapRatio)}
export function layoffRoom(state,roleId){const c=state.companies[roleId];return Math.max(0,Math.min(c.headcount,layoffCap(state,roleId)-c.layoffsThis))}
function massLayoffTriggered(c,extra=0){
  const laid=c.layoffsThis+extra;
  return laid>0&&laid+c.layoffsPrev>STAFF.massLayoffRatio*(c.prevStartHeadcount||c.startHeadcount);
}

/* ---------- 事件與財報 ---------- */
export function isHedged(state,roleId,round=state.round){return inWindow(state.companies[roleId]?.hedgeUntil,round)}
export function eventRemaining(active,round){const e=eventById(active.eventId);return e?Math.max(0,e.duration-(round-active.startedRound)):0}
export function effectBreakdown(state,roleId,metric,round=state.round){
  const role=roleById(roleId);
  if(!role)return [];
  if(VARIABLE_COST_METRICS.includes(metric)&&isHedged(state,roleId,round))return [];
  return state.activeEvents.flatMap(a=>{
    const e=eventById(a.eventId),age=round-a.startedRound;
    if(!e||age<0||age>=e.duration||!eventAffects(a,role,state))return [];
    return e.effects.filter(f=>f.metric===metric&&hasTarget(f,role)).map(f=>({eventId:e.id,name:e.name,pct:f.pct*e.decay[age],remaining:e.duration-age,scope:a.scope,instanceId:a.instanceId}));
  });
}
export function metricPct(state,roleId,metric,round=state.round){return clamp(effectBreakdown(state,roleId,metric,round).reduce((n,x)=>n+x.pct,0),-60,100)}
export function assetValue(state,roleId,round=state.round){const c=state.companies[roleId];return round2(c.assetReferenceValue*(1+metricPct(state,roleId,'asset_value',round)/100))}
// 上一季已結算的總體數值決定本季的景氣連動倍率；第 1 季為 1。
export function macroFactor(state,roleId,round=state.round){
  const history=state.economicHistory.filter(x=>x.round<round),prev=history.at(-1),s=MACRO_SENSITIVITY[roleId]||{};
  if(!prev)return 1;
  // 能源、原料與股市用「上一季相對於前 4 季平均」的偏離；沒有更早資料時以開局基準（0%、0%、100 點）比較。
  const window=history.slice(-1-MACRO_WINDOW,-1);
  const avg=(key,base)=>window.length?window.reduce((t,x)=>t+x[key],0)/window.length:base;
  let pct=0;
  if(s.growth&&prev.growthPct!=null)pct+=s.growth*prev.growthPct;
  if(s.unemployment)pct+=s.unemployment*(prev.unemploymentPct-STAFF.naturalUnemploymentPct);
  if(s.energy)pct+=s.energy*(prev.energyChangePct-avg('energyChangePct',0));
  if(s.material)pct+=s.material*(prev.materialChangePct-avg('materialChangePct',0));
  if(s.stock)pct+=s.stock*(prev.stockIndex-avg('stockIndex',100));
  return 1+clamp(pct,-50,50)/100;
}
function baseFlows(state,roleId,round,opts={}){
  const role=roleById(roleId),c=state.companies[roleId],flows={};
  const headcount=opts.headcount??c.headcount;
  const employed=employedTotal(state)-c.headcount+headcount;
  const wage=wageFactor(unemploymentPct(state,employed));
  const output=outputFactor(state,roleId,headcount),macro=macroFactor(state,roleId,round);
  const outputMetrics=OUTPUT_METRICS[roleId]||['revenue'];
  const d=state.fedRatePercent-4;
  const program=state.monetaryProgram&&round>=state.monetaryProgram.startRound&&round<state.monetaryProgram.startRound+2?state.monetaryProgram.type:null;
  for(const m of METRICS){
    const base=role.base[m];
    if(!base){flows[m]=0;continue}
    let extra=0;
    if(m==='interest')extra=base<0?(program==='QE'?-10:program==='QT'?10:0):0;
    if(m==='fixed'&&inWindow(c.leaseUntil,round))extra+=SPECIAL.leaseFixedPct;
    let scale=1;
    if(m==='labor')scale=headcount/role.baseHeadcount*wage;
    else if(outputMetrics.includes(m)&&base>0)scale=output*macro;
    else if(VARIABLE_COST_METRICS.includes(m))scale=output;
    // 利率效果獨立相乘，不受事件 −60% 下限影響。
    if(m==='interest')scale*=Math.max(0,1+(base<0?RATE_SENSITIVITY.borrower:roleId==='bank'?RATE_SENSITIVITY.lender:0)*d/100);
    flows[m]=round2(Math.sign(base)*Math.abs(base)*scale*Math.max(0,1+clamp(metricPct(state,roleId,m,round)+extra,-60,100)/100));
  }
  return flows;
}
const isStruck=(state,roleId,round)=>round===state.round&&state.struckPlayerIds?.includes(ownerOf(state,roleId));
function grossRevenue(state,roleId,round){return isStruck(state,roleId,round)?0:baseFlows(state,roleId,round).revenue}
// P14：被指定的玩家把營收的 10% 轉給抽卡玩家。
export function revenueTransfer(state,roleId,round=state.round){
  let total=0;
  for(const a of state.activeEvents){
    if(a.eventId!=='P14'||!a.targetId)continue;
    const age=round-a.startedRound;if(age<0||age>=eventById('P14').duration)continue;
    const ownerRole=playerById(state,a.ownerId)?.roleId,targetRole=playerById(state,a.targetId)?.roleId;
    if(!ownerRole||!targetRole)continue;
    const amount=round2(grossRevenue(state,targetRole,round)*SPECIAL.transferShare);
    if(roleId===ownerRole)total+=amount;
    if(roleId===targetRole)total-=amount;
  }
  return round2(total);
}
export function financials(state,roleId,round=state.round,opts={}){
  const c=state.companies[roleId],flows=baseFlows(state,roleId,round,opts);
  const transfer=revenueTransfer(state,roleId,round);
  flows.revenue=round2(flows.revenue+transfer);
  if(isStruck(state,roleId,round))for(const m of METRICS)if(flows[m]>0)flows[m]=0;
  const revenue=flows.revenue,costs=Object.entries(flows).filter(([m,v])=>m!=='revenue'&&v<0).reduce((s,[,v])=>s+v,0),otherIncome=Object.entries(flows).filter(([m,v])=>m!=='revenue'&&v>0).reduce((s,[,v])=>s+v,0);
  const profit=round2(Object.values(flows).reduce((s,v)=>s+v,0));
  const payout=inWindow(c.equityUntil,round)&&profit>0?round2(profit*SPECIAL.equityShare):0;
  return {flows,revenue,costs:round2(costs),otherIncome:round2(otherIncome),profit,payout,netProfit:round2(profit-payout),transfer,macro:macroFactor(state,roleId,round),assetValue:assetValue(state,roleId,round)};
}
export function companyPosition(state,roleId){const c=state.companies[roleId];return {cash:c.cash,assetValue:assetValue(state,roleId),debt:c.debt,netWorth:c.cash+assetValue(state,roleId)-c.debt}}
// 經營預覽：調整 delta 人後，本季結算起每季的淨效果。
export function staffPreview(state,roleId,delta){
  const c=state.companies[roleId];
  if(!Number.isInteger(delta)||delta===0||c.headcount+delta<0)return null;
  const now=financials(state,roleId),after=financials(state,roleId,state.round,{headcount:c.headcount+delta});
  const severance=delta<0?round2(-delta*severancePerHead(roleId)):0;
  const labor=round2(after.flows.labor-now.flows.labor);
  const net=round2(after.profit-now.profit);
  const output=round2(net-labor);
  const payback=delta<0&&net>0?Math.ceil(severance/net):null;
  const moraleHit=delta<0?(massLayoffTriggered(c,-delta)&&!massLayoffTriggered(c)?STAFF.massLayoffMorale:0)+(c.layoffsThis-delta>=layoffCap(state,roleId)&&c.layoffsThis<layoffCap(state,roleId)?STAFF.capMorale:0):0;
  return {delta,severance,labor,output,net,payback,moraleHit,scale:round2((c.headcount+delta)/roleById(roleId).baseHeadcount)};
}

export function createGame({players,seed=Date.now(),targetWealth=5500,maxRounds=12}){
  if(!Array.isArray(players)||players.length<2||players.length>8)throw Error('請選擇 2 至 8 位玩家。');
  if(new Set(players.map(p=>p.roleId)).size!==players.length||players.some(p=>!roleById(p.roleId)))throw Error('每位玩家需要不同的企業角色。');
  const names=players.map(p=>String(p.name||'').trim());
  if(names.some(n=>!n)||new Set(names).size!==names.length)throw Error('玩家名稱不得空白或重複。');
  const n=Number(seed),goal=Number(targetWealth),limit=Number(maxRounds);
  if(!Number.isInteger(n)||!Number.isFinite(goal)||goal<2000||!Number.isInteger(limit)||limit<2||limit>50)throw Error('種子、目標或回合上限無效。');
  const state={version:1,round:1,turnIndex:0,phase:'roll',rng:n|0||1,seed:n,
    players:players.map((p,i)=>({id:`player-${i+1}`,name:names[i],roleId:p.roleId,position:0,color:i,strikeShield:false,moveAdjust:0,stallNext:false})),
    companies:Object.fromEntries(ROLES.map(r=>[r.id,{cash:1200,assetReferenceValue:800,headcount:r.baseHeadcount,debt:0,morale:100,startHeadcount:r.baseHeadcount,prevStartHeadcount:r.baseHeadcount,layoffsThis:0,layoffsPrev:0,hedgeUntil:null,leaseUntil:null,equityUntil:null}])),
    laborForce:STAFF.laborForce,activeEvents:[],eventSerial:0,
    bank:{liquidAssets:300,shortTermLiabilities:1000,totalLoans:1000,nonperformingLoans:40,rescues:[],riskRestrictionUntil:0},
    initialStockIndex:100,initialTotalLoans:1000,fedRatePercent:4,lastRateDecisionRound:null,monetaryProgram:null,
    economicHistory:[],evaluations:[],decisions:[],log:[],dice:null,reels:null,lastDraw:null,
    pendingChoice:null,pendingRoll:null,ghostPinnedBy:null,strikeCause:null,moveAdjustUsed:0,
    targetWealth:goal,maxRounds:limit,status:'playing',winnerIds:[]};
  ensureGhostState(state);
  return state;
}

export function customerRivals(state,player){
  const groups=Object.values(CUSTOMER_GROUPS).filter(g=>g.includes(player.roleId));
  return state.players.filter(p=>p.id!==player.id&&groups.some(g=>g.includes(p.roleId)));
}
// 個人事件只從適用於抽卡玩家的卡中抽出。
export function eventEligible(state,event,player){
  if(!player)return true;
  if(event.roles&&!event.roles.includes(player.roleId))return false;
  if(event.special==='transfer'&&!customerRivals(state,player).length)return false;
  return true;
}
export function drawForTile(state,tile,ownerId,forcedEventId){
  let event,scope=tile.type,sector=null,fallback=null;
  const forced=forcedEventId?eventById(forcedEventId):null;
  // 每季最多一張全球事件、每個產業最多一張產業事件；之後停在同類格改抽個人事件，避免人數越多事件越密集。
  const startedThisSeason=a=>a.startedRound===state.round;
  if(scope==='sector'){
    const sectors=['製造業','消費業','金融業','能源與運輸','民生業','科技業'];
    const index=Math.floor((BOARD.indexOf(tile)-3)/3);
    sector=sectors[((index%sectors.length)+sectors.length)%sectors.length];
    if(state.activeEvents.some(a=>startedThisSeason(a)&&a.scope==='sector'&&a.sector===sector)){fallback=`${sector}本季已有產業事件`;scope='personal';sector=null}
  }
  if(scope==='global'&&!(forced&&GLOBAL_EVENTS.includes(forced))&&state.activeEvents.some(a=>startedThisSeason(a)&&a.scope==='global')){fallback='本季已發生全球事件';scope='personal'}
  if(scope==='global')event=forced&&GLOBAL_EVENTS.includes(forced)?forced:pick(state,GLOBAL_EVENTS);
  else if(scope==='personal'){const owner=playerById(state,ownerId);event=forced&&PERSONAL_EVENTS.includes(forced)?forced:pick(state,PERSONAL_EVENTS.filter(e=>eventEligible(state,e,owner)))}
  else if(scope==='sector')event=SECTOR_EVENTS.find(e=>e.sector===sector);
  else return null;
  const active={instanceId:++state.eventSerial,eventId:event.id,scope,sector,ownerId:scope==='personal'?ownerId:null,startedRound:state.round};
  state.activeEvents.push(active);
  state.lastDraw=active;
  if(fallback)active.fallback=fallback;
  state.log.unshift(`第 ${state.round} 季｜${state.players.find(p=>p.id===ownerId)?.name||'玩家'}${fallback?`（${fallback}，改抽個人事件）`:''}抽到「${event.name}」${scope==='global'?'，影響所有適用企業':scope==='sector'?`，影響${sector}`:'，只影響自己'}。`);
  return active;
}
// 抽到特殊個人事件時立即生效的部分；需要玩家選擇的事件回傳 true。
function applyDrawEffect(state,active,player){
  const e=eventById(active.eventId),c=state.companies[player.roleId],until=state.round+SPECIAL.windowSeasons-1;
  switch(e.special){
    case 'strikeShield':player.strikeShield=true;state.log.unshift(`${player.name}簽訂團體協約，下一次遇到罷工可照常營運。`);break;
    case 'moveAdjust':player.moveAdjust+=SPECIAL.aeoRolls;state.log.unshift(`${player.name}取得 AEO 認證，接下來 ${player.moveAdjust} 次拉霸可調整 ±1 格。`);break;
    case 'hedge':c.cash=round2(c.cash-SPECIAL.hedgeCost);c.hedgeUntil=until;state.log.unshift(`${player.name}支付避險權利金 ${SPECIAL.hedgeCost}，第 ${state.round}–${until} 季鎖定能源與原物料成本。`);break;
    case 'recall':c.cash=round2(c.cash-SPECIAL.recallCost);state.log.unshift(`${player.name}支付產品召回處理費 ${SPECIAL.recallCost}。`);break;
    case 'ghostAhead':{
      const from=state.ghostPosition,steps=1+Math.floor(nextGhostRandom(state)*3);
      state.ghostPosition=(player.position+steps)%BOARD.length;
      state.ghostTrail=[from,state.ghostPosition];
      state.ghostPinnedBy=player.id;
      state.log.unshift(`勞資談判破裂！罷工幽靈移到${player.name}前方 ${steps} 格（第 ${state.ghostPosition} 格），停留到其下一次拉霸。`);
      break;
    }
  }
  if(e.choice){state.pendingChoice={instanceId:active.instanceId,eventId:e.id,kind:e.choice,playerId:player.id};return true}
  return false;
}

function moveBy(state,player,steps,reels){
  const old=player.position,fullPath=movementPath(old,steps);
  // 一般情況只有停在幽靈格才罷工；P16 釘住的幽靈則經過即觸發。
  const pinned=state.ghostPinnedBy===player.id;
  const ghostStep=pinned?fullPath.indexOf(state.ghostPosition):fullPath.length&&fullPath.at(-1)===state.ghostPosition?fullPath.length-1:-1;
  let struck=ghostStep!==-1,shielded=false;
  if(struck&&player.strikeShield){struck=false;shielded=true;player.strikeShield=false}
  const path=struck?fullPath.slice(0,ghostStep+1):fullPath;
  player.position=path.at(-1)??old;
  if(state.ghostPinnedBy===player.id)state.ghostPinnedBy=null;
  state.lastDraw=null;state.pendingRoll=null;
  const adjust=state.moveAdjustUsed?`（AEO 調整 ${state.moveAdjustUsed>0?'+':'−'}${Math.abs(state.moveAdjustUsed)}）`:'';
  state.log.unshift(`${player.name}拉出 ${reels.join(' + ')}${adjust}，${steps===0?'停留原地':struck?`原預計前進 ${steps} 格，遇罷工實際前進 ${path.length} 格`:`前進 ${steps} 格`}。`);
  if(shielded)state.log.unshift(`${player.name}遇上罷工幽靈，團體協約生效，照常營運。`);
  if(struck){state.struckPlayerIds.push(player.id);state.strikeCause='ghost';state.log.unshift(`${player.name}在第 ${player.position} 格撞上罷工幽靈！${path.length<steps?'剩餘步數作廢，':''}本季收入歸零、支出照付，失去這次經營與抽卡機會。`)}
  if(old+steps>=BOARD.length&&!struck){state.companies[player.roleId].cash+=250;state.log.unshift(`${player.name}經過起點，獲得 250 遊戲幣。`)}
  state.dice=steps;state.reels=[...reels];
  const tile=BOARD[player.position];
  state.phase=struck?'strike':steps>0&&tile.type!=='start'?'draw':'manage';
  return {dice:steps,reels:[...reels],tile,path,from:old,struck,shielded};
}
export function movementPath(from,steps,length=BOARD.length){
  if(!Number.isInteger(from)||!Number.isInteger(steps)||!Number.isInteger(length)||from<0||from>=length||steps<0||steps>length||length<2)throw Error('棋盤移動參數無效。');
  return Array.from({length:steps},(_,i)=>(from+i+1)%length);
}
export function rollDice(state,forced){
  if(state.status!=='playing'||state.phase!=='roll')throw Error('現在無法啟動拉霸。');
  const player=state.players[state.turnIndex];
  state.moveAdjustUsed=0;
  if(player.stallNext){
    player.stallNext=false;
    if(state.ghostPinnedBy===player.id)state.ghostPinnedBy=null;
    state.struckPlayerIds.push(player.id);state.strikeCause='ransomware';
    state.dice=0;state.reels=[0,0];state.lastDraw=null;state.phase='strike';
    state.log.unshift(`${player.name}的系統仍被勒索軟體鎖住，本回合停擺：收入歸零、支出照付。`);
    return {dice:0,reels:[0,0],tile:BOARD[player.position],path:[],from:player.position,struck:true,stalled:true};
  }
  const reels=forced??Array.from({length:2},()=>Math.floor(nextRandom(state)*7));
  if(!Array.isArray(reels)||reels.length!==2||reels.some(n=>!Number.isInteger(n)||n<0||n>6))throw Error('拉霸須有兩個 0–6 的數字。');
  const dice=reels.reduce((sum,n)=>sum+n,0);
  if(player.moveAdjust>0){
    state.pendingRoll={reels:[...reels],dice};state.dice=dice;state.reels=[...reels];state.lastDraw=null;state.phase='adjust';
    return {dice,reels:[...reels],pending:true,from:player.position,path:[]};
  }
  return moveBy(state,player,dice,reels);
}
// P08：拉霸停定後選擇 −1、0、+1 格。
export function confirmMove(state,playerId,adjust){
  const player=state.players[state.turnIndex];
  if(state.status!=='playing'||state.phase!=='adjust'||player.id!==playerId||!state.pendingRoll)throw Error('現在不需要調整步數。');
  if(![-1,0,1].includes(adjust))throw Error('只能調整 −1、0 或 +1 格。');
  const steps=Math.max(0,state.pendingRoll.dice+adjust);
  player.moveAdjust--;state.moveAdjustUsed=steps-state.pendingRoll.dice;
  return moveBy(state,player,steps,state.pendingRoll.reels);
}
export function drawEvent(state,forcedEventId){
  if(state.status!=='playing'||state.phase!=='draw')throw Error('現在不需要抽卡。');
  const player=state.players[state.turnIndex],tile=BOARD[player.position];
  if(!state.dice||tile.type==='start')throw Error('目前停格沒有事件卡。');
  const active=drawForTile(state,tile,player.id,forcedEventId);
  state.phase=active.scope==='personal'&&applyDrawEffect(state,active,player)?'choice':'manage';
  return active;
}
export function resolveChoice(state,playerId,value){
  const player=state.players[state.turnIndex],pending=state.pendingChoice;
  if(state.status!=='playing'||state.phase!=='choice'||player.id!==playerId||!pending)throw Error('現在沒有需要決定的事件。');
  const active=state.activeEvents.find(a=>a.instanceId===pending.instanceId),e=eventById(pending.eventId),c=state.companies[player.roleId];
  const until=state.round+SPECIAL.windowSeasons-1,drop=()=>{state.activeEvents=state.activeEvents.filter(a=>a!==active)};
  if(e.choice==='target'){
    const target=(e.special==='transfer'?customerRivals(state,player):state.players.filter(p=>p.id!==player.id)).find(p=>p.id===value);
    if(!target)throw Error(e.special==='transfer'?'只能選擇客群重疊的玩家。':'請選擇另一位玩家。');
    if(e.special==='alliance'){active.partnerId=target.id;state.log.unshift(`${player.name}與${target.name}結成策略聯盟，雙方營收 +15%，持續 3 季。`)}
    else {active.targetId=target.id;state.log.unshift(`${player.name}搶下${target.name}的大客戶，2 季內取得對方營收的 10%。`)}
  } else if(e.choice==='accept'){
    if(!['accept','decline'].includes(value))throw Error('請選擇接受或放棄。');
    if(value==='decline'){drop();state.log.unshift(`${player.name}放棄「${e.name}」。`)}
    else if(e.special==='equity'){c.cash=round2(c.cash+SPECIAL.equityCash);c.equityUntil=until;state.log.unshift(`${player.name}現金增資 ${SPECIAL.equityCash}；第 ${state.round}–${until} 季正淨利的 25% 分配給新股東。`)}
    else if(e.special==='leaseback'){
      if(c.assetReferenceValue<=0)throw Error('沒有可出售的投資資產。');
      const proceeds=assetValue(state,player.roleId);
      c.cash=round2(c.cash+proceeds);c.assetReferenceValue=0;c.leaseUntil=until;
      state.log.unshift(`${player.name}售後租回，投資資產換得現金 ${Math.round(proceeds)}；第 ${state.round}–${until} 季固定營運成本 +10%。`);
    }
  } else if(e.choice==='ransom'){
    if(!['pay','refuse'].includes(value))throw Error('請選擇付款或拒付。');
    if(value==='pay'){c.cash=round2(c.cash-SPECIAL.ransomCost);state.log.unshift(`${player.name}支付勒索軟體贖金 ${SPECIAL.ransomCost}。`)}
    else {player.stallNext=true;state.log.unshift(`${player.name}拒付贖金，下一回合系統將停擺。`)}
  }
  state.pendingChoice=null;state.phase='manage';
}
export function adjustStaff(state,playerId,delta){
  if(state.status!=='playing'||state.phase!=='manage'||state.players[state.turnIndex].id!==playerId)throw Error('只能在自己的經營階段調整員工。');
  if(!Number.isInteger(delta)||delta===0)throw Error('請輸入非零整數人數。');
  const p=state.players[state.turnIndex],c=state.companies[p.roleId];
  if(delta>0){
    const pool=availableLabor(state);
    if(delta>pool)throw Error(`勞動市場只剩 ${pool} 人可聘僱。`);
    c.headcount+=delta;state.log.unshift(`${p.name}聘僱 ${delta} 人。`);
    return {severance:0};
  }
  const n=-delta,room=layoffRoom(state,p.roleId);
  if(n>room)throw Error(`本季最多再裁 ${room} 人（單季上限為季初人數的 1/3）。`);
  const severance=round2(n*severancePerHead(p.roleId));
  c.headcount-=n;c.layoffsThis+=n;c.cash=round2(c.cash-severance);
  state.log.unshift(`${p.name}裁員 ${n} 人，支付資遣費 ${Math.round(severance)}。`);
  return {severance};
}
export function issueLoan(state,playerId,amount){
  if(state.status!=='playing'||state.phase!=='manage'||state.players[state.turnIndex].id!==playerId)throw Error('只能在自己的經營階段借款。');
  if(!Number.isInteger(amount)||amount<=0||amount>state.bank.liquidAssets||state.bank.riskRestrictionUntil>=state.round)throw Error('借款金額超出銀行流動資產，或目前限制新增風險放款。');
  const c=state.companies[state.players[state.turnIndex].roleId];c.cash+=amount;c.debt+=amount;state.bank.liquidAssets-=amount;state.bank.totalLoans+=amount;state.log.unshift(`${state.players[state.turnIndex].name}借款 ${amount}；現金及負債同步增加。`);
}
export function repayLoan(state,playerId,amount){
  if(state.status!=='playing'||state.phase!=='manage'||state.players[state.turnIndex].id!==playerId)throw Error('只能在自己的經營階段還款。');
  const c=state.companies[state.players[state.turnIndex].roleId];
  if(!Number.isInteger(amount)||amount<=0||amount>c.debt||amount>c.cash)throw Error('還款不能超過現金或未償債務。');
  c.cash-=amount;c.debt-=amount;state.bank.liquidAssets+=amount;state.bank.totalLoans-=amount;state.log.unshift(`${state.players[state.turnIndex].name}償還 ${amount} 借款。`);
}
export function updateBadLoans(state,playerId,amount){
  const p=state.players[state.turnIndex];
  if(state.status!=='playing'||state.phase!=='manage'||p.id!==playerId||p.roleId!=='bank')throw Error('只有銀行玩家能在自己的回合調整壞帳。');
  if(!Number.isInteger(amount)||amount===0||state.bank.nonperformingLoans+amount<0||state.bank.nonperformingLoans+amount>state.bank.totalLoans)throw Error('壞帳調整超出範圍。');
  state.bank.nonperformingLoans+=amount;state.log.unshift(`銀行${amount>0?'認列':'收回'} ${Math.abs(amount)} 壞帳。`);
}

function marketShock(state,round){
  const sum=state.activeEvents.filter(a=>a.scope==='global').reduce((total,a)=>{
    const e=eventById(a.eventId),age=round-a.startedRound;
    return total+(e&&age>=0&&age<e.duration?e.effects.filter(f=>f.metric==='asset_value').reduce((s,f)=>s+f.pct*e.decay[age],0):0);
  },0);
  const program=state.monetaryProgram&&round>=state.monetaryProgram.startRound&&round<state.monetaryProgram.startRound+2?state.monetaryProgram.type:null;
  return clamp(sum+(program==='QE'?5:program==='QT'?-5:0),-60,100);
}
export function makeSnapshot(state,round=state.round){
  const prev=state.economicHistory.at(-1)||null,ago3=state.economicHistory.find(x=>x.round===round-3)||null;
  const f=ROLES.map(r=>financials(state,r.id,round));
  const sumMetric=m=>f.reduce((s,x)=>s+Math.abs(x.flows[m]),0),sumBase=m=>ROLES.reduce((s,r)=>s+Math.abs(r.base[m]),0);
  const energyChangePct=pct(sumMetric('energy'),sumBase('energy'));
  const materialChangePct=pct(sumMetric('material'),sumBase('material'));
  const inflationPct=2+.08*energyChangePct+.06*materialChangePct;
  const lf=laborForce(state),revenueTotal=f.reduce((s,x)=>s+x.revenue,0),employed=employedTotal(state),unemployed=lf-employed;
  const stockIndex=100*(1+marketShock(state,round)/100);
  const priorStock=prev?.stockIndex??100;
  const program=state.monetaryProgram&&round>=state.monetaryProgram.startRound&&round<state.monetaryProgram.startRound+2?state.monetaryProgram.type:null;
  const cooldown=state.lastRateDecisionRound===null?0:Math.max(0,3-(round-state.lastRateDecisionRound));
  const stock3=ago3?.stockIndex??(round===3?state.initialStockIndex??100:null),loans3=ago3?.totalLoans??(round===3?state.initialTotalLoans??1000:null);
  return {round,inflationPct,previousInflationPct:prev?.inflationPct??null,energyChangePct,materialChangePct,revenueTotal,previousRevenueTotal:prev?.revenueTotal??null,growthPct:prev?pct(revenueTotal,prev.revenueTotal):null,previousGrowthPct:prev?.growthPct??null,laborForce:lf,employed,unemployed,unemploymentPct:100*unemployed/lf,previousUnemploymentPct:prev?.unemploymentPct??null,wageFactor:wageFactor(100*unemployed/lf),stockIndex,previousStockIndex:priorStock,stockIndex3Ago:stock3,stockReturn1Pct:pct(stockIndex,priorStock),stockReturn3Pct:stock3===null?null:pct(stockIndex,stock3),totalLoans:state.bank.totalLoans,totalLoans3Ago:loans3,loanGrowth3Pct:loans3===null?null:pct(state.bank.totalLoans,loans3),liquidAssets:state.bank.liquidAssets,shortTermLiabilities:state.bank.shortTermLiabilities,liquidityPct:div(100*state.bank.liquidAssets,state.bank.shortTermLiabilities),nonperformingLoans:state.bank.nonperformingLoans,nplPct:div(100*state.bank.nonperformingLoans,state.bank.totalLoans),fedRatePct:state.fedRatePercent,rateCooldownRounds:cooldown,monetaryProgram:program,monetaryProgramRoundsLeft:program?state.monetaryProgram.startRound+2-round:0,dataWarnings:[]};
}
const cmp=(label,value,op,limit)=>`${label} ${value===null?'—':round2(value).toFixed(2)+'%'} ${op} ${limit}%（${value===null?'資料不足':op==='≥'?value>=limit?'是':'否':op==='≤'?value<=limit?'是':'否':value<limit?'是':'否'}）`;
export function evaluateFed(snapshot,state){
  const tests={
    F01:{ok:snapshot.inflationPct>=8,comparisons:[cmp('π(t)',snapshot.inflationPct,'≥',8)]},
    F02:{ok:snapshot.inflationPct>=4&&snapshot.previousInflationPct>=4,comparisons:[cmp('π(t)',snapshot.inflationPct,'≥',4),cmp('π(t−1)',snapshot.previousInflationPct,'≥',4)]},
    F03:{ok:snapshot.inflationPct>=6&&snapshot.growthPct<=-5,comparisons:[cmp('π(t)',snapshot.inflationPct,'≥',6),cmp('g(t)',snapshot.growthPct,'≤',-5)]},
    F04:{ok:snapshot.growthPct<=-10&&snapshot.previousGrowthPct<=-10,comparisons:[cmp('g(t)',snapshot.growthPct,'≤',-10),cmp('g(t−1)',snapshot.previousGrowthPct,'≤',-10)]},
    F05:{ok:snapshot.unemploymentPct>=10&&snapshot.previousUnemploymentPct>=10,comparisons:[cmp('u(t)',snapshot.unemploymentPct,'≥',10),cmp('u(t−1)',snapshot.previousUnemploymentPct,'≥',10)]},
    F06:{ok:snapshot.inflationPct<=-2&&snapshot.previousInflationPct<=-2,comparisons:[cmp('π(t)',snapshot.inflationPct,'≤',-2),cmp('π(t−1)',snapshot.previousInflationPct,'≤',-2)]},
    F07:{ok:snapshot.stockReturn1Pct<=-25,comparisons:[cmp('股市單季',snapshot.stockReturn1Pct,'≤',-25),cmp('g(t)',snapshot.growthPct,'<',0)]},
    F08:{ok:snapshot.liquidityPct<10,comparisons:[cmp('流動性',snapshot.liquidityPct,'<',10)]},
    F09:{ok:snapshot.nplPct>=8,comparisons:[cmp('壞帳率',snapshot.nplPct,'≥',8)]},
    F10:{ok:snapshot.stockReturn3Pct>=30&&snapshot.loanGrowth3Pct>=20,comparisons:[cmp('股市三季',snapshot.stockReturn3Pct,'≥',30),cmp('放款三季',snapshot.loanGrowth3Pct,'≥',20)]}
  };
  const evaluations=FED_RULES.map(rule=>({ruleId:rule.id,name:rule.name,requiredMetricIds:rule.fields,comparisons:tests[rule.id].comparisons,status:rule.fields.some(k=>snapshot[k]===null||snapshot[k]===undefined)?'insufficient_data':tests[rule.id].ok?'matched':'not_matched',reason:'',proposedAction:null,nextEffectiveRound:null}));
  const selectedId=FED_PRIORITY.find(id=>evaluations.find(x=>x.ruleId===id).status==='matched')||null;
  for(const ev of evaluations){
    if(ev.status==='matched'&&ev.ruleId!==selectedId){ev.status='suppressed_by_priority';ev.reason=`優先序低於 ${selectedId}`}
  }
  const chosen=evaluations.find(x=>x.ruleId===selectedId);
  if(chosen){
    let action='維持利率與金融措施',kind='none',delta=0;
    switch(selectedId){
      case 'F01':kind='rate';delta=.75;action='升息 0.75 個百分點';break;
      case 'F02':kind='rate';delta=.25;action='升息 0.25 個百分點';break;
      case 'F03':action='維持利率，觀察金融風險';break;
      case 'F04':kind='rate';delta=-.5;action='降息 0.50 個百分點';break;
      case 'F05':kind='rate';delta=-.25;action='降息 0.25 個百分點';break;
      case 'F06':kind=snapshot.fedRatePct===0?'program':'rate';delta=-.5;action=kind==='program'?'啟動 QE 2 回合':'降息 0.50 個百分點';break;
      case 'F07':kind=snapshot.growthPct<0?'program':'none';action=kind==='program'?'啟動 QE 2 回合':'市場觀察公告：景氣尚未衰退';break;
      case 'F08':kind='rescue';action='緊急流動性融資補足至 15%';break;
      case 'F09':kind='restriction';action='停止高風險新增放款 2 回合';break;
      case 'F10':kind=snapshot.fedRatePct<6?'rate':'program';delta=.25;action=kind==='rate'?'升息 0.25 個百分點':'啟動 QT 2 回合';break;
    }
    if(kind==='rate'&&snapshot.rateCooldownRounds>0){chosen.status='rate_cooldown';chosen.reason=`利率冷卻尚餘 ${snapshot.rateCooldownRounds} 回合`;action='冷卻中，維持利率';kind='none'}
    else {chosen.status='selected';chosen.reason='依優先序採用'}
    chosen.proposedAction=action;chosen.nextEffectiveRound=snapshot.round+1;
    return {evaluations,decision:{round:snapshot.round,ruleId:selectedId,action,kind,delta,nextEffectiveRound:snapshot.round+1}};
  }
  return {evaluations,decision:{round:snapshot.round,ruleId:null,action:'維持利率與金融措施',kind:'none',delta:0,nextEffectiveRound:snapshot.round+1}};
}

function applyDecision(state,decision){
  if(!decision)return;
  if(decision.kind==='rate')state.fedRatePercent=clamp(round2(state.fedRatePercent+decision.delta),0,10);
  if(decision.kind==='program'){
    const type=decision.action.includes('QE')?'QE':'QT';
    state.monetaryProgram={type,startRound:state.round};
  }
  if(decision.kind==='rescue'){
    const amount=Math.max(0,.15*state.bank.shortTermLiabilities-state.bank.liquidAssets);
    state.bank.liquidAssets+=amount;state.bank.shortTermLiabilities+=amount;
    if(amount)state.bank.rescues.push({amount,dueRound:state.round+3});
  }
  if(decision.kind==='restriction')state.bank.riskRestrictionUntil=state.round+1;
  if(decision.kind!=='none')state.log.unshift(`第 ${state.round} 季生效｜聯準會 ${decision.action}。`);
}
// 季末員工結算：士氣、自願離職、勞動力成長。
function settleStaff(state,round){
  for(const r of ROLES){
    const c=state.companies[r.id],name=state.players.find(p=>p.roleId===r.id)?.name||r.name;
    const before=c.morale;
    if(massLayoffTriggered(c))c.morale-=STAFF.massLayoffMorale;
    if(c.layoffsThis>0&&c.layoffsThis>=layoffCap(state,r.id))c.morale-=STAFF.capMorale;
    c.morale=clamp(c.morale,0,100);
    if(c.morale<before)state.log.unshift(`第 ${round} 季｜${name}非常規裁員，士氣降至 ${c.morale}。`);
    // 離職以本季結束時（恢復前）的士氣判斷。
    if(c.morale<STAFF.attritionMorale&&c.headcount>0){
      const leave=Math.max(1,Math.round(c.headcount*STAFF.attritionRate));
      c.headcount-=leave;state.log.unshift(`第 ${round} 季｜${name}士氣低落，${leave} 名員工自願離職。`);
    }
    if(c.layoffsThis===0)c.morale=clamp(c.morale+STAFF.moraleRecovery,0,100);
    c.layoffsPrev=c.layoffsThis;c.layoffsThis=0;
    c.prevStartHeadcount=c.startHeadcount;c.startHeadcount=c.headcount;
  }
  const before=laborForce(state);
  state.laborForce=Math.round(before*(1+STAFF.laborGrowth));
  // 非玩家企業依基準人數比例吸收新增勞動力，失業率才不會在無人操作時一路上升。
  const npc=ROLES.filter(r=>!state.players.some(p=>p.roleId===r.id)),growth=state.laborForce-before;
  const baseTotal=npc.reduce((s,r)=>s+r.baseHeadcount,0);
  let hired=0;
  npc.forEach((r,i)=>{const n=i===npc.length-1?growth-hired:Math.round(growth*r.baseHeadcount/baseTotal);state.companies[r.id].headcount+=n;state.companies[r.id].startHeadcount+=n;hired+=n});
}
export function endTurn(state){
  if(state.status!=='playing'||!['manage','strike'].includes(state.phase))throw Error('請先完成本回合。');
  state.ghostTrail=[state.ghostPosition];
  if(state.turnIndex<state.players.length-1){state.turnIndex++;state.phase='roll';state.dice=null;state.reels=null;state.lastDraw=null;state.strikeCause=null;state.moveAdjustUsed=0;return null}
  const result=settleSeason(state);return result;
}
export function settleSeason(state){
  if(state.status!=='playing')throw Error('遊戲已結束。');
  const round=state.round;
  const financialResults=Object.fromEntries(ROLES.map(r=>[r.id,financials(state,r.id,round)]));
  for(const r of ROLES)state.companies[r.id].cash=round2(state.companies[r.id].cash+financialResults[r.id].netProfit);
  const snapshot=makeSnapshot(state,round);
  state.economicHistory.push(snapshot);
  const {evaluations,decision}=evaluateFed(snapshot,state);
  state.evaluations.push({round,items:evaluations});state.decisions.push(decision);
  state.log.unshift(`第 ${round} 季結算完成｜總營收 ${Math.round(snapshot.revenueTotal).toLocaleString()}、通膨 ${round2(snapshot.inflationPct)}%、失業 ${round2(snapshot.unemploymentPct)}%、聯準會：${decision.action}。`);
  if(decision.kind==='rate')state.lastRateDecisionRound=round;
  settleStaff(state,round);
  const bankrupt=state.players.filter(p=>state.companies[p.roleId].cash+financialResults[p.roleId].assetValue-state.companies[p.roleId].debt<=0);
  const achievers=state.players.filter(p=>state.companies[p.roleId].cash+financialResults[p.roleId].assetValue-state.companies[p.roleId].debt>=state.targetWealth);
  if(bankrupt.length||achievers.length||round>=state.maxRounds){
    state.status=bankrupt.length?'bankruptcy':achievers.length?'goal':'round_limit';
    state.winnerIds=(achievers.length?achievers:state.players.filter(p=>!bankrupt.includes(p)).sort((a,b)=>companyPosition(state,b.roleId).netWorth-companyPosition(state,a.roleId).netWorth).slice(0,1)).map(p=>p.id);
    state.phase='finished';return {snapshot,decision,finished:true};
  }
  state.round++;
  state.struckPlayerIds=[];state.strikeCause=null;state.moveAdjustUsed=0;
  // 罷工幽靈每季移動一次；被 P16 釘住時留在原地。
  if(!state.ghostPinnedBy)moveGhost(state);
  state.activeEvents=state.activeEvents.filter(a=>eventRemaining(a,state.round)>0);
  state.monetaryProgram=state.monetaryProgram&&state.round<state.monetaryProgram.startRound+2?state.monetaryProgram:null;
  for(const rescue of [...state.bank.rescues])if(rescue.dueRound<=state.round&&state.bank.liquidAssets>=rescue.amount){state.bank.liquidAssets-=rescue.amount;state.bank.shortTermLiabilities-=rescue.amount;state.bank.rescues.splice(state.bank.rescues.indexOf(rescue),1);state.log.unshift(`第 ${state.round} 季｜銀行償還緊急融資 ${rescue.amount}。`)}
  applyDecision(state,decision);
  state.turnIndex=0;state.phase='roll';state.dice=null;state.reels=null;state.lastDraw=null;
  return {snapshot,decision,finished:false};
}
export function getEconomicSnapshot(state,round){return state.economicHistory.find(x=>x.round===round)||null}
export function getEconomicHistory(state,from=1,to=state.round){return state.economicHistory.filter(x=>x.round>=from&&x.round<=to)}
export function getFedRuleEvaluations(state,round){return state.evaluations.find(x=>x.round===round)?.items||null}
export function getFedDecision(state,round){return state.decisions.find(x=>x.round===round)||null}
export function exportGame(state){return JSON.stringify(state,null,2)}
export function importGame(json){const s=JSON.parse(json);if(s.version!==1||!Array.isArray(s.players)||!Array.isArray(s.economicHistory)||!s.companies||!s.bank||!Array.isArray(s.activeEvents))throw Error('存檔格式不正確。');ensureGhostState(s);ensureExtendedState(s);return s}
