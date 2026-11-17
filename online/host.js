// 大螢幕＝房主：在這個瀏覽器裡執行遊戲規則與 Bot，手機透過瀏覽器直連加入。
// 每位玩家只會收到公開資料＋自己的私人資料；大螢幕本身只顯示公開資料。
'use strict';
const SAVE_KEY=CFG.saveKey;
const BOT_DELAY=Number(new URLSearchParams(location.search).get('botDelay'))||900;
let room=null,host=null,pub=null,peer=null,botTimer=null,rollFx=null,lastRollKey=null,shownCardKey=null;
// 棋子走路動畫：shownPos 是畫面上棋子所在的格子，walk 是正在走的那一步一步路線。
const REEL_MS=1200,STEP_MS=240,FRESH_MS=3200;
const shownPos=new Map();let walk=null;
// 動態提示：seenLog 是上次看過的動態數量，fresh 記錄新動態出現的時間與則數。
let seenLog=null,fresh={at:0,count:0};
const links=new Map();   // 連線對象 id → {conn, token, lastSeen}

function qrSvg(text){
  if(typeof qrcode!=='function')return '';
  const q=qrcode(0,'M');q.addData(text);q.make();
  return q.createSvgTag({cellSize:6,margin:2,scalable:true,alt:'加入房間的 QR code'});
}
function setHostInfo(){const joinUrl=joinLink(room.code);host={code:room.code,joinUrl,qr:qrSvg(joinUrl)}}
const send=(conn,msg)=>{try{if(conn?.open)conn.send(msg)}catch{}};

/* ---------- 房間與連線 ---------- */
// variant：A 工作卡版（jobs）或 B 角色版（roles）；企業版的房間會忽略這個設定。
function createRoom(variant=room?.variant||'jobs'){
  room=new Room(newCode(),{variant});setHostInfo();
  openRoom({fresh:true});publish();
}
function openRoom({fresh}){
  try{peer?.destroy()}catch{}
  if(typeof Peer!=='function'){setConn('off','連線套件沒有載入，請重新整理');return}
  setConn('','正在開放房間…');
  const me=new Peer(CFG.prefix+room.code,signalOptions());peer=me;
  me.on('open',()=>{if(peer===me)setConn('on','房間已開放')});
  me.on('connection',conn=>attach(conn));
  me.on('disconnected',()=>{if(peer!==me||me.destroyed)return;setConn('off','與配對伺服器斷線，重新連線中…');setTimeout(()=>{if(peer===me&&!me.destroyed)me.reconnect()},NET.retryMs)});
  me.on('error',err=>{
    if(peer!==me)return;
    // 房號剛好被別人用走：新房間就換一組；重新整理後的舊房間則等舊連線釋放再試。
    if(err.type==='unavailable-id'){if(fresh){toast('房號重複，已換一組。');return createRoom(room.variant)}setConn('off','房號還在釋放中，稍後自動重試…');return void setTimeout(()=>{if(peer===me)openRoom({fresh:false})},NET.retryMs)}
    if(['network','server-error','socket-error','socket-closed'].includes(err.type)){setConn('off','連不上配對伺服器，自動重試中…');return void setTimeout(()=>{if(peer===me)openRoom({fresh})},NET.retryMs*2)}
    if(err.type!=='peer-unavailable')toast(`連線錯誤：${err.type||err.message}`);
  });
}
function attach(conn){
  links.set(conn.peer,{conn,token:null,lastSeen:Date.now()});
  conn.on('data',msg=>handle(conn,msg));
  conn.on('close',()=>drop(conn));
  conn.on('error',()=>drop(conn));
}
function handle(conn,msg){
  const link=links.get(conn.peer)||{conn,token:null};link.conn=conn;link.lastSeen=Date.now();links.set(conn.peer,link);
  const reply=(ok,extra={})=>send(conn,{kind:'reply',ref:msg?.ref,ok,...extra});
  if(!room)return reply(false,{error:'房間已關閉。'});
  try{
    if(msg?.kind==='beat'){const seat=room.seatByToken(link.token);if(seat&&!seat.connected){seat.connected=true;publish()}return}
    if(msg?.kind==='hello'){
      const seat=room.seatByToken(msg.token)||room.addHuman({name:msg.name,roleId:msg.roleId});
      // 同一個座位從別的裝置加入：舊裝置收到通知並斷線。
      for(const [id,l] of links)if(l!==link&&l.token===seat.token){send(l.conn,{kind:'removed',reason:'你已在另一個裝置上加入。'});setTimeout(()=>l.conn.close(),200);links.delete(id)}
      link.token=seat.token;seat.connected=true;reply(true,{token:seat.token,seatId:seat.seatId});
    } else if(msg?.kind==='setRole'){
      const seat=room.seatByToken(link.token);if(!seat)throw Error('請先加入房間。');
      room.updateSeat(seat,{roleId:msg.roleId});reply(true);
    } else if(msg?.kind==='act'){room.act(link.token,msg.action);reply(true)}
    else throw Error('看不懂的訊息。');
    publish();
  }catch(e){reply(false,{error:e.message})}
}
function drop(conn){
  const link=links.get(conn.peer);if(!link||link.conn!==conn)return;
  links.delete(conn.peer);
  const seat=room?.seatByToken(link.token);
  if(seat&&![...links.values()].some(l=>l.token===seat.token)){seat.connected=false;publish()}
}
// 手機鎖螢幕或直接關頁時常常不會通知斷線，所以用定期回報判斷是否離線。
setInterval(()=>{
  if(!room)return;let changed=false;
  for(const [id,l] of links)if(Date.now()-l.lastSeen>NET.offlineMs){links.delete(id);try{l.conn.close()}catch{}const seat=room.seatByToken(l.token);if(seat&&seat.connected){seat.connected=false;changed=true}}
  if(changed)publish();
},3000);

