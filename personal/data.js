// 人生棋局：所有金額單位為「萬元」，一回合代表一季（3 個月）。
// 所有人從相同的基本工作與學貸開始，靠工作卡、天命卡與理財決策拉開差距。
// 改動數值後請重跑 simulate.mjs 並產出試算表報告。

export const UNIT='萬';

/* ---------- 收入階層 ---------- */
// 市場事件、部分卡片的金額依「階層」而定；玩家的階層由手上的工作卡決定（沒有工作卡＝基層的基本工作）。
export const TIERS=[
  {id:'low',name:'基層',icon:'🧹'},
  {id:'office',name:'上班族',icon:'💼'},
  {id:'exec',name:'高薪專業',icon:'🏙️'},
  {id:'free',name:'自由業',icon:'🎨'}
];

/* ---------- 角色（B 角色版用） ---------- */
// 角色版：開局選角色，各有收入、負債與勝利目標（組員校準的數值）。工作卡版不使用。
// salary：每季稅後收入；living：每季生活費（隨物價指數上升）；debts：起始負債。
// rate 為年利率（%），payment 為每季應繳；variable=true 代表跟著央行利率浮動。
export const ROLES=[
  {id:'low',name:'底層',title:'基層服務業',icon:'🧹',incomeType:'salary',salary:9,living:4.1,cash:5,
    debts:[{type:'student',name:'學貸',balance:36,rate:1.5,payment:1.5,public:true}],
    goal:{type:'debtFree',amount:50,text:'清空所有負債，且存款至少 50 萬'},
    story:'月薪三萬出頭，每個月先繳學貸再算生活費。沒有房貸壓力，但也沒有太多犯錯空間。',
    traits:['收入最低、最穩定','基本工資調漲時直接受惠','被裁員時有失業給付']},
  {id:'office',name:'上班族',title:'一般企業職員',icon:'💼',incomeType:'salary',salary:16.5,living:10.8,cash:15,
    debts:[{type:'student',name:'學貸',balance:20,rate:1.5,payment:1.2,public:true},{type:'card',name:'信用卡分期',balance:8,rate:15,payment:1.5}],
    goal:{type:'car',amount:100,text:'一次付清買下一台 100 萬的車'},
    story:'朝九晚五，年資慢慢墊高薪水。手上還有學貸和一筆信用卡分期，存夠錢就想換一台好車。',
    traits:['每年依景氣調薪','車價會隨物價與車市事件變動','信用卡分期利率高，先還划算']},
  {id:'exec',name:'公司高管',title:'企業高階主管',icon:'🏙️',incomeType:'salary',salary:45,living:20,cash:100,bonusMonths:2,
    debts:[{type:'mortgage',name:'房貸',balance:900,rate:2.6,payment:10.8,variable:true},{type:'auto',name:'車貸',balance:60,rate:3,payment:4.5,public:true}],
    goal:{type:'house',amount:1000,downPct:30,dsr:50,text:'買下一棟 1,000 萬的房子（頭期款 30%，銀行核貸）'},
    story:'收入最高，負債也最大。每季先付房貸車貸，年終獎金看景氣。想換大房子，銀行還得點頭。',
    traits:['年終獎金隨景氣浮動','房貸利率跟著央行走','買房需頭期款且月付不超過收入 50%']},
  {id:'free',name:'自由業',title:'接案工作者',icon:'🎨',incomeType:'freelance',salary:17.4,living:8,cash:20,
    debts:[{type:'card',name:'信用卡循環',balance:12,rate:15,payment:2}],
    goal:{type:'streak',amount:18,rounds:5,text:'連續 5 季收入都超過 18 萬（月入 6 萬）'},
    story:'案子多的時候月入破十萬，沒案子的時候只能吃老本。收入完全看景氣和自己的拼勁。',
    traits:['每季收入隨機浮動','景氣好壞影響最大','加班接案能拉高收入，但會累積疲勞']}
];

/* ---------- 開局：所有人相同（A 工作卡版） ---------- */
// 學貸是明牌（public），所有人都看得到。
export const START={cash:5,debts:[{type:'student',name:'學貸',balance:36,rate:1.5,payment:1.5,public:true}]};
// 勝利：淨資產（現金＋投資＋車子殘值－負債）先達標者獲勝；季數用完時淨資產最高者獲勝。
export const GOAL={netWorth:300,text:'淨資產達到 300 萬'};

