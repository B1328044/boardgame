// Generated from data.js, engine.js, sync.js and app.js. Run node build.mjs after source edits.
'use strict';
// 人生棋局：所有金額單位為「萬元」，一回合代表一季（3 個月）。
// 目標數字照原始企劃；各角色的生活費、起始存款與平均收入經 simulate.mjs 模擬對戰校準，
// 讓四種角色在 2、4、6 人局的平均勝率接近。改動數值後請重跑模擬確認。

const UNIT='萬';

/* ---------- 角色 ---------- */
// salary：每季稅後收入；living：每季生活費（隨物價指數上升）；debts：起始負債。
// rate 為年利率（%），payment 為每季應繳；variable=true 代表跟著央行利率浮動。
const ROLES=[
  {id:'low',name:'底層',title:'基層服務業',icon:'🧹',incomeType:'salary',salary:9,living:4.1,cash:5,
    debts:[{type:'student',name:'學貸',balance:36,rate:1.5,payment:1.5}],
    goal:{type:'debtFree',amount:50,text:'清空所有負債，且存款至少 50 萬'},
    story:'月薪三萬出頭，每個月先繳學貸再算生活費。沒有房貸壓力，但也沒有太多犯錯空間。',
    traits:['收入最低、最穩定','基本工資調漲時直接受惠','被裁員時有失業給付']},
  {id:'office',name:'上班族',title:'一般企業職員',icon:'💼',incomeType:'salary',salary:16.5,living:10.8,cash:15,
    debts:[{type:'student',name:'學貸',balance:20,rate:1.5,payment:1.2},{type:'card',name:'信用卡分期',balance:8,rate:15,payment:1.5}],
    goal:{type:'car',amount:100,text:'一次付清買下一台 100 萬的車'},
    story:'朝九晚五，年資慢慢墊高薪水。手上還有學貸和一筆信用卡分期，存夠錢就想換一台好車。',
    traits:['每年依景氣調薪','車價會隨物價與車市事件變動','信用卡分期利率高，先還划算']},
  {id:'exec',name:'公司高管',title:'企業高階主管',icon:'🏙️',incomeType:'salary',salary:45,living:20,cash:100,bonusMonths:2,
    debts:[{type:'mortgage',name:'房貸',balance:900,rate:2.6,payment:10.8,variable:true},{type:'auto',name:'車貸',balance:60,rate:3,payment:4.5}],
    goal:{type:'house',amount:1000,downPct:30,dsr:50,text:'買下一棟 1,000 萬的房子（頭期款 30%，銀行核貸）'},
    story:'收入最高，負債也最大。每季先付房貸車貸，年終獎金看景氣。想換大房子，銀行還得點頭。',
    traits:['年終獎金隨景氣浮動','房貸利率跟著央行走','買房需頭期款且月付不超過收入 50%']},
  {id:'free',name:'自由業',title:'接案工作者',icon:'🎨',incomeType:'freelance',salary:17.4,living:8,cash:20,
    debts:[{type:'card',name:'信用卡循環',balance:12,rate:15,payment:2}],
    goal:{type:'streak',amount:18,rounds:5,text:'連續 5 季收入都超過 18 萬（月入 6 萬）'},
    story:'案子多的時候月入破十萬，沒案子的時候只能吃老本。收入完全看景氣和自己的拼勁。',
    traits:['每季收入隨機浮動','景氣好壞影響最大','加班接案能拉高收入，但會累積疲勞']}
];

/* ---------- 棋盤 ---------- */
const TILE_TYPES={
  start:{label:'休息站',short:'起點'},
  fortune:{label:'好運',short:'Fortune'},
  market:{label:'市場',short:'Market'},
  chance:{label:'機會',short:'Chance'},
  loss:{label:'災難',short:'Loss'}
};
const LAYOUT=['chance','fortune','market','chance','loss','chance','fortune','market','chance','fortune','chance','loss','market','chance','fortune','chance','market','fortune','chance','loss','market','fortune','chance'];
const BOARD=[{type:'start'},...LAYOUT.map(type=>({type}))];