// 狀態改變後：存檔、更新大螢幕、把畫面資料分別送給每位玩家，必要時讓 Bot 繼續。
function publish(){
  const next=room.publicView(),g=next.game;
  const key=g&&Number.isInteger(g.dice)&&g.phase!=='roll'?`${g.round}-${g.turnIndex}-${g.reels}`:null;
  if(key&&key!==lastRollKey&&pub?.game){rollFx=Date.now();Sound.play('spin');setTimeout(()=>Sound.play('reelStop',0),REEL_MS-260);setTimeout(()=>Sound.play('reelStop',1),REEL_MS)}
  lastRollKey=key;const before=seenLog;trackLog(next.game);hostSounds(pub,next,before);trackMoves(next.game);pub=next;
  for(const l of links.values())if(l.token)send(l.conn,{kind:'view',pub,mine:room.privateView(l.token)});
  storeSet(SAVE_KEY,room.toJSON());render();scheduleBot();
}
function scheduleBot(){
  if(botTimer||!room?.needsBot())return;
  // 等拉霸和棋子走完再讓 Bot 做下一步，畫面才跟得上。
  // 天命卡揭曉要停留 2–3 秒讓大家看清楚，Bot 才抽下一張或開始拉霸。
  const rv=pub?.game?.destinyReveal,revealLeft=rv&&destinyShownAt.has(rv.seq)?DESTINY_MS-(Date.now()-destinyShownAt.get(rv.seq))+200:0;
  const wait=Math.max(BOT_DELAY,walkEnd()-Date.now()+500,(rollFx||0)+REEL_MS-Date.now()+300,revealLeft);
  botTimer=setTimeout(()=>{botTimer=null;try{if(room?.botStep())publish()}catch(e){console.error('Bot 錯誤',e)}},wait);
}
function closeRoom(){
  for(const l of links.values())send(l.conn,{kind:'removed',reason:'主持人已關閉房間。'});
  clearTimeout(botTimer);botTimer=null;links.clear();
  setTimeout(()=>{try{peer?.destroy()}catch{}peer=null},300);
  room=null;host=null;pub=null;shownPos.clear();walk=null;seenLog=null;storeSet(SAVE_KEY,null);setConn('','尚未建立房間');render();
}