/* ---------- 工作卡（混在機會卡牌堆中） ---------- */
// salary／living：每季收入與生活費；tier：收入階層；cond：取得條件
//   wait：先停留 N 回合受訓，之後擲一顆骰子 ≥ dice 才錄取；dice：當場擲骰；cost：先付學費；car：需要有車
// perk：flyFree 搭機免費、flyHalf 機票半價；fatigue：每季額外疲勞；skipChance：每回合無法移動的機率
// vol：自由業收入浮動範圍 [最低倍數, 幅度]
export const BASE_JOB={id:'J00',name:'基本工作',icon:'🧾',tier:'low',salary:9,living:4.4,desc:'沒有工作卡時的工作：時薪打工、門市、臨時工。'};
export const JOBS=[
  {id:'J01',name:'基本文書處理人員',icon:'🗂️',tier:'low',salary:11,living:4.4,cond:{},desc:'無條件錄取，薪水比基本工作高一點。'},
  {id:'J02',name:'外送員',icon:'🛵',tier:'free',salary:13,living:4.6,cond:{},desc:'無條件。跑越多賺越多，收入每季浮動。'},
  {id:'J03',name:'業務專員',icon:'🤝',tier:'office',salary:16,living:8,cond:{car:true},desc:'需要有車才能跑客戶。每年依景氣調薪。'},
  {id:'J04',name:'軟體工程師',icon:'💻',tier:'office',salary:21,living:9,cond:{cost:10,dice:3},desc:'先付 10 萬上程式訓練營，當場擲骰 ≥ 3 錄取；失敗學費不退。'},
  {id:'J05',name:'空服員',icon:'🛫',tier:'office',salary:15,living:7,cond:{dice:3},perk:'flyFree',desc:'面試當場擲骰 ≥ 3 錄取。搭飛機出國免費。'},
  {id:'J06',name:'旅行社領隊',icon:'🧳',tier:'low',salary:12,living:5,cond:{},perk:'flyHalf',desc:'無條件。出國機票半價。'},
  {id:'J07',name:'自由接案設計師',icon:'🎨',tier:'free',salary:17,living:6,cond:{},desc:'無條件。收入每季浮動，景氣影響大。'},
  {id:'J08',name:'律師',icon:'⚖️',tier:'exec',salary:32,living:13,cond:{wait:1,dice:4},desc:'停留 1 回合準備國考，之後擲骰 ≥ 4 才考上。'},
  {id:'J09',name:'醫生',icon:'🩺',tier:'exec',salary:40,living:15,cond:{wait:2,dice:3},desc:'停留 2 回合實習，之後擲骰 ≥ 3 取得執照。收入很高。'},
  {id:'J10',name:'機師',icon:'👨‍✈️',tier:'exec',salary:38,living:14,cond:{wait:2,dice:4},perk:'flyFree',desc:'停留 2 回合受訓，之後擲骰 ≥ 4 通過考核。搭飛機出國免費。'},
  {id:'J11',name:'新創公司技術長',icon:'🚀',tier:'exec',salary:36,living:12,cond:{},fatigue:30,desc:'無條件，高薪但爆肝：每季疲勞額外 +30，很快就會過勞。'},
  {id:'J12',name:'遠洋漁船船員',icon:'🚢',tier:'office',salary:22,living:6,cond:{},skipChance:.35,desc:'無條件，薪水高、花費少，但每回合有 35% 機率出海無法移動。'},
  {id:'J13',name:'直播網紅',icon:'📱',tier:'free',salary:20,living:8,cond:{},vol:[0,2],desc:'無條件。平均收入不錯，但每季收入在 0 到 2 倍之間大起大落。'}
];

