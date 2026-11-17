// 手機：加入房間、選角色；遊戲中只顯示自己的財務，輪到自己時出現操作按鈕。
// 手機不執行遊戲規則，只把動作送給大螢幕（房主），再顯示房主傳回來的畫面資料。
'use strict';
const params=new URLSearchParams(location.search);
let code=(params.get('room')||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,4);
const tokenKey=()=>`${CFG.tokenPrefix}${code}`;
let pub=null,priv=null,joined=false,busy=false,kicked='',pendingHello=null;
let peer=null,conn=null,refSerial=0,beatTimer=null,retryTimer=null;
const waiting=new Map();

/* ---------- 音效、震動、畫面提醒 ---------- */
// 手機只播「跟自己有關」的音效與震動；震動只有支援的手機才有（iPhone 的 Safari 不支援就略過）。
let fxCardKey=null,fxLogLen=null,wake=null;
function phoneFx(pp,pv){
  const g=pub?.game,pg=pp?.game,me=priv?.me,pm=pv?.me,name=priv?.name||'';
  const ck=g?.card?(g.card.seq?`seq-${g.card.seq}`:`${g.round}-${g.turnIndex}-${g.card.id}`):null;
  // 輪到自己（包含開局第一位）：提示音＋整個畫面閃一下（不震動）
  if(pp&&(priv?.isMyTurn&&!pv?.isMyTurn||priv?.respond&&!pv?.respond)){Sound.play('myTurn');document.body.classList.remove('turn-flash');void document.body.offsetWidth;document.body.classList.add('turn-flash')}
  if(!g||!pg||!me||!pm||pv.playerId!==priv.playerId){fxLogLen=g?g.logCount:null;fxCardKey=ck;return}
  // 自己抽到的卡：翻牌＋卡片類型音效
  const myCard=ck&&ck!==fxCardKey&&g.currentId===priv.playerId;
  if(myCard){Sound.play('flip');Sound.play(g.card.type)}
  fxCardKey=ck;
  // 新動態裡跟自己有關的事件
  const fresh=fxLogLen!==null&&g.logCount>fxLogLen?g.log.slice(0,g.logCount-fxLogLen).map(x=>splitLog(x).text):[];
  fxLogLen=g.logCount;
  let snd=null,vib=null;
  const won=pub.status!=='playing'&&g.winnerIds.includes(priv.playerId);
  for(const t of fresh){
    if(t.startsWith(name)&&/破產/.test(t)){snd='bankrupt';vib=[600];break}
    if(/獲勝/.test(t)&&won){snd='win';vib=[100,50,100,50,300];break}
    if(t.startsWith(name)&&/達成目標|買下/.test(t)){snd='win';vib=[100,50,100,50,300]}
    else if(t.includes(`搶下${name}的案子`)){snd=snd||'steal';vib=vib||[80,60,80,60,80]}
    else if(t.startsWith(name)&&/搶下/.test(t)){snd=snd||'steal';vib=vib||[60]}
    else if(/合作，雙方/.test(t)&&(t.startsWith(name)||t.includes(`與${name}合作`))){snd=snd||'alliance';vib=vib||[60,40,60]}
    else if(t.startsWith(`${name}遭遇`)){vib=vib||[200,100,200]}
    else if(/^市場事件/.test(t)){vib=vib||[120]}
  }
  // 疲勞剛超過過勞門檻：嘆氣＋震動
  const burn=me.fatigueRules?.burnout??70;
  if(pm.fatigue<burn&&me.fatigue>=burn){snd=snd||'sigh';vib=vib||[300]}
  const delay=myCard?700:0;
  if(snd)setTimeout(()=>Sound.play(snd),delay);
  if(vib)setTimeout(()=>Sound.vibrate(vib),delay);
  // 現金變動：增加「叮噹」、減少「咻」
  const diff=me.cash-pm.cash;
  if(Math.abs(diff)>=.05)setTimeout(()=>Sound.play(diff>0?'coinUp':'coinDown'),snd?delay+900:delay);
}
// 遊戲中保持螢幕不自動關閉，避免鎖螢幕後收不到「輪到你」（有支援的瀏覽器才會生效）。
async function keepAwake(){
  if(wake||!joined||kicked||document.visibilityState!=='visible'||!('wakeLock' in navigator))return;
  wake='pending';
  try{const l=await navigator.wakeLock.request('screen');wake=l;l.addEventListener('release',()=>{if(wake===l)wake=null})}catch{wake=null}
}
document.addEventListener('pointerdown',()=>{Sound.unlock();keepAwake()},{capture:true});