/* ---------- Fortune：純運氣，必定獲利 ---------- */
// weight 為抽中權重；cash 可依角色給不同金額。
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
// roles：各角色的收入／生活費百分比變動（持續 duration 季）；permanent：永久薪資或物價變動；cash：一次性給付。
const MARKET_EVENTS=[
  {id:'M01',name:'區域戰爭爆發',duration:4,decay:[1,.75,.5,.25],macro:{growth:-3,inflation:3,stock:-25},
    roles:{low:{living:8},office:{living:8},exec:{living:8},free:{living:8,income:-20}},desc:'能源與原物料大漲，景氣急凍。所有人的生活費都變貴，接案市場最先受傷。'},
  {id:'M02',name:'政府調漲基本工資',duration:4,decay:[1,1,1,1],macro:{inflation:.5},permanent:{low:{salary:8}},
    roles:{exec:{income:-6}},desc:'基本工資調漲 8%。基層直接加薪，企業人事成本上升，高管績效獎金縮水。'},
  {id:'M03',name:'AI 科技熱潮',duration:4,decay:[1,.8,.6,.4],macro:{growth:2,stock:20},
    roles:{free:{income:25},office:{income:5},exec:{income:8},low:{income:-6}},desc:'企業大舉投資 AI。接案需求暴增，但基層工作開始被自動化取代。'},
  {id:'M04',name:'房市狂飆',duration:4,decay:[1,1,1,1],macro:{inflation:.5},prices:{house:12},
    roles:{low:{living:6},office:{living:6},free:{living:6}},desc:'房價一年漲一成。想買房的人更難了，租屋族的房租也跟著漲。'},
  {id:'M05',name:'全球疫情爆發',duration:3,decay:[1,.6,.3],macro:{growth:-4,unemployment:2,stock:-20},
    roles:{free:{income:-35},low:{income:-15},exec:{income:-5}},desc:'服務業停擺。基層被減班，接案工作者案源斷炊，坐辦公室的影響最小。'},
  {id:'M06',name:'央行意外升息',duration:1,decay:[1],rateShock:.5,macro:{},desc:'為了壓通膨，央行一次升息半碼以上。浮動利率的房貸馬上變貴，存款利息則變多。'},
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
// stake：選擇後立即支付的金額（可依角色不同）；outcomes 依機率擇一。
// 效果欄位：cash（現金）、stakeX（拿回本金的倍數）、salary（永久薪資 %）、delayedSalary、income（暫時收入 %）、
// flatIncome（每季固定額外收入）、fatigue（疲勞）、unemployed（失業季數）、investment、insurance、skip、delayedCash。
const CHANCE_CARDS=[
  {id:'C01',name:'朋友報明牌',desc:'朋友說某檔股票下個月一定漲，問你要不要跟。',options:[
    {label:'投入 5 萬',stake:5,outcomes:[{p:.35,stakeX:1.8,text:'真的漲了！賺了八成。'},{p:.65,stakeX:.5,text:'消息是假的，認賠一半出場。'}]},
    {label:'投入 20 萬',stake:20,outcomes:[{p:.35,stakeX:1.8,text:'真的漲了！賺了八成。'},{p:.65,stakeX:.5,text:'消息是假的，認賠一半出場。'}]},
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
    {label:'投入 30 萬',stake:30,outcomes:[{p:.25,stakeX:3,text:'真的漲了三倍！'},{p:.75,stakeX:.2,text:'幣價崩盤，只剩兩成。'}]},
    {label:'不碰',stake:0,outcomes:[{p:1,text:'你沒有跟風。'}]}]},
  {id:'C08',name:'保險業務推銷',desc:'投保後每季繳保費，遇到重病、車禍或房屋災害時理賠八成。',options:[
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
  {id:'L02',name:'被裁員／案源斷炊',unemployed:{low:2,office:2,exec:1,free:2},desc:'失去收入。底層與上班族可領失業給付（六成薪），高管一季內找到新工作，自由業沒有任何保障。'},
  {id:'L03',name:'遇到詐騙集團',cashPct:30,cap:100,desc:'假投資、真詐騙，存款被騙走三成（最多 100 萬）。'},
  {id:'L04',name:'嚴重車禍',cost:15,insurable:true,skip:true,desc:'修車加醫藥費 15 萬，下一回合無法行動。'},
  {id:'L05',name:'住處火災',cost:{low:10,office:10,exec:60,free:10},insurable:true,desc:'家具家電全毀。自有房屋的高管損失最大。'},
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

/* ---------- 景氣改變棋盤 ---------- */
// 依上一季結算的成長率決定景氣狀態：衰退時部分市場格變成災難格；過熱時好運格獎金加成。
const ECON_TILES={
  recession:{label:'衰退',growth:-1.5,flip:[8,17],to:'loss',text:'景氣衰退：第 8、17 格的市場格變成災難格'},
  boom:{label:'過熱',growth:3.5,fortuneMultiplier:1.5,text:'景氣過熱：好運格獎金 ×1.5'}
};



const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const round2=n=>Math.round((n+Number.EPSILON)*100)/100;
const roleById=id=>ROLES.find(r=>r.id===id);
const cardById=id=>[...FORTUNE_CARDS,...MARKET_EVENTS,...CHANCE_CARDS,...LOSS_CARDS].find(c=>c.id===id);
// 角色相關數值：可以是數字，或 {low:..,office:..,exec:..,free:..,default:..}
const val=(x,roleId)=>x!==null&&typeof x==='object'&&!Array.isArray(x)?(x[roleId]??x.default??0):x??0;
const nextRandom=state=>{let x=state.rng|0;x^=x<<13;x^=x>>>17;x^=x<<5;state.rng=x|0;return (x>>>0)/4294967296};
const weightedPick=(state,items)=>{const total=items.reduce((s,x)=>s+x.weight,0);let r=nextRandom(state)*total;for(const x of items){r-=x.weight;if(r<0)return x}return items.at(-1)};
const pickOutcome=(state,outcomes)=>{let r=nextRandom(state);for(const o of outcomes){r-=o.p;if(r<0)return o}return outcomes.at(-1)};
const playerById=(state,id)=>state.players.find(p=>p.id===id);
const current=state=>state.players[state.turnIndex];
const say=(state,text)=>state.log.unshift(`第 ${state.round} 季｜${text}`);
/* ---------- 景氣改變棋盤 ---------- */
function economyRegime(state){
  const g=state.economy.growth;
  return g<=ECON_TILES.recession.growth?'recession':g>=ECON_TILES.boom.growth?'boom':'normal';
}
// 這一格目前實際的類型（衰退時部分市場格會變成災難格）。
function tileType(state,i){
  const base=BOARD[i].type,r=ECON_TILES.recession;
  return economyRegime(state)==='recession'&&r.flip.includes(i)&&base==='market'?r.to:base;
}
function tileFlipped(state,i){return tileType(state,i)!==BOARD[i].type}
const money=n=>`${round2(n).toLocaleString('zh-TW',{maximumFractionDigits:2})} 萬`;

/* ---------- 建立對局 ---------- */
function createGame({players,seed=Date.now(),maxRounds=24}){
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
    log:[],dice:null,reels:null,lastDraw:null,pendingChoice:null,pendingResponse:null,lastResult:null,status:'playing',winnerIds:[],winReason:null};
  delete state.economy.noise;
  say(state,'對局開始。');
  return state;
}
function newPlayer({roleId,bot},name,i){
  const r=roleById(roleId);
  return {id:`player-${i+1}`,name,roleId,bot:bot?{level:bot.level,...(bot.style?{style:bot.style}:{})}:null,color:i,position:0,cash:r.cash,
    debts:r.debts.map((d,k)=>({id:`${d.type}-${k}`,...d})),initialDebt:r.debts.reduce((s,d)=>s+d.balance,0),
    salaryFactor:1,fatigue:0,overtime:0,insured:false,investments:[],effects:[],flatIncomes:[],pendingSalary:[],delayedCash:[],
    unemployedRounds:0,skipNext:false,streak:0,feuds:[],stealImmuneUntil:0,bestStreak:0,lastIncome:null,lastNet:null,lastBreakdown:null,
    owns:{car:false,house:false},bankrupt:false,history:[]};
}

/* ---------- 計算工具 ---------- */
const totalDebt=p=>round2(p.debts.reduce((s,d)=>s+d.balance,0));
function debtRate(state,d){
  if(d.type==='mortgage'&&d.variable)return round2(state.economy.rate+.6);
  if(d.type==='credit')return round2(state.economy.rate+CREDIT.spread);
  return d.rate;
}
// 每筆負債本季要繳多少：至少繳清利息（利率上升時月付金不夠付利息，差額也要付），最多繳到還清。
// 預估（computeQuarter）與季結算都用這一個函式，避免「畫面扣的錢」和「實際扣的錢」不一樣。
function debtDue(state,d){const interest=round2(d.balance*debtRate(state,d)/400);return {interest,pay:round2(Math.min(d.balance+interest,Math.max(d.payment,interest)))}}
function quarterlyPayments(state,p){return round2(p.debts.reduce((s,d)=>s+debtDue(state,d).pay,0))}
const baseSalary=p=>round2(roleById(p.roleId).salary*p.salaryFactor);
function creditLimit(p){return round2(roleById(p.roleId).salary*CREDIT.limitQuarters)}
function creditUsed(p){return round2(p.debts.filter(d=>d.type==='credit').reduce((s,d)=>s+d.balance,0))}
function annuity(principal,annualRate,quarters){const r=annualRate/400;return r===0?principal/quarters:principal*r/(1-(1+r)**-quarters)}
function marketPct(state,roleId,key){
  return state.marketActive.reduce((s,a)=>{const e=cardById(a.eventId),age=state.round-a.startedRound;return s+(age>=0&&age<e.duration?(e.roles?.[roleId]?.[key]||0)*e.decay[age]:0)},0);
}
function housePlan(state,p){
  const price=state.economy.housePrice,down=round2(price*.3),loan=round2(price-down);
  const newPayment=round2(annuity(loan,state.economy.rate+.6,120));
  const dsr=round2(100*(quarterlyPayments(state,p)+newPayment)/Math.max(1,baseSalary(p)));
  return {price,down,loan,newPayment,dsr,ok:p.cash>=down&&dsr<=roleById('exec').goal.dsr};
}

// 預估或實際計算一季收支。random=false 時自由業收入取期望值（供介面預覽）。
function computeQuarter(state,p,{random=null}={}){
  const r=roleById(p.roleId),e=state.economy,round=state.round;
  const lines=[];
  let salary=baseSalary(p);
  if(r.incomeType==='freelance'){
    const u=random??.5;
    salary=round2(salary*(.35+1.3*u)*(1+.06*(e.growth-2)));
  }
  let pct=marketPct(state,p.roleId,'income')+p.effects.filter(x=>x.until>=round).reduce((s,x)=>s+(x.income||0),0);
  // 過勞（疲勞 ≥ 70）時效率很差：收入 −20%，加班也沒有額外收入。
  if(p.overtime&&p.fatigue<FATIGUE.burnout)pct+=OVERTIME[p.overtime].income;
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
function movementPath(from,steps,length=BOARD.length){return Array.from({length:steps},(_,i)=>(from+i+1)%length)}
function rollDice(state,forced){
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
function tileLabel(i,state){const t=state?tileType(state,i):BOARD[i].type;return {start:'休息站',fortune:'好運',market:'市場',chance:'機會',loss:'災難'}[t]}

function drawEvent(state,forcedId){
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
  // 合作期間：現金損失（保險理賠後）由夥伴分擔 20%。
  const cashLost=round2(lost-(card.wipeInvestments?lost:0)),ally=activeAlliance(state,p),partner=ally&&playerById(state,ally.partnerId);
  if(cashLost>0&&partner&&!partner.bankrupt){
    const share=round2(cashLost*INTERACT.alliance.share);
    partner.cash=round2(partner.cash-share);p.cash=round2(p.cash+share);lost=round2(lost-share);
    notes.push(`${partner.name}分擔 ${money(share)}`);
  }
  if(card.income)p.effects.push({source:card.id,income:card.income,until:state.round});
  if(card.unemployed){p.unemployedRounds+=val(card.unemployed,p.roleId);notes.push(`失去收入 ${val(card.unemployed,p.roleId)} 季`)}
  if(card.skip){p.skipNext=true;notes.push('下一回合無法行動')}
  state.lastResult={text:[lost?`損失 ${money(lost)}`:'',...notes].filter(Boolean).join('，'),cash:-lost};
  say(state,`${p.name}遭遇「${card.name}」：${state.lastResult.text||'無直接損失'}。`);
}
/* ---------- 互動卡：合作與搶案 ---------- */
function activeAlliance(state,p){return p.effects.find(x=>x.source==='C13'&&x.until>=state.round)||null}
const allied=(state,a,b)=>activeAlliance(state,a)?.partnerId===b.id;
const beingRobbed=(state,t)=>t.flatIncomes.some(x=>x.label==='被搶走的案子'&&x.until>=state.round);
// 搶案成功率：自己的平均薪資 ÷（自己＋對方），限制在 20%～80%。
function stealChance(p,t){const S=INTERACT.steal;return round2(clamp(baseSalary(p)/(baseSalary(p)+baseSalary(t)),S.minChance,S.maxChance))}
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
// 互動卡的選項會依其他（未破產的）玩家展開成多個選項；不能選的對象會附上原因。
function chanceOptions(state,p,card){
  const list=[],A=INTERACT.alliance,S=INTERACT.steal,pc=state.pendingChoice;
  const declined=pc?.cardId===card.id?pc.declined??[]:[],invites=pc?.cardId===card.id?pc.invites??0:0;
  const others=state.players.filter(x=>x.id!==p.id&&!x.bankrupt);
  for(const o of card.options){
    const base={label:val(o.label,p.roleId),stake:val(o.stake,p.roleId),outcomes:Array.isArray(o.outcomes)?o.outcomes:o.outcomes[p.roleId]??o.outcomes.default};
    if(o.invite){
      const own=activeAlliance(state,p);
      for(const t of others){
        const reason=own?'你已經有合作對象':inviteBlock(state,p,t,declined);
        list.push({...base,kind:'invite',label:`${invites?'改邀':'邀請'} ${t.name} 合作`,targetId:t.id,reason});
      }
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
function resolveChoice(state,playerId,index){
  const p=current(state);
  if(state.status!=='playing'||state.phase!=='choice'||p.id!==playerId||!state.pendingChoice)throw Error('現在沒有需要決定的機會卡。');
  const card=cardById(state.pendingChoice.cardId),opt=chanceOptions(state,p,card)[index];
  if(!opt)throw Error('請選擇一個選項。');
  if(opt.reason)throw Error(opt.reason);
  if(!opt.affordable)throw Error(`現金不足，需要 ${money(opt.stake)}。`);
  const t=opt.targetId?playerById(state,opt.targetId):null;
  if(opt.kind==='invite'){
    const pc=state.pendingChoice;
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
  const delta=round2(p.cash-before-opt.stake);
  state.lastResult={text:o.text,cash:delta,option:opt.label};
  say(state,`${p.name}選擇「${opt.label}」：${o.text}`);
  state.pendingChoice=null;state.phase='manage';
  checkGoal(state,p);
  return o;
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
      state.phase='manage';
    } else {
      const declined=[...r.declined,t.id];
      say(state,`${t.name}拒絕了${p.name}的合作邀請。`);
      const card=cardById(r.cardId),again=r.invites<A.maxInvites&&!activeAlliance(state,p);
      state.pendingChoice={cardId:r.cardId,playerId:p.id,declined,invites:r.invites};
      if(again&&chanceOptions(state,p,card).some(o=>o.kind==='invite'&&o.affordable)){state.phase='choice';state.lastResult={text:`${t.name}拒絕了，可以再邀另一位。`,cash:0,option:`邀請 ${t.name} 合作`}}
      else {state.pendingChoice=null;state.phase='manage';state.lastResult={text:`${t.name}拒絕了，這次沒找到合作夥伴。`,cash:0,option:`邀請 ${t.name} 合作`}}
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
  state.pendingResponse=null;state.phase='manage';
  checkGoal(state,p);checkGoal(state,t);
}
function applyEffects(state,p,o,stake){
  const r=state.round,v=x=>val(x,p.roleId);
  if(o.cash)p.cash=round2(p.cash+v(o.cash));
  if(o.stakeX)p.cash=round2(p.cash+stake*o.stakeX);
  if(o.salary)p.salaryFactor=round2(p.salaryFactor*(1+v(o.salary)/100)*10000)/10000;
  if(o.delayedSalary)p.pendingSalary.push({at:r+o.delayedSalary.after,pct:v(o.delayedSalary.pct)});
  if(o.flatIncome)p.flatIncomes.push({amount:o.flatIncome.amount,until:r+o.flatIncome.rounds-1,label:o.flatIncome.label});
  if(o.fatigue)p.fatigue=clamp(p.fatigue+o.fatigue,0,100);
  if(o.unemployed)p.unemployedRounds+=o.unemployed;
  if(o.investment){const x=o.investment;p.investments.push({id:`inv-${r}-${p.investments.length}`,name:x.name,value:x.value||0,income:x.income||0,maturity:x.maturity?r+x.maturity:null,payout:x.payout??0,collapse:!!x.collapse})}
  if(o.insurance)p.insured=true;
  if(o.skip)p.skipNext=true;
  if(o.delayedCash)p.delayedCash.push({at:r+o.delayedCash.after,amount:o.delayedCash.amount});
}

/* ---------- 經營動作 ---------- */
function requireManage(state,playerId){const p=current(state);if(state.status!=='playing'||state.phase!=='manage'||p.id!==playerId)throw Error('只能在自己的經營階段操作。');return p}
function setOvertime(state,playerId,level){const p=requireManage(state,playerId);if(![0,1,2].includes(level))throw Error('加班程度無效。');p.overtime=level}
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
function canBuyGoal(state,p){
  if(p.roleId==='office')return {ok:p.cash>=state.economy.carPrice,price:state.economy.carPrice};
  if(p.roleId==='exec'){const h=housePlan(state,p);return {ok:h.ok,price:h.down,plan:h}}
  return {ok:false};
}
function buyGoal(state,playerId){
  const p=requireManage(state,playerId),c=canBuyGoal(state,p);
  if(!c.ok)throw Error(p.roleId==='exec'?'頭期款不足，或銀行核貸條件（月付 ≤ 收入 50%）未達成。':'現金不足。');
  if(p.roleId==='office'){p.cash=round2(p.cash-c.price);p.owns.car=true;say(state,`${p.name}一次付清，買下 ${money(c.price)} 的新車！`)}
  else {const h=c.plan;p.cash=round2(p.cash-h.down);p.owns.house=true;p.debts.push({id:`mortgage-new`,type:'mortgage',name:'新屋房貸',balance:h.loan,rate:0,payment:h.newPayment,variable:true});say(state,`${p.name}付了頭期款 ${money(h.down)}，買下 ${money(h.price)} 的房子！`)}
  win(state,[p],'goal');
}

/* ---------- 勝利判定 ---------- */
function goalProgress(state,p){
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
  state.turnIndex=i;state.dice=null;state.reels=null;state.lastDraw=null;state.lastResult=null;
  const p=current(state);
  if(p.skipNext){p.skipNext=false;state.phase='skip';say(state,`${p.name}本回合無法行動。`)}
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
      else {p.bankrupt=true;say(state,`${p.name}現金與信用額度都用盡，宣告破產。`);endTiesWith(state,p)}
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
function importGame(json){const s=JSON.parse(json);if(s.version!==1||s.game!=='life'||!Array.isArray(s.players)||!s.economy)throw Error('存檔格式不正確。');return s}


// 電腦玩家（Bot）。介面與模擬共用同一套決策。
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

function makeBot(level,rng=Math.random){
  if(!BOT_LEVELS[level])return null;
  if(level==='low'){const styles=Object.keys(LOW_STYLES);return {level,style:styles[Math.floor(rng()*styles.length)]}}
  return {level};
}
function botLabel(bot){if(!bot)return '';return `Bot·${BOT_LEVELS[bot.level].label}${bot.style?`（${LOW_STYLES[bot.style].label}）`:''}`}

/* ---------- 估值 ---------- */
// 估計一個結果對自己的價值（萬元）。自由業重視收入成長，因為目標是連續高收入。
function outcomeValue(s,p,o,stake){
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
function botChoice(s,p,rng=Math.random){
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
function botRespond(s,p,rng=Math.random){
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
function botManageStep(s,p,memo,rng=Math.random){
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
const fmt=n=>Number(n).toLocaleString('zh-TW',{maximumFractionDigits:Math.abs(n)<10?2:1});
const m=n=>`${fmt(n)} 萬`,signed=n=>`${n>=0?'+':'−'}${fmt(Math.abs(n))} 萬`,pct=(n,d=1)=>`${Number(n).toFixed(d)}%`;
const colors=['#0f9688','#5979b0','#ce9460','#aa6b91','#c55d5d','#7e9541','#348da5','#7a60ad'];
const typeLabel={fortune:'好運',market:'市場',chance:'機會',loss:'災難',start:'休息站'};
const typeIcon={fortune:'✦',market:'◎',chance:'?',loss:'⚠',start:'☕'};
const role=id=>roleById(id);
const storageKey='life-board-v1',viewKey='life-board-view-v1';
const tabId=globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`;
let channel=null;try{if('BroadcastChannel' in globalThis)channel=new BroadcastChannel(storageKey)}catch{}
let openPlayerId=null,state=null,page=location.hash==='#setup'?'game':'home',tab='business',toastTimer,resetAt=0,animation=null,animationSerial=0,dismissedCardKey=null,resetArmedUntil=0;
let setupPlayers=[{name:'玩家 1',roleId:'low',control:'human'},{name:'Bot 1',roleId:'office',control:'mid'},{name:'Bot 2',roleId:'exec',control:'high'},{name:'Bot 3',roleId:'free',control:'low'}];
const BOT_SPEEDS={slow:{label:'慢',ms:1500},normal:{label:'正常',ms:800},fast:{label:'快',ms:250}};
let botTimer=null,botPaused=false,botSpeed='normal',botMemo={key:null,memo:{}};
try{const v=JSON.parse(localStorage.getItem('life-board-bot'));if(BOT_SPEEDS[v?.speed])botSpeed=v.speed}catch{}
const MOVE_TOTAL_MS=2400,stepMsFor=n=>Math.max(150,Math.min(600,MOVE_TOTAL_MS/Math.max(1,n)));
try{const v=JSON.parse(sessionStorage.getItem(viewKey));if(['business','events','economy','history'].includes(v?.tab))tab=v.tab}catch{}
const rememberView=()=>{try{sessionStorage.setItem(viewKey,JSON.stringify({tab}))}catch{}};

/* ---------- 儲存與多頁籤同步（沿用模板） ---------- */
function notify(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3200)}
const newGameId=()=>globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`;
function prepareNewSession(g){const prev=syncInfo(state);g.sync={gameId:newGameId(),revision:0,updatedAt:Math.max(Date.now(),(prev?.updatedAt||0)+1,resetAt+1),writerId:tabId}}
function readStored(){try{const raw=localStorage.getItem(storageKey);return raw?importGame(raw):null}catch{return undefined}}
function cancelAnimation(){animationSerial++;animation=null}
function save(){
  if(!state)return;if(!state.sync)prepareNewSession(state);
  state.sync.revision++;state.sync.updatedAt=Math.max(Date.now(),state.sync.updatedAt+1);state.sync.writerId=tabId;
  try{localStorage.setItem(storageKey,exportGame(state));$('#save-status').textContent='多頁籤已同步'}catch{$('#save-status').textContent='本機儲存不可用，請匯出備份'}
  try{channel?.postMessage({type:'state',writerId:tabId,game:state})}catch{}
}
function clearSave(){const updatedAt=Math.max(Date.now(),(syncInfo(state)?.updatedAt||0)+1,resetAt+1);resetAt=updatedAt;try{localStorage.removeItem(storageKey)}catch{}try{channel?.postMessage({type:'reset',updatedAt,writerId:tabId})}catch{}}
function adoptShared(incoming){
  if(!isNewerGame(incoming,state))return false;
  const prev=state,same=prev&&syncInfo(prev).gameId===syncInfo(incoming).gameId&&prev.round===incoming.round&&prev.turnIndex===incoming.turnIndex&&prev.phase==='roll'&&incoming.phase!=='roll'&&Number.isInteger(incoming.dice);
  const from=same?prev.players[prev.turnIndex].position:null;
  cancelAnimation();state=incoming;render();$('#save-status').textContent='已從其他頁籤同步';
  if(same)beginRollAnimation({playerId:incoming.players[incoming.turnIndex].id,from,dice:incoming.dice,reels:incoming.reels});
  return true;
}
function ensureFresh(){const stored=readStored();if(stored===null&&state){cancelAnimation();state=null;render();notify('其他頁籤已開始新遊戲。');return false}if(stored&&isNewerGame(stored,state)){adoptShared(stored);notify('對局已由其他頁籤更新，請確認後再操作。');return false}return true}
async function withLock(work){if(globalThis.navigator?.locks?.request)return navigator.locks.request(`${storageKey}-write`,{mode:'exclusive'},work);return work()}
async function run(fn){if(animation)return;try{await withLock(()=>{if(!ensureFresh())return;fn();save();render()})}catch(e){notify(e.message||'操作失敗')}}

/* ---------- 首頁與設定 ---------- */
function renderHomeRoles(){
  $('#home-roles').innerHTML=ROLES.map(r=>{
    const debts=r.debts.map(d=>`<div><dt>${h(d.name)}</dt><dd>${m(d.balance)} · 年息 ${d.variable?'浮動 ':''}${d.rate}%</dd></div>`).join('');
    return `<article class="home-role"><div class="home-role-title"><span class="home-role-icon" aria-hidden="true">${r.icon}</span><div><span class="home-role-sector">${h(r.title)}</span><h3>${h(r.name)}</h3></div></div><p class="home-role-story">${h(r.story)}</p><p class="home-role-goal"><b>勝利目標</b>${h(r.goal.text)}</p><div class="home-role-totals"><div><span>${r.incomeType==='freelance'?'平均季收入':'季收入'}</span><strong>+${m(r.salary)}</strong></div><div><span>季生活費</span><strong>−${m(r.living)}</strong></div><div><span>起始存款</span><strong>${m(r.cash)}</strong></div></div><div class="home-role-flows"><div><h4>起始負債</h4><dl>${debts}</dl></div><div><h4>角色特性</h4><ul class="trait-list">${r.traits.map(t=>`<li>${h(t)}</li>`).join('')}</ul></div></div></article>`;
  }).join('');
}
function renderSetup(){
  $('#setup-players').innerHTML=setupPlayers.map((p,i)=>`<div class="setup-player"><span class="player-numeral">${i+1}</span><input data-setup-name="${i}" aria-label="玩家 ${i+1} 名稱" maxlength="16" value="${h(p.name)}"><select data-setup-role="${i}" aria-label="玩家 ${i+1} 角色">${ROLES.map(r=>`<option value="${r.id}" ${r.id===p.roleId?'selected':''}>${r.icon} ${h(r.name)}</option>`).join('')}</select><select data-setup-control="${i}" aria-label="玩家 ${i+1} 操作者"><option value="human" ${p.control==='human'?'selected':''}>👤 人類</option>${Object.entries(BOT_LEVELS).map(([k,v])=>`<option value="${k}" ${p.control===k?'selected':''} title="${h(v.desc)}">🤖 Bot·${v.label}</option>`).join('')}</select><button class="remove-player" data-remove-player="${i}" type="button" aria-label="移除玩家 ${i+1}" ${setupPlayers.length<=2?'disabled':''}>×</button></div>`).join('');
  $('#add-player').disabled=setupPlayers.length>=8;
}

/* ---------- 棋盤 ---------- */
const currentPlayer=()=>state?.players[state.turnIndex];
// 現在該誰動作：平常是輪到的玩家；被邀請合作或被搶案子時是要回覆的人。
const actorPlayer=()=>state?.phase==='respond'?responder(state):currentPlayer();
function boardCoords(i){if(i<=6)return [1,i+1];if(i<=12)return [i-5,7];if(i<=18)return [7,19-i];return [25-i,1]}
function drawnCard(){
  if(state.phase!=='manage'||!state.lastDraw||state.lastDraw.type==='chance'&&!state.lastResult)return null;
  const key=`${state.sync?.gameId||'local'}:${state.round}:${state.turnIndex}:${state.lastDraw.cardId}`;
  return key===dismissedCardKey?null:{key,draw:state.lastDraw,card:cardById(state.lastDraw.cardId)};
}
function marketEffectText(e){
  const parts=[];
  const mac=e.macro||{},names={growth:'成長',inflation:'通膨',unemployment:'失業',stock:'股市'};
  for(const [k,v] of Object.entries(mac))if(v)parts.push(`${names[k]} ${v>0?'+':''}${v}${k==='stock'?'%':' 個百分點'}`);
  if(e.rateShock)parts.push(`利率 +${e.rateShock}`);
  if(e.prices?.house)parts.push(`房價 ${e.prices.house>0?'+':''}${e.prices.house}%`);
  if(e.prices?.car)parts.push(`車價 ${e.prices.car>0?'+':''}${e.prices.car}%`);
  for(const r of ROLES){const x=e.roles?.[r.id],perm=e.permanent?.[r.id];const bits=[];if(x?.income)bits.push(`收入 ${x.income>0?'+':''}${x.income}%`);if(x?.living)bits.push(`生活費 +${x.living}%`);if(perm?.salary)bits.push(`薪資永久 +${perm.salary}%`);if(val(e.cash,r.id))bits.push(`現金 +${m(val(e.cash,r.id))}`);if(bits.length)parts.push(`${r.name}：${bits.join('、')}`)}
  return parts;
}
function cardScene(type,inner,extra=''){return `<div class="card-scene card-reveal scope-${type}" role="status">${inner}${extra}</div>`}
function centerContent(){
  const p=currentPlayer();
  if(animation)return null;
  if(state.status!=='playing')return null;
  if(state.phase==='draw'){const t=tileType(state,p.position);return `<div class="card-scene scope-${t}"><p class="card-hint">停在${typeLabel[t]}格 · ${p.bot?'Bot 抽卡中':'輪到你抽卡'}</p><button class="draw-deck" type="button" data-action="draw-card" ${p.bot?'disabled':''} aria-label="點擊抽${typeLabel[t]}卡"><span class="deck-shadow" aria-hidden="true"></span><span class="deck-back"><span>${typeIcon[t]}</span><strong>${typeLabel[t]}</strong><small>點一下抽卡</small></span></button><p class="card-instruction">點擊卡背翻開結果</p></div>`}
  if(state.phase==='choice'){
    const card=cardById(state.pendingChoice.cardId),opts=chanceOptions(state,p,card);
    const note=state.lastDraw?.note?`<p class="revealed-desc">${h(state.lastDraw.note)}</p>`:'';
    const declinedNote=state.pendingChoice.declined?.length&&state.lastResult?.text?`<p class="result-line bad">${h(state.lastResult.text)}</p>`:'';
    return cardScene('chance',`<p class="card-hint">機會 · ${card.id} · 請做出選擇</p><div class="revealed-card"><span class="revealed-symbol">?</span><h3>${h(card.name)}</h3>${note}${declinedNote}<p class="revealed-desc">${h(card.desc)}</p></div>`,`<div class="choice-row">${opts.map(o=>`<button class="card-continue ${o.stake?'':'ghost'}" type="button" data-action="choose" data-value="${o.index}" ${o.affordable&&!p.bot?'':'disabled'} title="${h(o.outcomes.map(x=>`${Math.round(x.p*100)}%：${x.text}`).join('\n'))}">${h(o.label)}${o.affordable?'':`（${h(o.reason||'現金不足')}）`}</button>`).join('')}</div>`);
  }
  if(state.phase==='respond'){
    const r=respondOptions(state),t=responder(state),card=cardById(state.pendingResponse.cardId);
    const btn=(yes,o)=>`<button class="card-continue ${yes?'':'ghost'}" type="button" data-action="respond" data-value="${yes?1:0}" ${t.bot||o.affordable===false?'disabled':''} title="${h(o.detail)}">${h(o.label)}${o.affordable===false?'（現金不足）':''}</button>`;
    return cardScene('chance',`<p class="card-hint">機會 · ${card.id} · 請 ${h(t.name)} 回覆</p><div class="revealed-card"><span class="revealed-symbol">${r.type==='alliance'?'🤝':'💼'}</span><h3>${h(t.name)}，${h(r.question)}</h3><p class="revealed-desc"><b>${h(r.yes.label)}：</b>${h(r.yes.detail)}</p><p class="revealed-desc"><b>${h(r.no.label)}：</b>${h(r.no.detail)}</p></div>`,t.bot?`<p class="card-instruction">🤖 ${h(t.name)} 正在考慮…</p>`:`<div class="choice-row">${btn(true,r.yes)}${btn(false,r.no)}</div>`);
  }
  const shown=drawnCard();
  if(shown){
    const {draw,card}=shown,t=draw.type;
    const body=t==='market'?`<p class="revealed-desc">${h(card.desc)}</p><div class="revealed-effects">${marketEffectText(card).map(x=>`<span class="effect-chip">${h(x)}</span>`).join('')}</div>`:t==='chance'?`<p class="revealed-desc">你選擇「${h(state.lastResult.option)}」</p><p class="result-line">${h(state.lastResult.text)}</p>`:`<p class="revealed-desc">${h(card.desc)}</p>${state.lastResult?.text?`<p class="result-line ${state.lastResult.cash<0?'bad':''}">${h(state.lastResult.text)}</p>`:''}`;
    return cardScene(t,`<p class="card-hint">${typeLabel[t]} · ${card.id}${draw.note?` · ${h(draw.note)}`:''}</p><div class="revealed-card"><span class="revealed-symbol">${typeIcon[t]}</span><h3>${h(card.name)}</h3>${body}</div>`,p.bot?`<p class="card-instruction">🤖 Bot 正在看卡…</p>`:`<button class="card-continue" type="button" data-action="dismiss-card">繼續 →</button>`);
  }
  if(state.phase==='manage'){
    const r=role(p.roleId),q=computeQuarter(state,p),prog=goalProgress(state,p);
    return `<div class="manage-scene" role="status" style="--manage-accent:${colors[p.color]}"><div class="manage-label">第 ${state.round} 季 · ${h(p.name)} 的理財時間</div><div class="manage-icon" aria-hidden="true">${r.icon}</div><h3>${h(r.name)}</h3><p class="manage-story">${h(r.goal.text)}</p><div class="goal-track"><i style="width:${Math.round(prog*100)}%"></i></div><p class="manage-tip"><strong>本季預估${r.incomeType==='freelance'?'（收入取平均）':''}</strong>收入 ${signed(q.earned)} · 生活費 ${signed(-q.living)} · 還款 ${signed(-q.debt)}</p><div class="manage-stats"><div><span>預估本季淨額</span><strong class="${q.net<0?'negative':''}">${signed(q.net)}</strong></div><div><span>目前現金</span><strong>${m(p.cash)}</strong></div></div><small>在右側調整加班、還款與借款，完成後交給下一位。</small></div>`;
  }
  if(state.phase==='skip')return `<div class="strike-scene" role="status"><span class="strike-siren">暫停一回合</span><span class="strike-ghost" aria-hidden="true">🩹</span><h3>${h(p.name)}正在休養</h3><p>上一回合的意外讓你這回合無法行動，本季仍照常結算收支。</p></div>`;
  return null;
}
function slotMarkup(values){return `<div class="slot-machine" role="group" aria-label="兩個 0 到 6 的拉霸轉輪">${values.map((v,i)=>{const pos=animation?.reelPositions?.[i]??v;const cells=Array.from({length:49},(_,c)=>`<strong class="slot-cell">${c%7}</strong>`).join('');return `<span class="slot-reel ${animation?.stage==='rolling'&&animation.spinning[i]?'spinning':''}" aria-label="第 ${i+1} 個轉輪：${v}"><span class="slot-strip" style="transform:translateY(-${pos*100}%)">${cells}</span></span>`}).join('')}</div>`}
function renderBoard(){
  const pos=state.players.filter(p=>!p.bankrupt).map(p=>({p,index:animation?.playerId===p.id?animation.position:p.position}));
  const tiles=BOARD.map((tile,i)=>{
    const [row,col]=boardCoords(i),occ=pos.filter(x=>x.index===i),type=tileType(state,i),flipped=tileFlipped(state,i),boosted=type==='fortune'&&economyRegime(state)==='boom';
    const tokens=occ.map(x=>`<span class="token ${animation?.playerId===x.p.id?'moving':''}" title="${h(x.p.name)}" style="background:${colors[x.p.color]}"></span>`).join('');
    const tag=flipped?`<span class="tile-tag bad" title="${h(ECON_TILES.recession.text)}">衰退</span>`:boosted?`<span class="tile-tag good" title="${h(ECON_TILES.boom.text)}">×${ECON_TILES.boom.fortuneMultiplier}</span>`:'';
    return `<div class="tile ${type} ${flipped?'flipped':''} ${boosted?'boosted':''} ${occ.length>4?'crowded':''} ${animation?.position===i?'tile-active':''} ${animation?.visited.has(i)?'tile-visited':''}" data-tile-index="${i}" style="grid-row:${row};grid-column:${col}"><span class="tile-number">${String(i).padStart(2,'0')}</span><span class="tile-type">${typeLabel[type]}</span>${tag}<span class="tile-icon">${typeIcon[type]}</span><div class="tile-tokens">${tokens}</div></div>`;
  }).join('');
  const values=animation?.displayReels||(state.reels||[0,0]);
  const total=animation?.stage==='rolling'?'數字跳動中…':state.dice===null?'啟動拉霸前進':state.dice===0?'原地停留':`前進 ${state.dice} 格`;
  const center=centerContent();
  $('#board').innerHTML=tiles+`<div class="board-center ${center?.includes('manage-scene')?'manage-mode':''} ${center?.includes('strike-scene')?'strike-mode':''}">${center||`<div class="center-icon">⌁</div><h3>人生正在運轉</h3><p>兩輪拉霸 · 逐格前進 · 每季結算</p>${slotMarkup(values)}<div class="slot-total">${total}</div><small>停在休息站可以消除疲勞</small>`}</div>`;
}

/* ---------- 回合面板 ---------- */
function steps(n){return `<div class="turn-steps">${[0,1,2].map(i=>`<span class="${i<n?'done':''}"></span>`).join('')}</div>`}
function goalBlock(p){
  const r=role(p.roleId);
  if(r.goal.type==='car'){const c=canBuyGoal(state,p);return `<div class="action-block"><h4>勝利目標 · 買車</h4><p>車價 ${m(state.economy.carPrice)}，目前現金 ${m(p.cash)}。現金足夠就能一次付清並獲勝。</p><button class="goal-btn" data-action="buy-goal" ${c.ok?'':'disabled'}>一次付清買車 ${c.ok?'🏁':''}</button></div>`}
  if(r.goal.type==='house'){const hp=housePlan(state,p);return `<div class="action-block"><h4>勝利目標 · 買房</h4><p>房價 ${m(hp.price)}：頭期款 ${m(hp.down)}（目前現金 ${m(p.cash)}）；新房貸每季 ${m(hp.newPayment)}，加上現有負債後月付佔收入 <b class="${hp.dsr>r.goal.dsr?'negative':''}">${pct(hp.dsr,0)}</b>（上限 ${r.goal.dsr}%）。</p><button class="goal-btn" data-action="buy-goal" ${hp.ok?'':'disabled'}>付頭期款買房 ${hp.ok?'🏁':''}</button></div>`}
  if(r.goal.type==='debtFree')return `<div class="action-block"><h4>勝利目標 · 無債存款</h4><p>負債剩 ${m(totalDebt(p))}，現金 ${m(p.cash)}。還清所有負債且現金 ≥ ${m(r.goal.amount)} 時立即獲勝。</p></div>`;
  return `<div class="action-block"><h4>勝利目標 · 穩定高收入</h4><p>已連續 <b>${p.streak}</b> 季收入 ≥ ${m(r.goal.amount)}（目標 ${r.goal.rounds} 季，最佳紀錄 ${p.bestStreak} 季）。上季收入 ${p.lastIncome===null?'—':m(p.lastIncome)}。</p></div>`;
}
function renderTurn(){
  const p=currentPlayer(),r=role(p.roleId),head=`<h2 class="turn-name" style="color:${colors[p.color]}">${r.icon} ${h(p.name)}</h2><p class="turn-role">${h(r.name)} · ${h(r.title)}</p>`;
  const el=$('#turn-content');
  if(state.status!=='playing'){
    const winners=state.players.filter(x=>state.winnerIds.includes(x.id));
    const why={goal:'達成目標',progress:'季數用完，目標進度最高',survivor:'其他玩家都破產',bankruptcy:'所有玩家都破產'}[state.winReason];
    el.innerHTML=`<h2 class="turn-name">對局結束</h2><p class="turn-role">${h(why)}</p><p class="turn-meta">勝出：<strong>${h(winners.map(w=>`${w.name}（${role(w.roleId).name}）`).join('、')||'無')}</strong></p><button class="secondary" data-action="new-game">再玩一局</button>`;return;
  }
  if(state.phase==='respond'){const t=responder(state);el.innerHTML=`${head}${steps(2)}<p class="turn-meta">等 ${h(t.name)} ${state.pendingResponse.type==='alliance'?'決定要不要合作':'決定要不要反制'}。${t.bot?'（Bot 自動回覆）':`請 ${h(t.name)} 在棋盤中央回覆。`}</p>`;return}
  if(p.bot){el.innerHTML=`${head}<div class="bot-status"><span class="bot-dot"></span>🤖 ${h(botLabel(p.bot))}${botPaused?' · 已暫停':` · ${botPhaseText()}`}</div><p class="turn-meta">${h(p.bot.style?LOW_STYLES[p.bot.style].desc:BOT_LEVELS[p.bot.level].desc)}。</p><p class="turn-meta bot-last">${h(state.log[0]||'')}</p>${botControls()}`;return}
  if(animation){el.innerHTML=`${head}${steps(2)}<p class="turn-meta">${animation.stage==='rolling'?'兩個數字正在跳動…':animation.stage==='result'?'結果已停定，稍後開始移動。':`前進 ${animation.dice} 格。`}</p><button class="primary" disabled>請稍候…</button>`;return}
  if(state.phase==='skip'){el.innerHTML=`${head}${steps(2)}<p class="turn-meta">這回合無法行動，本季收支照常結算。</p><button class="primary" data-action="end-turn">${lastTurn()?'結算本季 →':'交給下一位 →'}</button>`;return}
  if(state.phase==='roll'){el.innerHTML=`${head}${steps(0)}<p class="turn-meta">輪到你啟動拉霸。兩個轉輪各顯示 0–6，相加就是前進格數。</p><button class="primary" data-action="roll">啟動拉霸　▦</button>`;return}
  if(state.phase==='draw'||state.phase==='choice'||drawnCard()){el.innerHTML=`${head}${steps(2)}<p class="turn-meta">停在「${typeLabel[tileType(state,p.position)]}」格。${state.phase==='draw'?'請點棋盤中央的卡片抽卡。':state.phase==='choice'?'請在棋盤中央的卡片上做出選擇。':'看完卡片後按「繼續」。'}</p>`;return}
  const debtOptions=p.debts.map(d=>`<option value="${d.id}">${h(d.name)} · 餘 ${m(d.balance)} · 年息 ${debtRate(state,d)}%</option>`).join('');
  const room=Math.max(0,creditLimit(p)-creditUsed(p));
  el.innerHTML=`${head}${steps(3)}<p class="turn-meta">${state.dice?`前進 ${state.dice} 格。`:'停留原地。'}完成理財決定後交給下一位玩家。</p>
  <div class="action-block"><h4>本季工作量 · 疲勞 ${p.fatigue}</h4><div class="fatigue-track"><i style="width:${p.fatigue}%" class="${p.fatigue>=FATIGUE.burnout?'burn':''}"></i></div><p>季結算時疲勞 ≥ ${FATIGUE.burnout}：收入 −20%，而且加班沒有額外收入。不加班每季疲勞 −20，停在休息站再 −20。</p><div class="seg-row">${[[0,'正常上班','疲勞 −20'],[1,'加班',p.fatigue>=FATIGUE.burnout?'過勞中沒有加成 · 疲勞 +10':'收入 +15% · 疲勞 +10'],[2,'爆肝',p.fatigue>=FATIGUE.burnout?'過勞中沒有加成 · 疲勞 +25':'收入 +30% · 疲勞 +25']].map(([lv,label,sub])=>`<button type="button" data-action="overtime" data-value="${lv}" class="${p.overtime===lv?'on':''}" ${p.unemployedRounds?'disabled':''}><b>${label}</b><small>${sub}</small></button>`).join('')}</div></div>
  ${p.debts.length?`<div class="action-block"><h4>提前還款 · 總負債 ${m(totalDebt(p))}</h4><p>本季應繳 ${m(quarterlyPayments(state,p))}。先還高利率的負債最划算。</p><select id="repay-debt" class="action-select">${debtOptions}</select><div class="action-row"><input id="repay-amount" type="number" min="0.1" step="0.1" value="${Math.min(5,Math.floor(p.cash))}" aria-label="還款金額（萬）"><button type="button" data-action="repay">還款</button></div></div>`:''}
  <div class="action-block"><h4>信用貸款 · 年息 ${(state.economy.rate+8).toFixed(2)}%</h4><p>剩餘額度 ${m(room)}。現金不足時季結算會自動動用；額度用完就破產。</p><div class="action-row"><input id="borrow-amount" type="number" min="0.1" step="0.1" value="5" aria-label="借款金額（萬）"><button type="button" data-action="borrow" ${room>0?'':'disabled'}>借款</button></div></div>
  ${goalBlock(p)}
  <button class="secondary" style="margin-top:18px" data-action="end-turn">${lastTurn()?'結算本季 →':'交給下一位 →'}</button>`;
}
function botPhaseText(){if(animation)return '移動中';return {roll:'準備拉霸',draw:'準備抽卡',choice:'考慮中',respond:'等待回覆',manage:'理財中',skip:'暫停一回合'}[state.phase]||'思考中'}
function botControls(){return `<div class="bot-controls"><button type="button" data-action="bot-pause" class="${botPaused?'on':''}">${botPaused?'▶ 繼續':'⏸ 暫停'} Bot</button><div class="bot-speed" role="group" aria-label="Bot 速度">${Object.entries(BOT_SPEEDS).map(([k,v])=>`<button type="button" data-action="bot-speed" data-value="${k}" class="${botSpeed===k?'on':''}">${v.label}</button>`).join('')}</div></div>`}
function lastTurn(){for(let i=state.turnIndex+1;i<state.players.length;i++)if(!state.players[i].bankrupt)return false;return true}

/* ---------- 玩家卡 ---------- */
// 目前玩家的完整卡片放在回合面板下方；其他玩家縮成頭像列，點一下展開細節。
function playerBadges(p){
  const r=state.round,ally=p.effects.find(x=>x.source==='C13'&&x.until>=r),allyName=ally?state.players.find(x=>x.id===ally.partnerId)?.name:'';
  const stolen=p.flatIncomes.filter(x=>x.until>=r&&x.label==='被搶走的案子'),won=p.flatIncomes.filter(x=>x.until>=r&&x.label==='搶下的案子');
  return [p.bot?`<span class="badge bot">🤖 ${h(botLabel(p.bot))}</span>`:'',p.bankrupt?'<span class="badge warn">已破產</span>':'',p.insured?'<span class="badge good">🛡 有保險</span>':'',p.unemployedRounds?`<span class="badge warn">${p.roleId==='free'?'案源斷炊':'失業'} ${p.unemployedRounds} 季</span>`:'',p.skipNext?'<span class="badge warn">下回合暫停</span>':'',p.fatigue>=FATIGUE.burnout?'<span class="badge warn">過勞</span>':'',p.overtime?`<span class="badge">${OVERTIME[p.overtime].label}中</span>`:'',p.salaryFactor!==1?`<span class="badge ${p.salaryFactor>1?'good':''}">薪資 ×${p.salaryFactor.toFixed(2)}</span>`:'',p.roleId==='free'?`<span class="badge">連續 ${p.streak} 季達標</span>`:'',ally?`<span class="badge good">🤝 與${h(allyName)}合作至第 ${ally.until} 季</span>`:'',won.length?`<span class="badge good">💼 搶下案子 +${m(won.reduce((s,x)=>s+x.amount,0))}/季</span>`:'',stolen.length?`<span class="badge warn">💼 案子被搶 ${m(stolen.reduce((s,x)=>s+x.amount,0))}/季</span>`:'',...p.effects.filter(x=>x.until>=state.round&&['C13-fallout','C13-decline'].includes(x.source)).map(x=>`<span class="badge warn">${x.source==='C13-fallout'?'合作鬧翻':'拒絕合作'} 收入 ${x.income}% 至第 ${x.until} 季</span>`)].filter(Boolean).join('');
}
function playerCard(p,extra=''){
  const r=role(p.roleId),prog=goalProgress(state,p),idx=state.players.indexOf(p);
  const debts=p.debts.length?p.debts.map(d=>`<tr><td>${h(d.name)}</td><td>${m(d.balance)}</td><td>${debtRate(state,d)}%</td><td>${m(d.payment)}/季</td></tr>`).join(''):'<tr><td colspan="4">沒有負債</td></tr>';
  const inv=p.investments.map(x=>`<li>${h(x.name)}${x.income>0?` · 每季 +${m(x.income)}`:x.income<0?` · 每季繳 ${m(-x.income)}，第 ${x.maturity} 季到期`:''}</li>`).join('');
  const last=p.lastBreakdown?p.lastBreakdown.map(l=>`<tr><td>${h(l.label)}</td><td>${signed(l.amount)}</td></tr>`).join(''):'<tr><td colspan="2">尚未結算</td></tr>';
  const turn=state.status==='playing'&&idx===state.turnIndex?'current':'';
  return `<article class="player-card ${turn} ${p.bankrupt?'bankrupt':''} ${extra}" style="--player-color:${colors[p.color]}"><div class="player-card-head"><div class="player-identity"><span class="role-icon">${r.icon}</span><div><h3>${h(p.name)}</h3><small>${h(r.name)} · ${h(r.title)}</small></div></div><span class="position-label">第 ${p.position} 格</span></div><div class="wealth-line"><span>現金</span><strong>${m(p.cash)}</strong></div><div class="goal-line"><div class="goal-line-head"><span>${h(r.goal.text)}</span><b>${Math.round(prog*100)}%</b></div><div class="goal-track"><i style="width:${Math.round(prog*100)}%"></i></div></div><div class="player-badges">${playerBadges(p)}</div><div class="finance-grid"><div class="finance-stat negative"><span>總負債</span><strong>${m(totalDebt(p))}</strong></div><div class="finance-stat ${p.lastIncome===null?'':'positive'}"><span>上季收入</span><strong>${p.lastIncome===null?'—':m(p.lastIncome)}</strong></div><div class="finance-stat ${p.lastNet<0?'negative':'positive'}"><span>上季淨額</span><strong>${p.lastNet===null?'—':signed(p.lastNet)}</strong></div></div>${inv?`<ul class="invest-list">${inv}</ul>`:''}<details class="finance-details"><summary>負債明細與上季收支</summary><table class="flow-table"><tbody>${debts}</tbody></table><table class="flow-table"><tbody>${last}</tbody></table></details></article>`;
}
function renderPlayers(){
  const cur=state.status==='playing'?currentPlayer():null;
  if(openPlayerId&&(!state.players.some(p=>p.id===openPlayerId)||openPlayerId===cur?.id))openPlayerId=null;
  $('#current-player').innerHTML=cur?playerCard(cur):'';
  const chips=state.players.map(p=>{
    const r=role(p.roleId),prog=Math.round(goalProgress(state,p)*100),isCur=p.id===cur?.id,isOpen=p.id===openPlayerId,win=state.winnerIds.includes(p.id);
    return `<button type="button" class="player-chip ${isCur?'current':''} ${isOpen?'open':''} ${p.bankrupt?'bankrupt':''}" data-player-chip="${p.id}" style="--player-color:${colors[p.color]};--prog:${prog}" aria-pressed="${isOpen}" ${isCur?'disabled':''} title="${isCur?'目前玩家，細節在右側':'點一下查看細節'}"><span class="chip-avatar"><span>${r.icon}</span></span><span class="chip-text"><b>${h(p.name)}${win?' 🏆':''}</b><small>${h(r.name)} · ${m(p.cash)}</small><i class="chip-track"><i style="width:${prog}%"></i></i></span>${isCur?'<span class="chip-now">輪到</span>':''}</button>`;
  }).join('');
  const open=state.players.find(p=>p.id===openPlayerId);
  $('#player-cards').innerHTML=`<div class="player-strip" role="group" aria-label="其他玩家">${chips}</div>${open?`<div class="player-detail">${playerCard(open,'detail')}</div>`:''}`;
}
function renderEconBanner(){
  const regime=economyRegime(state),el=$('#econ-banner');
  if(regime==='normal'){el.hidden=true;return}
  const cfg=ECON_TILES[regime];
  el.hidden=false;el.className=`econ-banner ${regime}`;
  el.innerHTML=`<b>${regime==='recession'?'📉':'📈'} 景氣${cfg.label}</b><span>${h(cfg.text)}（上季成長率 ${pct(state.economy.growth)}）</span>`;
}
function renderMini(){
  const e=state.economy,f=[['成長率',pct(e.growth)],['通膨',pct(e.inflation)],['失業率',pct(e.unemployment)],['政策利率',pct(e.rate,2)],['車價',m(e.carPrice)],['房價',m(e.housePrice)]];
  $('#mini-economy').innerHTML=f.map(([a,b])=>`<div class="mini-stat"><span>${a}</span><strong>${b}</strong></div>`).join('');
}

/* ---------- 其他分頁 ---------- */
function renderLibrary(){
  const totalW=FORTUNE_CARDS.reduce((s,c)=>s+c.weight,0);
  const sec=(type,title,note,items)=>`<section class="library-section"><h3 class="lib-title t-${type}">${typeIcon[type]} ${title}</h3><p class="muted">${note}</p><div class="library">${items}</div></section>`;
  const fortune=FORTUNE_CARDS.map(c=>`<div class="library-item"><div><strong>${c.id} · ${h(c.name)}</strong><p>${h(c.desc)}</p></div><span>${typeof c.cash==='object'?ROLES.map(r=>`${r.name} ${m(c.cash[r.id])}`).join('<br>'):'+'+m(c.cash)}<br><small>機率 ${(c.weight/totalW*100).toFixed(c.weight<1?2:1)}%</small></span></div>`).join('');
  const market=MARKET_EVENTS.map(c=>`<div class="library-item"><div><strong>${c.id} · ${h(c.name)}</strong><p>${h(c.desc)}</p><p class="lib-effects">${marketEffectText(c).map(h).join('；')}</p></div><span>${c.duration} 季</span></div>`).join('');
  const chance=CHANCE_CARDS.map(c=>`<div class="library-item"><div><strong>${c.id} · ${h(c.name)}</strong><p>${h(c.desc)}</p><p class="lib-effects">${c.options.map(o=>{const label=typeof o.label==='object'?Object.values(o.label).join('／'):o.label;const outs=Array.isArray(o.outcomes)?o.outcomes:o.outcomes.default;return `${h(label)}：${outs.map(x=>`${Math.round(x.p*100)}% ${h(x.text)}`).join(' ')}`}).join('<br>')}</p></div></div>`).join('');
  const loss=LOSS_CARDS.map(c=>`<div class="library-item"><div><strong>${c.id} · ${h(c.name)}</strong><p>${h(c.desc)}</p></div><span>${c.insurable?'保險理賠八成':'保險不理賠'}</span></div>`).join('');
  $('#card-library').innerHTML=sec('fortune','好運 Fortune','純運氣，必定獲利。',fortune)+sec('market','市場 Market','影響所有玩家；每季最多一張，之後停到市場格改抽機會卡。',market)+sec('chance','機會 Chance','唯一需要選擇的卡。把滑鼠移到選項上可以看到機率。',chance)+sec('loss','災難 Loss','毀滅性打擊。保險每季保費 0.6 萬，理賠八成。',loss);
}
function chart(data,key,title,color,unit=''){
  if(!data.length)return `<div class="empty-state">${title}：等待第一季結算。</div>`;
  const vals=data.map(x=>x[key]),min=Math.min(...vals),max=Math.max(...vals),span=max-min||1;
  const pt=(v,i)=>`${35+(i/Math.max(data.length-1,1))*660},${max===min?100:165-((v-min)/span)*125}`;
  return `<div class="history-chart"><h3>${title}</h3><svg viewBox="0 0 730 190" role="img" aria-label="${title}折線圖"><line x1="30" y1="165" x2="700" y2="165" stroke="#dfe8e3"/><polyline points="${data.map((x,i)=>pt(x[key],i)).join(' ')}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${data.map((x,i)=>{const [cx,cy]=pt(x[key],i).split(',');return `<circle cx="${cx}" cy="${cy}" r="4" fill="${color}"><title>第 ${x.round} 季：${x[key]}${unit}</title></circle><text x="${cx}" y="185" text-anchor="middle" font-size="10" fill="#899b93">${x.round}</text>`}).join('')}</svg></div>`;
}
function renderEconomy(){
  const e=state.economy,last=state.decisions.at(-1);
  const rules=CENTRAL_BANK_RULES.map(r=>{const ev=last?.items.find(x=>x.id===r.id);const chosen=last?.ruleId===r.id;return `<article class="rule-card"><div class="rule-top"><h3>${r.id} · ${h(r.name)}</h3><span class="status-pill ${chosen?'selected':ev?.matched?'matched':''}">${chosen?'已採用':ev?.matched?'符合':'未符合'}</span></div><p>${h(r.text)}</p>${ev?`<p>上季數值：${ev.value}%</p>`:''}</article>`}).join('');
  $('#economy-body').innerHTML=`<div class="fed-hero"><div><span>政策利率</span><strong>${pct(e.rate,2)}</strong></div><div><span>成長率／通膨</span><strong>${pct(e.growth)}／${pct(e.inflation)}</strong></div><div><span>失業率</span><strong>${pct(e.unemployment)}</strong></div><div><span>物價指數</span><strong>${(e.priceLevel*100).toFixed(1)}</strong></div></div><p class="muted">上季決策：${last?h(last.action):'尚未結算'}。規則依 R1 → R7 的順序採用第一條符合的；利率調整後冷卻 2 季。浮動房貸利率＝政策利率＋0.6%，信用貸款＝政策利率＋8%，存款利息＝政策利率−0.4%。</p><div class="rule-list">${rules}</div><div class="history-layout gap-top"><div>${chart(state.economyHistory,'growth','成長率','#0e9186','%')}${chart(state.economyHistory,'inflation','通膨','#c55d5d','%')}</div><div>${chart(state.economyHistory,'rate','政策利率','#5979b0','%')}${chart(state.economyHistory,'unemployment','失業率','#ce9460','%')}</div></div>`;
}
function renderHistory(){
  const rows=state.players.map(p=>`<tr><td>${h(p.name)}（${role(p.roleId).name}）</td>${p.history.slice(-8).map(x=>`<td>${m(x.cash)}</td>`).join('')}</tr>`).join('');
  $('#history-body').innerHTML=`<div class="history-layout"><div class="history-chart"><h3>近 8 季現金</h3><div style="overflow:auto"><table class="history-table"><tbody>${rows}</tbody></table></div></div><div class="history-chart"><h3>遊戲動態</h3><div class="log-list">${state.log.slice(0,80).map(x=>`<div class="log-item">${h(x)}</div>`).join('')}</div></div></div>`;
}
function render(){
  const onHome=page==='home';
  $('#round-badge').hidden=onHome||!state;$('#home').hidden=!onHome;$('#home-btn').classList.toggle('active',onHome);
  if(onHome){$('#setup').hidden=true;$('#game').hidden=true;$('#home-play-btn').textContent=state?'返回對局 →':'設定玩家，開始遊戲 →';$('#home-status').textContent=state?`已有對局 · 第 ${state.round} 季。`:'一台電腦就能開始，大家輪流操作。';return}
  if(!state){$('#setup').hidden=false;$('#game').hidden=true;renderSetup();soundWatch();return}
  $('#setup').hidden=true;$('#game').hidden=false;
  $('#round-number').textContent=String(state.round).padStart(2,'0');$('#round-limit').textContent=`／${state.maxRounds} 季`;
  document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  document.querySelectorAll('.tab-page').forEach(p=>p.classList.toggle('active',p.id===`tab-${tab}`));
  renderBoard();renderTurn();renderEconBanner();renderMini();renderPlayers();renderLibrary();renderEconomy();renderHistory();
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
  Sound.setMood(state.status==='playing'?economyRegime(state):'lobby');
  const now={game:state.sync?.gameId,log:state.log.length,draw:state.lastDraw?`${state.round}-${state.turnIndex}-${state.lastDraw.cardId}`:null,turn:`${state.round}-${state.turnIndex}`,status:state.status};
  if(soundLast&&soundLast.game===now.game){
    let delay=0;
    if(now.draw&&now.draw!==soundLast.draw){Sound.play('flip');Sound.play(state.lastDraw.type);delay=700}
    if(now.log>soundLast.log)Sound.logEvent(state.log.slice(0,now.log-soundLast.log),delay);
    if(now.status==='playing'&&now.turn!==soundLast.turn)setTimeout(()=>Sound.play('turn'),300);
    if(now.status!=='playing'&&soundLast.status==='playing')setTimeout(()=>Sound.play('win'),1200);
  }
  soundLast=now;
}


/* ---------- Bot 自動操作 ---------- */
// 只在看得見的頁籤驅動 Bot；每一步都透過 run() 取得最新狀態並上鎖，多個頁籤也不會重複操作。
function scheduleBot(){
  clearTimeout(botTimer);botTimer=null;
  if(!state||state.status!=='playing'||page!=='game'||botPaused||animation||document.hidden)return;
  const p=actorPlayer();if(!p?.bot)return;
  const reading=drawnCard()||state.phase==='choice'||state.phase==='respond';
  botTimer=setTimeout(botTick,BOT_SPEEDS[botSpeed].ms*(reading?1.8:1));
}
async function botTick(){
  botTimer=null;
  if(!state||animation||botPaused||state.status!=='playing')return;
  const p=actorPlayer();if(!p?.bot)return;
  if(state.phase==='respond'){await run(()=>{const t=responder(state);if(t?.bot)respond(state,t.id,botRespond(state,t,Math.random))});return}
  if(state.phase==='roll'){await rollWithAnimation();if(!animation)render();return}
  const shown=state.phase==='manage'&&drawnCard();
  if(shown){dismissedCardKey=shown.key;render();return}
  await run(()=>{
    const q=currentPlayer();if(!q?.bot||state.status!=='playing')return;
    if(state.phase==='skip')return void endTurn(state);
    if(state.phase==='draw')return void drawEvent(state);
    if(state.phase==='choice')return void resolveChoice(state,q.id,botChoice(state,q,Math.random));
    if(state.phase==='manage'){
      const key=`${state.sync?.gameId}:${state.round}:${state.turnIndex}`;
      if(botMemo.key!==key)botMemo={key,memo:{}};
      const step=botManageStep(state,q,botMemo.memo,Math.random);
      if(!step)return void endTurn(state);
      if(step.type==='overtime')setOvertime(state,q.id,step.level);
      else if(step.type==='repay')repayDebt(state,q.id,step.debtId,step.amount);
      else if(step.type==='buy')buyGoal(state,q.id);
    }
  });
}
document.addEventListener('visibilitychange',()=>scheduleBot());

/* ---------- 動畫（總移動時間固定） ---------- */
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function moveTokenStep(position,ms){
  animation?.visited.add(position);sfx('step',animation?.visited.size||1);
  const token=$('#board .token.moving'),dest=$(`#board [data-tile-index="${position}"] .tile-tokens`);
  if(!token||!dest||tab!=='business'||page!=='game')return;
  const from=token.getBoundingClientRect();$('#board .tile-active')?.classList.remove('tile-active');
  dest.closest('.tile').classList.add('tile-active','tile-visited');dest.appendChild(token);
  const to=token.getBoundingClientRect();token.style.transition='none';token.style.transform=`translate(${from.left-to.left}px,${from.top-to.top}px)`;token.getBoundingClientRect();
  requestAnimationFrame(()=>{if(!token.isConnected)return;token.style.transition=`transform ${Math.max(60,ms-60)}ms linear`;token.style.transform='translate(0,0)'});
}
function beginRollAnimation({playerId,from,dice,reels}){
  if(!state||currentPlayer()?.id!==playerId||state.dice!==dice||document.hidden||tab!=='business'||page!=='game')return;
  cancelAnimation();const serial=animationSerial,route=movementPath(from,dice),stepMs=stepMsFor(route.length);
  animation={playerId,position:from,dice,reels,path:route,displayReels:[0,0],reelPositions:[0,0],spinning:[true,true],visited:new Set(),stage:'rolling'};
  renderBoard();renderTurn();sfx('spin');
  void (async()=>{
    const stop=[8,14];
    for(let t=0;t<16;t++){
      await pause(110);if(serial!==animationSerial)return;
      const reelsEl=document.querySelectorAll('#board .slot-reel');
      for(let i=0;i<2;i++){if(!animation.spinning[i])continue;if(t<stop[i])animation.reelPositions[i]++;else{const d=(reels[i]-animation.reelPositions[i]%7+7)%7;animation.reelPositions[i]+=d||7;animation.spinning[i]=false;sfx('reelStop',i)}animation.displayReels[i]=animation.reelPositions[i]%7;const el=reelsEl[i];if(el){el.querySelector('.slot-strip').style.transform=`translateY(-${animation.reelPositions[i]*100}%)`;el.classList.toggle('spinning',animation.spinning[i])}}
    }
    if(serial!==animationSerial)return;animation.displayReels=[...reels];animation.stage='result';renderBoard();renderTurn();
    await pause(600);if(serial!==animationSerial)return;animation.stage='moving';renderBoard();renderTurn();
    for(const pos of animation.path){if(serial!==animationSerial)return;animation.position=pos;moveTokenStep(pos,stepMs);await pause(stepMs)}
    if(serial!==animationSerial)return;animation=null;renderBoard();renderTurn();scheduleBot();
  })();
}
async function rollWithAnimation(){
  if(animation)return;let result=null,from=null,playerId=null;
  try{await withLock(()=>{if(!ensureFresh())return;const p=currentPlayer();from=p.position;playerId=p.id;result=rollDice(state);save();render()});if(result)beginRollAnimation({playerId,from,dice:result.dice,reels:result.reels})}catch(e){notify(e.message||'無法啟動拉霸')}
}

/* ---------- 事件綁定 ---------- */
$('#add-player').addEventListener('click',()=>{if(setupPlayers.length<8){let n=1;while(setupPlayers.some(x=>x.name===`玩家 ${n}`))n++;setupPlayers.push({name:`玩家 ${n}`,roleId:ROLES[setupPlayers.length%ROLES.length].id,control:'human'});renderSetup()}});
$('#setup-players').addEventListener('input',e=>{if(e.target.dataset.setupName!==undefined)setupPlayers[Number(e.target.dataset.setupName)].name=e.target.value});
$('#setup-players').addEventListener('change',e=>{if(e.target.dataset.setupRole!==undefined)setupPlayers[Number(e.target.dataset.setupRole)].roleId=e.target.value;if(e.target.dataset.setupControl!==undefined)setupPlayers[Number(e.target.dataset.setupControl)].control=e.target.value});
$('#setup-players').addEventListener('click',e=>{const i=e.target.dataset.removePlayer;if(i!==undefined&&setupPlayers.length>2){setupPlayers.splice(Number(i),1);renderSetup()}});
$('#start-btn').addEventListener('click',async()=>{try{await withLock(()=>{const saved=readStored();if(saved){adoptShared(saved);page='game';notify('已加入另一個頁籤的對局。');return}const next=createGame({players:setupPlayers.map(p=>({name:p.name,roleId:p.roleId,bot:p.control==='human'?null:makeBot(p.control)})),maxRounds:$('#rounds-input').value});prepareNewSession(next);state=next;page='game';tab='business';$('#setup-error').textContent='';rememberView();save();render()})}catch(e){$('#setup-error').textContent=e.message}});
$('#player-cards').addEventListener('click',e=>{const b=e.target.closest('[data-player-chip]');if(!b||b.disabled)return;openPlayerId=openPlayerId===b.dataset.playerChip?null:b.dataset.playerChip;renderPlayers()});
$('.tabs').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(!b)return;tab=b.dataset.tab;rememberView();render()});
$('#game').addEventListener('click',e=>{
  const a=e.target.closest('[data-action]');if(!a||!state)return;
  const action=a.dataset.action,p=currentPlayer();
  if(action==='new-game'){void resetGame();return}
  if(action==='bot-pause'){botPaused=!botPaused;render();return}
  if(action==='bot-speed'){botSpeed=a.dataset.value;try{localStorage.setItem('life-board-bot',JSON.stringify({speed:botSpeed}))}catch{}render();return}
  if(action==='respond'){const t=responder(state);if(t&&!t.bot)void run(()=>respond(state,t.id,a.dataset.value==='1'));return}
  if(p?.bot)return;
  if(action==='roll'){void rollWithAnimation();return}
  if(animation)return;
  if(action==='draw-card'){void run(()=>drawEvent(state));return}
  if(action==='choose'){void run(()=>resolveChoice(state,p.id,Number(a.dataset.value)));return}
  if(action==='dismiss-card'){dismissedCardKey=drawnCard()?.key||null;renderBoard();renderTurn();return}
  if(action==='end-turn'){void run(()=>{const before=state.round;endTurn(state);if(state.status!=='playing')notify('對局結束！');else if(state.round!==before)notify(`第 ${before} 季已結算。`)});return}
  if(action==='overtime'){void run(()=>setOvertime(state,p.id,Number(a.dataset.value)));return}
  if(action==='repay'){const id=$('#repay-debt').value,n=Number($('#repay-amount').value);void run(()=>repayDebt(state,p.id,id,n));return}
  if(action==='borrow'){const n=Number($('#borrow-amount').value);void run(()=>borrow(state,p.id,n));return}
  if(action==='buy-goal'){void run(()=>buyGoal(state,p.id));return}
});
async function resetGame(){
  if(state&&state.status==='playing'&&Date.now()>resetArmedUntil){resetArmedUntil=Date.now()+4000;notify('再按一次確認開始新遊戲；目前對局會清除。');return}
  resetArmedUntil=0;
  await withLock(()=>{clearSave();cancelAnimation();state=null;page='game';tab='business';rememberView();render()});
}
$('#home-btn').addEventListener('click',()=>{page='home';render();window.scrollTo({top:0,behavior:'smooth'})});
$('#home-play-btn').addEventListener('click',()=>{page='game';render();window.scrollTo({top:0,behavior:'smooth'})});
$('#new-game-btn').addEventListener('click',()=>{void resetGame()});
$('#open-tab-btn').addEventListener('click',()=>{window.open(location.href,'_blank','noopener')});
$('#export-btn').addEventListener('click',()=>{if(!state){notify('目前沒有可匯出的對局。');return}const blob=new Blob([exportGame(state)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`人生棋局-第${state.round}季.json`;a.click();URL.revokeObjectURL(url)});
$('#import-file').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{const g=importGame(await f.text());await withLock(()=>{prepareNewSession(g);cancelAnimation();state=g;page='game';tab='business';save();render()});notify('存檔已載入。')}catch(err){notify(err.message||'無法讀取存檔')}e.target.value=''});
window.addEventListener('storage',e=>{if(e.key!==storageKey)return;if(e.newValue){try{adoptShared(importGame(e.newValue))}catch{}}else{cancelAnimation();state=null;render()}});
if(channel)channel.onmessage=e=>{const msg=e.data;if(!msg||msg.writerId===tabId)return;if(msg.type==='state'){try{adoptShared(importGame(JSON.stringify(msg.game)))}catch{}}if(msg.type==='reset'&&(!state||msg.updatedAt>=syncInfo(state).updatedAt)){resetAt=Math.max(resetAt,msg.updatedAt);cancelAnimation();state=null;render()}};
window.addEventListener('focus',()=>{const s=readStored();if(s)adoptShared(s)});
const saved=readStored();if(saved)state=saved;
renderHomeRoles();render();