/* ---------- 天命卡（開局每人抽一張，明牌） ---------- */
export const DESTINIES=[
  {id:'D01',name:'看好你的富爸爸',icon:'👨‍👦',desc:'季收入比前一季增加時，爸爸發零用錢：增加額的一半（至少 1 萬）。'},
  {id:'D02',name:'學習天才',icon:'🧠',desc:'卡牌效果要求等待或停留時，少等一回合（受訓、車禍、國外受困）。'},
  {id:'D03',name:'幸運星',icon:'🍀',desc:'好運卡的金額 ×1.5。'},
  {id:'D04',name:'鐵人體質',icon:'💪',desc:'所有增加的疲勞減半。'},
  {id:'D05',name:'人脈王',icon:'📇',desc:'工作卡的錄取擲骰 +1；搶別人的案子成功率 +15 個百分點。'},
  {id:'D06',name:'勤儉持家',icon:'🐷',desc:'生活費 −10%。'},
  {id:'D07',name:'旅行家',icon:'🌏',desc:'在機場出國不用買機票。'},
  {id:'D08',name:'車迷',icon:'🚗',desc:'買車打八折。'},
  {id:'D09',name:'學霸',icon:'🎓',desc:'拿到獎學金，開局學貸只有一半。'},
  {id:'D10',name:'家人後援',icon:'🏠',desc:'每次經過家鄉，家人再塞 2 萬。'}
];

/* ---------- 棋盤 ---------- */
export const TILE_TYPES={
  home:{label:'家鄉',short:'Home'},
  fortune:{label:'好運',short:'Fortune'},
  market:{label:'市場',short:'Market'},
  chance:{label:'機會',short:'Chance'},
  loss:{label:'災難',short:'Loss'},
  airport:{label:'機場',short:'Airport'},
  ramp:{label:'交流道',short:'Ramp'},
  toll:{label:'收費站',short:'Toll'},
  arrival:{label:'入境',short:'Arrival'},
  abroad:{label:'國外',short:'Abroad'},
  return:{label:'回國',short:'Return'},
  exit:{label:'出口',short:'Exit'}
};
// 主地圖 32 格（9×9 外圈，等角棋盤）：0 為家鄉（每次經過抽一張機會卡），9 為機場，12 為高速公路交流道，28 為高速公路出口。
// 走向：家鄉在畫面最下面的角，先沿右下邊往右角，再沿右上邊往頂角，繞過左角回家鄉。
const LAYOUT=['chance','fortune','market','chance','loss','fortune','chance','market','airport','chance','fortune','ramp','chance','loss','market','fortune','chance','fortune','loss','chance','market','chance','fortune','chance','fortune','chance','loss','exit','market','chance','fortune'];
export const BOARD=[{type:'home'},...LAYOUT.map(type=>({type}))];
// 高速公路：有車的玩家經過第 12 格交流道時改走這條，從中央斜穿 7 格到第 28 格出口（略過 13–27 格）；每經過一個收費站付 toll。
export const HIGHWAY={from:12,to:28,tiles:['fortune','chance','toll','chance','fortune','toll','chance'].map(type=>({type})),toll:1};
// 國外（右上角的浮空島，4×4 小環 12 格）：剛好停在機場時可買機票飛過去；在國外只用一個轉輪移動；走到「回國」自動回到機場。
export const ABROAD={tiles:['arrival',...Array(10).fill('abroad'),'return'].map(type=>({type})),ticket:8,airport:9};
// 等角棋盤的格子座標（畫面用）：主地圖是 n×n 外圈、高速公路在 x=m 這一列、國外島是 k×k 小環。
export const MAP=(()=>{
  const ring=n=>{const r=[];for(let y=n-1;y>=1;y--)r.push([n-1,y]);for(let x=n-1;x>=1;x--)r.push([x,0]);for(let y=0;y<=n-2;y++)r.push([0,y]);for(let x=0;x<=n-2;x++)r.push([x,n-1]);return r};
  const n=9,m=4,k=4;
  return {n,m,k,main:ring(n),highway:Array.from({length:n-2},(_,i)=>[m,i+1]),abroad:ring(k)};
})();
// 車子：有車的玩家，每個轉輪的 1／2／3 視為 4／5／6；可全額付清或貸款（頭期 20%，固定年息 3.5%，20 季攤還，明牌）。
export const CAR={price:60,rolesPrice:100,downPct:20,rate:3.5,quarters:20,resale:.8,boost:{1:4,2:5,3:6}};