function render(){
  const view=$('#view'),inGame=pub?.game;
  $('#room-chip').hidden=!host;$('#room-chip').textContent=host?`房號 ${host.code}`:'';
  $('#lobby-btn').hidden=!inGame;$('#round-badge').hidden=!inGame;$('#close-btn').hidden=!host;
  if(!host){view.innerHTML=startScreen();return}
  if(!pub){view.innerHTML='<div class="empty-state gap-top">載入房間中…</div>';return}
  view.innerHTML=inGame?gameScreen():lobbyScreen();
  if(inGame)placePawns();
  if($('#log-dialog')?.open)fillLogDialog();
}
function startScreen(){
  return `<section class="host-start"><p class="eyebrow">連線版 · 大螢幕</p><h1>建立房間，<br><em>大家用手機加入。</em></h1><p class="lead">這台電腦當作大螢幕（建議接投影），顯示棋盤與公開資訊；每位玩家用自己的手機掃 QR 加入，只會看到自己的現金與負債。</p><div class="mode-pick"><button class="primary big" type="button" data-act="create" data-variant="jobs">A 工作卡版房間 →</button><button class="primary big" type="button" data-act="create" data-variant="roles">B 角色版房間 →</button><a class="secondary" href="./ent-host.html">改開企業版房間</a></div><div class="variant-notes"><p><b>A 工作卡版</b>：大家都從基本工作＋學貸起步，在機會牌堆裡抽工作卡換工作，目標淨資產 300 萬。</p><p><b>B 角色版</b>：四種收入角色（底層、上班族、自由業、高管），各有自己的人生目標。</p></div><p class="muted">這台電腦的瀏覽器就是房主：遊戲規則在這裡執行，請在對局結束前保持這個分頁開著。重新整理不會遺失對局。</p></section>`;
}
function lobbyScreen(){
  const roles=pub.variant==='roles';
  const seats=pub.seats.map(s=>{const r=roles?pub.roles.find(x=>x.id===s.roleId):{icon:'🧾',name:'基本工作',goal:pub.goalText};return `<li class="seat-row"><span class="seat-icon">${r.icon}</span><span class="seat-name"><b>${h(s.name)}</b><small>${h(r.name)} · ${h(r.goal)}</small></span><span class="seat-tag ${s.isBot?'bot':s.connected?'on':'off'}">${s.isBot?h(s.botLabel):s.connected?'已連線':'離線'}</span><button class="remove-player" type="button" data-act="remove" data-seat="${s.seatId}" aria-label="移除 ${h(s.name)}">×</button></li>`}).join('');
  const roleOpts=pub.roles.map(r=>`<option value="${r.id}">${r.icon} ${h(r.name)}</option>`).join('');
  const levelOpts=pub.botLevels.map(l=>`<option value="${l.id}" ${l.id==='mid'?'selected':''}>Bot·${l.label}</option>`).join('');
  return `<section class="lobby">
    <div class="lobby-join panel"><p class="eyebrow">掃描加入</p><div class="qr">${host.qr}</div><p class="room-code">${host.code}</p><p class="join-url">${h(host.joinUrl)}</p>${linkReachable()?'<p class="muted">用手機掃 QR，或打開網址輸入房號。手機不需要和這台電腦連同一個 Wi-Fi。</p>':'<p class="warn-note">目前是用本機檔案或 localhost 開啟，手機打不開這個網址。請把專案放到 GitHub Pages（或其他網站）後，從網址開啟這個頁面。</p>'}</div>
    <div class="lobby-seats panel"><div class="section-heading"><div><p class="eyebrow">LOBBY · ${pub.variantShort} ${h(pub.variantLabel)}</p><h2>玩家（${pub.seats.length}／8）</h2></div><span class="step-pill">至少 2 人</span></div>
      <ul class="seat-list">${seats||'<li class="muted">等待玩家掃碼加入…</li>'}</ul>
      <div class="bot-add">${roles?`<select id="bot-role" aria-label="Bot 角色">${roleOpts}</select>`:''}<select id="bot-level" aria-label="Bot 難度">${levelOpts}</select><button class="secondary" type="button" data-act="add-bot" ${pub.seats.length>=8?'disabled':''}>＋ 加入 Bot</button></div>
      <div class="setup-options"><label>最多季數<input id="max-rounds" type="number" min="8" max="60" value="${pub.maxRounds}"></label></div>
      <button class="primary big" type="button" data-act="start" ${pub.seats.length<2?'disabled':''}>開始遊戲 <span>→</span></button></div>
  </section>`;
}
/* ---------- 棋子：頭像＋逐格走路 ---------- */
// 個人版的位置有軌道（主地圖、高速公路、國外），用「軌道-格子」當鍵；企業版只有主地圖的格子編號。
const posKey=p=>p.track?`${p.track}-${p.position}`:String(p.position);
const nodeKeyOf=n=>`${n.t}-${n.i}`;
function trackMoves(g){
  if(!g){shownPos.clear();walk=null;return}
  const n=g.tiles.length;
  for(const p of g.players){
    const was=shownPos.get(p.id),now=posKey(p);
    if(was===undefined||p.bankrupt){shownPos.set(p.id,now);continue}
    if(walk?.playerId===p.id){if(walk.path.at(-1)===now)continue;walk=null}
    if(was===now)continue;
    let path=null;
    if(p.track){
      // 個人版：照引擎給的實際路線走（含高速公路與國外），走完國外再跳回機場。
      const mv=g.lastMove;
      if(p.id===g.currentId&&mv?.playerId===p.id&&mv.path.length){path=mv.path.map(nodeKeyOf);if(mv.returned)path.push(now);if(path.at(-1)!==now)path=null}
    } else {
      const steps=(p.position-Number(was)+n)%n;
      // 這一季剛拉霸、而且剛好前進拉霸點數：一格一格走過去；其他位置變化直接跳到新格子。
      if(p.id===g.currentId&&g.dice&&steps===g.dice)path=Array.from({length:steps},(_,i)=>String((Number(was)+i+1)%n));
    }
    if(path){
      if(walk)shownPos.set(walk.playerId,walk.path.at(-1));   // 上一位還沒走完就直接到位
      walk={playerId:p.id,path,start:Math.max(Date.now(),(rollFx||0)+REEL_MS)};
      setTimeout(stepWalk,0);
    } else shownPos.set(p.id,now);
  }
}
function stepWalk(){
  clearTimeout(stepWalk.t);if(!walk)return;
  const now=Date.now();
  if(now<walk.start){stepWalk.t=setTimeout(stepWalk,walk.start-now);return}
  const done=Math.min(walk.path.length,Math.floor((now-walk.start)/STEP_MS)+1);
  shownPos.set(walk.playerId,walk.path[done-1]);Sound.play('step',done);
  const finished=done>=walk.path.length;
  placePawns(finished?null:walk.playerId);
  if(finished){walk=null;return}
  stepWalk.t=setTimeout(stepWalk,walk.start+done*STEP_MS-now);
}
const walkEnd=()=>walk?walk.start+walk.path.length*STEP_MS:0;
const pawn=(p,current,moving)=>`<span class="pawn ${current?'current':''} ${moving?'moving':''}" style="--c:${COLORS[p.color]}" title="${h(p.name)}"><span>${p.icon}</span></span>`;
function placePawns(movingId=walk?.playerId){
  const g=pub?.game,board=$('.host-board')||$('#board');if(!g||!board)return;
  board.querySelectorAll('.tile-tokens').forEach(el=>{el.innerHTML='';el.classList.remove('crowded')});
  board.querySelectorAll('.tile-active').forEach(el=>el.classList.remove('tile-active'));
  const groups=new Map();
  for(const p of g.players){if(p.bankrupt)continue;const pos=shownPos.get(p.id)??posKey(p);if(!groups.has(pos))groups.set(pos,[]);groups.get(pos).push(p)}
  for(const [pos,list] of groups){
    const tile=board.querySelector(`[data-node="${pos}"]`)||board.querySelector(`[data-tile-index="${pos}"]`);if(!tile)continue;
    list.sort((a,b)=>(a.id===g.currentId)-(b.id===g.currentId));   // 目前玩家疊在最上面
    const box=tile.querySelector('.tile-tokens');box.classList.toggle('crowded',list.length>3);
    box.innerHTML=list.map(p=>pawn(p,p.id===g.currentId,p.id===movingId)).join('');
    if(list.some(p=>p.id===movingId))tile.classList.add('tile-active');
  }
}