// 企業版手機頁面覆蓋這個函式，處理自己的按鈕（回傳 true 代表已處理）。
function modeAction(a,b){return false}

/* ---------- 連線 ---------- */
function later(){clearTimeout(retryTimer);retryTimer=setTimeout(connect,NET.retryMs)}
function connect(){
  clearTimeout(retryTimer);
  if(!code||kicked)return;
  if(typeof Peer!=='function'){setConn('off','連線套件沒有載入，請重新整理');return}
  if(peer&&!peer.destroyed){if(peer.open)dial();return}
  setConn('','連線中…');
  const me=new Peer(signalOptions());peer=me;
  me.on('open',()=>{if(peer===me)dial()});
  me.on('disconnected',()=>{if(peer===me&&!me.destroyed)setTimeout(()=>{if(peer===me&&!me.destroyed)me.reconnect()},NET.retryMs)});
  me.on('error',err=>{
    if(peer!==me)return;
    if(err.type==='peer-unavailable'){setConn('off',`找不到房間 ${code}，確認房號或等主持人開房…`);return later()}
    setConn('off','連線不穩，自動重試中…');
    if(['network','server-error','socket-error','socket-closed','browser-incompatible'].includes(err.type)){try{me.destroy()}catch{}peer=null}
    later();
  });
}
function dial(){
  try{conn?.close()}catch{}
  const c=peer.connect(CFG.prefix+code,{reliable:true});conn=c;
  c.on('open',async()=>{
    if(conn!==c)return;
    setConn('on','已連線');clearInterval(beatTimer);beatTimer=setInterval(()=>{if(conn?.open)conn.send({kind:'beat'})},NET.beatMs);
    const saved=storeGet(tokenKey());
    if(saved?.token)await hello({token:saved.token},true);
    else if(pendingHello)await hello(pendingHello,false);
    render();
  });
  c.on('data',msg=>{if(conn===c)onMessage(msg)});
  c.on('close',()=>{if(conn!==c)return;clearInterval(beatTimer);if(!kicked){setConn('off','連線中斷，重新連線中…');later()}});
  c.on('error',()=>{});
}
function onMessage(msg){
  if(msg?.kind==='reply'){const done=waiting.get(msg.ref);if(done){waiting.delete(msg.ref);done(msg)}return}
  if(msg?.kind==='view'){const pp=pub,pv=priv;pub=msg.pub;priv=msg.mine;try{phoneFx(pp,pv)}catch(e){console.error(e)}render();return}
  if(msg?.kind==='removed'){kicked=msg.reason||'你已離開房間。';joined=false;storeSet(tokenKey(),null);clearInterval(beatTimer);try{conn?.close()}catch{}render()}
}
function request(kind,data={}){
  return new Promise(resolve=>{
    if(!conn?.open){toast('還沒連上房間，請稍候再試。');return resolve({ok:false})}
    const ref=++refSerial,timer=setTimeout(()=>{waiting.delete(ref);toast('房間沒有回應，請稍後再試。');resolve({ok:false})},8000);
    waiting.set(ref,res=>{clearTimeout(timer);resolve(res)});
    conn.send({kind,ref,...data});
  });
}
async function hello(data,silent){
  const res=await request('hello',data);
  if(res.ok){joined=true;kicked='';pendingHello=null;storeSet(tokenKey(),{token:res.token})}
  else{if(data.token)storeSet(tokenKey(),null);if(!silent&&res.error)toast(res.error)}
  return res;
}
async function act(action){
  if(busy)return;busy=true;render();
  const res=await request('act',{action});if(!res.ok&&res.error)toast(res.error);
  busy=false;render();
}

