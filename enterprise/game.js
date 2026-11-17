// Generated from data.js, engine.js, sync.js and app.js. Run node build.mjs after source edits.
'use strict';
const METRICS = ['revenue','labor','material','energy','import_tax','export_cost','interest','fixed','tax','investment'];
const METRIC_LABELS = {revenue:'營業收入',labor:'人力成本',material:'原物料／商品',energy:'能源／運輸',import_tax:'進口關稅',export_cost:'出口貿易',interest:'利息收支',fixed:'固定營運',tax:'稅金',investment:'投資損益',asset_value:'投資資產價值'};
const ROLES = [
  // 基準收入經模擬校準：依最佳策略自動對戰數千局，調整到各企業勝率接近（node simulate.mjs 可重跑）。
  // 原物料用量大、受事件衝擊多的企業（零售、農業）基準淨利較高，作為風險補償。
  ['auto','汽車製造商','製造業',[1031,-200,-250,-100,0,-80,-20,-100,-50,0],150,'🚘'],
  ['electronics','電子製造商','製造業',[1192,-250,-300,-100,-60,-70,-30,-120,-70,30],140,'💻'],
  ['retail','百貨零售商','消費業',[1263,-180,-400,-40,-60,0,-20,-120,-30,0],150,'🛍️'],
  ['bank','銀行','金融業',[250,-140,0,-10,0,0,259,-100,-70,40],70,'🏦'],
  ['investment','投資公司','金融業',[180,-100,0,-5,0,0,-30,-45,-60,316],30,'📈'],
  ['energy','能源公司','能源與運輸',[1103,-130,-350,-120,-20,-40,-70,-140,-70,0],85,'⚡'],
  ['logistics','物流運輸公司','能源與運輸',[945,-220,-30,-250,-10,-20,-30,-100,-25,0],110,'🚚'],
  ['property','房地產公司','民生業',[749,-80,-60,-40,0,0,-150,-250,-50,80],55,'🏙️'],
  ['agriculture','農業食品公司','民生業',[1100,-180,-260,-120,-20,-20,-20,-90,-25,0],100,'🌾'],
  ['technology','科技服務公司','科技業',[847,-350,0,-40,0,-10,-20,-185,-65,20],60,'🧪']
].map(([id,name,sector,values,headcount,icon])=>({id,name,sector,base:Object.fromEntries(METRICS.map((m,i)=>[m,values[i]])),baseHeadcount:headcount,icon}));

const ALL='all';
const fx=(metric,pct,target=ALL)=>({metric,pct,target});
const GLOBAL_EVENTS = [
  {id:'E01',name:'海灣戰爭爆發',duration:5,decay:[1,.75,.5,.25,.125],effects:[fx('material',20),fx('energy',40),fx('export_cost',15),fx('revenue',25,'energy')]},
  {id:'E02',name:'全球金融海嘯',duration:6,decay:[1,.8,.6,.4,.2,.1],effects:[fx('revenue',-25),fx('asset_value',-35),fx('interest',15,'interest_negative'),fx('interest',-10,'bank')]},
  {id:'E03',name:'全球供應鏈中斷',duration:4,decay:[1,.7,.4,.1],effects:[fx('material',25),fx('energy',20),fx('revenue',-15,'electronics'),fx('revenue',-10,'agriculture')]},
  {id:'E04',name:'全球貿易戰',duration:6,decay:[1,.8,.6,.4,.2,.1],effects:[fx('import_tax',50),fx('export_cost',40),fx('material',15),fx('revenue',-10,'auto,electronics')]},
  {id:'E05',name:'AI 技術革命',duration:6,decay:[1,.8,.6,.4,.2,.1],effects:[fx('revenue',40,'technology'),fx('revenue',25,'electronics'),fx('labor',20,'technology'),fx('labor',-10,'except_technology')]},
  {id:'E06',name:'全球能源危機',duration:4,decay:[1,.7,.4,.1],effects:[fx('energy',60),fx('material',10),fx('revenue',40,'energy'),fx('revenue',-10,'logistics')]},
  {id:'E07',name:'全球疫情爆發',duration:6,decay:[1,.8,.6,.4,.2,.1],effects:[fx('revenue',-35,'retail'),fx('revenue',20,'logistics'),fx('revenue',25,'technology'),fx('labor',10),fx('energy',15)]},
  {id:'E08',name:'政府擴大基礎建設',duration:5,decay:[1,.75,.5,.25,.125],effects:[fx('revenue',25,'property'),fx('revenue',15,'auto,electronics'),fx('material',20),fx('revenue',20,'logistics')]},
  {id:'E09',name:'全球消費熱潮',duration:3,decay:[1,.5,.25],effects:[fx('revenue',35,'retail'),fx('revenue',25,'auto'),fx('revenue',20,'electronics'),fx('material',15),fx('revenue',15,'logistics')]},
  {id:'E10',name:'全球經濟衰退',duration:6,decay:[1,.8,.6,.4,.2,.1],effects:[fx('revenue',-20),fx('material',-20),fx('energy',-15),fx('asset_value',-20)]}
];
const PERSONAL_EVENTS = [
  {id:'P01',name:'關鍵客戶續約',duration:3,decay:[1,.65,.3],effects:[fx('revenue',25)]},
  {id:'P02',name:'設備故障維修',duration:2,decay:[1,.5],effects:[fx('fixed',35),fx('energy',15)]},
  {id:'P03',name:'管理效率提升',duration:3,decay:[1,.6,.3],effects:[fx('fixed',-25),fx('labor',-10)]},
  {id:'P04',name:'稅務補繳',duration:2,decay:[1,.5],effects:[fx('tax',40)]},
  {id:'P05',name:'市場行銷奏效',duration:3,decay:[1,.7,.4],effects:[fx('revenue',20),fx('fixed',10)]},
  {id:'P06',name:'投資判斷失準',duration:3,decay:[1,.6,.2],effects:[fx('investment',-30),fx('asset_value',-15)]},
  {id:'P07',name:'簽訂團體協約',duration:1,decay:[1],effects:[],special:'strikeShield',desc:'與工會簽訂團體協約，協約期間負有和平義務。下一次撞到罷工幽靈時照常營運、繼續前進。'},
  {id:'P08',name:'取得 AEO 優質企業認證',duration:1,decay:[1],effects:[],special:'moveAdjust',desc:'取得通關便利：接下來 2 次拉霸停定後，可選擇 −1、0 或 +1 格。'},
  {id:'P09',name:'簽訂期貨避險合約',duration:4,decay:[1,1,1,1],effects:[],special:'hedge',roles:['auto','electronics','retail','energy','logistics','property','agriculture'],desc:'立即支付權利金 100；4 季內能源與原物料成本不受任何事件影響，漲跌都不算。'},
  {id:'P10',name:'策略聯盟',duration:3,decay:[1,1,1],effects:[fx('revenue',15)],special:'alliance',choice:'target',desc:'指定一位玩家結盟，雙方營收 +15%，持續 3 季。'},
  {id:'P11',name:'辦理現金增資',duration:4,decay:[1,1,1,1],effects:[],special:'equity',choice:'accept',desc:'可選擇接受：現金立即 +500；4 季內每季正淨利的 25% 分配給新股東。'},
  {id:'P12',name:'售後租回',duration:4,decay:[1,1,1,1],effects:[],special:'leaseback',choice:'accept',roles:['auto','electronics','retail','bank','energy','logistics','property','agriculture','technology'],desc:'可選擇把投資資產按目前價值全數換成現金；4 季內固定營運成本 +10%。'},
  {id:'P13',name:'遭勒索軟體攻擊',duration:1,decay:[1],effects:[],special:'ransom',choice:'ransom',desc:'二選一：支付贖金 300；或拒付，下一回合系統停擺，效果等同撞到罷工幽靈。'},
  {id:'P14',name:'搶下對手大客戶',duration:2,decay:[1,1],effects:[],special:'transfer',choice:'target',desc:'指定一位客群重疊的玩家，2 季內把對方營收的 10% 轉為自己的營收。'},
  {id:'P15',name:'產品召回',duration:2,decay:[1,1],effects:[fx('revenue',-20)],special:'recall',roles:['auto','electronics','retail','agriculture'],desc:'立即支付召回處理費 350；營收 −20%，持續 2 季。'},
  {id:'P16',name:'勞資談判破裂',duration:1,decay:[1],effects:[],special:'ghostAhead',desc:'罷工幽靈移到你前方 1–3 格，並停留到你下一次拉霸；這次只要經過就會罷工，持有團體協約可抵銷。'}
];
// P14 搶客戶只能選客群重疊的對手。
const CUSTOMER_GROUPS={consumer:['retail','auto','electronics','agriculture','property'],business:['electronics','technology','logistics','energy'],finance:['bank','investment']};
const CUSTOMER_GROUP_LABELS={consumer:'消費者市場',business:'企業客戶',finance:'金融客戶'};
const SPECIAL={hedgeCost:100,recallCost:350,ransomCost:300,equityCash:500,equityShare:.25,leaseFixedPct:10,transferShare:.1,windowSeasons:4,aeoRolls:2};
const STAFF={
  laborForce:1000,laborGrowth:.02,naturalUnemploymentPct:5,wageSlope:.03,
  curveLinear:.6,curveQuadratic:.3,
  layoffCapRatio:1/3,massLayoffRatio:.2,massLayoffMorale:30,capMorale:10,moraleRecovery:10,
  attritionMorale:50,attritionRate:.03,moraleFloor:.8
};
// 景氣連動：上一季的總體數值影響本季營收（金融業為利息／投資收益）。
// growth：營收成長率每 1%；unemployment：失業率每高於 5% 一個百分點；
// energy／material／stock：上季數值相對「前 4 季平均」每高 1%（股市為 1 點）。用相對值避免事件長期推高物價造成固定偏差。
const MACRO_SENSITIVITY={
  auto:{growth:.6},electronics:{growth:.4},retail:{unemployment:-2},bank:{},investment:{stock:1},
  energy:{energy:.4},logistics:{growth:.5},property:{},agriculture:{material:.8},technology:{stock:.3}
};
const MACRO_WINDOW=4;
// 利率連動：政策利率每偏離 4% 一個百分點，利息科目變動的百分比（銀行為收入、借款企業為支出）。
const RATE_SENSITIVITY={lender:20,borrower:20};
const MACRO_LABELS={
  auto:'營收成長率越高，賣車越多',electronics:'營收成長率越高，訂單越多',retail:'失業率越高，消費越弱',bank:'利率越高，利息收入越多',
  investment:'股市漲過近期平均，投資收益增加',energy:'能源價格高於近期平均，售價跟著漲',logistics:'營收成長率越高，貨運越多',
  property:'利率越低，利息支出越少',agriculture:'原物料價格高於近期平均，農產品賣得更貴',technology:'股市越熱，企業越願意買軟體服務'
};
const OUTPUT_METRICS={bank:['revenue','interest'],investment:['revenue','investment']};
const VARIABLE_COST_METRICS=['material','energy'];
const SECTOR_EVENTS = [
  {id:'S01',name:'製造業接單潮',sector:'製造業',duration:3,decay:[1,.65,.3],effects:[fx('revenue',20),fx('material',10)]},
  {id:'S02',name:'消費市場轉弱',sector:'消費業',duration:3,decay:[1,.6,.3],effects:[fx('revenue',-22)]},
  {id:'S03',name:'金融信用擴張',sector:'金融業',duration:3,decay:[1,.65,.3],effects:[fx('interest',20),fx('asset_value',12)]},
  {id:'S04',name:'運輸燃料補貼',sector:'能源與運輸',duration:3,decay:[1,.6,.3],effects:[fx('energy',-25)]},
  {id:'S05',name:'民生供應吃緊',sector:'民生業',duration:3,decay:[1,.6,.3],effects:[fx('material',30),fx('revenue',10)]},
  {id:'S06',name:'科技採購熱潮',sector:'科技業',duration:3,decay:[1,.65,.3],effects:[fx('revenue',30),fx('labor',15)]}
];
const ALL_EVENTS=[...GLOBAL_EVENTS,...PERSONAL_EVENTS,...SECTOR_EVENTS];
const FED_RULES=[
  {id:'F01',name:'惡性通膨',fields:['inflationPct'],formula:'π(t) ≥ 8%'},
  {id:'F02',name:'持續性通膨',fields:['inflationPct','previousInflationPct'],formula:'π(t) ≥ 4% 且 π(t−1) ≥ 4%'},
  {id:'F03',name:'停滯性通膨',fields:['inflationPct','growthPct'],formula:'π(t) ≥ 6% 且 g(t) ≤ −5%'},
  {id:'F04',name:'經濟嚴重衰退',fields:['growthPct','previousGrowthPct'],formula:'g(t) ≤ −10% 且 g(t−1) ≤ −10%'},
  {id:'F05',name:'失業率過高',fields:['unemploymentPct','previousUnemploymentPct'],formula:'u(t) ≥ 10% 且 u(t−1) ≥ 10%'},
  {id:'F06',name:'通貨緊縮',fields:['inflationPct','previousInflationPct'],formula:'π(t) ≤ −2% 且 π(t−1) ≤ −2%'},
  {id:'F07',name:'金融市場崩盤',fields:['stockReturn1Pct','growthPct'],formula:'股市單季 ≤ −25%；景氣 < 0% 才啟動 QE'},
  {id:'F08',name:'銀行流動性危機',fields:['liquidityPct','liquidAssets','shortTermLiabilities'],formula:'流動性 < 10%'},
  {id:'F09',name:'銀行系統性壞帳',fields:['nplPct','nonperformingLoans','totalLoans'],formula:'壞帳率 ≥ 8%'},
  {id:'F10',name:'資產泡沫過熱',fields:['stockReturn3Pct','loanGrowth3Pct','fedRatePct'],formula:'股市三季 ≥ 30% 且放款三季 ≥ 20%'}
];
const FED_PRIORITY=['F08','F09','F07','F03','F01','F06','F04','F02','F05','F10'];
const BOARD = Array.from({length:24},(_,i)=> i===0?{type:'start',label:'出發'}:{type:['global','personal','sector'][(i-1)%3],label:{global:'全球事件',personal:'個人事件',sector:'產業事件'}[['global','personal','sector'][(i-1)%3]]});



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
function staffCurve(x){return Math.max(0,1+STAFF.curveLinear*(x-1)-STAFF.curveQuadratic*(x-1)**2)}
function employedTotal(state){return Object.values(state.companies).reduce((s,c)=>s+c.headcount,0)}
function laborForce(state){return state.laborForce??STAFF.laborForce}
function availableLabor(state){return Math.max(0,Math.floor(laborForce(state))-employedTotal(state))}
function unemploymentPct(state,employed=employedTotal(state)){const lf=laborForce(state);return 100*(lf-employed)/lf}
function wageFactor(unemployment){return 1+STAFF.wageSlope*Math.max(0,STAFF.naturalUnemploymentPct-unemployment)}
function moraleFactor(morale=100){return STAFF.moraleFloor+(1-STAFF.moraleFloor)*clamp(morale,0,100)/100}
function outputFactor(state,roleId,headcount){
  const role=roleById(roleId),c=state.companies[roleId];
  return staffCurve((headcount??c.headcount)/role.baseHeadcount)*moraleFactor(c.morale);
}
function severancePerHead(roleId){const r=roleById(roleId);return round2(Math.abs(r.base.labor)/r.baseHeadcount)}
function layoffCap(state,roleId){return Math.floor(state.companies[roleId].startHeadcount*STAFF.layoffCapRatio)}
function layoffRoom(state,roleId){const c=state.companies[roleId];return Math.max(0,Math.min(c.headcount,layoffCap(state,roleId)-c.layoffsThis))}
function massLayoffTriggered(c,extra=0){
  const laid=c.layoffsThis+extra;
  return laid>0&&laid+c.layoffsPrev>STAFF.massLayoffRatio*(c.prevStartHeadcount||c.startHeadcount);
}