/* ---------- 音效 ---------- */
let soundCardKey=null,turnKey=null,turnSince=Date.now();
function hostSounds(prev,next,logBefore){
  const g=next.game,pg=prev?.game;
  Sound.setMood(g&&next.status==='playing'?(g.regime==='normal'?'normal':g.regime):'lobby');
  if(!g){if(prev&&!pg&&next.seats.length>prev.seats.length)Sound.play('join');soundCardKey=null;return}
  if(!pg){Sound.play('turn');return}
  // 新的卡片：翻牌＋依卡片類型的提示音
  const ck=g.card?(g.card.seq?`seq-${g.card.seq}`:`${g.round}-${g.turnIndex}-${g.card.id}`):null;
  // 天命卡揭曉也播翻牌音效。
  const dk=g.destinyReveal?.seq??null;if(dk!==null&&dk!==pg.destinyReveal?.seq)Sound.play('flip');
  const newCard=ck&&ck!==soundCardKey;
  if(newCard){Sound.play('flip');Sound.play(g.card.sound||g.card.type)}
  soundCardKey=ck;
  // 新動態裡的重大事件
  if(logBefore!==null&&g.logCount>logBefore){const ev=eventSound(g.log.slice(0,g.logCount-logBefore));if(ev)setTimeout(()=>Sound.play(ev.name),newCard?700:0)}
  if(next.status!=='playing'&&prev.status==='playing'&&eventSound(g.log.slice(0,3))?.name!=='win')setTimeout(()=>Sound.play('win'),1200);
  // 換下一位玩家
  if(next.status==='playing'&&g.currentId!==pg.currentId)setTimeout(()=>Sound.play('turn'),350);
}
// 輪到真人玩家太久沒動作：大螢幕滴答催促（理財階段給 60 秒，其他 30 秒；再過 15 秒變急促）。
setInterval(()=>{
  const g=pub?.game,cur=g?.players.find(p=>p.id===(g.respond?g.respond.targetId:g.currentId)),note=$('#wait-note');
  if(!g||pub.status!=='playing'||!cur){turnKey=null;return}
  const key=`${g.round}-${cur.id}-${g.phase}`;
  if(key!==turnKey){turnKey=key;turnSince=Date.now()}
  if(cur.isBot||!cur.connected){if(note)note.textContent='';return}
  const waited=Math.floor((Date.now()-turnSince)/1000),limit=g.phase==='manage'?60:30;
  if(note)note.textContent=waited>=limit?`⏱ 已等待 ${waited} 秒`:'';
  if(waited>=limit)Sound.play('tick',waited>=limit+15);
},1000);

