// 企業版大螢幕的畫面：覆蓋 host.js 裡個人版的 startScreen、lobbyScreen、gameScreen 等函式。
// 連線、存檔、Bot 排程、音效、動態列與棋子走路都沿用 host.js。
'use strict';
const ENT_PHASE={roll:'準備拉霸',adjust:'選擇 AEO 調整步數',strike:'停工中',draw:'準備抽卡',choice:'正在決定事件',manage:'經營中',finished:'對局結束'};
const ENT_TILE_ICON={global:'◎',personal:'◇',sector:'▦',start:'↗'};
const ENT_WIN={goal:'淨資產達標',progress:'季數用完，淨資產最高',bankruptcy:'有企業破產，對局提前結束'};
const num=n=>n===null||n===undefined?'—':Math.round(n).toLocaleString('zh-TW');
const pctOr=(n,d=1)=>n===null||n===undefined?'—':`${Number(n).toFixed(d)}%`;

function startOptions(){return {maxRounds:Number($('#max-rounds').value),targetWealth:Number($('#target-wealth').value)}}
function startScreen(){
  return `<section class="host-start"><p class="eyebrow">連線版 · 大螢幕</p><h1>建立企業版房間，<br><em>大家用手機經營公司。</em></h1><p class="lead">這台電腦當大螢幕，顯示棋盤、事件與聯準會決策；每位玩家用手機掃 QR 加入、選一家企業，公司的現金、負債和損益只會出現在自己的手機上。</p><div class="mode-pick"><button class="primary big" type="button" data-act="create">建立企業版房間 →</button><a class="secondary" href="./host.html">改開個人版房間</a></div><p class="muted">這台電腦的瀏覽器就是房主：遊戲規則在這裡執行，請在對局結束前保持這個分頁開著。重新整理不會遺失對局。</p></section>`;
}
function lobbyScreen(){
  const taken=new Set(pub.seats.map(s=>s.roleId));
  const seats=pub.seats.map(s=>{const r=pub.roles.find(x=>x.id===s.roleId);return `<li class="seat-row"><span class="seat-icon">${r.icon}</span><span class="seat-name"><b>${h(s.name)}</b><small>${h(r.name)} · ${h(r.title)}</small></span><span class="seat-tag ${s.isBot?'bot':s.connected?'on':'off'}">${s.isBot?h(s.botLabel):s.connected?'已連線':'離線'}</span><button class="remove-player" type="button" data-act="remove" data-seat="${s.seatId}" aria-label="移除 ${h(s.name)}">×</button></li>`}).join('');
  const roleOpts=pub.roles.filter(r=>!taken.has(r.id)).map(r=>`<option value="${r.id}">${r.icon} ${h(r.name)}</option>`).join('');
  const levelOpts=pub.botLevels.map(l=>`<option value="${l.id}" ${l.id==='mid'?'selected':''}>Bot·${l.label}</option>`).join('');
  const full=pub.seats.length>=8||!roleOpts;
  return `<section class="lobby">
    <div class="lobby-join panel"><p class="eyebrow">掃描加入</p><div class="qr">${host.qr}</div><p class="room-code">${host.code}</p><p class="join-url">${h(host.joinUrl)}</p>${linkReachable()?'<p class="muted">用手機掃 QR，或打開網址輸入房號。手機不需要和這台電腦連同一個 Wi-Fi。</p>':'<p class="warn-note">目前是用本機檔案或 localhost 開啟，手機打不開這個網址。請把專案放到 GitHub Pages（或其他網站）後，從網址開啟這個頁面。</p>'}</div>
    <div class="lobby-seats panel"><div class="section-heading"><div><p class="eyebrow">LOBBY</p><h2>玩家（${pub.seats.length}／8）</h2></div><span class="step-pill">至少 2 人 · 企業不能重複</span></div>
      <ul class="seat-list">${seats||'<li class="muted">等待玩家掃碼加入…</li>'}</ul>
      <div class="bot-add"><select id="bot-role" aria-label="Bot 企業">${roleOpts}</select><select id="bot-level" aria-label="Bot 難度">${levelOpts}</select><button class="secondary" type="button" data-act="add-bot" ${full?'disabled':''}>＋ 加入 Bot</button></div>
      <div class="setup-options"><label>最多季數<input id="max-rounds" type="number" min="4" max="30" value="${pub.maxRounds}"></label><label>淨資產目標<input id="target-wealth" type="number" min="2000" step="500" value="${pub.targetWealth}"></label></div>
      <button class="primary big" type="button" data-act="start" ${pub.seats.length<2?'disabled':''}>開始遊戲 <span>→</span></button></div>
  </section>`;
}
function cardCard(g,cur){
  const c=g.card,key=`${g.round}-${g.turnIndex}-${c.id}`,fresh=key!==shownCardKey;shownCardKey=key;
  const target=c.scope==='global'?'所有適用企業':c.scope==='sector'?`${c.sector}所有企業`:`只影響 ${cur?.name||''}`;
  return `<div class="card-scene ${fresh?'card-reveal':''} scope-${c.scope}"><p class="card-hint">${h(c.scopeLabel)} · ${c.id}</p><div class="revealed-card"><span class="revealed-symbol">✦</span><h3>${h(c.name)}</h3><p>影響 ${h(target)} · 持續 ${c.duration} 季</p>${c.fallback?`<p class="revealed-desc">${h(c.fallback)}，這格改抽個人事件。</p>`:''}${c.desc?`<p class="revealed-desc">${h(c.desc)}</p>`:''}<div class="revealed-effects">${c.effects.map(x=>`<span class="effect-chip">${h(x)}</span>`).join('')}</div>${g.phase==='choice'?`<p class="result-line">${h(cur.name)} 正在手機上做決定…</p>`:''}</div></div>`;
}
function winnerCard(g){
  const winners=g.players.filter(p=>g.winnerIds.includes(p.id));
  return `<div class="center-icon">🏆</div><h3>${h(winners.map(w=>w.name).join('、')||'無人')} 獲勝</h3><p>${h(ENT_WIN[g.winReason]||'')}</p><button class="primary" type="button" data-act="lobby">回到大廳，再玩一局</button>`;
}
function strikeCard(g,cur){
  const ransom=g.strikeCause==='ransomware';
  return `<div class="strike-scene"><span class="strike-siren">${ransom?'資安事件':'罷工警報'} · 第 ${g.round} 季</span><span class="strike-ghost" aria-hidden="true">${ransom?'🔒':'👻'}</span><h3>${h(cur.name)}${ransom?' 系統停擺':' 全面停工'}</h3><p>本季收入歸零、支出照付，這回合不能抽卡與經營。</p></div>`;
}
function gameScreen(){
  const g=pub.game,cur=g.players.find(p=>p.id===g.currentId),finished=pub.status!=='playing';
  $('#round-number').textContent=String(g.round).padStart(2,'0');$('#round-limit').textContent=`／${g.maxRounds} 季`;
  const tiles=g.tiles.map((t,i)=>{
    const [row,col]=boardCoords(i),ghost=g.ghostPosition===i;
    return `<div class="tile ${t.type} ${ghost?'ghost-tile':''}" data-tile-index="${i}" style="grid-row:${row};grid-column:${col}"><span class="tile-number">${String(i).padStart(2,'0')}</span><span class="tile-type">${h({global:'全球',personal:'個人'}[t.type]||t.label)}</span><span class="tile-icon">${ENT_TILE_ICON[t.type]}</span>${ghost?'<span class="ghost-mark" title="罷工幽靈">👻</span>':''}<div class="tile-tokens"></div></div>`;
  }).join('');
  const rolling=rollFx&&Date.now()-rollFx<REEL_MS;if(rolling)setTimeout(render,REEL_MS+50);
  const reels=g.reels||[0,0],d=g.fed.decision;
  const fedNews=!finished&&g.phase==='roll'&&g.turnIndex===0&&d&&d.round===g.round-1;
  const center=finished?winnerCard(g)
    :g.phase==='strike'?strikeCard(g,cur)
    :g.card&&['choice','manage'].includes(g.phase)?cardCard(g,cur)
    :`<div class="center-icon">${fedNews?'🏛️':'⌁'}</div><h3>${fedNews?`聯準會：${h(d.action)}`:h(cur?.name||'')}</h3><p>${fedNews?`第 ${g.round} 季生效 · 政策利率 ${pctOr(g.fed.rate,2)}`:h(ENT_PHASE[g.phase]||'')}</p><div class="slot-machine ${rolling?'is-rolling':''}">${reels.map(v=>`<span class="slot-reel"><span class="slot-strip"><strong class="slot-cell">${rolling?'?':v}</strong></span></span>`).join('')}</div><div class="slot-total">${g.phase==='adjust'?`拉出 ${g.dice}，等 ${h(cur.name)} 選擇 ±1 格`:g.dice===null?'等待拉霸':g.dice===0?'原地停留':`前進 ${g.dice} 格`}</div>`;
  const f=freshStyle(),newText=f.on?g.log.slice(0,fresh.count).join(' '):'';
  const players=g.players.map(p=>{
    const ping=newText&&newText.includes(p.name);
    const tags=[p.shield?'🛡 協約':'',p.aeo?`AEO ${p.aeo}`:'',p.stall?'🔒 下回合停擺':'',p.struck?'👻 本季停工':''].filter(Boolean).join(' · ');
    return `<div class="pub-player ${p.id===g.currentId?'current':''} ${ping?'ping':''}" style="--player-color:${COLORS[p.color]};${ping?f.style:''}"><span class="pawn big" style="--c:${COLORS[p.color]}"><span>${p.icon}</span></span><span class="chip-text"><b>${h(p.name)}${g.winnerIds.includes(p.id)?' 🏆':''}</b><small>${h(p.roleName)} · 第 ${p.position} 格${p.isBot?` · 🤖 ${h(p.botLabel)}`:p.connected?'':' · 📵 離線'}${tags?` · ${tags}`:''}</small><i class="chip-track"><i style="width:${p.progress}%"></i></i></span><span class="pub-prog">${p.progress}%</span></div>`;
  }).join('');
  const fed=g.fed,fedPing=f.on&&/季結算|聯準會/.test(newText);
  const events=g.events.map(a=>`<li><span class="dot ${a.scope}"></span><b>${h(a.name)}</b><small>${a.scope==='sector'?h(a.sector)+' · ':''}剩 ${a.left} 季</small></li>`).join('');
  return `<div class="host-stage">
    ${ticker(g)}
    <div class="host-cols">
      <aside class="host-left">
        <div class="turn-panel panel"><p class="eyebrow">對局狀態 · 第 ${g.round}／${g.maxRounds} 季</p>${finished?`<h2 class="turn-name">對局結束</h2>`:`<h2 class="turn-name" style="color:${COLORS[cur.color]}">${cur.icon} ${h(cur.name)}</h2><p class="turn-role">${h(cur.roleName)} · ${h(ENT_PHASE[g.phase]||'')}</p><p class="turn-meta">${cur.isBot?'🤖 Bot 自動操作中':'請在自己的手機上操作'}</p><p id="wait-note" class="wait-note"></p>`}</div>
        <div class="panel mini-panel ${fedPing?'ping':''}" style="${fedPing?f.style:''}"><div class="panel-title"><h3>總體經濟</h3><span class="pill">AI 聯準會</span></div><div class="mini-economy">${[['政策利率',pctOr(fed.rate,2)],['預估通膨',pctOr(fed.inflation,2)],['失業率',pctOr(fed.unemployment,2)],['營收成長',pctOr(fed.growth)],['股價指數',num(fed.stock)],['貨幣政策',fed.program||'無']].map(([a,b])=>`<div class="mini-stat"><span>${a}</span><strong>${b}</strong></div>`).join('')}</div>${d?`<p class="muted small">第 ${d.round} 季決策：${h(d.action)}</p>`:'<p class="muted small">第一季結算後聯準會才會做決定。</p>'}</div>
        <div class="panel ent-events"><h3>進行中的全球／產業事件</h3>${events?`<ul>${events}</ul>`:'<p class="muted small">目前沒有。</p>'}</div>
      </aside>
      <section class="host-board panel"><div class="panel-title"><div><p class="eyebrow">BOARD / 棋盤</p><h2>經濟版圖</h2></div><div class="legend"><span><i class="dot global"></i>全球</span><span><i class="dot personal"></i>個人</span><span><i class="dot sector"></i>產業</span><span>👻 罷工</span></div></div><div class="board" id="board">${tiles}<div class="board-center">${center}</div></div></section>
      <aside class="host-right">
        <div class="panel"><div class="panel-title"><h3>淨資產目標進度</h3><span class="pill">目標 ${num(g.targetWealth)}</span></div><div class="pub-players">${players}</div><p class="muted small">現金、負債與損益只顯示在各公司自己的手機上；這裡只顯示離目標還有多遠。</p></div>
      </aside>
    </div></div>`;
}