/* ---------- Fortune：純運氣，必定獲利 ---------- */
// weight 為抽中權重；cash 可依收入階層給不同金額。
export const FORTUNE_CARDS=[
  {id:'F01',name:'統一發票中 1,000 元',weight:30,cash:.1,desc:'對獎時發現中了六獎，小確幸。'},
  {id:'F02',name:'撿到錢包物歸原主',weight:15,cash:.3,desc:'失主堅持要你收下謝禮。'},
  {id:'F03',name:'長輩包紅包',weight:15,cash:1,desc:'過年回家，阿嬤偷偷塞了一包。'},
  {id:'F04',name:'退稅入帳',weight:12,cash:{low:.5,office:1.5,exec:5,free:2},desc:'今年報稅多扣了，國稅局退錢。'},
  {id:'F05',name:'尾牙抽中大獎',weight:10,cash:5,desc:'抽中一台機車，轉賣換現金。自由業則是大客戶年底送的紅包。'},
  {id:'F06',name:'二手拍賣賺一筆',weight:10,cash:2,desc:'把家裡用不到的東西上網拍賣。'},
  {id:'F07',name:'刮刮樂中 10 萬',weight:6,cash:10,desc:'順手買的刮刮樂，刮出十萬。'},
  {id:'F08',name:'繼承遠房親戚遺產',weight:1.5,cash:{low:15,office:25,exec:60,free:25},desc:'從沒見過面的叔公留了一筆錢給你。金額約一季半的收入，足夠改善生活，但不會讓人一夕達標。'},
  {id:'F09',name:'統一發票千萬特獎',weight:.15,cash:1000,desc:'千萬特獎！全台每期只有幾張。'},
  {id:'F10',name:'威力彩頭獎',weight:.05,cash:3000,desc:'中獎機率約兩千兩百萬分之一，你就是那個人。'}
];

/* ---------- Market：影響整個市場 ---------- */
// macro：對成長率、通膨、失業率、股市的衝擊（依 decay 逐季衰減）；rateShock：直接調整政策利率。
// roles：各階層的收入／生活費百分比變動（持續 duration 季）；permanent：永久薪資或物價變動；cash：一次性給付。
export const MARKET_EVENTS=[
  {id:'M01',name:'區域戰爭爆發',duration:4,decay:[1,.75,.5,.25],macro:{growth:-3,inflation:3,stock:-25},
    roles:{low:{living:8},office:{living:8},exec:{living:8},free:{living:8,income:-20}},desc:'能源與原物料大漲，景氣急凍。所有人的生活費都變貴，接案市場最先受傷。'},
  {id:'M02',name:'政府調漲基本工資',duration:4,decay:[1,1,1,1],macro:{inflation:.5},permanent:{low:{salary:8}},
    roles:{exec:{income:-6}},desc:'基本工資調漲 8%。基層工作直接加薪；企業人事成本上升，高薪專業人士的獎金縮水。'},
  {id:'M03',name:'AI 科技熱潮',duration:4,decay:[1,.8,.6,.4],macro:{growth:2,stock:20},
    roles:{free:{income:25},office:{income:5},exec:{income:8},low:{income:-6}},desc:'企業大舉投資 AI。接案需求暴增，但基層工作開始被自動化取代。'},
  {id:'M04',name:'房市狂飆',duration:4,decay:[1,1,1,1],macro:{inflation:.5},prices:{house:12},
    roles:{low:{living:6},office:{living:6},exec:{living:6},free:{living:6}},desc:'房價一年漲一成，房東跟著漲房租，所有人的生活費都變高。'},
  {id:'M05',name:'全球疫情爆發',duration:3,decay:[1,.6,.3],macro:{growth:-4,unemployment:2,stock:-20},
    roles:{free:{income:-35},low:{income:-15},exec:{income:-5}},desc:'服務業停擺。基層被減班，接案工作者案源斷炊，坐辦公室的影響最小。'},
  {id:'M06',name:'央行意外升息',duration:1,decay:[1],rateShock:.5,macro:{},desc:'為了壓通膨，央行一次升息半碼以上。信用貸款馬上變貴，存款利息則變多。'},
  {id:'M07',name:'景氣復甦',duration:3,decay:[1,.7,.4],macro:{growth:2,unemployment:-1,stock:10},
    roles:{low:{income:5},office:{income:5},exec:{income:5},free:{income:15}},desc:'訂單回流，各行各業都比較好賺。'},
  {id:'M08',name:'物價飆漲',duration:3,decay:[1,.7,.4],macro:{inflation:4},
    roles:{low:{living:6},office:{living:5},exec:{living:4},free:{living:5}},desc:'菜價、油價、房租一起漲，收入越低感受越深。'},
  {id:'M09',name:'車廠降價促銷',duration:1,decay:[1],prices:{car:-10},macro:{},desc:'各大車廠祭出優惠，新車便宜一成。'},
  {id:'M10',name:'政府普發現金',duration:1,decay:[1],cash:{low:.6,office:.6,exec:.6,free:.6},macro:{inflation:.2},desc:'全民普發 6,000 元。'},
  {id:'M11',name:'減稅方案上路',duration:1,decay:[1],cash:{low:.5,office:1.2,exec:4,free:1},macro:{growth:.5},desc:'所得稅級距調整，收入越高省越多。'},
  {id:'M12',name:'產業外移裁員潮',duration:3,decay:[1,.7,.4],macro:{growth:-1.5,unemployment:2.5},
    roles:{low:{income:-20},office:{income:-10},exec:{income:-10},free:{income:-10}},desc:'工廠外移，基層首當其衝，其他人的加薪和獎金也縮水。'}
];