function render(){
  const v=$('#view');
  if(kicked){v.innerHTML=`<section class="phone-card"><h2>已離開房間</h2><p>${h(kicked)}</p><button class="primary" data-a="rejoin">重新加入</button></section>`;return}
  // 加入表單已經在畫面上時不要重畫，避免把正在輸入的名字清掉。
  if(!code||!joined){if(!$('#join-form'))v.innerHTML=joinForm();return}
  if(!pub||!priv){v.innerHTML='<p class="muted">載入中…</p>';return}
  $('#top-name').textContent=priv.name;keepAwake();
  if(!pub.game){$('#top-sub').textContent=`房間 ${code} · 等待開始`;v.innerHTML=lobbyWait();return}
  const g=pub.game;$('#top-sub').textContent=`房間 ${code} · 第 ${g.round}／${g.maxRounds} 季`;
  v.innerHTML=(pub.status!=='playing'?finishedCard(g):turnCard(g))+meCard();
}
// 加入前還不知道房間是哪種玩法，所以這裡只填名字；角色版的角色在加入後的等待畫面選。
function joinForm(){
  return `<section class="phone-card" id="join-form"><p class="eyebrow">加入房間</p><h2>人生棋局</h2>
    <label class="field">房號<input id="code" maxlength="4" autocomplete="off" value="${h(code)}" placeholder="例如 AB12"></label>
    <label class="field">你的名字<input id="name" maxlength="16" placeholder="例如 小明"></label>
    <button class="primary big" data-a="join">加入 <span>→</span></button><p class="muted small">角色版的房間，加入後可以選角色。</p><p class="muted small"><a href="../index.html">☰ 回到選單</a></p></section>`;
}
function lobbyWait(){
  const roles=pub.variant==='roles',mine=roles?pub.roles.find(r=>r.id===priv.roleId):null;
  const pick=roles?`<label class="field">我的角色（不同玩家可以選同一個）<select id="my-role">${pub.roles.map(r=>`<option value="${r.id}" ${r.id===priv.roleId?'selected':''}>${r.icon} ${h(r.name)}</option>`).join('')}</select></label><p class="muted">${h(mine?.goal||'')}</p>`
    :`<p class="muted">所有人都從🧾 基本工作＋學貸開始，目標：${h(pub.goalText)}。機會牌堆裡有工作卡，抽到可以應徵換工作。</p>`;
  const who=s=>{const r=roles?pub.roles.find(x=>x.id===s.roleId):{icon:'🧾',name:'基本工作'};return r};
  return `<section class="phone-card"><p class="eyebrow">已加入 · 房間 ${code} · ${pub.variantShort} ${h(pub.variantLabel)}</p><h2>等待主持人開始</h2>${pick}<h3>房間裡的玩家（${pub.seats.length}）</h3><ul class="seat-list small">${pub.seats.map(s=>{const r=who(s);return `<li class="seat-row"><span class="seat-icon">${r.icon}</span><span class="seat-name"><b>${h(s.name)}${s.seatId===priv.seatId?'（你）':''}</b><small>${h(r.name)}</small></span><span class="seat-tag ${s.isBot?'bot':s.connected?'on':'off'}">${s.isBot?h(s.botLabel):s.connected?'已連線':'離線'}</span></li>`}).join('')}</ul></section>`;
}
function finishedCard(g){
  const winners=g.players.filter(p=>g.winnerIds.includes(p.id)),me=winners.some(w=>w.id===priv.playerId);
  return `<section class="phone-card turn ${me?'win':''}"><p class="eyebrow">對局結束</p><h2>${me?'🏆 你獲勝了！':`${h(winners.map(w=>w.name).join('、')||'無人')} 獲勝`}</h2><p>${h(WIN_TEXT[g.winReason]||'')}</p><p class="muted">等待主持人開始下一局。</p></section>`;
}
// 目前這格的類型（主地圖、高速公路或國外）。
function tileTypeOf(g,p){return p.track==='highway'?g.highway.tiles[p.position]:p.track==='abroad'?g.abroad.tiles[p.position]:g.tiles[p.position].type}
function turnCard(g){
  const cur=g.players.find(p=>p.id===g.currentId);
  if(priv.respond)return respondCard(priv.respond);
  if(!priv.isMyTurn){
    const card=g.card&&['choice','manage','respond'].includes(g.phase)?`<p class="muted">${g.card.isJob?'工作卡':h(TYPE_LABEL[g.card.type])+'卡'}：${h(g.card.name)}${g.result?.text&&g.phase==='manage'?` → ${h(g.result.text)}`:''}</p>`:'';
    const rv=g.destinyReveal&&g.phase==='destiny'?g.players.find(p=>p.id===g.destinyReveal.playerId):null;
    return `<section class="phone-card waiting"><p class="eyebrow">等待中</p><h2>輪到 ${h(cur.name)}</h2><p>${g.respond?h(respondWait(g.respond)):g.phase==='choice'&&g.choiceKind==='airport'?'在機場考慮要不要出國':h(PHASE_TEXT[g.phase]||'')}${cur.isBot?'（Bot）':''}</p>${card}${rv?`<p class="muted">${h(rv.name)} 抽到天命卡「${h(g.destinyReveal.name)}」</p>`:''}</section>`;
  }
  const dis=busy?'disabled':'';
  const ph=priv.phase,me=priv.me;
  if(ph==='destiny')return `<section class="phone-card turn"><p class="eyebrow">開局 · 天命卡</p><h2>抽一張天命卡</h2><p class="muted">天命卡是你這一局的特殊能力，所有人都看得到。抽到的卡會顯示在大螢幕上。</p><button class="primary big draw-btn" data-a="destiny" ${dis}>🎴 點我抽天命卡</button></section>`;
  if(ph==='exam'){const x=priv.exam;return `<section class="phone-card turn"><p class="eyebrow">受訓結束</p><h2>應考「${h(x.name)}」</h2><p class="muted">擲一顆骰子，≥ ${x.need} 就錄取${x.bonus?`（天命卡加成 +${x.bonus}）`:''}；沒通過工作卡洗回牌堆。</p><button class="primary big" data-a="exam" ${dis}>🎲 擲骰應考</button></section>`}
  if(ph==='roll'){
    const ex=g.exam&&g.exam.ok!==undefined&&!g.dice?`<p class="result-line">應考「${h(g.exam.name)}」擲出 ${g.exam.roll}${g.exam.bonus?`＋${g.exam.bonus}`:''}：${g.exam.ok?'錄取！':'沒有通過'}</p>`:'';
    const tip=cur.track==='abroad'?'在國外只用第一個轉輪（0–6）移動，走到「回國」自動回到機場。':me.car.owned?'你有車：每個轉輪的 1／2／3 視為 4／5／6。':'兩個轉輪各 0–6，相加就是前進格數。';
    const hw=me.car.owned&&cur.track==='main'?`<label class="toggle-row"><input type="checkbox" data-a="highway" ${me.car.useHighway?'checked':''} ${dis}> 經過第 ${g.highway.from} 格時走高速公路（收費 ${m(g.highway.toll)}）</label>`:'';
    return `<section class="phone-card turn"><p class="eyebrow">輪到你了</p>${ex}<h2>啟動拉霸</h2><p class="muted">${tip}結果會顯示在大螢幕上。</p>${hw}<button class="primary big" data-a="roll" ${dis}>啟動拉霸 ▦</button></section>`;
  }
  if(ph==='skip')return `<section class="phone-card turn"><p class="eyebrow">輪到你了</p><h2>🩹 這回合暫停</h2><p class="muted">${h(g.skipReason||'暫停')}：這回合無法移動，本季收支照常結算。${me.waitTurns?`之後還要再等 ${me.waitTurns} 回合。`:''}</p><button class="primary big" data-a="end" ${dis}>交給下一位 →</button></section>`;
  if(ph==='draw'){const t=tileTypeOf(g,cur),label=['fortune','market','chance','loss','abroad'].includes(t)?`停在${TYPE_LABEL[t]}格`:'經過家鄉的獎勵';return `<section class="phone-card turn"><p class="eyebrow">${h(label)}</p><h2>抽一張卡</h2><button class="primary big draw-btn" data-a="draw" ${dis}>${TYPE_ICON[t]||'?'} 點我抽卡</button></section>`}
  if(ph==='choice'){
    const c=priv.choice,eyebrow=c.kind==='airport'?'✈️ 機場':c.kind==='job'?`工作卡 · ${c.id}`:`機會 · ${c.id}`;
    const jobInfo=c.kind==='job'?`<p class="muted">每季薪水 ${m(c.salary)}、生活費 ${m(c.living)} · 條件：${h(c.cond)}<br>你目前的工作：${h(c.current)}</p>`:'';
    return `<section class="phone-card turn"><p class="eyebrow">${eyebrow}</p><h2>${c.icon?`${c.icon} `:''}${h(c.name)}</h2>${c.notice?`<p class="result-line">${h(c.notice)}</p>`:''}<p>${h(c.desc)}</p>${jobInfo}<div class="choice-list">${c.options.map(o=>`<button class="choice-btn" data-a="choose" data-i="${o.index}" ${o.affordable&&!busy?'':'disabled'}><b>${h(o.label)}${o.affordable?'':`（${h(o.reason||'現金不足')}）`}</b>${o.odds.length?`<small>${o.odds.map(x=>`${Math.round(x.p*100)}%：${h(x.text)}`).join('<br>')}</small>`:''}</button>`).join('')}</div></section>`;
  }
  if(ph==='respond')return `<section class="phone-card waiting"><p class="eyebrow">等待中</p><h2>${h(respondWait(g.respond))}</h2></section>`;
  // 理財階段
  const last=g.card&&g.result?.text?`<p class="result-line">${h(g.card.name)}：${h(g.result.text)}</p>`:g.result?.text?`<p class="result-line">${h(g.result.text)}</p>`:'';
  const debtOpts=me.debts.map(d=>`<option value="${d.id}">${h(d.name)} · 餘 ${m(d.balance)} · 年息 ${d.rate}%</option>`).join('');
  return `<section class="phone-card turn"><p class="eyebrow">輪到你了 · 理財時間</p>${last}
    <div class="action-block"><h4>本季工作量</h4>${fatigueMeter(me,true)}<div class="seg-row fatigue-pick">${workOptions(me).map(o=>`<button data-a="overtime" data-v="${o.level}" class="${me.overtime===o.level?'on':''}" ${me.unemployedRounds||busy?'disabled':''}><b>${h(o.label)}</b><small>${!o.income?'收入不變':me.fatigue>=me.fatigueRules.burnout?'過勞中無加成':`收入 +${o.income}%`}</small><small>疲勞 ${o.fatigue>0?'+':'−'}${Math.abs(o.fatigue)}</small><small class="${o.after>=me.fatigueRules.burnout?'over':''}">季末 → ${o.after}${o.after>=me.fatigueRules.burnout?' ⚠':''}</small></button>`).join('')}</div>${me.unemployedRounds?'<p class="muted small">失業期間不能加班。</p>':''}</div>
    ${me.debts.length?`<div class="action-block"><h4>提前還款</h4><select id="repay-debt" class="action-select">${debtOpts}</select><div class="action-row"><input id="repay-amount" type="number" inputmode="decimal" min="0.1" step="0.1" value="${Math.max(0,Math.min(5,Math.floor(me.cash)))}"><button data-a="repay" ${dis}>還款</button></div></div>`:''}
    <div class="action-block"><h4>信用貸款 · 年息 ${pct(me.creditRate,2)}</h4><p class="muted">剩餘額度 ${m(me.creditRoom)}</p><div class="action-row"><input id="borrow-amount" type="number" inputmode="decimal" min="0.1" step="0.1" value="5"><button data-a="borrow" ${me.creditRoom>0&&!busy?'':'disabled'}>借款</button></div></div>
    ${carBlock(me,dis)}${houseBlock(me)}
    <button class="primary big" data-a="end" ${dis}>完成，交給下一位 →</button></section>`;
}
// 買車：全額付清或頭期 20%＋車貸（車貸是明牌）。角色版的上班族全額買車就達成目標。
function carBlock(me,dis){
  const c=me.car;
  if(c.owned)return `<div class="action-block"><h4>🚗 你有車</h4><p class="muted small">轉輪 1–3 視為 4–6；經過交流道可走高速公路（拉霸前可以切換）。</p></div>`;
  return `<div class="action-block"><h4>🚗 買車 · ${m(c.price)}${c.isGoal?' · 全額付清＝達成目標':''}</h4><p class="muted small">有車：轉輪 1–3 視為 4–6，可走高速公路。車貸頭期 ${m(c.down)}，每季繳 ${m(c.payment)}，還款會占薪水 ${pct(c.dsr,0)}（上限 50%）。</p><div class="seg-row"><button class="goal-btn" data-a="car" data-v="cash" ${c.cashOk&&!busy?'':'disabled'}>全額付清${c.isGoal&&c.cashOk?' 🏁':''}</button><button data-a="car" data-v="loan" ${c.loanOk&&!busy?'':'disabled'}>頭期＋車貸</button></div></div>`;
}
function houseBlock(me){
  const x=me.house;if(!x||x.owned)return '';
  return `<div class="action-block"><h4>🏠 買房 · ${m(x.price)}</h4><p class="muted">頭期款 ${m(x.down)}；每季還款佔收入 ${pct(x.dsr,0)}（上限 ${x.dsrLimit}%）</p><button class="goal-btn" data-a="house" ${x.ok&&!busy?'':'disabled'}>付頭期款買房 ${x.ok?' 🏁':''}</button></div>`;
}
// 疲勞規則：結算時疲勞 ≥ 門檻，該季收入 −20%；降回門檻以下就恢復。
function workOptions(me){
  const r=me.fatigueRules,clamp=v=>Math.max(0,Math.min(100,v));
  return [{level:0,label:'正常上班',income:0,fatigue:r.normal},...me.overtimeLevels].map(o=>({...o,after:clamp(me.fatigue+o.fatigue)}));
}
function fatigueMeter(me,full){
  const r=me.fatigueRules,burn=me.fatigue>=r.burnout;
  return `<div class="fatigue-meter ${burn?'burn':''}"><div class="fatigue-head"><span>疲勞值</span><b>${me.fatigue}<small> / 100</small></b></div><div class="fatigue-bar"><i style="width:${me.fatigue}%"></i><em style="left:${r.burnout}%" title="過勞門檻"></em></div><div class="fatigue-scale"><span>0</span><span style="left:${r.burnout}%">${r.burnout} 過勞</span><span>100</span></div>${full||burn?`<p class="fatigue-rule">${burn?`⚠ 目前過勞：本季收入 ${r.penalty}%，加班沒有加成。`:''}季結算時疲勞 ≥ ${r.burnout}，那一季收入 ${r.penalty}%，而且加班沒有額外收入；降回 ${r.burnout} 以下就恢復。加班的疲勞季末才加上（⚠＝下一季會過勞）。停在 ☕ 休息站疲勞 ${r.rest}。</p>`:''}</div>`;
}
// 被邀請合作或被搶案子：由自己決定
function respondCard(r){
  const dis=busy?'disabled':'';
  return `<section class="phone-card turn"><p class="eyebrow">${r.type==='alliance'?'🤝 合作邀請':'💼 有人要搶你的案子'}</p><h2>${h(r.question)}</h2><div class="choice-list"><button class="choice-btn" data-a="respond" data-v="1" ${r.yes.affordable===false||busy?'disabled':''}><b>${h(r.yes.label)}${r.yes.affordable===false?'（現金不足）':''}</b><small>${h(r.yes.detail)}</small></button><button class="choice-btn" data-a="respond" data-v="0" ${dis}><b>${h(r.no.label)}</b><small>${h(r.no.detail)}</small></button></div></section>`;
}
function meCard(){
  const me=priv.me;if(!me)return '';
  const badges=[me.insured?'<span class="badge good">🛡 有保險</span>':'',me.unemployedRounds?`<span class="badge warn">失業 ${me.unemployedRounds} 季</span>`:'',me.fatigue>=me.burnout?'<span class="badge warn">過勞</span>':'',me.salaryFactor!==1?`<span class="badge good">薪資 ×${me.salaryFactor.toFixed(2)}</span>`:'',me.goalType==='streak'?`<span class="badge">連續 ${me.streak} 季達標</span>`:'',me.alliance?`<span class="badge good">🤝 與${h(me.alliance.partner)}合作至第 ${me.alliance.until} 季</span>`:'',me.caseIn?`<span class="badge good">💼 搶下案子 +${m(me.caseIn)}/季</span>`:'',me.caseOut?`<span class="badge warn">💼 案子被搶 ${m(me.caseOut)}/季</span>`:'',...(me.penalties||[]).map(x=>`<span class="badge warn">${h(x.text)} 收入 ${x.income}% 至第 ${x.until} 季</span>`)].filter(Boolean).join('');
  return `<section class="phone-card me"><div class="me-head"><span class="role-icon">${me.icon}</span><div><h3>${h(priv.name)}</h3><small>${h(me.roleName)} · 只有你看得到</small></div></div>
    ${heldCards(me)}
    <div class="wealth-line"><span>現金</span><strong>${m(me.cash)}</strong></div>${me.goalType==='netWorth'?`<div class="wealth-line"><span>淨資產</span><strong>${m(me.netWorth)}</strong></div>`:''}
    <div class="goal-line"><div class="goal-line-head"><span>${h(me.goal)}</span><b>${me.progress}%</b></div><div class="goal-track"><i style="width:${me.progress}%"></i></div></div>
    ${fatigueMeter(me,false)}
    ${badges?`<div class="player-badges">${badges}</div>`:''}
    <div class="finance-grid"><div class="finance-stat negative"><span>總負債</span><strong>${m(me.totalDebt)}</strong></div><div class="finance-stat"><span>本季預估淨額</span><strong>${signed(me.preview.net)}</strong></div><div class="finance-stat"><span>上季收入</span><strong>${me.lastIncome===null?'—':m(me.lastIncome)}</strong></div></div>
    <details class="finance-details"><summary>負債明細與上季收支</summary><table class="flow-table"><tbody>${me.debts.map(d=>`<tr><td>${h(d.name)}${d.public?' <small>明牌</small>':''}</td><td>${m(d.balance)}</td><td>${d.rate}%</td></tr>`).join('')||'<tr><td>沒有負債</td></tr>'}</tbody></table><table class="flow-table"><tbody>${(me.lastBreakdown||[]).map(l=>`<tr><td>${h(l.label)}</td><td>${signed(l.amount)}</td></tr>`).join('')||'<tr><td>尚未結算</td></tr>'}</tbody></table></details></section>`;
}