/* ---------- 動態提示 ---------- */
function trackLog(g){
  if(!g){seenLog=null;return}
  const n=g.logCount;
  if(seenLog!==null&&n>seenLog)fresh={at:Date.now(),count:Math.min(3,n-seenLog)};
  if(seenLog!==null&&n<seenLog)fresh={at:0,count:0};
  seenLog=n;
}
// 新動態的動畫用「負的延遲」接續播放，畫面重畫也不會從頭重播。
function freshStyle(){const t=Date.now()-fresh.at;return t<FRESH_MS?{on:true,style:`animation-delay:-${t}ms`}:{on:false,style:''}}
function ticker(g){
  const f=freshStyle(),items=g.log.slice(0,3).map((x,i)=>{
    const {round,text}=splitLog(x),[cat,icon]=classify(text),isNew=f.on&&i<fresh.count;
    return `<div class="tick ${cat} ${i===0?'lead':''} ${isNew?'fresh':''}" style="${isNew?f.style:''}"><span class="tick-icon">${icon}</span><span class="tick-text">${round?`<small>第 ${round} 季</small>`:''}${h(text)}</span></div>`;
  }).join('');
  const lead=classify(splitLog(g.log[0]||'').text)[0],flash=f.on&&['bad','good','social','econ'].includes(lead);
  return `<div class="ticker ${flash?`flash ${lead}`:''}" style="${flash?f.style:''}"><span class="ticker-label">即時動態</span><div class="ticker-items">${items||'<span class="muted">對局開始</span>'}</div><button class="ticker-all" type="button" data-act="log-open">全部 ${g.logCount} 則</button></div>`;
}
function fillLogDialog(){
  const g=pub?.game;if(!g)return;
  $('#log-title').textContent=g.logCount>g.log.length?`遊戲動態（最近 ${g.log.length} 則，共 ${g.logCount} 則）`:'全部遊戲動態';
  $('#log-all').innerHTML=g.log.map(x=>{const {round,text}=splitLog(x),[cat,icon]=classify(text);return `<div class="log-item ${cat}"><span>${icon}</span><span>${round?`<small>第 ${round} 季</small> `:''}${h(text)}</span></div>`}).join('');
}