/* ---------- Chance：唯一需要玩家決定的格子 ---------- */
// stake：選擇後立即支付的金額（可依收入階層不同）；outcomes 依機率擇一。
// 效果欄位：cash（現金）、stakeX（拿回本金的倍數）、salary（永久薪資 %）、delayedSalary、income（暫時收入 %）、
// flatIncome（每季固定額外收入）、fatigue（疲勞）、unemployed（失業季數）、investment、insurance、skip、delayedCash。
export const CHANCE_CARDS=[
  {id:'C01',name:'朋友報明牌',desc:'朋友說某檔股票下個月一定漲，問你要不要跟。',options:[
    {label:'投入 5 萬',stake:5,outcomes:[{p:.35,stakeX:1.8,text:'真的漲了！賺了八成。'},{p:.65,stakeX:.5,text:'消息是假的，認賠一半出場。'}]},
    {label:'投入 20 萬',stake:20,outcomes:[{p:.45,stakeX:1.8,text:'真的漲了！賺了八成。'},{p:.55,stakeX:.5,text:'消息是假的，認賠一半出場。'}]},
    {label:'不跟',stake:0,outcomes:[{p:1,text:'你沒有跟。'}]}]},
  {id:'C02',name:'聽到併購小道消息',desc:'聽說某家公司要被收購，股價會大漲。',options:[
    {label:'買進 10 萬',stake:10,outcomes:[{p:.3,stakeX:2,text:'併購成真，股價翻倍。'},{p:.7,stakeX:.5,text:'只是謠言，股價跌回一半。'}]},
    {label:'不相信',stake:0,outcomes:[{p:1,text:'你決定不碰。'}]}]},
  {id:'C03',name:'朋友邀你合夥開店',desc:'朋友想開手搖飲料店，缺一位出資股東。',options:[
    {label:'投資 30 萬',stake:30,outcomes:[{p:.6,investment:{name:'飲料店股份',value:30,income:3},text:'生意不錯，每季分紅 3 萬。'},{p:.4,text:'開幕半年就收了，本金全虧。'}]},
    {label:'婉拒',stake:0,outcomes:[{p:1,text:'你婉拒了。'}]}]},
  {id:'C04',name:'進修機會',desc:'報名課程提升能力，短期花錢、長期加薪。',options:[
    {label:{low:'考證照（8 萬）',office:'在職碩士（15 萬）',exec:'EMBA（40 萬）',free:'線上專業課（6 萬）'},stake:{low:8,office:15,exec:40,free:6},
      outcomes:[{p:1,delayedSalary:{after:2,pct:{low:12,office:10,exec:8,free:10}},text:'兩季後完成課程，收入永久提升。'}]},
    {label:'這次先不要',stake:0,outcomes:[{p:1,text:'你決定先不進修。'}]}]},
  {id:'C05',name:'獵頭挖角',desc:'有公司開出更好的條件。自由業則是收到長期合約邀請。',options:[
    {label:{low:'跳槽',office:'跳槽',exec:'跳槽',free:'簽長期合約'},stake:0,
      outcomes:{default:[{p:.7,salary:15,text:'新工作順利，薪水永久提高 15%。'},{p:.3,unemployed:1,text:'試用期沒過，失業一季。'}],
        free:[{p:1,flatIncome:{amount:6,rounds:4},text:'未來 4 季每季多 6 萬固定收入。'}]}},
    {label:'留在原地',stake:0,outcomes:[{p:1,text:'你決定不動。'}]}]},
  {id:'C06',name:'直銷說明會',desc:'老同學邀你加入「穩賺不賠」的事業。',options:[
    {label:'加入（6 萬）',stake:6,outcomes:[{p:.08,stakeX:4,text:'你是少數真的賺到錢的人。'},{p:.92,text:'貨賣不出去，6 萬全賠。'}]},
    {label:'拒絕',stake:0,outcomes:[{p:1,text:'你看穿了這是老鼠會。'}]}]},
  {id:'C07',name:'加密貨幣暴漲傳聞',desc:'網路上都在說某個幣要上天了。',options:[
    {label:'投入 10 萬',stake:10,outcomes:[{p:.25,stakeX:3,text:'真的漲了三倍！'},{p:.75,stakeX:.2,text:'幣價崩盤，只剩兩成。'}]},
    {label:'投入 30 萬',stake:30,outcomes:[{p:.3,stakeX:3,text:'真的漲了三倍！'},{p:.7,stakeX:.25,text:'幣價崩盤，只剩兩成五。'}]},
    {label:'不碰',stake:0,outcomes:[{p:1,text:'你沒有跟風。'}]}]},
  {id:'C08',name:'保險業務推銷',desc:'投保後每季繳保費，遇到重病、車禍、火災或在國外就醫時理賠八成。',options:[
    {label:'投保（每季 0.6 萬）',stake:0,outcomes:[{p:1,insurance:true,text:'保單生效。'}]},
    {label:'不需要',stake:0,outcomes:[{p:1,text:'你決定自己承擔風險。'}]}]},
  {id:'C09',name:'急件找上門',desc:'有人臨時需要人手，報酬不錯但很累。',options:[
    {label:'接下來',stake:0,outcomes:[{p:1,cash:{low:2,office:3,exec:8,free:6},fatigue:25,text:'忙了一整季，多賺一筆，但也累壞了。'}]},
    {label:'推掉',stake:0,outcomes:[{p:1,text:'你選擇休息。'}]}]},
  {id:'C10',name:'參加互助會（標會）',desc:'每季繳 3 萬，6 季後一次拿回 22 萬。但會頭可能倒會。',options:[
    {label:'參加',stake:0,outcomes:[{p:.85,investment:{name:'互助會',value:0,income:-3,maturity:6,payout:22},text:'你加入了互助會。'},{p:.15,investment:{name:'互助會',value:0,income:-3,maturity:6,payout:0,collapse:true},text:'你加入了互助會。'}]},
    {label:'不參加',stake:0,outcomes:[{p:1,text:'你決定不參加。'}]}]},
  {id:'C11',name:'好友開口借錢',desc:'多年好友急需 10 萬周轉，說半年內一定還。',options:[
    {label:'借他 10 萬',stake:10,outcomes:[{p:.6,delayedCash:{after:2,amount:11},text:'朋友半年後還了 11 萬。'},{p:.4,text:'朋友從此聯絡不上。'}]},
    {label:'婉拒',stake:0,outcomes:[{p:1,text:'你婉拒了。'}]}]},
  {id:'C12',name:'預售屋投資',desc:'建商推出預售屋，訂金 50 萬，完工前可轉手。',options:[
    {label:'下訂（50 萬）',stake:50,outcomes:[{p:.55,stakeX:1.4,text:'房價上漲，轉手賺四成。'},{p:.45,stakeX:.8,text:'房市冷卻，認賠兩成轉手。'}]},
    {label:'不買',stake:0,outcomes:[{p:1,text:'你沒有出手。'}]}]},
  // 互動卡（移植自企業版 P10 策略聯盟、P14 搶下對手大客戶）：指定對象的選項會依其他玩家展開，對方要回應。
  // 實際規則與數值在下方 INTERACT；這裡的 outcomes 只用來在介面上說明機率。
  {id:'C13',name:'找人合作',interactive:true,desc:'邀請一位玩家合作，對方可以拒絕。答應後 75% 合作順利：雙方收入 +15%，持續 3 季，期間任一方的災難損失由另一方分擔 20%；25% 鬧翻：雙方收入 −10%，持續 2 季。被拒絕可以再邀另一位一次，邀到人的話，拒絕你的人收入 −5%，持續 2 季。',options:[
    {label:'邀請一位玩家合作',invite:true,stake:0,outcomes:[{p:.75,text:'對方答應後：合作順利，雙方收入 +15%，持續 3 季。'},{p:.25,text:'對方答應後：鬧翻，雙方收入 −10%，持續 2 季。'}]},
    {label:'自己來',stake:0,outcomes:[{p:1,text:'你決定自己做。'}]}]},
  {id:'C14',name:'搶下對方的大案子',interactive:true,desc:'付 1 萬投標費，搶另一位玩家的案子。成功率看雙方薪水（20%～80%），對方可以花 1 萬反制讓成功率減半；反制後你沒搶到，投標費歸對方。搶到的話 2 季內每季轉走對方薪資的 10%（最多 3 萬）。失業的人沒有案子可搶。搶自己的合作夥伴算背叛：合作立刻結束，對方 70% 告贏求償。',options:[
    {label:'指定一位玩家搶案子',steal:true,stake:1,outcomes:[{p:.5,text:'搶到案子。'},{p:.5,text:'沒搶到，投標費拿不回來。'}]},
    {label:'不跟人搶',stake:0,outcomes:[{p:1,text:'你決定不跟人搶。'}]}]}
];

