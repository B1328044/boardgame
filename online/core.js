// 由 ../personal/data.js、../personal/engine.js、../personal/bot.js、../personal/iso.js、./room.mjs 產生，請勿直接修改；改完原始檔後執行 node online/build.mjs。
'use strict';
// 人生棋局：所有金額單位為「萬元」，一回合代表一季（3 個月）。
// 所有人從相同的基本工作與學貸開始，靠工作卡、天命卡與理財決策拉開差距。
// 改動數值後請重跑 simulate.mjs 並產出試算表報告。

const UNIT='萬';

/* ---------- 收入階層 ---------- */
// 市場事件、部分卡片的金額依「階層」而定；玩家的階層由手上的工作卡決定（沒有工作卡＝基層的基本工作）。
const TIERS=[
  {id:'low',name:'基層',icon:'🧹'},
  {id:'office',name:'上班族',icon:'💼'},
  {id:'exec',name:'高薪專業',icon:'🏙️'},
  {id:'free',name:'自由業',icon:'🎨'}
];

/* ---------- 角色（B 角色版用） ---------- */
// 角色版：開局選角色，各有收入、負債與勝利目標（組員校準的數值）。工作卡版不使用。
// salary：每季稅後收入；living：每季生活費（隨物價指數上升）；debts：起始負債。
// rate 為年利率（%），payment 為每季應繳；variable=true 代表跟著央行利率浮動。
const ROLES=[
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
const START={cash:5,debts:[{type:'student',name:'學貸',balance:36,rate:1.5,payment:1.5,public:true}]};
// 勝利：淨資產（現金＋投資＋車子殘值－負債）先達標者獲勝；季數用完時淨資產最高者獲勝。
const GOAL={netWorth:300,text:'淨資產達到 300 萬'};

/* ---------- 工作卡（混在機會卡牌堆中） ---------- */
// salary／living：每季收入與生活費；tier：收入階層；cond：取得條件
//   wait：先停留 N 回合受訓，之後擲一顆骰子 ≥ dice 才錄取；dice：當場擲骰；cost：先付學費；car：需要有車
// perk：flyFree 搭機免費、flyHalf 機票半價；fatigue：每季額外疲勞；skipChance：每回合無法移動的機率
// vol：自由業收入浮動範圍 [最低倍數, 幅度]
const BASE_JOB={id:'J00',name:'基本工作',icon:'🧾',tier:'low',salary:9,living:4.4,desc:'沒有工作卡時的工作：時薪打工、門市、臨時工。'};
const JOBS=[
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
const DESTINIES=[
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
const TILE_TYPES={
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
const BOARD=[{type:'home'},...LAYOUT.map(type=>({type}))];
// 高速公路：有車的玩家經過第 12 格交流道時改走這條，從中央斜穿 7 格到第 28 格出口（略過 13–27 格）；每經過一個收費站付 toll。
const HIGHWAY={from:12,to:28,tiles:['fortune','chance','toll','chance','fortune','toll','chance'].map(type=>({type})),toll:1};
// 國外（右上角的浮空島，4×4 小環 12 格）：剛好停在機場時可買機票飛過去；在國外只用一個轉輪移動；走到「回國」自動回到機場。
const ABROAD={tiles:['arrival',...Array(10).fill('abroad'),'return'].map(type=>({type})),ticket:8,airport:9};
// 等角棋盤的格子座標（畫面用）：主地圖是 n×n 外圈、高速公路在 x=m 這一列、國外島是 k×k 小環。
const MAP=(()=>{
  const ring=n=>{const r=[];for(let y=n-1;y>=1;y--)r.push([n-1,y]);for(let x=n-1;x>=1;x--)r.push([x,0]);for(let y=0;y<=n-2;y++)r.push([0,y]);for(let x=0;x<=n-2;x++)r.push([x,n-1]);return r};
  const n=9,m=4,k=4;
  return {n,m,k,main:ring(n),highway:Array.from({length:n-2},(_,i)=>[m,i+1]),abroad:ring(k)};
})();
// 車子：有車的玩家，每個轉輪的 1／2／3 視為 4／5／6；可全額付清或貸款（頭期 20%，固定年息 3.5%，20 季攤還，明牌）。
const CAR={price:60,rolesPrice:100,downPct:20,rate:3.5,quarters:20,resale:.8,boost:{1:4,2:5,3:6}};

/* ---------- Fortune：純運氣，必定獲利 ---------- */
// weight 為抽中權重；cash 可依收入階層給不同金額。
const FORTUNE_CARDS=[
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
const MARKET_EVENTS=[
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
const CHANCE_CARDS=[
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
const INTERACT={
  alliance:{accept:.75,pct:15,rounds:3,falloutPct:-10,falloutRounds:2,share:.2,declinePct:-5,declineRounds:2,maxInvites:2},
  steal:{fee:1,minChance:.2,maxChance:.8,share:.1,cap:3,rounds:2,counterFee:1,immunity:2},
  lawsuit:{win:.7,pct:15}   // 背叛：被背叛方 70% 勝訴，賠償＝合作剩餘季數 × 15% × 被背叛方平均薪資，案子也要還回來
};

/* ---------- Loss：毀滅性打擊 ---------- */
// insured：有保險時的實際損失比例（理賠八成 → 0.2）。
const LOSS_CARDS=[
  {id:'L01',name:'重病住院',cost:20,insurable:true,income:-50,desc:'住院開刀，醫藥費 20 萬，本季收入減半。'},
  {id:'L02',name:'被裁員／案源斷炊',unemployed:{low:2,office:2,exec:1,free:2},desc:'失去收入。基層與上班族可領失業給付（六成薪），高薪專業人士一季內就找到新工作，自由業沒有任何保障。'},
  {id:'L03',name:'遇到詐騙集團',cashPct:30,cap:100,desc:'假投資、真詐騙，存款被騙走三成（最多 100 萬）。'},
  {id:'L04',name:'嚴重車禍',cost:15,insurable:true,skip:true,desc:'修車加醫藥費 15 萬，下一回合無法行動。'},
  {id:'L05',name:'住處火災',cost:{low:10,office:15,exec:25,free:10},insurable:true,desc:'家具家電全毀，住得越好、損失越大。'},
  {id:'L06',name:'投資標的被掏空',wipeInvestments:true,cost:5,desc:'所有投資歸零；沒有投資的人也賠了 5 萬手續費與違約金。'}
];

/* ---------- 經濟與 AI 央行 ---------- */
const ECONOMY={growth:2,inflation:2,unemployment:4,rate:2,stock:100,noise:.6};
const INSURANCE={premium:.6,coverage:.8};
const FATIGUE={none:-20,overtime1:10,overtime2:25,burnout:70,burnoutIncome:-20,restStop:-20};
const OVERTIME={1:{income:15,label:'加班'},2:{income:30,label:'爆肝'}};
const CREDIT={spread:8,limitQuarters:2};
// 規則依優先序檢查，採用第一條符合的；利率調整後冷卻 2 季。
// 謠言類機會卡（C01、C02、C07）期望值刻意設為負：跟風消息長期來看會賠錢。
const CENTRAL_BANK_RULES=[
  {id:'R1',name:'通膨失控',test:'inflation>=4',action:+.5,text:'通膨 ≥ 4% → 升息 0.5 個百分點'},
  {id:'R2',name:'經濟衰退',test:'growth<=-2',action:-.5,text:'成長率 ≤ −2% → 降息 0.5 個百分點'},
  {id:'R3',name:'通膨偏高',test:'inflation>=3',action:+.25,text:'通膨 ≥ 3% → 升息 0.25 個百分點'},
  {id:'R4',name:'失業偏高',test:'unemployment>=6',action:-.25,text:'失業率 ≥ 6% → 降息 0.25 個百分點'},
  {id:'R5',name:'股市崩跌',test:'stockDrop>=20',action:-.25,text:'股市單季跌 ≥ 20% → 降息 0.25 個百分點'},
  {id:'R6',name:'景氣過熱',test:'growth>=4',action:+.25,text:'成長率 ≥ 4% → 升息 0.25 個百分點'},
  {id:'R7',name:'回歸中性',test:'rate>=2.5&&inflation<=2.5',action:-.25,text:'利率 ≥ 2.5% 且通膨 ≤ 2.5% → 降息 0.25 個百分點（通膨退燒後把利率慢慢降回中性的 2%）'}
];
const RATE_BOUNDS=[.125,6];

/* ---------- 預留功能 ---------- */
const PLANNED={
  stock:['個股與 ETF 買賣，價格跟著景氣指數與市場事件波動','股利與除權息','融資融券（槓桿風險）'],
  shop:['保險方案（醫療、意外、產險）','進修課程與證照','代步工具、家電等消費品（影響疲勞或生活費）','理財顧問服務']
};

/* ---------- 國外卡（只在國外路線抽） ---------- */
// 好處比主地圖多，但也有少量更糟的懲罰。cost 為損失；insurable 可用保險減輕；wait 為受困回合。
const ABROAD_CARDS=[
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
const ECON_TILES={
  recession:{label:'衰退',growth:-1.5,flip:[3,21],to:'loss',text:'景氣衰退：第 3、21 格的市場格變成災難格'},
  boom:{label:'過熱',growth:3.5,fortuneMultiplier:1.5,text:'景氣過熱：好運格獎金 ×1.5'}
};



// 兩種玩法共用同一套引擎：
//   jobs（A 工作卡版）：所有人從基本工作與學貸開始，靠工作卡換工作，淨資產先到目標者獲勝。
//   roles（B 角色版）：開局選四種角色之一，各有收入、負債與勝利目標，沒有工作卡。
// 天命卡、家鄉、買車與高速公路、機場與國外、合作／搶案子、景氣改變棋盤兩版都有。
const VARIANTS={jobs:{label:'工作卡版',short:'A'},roles:{label:'角色版',short:'B'}};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const round2=n=>Math.round((n+Number.EPSILON)*100)/100;
const tierById=id=>TIERS.find(r=>r.id===id);
const roleById=id=>ROLES.find(r=>r.id===id);
const jobById=id=>id?JOBS.find(j=>j.id===id):BASE_JOB;
// 角色版沒有工作卡：把角色當成一份固定的「工作」，收入、生活費與階層都來自角色。
const roleJob=r=>({id:`R-${r.id}`,name:r.title,icon:r.icon,tier:r.id,salary:r.salary,living:r.living,bonusMonths:r.bonusMonths,desc:r.story,role:true});
const jobOf=p=>p.variant==='roles'?roleJob(roleById(p.roleId)):jobById(p.jobId);
const destinyById=id=>DESTINIES.find(d=>d.id===id);
const hasDestiny=(p,id)=>p.destinyId===id;
const cardById=id=>[...FORTUNE_CARDS,...MARKET_EVENTS,...CHANCE_CARDS,...LOSS_CARDS,...JOBS,...ABROAD_CARDS].find(c=>c.id===id);
const isJobCard=card=>!!card&&card.id.startsWith('J');
// 階層相關數值：可以是數字，或 {low:..,office:..,exec:..,free:..,default:..}
const val=(x,tier)=>x!==null&&typeof x==='object'&&!Array.isArray(x)?(x[tier]??x.default??0):x??0;
const nextRandom=state=>{let x=state.rng|0;x^=x<<13;x^=x>>>17;x^=x<<5;state.rng=x|0;return (x>>>0)/4294967296};
const weightedPick=(state,items)=>{const total=items.reduce((s,x)=>s+x.weight,0);let r=nextRandom(state)*total;for(const x of items){r-=x.weight;if(r<0)return x}return items.at(-1)};
const pickOutcome=(state,outcomes)=>{let r=nextRandom(state);for(const o of outcomes){r-=o.p;if(r<0)return o}return outcomes.at(-1)};
const d6=state=>1+Math.floor(nextRandom(state)*6);
const playerById=(state,id)=>state.players.find(p=>p.id===id);
const current=state=>state.players[state.turnIndex];
const say=(state,text)=>state.log.unshift(`第 ${state.round} 季｜${text}`);
const money=n=>`${round2(n).toLocaleString('zh-TW',{maximumFractionDigits:2})} 萬`;

/* ---------- 景氣改變棋盤 ---------- */
function economyRegime(state){
  const g=state.economy.growth;
  return g<=ECON_TILES.recession.growth?'recession':g>=ECON_TILES.boom.growth?'boom':'normal';
}

/* ---------- 地圖 ---------- */
const TRACKS={main:BOARD,highway:HIGHWAY.tiles,abroad:ABROAD.tiles};
// 這一格目前實際的類型（主地圖衰退時，部分市場格會變成災難格）。
function tileAt(track,i,state){
  const tile=TRACKS[track][i];
  if(state&&track==='main'&&tile.type==='market'&&economyRegime(state)==='recession'&&ECON_TILES.recession.flip.includes(i))return {...tile,type:ECON_TILES.recession.to,flipped:true};
  return tile;
}
const tileType=(state,i,track='main')=>tileAt(track,i,state).type;
const tileFlipped=(state,i,track='main')=>!!tileAt(track,i,state).flipped;
const nodeKey=n=>`${n.t}-${n.i}`;
const TILE_NAMES={home:'家鄉',fortune:'好運',market:'市場',chance:'機會',loss:'災難',airport:'機場',ramp:'交流道',toll:'收費站',arrival:'入境',abroad:'國外',return:'回國',exit:'出口'};
function tileLabel(track,i,state){if(typeof track==='number'){state=i;i=track;track='main'}const t=tileAt(track,i,state).type;return `${track==='highway'?'高速公路·':track==='abroad'?'國外·':''}${TILE_NAMES[t]}`}
function nextNode(n,p){
  if(n.t==='main'){if(n.i===HIGHWAY.from&&p.owns.car&&p.useHighway)return {t:'highway',i:0};return {t:'main',i:(n.i+1)%BOARD.length}}
  if(n.t==='highway')return n.i<HIGHWAY.tiles.length-1?{t:'highway',i:n.i+1}:{t:'main',i:HIGHWAY.to};
  return {t:'abroad',i:Math.min(n.i+1,ABROAD.tiles.length-1)};
}
// 從玩家目前位置走 steps 步的路徑（不含起點）；在國外走到「回國」就停。
function movementPath(p,steps){
  const path=[];let n={t:p.track,i:p.position};
  for(let k=0;k<steps;k++){n=nextNode(n,p);path.push(n);if(n.t==='abroad'&&tileAt('abroad',n.i).type==='return')break}
  return path;
}

/* ---------- 建立對局 ---------- */
// variant：'jobs'（A 工作卡版）或 'roles'（B 角色版，每位玩家要給 roleId）。
// dealDestinies=true 時直接發完天命卡（模擬與測試用）；否則對局從「抽天命卡」階段開始，每位玩家輪流自己抽。
function createGame({players,seed=Date.now(),maxRounds=24,dealDestinies=false,variant='jobs'}){
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
function drawDestiny(state,forcedId){
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
const totalDebt=p=>round2(p.debts.reduce((s,d)=>s+d.balance,0));
const netWorth=p=>round2(p.cash+p.investments.reduce((s,x)=>s+(x.value||0),0)+(p.carValue||0)-totalDebt(p));
function debtRate(state,d){
  if(d.type==='mortgage'&&d.variable)return round2(state.economy.rate+.6);
  if(d.type==='credit')return round2(state.economy.rate+CREDIT.spread);
  return d.rate;
}
// 每筆負債本季要繳多少：至少繳清利息（利率上升時月付金不夠付利息，差額也要付），最多繳到還清。
// 預估（computeQuarter）與季結算都用這一個函式，避免「畫面扣的錢」和「實際扣的錢」不一樣。
function debtDue(state,d){const interest=round2(d.balance*debtRate(state,d)/400);return {interest,pay:round2(Math.min(d.balance+interest,Math.max(d.payment,interest)))}}
function quarterlyPayments(state,p){return round2(p.debts.reduce((s,d)=>s+debtDue(state,d).pay,0))}
const baseSalary=p=>round2(jobOf(p).salary*p.salaryFactor);
function creditLimit(p){return round2(jobOf(p).salary*CREDIT.limitQuarters)}
function creditUsed(p){return round2(p.debts.filter(d=>d.type==='credit').reduce((s,d)=>s+d.balance,0))}
function annuity(principal,annualRate,quarters){const r=annualRate/400;return r===0?principal/quarters:principal*r/(1-(1+r)**-quarters)}
function marketPct(state,tier,key){
  return state.marketActive.reduce((s,a)=>{const e=cardById(a.eventId),age=state.round-a.startedRound;return s+(age>=0&&age<e.duration?(e.roles?.[tier]?.[key]||0)*e.decay[age]:0)},0);
}
// 疲勞：增加的部分在「鐵人體質」下減半。
function addFatigue(p,n){p.fatigue=clamp(p.fatigue+(n>0&&hasDestiny(p,'D04')?n/2:n),0,100)}
// 等待回合：「學習天才」少等一回合。回傳實際等待回合數。
function addWait(p,n,reason){const w=Math.max(0,n-(hasDestiny(p,'D02')?1:0));if(w>0){p.waitTurns+=w;p.waitReason=reason}return w}

// 預估或實際計算一季收支。random=null 時浮動收入取期望值（供介面預覽）。
function computeQuarter(state,p,{random=null}={}){
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
function effectiveReels(p,reels){
  if(p.track==='abroad')return [reels[0],0];
  return p.owns.car?reels.map(v=>CAR.boost[v]??v):[...reels];
}
function rollDice(state,forced){
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
const heldJobIds=state=>state.players.flatMap(p=>[p.jobId,p.training?.jobId]).filter(Boolean);
// 機會牌堆：工作卡版混入還沒被人拿走的工作卡；角色版只有機會卡。
function chanceDeck(state){
  if(state.variant==='roles')return [...CHANCE_CARDS];
  const held=new Set(heldJobIds(state));return [...CHANCE_CARDS,...JOBS.filter(j=>!held.has(j.id))];
}
const drawChanceCard=state=>{const deck=chanceDeck(state);return deck[Math.floor(nextRandom(state)*deck.length)]};
function drawEvent(state,forcedId){
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
function activeAlliance(state,p){return p.effects.find(x=>x.source==='C13'&&x.until>=state.round)||null}
const allied=(state,a,b)=>activeAlliance(state,a)?.partnerId===b.id;
const beingRobbed=(state,t)=>t.flatIncomes.some(x=>x.label==='被搶走的案子'&&x.until>=state.round);
// 搶案成功率：自己的平均薪資 ÷（自己＋對方），限制在 20%～80%；
// 天命卡「人脈王」再 +15 個百分點。
function stealChance(p,t){const S=INTERACT.steal;return round2(clamp(baseSalary(p)/(baseSalary(p)+baseSalary(t))+(hasDestiny(p,'D05')?.15:0),S.minChance,S.maxChance))}
const stealAmount=t=>round2(Math.min(INTERACT.steal.cap,baseSalary(t)*INTERACT.steal.share));
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
const responder=state=>state.phase==='respond'&&state.pendingResponse?playerById(state,state.pendingResponse.targetId):null;
function respondOptions(state){
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
function respond(state,playerId,yes){
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
function ticketPrice(state,p){
  const job=jobOf(p);
  if(job.perk==='flyFree'||hasDestiny(p,'D07'))return 0;
  return round2(ABROAD.ticket*state.economy.priceLevel*(job.perk==='flyHalf'?.5:1));
}
function jobConditionText(job){
  const c=job.cond||{},bits=[];
  if(c.car)bits.push('需要有車');
  if(c.cost)bits.push(`付 ${c.cost} 萬學費`);
  if(c.wait)bits.push(`停留 ${c.wait} 回合後擲骰 ≥ ${c.dice}`);
  else if(c.dice)bits.push(`當場擲骰 ≥ ${c.dice}`);
  return bits.length?bits.join('、'):'無條件';
}
// 選項清單。互動卡的選項會依其他（未破產的）玩家展開成多個；不能選的對象會附上原因。
function chanceOptions(state,p,card){
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
function examTarget(p,job){return {need:job.cond.dice,bonus:hasDestiny(p,'D05')?1:0}}
function setJob(state,p,jobId){
  const job=jobById(jobId);
  p.jobId=jobId;p.roleId=job.tier;p.stats.jobs.push(jobId);
  say(state,`${p.name}成為「${job.name}」，每季薪水 ${money(job.salary)}。`);
}
function resolveChoice(state,playerId,index){
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
function takeExam(state,forced){
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
function setOvertime(state,playerId,level){const p=requireManage(state,playerId);if(![0,1,2].includes(level))throw Error('加班程度無效。');p.overtime=level}
function setHighway(state,playerId,on){const p=playerById(state,playerId);if(!p)throw Error('找不到玩家。');p.useHighway=!!on}
function repayDebt(state,playerId,debtId,amount){
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
function borrow(state,playerId,amount){
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
function carOffer(state,p){
  const price=round2(state.economy.carPrice*(hasDestiny(p,'D08')?.8:1)),down=round2(price*CAR.downPct/100),loan=round2(price-down);
  const payment=round2(annuity(loan,CAR.rate,CAR.quarters)),dsr=round2(100*(quarterlyPayments(state,p)+payment)/Math.max(1,baseSalary(p)));
  return {price,down,loan,payment,dsr,cashOk:!p.owns.car&&p.cash>=price,loanOk:!p.owns.car&&p.cash>=down&&dsr<=50};
}
function buyCar(state,playerId,mode){
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
function housePlan(state,p){
  const price=state.economy.housePrice,down=round2(price*.3),loan=round2(price-down);
  const newPayment=round2(annuity(loan,state.economy.rate+.6,120));
  const dsr=round2(100*(quarterlyPayments(state,p)+newPayment)/Math.max(1,baseSalary(p)));
  return {price,down,loan,newPayment,dsr,ok:p.cash>=down&&dsr<=roleById('exec').goal.dsr};
}
function canBuyHouse(state,p){return p.variant==='roles'&&roleById(p.roleId)?.goal.type==='house'?housePlan(state,p):{ok:false}}
function buyHouse(state,playerId){
  const p=requireManage(state,playerId),h=canBuyHouse(state,p);
  if(!h.ok)throw Error('頭期款不足，或銀行核貸條件（月付 ≤ 收入 50%）未達成。');
  p.cash=round2(p.cash-h.down);p.owns.house=true;
  p.debts.push({id:'mortgage-new',type:'mortgage',name:'新屋房貸',balance:h.loan,rate:0,payment:h.newPayment,variable:true});
  say(state,`${p.name}付了頭期款 ${money(h.down)}，買下 ${money(h.price)} 的房子！`);
  win(state,[p],'goal');
}

/* ---------- 勝利判定 ---------- */
function goalText(p){return p.variant==='roles'?roleById(p.roleId).goal.text:GOAL.text}
function goalProgress(state,p){
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

function endTurn(state){
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
function settleRound(state){
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
function evaluateCentralBank(state,snap){
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

function exportGame(state){return JSON.stringify(state,null,2)}
function importGame(json){const s=JSON.parse(json);if(s.version!==4||s.game!=='life'||!VARIANTS[s.variant]||!Array.isArray(s.players)||!s.economy)throw Error('存檔格式不正確（舊版存檔請開新遊戲）。');return s}


// 電腦玩家（Bot）。介面、連線版與模擬共用同一套決策，兩種玩法（工作卡版／角色版）都適用。
// 低：幾乎隨機，或只偏好一種選擇（隨機派／賭徒／保守派）
// 中：想照最佳策略走，但估算有誤差、常常失誤
// 高：幾乎不失誤地執行最佳策略

const BOT_LEVELS={
  low:{label:'低',desc:'幾乎隨機，或只偏好一種選擇'},
  mid:{label:'中',desc:'想照最佳策略走，但經常失誤'},
  high:{label:'高',desc:'幾乎不失誤地執行最佳策略'}
};
const LOW_STYLES={
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

function makeBot(level,rng=Math.random){
  if(!BOT_LEVELS[level])return null;
  if(level==='low'){const styles=Object.keys(LOW_STYLES);return {level,style:styles[Math.floor(rng()*styles.length)]}}
  return {level};
}
function botLabel(bot){if(!bot)return '';return `Bot·${BOT_LEVELS[bot.level].label}${bot.style?`（${LOW_STYLES[bot.style].label}）`:''}`}

/* ---------- 估值 ---------- */
function outcomeValue(s,p,o,stake){
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
function jobValue(s,p,job){
  const c=job.cond||{},{need,bonus}=c.dice?examTarget(p,job):{need:0,bonus:0};
  const prob=c.dice?Math.max(0,Math.min(1,(7-(need-bonus))/6)):1;
  const wait=Math.max(0,(c.wait||0)-(p.destinyId==='D02'?1:0));
  const gain=jobNet(p,job)-jobNet(p,jobOf(p));
  return prob*gain*Math.max(0,horizon(s)-wait-(c.wait?1:0))-(c.cost||0)-wait*TURN_VALUE;
}
// 國外一趟：約停 2 次國外格；扣掉不在主地圖的機會成本。
function abroadCardValue(s,p,card){
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
function tripValue(s,p){
  const w=ABROAD_CARDS.reduce((t,c)=>t+c.weight,0);
  const ev=ABROAD_CARDS.reduce((t,c)=>t+c.weight*abroadCardValue(s,p,c),0)/w;
  return 2*ev-2*TURN_VALUE;
}
const risky=o=>o.outcomes.length>1||o.outcomes.some(x=>x.unemployed||x.fatigue);
const pick=(rng,items)=>items[Math.floor(rng()*items.length)];
const bufferOf=p=>jobOf(p).living*1.5;
const playerOf=(s,id)=>s.players.find(x=>x.id===id);

/* ---------- 選擇（機會卡、工作卡、機場） ---------- */
function botChoice(s,p,rng=Math.random){
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
function botRespond(s,p,rng=Math.random){
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
function botManageStep(s,p,memo,rng=Math.random,{carPolicy='auto'}={}){
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


// 等角（半 2D 俯視）棋盤：主島＋中央高速公路＋右上角的浮空島（國外），可拖曳、縮放。
// 單機版（app.js）與連線大螢幕（online/host.js）共用。地圖大小固定為「剛好看得到兩座島再往外一些」，
// 最小縮放就是全覽，放大後只能在這個範圍內拖曳。
// 用法：const board=createIsoBoard(); 把 board.el 放進畫面；每次狀態改變呼叫 board.render(model)。
//   model.tiles：{main:[{type,flipped,boosted}], highway:['fortune',...], abroad:['arrival',...]}
//   model.pawns：[{id,key:'main-3',color:'#0f9688',icon:'🧾',name,current,moving}]
//   model.activeKey：要標亮的格子（走路動畫目前所在格）
// 桌面模式 createIsoBoard({table:true,onCard})（單機版全螢幕）：
//   棋盤放在一張等角桌子上；國外只留格子（沒有岩石、樹、雲）；沒有鏡頭按鈕（拖曳、滾輪、兩指、方向鍵照舊）；
//   全覽時也能拖去看桌緣。每位玩家面前的桌上固定 TABLE_SLOTS 張卡：
//   model.seats：[{pos:'bl'|'l'|'tl'|'t'|'tr'|'r'|'br'|'b', color, cards:[{face:'up'|'down'|'empty', icon, name, tone}]}]
//   點卡片呼叫 onCard(座位索引, 卡片索引)。

const TABLE_SLOTS=5;
function createIsoBoard({table:tableMode=false,onCard=null}={}){
  const W=96,H=48,DEPTH=12,MARGIN=40,NS='http://www.w3.org/2000/svg';
  const LABEL={home:'家鄉',fortune:'好運',market:'市場',chance:'機會',loss:'災難',airport:'機場',ramp:'交流道',exit:'出口',toll:'收費站',arrival:'入境',abroad:'國外',return:'回國'};
  const ICON={home:'⌂',fortune:'✦',market:'◎',chance:'?',loss:'⚠',airport:'✈',ramp:'⇢',exit:'⇠',toll:'¤',arrival:'⇣',abroad:'◍',return:'⇡'};
  const iso=(x,y)=>({x:(x-y)*W/2,y:(x+y)*H/2});
  const unIso=p=>({gx:(p.x/(W/2)+p.y/(H/2))/2,gy:(p.y/(H/2)-p.x/(W/2))/2});
  const {n,k}=MAP;
  // 浮空島放在右上邊外側（畫面右上角）。
  const edgeMid=iso((n-1)*.62,0),ic0=iso((k-1)/2,(k-1)/2);
  const islandOrigin={x:edgeMid.x+W*1.15-ic0.x,y:edgeMid.y-H*(k*.5+2.1)-ic0.y};
  const islandMid={x:islandOrigin.x+ic0.x,y:islandOrigin.y+ic0.y};
  const center=key=>{
    const [t,iStr]=key.split('-'),i=Number(iStr);
    const xy=t==='main'?MAP.main[i]:t==='highway'?MAP.highway[i]:MAP.abroad[i];
    if(!xy)return {x:0,y:0};
    const p=iso(xy[0],xy[1]);
    return t==='abroad'?{x:p.x+islandOrigin.x,y:p.y+islandOrigin.y}:p;
  };
  const allKeys=[...MAP.main.map((_,i)=>`main-${i}`),...MAP.highway.map((_,i)=>`highway-${i}`),...MAP.abroad.map((_,i)=>`abroad-${i}`)];
  // 固定的地圖範圍：所有格子、浮空島的岩石與上方的棋子空間，再往外留一點邊。
  // 桌面模式改由 layoutTable() 依座位重新計算（框住格子與桌上的卡），pan 是可拖曳的範圍（整張桌子）。
  let rect=(()=>{
    const pts=allKeys.map(center);
    const x0=Math.min(...pts.map(p=>p.x))-W/2,x1=Math.max(...pts.map(p=>p.x))+W/2;
    const y0=Math.min(...pts.map(p=>p.y))-H/2-56,y1=Math.max(islandMid.y+k*H*1.05,...pts.map(p=>p.y+H/2+DEPTH+14));
    return {x:x0-MARGIN,y:y0-MARGIN,w:x1-x0+2*MARGIN,h:y1-y0+2*MARGIN};
  })();
  let pan=rect;

  /* ---------- 桌面模式：桌子與座位 ---------- */
  // 桌子是格子座標裡的正方形（等角投影後是菱形），四角在畫面的上、右、下、左；四條邊各面向畫面的一個角落。
  // 座位用桌子周長上的位置 t 表示：0 左角、1 上角、2 右角、3 下角（0→1 是左上邊，依此類推）。
  const TABLE_D=30,EDGE=2.6;
  const table=(()=>{
    const g=allKeys.map(kk=>unIso(center(kk)));
    const x0=Math.min(...g.map(p=>p.gx))-.5,x1=Math.max(...g.map(p=>p.gx))+.5,y0=Math.min(...g.map(p=>p.gy))-.5,y1=Math.max(...g.map(p=>p.gy))+.5;
    const cx=(x0+x1)/2,cy=(y0+y1)/2,half=Math.max(x1-x0,y1-y0)/2+EDGE;
    return {x0:cx-half,x1:cx+half,y0:cy-half,y1:cy+half,side:2*half};
  })();
  const tc=[iso(table.x0,table.y0),iso(table.x1,table.y0),iso(table.x1,table.y1),iso(table.x0,table.y1)];
  // 四條邊：起點、終點與往桌子中央的方向。
  const EDGES=[
    {a:[table.x0,table.y1],b:[table.x0,table.y0],v:[1,0]},   // 左上邊：左角 → 上角
    {a:[table.x0,table.y0],b:[table.x1,table.y0],v:[0,1]},   // 右上邊：上角 → 右角
    {a:[table.x1,table.y0],b:[table.x1,table.y1],v:[-1,0]},  // 右下邊：右角 → 下角
    {a:[table.x1,table.y1],b:[table.x0,table.y1],v:[0,-1]}   // 左下邊：下角 → 左角
  ];
  // 畫面位置 → 桌子周長位置。角落的玩家面對邊的中點；四邊中間的玩家面對桌角，卡片排在相鄰那條邊上。
  const SEAT_T={l:0,tl:.5,t:1,tr:1.5,r:2,br:2.5,b:3,bl:3.5};
  const PAIR={tl:'l',tr:'t',br:'r',bl:'b'};   // 和角落玩家共用同一條邊的「中間」座位
  let cardScale=1,seatRows=[];
  function seatT(pos,present){
    if(SEAT_T[pos]%1===0)return SEAT_T[pos]+.27;                 // 中間座位：排在桌角旁邊那條邊的前段
    return present.has(PAIR[pos])?SEAT_T[pos]+.23:SEAT_T[pos];    // 角落座位：同一條邊有人時讓到後段
  }
  const cardDims=()=>({w:1.0*cardScale,h:1.42*cardScale,gap:.22*cardScale,inset:1.2*cardScale});
  // 依座位算出每排卡片的位置（格子座標），並重新計算鏡頭範圍。
  function layoutTable(seats){
    const present=new Set(seats.map(s=>s.pos));
    cardScale=seats.length>4?.82:1;
    const C=cardDims(),total=TABLE_SLOTS*C.w+(TABLE_SLOTS-1)*C.gap;
    seatRows=seats.map(s=>{
      const t=seatT(s.pos,present),e=EDGES[Math.floor(t)%4],f=t-Math.floor(t);
      const ux=Math.sign(e.b[0]-e.a[0]),uy=Math.sign(e.b[1]-e.a[1]);
      return {ex:e.a[0]+(e.b[0]-e.a[0])*f,ey:e.a[1]+(e.b[1]-e.a[1])*f,u:[ux,uy],v:e.v,total};
    });
    const ps=allKeys.map(center).flatMap(c=>[[c.x-W/2,c.y-H/2-44],[c.x+W/2,c.y+H/2+DEPTH]]);
    for(const r of seatRows)for(const du of [-r.total/2,r.total/2])for(const dv of [.3,C.inset+C.h/2]){const p=iso(r.ex+r.u[0]*du+r.v[0]*dv,r.ey+r.u[1]*du+r.v[1]*dv);ps.push([p.x,p.y])}
    const xs=ps.map(p=>p[0]),ys=ps.map(p=>p[1]),M=30;
    const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
    rect={x:x0-M,y:y0-M,w:x1-x0+2*M,h:y1-y0+2*M};
    const txs=tc.map(p=>p.x),tys=tc.map(p=>p.y);
    const px0=Math.min(...txs,rect.x),px1=Math.max(...txs,rect.x+rect.w),py0=Math.min(...tys,rect.y),py1=Math.max(Math.max(...tys)+TABLE_D,rect.y+rect.h);
    pan={x:px0-M,y:py0-M,w:px1-px0+2*M,h:py1-py0+2*M};
  }

  const el=document.createElement('div');el.className=`iso-board${tableMode?' table-mode':''}`;el.tabIndex=0;
  el.setAttribute('aria-label','等角棋盤：拖曳移動、滾輪或兩指縮放、方向鍵平移');
  el.innerHTML=`<svg class="iso-svg" role="img" aria-label="人生棋局棋盤">${tableMode?'<defs><radialGradient id="felt-grad" cx="50%" cy="45%" r="65%"><stop offset="0" stop-color="#357b78"/><stop offset="1" stop-color="#1c4a4c"/></radialGradient></defs>':''}<g class="iso-world"><g class="iso-table"></g><g class="iso-static"></g><g class="iso-cards"></g><g class="iso-pawns"></g></g></svg>
    ${tableMode?'':`<div class="iso-cam"><button type="button" data-iso="main">🏠 主島</button><button type="button" data-iso="island">🏝 國外島</button><button type="button" data-iso="all">⤢ 全覽</button><span class="iso-zoom"><button type="button" data-iso="in" aria-label="放大">＋</button><button type="button" data-iso="out" aria-label="縮小">－</button></span></div>`}`;
  const svg=el.querySelector('svg'),world=el.querySelector('.iso-world'),tableG=el.querySelector('.iso-table'),staticG=el.querySelector('.iso-static'),cardsG=el.querySelector('.iso-cards'),pawnsG=el.querySelector('.iso-pawns');
  const mk=(tag,attrs,parent)=>{const e=document.createElementNS(NS,tag);for(const [a,v] of Object.entries(attrs))e.setAttribute(a,v);if(parent)parent.appendChild(e);return e};
  const txt=(parent,attrs,text)=>{const e=mk('text',attrs,parent);e.textContent=text;return e};
  const pts=a=>a.map(q=>`${q[0]},${q[1]}`).join(' ');
  const P=(gx,gy)=>{const p=iso(gx,gy);return [p.x,p.y]};

  /* ---------- 桌子 ---------- */
  function drawTable(){
    tableG.textContent='';
    const c=tc.map(p=>[p.x,p.y]),down=q=>[q[0],q[1]+TABLE_D];
    // 看得到的兩個側面：左前（左角→下角）與右前（下角→右角）
    mk('polygon',{points:pts([c[3],c[2],down(c[2]),down(c[3])]),class:'tbl-side l'},tableG);
    mk('polygon',{points:pts([c[2],c[1],down(c[1]),down(c[2])]),class:'tbl-side r'},tableG);
    mk('polygon',{points:pts(c),class:'tbl-rim'},tableG);
    const r=.55,felt=[P(table.x0+r,table.y0+r),P(table.x1-r,table.y0+r),P(table.x1-r,table.y1-r),P(table.x0+r,table.y1-r)];
    mk('polygon',{points:pts(felt),class:'tbl-felt'},tableG);
    const r2=1,line=[P(table.x0+r2,table.y0+r2),P(table.x1-r2,table.y0+r2),P(table.x1-r2,table.y1-r2),P(table.x0+r2,table.y1-r2)];
    mk('polygon',{points:pts(line),class:'tbl-line'},tableG);
  }

  /* ---------- 格子 ---------- */
  function tile(g,key,type,{road=false,event=null,flipped=false,boosted=false}={}){
    const c=center(key),f=(W/2-3)/(W/2);
    const T=[[c.x,c.y-H/2],[c.x+W/2,c.y],[c.x,c.y+H/2],[c.x-W/2,c.y]].map(q=>[c.x+(q[0]-c.x)*f,c.y+(q[1]-c.y)*f]);
    const down=q=>[q[0],q[1]+DEPTH];
    const tg=mk('g',{class:`iso-tile t-${road?'road':type}${flipped?' flipped':''}`,'data-node':key},g);
    mk('polygon',{points:pts([T[3],T[2],down(T[2]),down(T[3])]),class:'iso-side l'},tg);
    mk('polygon',{points:pts([T[2],T[1],down(T[1]),down(T[2])]),class:'iso-side r'},tg);
    mk('polygon',{points:pts(T),class:'iso-top'},tg);
    if(road){
      mk('line',{x1:c.x+W/4-4,y1:c.y-H/4+2,x2:c.x-W/4+4,y2:c.y+H/4-2,class:'iso-roadline'},tg);
      if(event){mk('circle',{cx:c.x,cy:c.y-1,r:10,class:`iso-ev ev-${event}`},tg);txt(tg,{x:c.x,y:c.y+3,'text-anchor':'middle',class:`iso-evicon ev-${event}`},ICON[event])}
      return;
    }
    txt(tg,{x:c.x,y:c.y+2,'text-anchor':'middle',class:'iso-lbl'},`${ICON[type]} ${LABEL[type]}`);
    const [t,i]=key.split('-');
    txt(tg,{x:c.x,y:c.y+15,'text-anchor':'middle',class:'iso-num'},t==='main'?String(i).padStart(2,'0'):t==='abroad'?`A${Number(i)+1}`:`H${Number(i)+1}`);
    if(flipped||boosted){const w=34;mk('rect',{x:c.x-w/2,y:c.y-H/2+2,width:w,height:13,rx:6.5,class:flipped?'iso-tag bad':'iso-tag good'},tg);txt(tg,{x:c.x,y:c.y-H/2+11.5,'text-anchor':'middle',class:'iso-tagtext'},flipped?'衰退':'×1.5')}
  }
  // 等角方塊（房子、塔台）：以底面中心 (cx,cy) 為準，邊長 w（以格子為單位）、高 h（像素）。
  function block(g,cx,cy,w,d,h,cls){
    const hw=w*W/2,hh=w*H/2;
    const L=[cx-hw,cy],F=[cx,cy+hh],R=[cx+hw,cy],Bk=[cx,cy-hh];
    const up=q=>[q[0],q[1]-h];
    mk('polygon',{points:pts([L,F,up(F),up(L)]),class:`iso-block ${cls} l`},g);
    mk('polygon',{points:pts([F,R,up(R),up(F)]),class:`iso-block ${cls} r`},g);
    mk('polygon',{points:pts([up(L),up(F),up(R),up(Bk)]),class:`iso-roof ${cls}`},g);
  }
  function cloud(g,x,y,s){for(const [dx,dy,r] of [[0,0,22],[24,-8,18],[46,2,20],[20,8,20]])mk('ellipse',{cx:x+dx*s,cy:y+dy*s,rx:r*s*1.4,ry:r*s*.75,class:'iso-cloud'},g)}

  let tileSig='';
  function drawStatic(tiles){
    staticG.textContent='';
    const g=staticG;
    const isl=mk('g',{class:'iso-island'},g);
    if(tableMode){
      // 桌面模式：國外只留格子，直接放在桌上
      const ic=[iso(-.6,-.6),iso(k-.4,-.6),iso(k-.4,k-.4),iso(-.6,k-.4)].map(p=>[p.x+islandOrigin.x,p.y+islandOrigin.y+DEPTH+6]);
      mk('polygon',{points:pts(ic),class:'iso-shadow'},isl);
    }else{
      // 浮空島：岩石＋草地＋格子（畫在最底層，主島會蓋住垂下來的岩石）
      const ic=[iso(-.6,-.6),iso(k-.4,-.6),iso(k-.4,k-.4),iso(-.6,k-.4)].map(p=>[p.x+islandOrigin.x,p.y+islandOrigin.y]);
      const mid=[(ic[0][0]+ic[2][0])/2,(ic[0][1]+ic[2][1])/2],tip=[mid[0]+6,mid[1]+k*H*1.05],kink=[mid[0]-W*.4,ic[2][1]+H*1.2];
      mk('polygon',{points:pts([[ic[3][0],ic[3][1]+DEPTH],[ic[2][0],ic[2][1]+DEPTH],kink,tip]),class:'iso-rock l'},isl);
      mk('polygon',{points:pts([[ic[2][0],ic[2][1]+DEPTH],[ic[1][0],ic[1][1]+DEPTH],tip,kink]),class:'iso-rock r'},isl);
      mk('polygon',{points:pts(ic.map(p=>[p[0],p[1]+DEPTH])),class:'iso-grass'},isl);
    }
    MAP.abroad.map((xy,i)=>({xy,i})).sort((a,b)=>(a.xy[0]+a.xy[1])-(b.xy[0]+b.xy[1])||a.xy[0]-b.xy[0])
      .forEach(({i})=>tile(isl,`abroad-${i}`,tiles.abroad[i]||'abroad'));
    if(!tableMode)for(const [dx,dy] of [[-10,0],[12,6],[0,-10]]){const x=islandMid.x+dx,y=islandMid.y+dy;mk('rect',{x:x-2,y:y-12,width:4,height:12,class:'iso-trunk'},isl);mk('circle',{cx:x,cy:y-18,r:9,class:'iso-tree'},isl)}
    // 主島：陰影、中央草地、格子（依 x+y 由後往前畫）
    const cs=[iso(-.6,-.6),iso(n-.4,-.6),iso(n-.4,n-.4),iso(-.6,n-.4)];
    mk('polygon',{points:pts(cs.map(p=>[p.x,p.y+DEPTH+10])),class:'iso-shadow'},g);
    const inner=[iso(.6,.6),iso(n-1.6,.6),iso(n-1.6,n-1.6),iso(.6,n-1.6)];
    mk('polygon',{points:pts(inner.map(p=>[p.x,p.y])),class:'iso-grass inner'},g);
    const all=[...MAP.main.map((xy,i)=>({xy,key:`main-${i}`,t:tiles.main[i]})),...MAP.highway.map((xy,i)=>({xy,key:`highway-${i}`,road:true,ev:tiles.highway[i]}))]
      .sort((a,b)=>(a.xy[0]+a.xy[1])-(b.xy[0]+b.xy[1])||a.xy[0]-b.xy[0]);
    const tg=mk('g',{},g);
    for(const x of all){if(x.road)tile(tg,x.key,'road',{road:true,event:x.ev});else tile(tg,x.key,x.t.type,{flipped:x.t.flipped,boosted:x.t.boosted})}
    // 裝飾：家鄉的房子、機場塔台、交流道路牌
    const deco=mk('g',{},g),home=center('main-0');block(deco,home.x+36,home.y-2,.2,.2,18,'house');
    const ai=tiles.main.findIndex(t=>t.type==='airport'),air=center(`main-${ai}`);block(deco,air.x+36,air.y-2,.12,.12,32,'tower');
    const ri=tiles.main.findIndex(t=>t.type==='ramp'),rc=center(`main-${ri}`);
    mk('line',{x1:rc.x,y1:rc.y-34,x2:rc.x,y2:rc.y-8,class:'iso-pole'},deco);
    mk('rect',{x:rc.x-30,y:rc.y-52,width:60,height:18,rx:3,class:'iso-sign'},deco);txt(deco,{x:rc.x,y:rc.y-39,'text-anchor':'middle',class:'iso-signtext'},'↙ 高速公路');
    // 航線：機場 → 入境
    const a1=center('abroad-0'),ctrl={x:Math.min(air.x,a1.x)-150,y:(air.y+a1.y)/2-30};
    const d=`M${air.x},${air.y-30} Q${ctrl.x},${ctrl.y} ${a1.x},${a1.y-24}`;
    mk('path',{d,class:'iso-flight glow'},g);mk('path',{d,class:'iso-flight'},g);
    const tp=.55,mx=(1-tp)**2*air.x+2*(1-tp)*tp*ctrl.x+tp**2*a1.x,my=(1-tp)**2*(air.y-30)+2*(1-tp)*tp*ctrl.y+tp**2*(a1.y-24);
    txt(g,{x:mx,y:my+7,'text-anchor':'middle',class:'iso-plane'},'✈️');
    if(!tableMode){const sky=mk('g',{},g);cloud(sky,islandMid.x+W*1.6,islandMid.y+H*1.2,.8);cloud(sky,islandMid.x-W*1.4,islandMid.y-H*2.2,.6)}
  }

  /* ---------- 桌上的卡片（桌面模式） ---------- */
  function drawCards(seats){
    cardsG.textContent='';
    const C=cardDims();
    seats.forEach((seat,si)=>{
      const R=seatRows[si];if(!R)return;
      const {ex,ey,u:[ux,uy],v:[vx,vy],total}=R;
      const sg=mk('g',{class:'tbl-seat','data-seat':si},cardsG);
      // 座位色的桌邊標示
      const a=-total/2-.35*cardScale,b=total/2+.35*cardScale,d0=.35*cardScale,d1=d0+.12;
      mk('polygon',{points:pts([P(ex+ux*a+vx*d0,ey+uy*a+vy*d0),P(ex+ux*b+vx*d0,ey+uy*b+vy*d0),P(ex+ux*b+vx*d1,ey+uy*b+vy*d1),P(ex+ux*a+vx*d1,ey+uy*a+vy*d1)]),class:'tbl-seatline',style:`fill:${seat.color}`},sg);
      // 依畫面深度排序（後面的先畫）
      const slots=[...Array(TABLE_SLOTS)].map((_,i)=>{
        const off=-total/2+C.w/2+i*(C.w+C.gap);
        return {i,cx:ex+ux*off+vx*C.inset,cy:ey+uy*off+vy*C.inset,card:seat.cards[i]||{face:'empty'}};
      }).sort((p,q)=>(p.cx+p.cy)-(q.cx+q.cy));
      for(const s of slots){
        const hw=C.w/2,hh=C.h/2,c=s.card;
        const corner=(du,dv)=>P(s.cx+ux*du+vx*dv,s.cy+uy*du+vy*dv);
        const quad=[corner(-hw,-hh),corner(hw,-hh),corner(hw,hh),corner(-hw,hh)];
        const cg=mk('g',{class:`tbl-card ${c.face}${c.tone?` tone-${c.tone}`:''}`},sg);
        if(c.face!=='empty'){
          cg.setAttribute('data-card',`${si}:${s.i}`);cg.setAttribute('role','button');
          mk('title',{},cg).textContent=c.face==='down'?'蓋著的卡':(c.name||'');
          const th=3,dn=q=>[q[0],q[1]+th];
          const lowIdx=[0,1,2,3].sort((p,q)=>quad[q][1]-quad[p][1])[0];
          const l=quad[(lowIdx+3)%4],r=quad[(lowIdx+1)%4],lo=quad[lowIdx];
          mk('polygon',{points:pts([l,lo,dn(lo),dn(l)]),class:'tbl-card-edge'},cg);
          mk('polygon',{points:pts([lo,r,dn(r),dn(lo)]),class:'tbl-card-edge'},cg);
        }
        mk('polygon',{points:pts(quad),class:'tbl-card-face'},cg);
        const m=P(s.cx,s.cy),fs=cardScale;
        if(c.face==='up'){
          const ins=.09*fs,inner=[corner(-hw+ins,-hh+ins),corner(hw-ins,-hh+ins),corner(hw-ins,hh-ins),corner(-hw+ins,hh-ins)];
          mk('polygon',{points:pts(inner),class:'tbl-card-inner'},cg);
          txt(cg,{x:m[0],y:m[1]-2*fs,'text-anchor':'middle',class:'tbl-card-icon',style:`font-size:${20*fs}px`},c.icon||'');
          txt(cg,{x:m[0],y:m[1]+14*fs,'text-anchor':'middle',class:'tbl-card-name',style:`font-size:${10*fs}px`},(c.name||'').slice(0,5));
        }else if(c.face==='down'){
          const ins=.1*fs,inner=[corner(-hw+ins,-hh+ins),corner(hw-ins,-hh+ins),corner(hw-ins,hh-ins),corner(-hw+ins,hh-ins)];
          mk('polygon',{points:pts(inner),class:'tbl-card-back'},cg);
          txt(cg,{x:m[0],y:m[1]+5*fs,'text-anchor':'middle',class:'tbl-card-backmark',style:`font-size:${11*fs}px`},'人生');
        }else{
          txt(cg,{x:m[0],y:m[1]+4*fs,'text-anchor':'middle',class:'tbl-card-empty'},'＋');
        }
      }
    });
  }

  /* ---------- 棋子 ---------- */
  const pawnEls=new Map();
  function drawPawns(pawns,activeKey){
    staticG.querySelectorAll('.iso-tile.active').forEach(t=>t.classList.remove('active'));
    if(activeKey)staticG.querySelector(`[data-node="${activeKey}"]`)?.classList.add('active');
    const seen=new Set(),groups=new Map();
    for(const p of pawns){if(!groups.has(p.key))groups.set(p.key,[]);groups.get(p.key).push(p)}
    // 同一格多人時排成小圓圈；目前玩家畫在最上面。
    const order=[...pawns].sort((a,b)=>(a.current||a.moving)-(b.current||b.moving));
    for(const p of order){
      seen.add(p.id);
      const list=groups.get(p.key),idx=list.indexOf(p),cnt=list.length,c=center(p.key);
      const ang=cnt>1?idx/cnt*Math.PI*2:0,r=cnt>1?16:0,x=c.x+Math.cos(ang)*r,y=c.y+Math.sin(ang)*r*.5;
      let g=pawnEls.get(p.id);
      if(!g){
        g=mk('g',{class:'iso-pawn'},null);
        mk('ellipse',{cx:0,cy:2,rx:12,ry:6,class:'iso-pawn-shadow'},g);
        mk('line',{x1:0,y1:0,x2:0,y2:-18,class:'iso-pawn-stick'},g);
        mk('circle',{cx:0,cy:-26,r:13,class:'iso-pawn-head'},g);
        mk('text',{x:0,y:-21.5,'text-anchor':'middle',class:'iso-pawn-icon'},g);
        mk('title',{},g);
        pawnEls.set(p.id,g);
        g.style.transform=`translate(${x}px,${y}px)`;
      }
      g.querySelector('.iso-pawn-stick').style.stroke=p.color;g.querySelector('.iso-pawn-head').style.fill=p.color;
      g.querySelector('.iso-pawn-icon').textContent=p.icon||'';g.querySelector('title').textContent=p.name||'';
      g.classList.toggle('current',!!p.current);g.classList.toggle('moving',!!p.moving);
      g.style.transform=`translate(${x}px,${y}px)`;
      pawnsG.appendChild(g);
    }
    for(const [id,g] of pawnEls)if(!seen.has(id)){g.remove();pawnEls.delete(id)}
  }

  /* ---------- 鏡頭 ---------- */
  const cam={x:0,y:0,s:1};let userMoved=false,anim=null;
  const reduce=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  const vw=()=>el.clientWidth,vh=()=>el.clientHeight;
  const minScale=()=>Math.min(vw()/rect.w,vh()/rect.h)||1;
  const maxScale=()=>Math.max(2.4,minScale()*3);
  function clamp(){
    if(!vw()||!vh())return;
    cam.s=Math.min(maxScale(),Math.max(minScale(),cam.s));
    // 可拖曳範圍（pan）比畫面小的方向置中；比畫面大的方向只能在範圍內移動。
    // 一般模式 pan＝地圖範圍；桌面模式 pan＝整張桌子，所以全覽時也能拖曳。
    const fitX=pan.w*cam.s<=vw()+.5,fitY=pan.h*cam.s<=vh()+.5;
    cam.x=fitX?(vw()-rect.w*cam.s)/2-rect.x*cam.s:Math.min(-pan.x*cam.s,Math.max(vw()-(pan.x+pan.w)*cam.s,cam.x));
    cam.y=fitY?(vh()-rect.h*cam.s)/2-rect.y*cam.s:Math.min(-pan.y*cam.s,Math.max(vh()-(pan.y+pan.h)*cam.s,cam.y));
  }
  const apply=()=>world.setAttribute('transform',`translate(${cam.x},${cam.y}) scale(${cam.s})`);
  const focus=(pt,s)=>({x:vw()/2-pt.x*s,y:vh()/2-pt.y*s,s});
  function flyTo(t){
    cancelAnimationFrame(anim);
    const from={...cam};Object.assign(cam,t);clamp();const to={...cam};Object.assign(cam,from);
    if(reduce()){Object.assign(cam,to);apply();return}
    const t0=performance.now(),ease=x=>x<.5?2*x*x:1-(-2*x+2)**2/2;
    const step=now=>{const q=Math.min(1,(now-t0)/600),e=ease(q);for(const k2 of ['x','y','s'])cam[k2]=from[k2]+(to[k2]-from[k2])*e;apply();if(q<1)anim=requestAnimationFrame(step)};
    anim=requestAnimationFrame(step);
  }
  // 全覽：以地圖範圍（rect）置中。
  function fit(){userMoved=false;cam.s=minScale();cam.x=(vw()-rect.w*cam.s)/2-rect.x*cam.s;cam.y=(vh()-rect.h*cam.s)/2-rect.y*cam.s;clamp();apply()}
  const mainCenter=iso((n-1)/2,(n-1)/2);
  const views={
    all:()=>({...focus({x:rect.x+rect.w/2,y:rect.y+rect.h/2},minScale())}),
    main:()=>focus({x:mainCenter.x,y:mainCenter.y},Math.max(minScale(),Math.min(vw()/(n*W*1.05),vh()/(n*H*1.25+80)))),
    island:()=>focus({x:islandMid.x,y:islandMid.y+20},Math.max(minScale(),Math.min(vw()/(k*W*1.7),vh()/(k*H*3.2))))
  };
  function zoomAt(f,px=vw()/2,py=vh()/2){
    const s=Math.min(maxScale(),Math.max(minScale(),cam.s*f)),r=s/cam.s;
    cam.x=px-(px-cam.x)*r;cam.y=py-(py-cam.y)*r;cam.s=s;userMoved=true;clamp();apply();
  }
  el.addEventListener('click',e=>{const b=e.target.closest('[data-iso]');if(!b)return;const a=b.dataset.iso;
    if(a==='in')return zoomAt(1.25);if(a==='out')return zoomAt(1/1.25);
    userMoved=a!=='all';flyTo(views[a]())});
  const ptrs=new Map();let last=null,pinch=null,vel={x:0,y:0},lastT=0,down=null;
  el.addEventListener('pointerdown',e=>{
    if(e.target.closest('button'))return;
    // 記下按下的卡片：放開時幾乎沒移動就當作點擊（拖曳時會 setPointerCapture，click 事件拿不到卡片）
    down={x:e.clientX,y:e.clientY,card:e.target.closest('[data-card]')?.dataset.card||null};
    el.setPointerCapture(e.pointerId);ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});cancelAnimationFrame(anim);el.classList.add('dragging');
    if(ptrs.size===2){const [a,b]=[...ptrs.values()];pinch=Math.hypot(a.x-b.x,a.y-b.y)}
    last={x:e.clientX,y:e.clientY};lastT=performance.now();vel={x:0,y:0};
  });
  el.addEventListener('pointermove',e=>{
    if(!ptrs.has(e.pointerId))return;
    // 滑鼠其實沒按著（放開事件遺失）：不要把單純的移動當成拖曳。
    if(e.pointerType==='mouse'&&e.buttons===0){ptrs.delete(e.pointerId);pinch=null;down=null;el.classList.remove('dragging');return}
    ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(ptrs.size===2&&pinch){const [a,b]=[...ptrs.values()],d=Math.hypot(a.x-b.x,a.y-b.y),r=el.getBoundingClientRect();zoomAt(d/pinch,(a.x+b.x)/2-r.left,(a.y+b.y)/2-r.top);pinch=d;return}
    const now=performance.now(),dx=e.clientX-last.x,dy=e.clientY-last.y,dt=Math.max(1,now-lastT);
    if(Math.abs(dx)+Math.abs(dy)>0)userMoved=true;
    cam.x+=dx;cam.y+=dy;clamp();apply();vel={x:dx/dt,y:dy/dt};last={x:e.clientX,y:e.clientY};lastT=now;
  });
  const up=e=>{
    ptrs.delete(e.pointerId);if(ptrs.size<2)pinch=null;if(ptrs.size===1)last=[...ptrs.values()][0];
    if(ptrs.size)return;el.classList.remove('dragging');
    if(e.type==='pointerup'&&down?.card&&Math.hypot(e.clientX-down.x,e.clientY-down.y)<6){const [si,ci]=down.card.split(':').map(Number);down=null;onCard?.(si,ci);return}
    down=null;
    if(!reduce()&&Math.hypot(vel.x,vel.y)>.2){const v={x:vel.x*16,y:vel.y*16};const glide=()=>{cam.x+=v.x;cam.y+=v.y;clamp();apply();v.x*=.9;v.y*=.9;if(Math.hypot(v.x,v.y)>.4)anim=requestAnimationFrame(glide)};anim=requestAnimationFrame(glide)}
  };
  el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);
  el.addEventListener('lostpointercapture',e=>{if(ptrs.has(e.pointerId))up(e)});
  el.addEventListener('wheel',e=>{e.preventDefault();const r=el.getBoundingClientRect();zoomAt(Math.exp(-e.deltaY*.0015),e.clientX-r.left,e.clientY-r.top)},{passive:false});
  el.addEventListener('keydown',e=>{const mv={ArrowLeft:[60,0],ArrowRight:[-60,0],ArrowUp:[0,60],ArrowDown:[0,-60]}[e.key];if(mv){e.preventDefault();userMoved=true;cam.x+=mv[0];cam.y+=mv[1];clamp();apply()}if(e.key==='+'||e.key==='=')zoomAt(1.2);if(e.key==='-')zoomAt(1/1.2)});
  // 畫面大小改變（含第一次放進頁面）：還沒自己移動過就保持全覽，否則只重新限制範圍。
  new ResizeObserver(()=>{if(!vw())return;if(!userMoved)fit();else{clamp();apply()}}).observe(el);

  if(tableMode){drawTable();layoutTable([])}
  let seatSig='',cardSig='';
  return {
    el,fit,
    render({tiles,pawns=[],activeKey=null,seats=[]}){
      const sig=JSON.stringify(tiles);
      if(sig!==tileSig){tileSig=sig;drawStatic(tiles)}
      if(tableMode){
        // 座位改變（人數不同）才重算鏡頭範圍；卡片內容改變才重畫卡片。
        const ss=seats.map(s=>s.pos).join(',');
        if(ss!==seatSig){seatSig=ss;layoutTable(seats);cardSig='';if(vw()&&!userMoved)fit();else{clamp();apply()}}
        const cs=JSON.stringify(seats);if(cs!==cardSig){cardSig=cs;drawCards(seats)}
      }
      drawPawns(pawns,activeKey);
      if(vw()&&!world.getAttribute('transform'))fit();
    }
  };
}


// 連線版房間邏輯（不含網路）：座位、開局、動作驗證、Bot 自動操作，以及「每個人只看得到自己的資料」的視角過濾。
// 伺服器是唯一執行遊戲引擎的地方；手機與大螢幕只送出動作、接收過濾後的畫面資料。

const CODE_CHARS='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_SEATS=8;
// 瀏覽器與 Node 都有 crypto.getRandomValues，房號與玩家憑證用它產生。
const randomBytes=n=>globalThis.crypto.getRandomValues(new Uint8Array(n));
const newCode=()=>Array.from(randomBytes(4),b=>CODE_CHARS[b%CODE_CHARS.length]).join('');
const newToken=()=>Array.from(randomBytes(16),b=>b.toString(16).padStart(2,'0')).join('');
const round1=n=>Math.round(n*10)/10;
// 公開紀錄不顯示個人理財操作的金額。
const PRIVATE_LOG=/提前償還|申請信用貸款|自動動用信用貸款/;
const LOG_KEEP=60;   // 傳給畫面的最近動態則數；logCount 是公開動態的總數，用來判斷有幾則新的

class Room{
  // variant：'jobs'（A 工作卡版）或 'roles'（B 角色版，玩家要選角色）。
  constructor(code,{mode='personal',variant='jobs'}={}){
    if(!VARIANTS[variant])throw Error('玩法無效。');
    this.code=code;this.mode=mode;this.variant=variant;this.hostKey=newToken();
    this.seats=[];this.game=null;this.maxRounds=24;this.serial=0;
    this.botMemo={key:null,memo:{}};this.lastActiveAt=Date.now();
  }
  // 大螢幕重新整理時用來存檔與還原（不含連線資訊）。
  toJSON(){return {v:2,code:this.code,mode:this.mode,variant:this.variant,hostKey:this.hostKey,maxRounds:this.maxRounds,serial:this.serial,seats:this.seats.map(({conn,lastSeen,...s})=>s),game:this.game}}
  static fromJSON(data){
    if(data?.v!==2||!data.code||!Array.isArray(data.seats))throw Error('房間存檔格式不正確。');
    const r=new Room(data.code,{mode:data.mode,variant:data.variant});
    Object.assign(r,{hostKey:data.hostKey,maxRounds:data.maxRounds,serial:data.serial,game:data.game||null});
    r.seats=data.seats.map(s=>({...s,connected:!!s.bot}));
    return r;
  }
  seatByToken(token){return token?this.seats.find(s=>s.token===token):undefined}
  uniqueName(name,except){
    const base=String(name||'').trim().slice(0,16)||'玩家';
    let n=base,i=2;while(this.seats.some(s=>s!==except&&s.name===n))n=`${base} ${i++}`;
    return n;
  }
  // 工作卡版沒有角色：一律從基本工作開始，roleId 記成 null。
  checkRole(roleId){if(this.variant!=='roles')return null;if(!roleById(roleId))throw Error('角色無效。');return roleId}
  addHuman({name,roleId}){
    if(this.game)throw Error('遊戲已經開始，無法加入新玩家。');
    if(this.seats.length>=MAX_SEATS)throw Error('房間已滿（最多 8 人）。');
    const seat={seatId:`s${++this.serial}`,token:newToken(),name:'',roleId:this.checkRole(roleId||'low'),bot:null,connected:true,playerId:null};
    seat.name=this.uniqueName(name,seat);this.seats.push(seat);return seat;
  }
  addBot({level='mid',roleId='office'}={}){
    if(this.game)throw Error('遊戲已經開始。');
    if(this.seats.length>=MAX_SEATS)throw Error('房間已滿（最多 8 人）。');
    if(!BOT_LEVELS[level])throw Error('Bot 難度無效。');
    const seat={seatId:`s${++this.serial}`,token:null,name:'',roleId:this.checkRole(roleId),bot:makeBot(level),connected:true,playerId:null};
    seat.name=this.uniqueName(`Bot ${this.seats.filter(s=>s.bot).length+1}`,seat);this.seats.push(seat);return seat;
  }
  updateSeat(seat,{name,roleId}){
    if(this.game)throw Error('遊戲已經開始，無法更改。');
    if(roleId!==undefined&&this.variant==='roles')seat.roleId=this.checkRole(roleId);
    if(name!==undefined)seat.name=this.uniqueName(name,seat);
  }
  removeSeat(seatId){
    if(this.game)throw Error('遊戲已經開始。');
    this.seats=this.seats.filter(s=>s.seatId!==seatId);
  }
  start({maxRounds=this.maxRounds}={}){
    if(this.game&&this.game.status==='playing')throw Error('遊戲已經開始。');
    if(this.seats.length<2)throw Error('至少需要 2 位玩家（可以加入 Bot）。');
    this.maxRounds=Number(maxRounds)||24;
    this.game=createGame({players:this.seats.map(s=>({name:s.name,roleId:s.roleId,bot:s.bot})),maxRounds:this.maxRounds,variant:this.variant});
    this.seats.forEach((s,i)=>{s.playerId=this.game.players[i].id});
    this.botMemo={key:null,memo:{}};
  }
  backToLobby(){this.game=null;this.seats.forEach(s=>{s.playerId=null})}
  currentPlayer(){return this.game?.players[this.game.turnIndex]}
  // 現在該誰動作：平常是輪到的玩家；有人被邀請合作或被搶案子時，是要回覆的那個人。
  actor(){const g=this.game;return g?.phase==='respond'?responder(g):this.currentPlayer()}
  seatOf(p){return this.seats.find(s=>s.playerId===p?.id)}
  // 玩家送出的動作：只有該動作的那位玩家可以操作，其餘一律拒絕。
  act(token,action){
    const g=this.game,seat=this.seatByToken(token);
    if(!seat)throw Error('找不到你的座位，請重新加入。');
    if(!g||g.status!=='playing')throw Error('遊戲尚未開始或已經結束。');
    if(action?.type==='respond'){
      const r=responder(g);
      if(!r||r.id!==seat.playerId)throw Error('現在不需要你回覆。');
      return respond(g,r.id,!!action.yes);
    }
    const p=this.currentPlayer();
    if(g.phase==='respond')throw Error(`正在等 ${responder(g).name} 回覆。`);
    if(p.id!==seat.playerId)throw Error(`還沒輪到你，現在是 ${p.name} 的回合。`);
    const n=x=>{const v=Number(x);if(!Number.isFinite(v))throw Error('請輸入數字。');return v};
    switch(action?.type){
      case 'destiny':return drawDestiny(g);
      case 'exam':return takeExam(g);
      case 'highway':return setHighway(g,p.id,!!action.on);
      case 'roll':return rollDice(g);
      case 'draw':return drawEvent(g);
      case 'choose':return resolveChoice(g,p.id,n(action.index));
      case 'overtime':return setOvertime(g,p.id,n(action.level));
      case 'repay':return repayDebt(g,p.id,String(action.debtId),n(action.amount));
      case 'borrow':return borrow(g,p.id,n(action.amount));
      case 'car':return buyCar(g,p.id,action.mode==='loan'?'loan':'cash');
      case 'house':return buyHouse(g,p.id);
      case 'end':return endTurn(g);
      default:throw Error('未知的動作。');
    }
  }
  // 需要大螢幕自動處理：該動作的是 Bot；或要回覆的真人已經離線（自動拒絕／不反制，避免整局卡住）。
  needsBot(){
    const g=this.game;if(g?.status!=='playing')return false;
    const a=this.actor();if(!a)return false;
    if(a.bot)return true;
    return g.phase==='respond'&&this.seatOf(a)?.connected===false;
  }
  // Bot 一次走一步，讓大螢幕看得到過程。回傳 false 代表現在不需要自動處理。
  botStep(rng=Math.random){
    if(!this.needsBot())return false;
    const g=this.game,q=this.currentPlayer();
    if(g.phase==='respond'){const a=this.actor();respond(g,a.id,a.bot?botRespond(g,a,rng):false);return true}
    if(g.phase==='destiny'){drawDestiny(g);return true}
    if(g.phase==='exam'){takeExam(g);return true}
    if(g.phase==='roll'){rollDice(g);return true}
    if(g.phase==='skip'){endTurn(g);return true}
    if(g.phase==='draw'){drawEvent(g);return true}
    if(g.phase==='choice'){resolveChoice(g,q.id,botChoice(g,q,rng));return true}
    if(g.phase==='manage'){
      const key=`${g.round}:${g.turnIndex}`;
      if(this.botMemo.key!==key)this.botMemo={key,memo:{}};
      const step=botManageStep(g,q,this.botMemo.memo,rng);
      if(!step){endTurn(g);return true}
      if(step.type==='overtime')setOvertime(g,q.id,step.level);
      else if(step.type==='repay')repayDebt(g,q.id,step.debtId,step.amount);
      else if(step.type==='car')buyCar(g,q.id,step.mode);
      else if(step.type==='house')buyHouse(g,q.id);
      return true;
    }
    return false;
  }


  /* ---------- 視角過濾 ---------- */
  // 玩家的身分卡：角色版是角色，工作卡版是目前的工作（沒抽到工作卡就是基本工作）。兩者都是明牌。
  identity(p){
    if(p.variant==='roles'){const r=roleById(p.roleId);return {kind:'role',id:r.id,icon:r.icon,name:r.name,title:r.title}}
    const j=jobOf(p);return {kind:'job',id:j.id,icon:j.icon,name:j.name,title:`每季薪水 ${j.salary} 萬`}
  }
  // 大螢幕與所有人都看得到的資料：位置、身分卡、天命卡、車子、明牌負債、目標進度、事件與景氣。不含現金與非明牌的負債。
  publicView(){
    const g=this.game,variant=this.variant;
    const seats=this.seats.map(s=>({seatId:s.seatId,name:s.name,roleId:s.roleId,isBot:!!s.bot,botLabel:s.bot?botLabel(s.bot):'',connected:s.bot?true:s.connected}));
    const base={code:this.code,mode:this.mode,variant,variantLabel:VARIANTS[variant].label,variantShort:VARIANTS[variant].short,maxRounds:this.maxRounds,seats,
      goalText:variant==='roles'?'':GOAL.text,
      roles:variant==='roles'?ROLES.map(r=>({id:r.id,name:r.name,icon:r.icon,title:r.title,goal:r.goal.text})):[],
      botLevels:Object.entries(BOT_LEVELS).map(([id,v])=>({id,label:v.label,desc:v.desc}))};
    if(!g)return {...base,status:'lobby'};
    const cur=this.currentPlayer(),regime=economyRegime(g),last=g.decisions.at(-1),publicLog=g.log.filter(x=>!PRIVATE_LOG.test(x));
    const card=g.lastDraw?cardById(g.lastDraw.cardId):null,ld=g.lastDestiny?destinyById(g.lastDestiny.destinyId):null,ex=g.lastExam?jobById(g.lastExam.jobId):null;
    const pc=g.pendingChoice;
    return {...base,status:g.status,
      game:{round:g.round,maxRounds:g.maxRounds,turnIndex:g.turnIndex,phase:g.phase,dice:g.dice,reels:g.reels,effReels:g.effReels||null,winnerIds:g.winnerIds,winReason:g.winReason,
        currentId:cur?.id??null,skipReason:g.skipReason||'',
        economy:{growth:g.economy.growth,inflation:g.economy.inflation,unemployment:g.economy.unemployment,rate:g.economy.rate,carPrice:g.economy.carPrice,housePrice:g.economy.housePrice},
        regime,regimeText:regime==='normal'?'':ECON_TILES[regime].text,
        tiles:BOARD.map((t,i)=>{const x=tileAt('main',i,g);return {type:x.type,flipped:!!x.flipped,boosted:regime==='boom'&&x.type==='fortune'}}),
        highway:{from:HIGHWAY.from,to:HIGHWAY.to,toll:HIGHWAY.toll,tiles:HIGHWAY.tiles.map(t=>t.type)},
        abroad:{airport:ABROAD.airport,tiles:ABROAD.tiles.map(t=>t.type)},
        lastMove:g.lastMove?{playerId:g.lastMove.playerId,from:g.lastMove.from,path:g.lastMove.path,returned:!!g.lastMove.returned}:null,
        players:g.players.map((p,i)=>{const d=p.destinyId?destinyById(p.destinyId):null,idn=this.identity(p);return {id:p.id,seatId:this.seats[i]?.seatId,name:p.name,
          identity:idn,icon:idn.icon,roleName:idn.name,roleId:p.roleId,goal:goalText(p),color:p.color,track:p.track,position:p.position,bankrupt:p.bankrupt,
          destiny:d?{id:d.id,icon:d.icon,name:d.name,desc:d.desc}:null,car:!!p.owns.car,house:!!p.owns.house,waitTurns:p.waitTurns,
          training:p.training?{name:jobById(p.training.jobId).name,need:p.training.need}:null,
          publicDebts:p.debts.filter(x=>x.public&&x.balance>0).map(x=>({name:x.name,balance:x.balance})),
          isBot:!!p.bot,botLabel:p.bot?botLabel(p.bot):'',connected:this.seats[i]?.bot?true:!!this.seats[i]?.connected,progress:Math.round(goalProgress(g,p)*100)}}),
        destinyReveal:ld?{playerId:g.lastDestiny.playerId,seq:g.lastDestiny.seq,id:ld.id,icon:ld.icon,name:ld.name,desc:ld.desc}:null,
        card:card?{type:g.lastDraw.type,id:card.id,name:card.name,desc:card.desc||'',note:g.lastDraw.note||'',seq:g.lastDraw.seq||0,isJob:isJobCard(card),icon:card.icon||'',
          ...(isJobCard(card)?{salary:card.salary,cond:jobConditionText(card)}:{})}:null,
        // 機會卡的選項與機率只給輪到的玩家；大螢幕只看到「正在考慮」與結果。
        choiceKind:g.phase==='choice'&&pc?pc.kind:null,
        exam:g.lastExam?{name:ex.name,roll:g.lastExam.roll,bonus:g.lastExam.bonus,need:g.lastExam.need,ok:g.lastExam.ok}:null,
        result:g.lastResult?{text:g.lastResult.text,option:g.lastResult.option||''}:null,
        decision:last?{action:last.action,ruleId:last.ruleId}:null,
        respond:g.phase==='respond'&&g.pendingResponse?{type:g.pendingResponse.type,fromId:g.pendingResponse.fromId,targetId:g.pendingResponse.targetId,to:responder(g).name}:null,
        log:publicLog.slice(0,LOG_KEEP),logCount:publicLog.length}};
  }
  // 只給本人的資料：現金、負債、收支預估、輪到自己時可以做的操作。
  privateView(token){
    const seat=this.seatByToken(token);if(!seat)return null;
    const g=this.game,base={seatId:seat.seatId,name:seat.name,roleId:seat.roleId,variant:this.variant};
    if(!g)return base;
    const p=g.players.find(x=>x.id===seat.playerId);if(!p)return base;
    const isMyTurn=g.status==='playing'&&this.currentPlayer()?.id===p.id,q=computeQuarter(g,p),job=jobOf(p),idn=this.identity(p);
    const pc=g.pendingChoice,choosing=g.phase==='choice'&&isMyTurn&&pc;
    const card=choosing&&pc.cardId?cardById(pc.cardId):null;
    const mustRespond=g.status==='playing'&&responder(g)?.id===p.id;
    const car=carOffer(g,p),house=canBuyHouse(g,p),isRoles=p.variant==='roles',r=isRoles?roleById(p.roleId):null;
    const now=g.round,ally=p.effects.find(x=>x.source==='C13'&&x.until>=now),d=p.destinyId?destinyById(p.destinyId):null;
    let choice=null;
    if(choosing){
      const kind=pc.kind,opts=chanceOptions(g,p,card).map(o=>({index:o.index,key:o.key||'',label:o.label,stake:o.stake,affordable:o.affordable,reason:o.reason||'',odds:(o.outcomes||[]).map(x=>({p:x.p,text:x.text}))}));
      choice=kind==='airport'?{kind,id:'airport',name:'機場',icon:'✈️',desc:`剛好停在機場，可以買機票出國（${ticketPrice(g,p)?`${ticketPrice(g,p)} 萬`:'免費'}）。國外只用一個轉輪移動，走到終點自動回國。`,notice:'',options:opts}
        :{kind,id:card.id,name:card.name,icon:card.icon||'',desc:card.desc||'',
          ...(kind==='job'?{salary:card.salary,living:card.living,cond:jobConditionText(card),current:job.name}:{}),
          notice:pc.declined?.length?g.lastResult?.text||'':'',options:opts};
    }
    const exam=isMyTurn&&g.phase==='exam'&&p.training?(()=>{const j=jobById(p.training.jobId),t=examTarget(p,j);return {name:j.name,need:t.need,bonus:t.bonus}})():null;
    return {...base,playerId:p.id,isMyTurn,phase:isMyTurn?g.phase:null,
      me:{cash:p.cash,totalDebt:totalDebt(p),netWorth:netWorth(p),progress:Math.round(goalProgress(g,p)*100),goal:goalText(p),goalType:isRoles?r.goal.type:'netWorth',goalAmount:isRoles?r.goal.amount??null:GOAL.netWorth,
        identity:idn,icon:idn.icon,roleName:idn.name,
        job:{name:job.name,icon:job.icon,salary:job.salary,living:job.living,desc:job.desc||''},
        destiny:d?{id:d.id,icon:d.icon,name:d.name,desc:d.desc}:null,
        debts:p.debts.map(x=>({id:x.id,name:x.name,balance:x.balance,rate:debtRate(g,x),payment:x.payment,public:!!x.public})),
        fatigue:p.fatigue,burnout:FATIGUE.burnout,overtime:p.overtime,insured:p.insured,unemployedRounds:p.unemployedRounds,waitTurns:p.waitTurns,waitReason:p.waitReason||'',
        training:p.training?{name:jobById(p.training.jobId).name,need:p.training.need}:null,
        salaryFactor:p.salaryFactor,streak:p.streak,bestStreak:p.bestStreak,lastIncome:p.lastIncome,lastNet:p.lastNet,lastBreakdown:p.lastBreakdown,
        investments:p.investments.map(x=>({name:x.name,income:x.income,maturity:x.maturity})),
        alliance:ally?{until:ally.until,partner:g.players.find(x=>x.id===ally.partnerId)?.name||''}:null,
        penalties:p.effects.filter(x=>x.until>=now&&['C13-fallout','C13-decline'].includes(x.source)).map(x=>({text:x.source==='C13-fallout'?'合作鬧翻':'拒絕合作',income:x.income,until:x.until})),
        caseIn:round1(p.flatIncomes.filter(x=>x.until>=now&&x.label==='搶下的案子').reduce((s,x)=>s+x.amount,0)),
        caseOut:round1(p.flatIncomes.filter(x=>x.until>=now&&x.label==='被搶走的案子').reduce((s,x)=>s+x.amount,0)),
        preview:{earned:q.earned,living:q.living,debt:q.debt,net:q.net},
        creditRoom:Math.max(0,creditLimit(p)-creditUsed(p)),creditRate:g.economy.rate+8,
        car:{owned:!!p.owns.car,useHighway:!!p.useHighway,price:car.price,down:car.down,loan:car.loan,payment:car.payment,dsr:car.dsr,cashOk:car.cashOk,loanOk:car.loanOk,isGoal:isRoles&&r.goal.type==='car'},
        house:isRoles&&r.goal.type==='house'?{owned:!!p.owns.house,ok:!!house.ok,price:house.price,down:house.down,dsr:house.dsr,dsrLimit:r.goal.dsr}:null,
        overtimeLevels:Object.entries(OVERTIME).map(([lv,o])=>({level:Number(lv),label:o.label,income:o.income,fatigue:FATIGUE[`overtime${lv}`]})),
        fatigueRules:{normal:FATIGUE.none,rest:FATIGUE.restStop,burnout:FATIGUE.burnout,penalty:FATIGUE.burnoutIncome}},
      choice,exam,
      respond:mustRespond?respondOptions(g):null};
  }
}
