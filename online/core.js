// 由 personal/data.js、engine.js、bot.js 與 online/room.mjs 產生，請勿直接修改；改完原始檔後執行 node online/build.mjs。
'use strict';
// 人生棋局：所有金額單位為「萬元」，一回合代表一季（3 個月）。
// 目標數字照原始企劃；各角色的生活費、起始存款與平均收入經 simulate.mjs 模擬對戰校準，
// 讓四種角色在 2、4、6 人局的平均勝率接近。改動數值後請重跑模擬確認。

const UNIT='萬';

/* ---------- 角色 ---------- */
// salary：每季稅後收入；living：每季生活費（隨物價指數上升）；debts：起始負債。
// rate 為年利率（%），payment 為每季應繳；variable=true 代表跟著央行利率浮動。
const ROLES=[
  {id:'low',name:'底層',title:'基層服務業',icon:'🧹',incomeType:'salary',salary:9,living:4.4,cash:5,
    debts:[{type:'student',name:'學貸',balance:36,rate:1.5,payment:1.5}],
    goal:{type:'debtFree',amount:50,text:'清空所有負債，且存款至少 50 萬'},
    story:'月薪三萬出頭，每個月先繳學貸再算生活費。沒有房貸壓力，但也沒有太多犯錯空間。',
    traits:['收入最低、最穩定','基本工資調漲時直接受惠','被裁員時有失業給付']},
  {id:'office',name:'上班族',title:'一般企業職員',icon:'💼',incomeType:'salary',salary:16.5,living:11,cash:15,
    debts:[{type:'student',name:'學貸',balance:20,rate:1.5,payment:1.2},{type:'card',name:'信用卡分期',balance:8,rate:15,payment:1.5}],
    goal:{type:'car',amount:100,text:'一次付清買下一台 100 萬的車'},
    story:'朝九晚五，年資慢慢墊高薪水。手上還有學貸和一筆信用卡分期，存夠錢就想換一台好車。',
    traits:['每年依景氣調薪','車價會隨物價與車市事件變動','信用卡分期利率高，先還划算']},
  {id:'exec',name:'公司高管',title:'企業高階主管',icon:'🏙️',incomeType:'salary',salary:45,living:18.5,cash:100,bonusMonths:2,
    debts:[{type:'mortgage',name:'房貸',balance:900,rate:2.6,payment:10.8,variable:true},{type:'auto',name:'車貸',balance:60,rate:3,payment:4.5}],
    goal:{type:'house',amount:1000,downPct:30,dsr:50,text:'買下一棟 1,000 萬的房子（頭期款 30%，銀行核貸）'},
    story:'收入最高，負債也最大。每季先付房貸車貸，年終獎金看景氣。想換大房子，銀行還得點頭。',
    traits:['年終獎金隨景氣浮動','房貸利率跟著央行走','買房需頭期款且月付不超過收入 50%']},
  {id:'free',name:'自由業',title:'接案工作者',icon:'🎨',incomeType:'freelance',salary:17.4,living:7.8,cash:20,
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
  {id:'F08',name:'繼承遠房親戚遺產',weight:1.5,cash:80,desc:'從沒見過面的叔公留了一筆錢給你。'},
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
    {label:'投入 5 萬',stake:5,outcomes:[{p:.45,stakeX:1.8,text:'真的漲了！賺了八成。'},{p:.55,stakeX:.5,text:'消息是假的，認賠一半出場。'}]},
    {label:'投入 20 萬',stake:20,outcomes:[{p:.45,stakeX:1.8,text:'真的漲了！賺了八成。'},{p:.55,stakeX:.5,text:'消息是假的，認賠一半出場。'}]},
    {label:'不跟',stake:0,outcomes:[{p:1,text:'你沒有跟。'}]}]},
  {id:'C02',name:'聽到併購小道消息',desc:'聽說某家公司要被收購，股價會大漲。',options:[
    {label:'買進 10 萬',stake:10,outcomes:[{p:.4,stakeX:2,text:'併購成真，股價翻倍。'},{p:.6,stakeX:.6,text:'只是謠言，股價回落。'}]},
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
    {label:'投入 10 萬',stake:10,outcomes:[{p:.3,stakeX:3,text:'真的漲了三倍！'},{p:.7,stakeX:.25,text:'幣價崩盤，只剩兩成五。'}]},
    {label:'投入 30 萬',stake:30,outcomes:[{p:.3,stakeX:3,text:'真的漲了三倍！'},{p:.7,stakeX:.25,text:'幣價崩盤，只剩兩成五。'}]},
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
  // 互動卡（移植自企業版 P10 策略聯盟、P14 搶下對手大客戶）：target 選項會依其他玩家展開成多個按鈕。
  {id:'C13',name:'找人合作',interactive:true,desc:'有個機會需要夥伴。指定一位玩家一起做，雙方收入 +15%，持續 3 季。',options:[
    {label:'指定一位玩家合作',target:'any',stake:0,outcomes:[{p:1,alliance:{pct:15,rounds:3},text:'合作順利，雙方收入 +15%，持續 3 季。'}]},
    {label:'自己來',stake:0,outcomes:[{p:1,text:'你決定自己做。'}]}]},
  {id:'C14',name:'搶下對方的大案子',interactive:true,desc:'你和另一位玩家同時爭取一個大案子。指定一位玩家，2 季內把對方薪資的 10%（每季最多 3 萬）轉成你的收入。',options:[
    {label:'指定一位玩家搶案子',target:'any',stake:0,outcomes:[{p:1,steal:{share:.1,cap:3,rounds:2},text:'你搶下了案子，2 季內取得對方薪資的 10%（每季最多 3 萬）。'}]},
    {label:'不跟人搶',stake:0,outcomes:[{p:1,text:'你決定不跟人搶。'}]}]}
];

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
const CENTRAL_BANK_RULES=[
  {id:'R1',name:'通膨失控',test:'inflation>=4',action:+.5,text:'通膨 ≥ 4% → 升息 0.5 個百分點'},
  {id:'R2',name:'經濟衰退',test:'growth<=-2',action:-.5,text:'成長率 ≤ −2% → 降息 0.5 個百分點'},
  {id:'R3',name:'通膨偏高',test:'inflation>=3',action:+.25,text:'通膨 ≥ 3% → 升息 0.25 個百分點'},
  {id:'R4',name:'失業偏高',test:'unemployment>=6',action:-.25,text:'失業率 ≥ 6% → 降息 0.25 個百分點'},
  {id:'R5',name:'股市崩跌',test:'stockDrop>=20',action:-.25,text:'股市單季跌 ≥ 20% → 降息 0.25 個百分點'},
  {id:'R6',name:'景氣過熱',test:'growth>=4',action:+.25,text:'成長率 ≥ 4% → 升息 0.25 個百分點'}
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
const totalDebt=p=>round2(p.debts.reduce((s,d)=>s+d.balance,0));
function debtRate(state,d){
  if(d.type==='mortgage'&&d.variable)return round2(state.economy.rate+.6);
  if(d.type==='credit')return round2(state.economy.rate+CREDIT.spread);
  return d.rate;
}
function quarterlyPayments(state,p){return round2(p.debts.reduce((s,d)=>s+Math.min(d.payment,d.balance+d.balance*debtRate(state,d)/400),0))}
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
  if(card.income)p.effects.push({source:card.id,income:card.income,until:state.round});
  if(card.unemployed){p.unemployedRounds+=val(card.unemployed,p.roleId);notes.push(`失去收入 ${val(card.unemployed,p.roleId)} 季`)}
  if(card.skip){p.skipNext=true;notes.push('下一回合無法行動')}
  state.lastResult={text:[lost?`損失 ${money(lost)}`:'',...notes].filter(Boolean).join('，'),cash:-lost};
  say(state,`${p.name}遭遇「${card.name}」：${state.lastResult.text||'無直接損失'}。`);
}
// 互動卡的 target 選項會依其他（未破產的）玩家展開成多個選項，例如「與 玩家 2 合作」。
function chanceOptions(state,p,card){
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
function resolveChoice(state,playerId,index){
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
function settleRound(state){
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
function evaluateCentralBank(state,snap){
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
  if(o.alliance)x+=pay*o.alliance.pct/100*Math.min(left,o.alliance.rounds)*(free?2:1);
  if(o.unemployed)x-=pay*o.unemployed*(free?3:1);
  if(o.fatigue)x-=p.fatigue+o.fatigue>=70?pay*.2:0;
  if(o.investment){const i=o.investment;x+=i.maturity?(i.payout+i.income*i.maturity):(i.income*left+i.value*.5)}
  if(o.insurance)x+=left*.2;
  if(o.delayedCash)x+=o.delayedCash.amount;
  return x;
}
const optionEV=(s,p,o)=>o.outcomes.reduce((t,out)=>t+out.p*outcomeValue(s,p,out,o.stake),0)-o.stake;
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
    // 合作對象選目標進度最低的人，避免幫到領先者。
    if(o.targetId&&o.outcomes.some(x=>x.alliance))ev-=.01*goalProgress(s,s.players.find(x=>x.id===o.targetId));
    if(bot.level==='mid')ev=ev*(1+(rng()*2-1)*MID.evNoise)+(rng()*2-1)*MID.evNoise*Math.max(2,o.stake);
    if(!best||ev>best.ev)best={o,ev};
  }
  if(bot.level==='high'&&rng()<HIGH.slip)return pick(rng,opts).index;
  return (best?.ev>0?best.o:opts.find(o=>o.stake===0)??opts.at(-1)).index;
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
  constructor(code,{mode='personal'}={}){
    this.code=code;this.mode=mode;this.hostKey=newToken();
    this.seats=[];this.game=null;this.maxRounds=24;this.serial=0;
    this.botMemo={key:null,memo:{}};this.lastActiveAt=Date.now();
  }
  // 大螢幕重新整理時用來存檔與還原（不含連線資訊）。
  toJSON(){return {v:1,code:this.code,mode:this.mode,hostKey:this.hostKey,maxRounds:this.maxRounds,serial:this.serial,seats:this.seats.map(({conn,lastSeen,...s})=>s),game:this.game}}
  static fromJSON(data){
    if(data?.v!==1||!data.code||!Array.isArray(data.seats))throw Error('房間存檔格式不正確。');
    const r=new Room(data.code,{mode:data.mode});
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
  checkRole(roleId){if(!roleById(roleId))throw Error('角色無效。');return roleId}
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
    if(roleId!==undefined)seat.roleId=this.checkRole(roleId);
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
    this.game=createGame({players:this.seats.map(s=>({name:s.name,roleId:s.roleId,bot:s.bot})),maxRounds:this.maxRounds});
    this.seats.forEach((s,i)=>{s.playerId=this.game.players[i].id});
    this.botMemo={key:null,memo:{}};
  }
  backToLobby(){this.game=null;this.seats.forEach(s=>{s.playerId=null})}
  currentPlayer(){return this.game?.players[this.game.turnIndex]}
  // 玩家送出的動作：只有輪到的那位玩家可以操作，其餘一律拒絕。
  act(token,action){
    const g=this.game,seat=this.seatByToken(token);
    if(!seat)throw Error('找不到你的座位，請重新加入。');
    if(!g||g.status!=='playing')throw Error('遊戲尚未開始或已經結束。');
    const p=this.currentPlayer();
    if(p.id!==seat.playerId)throw Error(`還沒輪到你，現在是 ${p.name} 的回合。`);
    const n=x=>{const v=Number(x);if(!Number.isFinite(v))throw Error('請輸入數字。');return v};
    switch(action?.type){
      case 'roll':return rollDice(g);
      case 'draw':return drawEvent(g);
      case 'choose':return resolveChoice(g,p.id,n(action.index));
      case 'overtime':return setOvertime(g,p.id,n(action.level));
      case 'repay':return repayDebt(g,p.id,String(action.debtId),n(action.amount));
      case 'borrow':return borrow(g,p.id,n(action.amount));
      case 'buy':return buyGoal(g,p.id);
      case 'end':return endTurn(g);
      default:throw Error('未知的動作。');
    }
  }
  needsBot(){const p=this.currentPlayer();return !!(this.game?.status==='playing'&&p?.bot)}
  // Bot 一次走一步，讓大螢幕看得到過程。回傳 false 代表現在不是 Bot 的回合。
  botStep(rng=Math.random){
    if(!this.needsBot())return false;
    const g=this.game,q=this.currentPlayer();
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
      else if(step.type==='buy')buyGoal(g,q.id);
      return true;
    }
    return false;
  }

  /* ---------- 視角過濾 ---------- */
  // 大螢幕與所有人都看得到的資料：位置、角色、目標進度、事件與景氣。不含現金、負債與收支明細。
  publicView(){
    const g=this.game;
    const seats=this.seats.map(s=>({seatId:s.seatId,name:s.name,roleId:s.roleId,isBot:!!s.bot,botLabel:s.bot?botLabel(s.bot):'',connected:s.bot?true:s.connected}));
    const base={code:this.code,mode:this.mode,maxRounds:this.maxRounds,seats,roles:ROLES.map(r=>({id:r.id,name:r.name,icon:r.icon,title:r.title,goal:r.goal.text})),botLevels:Object.entries(BOT_LEVELS).map(([id,v])=>({id,label:v.label,desc:v.desc}))};
    if(!g)return {...base,status:'lobby'};
    const cur=this.currentPlayer(),regime=economyRegime(g),last=g.decisions.at(-1),publicLog=g.log.filter(x=>!PRIVATE_LOG.test(x));
    const card=g.lastDraw?cardById(g.lastDraw.cardId):null;
    return {...base,status:g.status,
      game:{round:g.round,maxRounds:g.maxRounds,turnIndex:g.turnIndex,phase:g.phase,dice:g.dice,reels:g.reels,winnerIds:g.winnerIds,winReason:g.winReason,
        currentId:cur?.id??null,
        economy:{growth:g.economy.growth,inflation:g.economy.inflation,unemployment:g.economy.unemployment,rate:g.economy.rate,carPrice:g.economy.carPrice,housePrice:g.economy.housePrice},
        regime,regimeText:regime==='normal'?'':ECON_TILES[regime].text,
        tiles:BOARD.map((t,i)=>({type:tileType(g,i),flipped:tileFlipped(g,i),boosted:regime==='boom'&&t.type==='fortune'})),
        players:g.players.map((p,i)=>{const r=roleById(p.roleId);return {id:p.id,seatId:this.seats[i]?.seatId,name:p.name,roleId:p.roleId,icon:r.icon,roleName:r.name,goal:r.goal.text,color:p.color,position:p.position,bankrupt:p.bankrupt,isBot:!!p.bot,botLabel:p.bot?botLabel(p.bot):'',connected:this.seats[i]?.bot?true:!!this.seats[i]?.connected,progress:Math.round(goalProgress(g,p)*100)}}),
        card:card?{type:g.lastDraw.type,id:card.id,name:card.name,desc:card.desc||'',note:g.lastDraw.note||''}:null,
        // 機會卡的選項與機率只給輪到的玩家；大螢幕只看到「正在考慮」與結果。
        result:g.lastResult?{text:g.lastResult.text,option:g.lastResult.option||''}:null,
        decision:last?{action:last.action,ruleId:last.ruleId}:null,
        log:publicLog.slice(0,LOG_KEEP),logCount:publicLog.length}};
  }
  // 只給本人的資料：現金、負債、收支預估、輪到自己時可以做的操作。
  privateView(token){
    const seat=this.seatByToken(token);if(!seat)return null;
    const g=this.game,base={seatId:seat.seatId,name:seat.name,roleId:seat.roleId};
    if(!g)return base;
    const p=g.players.find(x=>x.id===seat.playerId);if(!p)return base;
    const r=roleById(p.roleId),isMyTurn=g.status==='playing'&&this.currentPlayer()?.id===p.id,q=computeQuarter(g,p);
    const card=g.phase==='choice'&&isMyTurn?cardById(g.pendingChoice.cardId):null;
    const buy=canBuyGoal(g,p),hp=p.roleId==='exec'?housePlan(g,p):null;
    const now=g.round,ally=p.effects.find(x=>x.source==='C13'&&x.until>=now);
    return {...base,playerId:p.id,isMyTurn,phase:isMyTurn?g.phase:null,
      me:{cash:p.cash,totalDebt:totalDebt(p),progress:Math.round(goalProgress(g,p)*100),goal:r.goal.text,goalType:r.goal.type,icon:r.icon,roleName:r.name,
        debts:p.debts.map(d=>({id:d.id,name:d.name,balance:d.balance,rate:debtRate(g,d),payment:d.payment})),
        fatigue:p.fatigue,burnout:FATIGUE.burnout,overtime:p.overtime,insured:p.insured,unemployedRounds:p.unemployedRounds,skipNext:p.skipNext,
        salaryFactor:p.salaryFactor,streak:p.streak,bestStreak:p.bestStreak,lastIncome:p.lastIncome,lastNet:p.lastNet,lastBreakdown:p.lastBreakdown,
        investments:p.investments.map(x=>({name:x.name,income:x.income,maturity:x.maturity})),
        alliance:ally?{until:ally.until,partner:g.players.find(x=>x.id===ally.partnerId)?.name||''}:null,
        caseIn:round1(p.flatIncomes.filter(x=>x.until>=now&&x.label==='搶下的案子').reduce((s,x)=>s+x.amount,0)),
        caseOut:round1(p.flatIncomes.filter(x=>x.until>=now&&x.label==='被搶走的案子').reduce((s,x)=>s+x.amount,0)),
        preview:{earned:q.earned,living:q.living,debt:q.debt,net:q.net},
        creditRoom:Math.max(0,creditLimit(p)-creditUsed(p)),creditRate:g.economy.rate+8,
        buy:{ok:buy.ok,type:r.goal.type,price:p.roleId==='office'?g.economy.carPrice:hp?.price??null,down:hp?.down??null,dsr:hp?.dsr??null,dsrLimit:r.goal.dsr??null},
        overtimeLevels:Object.entries(OVERTIME).map(([lv,o])=>({level:Number(lv),label:o.label,income:o.income,fatigue:FATIGUE[`overtime${lv}`]})),
        fatigueRules:{normal:FATIGUE.none,rest:FATIGUE.restStop,burnout:FATIGUE.burnout,penalty:FATIGUE.burnoutIncome}},
      choice:card?{id:card.id,name:card.name,desc:card.desc||'',options:chanceOptions(g,p,card).map(o=>({index:o.index,label:o.label,stake:o.stake,affordable:o.affordable,odds:o.outcomes.map(x=>({p:x.p,text:x.text}))}))}:null};
  }
}