// 互動卡規則。合作：同一時間只能有一個；背叛過的兩人不能再合作。搶案：同一人一次只能被搶一件，結束後 2 季內不能再被選。
export const INTERACT={
  alliance:{accept:.75,pct:15,rounds:3,falloutPct:-10,falloutRounds:2,share:.2,declinePct:-5,declineRounds:2,maxInvites:2},
  steal:{fee:1,minChance:.2,maxChance:.8,share:.1,cap:3,rounds:2,counterFee:1,immunity:2},
  lawsuit:{win:.7,pct:15}   // 背叛：被背叛方 70% 勝訴，賠償＝合作剩餘季數 × 15% × 被背叛方平均薪資，案子也要還回來
};

/* ---------- Loss：毀滅性打擊 ---------- */
// insured：有保險時的實際損失比例（理賠八成 → 0.2）。
export const LOSS_CARDS=[
  {id:'L01',name:'重病住院',cost:20,insurable:true,income:-50,desc:'住院開刀，醫藥費 20 萬，本季收入減半。'},
  {id:'L02',name:'被裁員／案源斷炊',unemployed:{low:2,office:2,exec:1,free:2},desc:'失去收入。基層與上班族可領失業給付（六成薪），高薪專業人士一季內就找到新工作，自由業沒有任何保障。'},
  {id:'L03',name:'遇到詐騙集團',cashPct:30,cap:100,desc:'假投資、真詐騙，存款被騙走三成（最多 100 萬）。'},
  {id:'L04',name:'嚴重車禍',cost:15,insurable:true,skip:true,desc:'修車加醫藥費 15 萬，下一回合無法行動。'},
  {id:'L05',name:'住處火災',cost:{low:10,office:15,exec:25,free:10},insurable:true,desc:'家具家電全毀，住得越好、損失越大。'},
  {id:'L06',name:'投資標的被掏空',wipeInvestments:true,cost:5,desc:'所有投資歸零；沒有投資的人也賠了 5 萬手續費與違約金。'}
];