// 一格的畫面：data-node 給棋子定位用（主地圖另外保留 data-tile-index）。
function tileHtml(track,i,t,style=''){
  const num=track==='main'?String(i).padStart(2,'0'):track==='highway'?`H${i+1}`:`A${i+1}`,type=t.type||t;
  const tag=t.flipped?'<span class="tile-tag bad">衰退</span>':t.boosted?'<span class="tile-tag good">×1.5</span>':'';
  return `<div class="tile ${type} ${t.flipped?'flipped':''} ${t.boosted?'boosted':''}" data-node="${track}-${i}" ${track==='main'?`data-tile-index="${i}"`:''} ${style}><span class="tile-number">${num}</span><span class="tile-type">${TYPE_LABEL[type]}</span>${tag}<span class="tile-icon">${TYPE_ICON[type]}</span><div class="tile-tokens"></div></div>`;
}
function sideTracks(g){
  return `<div class="side-tracks"><div class="side-track highway"><div class="side-track-label"><b>🛣️ 高速公路</b><small>有車才能走：第 ${g.highway.from} 格交流道 → 第 ${g.highway.to} 格，收費 ${m(g.highway.toll)}</small></div><div class="side-track-tiles">${g.highway.tiles.map((t,i)=>tileHtml('highway',i,{type:t})).join('')}</div></div><div class="side-track abroad"><div class="side-track-label"><b>✈️ 國外</b><small>剛好停在第 ${g.abroad.airport} 格機場可出國，只用一個轉輪</small></div><div class="side-track-tiles">${g.abroad.tiles.map((t,i)=>tileHtml('abroad',i,{type:t})).join('')}</div></div></div>`;
}
// 棋盤中央：依階段顯示天命卡揭曉、應考、暫停、機場、抽到的卡，或拉霸機。
function centerHtml(g,cur,rolling){
  if(pub.status!=='playing')return winnerCard(g);
  const reveal=g.destinyReveal;
  if(g.phase==='destiny'||(g.round===1&&g.phase==='roll'&&reveal&&!g.dice&&Date.now()-(destinyShownAt.get(reveal.seq)||Date.now())<DESTINY_MS)){
    const fresh=reveal&&!destinyShownAt.has(reveal.seq);if(fresh){destinyShownAt.set(reveal.seq,Date.now());setTimeout(render,DESTINY_MS+50)}
    const who=reveal?g.players.find(p=>p.id===reveal.playerId):null;
    const card=reveal&&Date.now()-destinyShownAt.get(reveal.seq)<DESTINY_MS?`<div class="card-scene ${fresh?'card-reveal':''} scope-destiny"><p class="card-hint">${h(who?.name||'')} 抽到的天命卡</p><div class="revealed-card"><span class="revealed-symbol">${reveal.icon}</span><h3>${h(reveal.name)}</h3><p class="revealed-desc">${h(reveal.desc)}</p></div></div>`:'';
    return card||`<div class="center-icon">🎴</div><h3>${h(cur?.name||'')}</h3><p>抽天命卡</p><p class="muted small">${cur?.isBot?'🤖 Bot 自動抽卡':'請在自己的手機上點「抽天命卡」'}</p>`;
  }
  if(g.phase==='exam'&&cur?.training)return `<div class="center-icon">📚</div><h3>${h(cur.name)} 準備應考</h3><p>「${h(cur.training.name)}」：擲骰 ≥ ${cur.training.need} 錄取</p>`;
  if(g.phase==='skip')return `<div class="center-icon">${/出海/.test(g.skipReason)?'🚢':/受訓|準備/.test(g.skipReason)?'📚':/國外/.test(g.skipReason)?'🌍':'🩹'}</div><h3>${h(cur?.name||'')}：${h(g.skipReason||'暫停')}</h3><p>這回合無法移動，本季收支照常結算。</p>`;
  if(g.phase==='choice'&&g.choiceKind==='airport')return `<div class="center-icon">✈️</div><h3>${h(cur.name)} 到了機場</h3><p>正在考慮要不要出國…</p>`;
  if(g.card&&['choice','manage','respond'].includes(g.phase))return cardCard(g,cur);
  if(g.phase==='roll'&&g.exam&&g.exam.ok!==undefined&&!g.dice)return `<div class="center-icon">${g.exam.ok?'🎓':'📄'}</div><h3>應考「${h(g.exam.name)}」</h3><p>擲出 ${g.exam.roll}${g.exam.bonus?`＋${g.exam.bonus}`:''}（需 ≥ ${g.exam.need}）：${g.exam.ok?'錄取！':'沒有通過'}</p>`;
  const reels=g.reels||[0,0],boosted=g.effReels&&g.reels&&g.effReels.some((v,k)=>v!==g.reels[k]);
  return `<div class="center-icon">⌁</div><h3>${h(cur?.name||'')}</h3><p>${h(PHASE_TEXT[g.phase]||'')}</p><div class="slot-machine ${rolling?'is-rolling':''}">${reels.map(v=>`<span class="slot-reel"><span class="slot-strip"><strong class="slot-cell">${rolling?'?':v}</strong></span></span>`).join('')}</div><div class="slot-total">${g.dice===null?(cur?.track==='abroad'?'國外只用第一個轉輪':cur?.car?'有車：1–3 視為 4–6':'等待拉霸'):g.dice===0?'原地停留':`前進 ${g.dice} 格${boosted&&!rolling?`（有車 ${g.effReels.join('+')}）`:''}`}</div><small>經過家鄉抽一張機會卡</small>`;
}
const DESTINY_MS=2600,destinyShownAt=new Map();
function gameScreen(){
  const g=pub.game,cur=g.players.find(p=>p.id===g.currentId),finished=pub.status!=='playing',roles=pub.variant==='roles';
  $('#round-number').textContent=String(g.round).padStart(2,'0');$('#round-limit').textContent=`／${g.maxRounds} 季`;
  const tiles=g.tiles.map((t,i)=>{const [row,col]=boardCoords(i);return tileHtml('main',i,t,`style="grid-row:${row};grid-column:${col}"`)}).join('');
  const rolling=rollFx&&Date.now()-rollFx<REEL_MS;if(rolling)setTimeout(render,REEL_MS+50);
  const center=centerHtml(g,cur,rolling);
  // 新動態提到的玩家，在右側進度列短暫亮起。
  const f=freshStyle(),newText=f.on?g.log.slice(0,fresh.count).join(' '):'';
  const players=g.players.map(p=>{const ping=newText&&newText.includes(p.name);
    const tags=[p.destiny?`<span class="pub-tag" title="${h(p.destiny.name)}：${h(p.destiny.desc)}">${p.destiny.icon} ${h(p.destiny.name)}</span>`:'',p.car?'<span class="pub-tag">🚗 有車</span>':'',p.house?'<span class="pub-tag">🏠 有房</span>':'',p.training?`<span class="pub-tag">📚 受訓：${h(p.training.name)}</span>`:'',...p.publicDebts.map(d=>`<span class="pub-tag debt">${h(d.name)} ${m(d.balance)}</span>`)].filter(Boolean).join('');
    return `<div class="pub-player ${p.id===g.currentId?'current':''} ${p.bankrupt?'bankrupt':''} ${ping?'ping':''}" style="--player-color:${COLORS[p.color]};${ping?f.style:''}"><span class="pawn big" style="--c:${COLORS[p.color]}"><span>${p.icon}</span></span><span class="chip-text"><b>${h(p.name)}${g.winnerIds.includes(p.id)?' 🏆':''}</b><small>${h(p.roleName)} · ${whereText(p)}${p.bankrupt?' · 已破產':p.isBot?` · 🤖 ${h(p.botLabel)}`:p.connected?'':' · 📵 離線'}</small>${tags?`<span class="pub-tags">${tags}</span>`:''}<i class="chip-track"><i style="width:${p.progress}%"></i></i></span><span class="pub-prog">${p.progress}%</span></div>`}).join('');
  const e=g.economy,econPing=f.on&&/季結算|市場事件/.test(newText);
  return `<div class="host-stage">
    ${ticker(g)}
    <div class="host-cols">
      <aside class="host-left">
        <div class="turn-panel panel"><p class="eyebrow">${pub.variantShort} ${h(pub.variantLabel)} · 第 ${g.round}／${g.maxRounds} 季</p>${finished?`<h2 class="turn-name">對局結束</h2>`:`<h2 class="turn-name" style="color:${COLORS[cur.color]}">${cur.icon} ${h(cur.name)}</h2><p class="turn-role">${h(cur.roleName)} · ${h(PHASE_TEXT[g.phase]||'')}</p><p class="turn-meta">${g.respond?`📱 ${h(respondWait(g.respond))}`:cur.isBot?'🤖 Bot 自動操作中':'請在自己的手機上操作'}</p><p id="wait-note" class="wait-note"></p>`}</div>
        <div class="panel mini-panel ${econPing?'ping':''}" style="${econPing?f.style:''}"><div class="panel-title"><h3>本季景氣</h3><span class="pill">AI 央行</span></div>${g.regime!=='normal'?`<div class="econ-banner ${g.regime}"><b>${g.regime==='recession'?'📉 景氣衰退':'📈 景氣過熱'}</b><span>${h(g.regimeText)}</span></div>`:''}<div class="mini-economy">${[['成長率',pct(e.growth)],['通膨',pct(e.inflation)],['失業率',pct(e.unemployment)],['政策利率',pct(e.rate,2)],['車價',m(e.carPrice)],['房價',m(e.housePrice)]].map(([a,b])=>`<div class="mini-stat"><span>${a}</span><strong>${b}</strong></div>`).join('')}</div>${g.decision?`<p class="muted small">上季央行：${h(g.decision.action)}</p>`:''}</div>
        <div class="panel rules-mini"><h3>規則速記</h3><ul><li><b>目標</b>：${roles?'依角色各自的目標（見右側）':h(pub.goalText)}</li><li>⌂ <b>經過家鄉</b>抽一張機會卡；停在家鄉疲勞 ${FATIGUE.restStop}</li><li>🚗 <b>有車</b>：轉輪 1–3 視為 4–6，可走高速公路</li><li>✈ <b>剛好停在機場</b>可買機票出國</li>${roles?'':'<li>💼 機會牌堆裡有<b>工作卡</b>，可應徵換工作</li>'}<li><b>加班</b> 收入 +${OVERTIME[1].income}%、疲勞 +${FATIGUE.overtime1}；疲勞 ≥ ${FATIGUE.burnout} 收入 ${FATIGUE.burnoutIncome}%</li></ul></div>
      </aside>
      <section class="host-board panel"><div class="panel-title"><div><p class="eyebrow">BOARD / 棋盤</p><h2>人生版圖</h2></div><div class="legend"><span><i class="dot fortune"></i>好運</span><span><i class="dot market"></i>市場</span><span><i class="dot chance"></i>機會</span><span><i class="dot loss"></i>災難</span><span><i class="dot airport"></i>機場</span></div></div><div class="board" id="board">${tiles}<div class="board-center">${center}</div></div>${sideTracks(g)}</section>
      <aside class="host-right">
        <div class="panel"><div class="panel-title"><h3>玩家目標進度</h3><span class="pill">公開資訊</span></div><div class="pub-players">${players}</div><p class="muted small">天命卡、工作／角色、車子與學貸、車貸是明牌；現金與其他負債只顯示在各自的手機上。</p></div>
      </aside>
    </div></div>`;
}
function cardCard(g,cur){
  const c=g.card,thinking=g.phase==='choice',key=c.seq?`seq-${c.seq}`:`${g.round}-${g.turnIndex}-${c.id}`,fresh=key!==shownCardKey;shownCardKey=key;
  const scope=c.isJob?'job':c.type,label=c.isJob?'工作卡':TYPE_LABEL[c.type];
  // 只有新卡第一次出現時才播翻牌動畫，避免每次更新都重播。
  return `<div class="card-scene ${fresh?'card-reveal':''} scope-${scope}"><p class="card-hint">${label} · ${c.id}${c.note?` · ${h(c.note)}`:''}</p><div class="revealed-card"><span class="revealed-symbol">${c.isJob?c.icon:TYPE_ICON[c.type]}</span><h3>${h(c.name)}</h3><p class="revealed-desc">${h(c.desc)}</p>${c.isJob?`<p class="revealed-desc">每季薪水 ${m(c.salary)} · 條件：${h(c.cond)}</p>`:''}${g.phase==='respond'?`<p class="result-line">${h(respondWait(g.respond))}</p>`:thinking?`<p class="result-line">${h(cur.name)} 正在考慮…</p>`:g.result?.text?`${g.result.option?`<p class="revealed-desc">選擇「${h(g.result.option)}」</p>`:''}<p class="result-line">${h(g.result.text)}</p>`:''}</div></div>`;
}
function winnerCard(g){
  const winners=g.players.filter(p=>g.winnerIds.includes(p.id));
  return `<div class="center-icon">🏆</div><h3>${h(winners.map(w=>w.name).join('、')||'無人')} 獲勝</h3><p>${h(WIN_TEXT[g.winReason]||'')}</p><button class="primary" type="button" data-act="lobby">回到大廳，再玩一局</button>`;
}