// 手上的卡：天命卡、工作卡／角色卡、明牌負債。點一下展開說明，隨時可以看。
function heldCards(me){
  const cards=[me.destiny?{icon:me.destiny.icon,kind:'天命卡',name:me.destiny.name,desc:me.destiny.desc}:null,
    me.identity.kind==='job'?{icon:me.job.icon,kind:'工作',name:me.job.name,desc:`每季薪水 ${m(me.job.salary)}、生活費 ${m(me.job.living)}。${me.job.desc}`}:{icon:me.identity.icon,kind:'角色',name:me.identity.name,desc:`${me.identity.title}。目標：${me.goal}`},
    me.training?{icon:'📚',kind:'受訓中',name:me.training.name,desc:`受訓結束後擲骰 ≥ ${me.training.need} 錄取。`}:null,
    ...me.debts.filter(d=>d.public).map(d=>({icon:'📄',kind:'明牌負債',name:d.name,desc:`餘額 ${m(d.balance)}，年息 ${d.rate}%，每季至少繳 ${m(d.payment)}。所有人都看得到。`}))].filter(Boolean);
  return `<div class="held-cards phone">${cards.map(c=>`<details class="held-card"><summary><span>${c.icon}</span><span><small>${h(c.kind)}</small><b>${h(c.name)}</b></span></summary><p>${h(c.desc)}</p></details>`).join('')}</div>`;
}
document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-a]');if(!b||b.disabled)return;
  const a=b.dataset.a;Sound.play('click');
  if(modeAction(a,b))return;
  if(a==='join'){
    const next=($('#code').value||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,4);
    if(next.length!==4)return toast('請輸入 4 碼房號。');
    const name=$('#name').value.trim();if(!name)return toast('請輸入名字。');
    pendingHello={name,roleId:document.querySelector('input[name=role]:checked')?.value};   // 企業版的加入表單有選角色
    const url=new URL(location.href);url.searchParams.set('room',next);history.replaceState(null,'',url);
    if(next!==code){code=next;try{conn?.close()}catch{}conn=null}
    if(conn?.open){await hello(pendingHello,false);render()}else{setConn('','連線中…');connect()}
    return;
  }
  if(a==='rejoin'){kicked='';joined=false;render();connect();return}
  if(a==='roll')return act({type:'roll'});
  if(a==='draw')return act({type:'draw'});
  if(a==='end')return act({type:'end'});
  if(a==='destiny')return act({type:'destiny'});
  if(a==='exam')return act({type:'exam'});
  if(a==='car')return act({type:'car',mode:b.dataset.v});
  if(a==='house')return act({type:'house'});
  if(a==='highway')return act({type:'highway',on:b.checked});
  if(a==='choose')return act({type:'choose',index:Number(b.dataset.i)});
  if(a==='respond')return act({type:'respond',yes:b.dataset.v==='1'});
  if(a==='overtime')return act({type:'overtime',level:Number(b.dataset.v)});
  if(a==='repay')return act({type:'repay',debtId:$('#repay-debt').value,amount:Number($('#repay-amount').value)});
  if(a==='borrow')return act({type:'borrow',amount:Number($('#borrow-amount').value)});
});
document.addEventListener('change',async e=>{if(e.target.id==='my-role'){const res=await request('setRole',{roleId:e.target.value});if(!res.ok&&res.error)toast(res.error)}});
// 手機從背景回來時，若連線已斷就重新連。
document.addEventListener('visibilitychange',()=>{if(document.hidden)return;keepAwake();if(code&&!kicked&&!conn?.open)connect()});
// 手機只有音效（背景音樂由大螢幕播放，避免多支手機一起響）。
Sound.mountControls($('#snd-ctrl'),{music:false});
// 等所有 script 載入後才啟動，讓企業版的畫面檔可以覆蓋 turnCard 等函式。
document.addEventListener('DOMContentLoaded',()=>{render();connect()});