/* ---------- 經濟與 AI 央行 ---------- */
export const ECONOMY={growth:2,inflation:2,unemployment:4,rate:2,stock:100,noise:.6};
export const INSURANCE={premium:.6,coverage:.8};
export const FATIGUE={none:-20,overtime1:10,overtime2:25,burnout:70,burnoutIncome:-20,restStop:-20};
export const OVERTIME={1:{income:15,label:'加班'},2:{income:30,label:'爆肝'}};
export const CREDIT={spread:8,limitQuarters:2};
// 規則依優先序檢查，採用第一條符合的；利率調整後冷卻 2 季。
// 謠言類機會卡（C01、C02、C07）期望值刻意設為負：跟風消息長期來看會賠錢。
export const CENTRAL_BANK_RULES=[
  {id:'R1',name:'通膨失控',test:'inflation>=4',action:+.5,text:'通膨 ≥ 4% → 升息 0.5 個百分點'},
  {id:'R2',name:'經濟衰退',test:'growth<=-2',action:-.5,text:'成長率 ≤ −2% → 降息 0.5 個百分點'},
  {id:'R3',name:'通膨偏高',test:'inflation>=3',action:+.25,text:'通膨 ≥ 3% → 升息 0.25 個百分點'},
  {id:'R4',name:'失業偏高',test:'unemployment>=6',action:-.25,text:'失業率 ≥ 6% → 降息 0.25 個百分點'},
  {id:'R5',name:'股市崩跌',test:'stockDrop>=20',action:-.25,text:'股市單季跌 ≥ 20% → 降息 0.25 個百分點'},
  {id:'R6',name:'景氣過熱',test:'growth>=4',action:+.25,text:'成長率 ≥ 4% → 升息 0.25 個百分點'},
  {id:'R7',name:'回歸中性',test:'rate>=2.5&&inflation<=2.5',action:-.25,text:'利率 ≥ 2.5% 且通膨 ≤ 2.5% → 降息 0.25 個百分點（通膨退燒後把利率慢慢降回中性的 2%）'}
];
export const RATE_BOUNDS=[.125,6];

