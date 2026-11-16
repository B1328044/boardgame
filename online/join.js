// 手機：加入房間、選角色；遊戲中只顯示自己的財務，輪到自己時出現操作按鈕。
// 手機不執行遊戲規則，只把動作送給大螢幕（房主），再顯示房主傳回來的畫面資料。
'use strict';
const params=new URLSearchParams(location.search);
let code=(params.get('room')||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,4);
const tokenKey=()=>`life-board-player-${code}`;
let pub=null,priv=null,joined=false,busy=false,kicked='',pendingHello=null;
let peer=null,conn=null,refSerial=0,beatTimer=null,retryTimer=null;
const waiting=new Map();

/* ---------- 音效、震動、畫面提醒 ---------- */
// 手機只播「跟自己有關」的音效與震動；震動只有支援的手機才有（iPhone 的 Safari 不支援就略過）。
let fxCardKey=null,fxLogLen=null,wake=null;
function phoneFx(pp,pv){
  const g=pub?.game,pg=pp?.game,me=priv?.me,pm=pv?.me,name=priv?.name||'';
  const ck=g?.card?`${g.round}-${g.turnIndex}-${g.card.id}`:null;
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
function soundBtn(){const b=$('#snd');if(b){b.textContent=Sound.pref.sfx?'🔊':'🔇';b.setAttribute('aria-label',Sound.pref.sfx?'關閉音效與震動':'開啟音效與震動')}}
document.addEventListener('pointerdown',()=>{Sound.unlock();keepAwake()},{capture:true});

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
  const c=peer.connect(NET.roomIdPrefix+code,{reliable:true});conn=c;
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
function joinForm(){
  const roles=pub?.roles||[{id:'low',name:'底層',icon:'🧹',goal:'清空所有負債，且存款至少 50 萬'},{id:'office',name:'上班族',icon:'💼',goal:'一次付清買下一台 100 萬的車'},{id:'exec',name:'公司高管',icon:'🏙️',goal:'買下一棟 1,000 萬的房子'},{id:'free',name:'自由業',icon:'🎨',goal:'連續 5 季收入都超過 18 萬'}];
  return `<section class="phone-card" id="join-form"><p class="eyebrow">加入房間</p><h2>人生棋局</h2>
    <label class="field">房號<input id="code" maxlength="4" autocomplete="off" value="${h(code)}" placeholder="例如 AB12"></label>
    <label class="field">你的名字<input id="name" maxlength="16" placeholder="例如 小明"></label>
    <fieldset class="role-pick"><legend>選擇角色（角色可重複，不同玩家可以選同一個）</legend>${roles.map((r,i)=>`<label class="role-opt"><input type="radio" name="role" value="${r.id}" ${i===0?'checked':''}><span><b>${r.icon} ${h(r.name)}</b><small>${h(r.goal)}</small></span></label>`).join('')}</fieldset>
    <button class="primary big" data-a="join">加入 <span>→</span></button></section>`;
}
function lobbyWait(){
  const roleOpts=pub.roles.map(r=>`<option value="${r.id}" ${r.id===priv.roleId?'selected':''}>${r.icon} ${h(r.name)}</option>`).join('');
  return `<section class="phone-card"><p class="eyebrow">已加入 · 房間 ${code}</p><h2>等待主持人開始</h2><label class="field">我的角色<select id="my-role">${roleOpts}</select></label><p class="muted">${h(pub.roles.find(r=>r.id===priv.roleId)?.goal||'')}</p><h3>房間裡的玩家（${pub.seats.length}）</h3><ul class="seat-list small">${pub.seats.map(s=>{const r=pub.roles.find(x=>x.id===s.roleId);return `<li class="seat-row"><span class="seat-icon">${r.icon}</span><span class="seat-name"><b>${h(s.name)}${s.seatId===priv.seatId?'（你）':''}</b><small>${h(r.name)}</small></span><span class="seat-tag ${s.isBot?'bot':s.connected?'on':'off'}">${s.isBot?h(s.botLabel):s.connected?'已連線':'離線'}</span></li>`}).join('')}</ul></section>`;
}
function finishedCard(g){
  const winners=g.players.filter(p=>g.winnerIds.includes(p.id)),me=winners.some(w=>w.id===priv.playerId);
  return `<section class="phone-card turn ${me?'win':''}"><p class="eyebrow">對局結束</p><h2>${me?'🏆 你獲勝了！':`${h(winners.map(w=>w.name).join('、')||'無人')} 獲勝`}</h2><p>${h(WIN_TEXT[g.winReason]||'')}</p><p class="muted">等待主持人開始下一局。</p></section>`;
}
function turnCard(g){
  const cur=g.players.find(p=>p.id===g.currentId);
  if(priv.respond)return respondCard(priv.respond);
  if(!priv.isMyTurn){
    const card=g.card&&['choice','manage','respond'].includes(g.phase)?`<p class="muted">${h(TYPE_LABEL[g.card.type])}卡：${h(g.card.name)}${g.result?.text&&g.phase==='manage'?` → ${h(g.result.text)}`:''}</p>`:'';
    return `<section class="phone-card waiting"><p class="eyebrow">等待中</p><h2>輪到 ${h(cur.name)}</h2><p>${g.respond?h(respondWait(g.respond)):h(PHASE_TEXT[g.phase]||'')}${cur.isBot?'（Bot）':''}</p>${card}</section>`;
  }
  const dis=busy?'disabled':'';
  const ph=priv.phase;
  if(ph==='roll')return `<section class="phone-card turn"><p class="eyebrow">輪到你了</p><h2>啟動拉霸</h2><p class="muted">兩個轉輪各 0–6，相加就是前進格數。結果會顯示在大螢幕上。</p><button class="primary big" data-a="roll" ${dis}>啟動拉霸 ▦</button></section>`;
  if(ph==='skip')return `<section class="phone-card turn"><p class="eyebrow">輪到你了</p><h2>🩹 這回合暫停</h2><p class="muted">上一回合的意外讓你無法行動，本季收支照常結算。</p><button class="primary big" data-a="end" ${dis}>交給下一位 →</button></section>`;
  if(ph==='draw')return `<section class="phone-card turn"><p class="eyebrow">停在${h(TYPE_LABEL[pub.game.tiles[cur.position].type])}格</p><h2>抽一張卡</h2><button class="primary big draw-btn" data-a="draw" ${dis}>${TYPE_ICON[pub.game.tiles[cur.position].type]} 點我抽卡</button></section>`;
  if(ph==='choice'){
    const c=priv.choice;
    return `<section class="phone-card turn"><p class="eyebrow">機會 · ${c.id}</p><h2>${h(c.name)}</h2>${c.notice?`<p class="result-line">${h(c.notice)}</p>`:''}<p>${h(c.desc)}</p><div class="choice-list">${c.options.map(o=>`<button class="choice-btn" data-a="choose" data-i="${o.index}" ${o.affordable&&!busy?'':'disabled'}><b>${h(o.label)}${o.affordable?'':`（${h(o.reason||'現金不足')}）`}</b><small>${o.odds.map(x=>`${Math.round(x.p*100)}%：${h(x.text)}`).join('<br>')}</small></button>`).join('')}</div></section>`;
  }
  if(ph==='respond')return `<section class="phone-card waiting"><p class="eyebrow">等待中</p><h2>${h(respondWait(g.respond))}</h2></section>`;
  // 理財階段
  const me=priv.me,last=g.card&&g.result?.text?`<p class="result-line">${h(g.card.name)}：${h(g.result.text)}</p>`:'';
  const debtOpts=me.debts.map(d=>`<option value="${d.id}">${h(d.name)} · 餘 ${m(d.balance)} · 年息 ${d.rate}%</option>`).join('');
  const goal=me.buy.type==='car'?`<button class="goal-btn" data-a="buy" ${me.buy.ok&&!busy?'':'disabled'}>一次付清買車（${m(me.buy.price)}）${me.buy.ok?' 🏁':''}</button>`:me.buy.type==='house'?`<p class="muted">頭期款 ${m(me.buy.down)}；月付佔收入 ${pct(me.buy.dsr,0)}（上限 ${me.buy.dsrLimit}%）</p><button class="goal-btn" data-a="buy" ${me.buy.ok&&!busy?'':'disabled'}>付頭期款買房 ${me.buy.ok?' 🏁':''}</button>`:'';
  return `<section class="phone-card turn"><p class="eyebrow">輪到你了 · 理財時間</p>${last}
    <div class="action-block"><h4>本季工作量</h4>${fatigueMeter(me,true)}<div class="seg-row fatigue-pick">${workOptions(me).map(o=>`<button data-a="overtime" data-v="${o.level}" class="${me.overtime===o.level?'on':''}" ${me.unemployedRounds||busy?'disabled':''}><b>${h(o.label)}</b><small>${!o.income?'收入不變':me.fatigue>=me.fatigueRules.burnout?'過勞中無加成':`收入 +${o.income}%`}</small><small>疲勞 ${o.fatigue>0?'+':'−'}${Math.abs(o.fatigue)}</small><small class="${o.after>=me.fatigueRules.burnout?'over':''}">季末 → ${o.after}${o.after>=me.fatigueRules.burnout?' ⚠':''}</small></button>`).join('')}</div>${me.unemployedRounds?'<p class="muted small">失業期間不能加班。</p>':''}</div>
    ${me.debts.length?`<div class="action-block"><h4>提前還款</h4><select id="repay-debt" class="action-select">${debtOpts}</select><div class="action-row"><input id="repay-amount" type="number" inputmode="decimal" min="0.1" step="0.1" value="${Math.max(0,Math.min(5,Math.floor(me.cash)))}"><button data-a="repay" ${dis}>還款</button></div></div>`:''}
    <div class="action-block"><h4>信用貸款 · 年息 ${pct(me.creditRate,2)}</h4><p class="muted">剩餘額度 ${m(me.creditRoom)}</p><div class="action-row"><input id="borrow-amount" type="number" inputmode="decimal" min="0.1" step="0.1" value="5"><button data-a="borrow" ${me.creditRoom>0&&!busy?'':'disabled'}>借款</button></div></div>
    ${goal}
    <button class="primary big" data-a="end" ${dis}>完成，交給下一位 →</button></section>`;
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
    <div class="wealth-line"><span>現金</span><strong>${m(me.cash)}</strong></div>
    <div class="goal-line"><div class="goal-line-head"><span>${h(me.goal)}</span><b>${me.progress}%</b></div><div class="goal-track"><i style="width:${me.progress}%"></i></div></div>
    ${fatigueMeter(me,false)}
    ${badges?`<div class="player-badges">${badges}</div>`:''}
    <div class="finance-grid"><div class="finance-stat negative"><span>總負債</span><strong>${m(me.totalDebt)}</strong></div><div class="finance-stat"><span>本季預估淨額</span><strong>${signed(me.preview.net)}</strong></div><div class="finance-stat"><span>上季收入</span><strong>${me.lastIncome===null?'—':m(me.lastIncome)}</strong></div></div>
    <details class="finance-details"><summary>負債明細與上季收支</summary><table class="flow-table"><tbody>${me.debts.map(d=>`<tr><td>${h(d.name)}</td><td>${m(d.balance)}</td><td>${d.rate}%</td></tr>`).join('')||'<tr><td>沒有負債</td></tr>'}</tbody></table><table class="flow-table"><tbody>${(me.lastBreakdown||[]).map(l=>`<tr><td>${h(l.label)}</td><td>${signed(l.amount)}</td></tr>`).join('')||'<tr><td>尚未結算</td></tr>'}</tbody></table></details></section>`;
}

document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-a]');if(!b||b.disabled)return;
  const a=b.dataset.a;Sound.play('click');
  if(a==='join'){
    const next=($('#code').value||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,4);
    if(next.length!==4)return toast('請輸入 4 碼房號。');
    const name=$('#name').value.trim();if(!name)return toast('請輸入名字。');
    pendingHello={name,roleId:document.querySelector('input[name=role]:checked')?.value};
    const url=new URL(location.href);url.searchParams.set('room',next);history.replaceState(null,'',url);
    if(next!==code){code=next;try{conn?.close()}catch{}conn=null}
    if(conn?.open){await hello(pendingHello,false);render()}else{setConn('','連線中…');connect()}
    return;
  }
  if(a==='rejoin'){kicked='';joined=false;render();connect();return}
  if(a==='roll')return act({type:'roll'});
  if(a==='draw')return act({type:'draw'});
  if(a==='end')return act({type:'end'});
  if(a==='buy')return act({type:'buy'});
  if(a==='choose')return act({type:'choose',index:Number(b.dataset.i)});
  if(a==='respond')return act({type:'respond',yes:b.dataset.v==='1'});
  if(a==='overtime')return act({type:'overtime',level:Number(b.dataset.v)});
  if(a==='repay')return act({type:'repay',debtId:$('#repay-debt').value,amount:Number($('#repay-amount').value)});
  if(a==='borrow')return act({type:'borrow',amount:Number($('#borrow-amount').value)});
});
document.addEventListener('change',async e=>{if(e.target.id==='my-role'){const res=await request('setRole',{roleId:e.target.value});if(!res.ok&&res.error)toast(res.error)}});
// 手機從背景回來時，若連線已斷就重新連。
document.addEventListener('visibilitychange',()=>{if(document.hidden)return;keepAwake();if(code&&!kicked&&!conn?.open)connect()});
$('#snd').addEventListener('click',()=>{Sound.unlock();Sound.setPref('sfx',!Sound.pref.sfx);soundBtn();Sound.play('click')});soundBtn();
render();connect();