// 開局設定（企業版另外加上淨資產目標）。
function startOptions(){return {maxRounds:Number($('#max-rounds').value)}}
function hostDo(fn){try{fn();publish()}catch(e){toast(e.message)}}
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-act]');if(!b)return;
  const act=b.dataset.act;
  if(act==='create'){Sound.unlock();Sound.startMusic();return createRoom(b.dataset.variant||'jobs')}
  if(act==='log-open'){fillLogDialog();$('#log-dialog').showModal();return}
  if(act==='log-close')return $('#log-dialog').close();
  if(!room)return;
  if(act==='add-bot')return hostDo(()=>room.addBot({roleId:$('#bot-role')?.value,level:$('#bot-level').value}));
  if(act==='remove')return hostDo(()=>{
    const seat=room.seats.find(s=>s.seatId===b.dataset.seat);
    for(const [id,l] of links)if(seat&&l.token===seat.token){send(l.conn,{kind:'removed',reason:'主持人把你移出房間了。'});links.delete(id)}
    room.removeSeat(b.dataset.seat);
  });
  if(act==='start')return hostDo(()=>room.start(startOptions()));
  if(act==='lobby')return hostDo(()=>{clearTimeout(botTimer);botTimer=null;room.backToLobby()});
});
$('#log-dialog').addEventListener('click',e=>{if(e.target.id==='log-dialog')e.target.close()});   // 點背景關閉
$('#lobby-btn').addEventListener('click',()=>{if(pub?.status==='playing'&&!confirmTwice('再按一次確認回到大廳；目前對局會結束。'))return;hostDo(()=>{clearTimeout(botTimer);botTimer=null;room.backToLobby()})});
$('#close-btn').addEventListener('click',()=>{if(!confirmTwice('再按一次確認關閉房間；所有玩家會離開。'))return;closeRoom()});
let armed=0;function confirmTwice(msg){if(Date.now()<armed){armed=0;return true}armed=Date.now()+4000;toast(msg);return false}

// 聲音：第一次點畫面就開啟；右上角「聲音」可以分別開關音效、背景音樂並各自調音量。
Sound.autoUnlock();Sound.mountControls($('#snd-ctrl'));
const unlockUi=()=>{$('#sound-unlock').hidden=Sound.running()||!(Sound.pref.sfx||Sound.pref.music)};
$('#sound-unlock').addEventListener('click',()=>{Sound.unlock();Sound.startMusic()});
Sound.onChange(unlockUi);unlockUi();

// 啟動：有存檔就還原房間（大螢幕重新整理不會遺失對局），否則顯示建立房間畫面。
// 等所有 script 載入後才啟動，讓企業版的畫面檔可以覆蓋 gameScreen 等函式。
document.addEventListener('DOMContentLoaded',function boot(){
  const saved=storeGet(SAVE_KEY);
  if(saved){try{room=Room.fromJSON(saved);setHostInfo();openRoom({fresh:false});publish();return}catch(e){storeSet(SAVE_KEY,null)}}
  setConn('','尚未建立房間');render();
});