/* ---------- 預留功能 ---------- */
export const PLANNED={
  stock:['個股與 ETF 買賣，價格跟著景氣指數與市場事件波動','股利與除權息','融資融券（槓桿風險）'],
  shop:['保險方案（醫療、意外、產險）','進修課程與證照','代步工具、家電等消費品（影響疲勞或生活費）','理財顧問服務']
};

/* ---------- 國外卡（只在國外路線抽） ---------- */
// 好處比主地圖多，但也有少量更糟的懲罰。cost 為損失；insurable 可用保險減輕；wait 為受困回合。
export const ABROAD_CARDS=[
  {id:'A01',name:'海外打工度假',weight:18,cash:8,desc:'在澳洲農場打工一季，存下一筆錢。'},
  {id:'A02',name:'代購賺價差',weight:18,cash:5,desc:'幫朋友代購限定商品，賺了價差。'},
  {id:'A03',name:'簽下海外客戶',weight:12,flatIncome:{amount:4,rounds:4},desc:'談成一個海外長期客戶，未來 4 季每季多 4 萬。'},
  {id:'A04',name:'匯率大好',weight:12,cash:6,desc:'換匯時機剛好，多賺一筆。'},
  {id:'A05',name:'國際研討會被挖角',weight:8,salary:8,desc:'在研討會認識的主管開出加薪條件，薪水永久 +8%。'},
  {id:'A06',name:'海外語言進修',weight:8,salary:5,desc:'語言能力大進步，薪水永久 +5%。'},
  {id:'A07',name:'免稅店失心瘋',weight:6,cost:4,desc:'一不小心刷了 4 萬。'},
  {id:'A08',name:'護照錢包被偷',weight:8,cost:6,desc:'補辦證件加上損失的現金，共 6 萬。'},
  {id:'A09',name:'海外就醫沒有健保',weight:6,cost:20,insurable:true,desc:'急診加住院 20 萬，有保險理賠八成。'},
  {id:'A10',name:'誤入詐騙園區',weight:2,cashPct:50,cap:150,wait:1,desc:'被高薪工作騙去，存款被騙走一半（最多 150 萬），還受困 1 回合。'},
  {id:'A11',name:'班機大延誤',weight:2,fatigue:20,desc:'在機場睡了兩晚，疲勞 +20。'}
];

/* ---------- 景氣改變棋盤 ---------- */
// 依上一季結算的成長率決定景氣狀態：衰退時部分市場格變成災難格；過熱時好運格獎金加成。
export const ECON_TILES={
  recession:{label:'衰退',growth:-1.5,flip:[3,21],to:'loss',text:'景氣衰退：第 3、21 格的市場格變成災難格'},
  boom:{label:'過熱',growth:3.5,fortuneMultiplier:1.5,text:'景氣過熱：好運格獎金 ×1.5'}
};