/* ---------- 事件與財報 ---------- */
function isHedged(state,roleId,round=state.round){return inWindow(state.companies[roleId]?.hedgeUntil,round)}
function eventRemaining(active,round){const e=eventById(active.eventId);return e?Math.max(0,e.duration-(round-active.startedRound)):0}
function effectBreakdown(state,roleId,metric,round=state.round){
  const role=roleById(roleId);
  if(!role)return [];
  if(VARIABLE_COST_METRICS.includes(metric)&&isHedged(state,roleId,round))return [];
  return state.activeEvents.flatMap(a=>{
    const e=eventById(a.eventId),age=round-a.startedRound;
    if(!e||age<0||age>=e.duration||!eventAffects(a,role,state))return [];
    return e.effects.filter(f=>f.metric===metric&&hasTarget(f,role)).map(f=>({eventId:e.id,name:e.name,pct:f.pct*e.decay[age],remaining:e.duration-age,scope:a.scope,instanceId:a.instanceId}));
  });
}
function metricPct(state,roleId,metric,round=state.round){return clamp(effectBreakdown(state,roleId,metric,round).reduce((n,x)=>n+x.pct,0),-60,100)}
function assetValue(state,roleId,round=state.round){const c=state.companies[roleId];return round2(c.assetReferenceValue*(1+metricPct(state,roleId,'asset_value',round)/100))}
// 上一季已結算的總體數值決定本季的景氣連動倍率；第 1 季為 1。
function macroFactor(state,roleId,round=state.round){
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
function revenueTransfer(state,roleId,round=state.round){
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
function financials(state,roleId,round=state.round,opts={}){
  const c=state.companies[roleId],flows=baseFlows(state,roleId,round,opts);
  const transfer=revenueTransfer(state,roleId,round);
  flows.revenue=round2(flows.revenue+transfer);
  if(isStruck(state,roleId,round))for(const m of METRICS)if(flows[m]>0)flows[m]=0;
  const revenue=flows.revenue,costs=Object.entries(flows).filter(([m,v])=>m!=='revenue'&&v<0).reduce((s,[,v])=>s+v,0),otherIncome=Object.entries(flows).filter(([m,v])=>m!=='revenue'&&v>0).reduce((s,[,v])=>s+v,0);
  const profit=round2(Object.values(flows).reduce((s,v)=>s+v,0));
  const payout=inWindow(c.equityUntil,round)&&profit>0?round2(profit*SPECIAL.equityShare):0;
  return {flows,revenue,costs:round2(costs),otherIncome:round2(otherIncome),profit,payout,netProfit:round2(profit-payout),transfer,macro:macroFactor(state,roleId,round),assetValue:assetValue(state,roleId,round)};
}
function companyPosition(state,roleId){const c=state.companies[roleId];return {cash:c.cash,assetValue:assetValue(state,roleId),debt:c.debt,netWorth:c.cash+assetValue(state,roleId)-c.debt}}
// 經營預覽：調整 delta 人後，本季結算起每季的淨效果。
function staffPreview(state,roleId,delta){
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

function createGame({players,seed=Date.now(),targetWealth=5500,maxRounds=12}){
  if(!Array.isArray(players)||players.length<2||players.length>8)throw Error('請選擇 2 至 8 位玩家。');
  if(new Set(players.map(p=>p.roleId)).size!==players.length||players.some(p=>!roleById(p.roleId)))throw Error('每位玩家需要不同的企業角色。');
  const names=players.map(p=>String(p.name||'').trim());
  if(names.some(n=>!n)||new Set(names).size!==names.length)throw Error('玩家名稱不得空白或重複。');
  if(players.some(p=>p.bot&&!['low','mid','high'].includes(p.bot.level)))throw Error('Bot 難度無效。');
  const n=Number(seed),goal=Number(targetWealth),limit=Number(maxRounds);
  if(!Number.isInteger(n)||!Number.isFinite(goal)||goal<2000||!Number.isInteger(limit)||limit<2||limit>50)throw Error('種子、目標或回合上限無效。');
  const state={version:1,round:1,turnIndex:0,phase:'roll',rng:n|0||1,seed:n,
    players:players.map((p,i)=>({id:`player-${i+1}`,name:names[i],roleId:p.roleId,bot:p.bot?{level:p.bot.level,...(p.bot.style?{style:p.bot.style}:{})}:null,position:0,color:i,strikeShield:false,moveAdjust:0,stallNext:false})),
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

function customerRivals(state,player){
  const groups=Object.values(CUSTOMER_GROUPS).filter(g=>g.includes(player.roleId));
  return state.players.filter(p=>p.id!==player.id&&groups.some(g=>g.includes(p.roleId)));
}
// 個人事件只從適用於抽卡玩家的卡中抽出。
function eventEligible(state,event,player){
  if(!player)return true;
  if(event.roles&&!event.roles.includes(player.roleId))return false;
  if(event.special==='transfer'&&!customerRivals(state,player).length)return false;
  return true;
}
function drawForTile(state,tile,ownerId,forcedEventId){
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
function movementPath(from,steps,length=BOARD.length){
  if(!Number.isInteger(from)||!Number.isInteger(steps)||!Number.isInteger(length)||from<0||from>=length||steps<0||steps>length||length<2)throw Error('棋盤移動參數無效。');
  return Array.from({length:steps},(_,i)=>(from+i+1)%length);
}
function rollDice(state,forced){
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
function confirmMove(state,playerId,adjust){
  const player=state.players[state.turnIndex];
  if(state.status!=='playing'||state.phase!=='adjust'||player.id!==playerId||!state.pendingRoll)throw Error('現在不需要調整步數。');
  if(![-1,0,1].includes(adjust))throw Error('只能調整 −1、0 或 +1 格。');
  const steps=Math.max(0,state.pendingRoll.dice+adjust);
  player.moveAdjust--;state.moveAdjustUsed=steps-state.pendingRoll.dice;
  return moveBy(state,player,steps,state.pendingRoll.reels);
}
function drawEvent(state,forcedEventId){
  if(state.status!=='playing'||state.phase!=='draw')throw Error('現在不需要抽卡。');
  const player=state.players[state.turnIndex],tile=BOARD[player.position];
  if(!state.dice||tile.type==='start')throw Error('目前停格沒有事件卡。');
  const active=drawForTile(state,tile,player.id,forcedEventId);
  state.phase=active.scope==='personal'&&applyDrawEffect(state,active,player)?'choice':'manage';
  return active;
}
function resolveChoice(state,playerId,value){
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
function adjustStaff(state,playerId,delta){
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
function issueLoan(state,playerId,amount){
  if(state.status!=='playing'||state.phase!=='manage'||state.players[state.turnIndex].id!==playerId)throw Error('只能在自己的經營階段借款。');
  if(!Number.isInteger(amount)||amount<=0||amount>state.bank.liquidAssets||state.bank.riskRestrictionUntil>=state.round)throw Error('借款金額超出銀行流動資產，或目前限制新增風險放款。');
  const c=state.companies[state.players[state.turnIndex].roleId];c.cash+=amount;c.debt+=amount;state.bank.liquidAssets-=amount;state.bank.totalLoans+=amount;state.log.unshift(`${state.players[state.turnIndex].name}借款 ${amount}；現金及負債同步增加。`);
}
function repayLoan(state,playerId,amount){
  if(state.status!=='playing'||state.phase!=='manage'||state.players[state.turnIndex].id!==playerId)throw Error('只能在自己的經營階段還款。');
  const c=state.companies[state.players[state.turnIndex].roleId];
  if(!Number.isInteger(amount)||amount<=0||amount>c.debt||amount>c.cash)throw Error('還款不能超過現金或未償債務。');
  c.cash-=amount;c.debt-=amount;state.bank.liquidAssets+=amount;state.bank.totalLoans-=amount;state.log.unshift(`${state.players[state.turnIndex].name}償還 ${amount} 借款。`);
}
function updateBadLoans(state,playerId,amount){
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
function makeSnapshot(state,round=state.round){
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
function evaluateFed(snapshot,state){
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
function endTurn(state){
  if(state.status!=='playing'||!['manage','strike'].includes(state.phase))throw Error('請先完成本回合。');
  state.ghostTrail=[state.ghostPosition];
  if(state.turnIndex<state.players.length-1){state.turnIndex++;state.phase='roll';state.dice=null;state.reels=null;state.lastDraw=null;state.strikeCause=null;state.moveAdjustUsed=0;return null}
  const result=settleSeason(state);return result;
}
function settleSeason(state){
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
function getEconomicSnapshot(state,round){return state.economicHistory.find(x=>x.round===round)||null}
function getEconomicHistory(state,from=1,to=state.round){return state.economicHistory.filter(x=>x.round>=from&&x.round<=to)}
function getFedRuleEvaluations(state,round){return state.evaluations.find(x=>x.round===round)?.items||null}
function getFedDecision(state,round){return state.decisions.find(x=>x.round===round)||null}
function exportGame(state){return JSON.stringify(state,null,2)}
function importGame(json){const s=JSON.parse(json);if(s.version!==1||!Array.isArray(s.players)||!Array.isArray(s.economicHistory)||!s.companies||!s.bank||!Array.isArray(s.activeEvents))throw Error('存檔格式不正確。');ensureGhostState(s);ensureExtendedState(s);return s}


// 企業版電腦玩家（Bot）。單機版、連線版與 simulate.mjs 共用同一套決策。
// 高：照模擬校準用的「最佳策略」；中：同樣的策略但常失誤；低：開局隨機一種個性。

const BOT_LEVELS={
  low:{label:'低',desc:'幾乎隨機，或只偏好一種做法'},
  mid:{label:'中',desc:'想照最佳策略經營，但常常失誤'},
  high:{label:'高',desc:'幾乎不失誤地執行最佳策略'}
};
const LOW_STYLES={
  random:{label:'隨機派',desc:'所有決定都隨機'},
  aggressive:{label:'擴張派',desc:'能聘就聘、增資照收、拒付贖金'},
  cautious:{label:'保守派',desc:'不聘不裁、能放棄就放棄、贖金照付'}
};
const MID={randomChoice:.3,skipStaff:.35,noise:.5};

function makeBot(level,rng=Math.random){
  if(!BOT_LEVELS[level])return null;
  if(level==='low'){const styles=Object.keys(LOW_STYLES);return {level,style:styles[Math.floor(rng()*styles.length)]}}
  return {level};
}
function botLabel(bot){if(!bot)return '';return `Bot·${BOT_LEVELS[bot.level].label}${bot.style?`（${LOW_STYLES[bot.style].label}）`:''}`}
const pickOne=(rng,items)=>items[Math.floor(rng()*items.length)];

/* ---------- AEO：拉霸後調整 ±1 格，盡量避開罷工幽靈 ---------- */
function botAdjust(s,p,rng=Math.random){
  const dice=s.pendingRoll.dice,opts=[0,1,-1].filter(a=>dice+a>=0);
  const bot=p.bot||{level:'high'};
  if(bot.level==='low'&&bot.style==='random')return pickOne(rng,opts);
  const safe=opts.find(a=>(p.position+dice+a)%BOARD.length!==s.ghostPosition||p.strikeShield);
  return safe??0;
}

/* ---------- 需要選擇的個人事件 ---------- */
// 回傳 resolveChoice 需要的值：玩家 id、'accept'/'decline' 或 'pay'/'refuse'。
function choiceOptions(s,p){
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
function botChoice(s,p,rng=Math.random){
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
function botManageStep(s,p,memo,rng=Math.random){
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


// Revision ordering is shared by every tab; page navigation stays local to each tab.
function syncInfo(game){
  if(!game)return null;
  return game.sync||{
    gameId:`legacy:${game.seed}:${game.players?.map(p=>p.name).join('|')}`,
    revision:0,
    updatedAt:0,
    writerId:''
  };
}

function isNewerGame(incoming,current){
  if(!incoming)return false;
  if(!current)return true;
  const a=syncInfo(incoming),b=syncInfo(current);
  if(a.gameId===b.gameId){
    if(a.revision!==b.revision)return a.revision>b.revision;
    if(a.updatedAt!==b.updatedAt)return a.updatedAt>b.updatedAt;
    return a.writerId>b.writerId;
  }
  if(a.updatedAt!==b.updatedAt)return a.updatedAt>b.updatedAt;
  return a.gameId>b.gameId;
}



const $=s=>document.querySelector(s),h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>Math.round(n).toLocaleString('zh-TW'),decimal=(n,d=1)=>n===null||n===undefined?'—（資料不足）':Number(n).toFixed(d),signed=n=>`${n>=0?'+':'−'}${money(Math.abs(n))}`;
const colors=['#0f9688','#5979b0','#ce9460','#aa6b91','#c55d5d','#7e9541','#348da5','#7a60ad'];
const scopes={global:'全球事件',personal:'個人事件',sector:'產業事件'};
const scopeColor={global:'#cc6d61',personal:'#597bae',sector:'#ca9451'};
const role=id=>ROLES.find(x=>x.id===id),event=id=>ALL_EVENTS.find(x=>x.id===id);
const roleStories={
  auto:'清晨六點，沖壓機的第一聲巨響傳遍廠房，經銷商已打來追問交車日期。你得讓產線不停，還要在原物料、電力和出口費上漲時守住利潤。',
  electronics:'海外客戶催著下一批產品出貨，採購單上的零件報價卻又變了。訂單金額不小，但材料、人力和關稅一項都不能漏算。',
  retail:'捲門一拉開，週末人潮就往百貨湧來。你得讓熱賣商品留在貨架上，同時控制補貨成本，才不會忙了一整天卻賺得很薄。',
  bank:'櫃檯前有人等著貸款，另一邊有人急著提款。利息收入撐起獲利，但每筆壞帳都在考驗銀行手上的現金。',
  investment:'開盤鐘聲一響，螢幕上的報價不停跳動。你盯著持有的資產等待機會，也知道市場一轉向，投資收益和資產價值都可能跟著變。',
  energy:'調度室電話響個不停，工廠和城市都在等你的供應。需求帶來訂單，你還得算清原料、日常營運和借款利息的壓力。',
  logistics:'天還沒亮，車隊已排在倉庫門口，客戶催問貨物何時送到。每趟運送都要用人、用能源；價格一變，這季利潤就跟著晃動。',
  property:'接待中心的燈亮著，買方正等著下一次看屋。成交能帶進營收，但銀行利息和案場營運費每季照樣到期，空等也有代價。',
  agriculture:'第一台貨車開進市場，司機等著你確認這批食品的去向。從原料到運輸都要算進成本，價格稍有變動，這季盈虧就可能改寫。',
  technology:'版本上線倒數，工程師還在修最後一個問題，客戶已打來確認交付時間。人才撐起服務收入，也讓人力成為每季最大的成本。'
};
const manageGuides={
  auto:['交車期限就在眼前，產線每多開一班，薪資和材料也跟著增加。','先看人力與原料成本，再決定要聘僱、裁員或借款周轉。'],
  electronics:['海外訂單催著出貨，零件、關稅與薪資正一項項吃掉利潤。','比較收入與材料成本，調整人手前先確認手上的現金。'],
  retail:['客人湧進店裡，缺貨會失單，備貨太多又會壓住現金。','留意商品和人力成本，再決定是否增員或借款備貨。'],
  bank:['櫃檯忙著放款和提款，每筆壞帳都考驗銀行的資金調度。','留意流動資產與壞帳，必要時認列或收回壞帳。'],
  investment:['開盤數字不停跳動，投資收益與資產價值可能一季內翻轉。','先看投資損益與現金，再決定是否借款度過波動。'],
  energy:['調度室亮到深夜，訂單增加，原料與能源支出也跟著升高。','比較收入與原料、能源成本，再安排人手和資金。'],
  logistics:['車隊等著發車，每趟運送都消耗人力與燃料。','留意能源成本，決定要增員、裁員或借款周轉。'],
  property:['買方還在看屋，利息和案場支出卻已照常到期。','先看現金與利息成本，再謹慎調整人手和借款。'],
  agriculture:['清晨的貨車已出發，原料與運輸漲價會吃掉每箱食品的利潤。','比較銷售與原料、能源成本，再決定人手與周轉。'],
  technology:['產品即將上線，工程師仍在處理最後的問題。','人才是關鍵，也最花錢；聘僱前先看收入與人力成本。']
};
const strikeStories={
  auto:['警報聲壓過沖壓機，整條產線突然停住。交車期限還在倒數，工資、廠房與原料帳單卻一張張送來。','車子一台也交不出去；守住現金，等下一回合重新開線。'],
  electronics:['無塵室外擠滿停工的人，出貨倒數歸零。晶片還鎖在產線裡，海外客戶的電話已經響個不停。','訂單收入歸零，零件、關稅與薪資照付；這回合只能看著貨櫃空等。'],
  retail:['開門前，員工把百貨大門拉下。顧客聚在門外，收銀機整天沒響，租金和備貨款卻準時到期。','沒有一筆成交，商品與人力成本仍在；先撐過這場停業。'],
  bank:['櫃檯一夜之間空了，提款人潮排到街角。放款與利息收入停擺，維持分行運作的費用仍不停流出。','收入歸零，壞帳與營運壓力還在；這回合無法調整放款與人手。'],
  investment:['開盤鐘響，交易室卻只剩閃爍的螢幕。分析師集體離席，機會從眼前滑過，辦公室帳單照常入帳。','投資與交易收入歸零，固定支出繼續扣；下一回合再追市場。'],
  energy:['調度中心的對講機突然沉默，機組停在半途。需求仍在飆升，原料、設備與能源費卻沒有跟著停。','供應收入歸零，原料與維護照付；先把資金撐到下一班。'],
  logistics:['司機把車鑰匙整排放在桌上，貨車堵滿月台。客戶催貨的訊息狂跳，油費、倉租與薪資仍持續累積。','一趟貨也送不出去，運輸成本照算；這回合只能停車等候。'],
  property:['工地吊臂停在半空，銷售中心也熄了燈。買方等著交屋，貸款利息和案場費用卻分秒不停。','成交收入歸零，利息與固定支出照付；等復工再推進案子。'],
  agriculture:['包裝線突然停轉，剛採下的作物堆在冷藏庫門口。通路催著上架，冷鏈和原料費每分鐘都在燒。','食品賣不出去，保存與運輸成本照付；先撐住這批貨。'],
  technology:['上線倒數最後一刻，工程師關上筆電離開。客戶仍盯著進度條，伺服器和人力帳單卻不會暫停。','服務收入歸零，維運與薪資照付；這回合無法再做經營調整。']
};
const storageKey='economy-board-v1';
const viewKey='economy-board-view-v1';
const tabId=globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`;
let channel=null;
try{if('BroadcastChannel' in globalThis)channel=new BroadcastChannel(storageKey)}catch{}
let openPlayerId=null,state=null,page=location.hash==='#setup'?'game':'home',tab='business',snapshotSelection='latest',setupPlayers=[{name:'玩家 1',roleId:'auto',control:'human'},{name:'Bot 1',roleId:'retail',control:'mid'},{name:'Bot 2',roleId:'bank',control:'high'}],toastTimer,resetAt=0;
let animation=null,animationSerial=0;
let dismissedCardKey=null;
// 電腦玩家：速度可調、可暫停；每一步都透過 run() 取得最新狀態並上鎖，多個頁籤也不會重複操作。
const BOT_SPEEDS={slow:{label:'慢',ms:1500},normal:{label:'正常',ms:800},fast:{label:'快',ms:250}};
let botTimer=null,botPaused=false,botSpeed='normal',botMemo={key:null,memo:{}};
try{const v=JSON.parse(localStorage.getItem('economy-board-bot'));if(BOT_SPEEDS[v?.speed])botSpeed=v.speed}catch{}
// 不論走幾格，總移動時間約 2.4 秒；每格介於 150–600ms。
const MOVE_TOTAL_MS=2400,stepMsFor=steps=>Math.max(150,Math.min(600,MOVE_TOTAL_MS/Math.max(1,steps)));
try{const view=JSON.parse(sessionStorage.getItem(viewKey));if(['business','events','dashboard','fed','history'].includes(view?.tab))tab=view.tab;if(typeof view?.snapshotSelection==='string')snapshotSelection=view.snapshotSelection}catch{}
function rememberView(){try{sessionStorage.setItem(viewKey,JSON.stringify({tab,snapshotSelection}))}catch{}}

function notify(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3200)}
function newGameId(){return globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`}
function prepareNewSession(game){const previous=syncInfo(state);game.sync={gameId:newGameId(),revision:0,updatedAt:Math.max(Date.now(),(previous?.updatedAt||0)+1,resetAt+1),writerId:tabId}}
function readStored(){try{const raw=localStorage.getItem(storageKey);return raw?importGame(raw):null}catch{return undefined}}
function cancelAnimation(){animationSerial++;animation=null}
function save(){
  if(!state)return;
  if(!state.sync)prepareNewSession(state);
  state.sync.revision++;
  state.sync.updatedAt=Math.max(Date.now(),state.sync.updatedAt+1);
  state.sync.writerId=tabId;
  try{localStorage.setItem(storageKey,exportGame(state));$('#save-status').textContent='多頁籤已同步'}catch{$('#save-status').textContent=channel?'即時同步中；請匯出備份':'本機儲存不可用，請匯出備份'}
  try{channel?.postMessage({type:'state',writerId:tabId,game:state})}catch{}
}
function clearSave(){
  const updatedAt=Math.max(Date.now(),(syncInfo(state)?.updatedAt||0)+1,resetAt+1);
  resetAt=updatedAt;
  try{localStorage.removeItem(storageKey)}catch{}
  try{channel?.postMessage({type:'reset',updatedAt,writerId:tabId})}catch{}
}
function adoptShared(incoming){
  if(!isNewerGame(incoming,state))return false;
  const previous=state;
  const sameTurn=previous&&syncInfo(previous).gameId===syncInfo(incoming).gameId&&previous.round===incoming.round&&previous.turnIndex===incoming.turnIndex&&Number.isInteger(incoming.dice);
  const moved=['draw','manage','strike','choice'].includes(incoming.phase);
  const sharedRoll=sameTurn&&previous.phase==='roll'&&(moved||incoming.phase==='adjust'),sharedMove=sameTurn&&previous.phase==='adjust'&&moved;
  const from=sharedRoll||sharedMove?previous.players[previous.turnIndex].position:null;
  cancelAnimation();state=incoming;render();
  $('#save-status').textContent='已從其他頁籤同步';
  if(sharedRoll||sharedMove)beginRollAnimation({playerId:incoming.players[incoming.turnIndex].id,from,dice:incoming.dice,reels:incoming.reels,reelsOnly:incoming.phase==='adjust',skipReels:sharedMove});
  return true;
}
function ensureFresh(){
  const stored=readStored();
  if(stored===null&&state){cancelAnimation();state=null;render();notify('其他頁籤已開始新遊戲，畫面已更新。');return false}
  if(stored&&isNewerGame(stored,state)){adoptShared(stored);notify('對局已由其他頁籤更新，請確認目前回合後再操作。');return false}
  return true;
}
async function withGameLock(work){
  if(globalThis.navigator?.locks?.request)return navigator.locks.request(`${storageKey}-write`,{mode:'exclusive'},work);
  return work();
}
async function run(fn){
  if(animation)return;
  try{await withGameLock(()=>{if(!ensureFresh())return;fn();save();render()})}
  catch(e){notify(e.message||'操作失敗')}
}

function effectChips(e,factor=1){return e.effects.map(x=>`<span class="effect-chip">${h(METRIC_LABELS[x.metric])} ${x.pct>=0?'+':''}${decimal(x.pct*factor,factor===1?0:1)}%</span>`).join('')}
function eventSummary(e){const text=e.desc||e.effects.map(x=>`${METRIC_LABELS[x.metric]} ${x.pct>=0?'+':''}${x.pct}%`).join('、');const limits=e.roles?`（適用：${e.roles.map(id=>role(id).name).join('、')}）`:e.special==='transfer'?`（客群：${Object.entries(CUSTOMER_GROUPS).map(([k,v])=>`${CUSTOMER_GROUP_LABELS[k]}＝${v.map(id=>role(id).name).join('、')}`).join('；')}）`:'';return text+limits}
function rollLabel(){if(!state.reels)return `${state.dice}`;const sum=state.reels[0]+state.reels[1],adj=state.dice-sum;return `${state.reels.join(' + ')}${adj?`（AEO ${adj>0?'+':'−'}${Math.abs(adj)}）`:''} = ${state.dice}`}
function homeFlowLabel(metric,value){
  if(metric==='interest')return value>0?'利息收入':'利息支出';
  if(metric==='investment')return value>0?'投資收益':'投資損失';
  if(metric==='export_cost')return '出口貿易費';
  if(metric==='fixed')return '固定營運費';
  return METRIC_LABELS[metric];
}
function renderHomeRoles(){
  $('#home-roles').innerHTML=ROLES.map(r=>{
    const income=METRICS.reduce((sum,m)=>sum+Math.max(0,r.base[m]),0);
    const expense=METRICS.reduce((sum,m)=>sum+Math.max(0,-r.base[m]),0);
    const flowList=positive=>METRICS.filter(m=>positive?r.base[m]>0:r.base[m]<0).map(m=>`<div><dt>${h(homeFlowLabel(m,r.base[m]))}</dt><dd>${money(Math.abs(r.base[m]))}</dd></div>`).join('');
    return `<article class="home-role"><div class="home-role-title"><span class="home-role-icon" aria-hidden="true">${r.icon}</span><div><span class="home-role-sector">${h(r.sector)} · 起始 ${r.baseHeadcount} 人</span><h3>${h(r.name)}</h3></div></div><p class="home-role-story">${h(roleStories[r.id])}</p><p class="home-role-macro"><b>景氣連動</b>${h(MACRO_LABELS[r.id])}</p><div class="home-role-totals"><div><span>基準收入</span><strong>+${money(income)}</strong></div><div><span>基準成本</span><strong>−${money(expense)}</strong></div><div><span>預估淨利</span><strong>${signed(income-expense)}</strong></div></div><div class="home-role-flows"><div><h4>收入來源</h4><dl>${flowList(true)}</dl></div><div><h4>成本與支出</h4><dl>${flowList(false)}</dl></div></div></article>`;
  }).join('');
}
function renderSetup(){
  $('#setup-players').innerHTML=setupPlayers.map((p,i)=>`<div class="setup-player"><span class="player-numeral">${i+1}</span><input data-setup-name="${i}" aria-label="玩家 ${i+1} 名稱" maxlength="16" value="${h(p.name)}"><select data-setup-role="${i}" aria-label="玩家 ${i+1} 企業">${ROLES.map(r=>`<option value="${r.id}" ${r.id===p.roleId?'selected':''}>${h(r.name)}</option>`).join('')}</select><select data-setup-control="${i}" aria-label="玩家 ${i+1} 操作者"><option value="human" ${p.control==='human'?'selected':''}>👤 人類</option>${Object.entries(BOT_LEVELS).map(([k,v])=>`<option value="${k}" ${p.control===k?'selected':''} title="${h(v.desc)}">🤖 Bot·${v.label}</option>`).join('')}</select><button class="remove-player" data-remove-player="${i}" type="button" aria-label="移除玩家 ${i+1}" ${setupPlayers.length<=2?'disabled':''}>×</button></div>`).join('');
  $('#add-player').disabled=setupPlayers.length>=8;
}
function currentPlayer(){return state?.players[state.turnIndex]}
function boardCoords(i){if(i<=6)return [1,i+1];if(i<=12)return [i-5,7];if(i<=18)return [7,19-i];return [25-i,1]}
function sectorForTile(i){const sectors=['製造業','消費業','金融業','能源與運輸','民生業','科技業'];return sectors[((Math.floor((i-3)/3)%6)+6)%6]}
function tileName(tile,i){return tile.type==='sector'?sectorForTile(i):tile.label}
function currentCard(){
  if(state.phase!=='manage'||!state.lastDraw||!state.dice)return null;
  const card=state.lastDraw;
  if(card.startedRound!==state.round||card.ownerId&&card.ownerId!==currentPlayer().id)return null;
  if(event(card.eventId).choice)return null;
  const key=`${state.sync?.gameId||'local'}:${state.round}:${state.turnIndex}:${card.instanceId}`;
  return key===dismissedCardKey?null:{card,key,event:event(card.eventId)};
}
function cardCenter(){
  if(!animation&&state.phase==='draw'){
    const scope=BOARD[currentPlayer().position].type;
    return `<div class="card-scene scope-${scope}"><p class="card-hint">停在${scopes[scope]}格 · 輪到你抽卡</p><button class="draw-deck" type="button" data-action="draw-card" ${currentPlayer().bot?'disabled':''} aria-label="點擊抽${scopes[scope]}卡"><span class="deck-shadow" aria-hidden="true"></span><span class="deck-back"><span>✦</span><strong>${scopes[scope]}</strong><small>點一下抽卡</small></span></button><p class="card-instruction">卡片正在洗牌，點擊卡背翻開結果</p></div>`;
  }
  if(!animation&&state.phase==='choice'&&state.pendingChoice){
    const e=event(state.pendingChoice.eventId);
    return `<div class="card-scene card-reveal" role="status"><p class="card-hint">個人事件 · ${h(e.id)} · 請做出決定</p><div class="revealed-card"><span class="revealed-symbol">✦</span><h3>${h(e.name)}</h3><p class="revealed-desc">${h(e.desc)}</p><div class="revealed-effects">${effectChips(e)}</div></div><div class="choice-row">${choiceButtons(e)}</div></div>`;
  }
  const shown=!animation&&currentCard();
  if(shown){
    const {card,event:e}=shown;
    const target=card.scope==='global'?'所有適用企業':card.scope==='sector'?`${card.sector}所有企業`:'只有抽卡玩家';
    return `<div class="card-scene card-reveal" role="status"><p class="card-hint">${h(scopes[card.scope])} · ${h(e.id)}</p><div class="revealed-card"><span class="revealed-symbol">✦</span><h3>${h(e.name)}</h3><p>影響 ${h(target)} · 持續 ${e.duration} 季</p>${card.fallback?`<p class="revealed-desc">${h(card.fallback)}，這格改抽個人事件。</p>`:''}${e.desc?`<p class="revealed-desc">${h(e.desc)}</p>`:''}<div class="revealed-effects">${effectChips(e)}</div></div>${currentPlayer().bot?'<p class="card-instruction">🤖 Bot 正在看卡…</p>':'<button class="card-continue" type="button" data-action="dismiss-card">繼續經營 →</button>'}</div>`;
  }
  return null;
}
function choiceButtons(e){
  const p=currentPlayer(),btn=(value,label,primary)=>`<button class="card-continue ${primary?'':'ghost'}" type="button" data-action="choose" data-value="${h(value)}" ${p.bot?'disabled':''}>${h(label)}</button>`;
  if(e.choice==='target')return (e.special==='transfer'?customerRivals(state,p):state.players.filter(x=>x.id!==p.id)).map(x=>btn(x.id,`${x.name}（${role(x.roleId).name}）`,true)).join('');
  if(e.special==='equity')return btn('accept',`接受，現金 +${SPECIAL.equityCash}`,true)+btn('decline','放棄');
  if(e.special==='leaseback'){const value=assetValue(state,p.roleId);return (value>0?btn('accept',`出售資產，換得 ${money(value)}`,true):'')+btn('decline','放棄')}
  if(e.choice==='ransom')return btn('pay',`支付贖金 ${SPECIAL.ransomCost}`,true)+btn('refuse','拒付，下回合停擺');
  return '';
}
function effectiveFedNotice(){
  if(animation||state.status!=='playing'||state.phase!=='roll'||state.turnIndex!==0)return null;
  const decision=state.decisions.at(-1);
  return decision&&['rate','program','rescue','restriction'].includes(decision.kind)&&decision.nextEffectiveRound===state.round?decision:null;
}
function fedCenter(decision){
  if(!decision)return null;
  const theme=decision.kind==='rate'?decision.delta>0?'tighten':'ease':decision.kind;
  const icon={tighten:'↗',ease:'↘',program:'✦',rescue:'✚',restriction:'⛨'}[theme];
  const detail=decision.kind==='rate'?`目前政策利率 ${decimal(state.fedRatePercent,2)}%`:decision.kind==='program'?`${state.monetaryProgram?.type||'貨幣政策'} 已啟動`:decision.kind==='rescue'?'銀行流動性支援已生效':'高風險放款限制已生效';
  const headline=`聯準會政策更新　✦　${decision.action}　✦　第 ${state.round} 季生效　✦　`;
  return `<div class="fed-broadcast ${theme}" role="status" aria-live="polite"><div class="fed-broadcast-top"><span class="fed-live-dot"></span><span>FED LIVE · 第 ${state.round} 季</span><span class="fed-live-dot"></span></div><div class="fed-orbit" aria-hidden="true"><span>${icon}</span></div><h3>聯準會政策快報</h3><strong class="fed-action">${h(decision.action)}</strong><div class="fed-marquee" aria-hidden="true"><div class="fed-marquee-track"><span>${h(headline)}</span><span>${h(headline)}</span></div></div><p class="fed-detail">${h(detail)}</p><small>新一季已開始 · 可以啟動拉霸</small></div>`;
}
function manageCenter(){
  if(animation||state.status!=='playing'||state.phase!=='manage'||currentCard())return null;
  const p=currentPlayer(),r=role(p.roleId),[scene,tip]=manageGuides[p.roleId],f=financials(state,p.roleId),c=state.companies[p.roleId];
  return `<div class="manage-scene" role="status" style="--manage-accent:${colors[p.color]}"><div class="manage-label">第 ${state.round} 季 · ${h(p.name)} 的經營時間</div><div class="manage-icon" aria-hidden="true">${r.icon}</div><h3>${h(r.name)}</h3><p class="manage-story">${h(scene)}</p><p class="manage-tip"><strong>本回合怎麼做</strong>${h(tip)}</p><div class="manage-stats"><div><span>預估淨利</span><strong class="${f.netProfit<0?'negative':''}">${signed(f.netProfit)}</strong></div><div><span>目前現金</span><strong>${money(c.cash)}</strong></div></div><small>請在右側調整員工、借貸，完成後交給下一位玩家。</small></div>`;
}
function strikeCenter(){
  if(animation||state.status!=='playing'||state.phase!=='strike')return null;
  const p=currentPlayer(),r=role(p.roleId),[scene]=strikeStories[p.roleId],f=financials(state,p.roleId),ransom=state.strikeCause==='ransomware';
  return `<div class="strike-scene" role="status" aria-live="polite"><span class="strike-siren">${ransom?'資安事件':'罷工警報'} · 第 ${state.round} 季</span><span class="strike-ghost" aria-hidden="true">${ransom?'🔒':'👻'}</span><h3>${h(r.name)}${ransom?'系統停擺':'全面停工'}</h3><p>${ransom?'上一回合拒付贖金，所有系統仍被加密鎖住。訂單無法處理，帳單照樣到期。':h(scene)}</p><div class="strike-effects"><span>本季收入 <strong>0</strong></span><span>支出照付 <strong>${money(-f.costs)}</strong></span></div><small>本回合不能抽事件卡，也不能聘僱、裁員或借貸。</small></div>`;
}
function slotMarkup(values){
  return `<div class="slot-machine" role="group" aria-label="兩個 0 到 6 的拉霸轉輪">${values.map((value,i)=>{
    const position=animation?.reelPositions?.[i]??value;
    const cells=Array.from({length:49},(_,cell)=>`<strong class="slot-cell">${cell%7}</strong>`).join('');
    return `<span class="slot-reel ${animation?.stage==='rolling'&&animation.spinning[i]?'spinning':''}" aria-label="第 ${i+1} 個轉輪：${value}"><span class="slot-strip" style="transform:translateY(-${position*100}%)">${cells}</span></span>`;
  }).join('')}</div>`;
}
function renderBoard(){
  const pos=state.players.map(p=>({p,index:animation?.playerId===p.id?animation.position:p.position}));
  const tiles=BOARD.map((tile,i)=>{
    const [row,col]=boardCoords(i);
    const occupants=pos.filter(x=>x.index===i);
    const tokens=occupants.map(x=>`<span class="token ${animation?.playerId===x.p.id?'moving':''}" title="${h(x.p.name)}" style="background:${colors[x.p.color]}"></span>`).join('');
    return `<div class="tile ${tile.type} ${occupants.length>4?'crowded':''} ${state.ghostPosition===i?'ghost-tile':''} ${animation?.position===i?'tile-active':''} ${animation?.visited.has(i)?'tile-visited':''}" data-tile-index="${i}" style="grid-row:${row};grid-column:${col}" title="${h(tileName(tile,i))}"><span class="tile-number">${String(i).padStart(2,'0')}</span><span class="tile-type">${h(tileName(tile,i))}</span><span class="tile-icon">${tile.type==='global'?'◎':tile.type==='personal'?'◇':tile.type==='sector'?'▦':'↗'}</span><div class="tile-tokens">${tokens}</div></div>`;
  }).join('');
  const legacyRoll=state.dice!==null&&state.reels?.length===3&&!animation;
  const values=animation?.displayReels||(state.reels?.length===2?state.reels:[0,0]);
  const slotDisplay=legacyRoll?`<div class="legacy-roll">舊回合點數<br><strong>${state.reels.join(' + ')} = ${state.dice}</strong></div>`:slotMarkup(values);
  const total=animation?.stage==='rolling'?'數字跳動中…':state.phase==='adjust'&&!animation?`拉出 ${state.dice}，等待 AEO 調整`:state.dice===null?'啟動拉霸前進':state.dice===0?'原地停留':`前進 ${state.dice} 格`;
  const notice=fedCenter(effectiveFedNotice()),card=cardCenter(),manage=manageCenter(),strike=strikeCenter();
  const board=$('#board'),ghost=board.querySelector('.ghost-piece'),oldPosition=ghost?.dataset.position,oldRect=ghost?.getBoundingClientRect();
  ghost?.remove();
  board.innerHTML=tiles+`<div class="board-center ${notice?'fed-live':''} ${manage?'manage-mode':''} ${strike?'strike-mode':''}">${card||notice||manage||strike||`<div class="center-icon">⌁</div><h3>市場正在運轉</h3><p>兩輪拉霸 · 逐格前進 · 每季結算</p>${slotDisplay}<div class="slot-total">${total}</div><small>${animation?.stage==='rolling'?'兩個數字依序停下':animation?.stage==='result'?'結果已出現，稍後開始移動':state.dice===0?'本次停留原地，不抽事件卡':animation?.stage==='moving'?'棋子逐格前進':'經過起點可獲得 250 遊戲幣'}</small>`}</div>`;
  const piece=ghost||document.createElement('span');
  if(!ghost){piece.className='ghost-piece';piece.innerHTML='<span aria-hidden="true">👻</span>';piece.setAttribute('role','img')}
  piece.dataset.position=String(state.ghostPosition);
  piece.setAttribute('aria-label',`罷工幽靈位於第 ${state.ghostPosition} 格`);
  board.appendChild(piece);
  const tile=board.querySelector(`[data-tile-index="${state.ghostPosition}"]`),tileRect=tile.getBoundingClientRect(),boardRect=board.getBoundingClientRect();
  piece.style.left=`${tileRect.left-boardRect.left+tileRect.width*.72}px`;
  piece.style.top=`${tileRect.top-boardRect.top+tileRect.height*.38}px`;
  if(oldRect?.width&&boardRect.width&&oldPosition!==piece.dataset.position&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
    const trail=state.ghostTrail?.[0]===Number(oldPosition)&&state.ghostTrail.at(-1)===state.ghostPosition?state.ghostTrail:null;
    const frames=trail?.map((position,i)=>{
      const r=board.querySelector(`[data-tile-index="${position}"]`).getBoundingClientRect();
      const dx=r.left-tileRect.left+(r.width-tileRect.width)*.72,dy=r.top-tileRect.top+(r.height-tileRect.height)*.38;
      return {transform:`translate(${dx}px,${dy}px) translate(-50%,-50%)`,offset:i/(trail.length-1)};
    })||[{transform:`translate(${oldRect.left-piece.getBoundingClientRect().left}px,${oldRect.top-piece.getBoundingClientRect().top}px) translate(-50%,-50%)`},{transform:'translate(-50%,-50%)'}];
    piece.animate(frames,{duration:trail?(trail.length-1)*360:850,easing:'ease-in-out'});
  }
}
function actionRow(id,buttons,min=1){return `<div class="action-row"><input id="${id}" type="number" min="${min}" step="1" value="${id==='staff-count'?10:100}" aria-label="${id==='staff-count'?'人數':'金額'}">${buttons.map(([label,action])=>`<button type="button" data-action="${action}">${label}</button>`).join('')}</div>`}
function staffPreviewHtml(roleId,n){
  if(!Number.isInteger(n)||n<=0)return '<span class="muted-line">輸入人數即可預覽效果。</span>';
  const line=(label,pv)=>{
    if(!pv)return `<div class="staff-preview-line disabled"><b>${label}</b><span>超出可調整範圍</span></div>`;
    const parts=[pv.severance?`資遣費 −${money(pv.severance)}（本季一次）`:'',`人力成本 ${signed(pv.labor)}`,`產值與原料 ${signed(pv.output)}`];
    const verdict=`<strong class="${pv.net>=0?'positive':'negative'}">每季淨效果 ${signed(pv.net)}</strong>`;
    const extra=[pv.payback?`約 ${pv.payback} 季回收資遣費`:'',pv.moraleHit?`⚠ 士氣 −${pv.moraleHit}`:'',`規模 ${pv.scale.toFixed(2)} 倍`].filter(Boolean).join(' · ');
    return `<div class="staff-preview-line"><b>${label}</b>${verdict}<span>${parts.filter(Boolean).join(' · ')}</span><small>${extra}</small></div>`;
  };
  const room=layoffRoom(state,roleId),pool=availableLabor(state);
  return line(`聘僱 ${n} 人`,n<=pool?staffPreview(state,roleId,n):null)+line(`裁員 ${n} 人`,n<=room?staffPreview(state,roleId,-n):null);
}
function renderStaffPreview(){const el=$('#staff-preview'),p=currentPlayer();if(!el||!p)return;el.innerHTML=staffPreviewHtml(p.roleId,Number($('#staff-count')?.value))}
function renderTurn(){
  const p=currentPlayer(),r=role(p.roleId),done=state.phase==='manage',finished=state.status!=='playing';
  const head=`<h2 class="turn-name" style="color:${colors[p.color]}">${h(p.name)}</h2><p class="turn-role">${h(r.name)} · ${h(r.sector)}</p>`;
  if(animation){$('#turn-content').innerHTML=`${head}<div class="turn-steps"><span class="done"></span><span class="done"></span><span></span></div><p class="turn-meta">${animation.stage==='rolling'?'兩個數字正在跳動…':animation.stage==='result'?'結果已停定，稍後開始移動。':animation.dice===0?'本次停留原地。':`前進 ${animation.dice} 格。`}</p><button class="primary" disabled>請稍候…</button>`;return}
  if(finished){
    const winners=state.players.filter(x=>state.winnerIds.includes(x.id)).map(x=>x.name).join('、');
    const cause=state.status==='bankruptcy'?'有玩家破產':state.status==='goal'?'有人達成淨資產目標':'到達季數上限';
    $('#turn-content').innerHTML=`<h2 class="turn-name">對局結束</h2><p class="turn-role">${cause}</p><p class="turn-meta">勝出：<strong>${h(winners||'無')}</strong></p><button class="secondary" data-action="new-game">再玩一局</button>`;
    return;
  }
  if(p.bot){$('#turn-content').innerHTML=`${head}<div class="bot-status"><span class="bot-dot"></span>🤖 ${h(botLabel(p.bot))}${botPaused?' · 已暫停':` · ${botPhaseText()}`}</div><p class="turn-meta">${h(p.bot.style?LOW_STYLES[p.bot.style].desc:BOT_LEVELS[p.bot.level].desc)}。</p><p class="turn-meta bot-last">${h(state.log[0]||'')}</p>${botControls()}`;return}
  if(state.phase==='strike'){
    const [,tip]=strikeStories[p.roleId],f=financials(state,p.roleId),ransom=state.strikeCause==='ransomware';
    $('#turn-content').innerHTML=`<h2 class="turn-name strike-turn-name">${h(p.name)} ${ransom?'系統停擺':'遇上罷工'}</h2><p class="turn-role">${h(r.name)} · ${h(r.sector)}</p><div class="turn-steps"><span class="done"></span><span class="done"></span><span></span></div><p class="turn-meta">${ransom?'上一回合拒付勒索軟體贖金，本回合無法拉霸與經營。':(p.position===(state.ghostPosition)&&state.log[0]?.includes('剩餘步數作廢')?`勞資談判破裂，走到第 ${p.position} 格時被幽靈攔下，剩餘步數作廢。`:`停在第 ${p.position} 格，正好是罷工幽靈所在的位置。`)}</p><p class="turn-meta strike-turn-copy">${h(ransom?'先守住現金，下一回合系統就會恢復。':tip)}</p><div class="strike-turn-effect"><strong>收入歸零</strong><span>本季支出仍有 ${money(-f.costs)} 遊戲幣</span></div><p class="turn-meta">這回合不能抽事件卡，也無法聘僱、裁員或借貸。</p><button class="primary" data-action="end-turn">${state.turnIndex===state.players.length-1?'停工結算本季 →':'停工，交給下一位 →'}</button>`;
    return;
  }
  if(state.phase==='adjust'){
    const dice=state.pendingRoll.dice,opt=d=>{const steps=Math.max(0,dice+d);return `<button type="button" data-action="move-adjust" data-value="${d}" ${dice+d<0?'disabled':''}><b>${d>0?'+1':d<0?'−1':'±0'}</b><small>${steps} 格 · 第 ${(p.position+steps)%BOARD.length} 格</small></button>`};
    $('#turn-content').innerHTML=`${head}<div class="turn-steps"><span class="done"></span><span></span><span></span></div><p class="turn-meta">拉出 <strong>${state.reels.join(' + ')} = ${dice}</strong>。AEO 認證生效（剩 ${p.moveAdjust} 次），請選擇實際前進格數。罷工幽靈在第 ${state.ghostPosition} 格。</p><div class="adjust-row">${[-1,0,1].map(opt).join('')}</div>`;
    return;
  }
  if(state.phase==='choice'){
    $('#turn-content').innerHTML=`${head}<div class="turn-steps"><span class="done"></span><span class="done"></span><span></span></div><p class="turn-meta">抽到「${h(event(state.pendingChoice.eventId).name)}」。請在棋盤中央的卡片上做出決定，之後才能經營。</p>`;
    return;
  }
  if(state.phase==='draw'||currentCard()){
    const waiting=state.phase==='draw';
    $('#turn-content').innerHTML=`${head}<div class="turn-steps"><span class="done"></span><span class="done"></span><span></span></div><p class="turn-meta">拉出 <strong>${rollLabel()}</strong>，停在「${h(tileName(BOARD[p.position],p.position))}」。${waiting?'請點棋盤中央流動的卡片，親手抽出事件。':'事件已翻開。看完卡片後，按「繼續經營」。'}</p>`;
    return;
  }
  if(!done){$('#turn-content').innerHTML=`${head}<div class="turn-steps"><span class="done"></span><span></span><span></span></div><p class="turn-meta">輪到你啟動拉霸。兩個轉輪各顯示 0–6，相加就是前進格數。${p.moveAdjust?`AEO 認證：停定後可調整 ±1 格（剩 ${p.moveAdjust} 次）。`:''}</p><button class="primary" data-action="roll">啟動拉霸　▦</button>`;return}
  const c=state.companies[p.roleId],room=layoffRoom(state,p.roleId),pool=availableLabor(state);
  const staffBlock=`<div class="action-block"><h4>員工調整 · 目前 ${c.headcount} 人（基準 ${r.baseHeadcount}，峰值 ${r.baseHeadcount*2}）</h4><div class="staff-meta"><span>士氣 <b class="${c.morale<STAFF.attritionMorale?'negative':''}">${c.morale}</b></span><span>本季可裁 <b>${room}</b></span><span>市場可聘 <b>${pool}</b></span><span>資遣費 <b>${severancePerHead(p.roleId).toFixed(2)}</b>／人</span></div><p>人數越接近 2 倍基準，新員工帶來的產值越少，超過後反而下降。單季最多裁季初人數的 1/3；兩季累計裁員超過 20% 會打擊士氣。</p>${actionRow('staff-count',[['聘僱','hire'],['裁員','layoff']])}<div id="staff-preview" class="staff-preview">${staffPreviewHtml(p.roleId,10)}</div></div>`;
  $('#turn-content').innerHTML=`${head}<div class="turn-steps"><span class="done"></span><span class="done"></span><span></span></div><p class="turn-meta">拉出 <strong>${state.reels?rollLabel():'舊回合'}</strong>，停在「${h(tileName(BOARD[p.position],p.position))}」。${state.dice===0?'本次原地停留，不抽事件卡。':'完成經營後交給下一位玩家。'}</p>${staffBlock}<div class="action-block"><h4>銀行借貸 · 未償 ${money(c.debt)}</h4><p>借款增加現金與負債，不計入收入。銀行流動資產 ${money(state.bank.liquidAssets)}。</p>${actionRow('loan-amount',[['借款','loan'],['還款','repay']])}</div>${p.roleId==='bank'?`<div class="action-block"><h4>銀行壞帳</h4><p>目前不良放款 ${money(state.bank.nonperformingLoans)}。</p>${actionRow('bad-amount',[['認列','mark-bad'],['收回','recover-bad']])}</div>`:''}<button class="secondary" style="margin-top:18px" data-action="end-turn">${state.turnIndex===state.players.length-1?'結算本季 →':'交給下一位 →'}</button>`;
}
function botPhaseText(){if(animation)return '移動中';return {roll:'準備拉霸',adjust:'調整步數',draw:'準備抽卡',choice:'考慮中',manage:'經營中',strike:'停工中'}[state.phase]||'思考中'}
function botControls(){return `<div class="bot-controls"><button type="button" data-action="bot-pause" class="${botPaused?'on':''}">${botPaused?'▶ 繼續':'⏸ 暫停'} Bot</button><div class="bot-speed" role="group" aria-label="Bot 速度">${Object.entries(BOT_SPEEDS).map(([k,v])=>`<button type="button" data-action="bot-speed" data-value="${k}" class="${botSpeed===k?'on':''}">${v.label}</button>`).join('')}</div></div>`}
function activeForPlayer(a,p){return a.scope==='global'||a.scope==='personal'&&(a.ownerId===p.id||a.partnerId===p.id||a.targetId===p.id)||a.scope==='sector'&&a.sector===role(p.roleId).sector}
function effectTextForActive(a,roleId){
  const items=METRICS.concat('asset_value').filter(m=>m==='asset_value'||role(roleId).base[m]!==0).flatMap(m=>effectBreakdown(state,roleId,m).filter(x=>x.instanceId===a.instanceId).map(x=>`${METRIC_LABELS[m]} ${x.pct>=0?'+':''}${decimal(x.pct,1)}%`));
  if(a.eventId==='P14'&&a.targetId)return a.ownerId===state.players.find(p=>p.roleId===roleId)?.id?'取得對方營收 10%':'營收的 10% 轉給對手';
  if(!items.length&&event(a.eventId).desc)return event(a.eventId).desc;
  return items.length?items.join(' · '):'本企業無直接數值影響';
}
function playerBadges(p){
  const c=state.companies[p.roleId],m=financials(state,p.roleId).macro,items=[`<span class="badge ${c.morale<STAFF.attritionMorale?'warn':''}">士氣 ${c.morale}</span>`,`<span class="badge ${m>1.005?'good':m<.995?'warn':''}" title="${h(MACRO_LABELS[p.roleId])}">景氣 ×${m.toFixed(2)}</span>`];
  if(p.bot)items.unshift(`<span class="badge bot">🤖 ${h(botLabel(p.bot))}</span>`);
  if(p.strikeShield)items.push('<span class="badge good">🛡 團體協約</span>');
  if(p.moveAdjust)items.push(`<span class="badge good">AEO ±1 · ${p.moveAdjust} 次</span>`);
  if(c.hedgeUntil&&state.round<=c.hedgeUntil)items.push(`<span class="badge good">避險至第 ${c.hedgeUntil} 季</span>`);
  if(c.leaseUntil&&state.round<=c.leaseUntil)items.push(`<span class="badge">租回至第 ${c.leaseUntil} 季</span>`);
  if(c.equityUntil&&state.round<=c.equityUntil)items.push(`<span class="badge">增資分配至第 ${c.equityUntil} 季</span>`);
  if(p.stallNext)items.push('<span class="badge warn">🔒 下回合停擺</span>');
  if(state.ghostPinnedBy===p.id)items.push('<span class="badge warn">👻 幽靈守在前方</span>');
  return `<div class="player-badges">${items.join('')}</div>`;
}
// 目前玩家的完整卡片放在回合面板下方；其他玩家縮成頭像列，點一下展開細節。
function playerCard(p,extra=''){
  const r=role(p.roleId),f=financials(state,p.roleId),pos=companyPosition(state,p.roleId),c=state.companies[p.roleId];
  const events=state.activeEvents.filter(a=>activeForPlayer(a,p)&&eventRemaining(a,state.round)>0);
  const playerIndex=state.players.indexOf(p);
  const turnState=(state.status==='playing'&&playerIndex===state.turnIndex?'current':'')+(extra?` ${extra}`:'');
  return `<article class="player-card ${turnState}" style="--player-color:${colors[p.color]}"><div class="player-card-head"><div class="player-identity"><span class="role-icon">${r.icon}</span><div><h3>${h(p.name)}</h3><small>${h(r.name)} · ${h(r.sector)}</small></div></div><span class="position-label">第 ${p.position} 格</span></div><div class="wealth-line"><span>目前淨資產</span><strong>${signed(pos.netWorth)}</strong></div>${playerBadges(p)}<div class="finance-grid"><div class="finance-stat positive"><span>本季收入</span><strong>${signed(f.revenue+f.otherIncome)}</strong></div><div class="finance-stat negative"><span>本季成本</span><strong>${signed(f.costs)}</strong></div><div class="finance-stat ${f.netProfit>=0?'positive':'negative'}"><span>預估淨利</span><strong>${signed(f.netProfit)}</strong></div><div class="finance-stat"><span>現金</span><strong>${money(c.cash)}</strong></div><div class="finance-stat"><span>投資資產</span><strong>${money(pos.assetValue)}</strong></div><div class="finance-stat"><span>借款／員工</span><strong>${money(c.debt)} / ${c.headcount}</strong></div></div><div class="event-impact"><div class="event-impact-head"><span>作用中的事件與影響</span><span>${events.length} 張</span></div>${events.length?events.map(a=>`<div class="effect-entry"><i class="dot scope-dot ${a.scope}"></i><span><b>${h(event(a.eventId).name)}</b> · 剩 ${eventRemaining(a,state.round)} 季<br><em>${h(effectTextForActive(a,p.roleId))}</em></span></div>`).join(''):'<span class="no-events">目前沒有適用的事件</span>'}</div><details class="finance-details"><summary>查看十項收支與事件後數值</summary><table class="flow-table"><tbody>${METRICS.map(m=>`<tr><td>${METRIC_LABELS[m]}${m==='revenue'&&f.transfer?`（含客戶轉單 ${signed(f.transfer)}）`:''}</td><td>${signed(f.flows[m])}</td></tr>`).join('')}${f.payout?`<tr><td>新股東分配（25%）</td><td>${signed(-f.payout)}</td></tr>`:''}</tbody></table></details></article>`;
}
function renderPlayers(){
  const cur=state.status==='playing'?state.players[state.turnIndex]:null;
  if(openPlayerId&&(!state.players.some(p=>p.id===openPlayerId)||openPlayerId===cur?.id))openPlayerId=null;
  $('#current-player').innerHTML=cur?playerCard(cur):'';
  const chips=state.players.map(p=>{
    const r=role(p.roleId),wealth=companyPosition(state,p.roleId).netWorth,prog=Math.max(0,Math.min(100,Math.round(wealth/state.targetWealth*100))),isCur=p.id===cur?.id,isOpen=p.id===openPlayerId,win=state.winnerIds?.includes(p.id);
    return `<button type="button" class="player-chip ${isCur?'current':''} ${isOpen?'open':''}" data-player-chip="${p.id}" style="--player-color:${colors[p.color]};--prog:${prog}" aria-pressed="${isOpen}" ${isCur?'disabled':''} title="${isCur?'目前玩家，細節在右側':'點一下查看細節'}"><span class="chip-avatar"><span>${r.icon}</span></span><span class="chip-text"><b>${h(p.name)}${win?' 🏆':''}</b><small>${h(r.name)} · 淨資產 ${money(wealth)}</small><i class="chip-track"><i style="width:${prog}%"></i></i></span>${isCur?'<span class="chip-now">輪到</span>':''}</button>`;
  }).join('');
  const open=state.players.find(p=>p.id===openPlayerId);
  $('#player-cards').innerHTML=`<div class="player-strip" role="group" aria-label="其他玩家">${chips}</div>${open?`<div class="player-detail">${playerCard(open,'detail')}</div>`:''}`;
}
function renderMini(){const s=makeSnapshot(state);const fields=[['預估通膨',`${decimal(s.inflationPct,2)}%`],['預估成長',s.growthPct===null?'資料不足':`${decimal(s.growthPct,1)}%`],['失業率',`${decimal(s.unemploymentPct,1)}%`],['政策利率',`${decimal(s.fedRatePct,2)}%`]];$('#mini-economy').innerHTML=fields.map(([label,value])=>`<div class="mini-stat"><span>${label}</span><strong>${value}</strong></div>`).join('')}
function renderGoals(){
  $('#goal-copy').textContent=`淨資產達 ${money(state.targetWealth)}、任一玩家破產，或第 ${state.maxRounds} 季結束。`;
  $('#goal-progress').innerHTML=state.players.map(p=>{const wealth=companyPosition(state,p.roleId).netWorth;return `<div class="goal-person"><span>${h(p.name)}</span><span>${money(wealth)} / ${money(state.targetWealth)}</span></div><div class="goal-track"><i style="width:${Math.max(0,Math.min(100,wealth/state.targetWealth*100))}%"></i></div>`}).join('');
}
function extraTargetText(a){const name=id=>state.players.find(p=>p.id===id)?.name;if(a.partnerId)return `<p>聯盟對象：${h(name(a.partnerId))}</p>`;if(a.targetId)return `<p>轉單對象：${h(name(a.targetId))}</p>`;return ''}
function renderEvents(){
  $('#active-events').innerHTML=state.activeEvents.length?state.activeEvents.map(a=>{
    const e=event(a.eventId),remaining=eventRemaining(a,state.round),age=state.round-a.startedRound;
    const target=a.scope==='global'?'全市場適用企業':a.scope==='personal'?`${state.players.find(p=>p.id===a.ownerId)?.name||'玩家'}本人`:`${a.sector}企業`;
    return `<article class="event-card" style="--event-color:${scopeColor[a.scope]}"><div class="event-head"><span class="eyebrow">${e.id} · ${scopes[a.scope]}</span><span class="remaining">剩 ${remaining} 季</span></div><h3>${h(e.name)}</h3><p>${h(target)} · 本季倍率 ${decimal(e.decay[age]*100,1)}%</p>${e.desc?`<p>${h(e.desc)}</p>`:''}${extraTargetText(a)}<div class="effect-list">${effectChips(e,e.decay[age])}</div></article>`;
  }).join(''):'<div class="empty-state">目前沒有作用中的事件。啟動拉霸並停在事件格即可抽卡。</div>';
  $('#event-library').innerHTML=[['全球事件',GLOBAL_EVENTS],['個人事件',PERSONAL_EVENTS],['產業事件',SECTOR_EVENTS]].flatMap(([category,items])=>items.map(e=>`<div class="library-item"><div><strong>${e.id} · ${h(e.name)}</strong><p>${category}${e.sector?` · ${h(e.sector)}`:''} · ${h(eventSummary(e))}</p></div><span>${e.duration} 季</span></div>`)).join('');
}

const dashboardGroups=[
  {title:'A · 景氣、物價與就業',items:[
    ['inflationPct','本季通膨率','%','2 + 0.08×能源漲幅 + 0.06×原料漲幅'],['previousInflationPct','上季通膨率','%','上一季快照'],['energyChangePct','全市場能源成本漲幅','%','Σ本季能源成本 / Σ基準能源成本 − 1'],['materialChangePct','全市場原物料成本漲幅','%','Σ本季原物料成本 / Σ基準原物料成本 − 1'],['revenueTotal','本季營收總額','幣','Σ企業調整後營收'],['previousRevenueTotal','上季營收總額','幣','上一季快照'],['growthPct','本季營收成長率','%','本季營收 / 上季營收 − 1'],['previousGrowthPct','上季營收成長率','%','上一季快照'],['laborForce','勞動人口','人','初始 1,000，每季成長 2%'],['wageFactor','薪資係數','倍','1 + 0.03 × max(0, 5 − 失業率)'],['employed','就業人口','人','Σ企業員工人數'],['unemployed','失業人口','人','勞動人口 − 就業人口'],['unemploymentPct','本季失業率','%','失業人口 / 勞動人口'],['previousUnemploymentPct','上季失業率','%','上一季快照']]},
  {title:'B · 股市與信貸',items:[
    ['stockIndex','本季股市指數','點','100 × (1 + 全球市場事件與 QE/QT 衝擊)'],['previousStockIndex','上季股市指數','點','上一季快照；第 0 季基準 100'],['stockIndex3Ago','三季前股市指數','點','第 t−3 季快照'],['stockReturn1Pct','單季股市變化','%','本季指數 / 上季指數 − 1'],['stockReturn3Pct','三季股市變化','%','本季指數 / 三季前指數 − 1'],['totalLoans','本季總放款','幣','銀行放款存量'],['totalLoans3Ago','三季前總放款','幣','第 t−3 季快照'],['loanGrowth3Pct','三季放款成長','%','本季放款 / 三季前放款 − 1']]},
  {title:'C · 銀行風險',items:[
    ['liquidAssets','流動資產','幣','銀行流動資產存量'],['shortTermLiabilities','短期負債','幣','銀行短期負債存量'],['liquidityPct','流動性比率','%','流動資產 / 短期負債'],['nonperformingLoans','不良放款','幣','銀行壞帳存量'],['nplPct','不良放款率','%','不良放款 / 總放款']]},
  {title:'D · 聯準會政策',items:[
    ['fedRatePct','本季政策利率','%','基準 4%，政策變動為持久狀態'],['rateCooldownRounds','利率冷卻剩餘','季','利率決策後 t+1、t+2 季冷卻'],['monetaryProgram','QE / QT 狀態','','兩季估值與利息效果'],['monetaryProgramRoundsLeft','QE / QT 剩餘','季','方案生效兩季']]}
];
function selectedSnapshot(){if(snapshotSelection==='preview'||!state.economicHistory.length)return {snapshot:makeSnapshot(state),preview:true};const n=snapshotSelection==='latest'?state.economicHistory.at(-1).round:Number(snapshotSelection);return {snapshot:getEconomicSnapshot(state,n)||state.economicHistory.at(-1),preview:false}}
function metricValue(s,key,unit){const value=s[key];if(key==='monetaryProgram')return `<strong>${value||'無'}</strong>`;if(value===null||value===undefined)return '<strong class="missing">—（資料不足）</strong>';const d=unit==='%'||unit==='倍'?2:unit==='點'?1:0;return `<strong>${Number(value).toLocaleString('zh-TW',{minimumFractionDigits:d,maximumFractionDigits:d})}${unit?` <small>${unit}</small>`:''}</strong>`}
function renderDashboard(){
  const options=[`<option value="preview">第 ${state.round} 季 · 目前預估</option>`,...state.economicHistory.slice().reverse().map(s=>`<option value="${s.round}">第 ${s.round} 季 · 已結算</option>`)];
  $('#snapshot-select').innerHTML=options.join('');
  $('#snapshot-select').value=snapshotSelection==='latest'&&state.economicHistory.length?String(state.economicHistory.at(-1).round):snapshotSelection;
  if(!$('#snapshot-select').value){snapshotSelection='latest';$('#snapshot-select').value=state.economicHistory.length?String(state.economicHistory.at(-1).round):'preview'}
  const {snapshot:s,preview}=selectedSnapshot();
  const dateLabel=`第 ${s.round} 季${preview?' · 尚未結算的預估':' · 已結算快照'}`;
  $('#dashboard-body').innerHTML=`<div class="dashboard-banner">${dateLabel}｜${preview?'本季抽卡與經營調整會立即更新預估；聯準會只讀取結算後保存的快照。':'以下數值與 F01–F10 判斷來自同一份已儲存快照。'} 缺少歷史值時顯示「資料不足」。</div>${dashboardGroups.map(g=>`<section class="dashboard-section"><h3>${g.title}</h3><div class="metric-grid">${g.items.map(([key,name,unit,formula])=>`<article class="metric-card"><span class="metric-name">${name}</span>${metricValue(s,key,unit)}<small>來源：${dateLabel} · ${s[key]===null&&key!=='monetaryProgram'?'資料不足':preview?'預估':'已結算'}</small><div class="formula">${formula}</div></article>`).join('')}</div></section>`).join('')}<section class="dashboard-section"><h3>D · 十條規則雷達</h3>${preview?'<div class="empty-state">本季規則會在所有玩家完成行動後評估。</div>':renderRuleList(getFedRuleEvaluations(state,s.round))}</section>`;
}
const statusNames={selected:'已採用',matched:'符合',not_matched:'未符合',insufficient_data:'資料不足',suppressed_by_priority:'優先序覆蓋',rate_cooldown:'利率冷卻'};
function renderRuleList(items){if(!items)return '<div class="empty-state">尚無規則評估。</div>';return `<div class="rule-list">${FED_RULES.map(r=>{const x=items.find(e=>e.ruleId===r.id);return `<article class="rule-card"><div class="rule-top"><h3>${r.id} · ${r.name}</h3><span class="status-pill ${x.status}">${statusNames[x.status]}</span></div><p>${x.comparisons.map(h).join('<br>')}</p><p>${h(x.reason||r.formula)}</p><code>欄位：${r.fields.join('、')}</code></article>`}).join('')}</div>`}
function renderFed(){
  const latest=state.economicHistory.at(-1);
  if(!latest){$('#fed-body').innerHTML='<div class="empty-state">第 1 季結算後，這裡會列出十條規則的比較數值、優先序及政策決策。</div>';return}
  const decision=getFedDecision(state,latest.round),evals=getFedRuleEvaluations(state,latest.round);
  const rulesOpen=$('#fed-rules')?.open;
  $('#fed-body').innerHTML=`<div class="fed-hero"><div><span>第 ${latest.round} 季已生效利率</span><strong>${decimal(latest.fedRatePct,2)}%</strong></div><div><span>候選／採用規則</span><strong>${decision.ruleId||'無'}</strong></div><div><span>本季政策結論</span><strong>${h(decision.action)}</strong></div><div><span>生效季數／冷卻</span><strong>第 ${decision.nextEffectiveRound} 季 · ${latest.rateCooldownRounds} 季</strong></div></div><details id="fed-rules" class="disclosure-panel" ${rulesOpen?'open':''}><summary><span><small>RULE EVALUATION</small><strong>規則判斷</strong><em>優先序：F08 → F09 → F07 → F03 → F01 → F06 → F04 → F02 → F05 → F10</em></span><i aria-hidden="true">⌄</i></summary><div class="disclosure-content">${renderRuleList(evals)}</div></details>`;
}
function chart(data,key,title,color){if(!data.length)return `<div class="empty-state">${title}：等待第一季結算。</div>`;const values=data.map(x=>x[key]).filter(Number.isFinite),min=Math.min(...values),max=Math.max(...values),span=max-min||1;const points=data.map((s,i)=>`${35+(i/(Math.max(data.length-1,1)))*660},${165-((s[key]-min)/span)*125}`).join(' ');return `<div class="history-chart"><h3>${title}</h3><svg viewBox="0 0 730 190" role="img" aria-label="${title}歷史折線圖"><line x1="30" y1="165" x2="700" y2="165" stroke="#dfe8e3"/><polyline points="${points}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${data.map((s,i)=>{const x=35+(i/Math.max(data.length-1,1))*660,y=165-((s[key]-min)/span)*125;return `<circle cx="${x}" cy="${y}" r="4" fill="${color}"><title>第 ${s.round} 季：${decimal(s[key],1)}</title></circle><text x="${x}" y="185" text-anchor="middle" font-size="10" fill="#899b93">${s.round}</text>`}).join('')}</svg><div class="chart-legend"><span><i style="background:${color}"></i>${title} · 依已結算快照</span></div></div>`}
function renderHistory(){const data=state.economicHistory;$('#history-body').innerHTML=`<div class="history-layout"><div>${chart(data,'revenueTotal','全市場營收', '#0e9186')}${chart(data,'stockIndex','股市指數', '#597bae')}</div><div><div class="history-chart"><h3>各季數據</h3>${data.length?`<div style="overflow:auto"><table class="history-table"><thead><tr><th>季數</th><th>通膨</th><th>成長</th><th>失業</th><th>利率</th></tr></thead><tbody>${data.slice().reverse().map(s=>`<tr><td>${s.round}</td><td>${decimal(s.inflationPct,1)}%</td><td>${s.growthPct===null?'—':decimal(s.growthPct,1)+'%'}</td><td>${decimal(s.unemploymentPct,1)}%</td><td>${decimal(s.fedRatePct,2)}%</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">尚無已結算季數。</p>'}</div><div class="history-chart"><h3>遊戲動態</h3><div class="log-list">${state.log.length?state.log.slice(0,60).map(x=>`<div class="log-item">${h(x)}</div>`).join(''):'<div class="log-item">等待玩家啟動拉霸。</div>'}</div></div></div></div>`}
function render(){
  const onHome=page==='home';
  $('#round-badge').hidden=onHome||!state;
  $('#home').hidden=!onHome;
  $('#home-btn').classList.toggle('active',onHome);
  if(onHome){
    $('#setup').hidden=true;$('#game').hidden=true;
    $('#home-play-btn').textContent=state?'返回對局 →':'設定玩家，開始遊戲 →';
    $('#home-status').textContent=state?`已有對局 · 第 ${state.round} 季，返回後可繼續遊玩。`:'一台電腦就能開始，大家輪流操作。';
    return;
  }
  if(!state){$('#setup').hidden=false;$('#game').hidden=true;renderSetup();soundWatch();return}
  $('#setup').hidden=true;$('#game').hidden=false;
  $('#round-number').textContent=String(state.round).padStart(2,'0');$('#round-limit').textContent=`／${state.maxRounds} 季`;
  document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));document.querySelectorAll('.tab-page').forEach(p=>p.classList.toggle('active',p.id===`tab-${tab}`));
  renderBoard();renderTurn();renderMini();renderGoals();renderPlayers();renderEvents();renderDashboard();renderFed();renderHistory();
  scheduleBot();soundWatch();
}
/* ---------- 聲音（與連線版共用 online/sound.js） ---------- */
// 比對上一次畫面：新抽的卡、新的遊戲紀錄、換人、對局結束，各自播對應的音效；背景音樂跟著景氣換曲風。
// 右上角的「聲音」設定與第一次點擊解鎖。
if(typeof Sound!=='undefined'){Sound.autoUnlock();Sound.mountControls($('#snd-ctrl'))}
function sfx(name,arg){if(typeof Sound!=='undefined')Sound.play(name,arg)}
let soundLast=null;
function soundWatch(){
  if(typeof Sound==='undefined')return;
  if(!state){soundLast=null;Sound.setMood('lobby');return}
  const growth=state.economicHistory.at(-1)?.growthPct;
  Sound.setMood(state.status!=='playing'?'lobby':growth==null?'normal':growth<=-2?'recession':growth>=4?'boom':'normal');
  const now={game:state.sync?.gameId,log:state.log.length,draw:state.lastDraw?`${state.round}-${state.turnIndex}-${state.lastDraw.instanceId}`:null,turn:`${state.round}-${state.turnIndex}`,status:state.status};
  if(soundLast&&soundLast.game===now.game){
    let delay=0;
    if(now.draw&&now.draw!==soundLast.draw){Sound.play('flip');Sound.play({global:'market',personal:'chance',sector:'fortune'}[state.lastDraw.scope]);delay=700}
    if(now.log>soundLast.log)Sound.logEvent(state.log.slice(0,now.log-soundLast.log),delay);
    if(now.status==='playing'&&now.turn!==soundLast.turn)setTimeout(()=>Sound.play('turn'),300);
    if(now.status!=='playing'&&soundLast.status==='playing')setTimeout(()=>Sound.play('win'),1200);
  }
  soundLast=now;
}

function showCard(active){if(!active)return;const e=event(active.eventId);$('#modal-kicker').textContent=`${scopes[active.scope]} · ${e.id}`;$('#modal-title').textContent=e.name;$('#modal-target').textContent=`作用 ${e.duration} 季；${active.scope==='global'?'所有適用企業同時受影響':active.scope==='sector'?`${active.sector}所有企業受影響`:'只影響抽卡玩家'}`;$('#modal-effects').innerHTML=(e.desc?`<p>${h(e.desc)}</p>`:'')+effectChips(e);$('#card-modal').hidden=false}
function closeCard(){$('#card-modal').hidden=true}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function moveTokenStep(position){
  animation?.visited.add(position);sfx('step',animation?.visited.size||1);
  const token=$('#board .token.moving'),destination=$(`#board [data-tile-index="${position}"] .tile-tokens`);
  if(!token||!destination||tab!=='business'||page!=='game')return;
  const from=token.getBoundingClientRect();
  $('#board .tile-active')?.classList.remove('tile-active');
  destination.closest('.tile').classList.add('tile-active','tile-visited');
  destination.appendChild(token);
  const to=token.getBoundingClientRect();
  token.style.transition='none';
  token.style.transform=`translate(${from.left-to.left}px, ${from.top-to.top}px)`;
  token.getBoundingClientRect();
  requestAnimationFrame(()=>{
    if(!token.isConnected)return;
    token.style.transition=`transform ${Math.max(60,(animation?.stepMs??400)-60)}ms linear`;
    token.style.transform='translate(0,0)';
  });
}
function routeTo(from,dice,end){const full=movementPath(from,Math.min(dice,BOARD.length)),i=full.indexOf(end);return i>=0?full.slice(0,i+1):full}
function beginRollAnimation({playerId,from,dice,reels,path,reelsOnly=false,skipReels=false}){
  if(!state||state.players[state.turnIndex]?.id!==playerId||state.dice!==dice)return;
  if(document.hidden||tab!=='business'||page!=='game')return;
  cancelAnimation();
  const serial=animationSerial;
  const finalReels=Array.isArray(reels)&&reels.length===2?reels:[0,0];
  const route=reelsOnly?[]:path||routeTo(from,dice,state.players[state.turnIndex].position);
  animation={playerId,position:from,dice,reels:finalReels,path:route,stepMs:stepMsFor(route.length),displayReels:skipReels?[...finalReels]:[0,0],reelPositions:skipReels?[...finalReels]:[0,0],spinning:skipReels?[false,false]:[true,true],visited:new Set(),stage:skipReels?'moving':'rolling'};
  renderBoard();renderTurn();
  void (async()=>{
    if(skipReels)return moveAlong(serial);
    const stopTicks=[10,17];sfx('spin');
    for(let tick=0;tick<19;tick++){
      await pause(125);
      if(serial!==animationSerial)return;
      const windows=document.querySelectorAll('#board .slot-reel');
      for(let i=0;i<2;i++){
        if(!animation.spinning[i])continue;
        if(tick<stopTicks[i])animation.reelPositions[i]++;
        else {
          const difference=(finalReels[i]-animation.reelPositions[i]%7+7)%7;
          animation.reelPositions[i]+=difference||7;
          animation.spinning[i]=false;sfx('reelStop',i);
        }
        animation.displayReels[i]=animation.reelPositions[i]%7;
        const reel=windows[i];if(!reel)continue;
        reel.querySelector('.slot-strip').style.transform=`translateY(-${animation.reelPositions[i]*100}%)`;
        reel.classList.toggle('spinning',animation.spinning[i]);
        reel.setAttribute('aria-label',`第 ${i+1} 個轉輪：${animation.displayReels[i]}`);
      }
    }
    if(serial!==animationSerial)return;
    animation.displayReels=[...finalReels];animation.spinning=[false,false];
    animation.stage='result';renderBoard();renderTurn();
    await pause(reelsOnly?700:1000);
    if(serial!==animationSerial)return;
    if(reelsOnly){animation=null;renderBoard();renderTurn();return}
    animation.stage='moving';renderBoard();renderTurn();
    await moveAlong(serial);
  })();
}
async function moveAlong(serial){
  for(const position of animation.path){
    if(serial!==animationSerial)return;
    animation.position=position;moveTokenStep(position);
    await pause(animation.stepMs);
  }
  if(serial!==animationSerial)return;
  animation=null;renderBoard();renderTurn();scheduleBot();
}

/* ---------- Bot 自動操作 ---------- */
function scheduleBot(){
  clearTimeout(botTimer);botTimer=null;
  if(!state||state.status!=='playing'||page!=='game'||botPaused||animation||document.hidden)return;
  const p=currentPlayer();if(!p?.bot)return;
  const reading=currentCard()||state.phase==='choice'||effectiveFedNotice();
  botTimer=setTimeout(botTick,BOT_SPEEDS[botSpeed].ms*(reading?1.8:1));
}
async function botTick(){
  botTimer=null;
  if(!state||animation||botPaused||state.status!=='playing')return;
  const p=currentPlayer();if(!p?.bot)return;
  if(state.phase==='roll'){await rollWithAnimation();if(!animation)render();return}
  if(state.phase==='adjust'){await confirmWithAnimation(botAdjust(state,p,Math.random));if(!animation)render();return}
  const shown=state.phase==='manage'&&currentCard();
  if(shown){dismissedCardKey=shown.key;render();return}
  await run(()=>{
    const q=currentPlayer();if(!q?.bot||state.status!=='playing')return;
    if(state.phase==='strike')return void endTurn(state);
    if(state.phase==='draw')return void drawEvent(state);
    if(state.phase==='choice')return void resolveChoice(state,q.id,botChoice(state,q,Math.random));
    if(state.phase==='manage'){
      const key=`${state.sync?.gameId}:${state.round}:${state.turnIndex}`;
      if(botMemo.key!==key)botMemo={key,memo:{}};
      const step=botManageStep(state,q,botMemo.memo,Math.random);
      if(!step)return void endTurn(state);
      adjustStaff(state,q.id,step.delta);
    }
  });
}
document.addEventListener('visibilitychange',()=>scheduleBot());

async function rollWithAnimation(){
  if(animation)return;
  let result=null,from=null,playerId=null;
  try{
    await withGameLock(()=>{
      if(!ensureFresh())return;
      const player=currentPlayer();from=player.position;playerId=player.id;
      result=rollDice(state);save();render();
    });
    if(result)beginRollAnimation({playerId,from,dice:result.dice,reels:result.reels,path:result.path,reelsOnly:!!result.pending});
  }catch(e){notify(e.message||'無法啟動拉霸')}
}
async function confirmWithAnimation(adjust){
  if(animation)return;
  let result=null,from=null,playerId=null;
  try{
    await withGameLock(()=>{
      if(!ensureFresh())return;
      const player=currentPlayer();from=player.position;playerId=player.id;
      result=confirmMove(state,player.id,adjust);save();render();
    });
    if(result)beginRollAnimation({playerId,from,dice:result.dice,reels:result.reels,path:result.path,skipReels:true});
  }catch(e){notify(e.message||'無法調整步數')}
}

$('#add-player').addEventListener('click',()=>{if(setupPlayers.length<8){const used=new Set(setupPlayers.map(x=>x.roleId));let number=1;while(setupPlayers.some(x=>x.name===`玩家 ${number}`))number++;setupPlayers.push({name:`玩家 ${number}`,roleId:ROLES.find(x=>!used.has(x.id)).id,control:'human'});renderSetup()}});
$('#setup-players').addEventListener('input',e=>{if(e.target.dataset.setupName!==undefined)setupPlayers[Number(e.target.dataset.setupName)].name=e.target.value});
$('#setup-players').addEventListener('change',e=>{if(e.target.dataset.setupRole!==undefined)setupPlayers[Number(e.target.dataset.setupRole)].roleId=e.target.value;if(e.target.dataset.setupControl!==undefined)setupPlayers[Number(e.target.dataset.setupControl)].control=e.target.value});
$('#setup-players').addEventListener('click',e=>{const i=e.target.dataset.removePlayer;if(i!==undefined&&setupPlayers.length>2){setupPlayers.splice(Number(i),1);renderSetup()}});
$('#start-btn').addEventListener('click',async()=>{try{await withGameLock(()=>{const saved=readStored();if(saved){adoptShared(saved);notify('已加入另一個頁籤的對局。');return}const next=createGame({players:setupPlayers.map(p=>({name:p.name,roleId:p.roleId,bot:p.control&&p.control!=='human'?makeBot(p.control):null})),targetWealth:$('#target-input').value,maxRounds:$('#rounds-input').value});prepareNewSession(next);state=next;page='game';$('#setup-error').textContent='';tab='business';snapshotSelection='preview';rememberView();save();render()})}catch(e){$('#setup-error').textContent=e.message}});
$('.tabs').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(!b)return;tab=b.dataset.tab;rememberView();render();window.scrollTo({top:0,behavior:'smooth'})});
$('#snapshot-select').addEventListener('change',e=>{snapshotSelection=e.target.value;rememberView();renderDashboard()});
$('#game').addEventListener('click',e=>{
  const a=e.target.closest('[data-action]');if(!a||!state)return;
  const action=a.dataset.action,p=currentPlayer();
  if(action==='new-game'){void resetGame();return}
  if(action==='bot-pause'){botPaused=!botPaused;render();return}
  if(action==='bot-speed'){botSpeed=a.dataset.value;try{localStorage.setItem('economy-board-bot',JSON.stringify({speed:botSpeed}))}catch{}render();return}
  if(p?.bot)return;
  if(action==='roll'){void rollWithAnimation();return}
  if(animation)return;
  if(action==='draw-card'){void run(()=>drawEvent(state));return}
  if(action==='move-adjust'){void confirmWithAnimation(Number(a.dataset.value));return}
  if(action==='choose'){void run(()=>resolveChoice(state,p.id,a.dataset.value));return}
  if(action==='dismiss-card'){dismissedCardKey=currentCard()?.key||null;renderBoard();renderTurn();return}
  if(state.phase==='draw'||currentCard())return;
  if(action==='end-turn'){run(()=>{const result=endTurn(state);if(result){snapshotSelection='latest';rememberView();notify(result.finished?'對局結束，請查看勝負結果。':`第 ${result.snapshot.round} 季已結算。`)}});return}
  const numberId=['hire','layoff'].includes(action)?'#staff-count':['loan','repay'].includes(action)?'#loan-amount':'#bad-amount';
  const n=Number($(numberId)?.value);
  run(()=>{if(action==='hire')adjustStaff(state,p.id,n);else if(action==='layoff')adjustStaff(state,p.id,-n);else if(action==='loan')issueLoan(state,p.id,n);else if(action==='repay')repayLoan(state,p.id,n);else if(action==='mark-bad')updateBadLoans(state,p.id,n);else if(action==='recover-bad')updateBadLoans(state,p.id,-n)});
});
$('#game').addEventListener('input',e=>{if(e.target.id==='staff-count')renderStaffPreview()});
document.querySelectorAll('[data-close-modal]').forEach(x=>x.addEventListener('click',closeCard));
$('#player-cards').addEventListener('click',e=>{const b=e.target.closest('[data-player-chip]');if(!b||b.disabled)return;openPlayerId=openPlayerId===b.dataset.playerChip?null:b.dataset.playerChip;renderPlayers()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeCard()});
let resetArmedUntil=0;
async function resetGame(){
  // 不使用 confirm()：部分嵌入環境會直接回傳 false。改為 4 秒內再按一次確認。
  if(state&&state.status==='playing'&&Date.now()>resetArmedUntil){resetArmedUntil=Date.now()+4000;notify('再按一次確認開始新遊戲；目前對局會清除，建議先匯出備份。');return}
  resetArmedUntil=0;
  await withGameLock(()=>{const stored=readStored();if(stored&&isNewerGame(stored,state))state=stored;clearSave();cancelAnimation();closeCard();state=null;page='game';tab='business';rememberView();render()});
}
$('#home-btn').addEventListener('click',()=>{page='home';closeCard();render();window.scrollTo({top:0,behavior:'smooth'})});
$('#home-play-btn').addEventListener('click',()=>{page='game';render();window.scrollTo({top:0,behavior:'smooth'})});
$('#new-game-btn').addEventListener('click',()=>{void resetGame()});
$('#open-tab-btn').addEventListener('click',()=>{window.open(location.href,'_blank','noopener')});
$('#export-btn').addEventListener('click',()=>{if(!state){notify('目前沒有可匯出的對局。');return}const blob=new Blob([exportGame(state)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`經濟棋局-第${state.round}季.json`;a.click();URL.revokeObjectURL(url)});
$('#import-file').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{const imported=importGame(await file.text());await withGameLock(()=>{const stored=readStored();if(stored&&isNewerGame(stored,state))state=stored;prepareNewSession(imported);cancelAnimation();state=imported;page='game';tab='business';snapshotSelection='latest';rememberView();save();render()});notify('存檔已載入，其他頁籤也已更新。')}catch(err){notify(err.message||'無法讀取存檔')}e.target.value=''});
window.addEventListener('storage',e=>{
  if(e.key!==storageKey)return;
  if(e.newValue){try{adoptShared(importGame(e.newValue))}catch{}}
  else{const saved=readStored();if(saved)adoptShared(saved);else if(saved===null){resetAt=Math.max(resetAt,Date.now());cancelAnimation();closeCard();state=null;render()}}
});
if(channel)channel.onmessage=e=>{
  const message=e.data;if(!message||message.writerId===tabId)return;
  if(message.type==='state'){try{adoptShared(importGame(JSON.stringify(message.game)))}catch{}}
  if(message.type==='reset'&&(!state||message.updatedAt>=syncInfo(state).updatedAt)){resetAt=Math.max(resetAt,message.updatedAt);cancelAnimation();closeCard();state=null;render()}
};
function syncOnFocus(){const saved=readStored();if(saved)adoptShared(saved);else if(saved===null&&state){cancelAnimation();closeCard();state=null;render()}}
window.addEventListener('focus',syncOnFocus);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncOnFocus()});
const savedAtStart=readStored();if(savedAtStart){state=savedAtStart;snapshotSelection='latest'}
renderHomeRoles();
render();
