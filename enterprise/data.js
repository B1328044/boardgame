export const METRICS = ['revenue','labor','material','energy','import_tax','export_cost','interest','fixed','tax','investment'];
export const METRIC_LABELS = {revenue:'營業收入',labor:'人力成本',material:'原物料／商品',energy:'能源／運輸',import_tax:'進口關稅',export_cost:'出口貿易',interest:'利息收支',fixed:'固定營運',tax:'稅金',investment:'投資損益',asset_value:'投資資產價值'};
export const ROLES = [
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
export const GLOBAL_EVENTS = [
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
export const PERSONAL_EVENTS = [
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
export const CUSTOMER_GROUPS={consumer:['retail','auto','electronics','agriculture','property'],business:['electronics','technology','logistics','energy'],finance:['bank','investment']};
export const CUSTOMER_GROUP_LABELS={consumer:'消費者市場',business:'企業客戶',finance:'金融客戶'};
export const SPECIAL={hedgeCost:100,recallCost:350,ransomCost:300,equityCash:500,equityShare:.25,leaseFixedPct:10,transferShare:.1,windowSeasons:4,aeoRolls:2};
export const STAFF={
  laborForce:1000,laborGrowth:.02,naturalUnemploymentPct:5,wageSlope:.03,
  curveLinear:.6,curveQuadratic:.3,
  layoffCapRatio:1/3,massLayoffRatio:.2,massLayoffMorale:30,capMorale:10,moraleRecovery:10,
  attritionMorale:50,attritionRate:.03,moraleFloor:.8
};
// 景氣連動：上一季的總體數值影響本季營收（金融業為利息／投資收益）。
// growth：營收成長率每 1%；unemployment：失業率每高於 5% 一個百分點；
// energy／material／stock：上季數值相對「前 4 季平均」每高 1%（股市為 1 點）。用相對值避免事件長期推高物價造成固定偏差。
export const MACRO_SENSITIVITY={
  auto:{growth:.6},electronics:{growth:.4},retail:{unemployment:-2},bank:{},investment:{stock:1},
  energy:{energy:.4},logistics:{growth:.5},property:{},agriculture:{material:.8},technology:{stock:.3}
};
export const MACRO_WINDOW=4;
// 利率連動：政策利率每偏離 4% 一個百分點，利息科目變動的百分比（銀行為收入、借款企業為支出）。
export const RATE_SENSITIVITY={lender:20,borrower:20};
export const MACRO_LABELS={
  auto:'營收成長率越高，賣車越多',electronics:'營收成長率越高，訂單越多',retail:'失業率越高，消費越弱',bank:'利率越高，利息收入越多',
  investment:'股市漲過近期平均，投資收益增加',energy:'能源價格高於近期平均，售價跟著漲',logistics:'營收成長率越高，貨運越多',
  property:'利率越低，利息支出越少',agriculture:'原物料價格高於近期平均，農產品賣得更貴',technology:'股市越熱，企業越願意買軟體服務'
};
export const OUTPUT_METRICS={bank:['revenue','interest'],investment:['revenue','investment']};
export const VARIABLE_COST_METRICS=['material','energy'];
export const SECTOR_EVENTS = [
  {id:'S01',name:'製造業接單潮',sector:'製造業',duration:3,decay:[1,.65,.3],effects:[fx('revenue',20),fx('material',10)]},
  {id:'S02',name:'消費市場轉弱',sector:'消費業',duration:3,decay:[1,.6,.3],effects:[fx('revenue',-22)]},
  {id:'S03',name:'金融信用擴張',sector:'金融業',duration:3,decay:[1,.65,.3],effects:[fx('interest',20),fx('asset_value',12)]},
  {id:'S04',name:'運輸燃料補貼',sector:'能源與運輸',duration:3,decay:[1,.6,.3],effects:[fx('energy',-25)]},
  {id:'S05',name:'民生供應吃緊',sector:'民生業',duration:3,decay:[1,.6,.3],effects:[fx('material',30),fx('revenue',10)]},
  {id:'S06',name:'科技採購熱潮',sector:'科技業',duration:3,decay:[1,.65,.3],effects:[fx('revenue',30),fx('labor',15)]}
];
export const ALL_EVENTS=[...GLOBAL_EVENTS,...PERSONAL_EVENTS,...SECTOR_EVENTS];
export const FED_RULES=[
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
export const FED_PRIORITY=['F08','F09','F07','F03','F01','F06','F04','F02','F05','F10'];
export const BOARD = Array.from({length:24},(_,i)=> i===0?{type:'start',label:'出發'}:{type:['global','personal','sector'][(i-1)%3],label:{global:'全球事件',personal:'個人事件',sector:'產業事件'}[['global','personal','sector'][(i-1)%3]]});
