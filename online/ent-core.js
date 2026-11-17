// 由 ../enterprise/data.js、../enterprise/engine.js、../enterprise/bot.js、./ent-room.mjs 產生，請勿直接修改；改完原始檔後執行 node online/build.mjs。
'use strict';
const {Room,newCode}=(()=>{
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


// 企業版連線房間（不含網路）：座位、開局、動作驗證、Bot 自動操作與視角過濾。
// 介面與個人版的 room.mjs 相同（大螢幕的 host.js 共用），差別在企業角色不能重複、財務資料只給本人。

const CODE_CHARS='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_SEATS=8;
const randomBytes=n=>globalThis.crypto.getRandomValues(new Uint8Array(n));
const newCode=()=>Array.from(randomBytes(4),b=>CODE_CHARS[b%CODE_CHARS.length]).join('');
const newToken=()=>Array.from(randomBytes(16),b=>b.toString(16).padStart(2,'0')).join('');
const r1=n=>Math.round(n*10)/10;
// 公開紀錄不顯示各公司的借貸、壞帳與資遣費金額。
const PRIVATE_LOG=/借款|償還|壞帳|資遣費|增資|贖金|售後租回|避險權利金|召回處理費/;
const LOG_KEEP=60;
const SECTORS=['製造業','消費業','金融業','能源與運輸','民生業','科技業'];
const sectorForTile=i=>SECTORS[((Math.floor((i-3)/3))%SECTORS.length+SECTORS.length)%SECTORS.length];
const entRole=id=>ROLES.find(r=>r.id===id);
const entEvent=id=>ALL_EVENTS.find(e=>e.id===id);
const SCOPE={global:'全球事件',personal:'個人事件',sector:'產業事件'};
// 卡片類型對應的提示音（共用個人版的四種卡片音效）。
const SCOPE_SOUND={global:'market',personal:'chance',sector:'fortune'};
const effectText=e=>e.effects.map(x=>`${x.metric==='asset_value'?'資產價值':METRIC_LABELS[x.metric]} ${x.pct>=0?'+':''}${x.pct}%${x.target!=='all'?`（${x.target.split(',').map(t=>entRole(t)?.name||({interest_negative:'有借款的企業',except_technology:'科技業以外'}[t]||t)).join('、')}）`:''}`);
const STAFF_STEPS=[5,10,20,40];

class Room{
  constructor(code,{mode='enterprise'}={}){
    this.code=code;this.mode=mode;this.hostKey=newToken();
    this.seats=[];this.game=null;this.maxRounds=12;this.targetWealth=5500;this.serial=0;
    this.botMemo={key:null,memo:{}};
  }
  toJSON(){return {v:1,code:this.code,mode:this.mode,hostKey:this.hostKey,maxRounds:this.maxRounds,targetWealth:this.targetWealth,serial:this.serial,seats:this.seats.map(({conn,lastSeen,...s})=>s),game:this.game}}
  static fromJSON(data){
    if(data?.v!==1||!data.code||!Array.isArray(data.seats)||data.mode!=='enterprise')throw Error('房間存檔格式不正確。');
    const r=new Room(data.code);
    Object.assign(r,{hostKey:data.hostKey,maxRounds:data.maxRounds,targetWealth:data.targetWealth??5500,serial:data.serial,game:data.game||null});
    r.seats=data.seats.map(s=>({...s,connected:!!s.bot}));
    return r;
  }
  seatByToken(token){return token?this.seats.find(s=>s.token===token):undefined}
  seatOf(p){return this.seats.find(s=>s.playerId===p?.id)}
  uniqueName(name,except){
    const base=String(name||'').trim().slice(0,16)||'玩家';
    let n=base,i=2;while(this.seats.some(s=>s!==except&&s.name===n))n=`${base} ${i++}`;
    return n;
  }
  // 企業不能重複：指定的企業被選走時，自動換成第一個還沒人選的。
  freeRole(roleId,except){
    const taken=new Set(this.seats.filter(s=>s!==except).map(s=>s.roleId));
    if(roleId&&!entRole(roleId))throw Error('企業無效。');
    if(roleId&&!taken.has(roleId))return roleId;
    const free=ROLES.find(r=>!taken.has(r.id));if(!free)throw Error('所有企業都被選走了。');
    return free.id;
  }
  addHuman({name,roleId}){
    if(this.game)throw Error('遊戲已經開始，無法加入新玩家。');
    if(this.seats.length>=MAX_SEATS)throw Error('房間已滿（最多 8 人）。');
    const seat={seatId:`s${++this.serial}`,token:newToken(),name:'',roleId:null,bot:null,connected:true,playerId:null};
    seat.roleId=this.freeRole(roleId,seat);seat.name=this.uniqueName(name,seat);this.seats.push(seat);return seat;
  }
  addBot({level='mid',roleId}={}){
    if(this.game)throw Error('遊戲已經開始。');
    if(this.seats.length>=MAX_SEATS)throw Error('房間已滿（最多 8 人）。');
    if(!BOT_LEVELS[level])throw Error('Bot 難度無效。');
    const seat={seatId:`s${++this.serial}`,token:null,name:'',roleId:null,bot:makeBot(level),connected:true,playerId:null};
    seat.roleId=this.freeRole(roleId,seat);seat.name=this.uniqueName(`Bot ${this.seats.filter(s=>s.bot).length+1}`,seat);this.seats.push(seat);return seat;
  }
  updateSeat(seat,{name,roleId}){
    if(this.game)throw Error('遊戲已經開始，無法更改。');
    if(roleId!==undefined){
      if(this.seats.some(s=>s!==seat&&s.roleId===roleId))throw Error(`${entRole(roleId)?.name||'這個企業'}已經有人選了。`);
      seat.roleId=this.freeRole(roleId,seat);
    }
    if(name!==undefined)seat.name=this.uniqueName(name,seat);
  }
  removeSeat(seatId){if(this.game)throw Error('遊戲已經開始。');this.seats=this.seats.filter(s=>s.seatId!==seatId)}
  start({maxRounds=this.maxRounds,targetWealth=this.targetWealth}={}){
    if(this.game)throw Error('遊戲已經開始。');
    if(this.seats.length<2)throw Error('至少需要 2 位玩家。');
    this.maxRounds=Math.max(4,Math.min(30,Math.round(Number(maxRounds)||12)));
    this.targetWealth=Math.max(2000,Math.round(Number(targetWealth)||5500));
    this.game=createGame({players:this.seats.map(s=>({name:s.name,roleId:s.roleId,bot:s.bot})),seed:Date.now()%2147483647||1,maxRounds:this.maxRounds,targetWealth:this.targetWealth});
    this.seats.forEach((s,i)=>{s.playerId=this.game.players[i].id});
    this.botMemo={key:null,memo:{}};
  }
  backToLobby(){this.game=null;for(const s of this.seats)s.playerId=null}
  currentPlayer(){return this.game?.players[this.game.turnIndex]}
  actor(){return this.currentPlayer()}
  act(token,action){
    const g=this.game,seat=this.seatByToken(token);
    if(!seat)throw Error('找不到你的座位，請重新加入。');
    if(!g||g.status!=='playing')throw Error('遊戲尚未開始或已經結束。');
    const p=this.currentPlayer();
    if(p.id!==seat.playerId)throw Error(`還沒輪到你，現在是 ${p.name} 的回合。`);
    const int=x=>{const v=Number(x);if(!Number.isInteger(v))throw Error('請輸入整數。');return v};
    switch(action?.type){
      case 'roll':return rollDice(g);
      case 'adjust':return confirmMove(g,p.id,int(action.value));
      case 'draw':return drawEvent(g);
      case 'choose':return resolveChoice(g,p.id,String(action.value));
      case 'staff':return adjustStaff(g,p.id,int(action.delta));
      case 'loan':return issueLoan(g,p.id,int(action.amount));
      case 'repay':return repayLoan(g,p.id,int(action.amount));
      case 'bad':return updateBadLoans(g,p.id,int(action.amount));
      case 'end':return endTurn(g);
      default:throw Error('未知的動作。');
    }
  }
  needsBot(){const g=this.game;return g?.status==='playing'&&!!this.currentPlayer()?.bot}
  botStep(rng=Math.random){
    if(!this.needsBot())return false;
    const g=this.game,q=this.currentPlayer();
    if(g.phase==='roll'){rollDice(g);return true}
    if(g.phase==='adjust'){confirmMove(g,q.id,botAdjust(g,q,rng));return true}
    if(g.phase==='strike'){endTurn(g);return true}
    if(g.phase==='draw'){drawEvent(g);return true}
    if(g.phase==='choice'){resolveChoice(g,q.id,botChoice(g,q,rng));return true}
    if(g.phase==='manage'){
      const key=`${g.round}:${g.turnIndex}`;
      if(this.botMemo.key!==key)this.botMemo={key,memo:{}};
      const step=botManageStep(g,q,this.botMemo.memo,rng);
      if(!step){endTurn(g);return true}
      adjustStaff(g,q.id,step.delta);return true;
    }
    return false;
  }

  /* ---------- 視角過濾 ---------- */
  // 公開：位置、企業、淨資產目標進度、事件、景氣與聯準會；不含現金、負債與損益明細。
  publicView(){
    const g=this.game;
    const seats=this.seats.map(s=>({seatId:s.seatId,name:s.name,roleId:s.roleId,isBot:!!s.bot,botLabel:s.bot?botLabel(s.bot):'',connected:s.bot?true:s.connected}));
    const base={code:this.code,mode:this.mode,maxRounds:this.maxRounds,targetWealth:this.targetWealth,seats,
      roles:ROLES.map(r=>({id:r.id,name:r.name,icon:r.icon,title:r.sector,goal:`${r.sector} · 基準員工 ${r.baseHeadcount} 人`})),
      botLevels:Object.entries(BOT_LEVELS).map(([id,v])=>({id,label:v.label,desc:v.desc}))};
    if(!g)return {...base,status:'lobby'};
    const cur=this.currentPlayer(),publicLog=g.log.filter(x=>!PRIVATE_LOG.test(x)),snap=makeSnapshot(g),last=g.decisions.at(-1);
    const draw=g.lastDraw&&g.lastDraw.startedRound===g.round?g.lastDraw:null,e=draw?entEvent(draw.eventId):null;
    const winReason={goal:'goal',round_limit:'progress',bankruptcy:'bankruptcy'}[g.status]||'';
    return {...base,status:g.status==='playing'?'playing':'finished',
      game:{round:g.round,maxRounds:g.maxRounds,targetWealth:g.targetWealth,turnIndex:g.turnIndex,phase:g.phase,dice:g.dice,reels:g.reels,winnerIds:g.winnerIds,winReason,endStatus:g.status,
        currentId:cur?.id??null,ghostPosition:g.ghostPosition,strikeCause:g.strikeCause,
        // 背景音樂依景氣切換：營收成長 ≤ −2% 算衰退、≥ 4% 算過熱。
        regime:snap.growthPct===null?'normal':snap.growthPct<=-2?'recession':snap.growthPct>=4?'boom':'normal',
        tiles:BOARD.map((t,i)=>({type:t.type,label:t.type==='sector'?sectorForTile(i):t.label})),
        players:g.players.map((p,i)=>{const r=entRole(p.roleId),pos=companyPosition(g,p.roleId);return {id:p.id,seatId:this.seats[i]?.seatId,name:p.name,roleId:p.roleId,icon:r.icon,roleName:r.name,sector:r.sector,color:p.color,position:p.position,bankrupt:false,
          isBot:!!p.bot,botLabel:p.bot?botLabel(p.bot):'',connected:this.seats[i]?.bot?true:!!this.seats[i]?.connected,
          progress:Math.max(0,Math.min(100,Math.round(pos.netWorth/g.targetWealth*100))),
          shield:p.strikeShield,aeo:p.moveAdjust,stall:p.stallNext,struck:g.struckPlayerIds.includes(p.id)}}),
        card:e?{id:e.id,name:e.name,scope:draw.scope,scopeLabel:SCOPE[draw.scope],sector:draw.sector,duration:e.duration,desc:e.desc||'',effects:effectText(e),fallback:draw.fallback||'',sound:SCOPE_SOUND[draw.scope],ownerId:draw.ownerId}:null,
        choosing:g.phase==='choice'&&g.pendingChoice?{name:entEvent(g.pendingChoice.eventId).name}:null,
        fed:{rate:g.fedRatePercent,program:g.monetaryProgram?.type||null,inflation:snap.inflationPct,unemployment:snap.unemploymentPct,growth:snap.growthPct,stock:snap.stockIndex,
          decision:last?{action:last.action,ruleId:last.ruleId,round:last.round}:null},
        events:g.activeEvents.filter(a=>a.scope!=='personal'&&eventRemaining(a,g.round)>0).map(a=>({name:entEvent(a.eventId).name,scope:a.scope,sector:a.sector,left:eventRemaining(a,g.round)})),
        log:publicLog.slice(0,LOG_KEEP),logCount:publicLog.length}};
  }
  // 只給本人：公司財務、員工、借貸與輪到自己時可以做的事。
  privateView(token){
    const seat=this.seatByToken(token);if(!seat)return null;
    const g=this.game,base={seatId:seat.seatId,name:seat.name,roleId:seat.roleId};
    if(!g)return base;
    const p=g.players.find(x=>x.id===seat.playerId);if(!p)return base;
    const r=entRole(p.roleId),c=g.companies[p.roleId],f=financials(g,p.roleId),pos=companyPosition(g,p.roleId);
    const isMyTurn=g.status==='playing'&&this.currentPlayer()?.id===p.id,phase=isMyTurn?g.phase:null;
    const room=layoffRoom(g,p.roleId),pool=availableLabor(g);
    const preview=d=>{const pv=staffPreview(g,p.roleId,d);return pv&&(d>0?d<=pool:-d<=room)?{delta:d,net:pv.net,severance:pv.severance,moraleHit:pv.moraleHit,payback:pv.payback}:null};
    let choice=null;
    if(phase==='choice'&&g.pendingChoice){
      const e=entEvent(g.pendingChoice.eventId);let options=[];
      if(e.choice==='target')options=(e.special==='transfer'?customerRivals(g,p):g.players.filter(x=>x.id!==p.id)).map(x=>({value:x.id,label:`${x.name}（${entRole(x.roleId).name}）`}));
      else if(e.special==='equity')options=[{value:'accept',label:`接受，現金 +${SPECIAL.equityCash}`},{value:'decline',label:'放棄'}];
      else if(e.special==='leaseback'){const v=assetValue(g,p.roleId);options=[...(v>0?[{value:'accept',label:`出售資產，換得 ${Math.round(v)}`}]:[]),{value:'decline',label:'放棄'}]}
      else if(e.choice==='ransom')options=[{value:'pay',label:`支付贖金 ${SPECIAL.ransomCost}`},{value:'refuse',label:'拒付，下回合停擺'}];
      choice={id:e.id,name:e.name,desc:e.desc||'',options};
    }
    const adjust=phase==='adjust'&&g.pendingRoll?{dice:g.pendingRoll.dice,left:p.moveAdjust,options:[-1,0,1].filter(d=>g.pendingRoll.dice+d>=0).map(d=>{const steps=g.pendingRoll.dice+d,to=(p.position+steps)%BOARD.length;return {value:d,steps,to,ghost:to===g.ghostPosition}})}:null;
    const groups=Object.entries(CUSTOMER_GROUPS).filter(([,ids])=>ids.includes(p.roleId)).map(([k])=>CUSTOMER_GROUP_LABELS[k]);
    const mine=g.activeEvents.filter(a=>eventRemaining(a,g.round)>0&&(a.scope==='global'||a.scope==='sector'&&a.sector===r.sector||a.scope==='personal'&&(a.ownerId===p.id||a.partnerId===p.id||a.targetId===p.id)))
      .map(a=>({name:entEvent(a.eventId).name,scope:SCOPE[a.scope],left:eventRemaining(a,g.round),note:a.eventId==='P14'&&a.targetId?(a.ownerId===p.id?'取得對方營收 10%':'營收的 10% 轉給對手'):a.partnerId?'策略聯盟':''}));
    return {...base,playerId:p.id,isMyTurn,phase,
      me:{icon:r.icon,roleName:r.name,sector:r.sector,groups,
        cash:c.cash,assetValue:pos.assetValue,debt:c.debt,netWorth:pos.netWorth,target:g.targetWealth,progress:Math.max(0,Math.min(100,Math.round(pos.netWorth/g.targetWealth*100))),
        revenue:r1(f.revenue+f.otherIncome),costs:r1(-f.costs),netProfit:r1(f.netProfit),macro:Math.round(f.macro*100)/100,
        flows:Object.entries(f.flows).filter(([,v])=>v).map(([k,v])=>({label:METRIC_LABELS[k],amount:r1(v)})),
        headcount:c.headcount,base:r.baseHeadcount,morale:c.morale,attritionMorale:STAFF.attritionMorale,layoffRoom:room,pool,severance:Math.round(severancePerHead(p.roleId)*100)/100,
        staffOptions:STAFF_STEPS.flatMap(n=>[preview(n),preview(-n)]).filter(Boolean),
        bankLiquid:g.bank.liquidAssets,loanBlocked:g.bank.riskRestrictionUntil>=g.round,fedRate:g.fedRatePercent,
        isBank:p.roleId==='bank',npl:g.bank.nonperformingLoans,
        shield:p.strikeShield,aeo:p.moveAdjust,stall:p.stallNext,
        hedgeUntil:c.hedgeUntil&&g.round<=c.hedgeUntil?c.hedgeUntil:null,leaseUntil:c.leaseUntil&&g.round<=c.leaseUntil?c.leaseUntil:null,equityUntil:c.equityUntil&&g.round<=c.equityUntil?c.equityUntil:null,
        events:mine},
      choice,adjust};
  }
}

return {Room,newCode};
})();