import {TIERS,ROLES,START,GOAL,BASE_JOB,JOBS,DESTINIES,BOARD,HIGHWAY,ABROAD,CAR,FORTUNE_CARDS,MARKET_EVENTS,CHANCE_CARDS,LOSS_CARDS,ABROAD_CARDS,CENTRAL_BANK_RULES,INSURANCE,FATIGUE,OVERTIME,ECON_TILES} from './data.js';
import {VARIANTS,createGame,drawDestiny,rollDice,drawEvent,resolveChoice,takeExam,endTurn,setOvertime,setHighway,repayDebt,borrow,buyCar,carOffer,buyHouse,canBuyHouse,housePlan,computeQuarter,totalDebt,netWorth,debtRate,creditLimit,creditUsed,goalProgress,goalText,chanceOptions,cardById,isJobCard,jobOf,jobById,roleById,destinyById,tierById,tileAt,nodeKey,tileLabel,ticketPrice,jobConditionText,examTarget,val,exportGame,importGame,economyRegime,respond,responder,respondOptions,quarterlyPayments} from './engine.js';
import {syncInfo,isNewerGame} from './sync.js';
import {BOT_LEVELS,LOW_STYLES,makeBot,botLabel,botChoice,botRespond,botManageStep} from './bot.js';
import {createIsoBoard,TABLE_SLOTS} from './iso.js';

// 同一份程式有兩種玩法：?v=jobs（A 工作卡版，預設）與 ?v=roles（B 角色版），兩種對局分開儲存。
const VARIANT=new URLSearchParams(location.search).get('v')==='roles'?'roles':'jobs';
const IS_ROLES=VARIANT==='roles';
const $=s=>document.querySelector(s),h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n).toLocaleString('zh-TW',{maximumFractionDigits:Math.abs(n)<10?2:1});
const m=n=>`${fmt(n)} 萬`,signed=n=>`${n>=0?'+':'−'}${fmt(Math.abs(n))} 萬`,pct=(n,d=1)=>`${Number(n).toFixed(d)}%`;
const colors=['#0f9688','#5979b0','#ce9460','#aa6b91','#c55d5d','#7e9541','#348da5','#7a60ad'];
const TYPE_LABEL={home:'家鄉',fortune:'好運',market:'市場',chance:'機會',loss:'災難',airport:'機場',ramp:'交流道',toll:'收費站',arrival:'入境',abroad:'國外',return:'回國',job:'工作',destiny:'天命'};
const typeLabel=TYPE_LABEL;
const typeIcon={fortune:'✦',market:'◎',chance:'?',loss:'⚠',home:'⌂',airport:'✈',ramp:'⇢',toll:'¤',arrival:'⇣',abroad:'◍',return:'⇡',job:'💼'};
const tierName=id=>tierById(id)?.name||id;
const storageKey=`life-board-v4-${VARIANT}`,viewKey=`life-board-view-v4-${VARIANT}`;
const tabId=globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`;
let channel=null;try{if('BroadcastChannel' in globalThis)channel=new BroadcastChannel(storageKey)}catch{}
let openPlayerId=null,state=null,page=location.hash==='#setup'?'game':'home',tab='business',toastTimer,resetAt=0,animation=null,animationSerial=0,dismissedCardKey=null,dismissedDestinyKey=null,resetArmedUntil=0;
let setupPlayers=[{name:'玩家 1',roleId:'low',control:'human'},{name:'Bot 1',roleId:'office',control:'mid'},{name:'Bot 2',roleId:'exec',control:'high'},{name:'Bot 3',roleId:'free',control:'low'}];
const BOT_SPEEDS={slow:{label:'慢',ms:1500},normal:{label:'正常',ms:800},fast:{label:'快',ms:250}};
// 翻開的卡至少停留這麼久，讓人看得清楚抽到什麼（Bot 速度設成「快」也一樣）。
const READ_MS=2500;
let botTimer=null,botPaused=false,botSpeed='normal',botMemo={key:null,memo:{}};
try{const v=JSON.parse(localStorage.getItem('life-board-bot'));if(BOT_SPEEDS[v?.speed])botSpeed=v.speed}catch{}
const MOVE_TOTAL_MS=2400,stepMsFor=n=>Math.max(150,Math.min(600,MOVE_TOTAL_MS/Math.max(1,n)));
try{const v=JSON.parse(sessionStorage.getItem(viewKey));if(['business','events','economy','history'].includes(v?.tab))tab=v.tab}catch{}
const rememberView=()=>{try{sessionStorage.setItem(viewKey,JSON.stringify({tab}))}catch{}};

/* ---------- 儲存與多頁籤同步（沿用模板） ---------- */
function notify(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3200)}
const newGameId=()=>globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`;
function prepareNewSession(g){const prev=syncInfo(state);g.sync={gameId:newGameId(),revision:0,updatedAt:Math.max(Date.now(),(prev?.updatedAt||0)+1,resetAt+1),writerId:tabId}}
function readStored(){try{const raw=localStorage.getItem(storageKey);const g=raw?importGame(raw):null;return g&&g.variant!==VARIANT?null:g}catch{return undefined}}
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
  const prev=state,same=prev&&syncInfo(prev).gameId===syncInfo(incoming).gameId&&prev.round===incoming.round&&prev.turnIndex===incoming.turnIndex&&prev.phase==='roll'&&incoming.phase!=='roll'&&Number.isInteger(incoming.dice)&&incoming.lastMove;
  cancelAnimation();state=incoming;render();$('#save-status').textContent='已從其他頁籤同步';
  if(same)beginRollAnimation({playerId:incoming.lastMove.playerId,from:incoming.lastMove.from,path:incoming.lastMove.path,dice:incoming.dice,reels:incoming.reels});
  return true;
}
function ensureFresh(){const stored=readStored();if(stored===null&&state){cancelAnimation();state=null;render();notify('其他頁籤已開始新遊戲。');return false}if(stored&&isNewerGame(stored,state)){adoptShared(stored);notify('對局已由其他頁籤更新，請確認後再操作。');return false}return true}
async function withLock(work){if(globalThis.navigator?.locks?.request)return navigator.locks.request(`${storageKey}-write`,{mode:'exclusive'},work);return work()}
async function run(fn){if(animation)return;try{await withLock(()=>{if(!ensureFresh())return;fn();save();render()})}catch(e){notify(e.message||'操作失敗')}}

/* ---------- 首頁與設定 ---------- */
function jobFacts(j){return `每季 +${m(j.salary)} · 生活費 −${m(j.living)} · ${h(tierName(j.tier))}`}
const HOME_COPY={
  jobs:{title:'相同的起點，<br><em>不同的人生。</em>',lead:`2–8 位玩家輪流玩，大家都從基本工作和一筆學貸開始。抽天命卡、找工作、買車、出國，最先累積到 ${GOAL.netWorth} 萬淨資產的人獲勝。`,
    steps:[['相同起點，抽天命卡','所有人都是基本工作、相同存款和一張明牌學貸。開局各抽一張天命卡，例如富爸爸、學習天才、車迷。'],['拉霸，走棋盤','兩個轉輪各停在 0–6，相加就是前進格數。每次經過家鄉多抽一張機會卡，走得越快抽得越多。'],['機會卡裡有工作卡','醫生、機師要受訓應考；也有高薪但有副作用的工作。另有合作、搶案子這類要別人回覆的互動卡。'],['買車、上高速公路、出國','有車的人轉輪 1–3 視為 4–6，還能走高速公路捷徑。剛好停在機場可以買機票出國，國外好處多但也有陷阱。'],['每季結算，AI 央行調利率','所有人行動完就結算一季。景氣衰退時部分市場格變成災難格，過熱時好運獎金變多。']],
    rolesTitle:['起點與卡牌','共同起點、天命卡與工作卡'],setup:['同一個起點，<br><em>開始你的人生。</em>',`所有人都從基本工作與學貸開始，開局輪流抽一張天命卡。最先累積到 ${GOAL.netWorth} 萬淨資產的人獲勝。`],helper:'淨資產＝現金＋投資＋車子殘值－負債。季數用完時淨資產最高者獲勝。'},
  roles:{title:'不同的起點，<br><em>各自的人生目標。</em>',lead:'2–8 位玩家輪流玩，每人扮演一種收入狀態的人。抽天命卡、走棋盤、碰運氣、做選擇，在景氣起伏中達成自己角色的目標。',
    steps:[['選角色，再抽天命卡','底層、上班族、公司高管、自由業，各有收入、負債和勝利目標。開局每人再抽一張天命卡。'],['拉霸，走棋盤','兩個轉輪各停在 0–6，相加就是前進格數。每次經過家鄉多抽一張機會卡。'],['四種格子與互動卡','好運、市場、機會、災難；機會卡裡有合作、搶案子，要被指定的人回覆。'],['買車、上高速公路、出國','有車的人轉輪 1–3 視為 4–6，還能走高速公路。上班族全額買車就是達成目標。'],['每季結算，AI 央行調利率','先達成自己角色目標的人獲勝；季數用完時比目標進度。']],
    rolesTitle:['選擇你的角色','四種收入，四種目標'],setup:['選好角色，<br><em>開始你的人生。</em>','角色可以重複，開局再抽天命卡。每種角色的勝利目標不同：還清負債存到 50 萬、買車、買房，或是連續五季月入六萬。'],helper:'先達成自己目標的玩家獲勝；季數用完時比較目標進度。'}
}[VARIANT];
function renderStaticCopy(){
  document.title=`人生棋局 · ${VARIANTS[VARIANT].label}`;
  $('#home-title').innerHTML=HOME_COPY.title;$('#home-lead').textContent=HOME_COPY.lead;
  $('#home-guide').innerHTML=HOME_COPY.steps.map(([t,d],i)=>`<div class="home-step"><span>${String(i+1).padStart(2,'0')}</span><div><h2>${h(t)}</h2><p>${h(d)}</p></div></div>`).join('');
  $('#home-roles-eyebrow').textContent=HOME_COPY.rolesTitle[0];$('#home-roles-title').textContent=HOME_COPY.rolesTitle[1];
  $('#setup-title').innerHTML=HOME_COPY.setup[0];$('#setup-lead').textContent=HOME_COPY.setup[1];$('#setup-helper').textContent=HOME_COPY.helper;
  $('#brand-variant').textContent=`${VARIANTS[VARIANT].short} · ${VARIANTS[VARIANT].label}`;
  document.querySelectorAll('[data-variant-link]').forEach(a=>{const on=a.dataset.variantLink===VARIANT;a.classList.toggle('on',on);if(on)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')});
}
function renderHomeRoles(){
  const destinies=`<article class="home-role"><div class="home-role-title"><span class="home-role-icon" aria-hidden="true">🔮</span><div><span class="home-role-sector">開局每人抽一張 · 明牌</span><h3>天命卡</h3></div></div><ul class="trait-list deck-list">${DESTINIES.map(d=>`<li><b>${d.icon} ${h(d.name)}</b>${h(d.desc)}</li>`).join('')}</ul></article>`;
  if(IS_ROLES){
    $('#home-roles').innerHTML=ROLES.map(r=>{
      const debts=r.debts.map(d=>`<div><dt>${h(d.name)}${d.public?' · 明牌':''}</dt><dd>${m(d.balance)} · 年息 ${d.variable?'浮動 ':''}${d.rate}%</dd></div>`).join('');
      return `<article class="home-role"><div class="home-role-title"><span class="home-role-icon" aria-hidden="true">${r.icon}</span><div><span class="home-role-sector">${h(r.title)}</span><h3>${h(r.name)}</h3></div></div><p class="home-role-story">${h(r.story)}</p><p class="home-role-goal"><b>勝利目標</b>${h(r.goal.text)}</p><div class="home-role-totals"><div><span>${r.incomeType==='freelance'?'平均季收入':'季收入'}</span><strong>+${m(r.salary)}</strong></div><div><span>季生活費</span><strong>−${m(r.living)}</strong></div><div><span>起始存款</span><strong>${m(r.cash)}</strong></div></div><div class="home-role-flows"><div><h4>起始負債</h4><dl>${debts}</dl></div><div><h4>角色特性</h4><ul class="trait-list">${r.traits.map(t=>`<li>${h(t)}</li>`).join('')}</ul></div></div></article>`;
    }).join('')+destinies;
    return;
  }
  const start=`<article class="home-role"><div class="home-role-title"><span class="home-role-icon" aria-hidden="true">${BASE_JOB.icon}</span><div><span class="home-role-sector">所有人都一樣</span><h3>共同起點</h3></div></div><p class="home-role-story">每個人都從「基本工作」開始，手上一張學貸（明牌，大家都看得到）。開局各抽一張天命卡，之後靠工作卡、買車、出國和理財決定拉開差距。</p><p class="home-role-goal"><b>勝利目標</b>${h(GOAL.text)}（現金＋投資＋車子殘值－負債）</p><div class="home-role-totals"><div><span>季收入</span><strong>+${m(BASE_JOB.salary)}</strong></div><div><span>季生活費</span><strong>−${m(BASE_JOB.living)}</strong></div><div><span>起始存款</span><strong>${m(START.cash)}</strong></div></div><div class="home-role-flows"><div><h4>起始負債（明牌）</h4><dl>${START.debts.map(d=>`<div><dt>${h(d.name)}</dt><dd>${m(d.balance)} · 年息 ${d.rate}%</dd></div>`).join('')}</dl></div><div><h4>地圖</h4><ul class="trait-list"><li>經過家鄉抽一張機會卡</li><li>有車：轉輪 1–3 視為 4–6，可走高速公路</li><li>剛好停在機場可以飛去國外</li></ul></div></div></article>`;
  const jobs=`<article class="home-role"><div class="home-role-title"><span class="home-role-icon" aria-hidden="true">💼</span><div><span class="home-role-sector">混在機會卡牌堆中</span><h3>工作卡</h3></div></div><ul class="trait-list deck-list">${JOBS.map(j=>`<li><b>${j.icon} ${h(j.name)}</b>${jobFacts(j)}<br><small>${h(jobConditionText(j))}。${h(j.desc)}</small></li>`).join('')}</ul></article>`;
  $('#home-roles').innerHTML=start+destinies+jobs;
}
function renderSetup(){
  $('#setup-players').innerHTML=setupPlayers.map((p,i)=>`<div class="setup-player ${IS_ROLES?'':'no-role'}"><span class="player-numeral">${i+1}</span><input data-setup-name="${i}" aria-label="玩家 ${i+1} 名稱" maxlength="16" value="${h(p.name)}">${IS_ROLES?`<select data-setup-role="${i}" aria-label="玩家 ${i+1} 角色">${ROLES.map(r=>`<option value="${r.id}" ${r.id===p.roleId?'selected':''}>${r.icon} ${h(r.name)}</option>`).join('')}</select>`:''}<select data-setup-control="${i}" aria-label="玩家 ${i+1} 操作者"><option value="human" ${p.control==='human'?'selected':''}>👤 人類</option>${Object.entries(BOT_LEVELS).map(([k,v])=>`<option value="${k}" ${p.control===k?'selected':''} title="${h(v.desc)}">🤖 Bot·${v.label}</option>`).join('')}</select><button class="remove-player" data-remove-player="${i}" type="button" aria-label="移除玩家 ${i+1}" ${setupPlayers.length<=2?'disabled':''}>×</button></div>`).join('');
  $('#add-player').disabled=setupPlayers.length>=8;
}

/* ---------- 棋盤 ---------- */
const currentPlayer=()=>state?.players[state.turnIndex];
// 現在該誰動作：平常是輪到的玩家；被邀請合作或被搶案子時是要回覆的人。
const actorPlayer=()=>state?.phase==='respond'?responder(state):currentPlayer();
const playerKey=p=>nodeKey({t:p.track,i:p.position});
// 剛翻開、還沒按「繼續」的卡（抽卡階段也會先顯示上一張的結果）。
function drawnCard(){
  if(!['manage','draw'].includes(state.phase)||!state.lastDraw||state.lastDraw.type==='chance'&&!state.lastResult)return null;
  const key=`${state.sync?.gameId||'local'}:${state.round}:${state.turnIndex}:${state.lastDraw.seq}`;
  return key===dismissedCardKey?null:{key,draw:state.lastDraw,card:cardById(state.lastDraw.cardId)};
}
// 剛抽到、還沒消失的天命卡。只在開局階段顯示。
function destinyReveal(){
  const d=state?.lastDestiny;if(!d)return null;
  const early=state.phase==='destiny'||(state.round===1&&state.phase==='roll'&&state.turnIndex===0&&state.dice===null);
  const key=`${state.sync?.gameId||'local'}:destiny:${d.seq}`;
  if(!early||key===dismissedDestinyKey)return null;
  return {key,drawer:state.players.find(p=>p.id===d.playerId),card:destinyById(d.destinyId)};
}
function marketEffectText(e){
  const parts=[];
  const mac=e.macro||{},names={growth:'成長',inflation:'通膨',unemployment:'失業',stock:'股市'};
  for(const [k,v] of Object.entries(mac))if(v)parts.push(`${names[k]} ${v>0?'+':''}${v}${k==='stock'?'%':' 個百分點'}`);
  if(e.rateShock)parts.push(`利率 +${e.rateShock}`);
  if(e.prices?.house)parts.push(`房價 ${e.prices.house>0?'+':''}${e.prices.house}%`);
  if(e.prices?.car)parts.push(`車價 ${e.prices.car>0?'+':''}${e.prices.car}%`);
  const groups=IS_ROLES?ROLES.map(r=>({id:r.id,name:r.name})):TIERS;
  for(const r of groups){const x=e.roles?.[r.id],perm=e.permanent?.[r.id];const bits=[];if(x?.income)bits.push(`收入 ${x.income>0?'+':''}${x.income}%`);if(x?.living)bits.push(`生活費 +${x.living}%`);if(perm?.salary)bits.push(`薪資永久 +${perm.salary}%`);if(val(e.cash,r.id))bits.push(`現金 +${m(val(e.cash,r.id))}`);if(bits.length)parts.push(`${r.name}：${bits.join('、')}`)}
  return parts;
}
function cardScene(type,inner,extra=''){return `<div class="card-scene card-reveal scope-${type}" role="status">${inner}${extra}</div>`}
function choiceButtons(p,opts){return `<div class="choice-row">${opts.map(o=>`<button class="card-continue ${o.stake||o.key==='take'||o.key==='fly'||o.kind?'':'ghost'}" type="button" data-action="choose" data-value="${o.index}" ${o.affordable&&!p.bot?'':'disabled'} title="${h(o.outcomes.map(x=>`${Math.round(x.p*100)}%：${x.text}`).join('\n'))}">${h(o.label)}${o.affordable?'':`（${h(o.reason||'現金不足')}）`}</button>`).join('')}</div>`}
function centerContent(){
  const p=currentPlayer();
  if(animation)return null;
  if(state.status!=='playing')return null;
  const dz=destinyReveal();
  if(dz){
    const {drawer,card}=dz;
    return cardScene('destiny',`<p class="card-hint">天命卡 · ${h(drawer.name)} 抽到了</p><button type="button" class="revealed-card destiny-card card-skip" data-action="dismiss-destiny" aria-label="繼續"><span class="revealed-symbol big">${card.icon}</span><h3>${h(card.name)}</h3><span class="revealed-desc">${h(card.desc)}</span><span class="result-line">明牌：所有人都看得到，整局有效</span></button>`,`<p class="card-instruction">${state.phase==='destiny'?`接著輪到 ${h(p.name)}`:'天命卡抽完，馬上開始第 1 季'} · 點卡片可以立即繼續</p>`);
  }
  if(state.phase==='destiny'){
    const left=state.destinyDeck.length,done=state.players.filter(x=>x.destinyId).length;
    return `<div class="card-scene scope-destiny"><p class="card-hint">開局 · ${h(p.name)} 抽天命卡（${done+1}／${state.players.length}）</p><button class="draw-deck" type="button" data-action="draw-destiny" ${p.bot?'disabled':''} aria-label="點擊抽天命卡"><span class="deck-shadow" aria-hidden="true"></span><span class="deck-back"><span>🔮</span><strong>天命卡</strong><small>${p.bot?'Bot 抽卡中':'點一下抽卡'}</small></span></button><p class="card-instruction">牌堆還有 ${left} 張 · 每人一張，決定你的人生起點</p></div>`;
  }
  if(state.phase==='respond'){
    const r=respondOptions(state),t=responder(state),card=cardById(state.pendingResponse.cardId);
    const btn=(yes,o)=>`<button class="card-continue ${yes?'':'ghost'}" type="button" data-action="respond" data-value="${yes?1:0}" ${t.bot||o.affordable===false?'disabled':''} title="${h(o.detail)}">${h(o.label)}${o.affordable===false?'（現金不足）':''}</button>`;
    return cardScene('chance',`<p class="card-hint">機會 · ${card.id} · 請 ${h(t.name)} 回覆</p><div class="revealed-card"><span class="revealed-symbol">${r.type==='alliance'?'🤝':'💼'}</span><h3>${h(t.name)}，${h(r.question)}</h3><p class="revealed-desc"><b>${h(r.yes.label)}：</b>${h(r.yes.detail)}</p><p class="revealed-desc"><b>${h(r.no.label)}：</b>${h(r.no.detail)}</p></div>`,t.bot?`<p class="card-instruction">🤖 ${h(t.name)} 正在考慮…</p>`:`<div class="choice-row">${btn(true,r.yes)}${btn(false,r.no)}</div>`);
  }
  const shown=drawnCard();
  if(shown){
    const {draw,card}=shown,t=draw.type,job=isJobCard(card);
    const body=t==='market'?`<p class="revealed-desc">${h(card.desc)}</p><div class="revealed-effects">${marketEffectText(card).map(x=>`<span class="effect-chip">${h(x)}</span>`).join('')}</div>`:t==='chance'?`<p class="revealed-desc">你選擇「${h(state.lastResult.option)}」</p><p class="result-line">${h(state.lastResult.text)}</p>`:`<p class="revealed-desc">${h(card.desc)}</p>${state.lastResult?.text?`<p class="result-line ${state.lastResult.cash<0?'bad':''}">${h(state.lastResult.text)}</p>`:''}`;
    const more=state.phase==='draw'?'還有卡要抽 →':'繼續 →';
    return cardScene(job?'job':t,`<p class="card-hint">${job?'工作卡':typeLabel[t]} · ${card.id}${draw.note?` · ${h(draw.note)}`:''}</p><div class="revealed-card"><span class="revealed-symbol">${job?card.icon:typeIcon[t]}</span><h3>${h(card.name)}</h3>${body}</div>`,p.bot?`<p class="card-instruction">🤖 Bot 正在看卡…</p>`:`<button class="card-continue" type="button" data-action="dismiss-card">${more}</button>`);
  }
  if(state.phase==='draw'){const q=state.queue[0],t=q?.kind||tileAt(p.track,p.position,state).type,why=q?.source==='home'?'經過家鄉的獎勵':q?.flipped?'景氣衰退，這格市場格變成災難格':`停在${typeLabel[t]}格`;return `<div class="card-scene scope-${t}"><p class="card-hint">${why} · ${p.bot?'Bot 抽卡中':'輪到你抽卡'}${state.queue.length>1?` · 還有 ${state.queue.length} 張`:''}</p><button class="draw-deck" type="button" data-action="draw-card" ${p.bot?'disabled':''} aria-label="點擊抽${typeLabel[t]}卡"><span class="deck-shadow" aria-hidden="true"></span><span class="deck-back"><span>${typeIcon[t]}</span><strong>${typeLabel[t]}</strong><small>點一下抽卡</small></span></button><p class="card-instruction">點擊卡背翻開結果</p></div>`}
  if(state.phase==='choice'){
    const pc=state.pendingChoice;
    if(pc.kind==='airport'){
      const opts=chanceOptions(state,p,null),price=ticketPrice(state,p);
      return cardScene('airport',`<p class="card-hint">機場 · 要出國嗎？</p><div class="revealed-card"><span class="revealed-symbol">✈</span><h3>飛往國外</h3><p class="revealed-desc">國外路線 ${ABROAD.tiles.length} 格，只用一個轉輪移動；停在國外格抽國外卡（好處較多，也有少量更糟的懲罰）。走到「回國」自動回到機場。</p><p class="result-line">機票 ${price?m(price):'免費'}${price===0?'（職業或天命卡減免）':jobOf(p).perk==='flyHalf'?'（領隊半價）':''}</p></div>`,choiceButtons(p,opts));
    }
    const card=cardById(pc.cardId),opts=chanceOptions(state,p,card);
    const note=state.lastDraw?.note?`<p class="revealed-desc">${h(state.lastDraw.note)}</p>`:'';
    if(isJobCard(card)){
      const cur=jobOf(p);
      return cardScene('job',`<p class="card-hint">工作卡 · ${card.id} · 可以自由選擇</p><div class="revealed-card"><span class="revealed-symbol">${card.icon}</span><h3>${h(card.name)}</h3>${note}<p class="revealed-desc">${h(card.desc)}</p><p class="result-line">${jobFacts(card)}<br><small>目前：${h(cur.name)}（每季 ${m(cur.salary)}）· 條件：${h(jobConditionText(card))}</small></p></div>`,choiceButtons(p,opts));
    }
    const declinedNote=pc.declined?.length&&state.lastResult?.text?`<p class="result-line bad">${h(state.lastResult.text)}</p>`:'';
    return cardScene('chance',`<p class="card-hint">機會 · ${card.id} · 請做出選擇</p><div class="revealed-card"><span class="revealed-symbol">?</span><h3>${h(card.name)}</h3>${note}${declinedNote}<p class="revealed-desc">${h(card.desc)}</p></div>`,choiceButtons(p,opts));
  }
  if(state.phase==='exam'){
    const job=jobById(p.training.jobId),{need,bonus}=examTarget(p,job);
    return cardScene('job',`<p class="card-hint">受訓結束 · 應考</p><div class="revealed-card"><span class="revealed-symbol">${job.icon}</span><h3>${h(job.name)}</h3><p class="revealed-desc">擲一顆骰子，${bonus?`加上人脈王 +${bonus} 後`:''}≥ ${need} 就錄取。沒通過的話工作卡洗回牌堆。</p></div>`,p.bot?'<p class="card-instruction">🤖 Bot 應考中…</p>':`<button class="card-continue" type="button" data-action="exam">🎲 擲骰應考</button>`);
  }
  if(state.phase==='manage'){
    const job=jobOf(p),q=computeQuarter(state,p),prog=goalProgress(state,p);
    return `<div class="manage-scene" role="status" style="--manage-accent:${colors[p.color]}"><div class="manage-label">第 ${state.round} 季 · ${h(p.name)} 的理財時間</div><div class="manage-icon" aria-hidden="true">${job.icon}</div><h3>${h(IS_ROLES?roleById(p.roleId).name:job.name)}</h3><p class="manage-story">${IS_ROLES?h(goalText(p)):`淨資產 ${m(netWorth(p))}／目標 ${m(GOAL.netWorth)}`}</p><div class="goal-track"><i style="width:${Math.round(prog*100)}%"></i></div><p class="manage-tip"><strong>本季預估${job.tier==='free'?'（收入取平均）':''}</strong>收入 ${signed(q.earned)} · 生活費 ${signed(-q.living)} · 還款 ${signed(-q.debt)}</p><div class="manage-stats"><div><span>預估本季淨額</span><strong class="${q.net<0?'negative':''}">${signed(q.net)}</strong></div><div><span>目前現金</span><strong>${m(p.cash)}</strong></div></div><small>在右側調整加班、還款、借款與買車，完成後交給下一位。</small></div>`;
  }
  if(state.phase==='skip'){const icon=/出海/.test(state.skipReason)?'🚢':/受訓|準備/.test(state.skipReason)?'📚':/國外/.test(state.skipReason)?'🌍':'🩹';return `<div class="strike-scene" role="status"><span class="strike-siren">暫停一回合</span><span class="strike-ghost" aria-hidden="true">${icon}</span><h3>${h(p.name)}：${h(state.skipReason||'暫停')}</h3><p>這回合無法移動，本季收支照常結算。${p.waitTurns?`之後還要再等 ${p.waitTurns} 回合。`:''}</p></div>`}
  return null;
}
function slotMarkup(values){return `<div class="slot-machine" role="group" aria-label="兩個 0 到 6 的拉霸轉輪">${values.map((v,i)=>{const pos=animation?.reelPositions?.[i]??v;const cells=Array.from({length:49},(_,c)=>`<strong class="slot-cell">${c%7}</strong>`).join('');return `<span class="slot-reel ${animation?.stage==='rolling'&&animation.spinning[i]?'spinning':''}" aria-label="第 ${i+1} 個轉輪：${v}"><span class="slot-strip" style="transform:translateY(-${pos*100}%)">${cells}</span></span>`}).join('')}</div>`}
// 等角棋盤（iso.js 的桌面模式）：只建立一次，之後每次 render 更新格子、棋子與桌上的卡。
// 中央的拉霸、卡片、選擇畫面在需要時浮在畫面中央；理財在右側的回合面板。
let isoBoard=null;
// 座位：依人數決定每位玩家坐在畫面的哪個位置（順時針：左下、左中、左上、上中、右上、右中、右下、下中）。
// 4 人以下坐四個角落（2 人坐對角）；5–8 人依序加上左中、右中、上中、下中。
const SEAT_ORDER=['bl','l','tl','t','tr','r','br','b'];
function seatPositions(n){
  const chosen=n<=2?['bl','tr'].slice(0,n):n<=4?['bl','tl','tr','br'].slice(0,n):['bl','tl','tr','br',...['l','r','t','b'].slice(0,n-4)];
  return chosen.sort((a,b)=>SEAT_ORDER.indexOf(a)-SEAT_ORDER.indexOf(b));
}
const debtIcon=d=>d.type==='auto'?'🚗':d.type==='student'?'🎓':d.type==='mortgage'?'🏠':'💳';
// 玩家面前桌上的卡：天命卡、工作卡（角色版是角色）、負債卡。明牌朝上；非明牌只有輪到本人時朝上。
function tableCards(p){
  const d=destinyById(p.destinyId),job=jobOf(p),own=p.id===actorPlayer()?.id&&!p.bot;
  const cards=[d?{face:'up',tone:'destiny',kind:'destiny',id:d.id,icon:d.icon,name:d.name}:{face:'empty'},
    IS_ROLES?{face:'up',tone:'job',kind:'role',id:p.roleId,icon:job.icon,name:roleById(p.roleId).name}:{face:'up',tone:'job',kind:'job',id:job.id,icon:job.icon,name:job.name},
    ...p.debts.filter(x=>x.balance>0).map(x=>({face:x.public||own?'up':'down',tone:'debt',kind:'debt',id:x.id,icon:debtIcon(x),name:x.name}))];
  return cards.slice(0,TABLE_SLOTS);
}
let seatList=[];
function isoModel(){
  const regime=economyRegime(state);
  const pawns=state.players.filter(p=>!p.bankrupt).map(p=>({id:p.id,key:animation?.playerId===p.id?animation.position:playerKey(p),color:colors[p.color],icon:jobOf(p).icon,name:p.name,current:p.id===currentPlayer()?.id,moving:animation?.playerId===p.id}));
  const pos=seatPositions(state.players.length);
  seatList=state.players.map((p,i)=>({pos:pos[i],player:p,cards:tableCards(p)}));
  return {tiles:{main:BOARD.map((_,i)=>{const t=tileAt('main',i,state);return {type:t.type,flipped:!!t.flipped,boosted:regime==='boom'&&t.type==='fortune'}}),highway:HIGHWAY.tiles.map(t=>t.type),abroad:ABROAD.tiles.map(t=>t.type)},
    pawns,activeKey:animation?.stage==='moving'?animation.position:null,
    seats:seatList.map(s=>({pos:s.pos,color:colors[s.player.color],cards:s.cards.map(({face,tone,icon,name})=>({face,tone,icon,name}))}))};
}
function onTableCard(si,ci){
  const s=seatList[si],c=s?.cards[ci];if(!c||c.face==='empty')return;
  if(c.face==='down'){
    const el=$('#card-viewer');
    el.innerHTML=`<div class="viewer-card card-back-view" role="dialog" aria-modal="true" aria-label="蓋著的卡"><p class="card-hint">負債卡 · 非明牌</p><span class="revealed-symbol big">🂠</span><h3>${h(s.player.name)} 的蓋牌</h3><p class="revealed-desc">這張負債不是明牌，輪到 ${h(s.player.name)} 時才會翻開。</p><button type="button" class="card-continue" data-action="close-viewer">關閉</button></div>`;
    el.hidden=false;el.querySelector('[data-action="close-viewer"]').focus();return;
  }
  openCardView(c.kind,c.id,s.player.id);
}
function renderPawns(){if(isoBoard&&state)isoBoard.render(isoModel())}
function renderBoard(){
  const wrap=$('#board');if(!wrap)return;
  if(!isoBoard)isoBoard=createIsoBoard({table:true,onCard:onTableCard});
  if(isoBoard.el.parentNode!==wrap)wrap.prepend(isoBoard.el);
  const values=animation?.displayReels||(state.reels||[0,0]);
  const p=currentPlayer(),eff=state.effReels;
  const boosted=eff&&state.reels&&eff.some((v,k)=>v!==state.reels[k]);
  const total=animation?.stage==='rolling'?'數字跳動中…':state.dice===null?(p.track==='abroad'?'國外只用第一個轉輪':p.owns.car?'有車：1–3 視為 4–6':'啟動拉霸前進'):state.dice===0?'原地停留':`前進 ${state.dice} 格${boosted?`（有車 ${eff.join('+')}）`:''}`;
  const center=centerContent();
  let box=wrap.querySelector('.board-center');if(!box){box=document.createElement('div');wrap.appendChild(box)}
  // 中央浮出：有卡片／選擇／暫停畫面時顯示；拉霸只在擲之前與轉動時顯示，棋子走路時收起來讓出棋盤；
  // 理財畫面改由右側的回合面板處理，所以中央不顯示。
  const rolling=animation&&animation.stage!=='moving';
  const show=center?!center.includes('manage-scene'):rolling||(!animation&&state.status==='playing'&&state.phase==='roll');
  box.className=`board-center ${center?.includes('strike-scene')?'strike-mode':''}`;
  box.hidden=!show;
  if(!show){box.innerHTML='';renderPawns();return}
  const rollBtn=!animation&&state.phase==='roll'&&!p.bot?`<button class="card-continue" type="button" data-action="roll">啟動拉霸　▦</button>`:'';
  box.innerHTML=center||`<div class="center-icon">⌁</div><h3>${h(p.name)} 的回合</h3><p>兩輪拉霸 · 逐格前進 · 每季結算</p>${slotMarkup(values)}<div class="slot-total">${total}</div>${rollBtn}<small>經過家鄉抽一張機會卡；有車經過第 ${HIGHWAY.from} 格可走中央高速公路</small>`;
  renderPawns();
}

/* ---------- 回合面板 ---------- */
function steps(n){return `<div class="turn-steps">${[0,1,2].map(i=>`<span class="${i<n?'done':''}"></span>`).join('')}</div>`}
function carBlock(p){
  const r=IS_ROLES?roleById(p.roleId):null,goalCar=r?.goal.type==='car';
  if(p.owns.car)return `<div class="action-block"><h4>🚗 已有車${p.carValue?` · 殘值 ${m(p.carValue)}`:''}</h4><p>轉輪 1–3 視為 4–6；經過第 ${HIGHWAY.from} 格交流道時${p.useHighway?'會':'不會'}走高速公路。</p><button type="button" data-action="highway">${p.useHighway?'改走一般道路':'改走高速公路'}</button></div>`;
  const o=carOffer(state,p);
  return `<div class="action-block"><h4>${goalCar?'勝利目標 · ':''}買車 · ${m(o.price)}${p.destinyId==='D08'?'（車迷八折）':''}</h4><p>${goalCar?'全額付清就達成目標！':''}有車後轉輪 1–3 視為 4–6，並可走高速公路。${IS_ROLES?'':`車子以 ${Math.round(CAR.resale*100)}% 價值計入淨資產。`}貸款：頭期 ${m(o.down)}，每季繳 ${m(o.payment)}（${CAR.quarters} 季、年息 ${CAR.rate}%，明牌）；銀行要求所有還款 ≤ 薪水 50%，目前會是 <b class="${o.dsr>50?'negative':''}">${pct(o.dsr,0)}</b>。</p><div class="action-row"><button type="button" class="${goalCar?'goal-btn':''}" data-action="buy-car" data-value="cash" ${o.cashOk?'':'disabled'}>全額付清${goalCar&&o.cashOk?' 🏁':''}</button><button type="button" data-action="buy-car" data-value="loan" ${o.loanOk?'':'disabled'}>貸款買車</button></div></div>`;
}
function goalBlock(p){
  if(!IS_ROLES)return '';
  const r=roleById(p.roleId);
  if(r.goal.type==='house'){const hp=housePlan(state,p);return `<div class="action-block"><h4>勝利目標 · 買房</h4><p>房價 ${m(hp.price)}：頭期款 ${m(hp.down)}（目前現金 ${m(p.cash)}）；新房貸每季 ${m(hp.newPayment)}，加上現有負債後月付佔收入 <b class="${hp.dsr>r.goal.dsr?'negative':''}">${pct(hp.dsr,0)}</b>（上限 ${r.goal.dsr}%）。</p><button class="goal-btn" data-action="buy-house" ${hp.ok?'':'disabled'}>付頭期款買房 ${hp.ok?'🏁':''}</button></div>`}
  if(r.goal.type==='debtFree')return `<div class="action-block"><h4>勝利目標 · 無債存款</h4><p>負債剩 ${m(totalDebt(p))}，現金 ${m(p.cash)}。還清所有負債且現金 ≥ ${m(r.goal.amount)} 時立即獲勝。</p></div>`;
  if(r.goal.type==='streak')return `<div class="action-block"><h4>勝利目標 · 穩定高收入</h4><p>已連續 <b>${p.streak}</b> 季收入 ≥ ${m(r.goal.amount)}（目標 ${r.goal.rounds} 季，最佳紀錄 ${p.bestStreak} 季）。上季收入 ${p.lastIncome===null?'—':m(p.lastIncome)}。</p></div>`;
  return '';
}
function identity(p){const job=jobOf(p),d=destinyById(p.destinyId),who=IS_ROLES?`${roleById(p.roleId).name} · ${roleById(p.roleId).title}`:job.name;return `${who}${d?` · ${d.icon} ${d.name}`:' · 尚未抽天命卡'}`}
const chipType=id=>({F:'fortune',M:'market',C:'chance',L:'loss',A:'abroad',J:'job',D:'destiny'})[id[0]]||'chance';
function turnCardChips(){const ids=state.turnCards||[];return ids.length?`<div class="held-cards turn-cards"><span class="held-label">本回合抽到</span>${ids.map(id=>{const c=cardById(id);return `<button type="button" class="card-chip t-${chipType(id)}" data-action="view-card" data-kind="event" data-id="${id}">${h(c.name)}</button>`}).join('')}</div>`:''}
function renderTurn(){
  const p=currentPlayer(),job=jobOf(p),head=`<h2 class="turn-name" style="color:${colors[p.color]}">${job.icon} ${h(p.name)}</h2><p class="turn-role">${h(identity(p))}</p>`;
  const el=$('#turn-content');
  if(state.status!=='playing'){
    const winners=state.players.filter(x=>state.winnerIds.includes(x.id));
    const why={goal:IS_ROLES?'達成目標':`率先${GOAL.text}`,progress:IS_ROLES?'季數用完，目標進度最高':'季數用完，淨資產最高',survivor:'其他玩家都破產',bankruptcy:'所有玩家都破產'}[state.winReason];
    el.innerHTML=`<h2 class="turn-name">對局結束</h2><p class="turn-role">${h(why)}</p><p class="turn-meta">勝出：<strong>${h(winners.map(w=>`${w.name}（${IS_ROLES?roleById(w.roleId).name:`${jobOf(w).name}，淨資產 ${m(netWorth(w))}`}）`).join('、')||'無')}</strong></p><button class="secondary" data-action="new-game">再玩一局</button>`;return;
  }
  if(state.phase==='destiny'&&!p.bot&&!animation){const dz=destinyReveal();el.innerHTML=`${head}<p class="turn-meta">開局：每個人輪流從天命牌堆抽一張卡，抽到的效果整局有效，而且是明牌。${dz?'':'點棋盤中央的牌堆抽卡。'}</p>`;return}
  if(state.phase==='respond'){const t=responder(state);el.innerHTML=`${head}${steps(2)}<p class="turn-meta">等 ${h(t.name)} ${state.pendingResponse.type==='alliance'?'決定要不要合作':'決定要不要反制'}。${t.bot?'（Bot 自動回覆）':`請 ${h(t.name)} 在棋盤中央回覆。`}</p>`;return}
  if(p.bot){el.innerHTML=`${head}<div class="bot-status"><span class="bot-dot"></span>🤖 ${h(botLabel(p.bot))}${botPaused?' · 已暫停':` · ${botPhaseText()}`}</div><p class="turn-meta">${h(p.bot.style?LOW_STYLES[p.bot.style].desc:BOT_LEVELS[p.bot.level].desc)}。</p><p class="turn-meta bot-last">${h(state.log[0]||'')}</p>${botControls()}`;return}
  if(animation){el.innerHTML=`${head}${steps(2)}<p class="turn-meta">${animation.stage==='rolling'?'兩個數字正在跳動…':animation.stage==='result'?'結果已停定，稍後開始移動。':`前進 ${animation.dice} 格。`}</p><button class="primary" disabled>請稍候…</button>`;return}
  if(state.phase==='skip'){el.innerHTML=`${head}${steps(2)}<p class="turn-meta">${h(state.skipReason||'暫停')}，這回合無法移動，本季收支照常結算。</p><button class="primary" data-action="end-turn">${lastTurn()?'結算本季 →':'交給下一位 →'}</button>`;return}
  if(state.phase==='exam'){el.innerHTML=`${head}${steps(0)}<p class="turn-meta">受訓結束，在棋盤中央擲骰應考；考完再啟動拉霸。</p>`;return}
  if(state.phase==='roll'){
    const ex=state.lastExam;const exam=ex?`<p class="turn-meta">應考「${h(jobById(ex.jobId).name)}」擲出 ${ex.roll}${ex.bonus?`＋${ex.bonus}`:''}（需 ≥ ${ex.need}）：${ex.ok?'錄取！':'沒通過。'}</p>`:'';
    const hint=p.track==='abroad'?'你在國外，只用第一個轉輪移動，走到「回國」自動回機場。':p.owns.car?'有車：每個轉輪的 1–3 視為 4–6。':'兩個轉輪各顯示 0–6，相加就是前進格數。';
    el.innerHTML=`${head}${steps(0)}${exam}<p class="turn-meta">輪到你啟動拉霸。${hint}</p><button class="primary" data-action="roll">啟動拉霸　▦</button>${p.owns.car&&p.track==='main'?`<button class="secondary" style="margin-top:10px" data-action="highway">${p.useHighway?'🛣️ 經過交流道時走高速公路（點擊改走一般道路）':'🛣️ 目前不走高速公路（點擊改走）'}</button>`:''}`;return;
  }
  if(state.phase==='draw'||state.phase==='choice'||drawnCard()){el.innerHTML=`${head}${steps(2)}<p class="turn-meta">停在「${h(tileLabel(p.track,p.position,state))}」。${state.phase==='draw'?'請點棋盤中央的卡片抽卡。':state.phase==='choice'?'請在棋盤中央做出選擇。':'看完卡片後按「繼續」。'}</p>${turnCardChips()}`;return}
  const debtOptions=p.debts.map(d=>`<option value="${d.id}">${h(d.name)} · 餘 ${m(d.balance)} · 年息 ${debtRate(state,d)}%</option>`).join('');
  const room=Math.max(0,creditLimit(p)-creditUsed(p));
  el.innerHTML=`${head}${steps(3)}<p class="turn-meta">${state.dice?`前進 ${state.dice} 格。`:'停留原地。'}完成理財決定後交給下一位玩家。</p>${turnCardChips()}
  <div class="action-block"><h4>本季工作量 · 疲勞 ${p.fatigue}${job.fatigue?`（${h(job.name)}每季 +${job.fatigue}）`:''}</h4><div class="fatigue-track"><i style="width:${p.fatigue}%" class="${p.fatigue>=FATIGUE.burnout?'burn':''}"></i></div><p>季結算時疲勞 ≥ ${FATIGUE.burnout}：收入 −20%，而且加班沒有額外收入。不加班每季疲勞 −20，停在家鄉再 −20。</p><div class="seg-row">${[[0,'正常上班','疲勞 −20'],[1,'加班',p.fatigue>=FATIGUE.burnout?'過勞中沒有加成 · 疲勞 +10':'收入 +15% · 疲勞 +10'],[2,'爆肝',p.fatigue>=FATIGUE.burnout?'過勞中沒有加成 · 疲勞 +25':'收入 +30% · 疲勞 +25']].map(([lv,label,sub])=>`<button type="button" data-action="overtime" data-value="${lv}" class="${p.overtime===lv?'on':''}" ${p.unemployedRounds?'disabled':''}><b>${label}</b><small>${sub}</small></button>`).join('')}</div></div>
  ${p.debts.length?`<div class="action-block"><h4>提前還款 · 總負債 ${m(totalDebt(p))}</h4><p>本季應繳 ${m(quarterlyPayments(state,p))}。先還高利率的負債最划算。</p><select id="repay-debt" class="action-select">${debtOptions}</select><div class="action-row"><input id="repay-amount" type="number" min="0.1" step="0.1" value="${Math.max(0,Math.min(5,Math.floor(p.cash)))}" aria-label="還款金額（萬）"><button type="button" data-action="repay">還款</button></div></div>`:''}
  ${carBlock(p)}
  ${goalBlock(p)}
  <div class="action-block"><h4>信用貸款 · 年息 ${(state.economy.rate+8).toFixed(2)}%</h4><p>剩餘額度 ${m(room)}。現金不足時季結算會自動動用；額度用完就破產。</p><div class="action-row"><input id="borrow-amount" type="number" min="0.1" step="0.1" value="5" aria-label="借款金額（萬）"><button type="button" data-action="borrow" ${room>0?'':'disabled'}>借款</button></div></div>
  <button class="secondary" style="margin-top:18px" data-action="end-turn">${lastTurn()?'結算本季 →':'交給下一位 →'}</button>`;
}
function botPhaseText(){if(animation)return '移動中';return {destiny:'抽天命卡',roll:'準備拉霸',draw:'準備抽卡',choice:'考慮中',respond:'等待回覆',manage:'理財中',skip:'暫停一回合',exam:'應考中'}[state.phase]||'思考中'}
function botControls(){return `<div class="bot-controls"><button type="button" data-action="bot-pause" class="${botPaused?'on':''}">${botPaused?'▶ 繼續':'⏸ 暫停'} Bot</button><div class="bot-speed" role="group" aria-label="Bot 速度">${Object.entries(BOT_SPEEDS).map(([k,v])=>`<button type="button" data-action="bot-speed" data-value="${k}" class="${botSpeed===k?'on':''}">${v.label}</button>`).join('')}</div></div>`}
function lastTurn(){for(let i=state.turnIndex+1;i<state.players.length;i++)if(!state.players[i].bankrupt)return false;return true}

/* ---------- 玩家卡 ---------- */
// 目前玩家的完整卡片放在回合面板下方；其他玩家縮成頭像列，點一下展開細節。
function playerBadges(p){
  const r=state.round,ally=p.effects.find(x=>x.source==='C13'&&x.until>=r),allyName=ally?state.players.find(x=>x.id===ally.partnerId)?.name:'';
  const stolen=p.flatIncomes.filter(x=>x.until>=r&&x.label==='被搶走的案子'),won=p.flatIncomes.filter(x=>x.until>=r&&x.label==='搶下的案子');
  return [p.bot?`<span class="badge bot">🤖 ${h(botLabel(p.bot))}</span>`:'',p.owns.car?'<span class="badge good">🚗 有車</span>':'',p.track==='abroad'?'<span class="badge good">✈️ 在國外</span>':p.track==='highway'?'<span class="badge">🛣️ 高速公路上</span>':'',p.training?`<span class="badge">📚 受訓：${h(jobById(p.training.jobId).name)}</span>`:'',p.waitTurns?`<span class="badge warn">${h(p.waitReason||'暫停')} ${p.waitTurns} 回合</span>`:'',p.bankrupt?'<span class="badge warn">已破產</span>':'',p.insured?'<span class="badge good">🛡 有保險</span>':'',p.unemployedRounds?`<span class="badge warn">${p.roleId==='free'?'案源斷炊':'失業'} ${p.unemployedRounds} 季</span>`:'',p.fatigue>=FATIGUE.burnout?'<span class="badge warn">過勞</span>':'',p.overtime?`<span class="badge">${OVERTIME[p.overtime].label}中</span>`:'',p.salaryFactor!==1?`<span class="badge ${p.salaryFactor>1?'good':''}">薪資 ×${p.salaryFactor.toFixed(2)}</span>`:'',IS_ROLES&&p.roleId==='free'?`<span class="badge">連續 ${p.streak} 季達標</span>`:'',ally?`<span class="badge good">🤝 與${h(allyName)}合作至第 ${ally.until} 季</span>`:'',won.length?`<span class="badge good">💼 搶下案子 +${m(won.reduce((s,x)=>s+x.amount,0))}/季</span>`:'',stolen.length?`<span class="badge warn">💼 案子被搶 ${m(stolen.reduce((s,x)=>s+x.amount,0))}/季</span>`:'',...p.effects.filter(x=>x.until>=state.round&&['C13-fallout','C13-decline'].includes(x.source)).map(x=>`<span class="badge warn">${x.source==='C13-fallout'?'合作鬧翻':'拒絕合作'} 收入 ${x.income}% 至第 ${x.until} 季</span>`)].filter(Boolean).join('');
}
// 玩家手上的卡：天命卡、工作卡（或角色）與負債卡，點一下可以放大查看。
function heldCards(p){
  const d=destinyById(p.destinyId),job=jobOf(p);
  const chips=[d?`<button type="button" class="card-chip t-destiny" data-action="view-card" data-kind="destiny" data-id="${d.id}">${d.icon} ${h(d.name)}</button>`:'<span class="card-chip empty">🔮 天命卡未抽</span>',
    IS_ROLES?`<button type="button" class="card-chip t-job" data-action="view-card" data-kind="role" data-id="${p.roleId}">${job.icon} ${h(roleById(p.roleId).name)}</button>`:`<button type="button" class="card-chip t-job" data-action="view-card" data-kind="job" data-id="${job.id}">${job.icon} ${h(job.name)}</button>`,
    ...p.debts.map(x=>`<button type="button" class="card-chip t-debt" data-action="view-card" data-kind="debt" data-id="${x.id}" data-player="${p.id}">${x.type==='auto'?'🚗':x.type==='student'?'🎓':x.type==='mortgage'?'🏠':'💳'} ${h(x.name)}${x.public?' · 明牌':''}</button>`)];
  return `<div class="held-cards"><span class="held-label">持有的卡</span>${chips.join('')}</div>`;
}
function playerCard(p,extra=''){
  const job=jobOf(p),prog=goalProgress(state,p),idx=state.players.indexOf(p);
  const debts=p.debts.length?p.debts.map(d=>`<tr><td>${h(d.name)}${d.public?' <span class="open-tag">明牌</span>':''}</td><td>${m(d.balance)}</td><td>${debtRate(state,d)}%</td><td>${m(d.payment)}/季</td></tr>`).join(''):'<tr><td colspan="4">沒有負債</td></tr>';
  const inv=p.investments.map(x=>`<li>${h(x.name)}${x.income>0?` · 每季 +${m(x.income)}`:x.income<0?` · 每季繳 ${m(-x.income)}，第 ${x.maturity} 季到期`:''}</li>`).join('');
  const last=p.lastBreakdown?p.lastBreakdown.map(l=>`<tr><td>${h(l.label)}</td><td>${signed(l.amount)}</td></tr>`).join(''):'<tr><td colspan="2">尚未結算</td></tr>';
  const turn=state.status==='playing'&&idx===state.turnIndex?'current':'';
  const sub=IS_ROLES?`${roleById(p.roleId).name} · ${roleById(p.roleId).title}`:`${job.name} · ${tierName(p.roleId)}`;
  const goalLine=IS_ROLES?goalText(p):`淨資產 ${m(netWorth(p))}／${m(GOAL.netWorth)}`;
  return `<article class="player-card ${turn} ${p.bankrupt?'bankrupt':''} ${extra}" style="--player-color:${colors[p.color]}"><div class="player-card-head"><div class="player-identity"><span class="role-icon">${job.icon}</span><div><h3>${h(p.name)}</h3><small>${h(sub)}</small></div></div><span class="position-label">${h(tileLabel(p.track,p.position,state))}</span></div><div class="wealth-line"><span>現金</span><strong>${m(p.cash)}</strong></div><div class="goal-line"><div class="goal-line-head"><span>${h(goalLine)}</span><b>${Math.round(prog*100)}%</b></div><div class="goal-track"><i style="width:${Math.round(prog*100)}%"></i></div></div>${heldCards(p)}<div class="player-badges">${playerBadges(p)}</div><div class="finance-grid"><div class="finance-stat negative"><span>總負債</span><strong>${m(totalDebt(p))}</strong></div><div class="finance-stat ${p.lastIncome===null?'':'positive'}"><span>上季收入</span><strong>${p.lastIncome===null?'—':m(p.lastIncome)}</strong></div><div class="finance-stat ${p.lastNet<0?'negative':'positive'}"><span>上季淨額</span><strong>${p.lastNet===null?'—':signed(p.lastNet)}</strong></div></div>${inv?`<ul class="invest-list">${inv}</ul>`:''}<details class="finance-details"><summary>負債明細與上季收支</summary><table class="flow-table"><tbody>${debts}</tbody></table><table class="flow-table"><tbody>${last}</tbody></table></details></article>`;
}
// 座位頭像：四個角落（5–8 人再加四邊中間）。點頭像在旁邊彈出完整的玩家卡。
function renderPlayers(){
  const cur=state.status==='playing'?currentPlayer():null;
  if(openPlayerId&&!state.players.some(p=>p.id===openPlayerId))openPlayerId=null;
  const pos=seatPositions(state.players.length),slots={t:'',b:''};let corner='';
  state.players.forEach((p,i)=>{
    const job=jobOf(p),prog=Math.round(goalProgress(state,p)*100),isCur=p.id===cur?.id,win=state.winnerIds.includes(p.id);
    const html=`<button type="button" class="tg-seat pos-${pos[i]} ${isCur?'current':''} ${p.bankrupt?'bankrupt':''} ${p.id===openPlayerId?'open':''}" data-seat-player="${p.id}" style="--player-color:${colors[p.color]};--prog:${prog}" aria-expanded="${p.id===openPlayerId}" title="點一下查看 ${h(p.name)} 的資料"><span class="tg-ring"><span class="tg-face">${job.icon}</span>${isCur?'<span class="tg-now">輪到</span>':''}</span><span class="tg-meta"><b>${h(p.name)}${win?' 🏆':''}</b><small>${h(IS_ROLES?roleById(p.roleId).name:job.name)}${p.bot?' · 🤖':''}</small><strong>${m(p.cash)}</strong><i class="tg-bar"><i style="width:${prog}%"></i></i></span></button>`;
    if(pos[i]==='t'||pos[i]==='b')slots[pos[i]]=html;else corner+=html;
  });
  $('#seats').innerHTML=corner;$('#seat-slot-t').innerHTML=slots.t;$('#seat-slot-b').innerHTML=slots.b;
  const open=state.players.find(p=>p.id===openPlayerId),panel=$('#panel-player');
  if(open){panel.innerHTML=playerCard(open,'detail');if(openPanel!=='player')openPanel='player';placePanel(panel,document.querySelector(`[data-seat-player="${open.id}"]`))}
  else if(openPanel==='player'){openPanel=null}
  syncPanels();
}
/* ---------- 浮動面板（景氣、選單、玩家資料）：一次只開一個 ---------- */
let openPanel=null;
const PANEL_ANCHOR={econ:'#econ-pill',menu:'[data-panel="menu"]'};
function placePanel(panel,anchor){
  if(!anchor)return;
  panel.hidden=false;
  const r=anchor.getBoundingClientRect(),pw=panel.offsetWidth,ph=panel.offsetHeight,W=innerWidth,H=innerHeight;
  let x=r.left+r.width/2-pw/2,y=r.bottom+10;
  if(y+ph>H-12)y=r.top-ph-10;
  if(y<12){y=Math.max(12,Math.min(H-ph-12,r.top+r.height/2-ph/2));x=r.left<W/2?r.right+10:r.left-pw-10}
  panel.style.left=`${Math.max(12,Math.min(W-pw-12,x))}px`;panel.style.top=`${Math.max(12,Math.min(H-ph-12,y))}px`;
}
function syncPanels(){
  for(const k of ['econ','menu','player']){const el=$(`#panel-${k}`);if(openPanel!==k)el.hidden=true}
  document.querySelectorAll('[data-panel]').forEach(b=>b.setAttribute('aria-expanded',String(b.dataset.panel===openPanel)));
  if(openPanel&&openPanel!=='player')placePanel($(`#panel-${openPanel}`),document.querySelector(PANEL_ANCHOR[openPanel]));
}
function togglePanel(name){openPlayerId=null;openPanel=openPanel===name?null:name;renderPlayers()}
function toggleSeat(id){if(openPlayerId===id){openPlayerId=null;openPanel=null}else{openPlayerId=id;openPanel='player'}renderPlayers()}
function closePanels(){if(!openPanel&&!openPlayerId)return;openPanel=null;openPlayerId=null;renderPlayers()}
/* ---------- 上方膠囊：季數＋景氣 ---------- */
function renderEconPill(){
  const regime=economyRegime(state),label={normal:'景氣平穩',recession:'景氣衰退',boom:'景氣過熱'}[regime];
  $('#econ-pill').innerHTML=`<b>第 ${state.round}／${state.maxRounds} 季</b><small>${VARIANTS[VARIANT].short} ${h(VARIANTS[VARIANT].label)}</small><span class="tg-econ ${regime}">${regime==='recession'?'📉':regime==='boom'?'📈':'📊'} ${label}</span>`;
}
/* ---------- 下方回合列＋右側回合面板 ---------- */
// 回合面板（原本的 CURRENT TURN）放在右側抽屜：輪到真人理財或對局結束時自動打開，其他時候收起來。
let drawerOpen=false,drawerKey=null;
function drawerAuto(){
  const p=currentPlayer(),key=state.status!=='playing'?`end:${state.sync?.gameId}`:`${state.sync?.gameId}:${state.round}:${state.turnIndex}:${state.phase==='manage'&&!p?.bot&&!animation&&!drawnCard()?'manage':'other'}`;
  if(key===drawerKey)return;
  drawerKey=key;drawerOpen=state.status!=='playing'||key.endsWith(':manage');
}
const PHASE_LABEL={destiny:'抽天命卡',roll:'啟動拉霸',draw:'抽卡',choice:'做出選擇',respond:'等待回覆',manage:'理財時間',skip:'暫停一回合',exam:'受訓應考'};
function renderDock(){
  drawerAuto();
  const dock=$('#dock'),p=currentPlayer();
  $('#turn-drawer').classList.toggle('open',drawerOpen);
  const toggle=`<button type="button" class="tg-btn" data-action="toggle-drawer" aria-expanded="${drawerOpen}">${drawerOpen?'收起面板 ▸':'回合面板 ◂'}</button>`;
  if(state.status!=='playing'){
    const winners=state.players.filter(x=>state.winnerIds.includes(x.id)).map(x=>x.name).join('、')||'無';
    dock.innerHTML=`<span class="tg-dock-who"><b>🏁 對局結束</b><small>勝出：${h(winners)}</small></span>${toggle}<button type="button" class="tg-btn primary" data-action="new-game">再玩一局</button>`;return;
  }
  const actor=actorPlayer(),last=state.log[0]||'';
  const phase=animation?(animation.stage==='rolling'?'拉霸轉動中':'前進中'):state.phase==='respond'?`等 ${actor.name} 回覆`:PHASE_LABEL[state.phase]||'';
  let main='';
  if(actor?.bot)main=botControls();
  else if(!animation&&state.phase==='roll')main=`<button type="button" class="tg-btn primary" data-action="roll">啟動拉霸 ▦</button>`;
  else if(!animation&&!drawnCard()&&(state.phase==='manage'||state.phase==='skip'))main=`<button type="button" class="tg-btn primary" data-action="end-turn">${lastTurn()?'結算本季 →':'交給下一位 →'}</button>`;
  dock.innerHTML=`<span class="tg-dot" style="background:${colors[p.color]}"></span><span class="tg-dock-who"><b>${h(p.name)} · ${h(phase)}${actor?.bot?' 🤖':''}</b><small title="${h(last)}">${h(last)}</small></span>${toggle}${main}`;
}
function renderEconBanner(){
  const regime=economyRegime(state),el=$('#econ-banner');
  if(regime==='normal'){el.hidden=true;return}
  const cfg=ECON_TILES[regime];
  el.hidden=false;el.className=`econ-banner ${regime}`;
  el.innerHTML=`<b>${regime==='recession'?'📉':'📈'} 景氣${cfg.label}</b><span>${h(cfg.text)}（上季成長率 ${pct(state.economy.growth)}）</span>`;
}
function renderMini(){
  const e=state.economy,f=[['成長率',pct(e.growth)],['通膨',pct(e.inflation)],['失業率',pct(e.unemployment)],['政策利率',pct(e.rate,2)],['車價',m(e.carPrice)],IS_ROLES?['房價',m(e.housePrice)]:['機票',m(ABROAD.ticket*e.priceLevel)]];
  $('#mini-economy').innerHTML=f.map(([a,b])=>`<div class="mini-stat"><span>${a}</span><strong>${b}</strong></div>`).join('');
}

/* ---------- 卡牌檢視 ---------- */
function cardViewMarkup(kind,id,playerId){
  const row=(a,b)=>`<div><dt>${a}</dt><dd>${b}</dd></div>`;
  if(kind==='destiny'){const d=destinyById(id);return {type:'destiny',label:'天命卡',icon:d.icon,name:d.name,desc:h(d.desc),facts:row('公開','明牌，整局有效')}}
  if(kind==='role'){const r=roleById(id);return {type:'job',label:'角色',icon:r.icon,name:`${r.name} · ${r.title}`,desc:h(r.story),facts:row('季收入',m(r.salary))+row('季生活費',m(r.living))+row('勝利目標',h(r.goal.text))}}
  if(kind==='job'){const j=jobById(id===BASE_JOB.id?null:id);return {type:'job',label:j.cond?'工作卡':'基本工作',icon:j.icon,name:j.name,desc:h(j.desc),facts:row('每季收入',m(j.salary))+row('每季生活費',m(j.living))+row('收入階層',h(tierName(j.tier)))+(j.cond?row('取得條件',h(jobConditionText(j))):'')+(j.perk?row('特權',j.perk==='flyFree'?'搭機出國免費':'機票半價'):'')+(j.fatigue?row('副作用',`每季疲勞 +${j.fatigue}`):'')+(j.skipChance?row('副作用',`每回合 ${Math.round(j.skipChance*100)}% 出海無法移動`):'')}}
  if(kind==='debt'){const p=state.players.find(x=>x.id===playerId),d=p?.debts.find(x=>x.id===id);if(!d)return null;return {type:'debt',label:d.public?'負債卡 · 明牌':'負債卡',icon:d.type==='auto'?'🚗':d.type==='student'?'🎓':d.type==='mortgage'?'🏠':'💳',name:d.name,desc:`${h(p.name)} 的負債。每季結算先付利息，其餘攤還本金，也可以在理財時間提前還款。`,facts:row('剩餘本金',m(d.balance))+row('年利率',`${debtRate(state,d)}%`)+row('每季應繳',m(d.payment))}}
  const c=cardById(id),t=chipType(id);if(!c)return null;
  if(t==='job')return cardViewMarkup('job',id);
  const facts=t==='market'?marketEffectText(c).map(x=>row('影響',h(x))).join(''):t==='chance'?c.options.map(o=>{const label=typeof o.label==='object'?Object.values(o.label).join('／'):o.label;const outs=Array.isArray(o.outcomes)?o.outcomes:o.outcomes.default;return row(h(label),outs.map(x=>`${Math.round(x.p*100)}% ${h(x.text)}`).join('<br>'))}).join(''):t==='loss'?row('保險',c.insurable?'理賠八成':'不理賠'):'';
  return {type:t,label:`${typeLabel[t]}卡 · ${c.id}`,icon:typeIcon[t],name:c.name,desc:h(c.desc),facts};
}
function openCardView(kind,id,playerId){
  const v=cardViewMarkup(kind,id,playerId);if(!v)return;
  const el=$('#card-viewer');
  el.innerHTML=`<div class="viewer-card scope-${v.type}" role="dialog" aria-modal="true" aria-label="${h(v.name)}"><p class="card-hint">${h(v.label)}</p><span class="revealed-symbol big">${v.icon}</span><h3>${h(v.name)}</h3><p class="revealed-desc">${v.desc}</p>${v.facts?`<dl class="viewer-facts">${v.facts}</dl>`:''}<button type="button" class="card-continue" data-action="close-viewer">關閉</button></div>`;
  el.hidden=false;el.querySelector('[data-action="close-viewer"]').focus();
}
function closeCardView(){const el=$('#card-viewer');el.hidden=true;el.innerHTML=''}

/* ---------- 其他分頁 ---------- */
function renderLibrary(){
  const totalW=FORTUNE_CARDS.reduce((s,c)=>s+c.weight,0),abroadW=ABROAD_CARDS.reduce((s,c)=>s+c.weight,0);
  const groups=IS_ROLES?ROLES:TIERS;
  const sec=(type,title,note,items)=>`<section class="library-section"><h3 class="lib-title t-${type}">${typeIcon[type]||'◆'} ${title}</h3><p class="muted">${note}</p><div class="library">${items}</div></section>`;
  const destiny=DESTINIES.map(d=>`<div class="library-item"><div><strong>${d.id} · ${d.icon} ${h(d.name)}</strong><p>${h(d.desc)}</p></div></div>`).join('');
  const jobs=[BASE_JOB,...JOBS].map(j=>`<div class="library-item"><div><strong>${j.id} · ${j.icon} ${h(j.name)}</strong><p>${h(j.desc)}</p><p class="lib-effects">${j.cond?`條件：${h(jobConditionText(j))}`:'沒有工作卡時'}${j.perk==='flyFree'?'；搭機免費':j.perk==='flyHalf'?'；機票半價':''}</p></div><span>+${m(j.salary)}／季<br><small>生活費 ${m(j.living)} · ${h(tierName(j.tier))}</small></span></div>`).join('');
  const fortune=FORTUNE_CARDS.map(c=>`<div class="library-item"><div><strong>${c.id} · ${h(c.name)}</strong><p>${h(c.desc)}</p></div><span>${typeof c.cash==='object'?groups.map(r=>`${r.name} ${m(c.cash[r.id])}`).join('<br>'):'+'+m(c.cash)}<br><small>機率 ${(c.weight/totalW*100).toFixed(c.weight<1?2:1)}%</small></span></div>`).join('');
  const market=MARKET_EVENTS.map(c=>`<div class="library-item"><div><strong>${c.id} · ${h(c.name)}</strong><p>${h(c.desc)}</p><p class="lib-effects">${marketEffectText(c).map(h).join('；')}</p></div><span>${c.duration} 季</span></div>`).join('');
  const chance=CHANCE_CARDS.map(c=>`<div class="library-item"><div><strong>${c.id} · ${h(c.name)}</strong><p>${h(c.desc)}</p><p class="lib-effects">${c.options.map(o=>{const label=typeof o.label==='object'?Object.values(o.label).join('／'):o.label;const outs=Array.isArray(o.outcomes)?o.outcomes:o.outcomes.default;return `${h(label)}：${outs.map(x=>`${Math.round(x.p*100)}% ${h(x.text)}`).join(' ')}`}).join('<br>')}</p></div></div>`).join('');
  const loss=LOSS_CARDS.map(c=>`<div class="library-item"><div><strong>${c.id} · ${h(c.name)}</strong><p>${h(c.desc)}</p></div><span>${c.insurable?'保險理賠八成':'保險不理賠'}</span></div>`).join('');
  const abroad=ABROAD_CARDS.map(c=>`<div class="library-item"><div><strong>${c.id} · ${h(c.name)}</strong><p>${h(c.desc)}</p></div><span><small>機率 ${(c.weight/abroadW*100).toFixed(1)}%</small></span></div>`).join('');
  $('#card-library').innerHTML=sec('destiny','天命卡 Destiny','開局每人抽一張，明牌。',destiny)+(IS_ROLES?'':sec('job','工作卡 Job',`混在機會牌堆中（${CHANCE_CARDS.length} 張機會卡＋${JOBS.length} 張工作卡），被人持有的不會再被抽到。抽到時可以自由選擇；已有工作卡可以洗回牌堆重抽。`,jobs))+sec('fortune','好運 Fortune','純運氣，必定獲利。',fortune)+sec('market','市場 Market','影響所有玩家；每季最多一張，之後停到市場格改抽機會卡。',market)+sec('chance','機會 Chance','需要選擇的卡；經過家鄉也會抽一張。把滑鼠移到選項上可以看到機率。',chance)+sec('loss','災難 Loss','毀滅性打擊。保險每季保費 0.6 萬，理賠八成。',loss)+sec('abroad','國外 Abroad','只在國外路線抽：好處較多，也有少量更糟的懲罰。',abroad);
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
  const key=IS_ROLES?'cash':'netWorth';
  const rows=state.players.map(p=>`<tr><td>${h(p.name)}（${h(IS_ROLES?roleById(p.roleId).name:jobOf(p).name)}）</td>${p.history.slice(-8).map(x=>`<td>${m(x[key]??x.cash)}</td>`).join('')}</tr>`).join('');
  $('#history-body').innerHTML=`<div class="history-layout"><div class="history-chart"><h3>近 8 季${IS_ROLES?'現金':'淨資產'}</h3><div style="overflow:auto"><table class="history-table"><tbody>${rows}</tbody></table></div></div><div class="history-chart"><h3>遊戲動態</h3><div class="log-list">${state.log.slice(0,80).map(x=>`<div class="log-item">${h(x)}</div>`).join('')}</div></div></div>`;
}
// 遊戲中：全螢幕桌面。上方工具列收起來，整組按鈕（含聲音、存檔）搬進 ☰ 選單；離開遊戲畫面再搬回去。
function setTableMode(on){
  document.body.classList.toggle('table-mode',on);
  const actions=document.querySelector('.top-actions'),home=on?$('#menu-actions'):document.querySelector('.topbar');
  if(actions&&actions.parentNode!==home)home.appendChild(actions);
  if(!on){openPanel=null;openPlayerId=null}
}
function render(){
  const onHome=page==='home';
  if(onHome||!state)setTableMode(false);
  $('#round-badge').hidden=onHome||!state;$('#home').hidden=!onHome;$('#home-btn').classList.toggle('active',onHome);
  if(onHome){$('#setup').hidden=true;$('#game').hidden=true;$('#home-play-btn').textContent=state?'返回對局 →':'設定玩家，開始遊戲 →';$('#home-status').textContent=state?`已有對局 · 第 ${state.round} 季。`:'一台電腦就能開始，大家輪流操作。';soundWatch();return}
  if(!state){$('#setup').hidden=false;$('#game').hidden=true;renderSetup();soundWatch();return}
  $('#setup').hidden=true;$('#game').hidden=false;setTableMode(true);
  $('#round-number').textContent=String(state.round).padStart(2,'0');$('#round-limit').textContent=`／${state.maxRounds} 季`;
  // 卡牌圖鑑、景氣與央行、紀錄：從選單打開，蓋在棋盤上面。
  document.querySelectorAll('#game .tab-page').forEach(p=>p.classList.toggle('active',p.id===`tab-${tab}`));
  renderBoard();renderTurn();renderDock();renderEconBanner();renderMini();renderEconPill();renderPlayers();renderDock();renderLibrary();renderEconomy();renderHistory();
  scheduleDestiny();scheduleBot();soundWatch();
}
/* ---------- 聲音（與連線版共用 online/sound.js） ---------- */
// 比對上一次畫面：新抽的卡、新的遊戲紀錄、換人、對局結束，各自播對應的音效；背景音樂跟著景氣換曲風。
if(typeof Sound!=='undefined'){Sound.autoUnlock();Sound.mountControls($('#snd-ctrl'))}
function sfx(name,arg){if(typeof Sound!=='undefined')Sound.play(name,arg)}
let soundLast=null;
function soundWatch(){
  if(typeof Sound==='undefined')return;
  if(!state){soundLast=null;Sound.setMood('lobby');return}
  Sound.setMood(state.status==='playing'&&state.phase!=='destiny'?economyRegime(state):'lobby');
  const drawKey=state.lastDraw?`${state.round}-${state.turnIndex}-${state.lastDraw.seq??state.lastDraw.cardId}`:state.lastDestiny?`d-${state.lastDestiny.seq}`:null;
  const now={game:state.sync?.gameId,log:state.log.length,draw:drawKey,turn:`${state.round}-${state.turnIndex}`,status:state.status};
  if(soundLast&&soundLast.game===now.game){
    let delay=0;
    if(now.draw&&now.draw!==soundLast.draw){Sound.play('flip');if(state.lastDraw)Sound.play(['fortune','market','chance','loss'].includes(state.lastDraw.type)?state.lastDraw.type:'fortune');delay=700}
    if(now.log>soundLast.log)Sound.logEvent(state.log.slice(0,now.log-soundLast.log),delay);
    if(now.status==='playing'&&now.turn!==soundLast.turn)setTimeout(()=>Sound.play('turn'),300);
    if(now.status!=='playing'&&soundLast.status==='playing')setTimeout(()=>Sound.play('win'),1200);
  }
  soundLast=now;
}

/* ---------- 天命卡自動繼續 ---------- */
// 天命卡翻開後停留 READ_MS，自動換下一位（最後一位抽完就直接開始第 1 季）。
let destinyTimer=null,destinyTimerKey=null;
function scheduleDestiny(){
  const dz=destinyReveal();
  if(!dz||page!=='game'){clearTimeout(destinyTimer);destinyTimer=null;destinyTimerKey=null;return}
  if(destinyTimerKey===dz.key)return;
  clearTimeout(destinyTimer);destinyTimerKey=dz.key;
  destinyTimer=setTimeout(()=>{destinyTimer=null;if(destinyReveal()?.key===dz.key){dismissedDestinyKey=dz.key;render()}},READ_MS);
}

/* ---------- Bot 自動操作 ---------- */
// 只在看得見的頁籤驅動 Bot；每一步都透過 run() 取得最新狀態並上鎖，多個頁籤也不會重複操作。
function scheduleBot(){
  clearTimeout(botTimer);botTimer=null;
  if(!state||state.status!=='playing'||page!=='game'||botPaused||animation||document.hidden)return;
  const p=actorPlayer();if(!p?.bot)return;
  const reading=drawnCard()||state.phase==='choice'||state.phase==='respond';
  botTimer=setTimeout(botTick,reading?Math.max(READ_MS,BOT_SPEEDS[botSpeed].ms*1.8):BOT_SPEEDS[botSpeed].ms);
}
async function botTick(){
  botTimer=null;
  if(!state||animation||botPaused||state.status!=='playing')return;
  const p=actorPlayer();if(!p?.bot)return;
  if(destinyReveal())return;
  if(state.phase==='destiny'){await run(()=>{if(currentPlayer()?.bot&&state.phase==='destiny')drawDestiny(state)});return}
  if(state.phase==='respond'){await run(()=>{const t=responder(state);if(t?.bot)respond(state,t.id,botRespond(state,t,Math.random))});return}
  if(state.phase==='roll'){await rollWithAnimation();if(!animation)render();return}
  const shown=drawnCard();
  if(shown){dismissedCardKey=shown.key;render();return}
  await run(()=>{
    const q=currentPlayer();if(!q?.bot||state.status!=='playing')return;
    if(state.phase==='skip')return void endTurn(state);
    if(state.phase==='exam')return void takeExam(state);
    if(state.phase==='draw')return void drawEvent(state);
    if(state.phase==='choice')return void resolveChoice(state,q.id,botChoice(state,q,Math.random));
    if(state.phase==='manage'){
      const key=`${state.sync?.gameId}:${state.round}:${state.turnIndex}`;
      if(botMemo.key!==key)botMemo={key,memo:{}};
      const step=botManageStep(state,q,botMemo.memo,Math.random);
      if(!step)return void endTurn(state);
      if(step.type==='overtime')setOvertime(state,q.id,step.level);
      else if(step.type==='repay')repayDebt(state,q.id,step.debtId,step.amount);
      else if(step.type==='car')buyCar(state,q.id,step.mode);
      else if(step.type==='house')buyHouse(state,q.id);
    }
  });
}
document.addEventListener('visibilitychange',()=>scheduleBot());

/* ---------- 動畫（總移動時間固定） ---------- */
const pause=ms=>new Promise(r=>setTimeout(r,ms));
// 棋子一格一格走：等角棋盤的棋子用 CSS transition 平滑移到下一格。
function moveTokenStep(key,ms){
  animation?.visited.add(key);sfx('step',animation?.visited.size||1);
  if(tab!=='business'||page!=='game')return;
  document.documentElement.style.setProperty('--iso-step',`${Math.max(60,ms-60)}ms`);
  renderPawns();
}
function beginRollAnimation({playerId,from,path,dice,reels}){
  if(!state||currentPlayer()?.id!==playerId||state.dice!==dice||document.hidden||tab!=='business'||page!=='game')return;
  cancelAnimation();const serial=animationSerial,route=path.map(nodeKey),stepMs=stepMsFor(route.length);
  animation={playerId,position:nodeKey(from),dice,reels,path:route,displayReels:[0,0],reelPositions:[0,0],spinning:[true,true],visited:new Set(),stage:'rolling'};
  renderBoard();renderTurn();renderDock();sfx('spin');
  void (async()=>{
    const stop=[8,14];
    for(let t=0;t<16;t++){
      await pause(110);if(serial!==animationSerial)return;
      const reelsEl=document.querySelectorAll('#board .slot-reel');
      for(let i=0;i<2;i++){if(!animation.spinning[i])continue;if(t<stop[i])animation.reelPositions[i]++;else{const d=(reels[i]-animation.reelPositions[i]%7+7)%7;animation.reelPositions[i]+=d||7;animation.spinning[i]=false;sfx('reelStop',i)}animation.displayReels[i]=animation.reelPositions[i]%7;const el=reelsEl[i];if(el){el.querySelector('.slot-strip').style.transform=`translateY(-${animation.reelPositions[i]*100}%)`;el.classList.toggle('spinning',animation.spinning[i])}}
    }
    if(serial!==animationSerial)return;animation.displayReels=[...reels];animation.stage='result';renderBoard();renderTurn();renderDock();
    await pause(600);if(serial!==animationSerial)return;animation.stage='moving';renderBoard();renderTurn();renderDock();
    for(const key of animation.path){if(serial!==animationSerial)return;animation.position=key;moveTokenStep(key,stepMs);await pause(stepMs)}
    if(serial!==animationSerial)return;animation=null;renderBoard();renderTurn();renderDock();scheduleBot();
  })();
}
async function rollWithAnimation(){
  if(animation)return;let result=null,playerId=null;
  try{await withLock(()=>{if(!ensureFresh())return;const p=currentPlayer();playerId=p.id;result=rollDice(state);save();render()});if(result)beginRollAnimation({playerId,from:result.from,path:result.path,dice:result.dice,reels:result.reels})}catch(e){notify(e.message||'無法啟動拉霸')}
}

/* ---------- 事件綁定 ---------- */
$('#add-player').addEventListener('click',()=>{if(setupPlayers.length<8){let n=1;while(setupPlayers.some(x=>x.name===`玩家 ${n}`))n++;setupPlayers.push({name:`玩家 ${n}`,roleId:ROLES[setupPlayers.length%ROLES.length].id,control:'human'});renderSetup()}});
$('#setup-players').addEventListener('input',e=>{if(e.target.dataset.setupName!==undefined)setupPlayers[Number(e.target.dataset.setupName)].name=e.target.value});
$('#setup-players').addEventListener('change',e=>{if(e.target.dataset.setupRole!==undefined)setupPlayers[Number(e.target.dataset.setupRole)].roleId=e.target.value;if(e.target.dataset.setupControl!==undefined)setupPlayers[Number(e.target.dataset.setupControl)].control=e.target.value});
$('#setup-players').addEventListener('click',e=>{const i=e.target.dataset.removePlayer;if(i!==undefined&&setupPlayers.length>2){setupPlayers.splice(Number(i),1);renderSetup()}});
$('#start-btn').addEventListener('click',async()=>{try{await withLock(()=>{const saved=readStored();if(saved){adoptShared(saved);page='game';notify('已加入另一個頁籤的對局。');return}const next=createGame({variant:VARIANT,players:setupPlayers.map(p=>({name:p.name,roleId:p.roleId,bot:p.control==='human'?null:makeBot(p.control)})),maxRounds:Number($('#rounds-input').value)});prepareNewSession(next);state=next;page='game';tab='business';$('#setup-error').textContent='';rememberView();save();render()})}catch(e){$('#setup-error').textContent=e.message}});
// 全螢幕桌面：分頁、浮動面板、座位頭像；點面板以外的地方就把面板收起來。
$('#game').addEventListener('click',e=>{
  if(!state)return;
  const tb=e.target.closest('[data-tab]');if(tb){tab=tb.dataset.tab;openPanel=null;openPlayerId=null;rememberView();render();return}
  const pb=e.target.closest('[data-panel]');if(pb){togglePanel(pb.dataset.panel);return}
  const seat=e.target.closest('[data-seat-player]');if(seat){toggleSeat(seat.dataset.seatPlayer);return}
  if(openPanel&&!e.target.closest('.tg-panel'))closePanels();
});
$('#game').addEventListener('click',e=>{
  const a=e.target.closest('[data-action]');if(!a||!state)return;
  const action=a.dataset.action,p=currentPlayer();
  if(action==='new-game'){void resetGame();return}
  if(action==='view-card'){openCardView(a.dataset.kind,a.dataset.id,a.dataset.player);return}
  if(action==='dismiss-destiny'){dismissedDestinyKey=destinyReveal()?.key||null;render();return}
  if(action==='toggle-drawer'){drawerOpen=!drawerOpen;renderDock();return}
  if(action==='bot-pause'){botPaused=!botPaused;render();return}
  if(action==='bot-speed'){botSpeed=a.dataset.value;try{localStorage.setItem('life-board-bot',JSON.stringify({speed:botSpeed}))}catch{}render();return}
  if(action==='respond'){const t=responder(state);if(t&&!t.bot)void run(()=>respond(state,t.id,a.dataset.value==='1'));return}
  if(p?.bot)return;
  if(action==='roll'){void rollWithAnimation();return}
  if(animation)return;
  if(action==='draw-destiny'){void run(()=>drawDestiny(state));return}
  if(action==='draw-card'){void run(()=>drawEvent(state));return}
  if(action==='choose'){void run(()=>resolveChoice(state,p.id,Number(a.dataset.value)));return}
  if(action==='exam'){void run(()=>{const r=takeExam(state);notify(r.ok?`擲出 ${r.roll}${r.bonus?`＋${r.bonus}`:''}，錄取！`:`擲出 ${r.roll}${r.bonus?`＋${r.bonus}`:''}，沒通過。`)});return}
  if(action==='dismiss-card'){dismissedCardKey=drawnCard()?.key||null;renderBoard();renderTurn();renderDock();return}
  if(action==='end-turn'){void run(()=>{const before=state.round;endTurn(state);if(state.status!=='playing')notify('對局結束！');else if(state.round!==before)notify(`第 ${before} 季已結算。`)});return}
  if(action==='overtime'){void run(()=>setOvertime(state,p.id,Number(a.dataset.value)));return}
  if(action==='repay'){const id=$('#repay-debt').value,n=Number($('#repay-amount').value);void run(()=>repayDebt(state,p.id,id,n));return}
  if(action==='borrow'){const n=Number($('#borrow-amount').value);void run(()=>borrow(state,p.id,n));return}
  if(action==='buy-car'){void run(()=>buyCar(state,p.id,a.dataset.value));return}
  if(action==='buy-house'){void run(()=>buyHouse(state,p.id));return}
  if(action==='highway'){void run(()=>setHighway(state,p.id,!p.useHighway));return}
});
async function resetGame(){
  if(state&&state.status==='playing'&&Date.now()>resetArmedUntil){resetArmedUntil=Date.now()+4000;notify('再按一次確認開始新遊戲；目前對局會清除。');return}
  resetArmedUntil=0;
  await withLock(()=>{clearSave();cancelAnimation();state=null;page='game';tab='business';rememberView();render()});
}
$('#card-viewer').addEventListener('click',e=>{if(e.target.id==='card-viewer'||e.target.closest('[data-action="close-viewer"]'))closeCardView()});
document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(!$('#card-viewer').hidden){closeCardView();return}if(!state||page!=='game')return;if(openPanel||openPlayerId){closePanels();return}if(tab!=='business'){tab='business';rememberView();render();return}if(drawerOpen){drawerOpen=false;renderDock()}});
addEventListener('resize',()=>{if(openPanel&&state&&page==='game')renderPlayers()});
$('#home-btn').addEventListener('click',()=>{page='home';render();window.scrollTo({top:0,behavior:'smooth'})});
$('#home-play-btn').addEventListener('click',()=>{page='game';render();window.scrollTo({top:0,behavior:'smooth'})});
$('#new-game-btn').addEventListener('click',()=>{void resetGame()});
$('#open-tab-btn').addEventListener('click',()=>{window.open(location.href,'_blank','noopener')});
$('#export-btn').addEventListener('click',()=>{if(!state){notify('目前沒有可匯出的對局。');return}const blob=new Blob([exportGame(state)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`人生棋局-${VARIANTS[VARIANT].label}-第${state.round}季.json`;a.click();URL.revokeObjectURL(url)});
$('#import-file').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{const g=importGame(await f.text());if(g.variant!==VARIANT)throw Error(`這是${VARIANTS[g.variant].label}的存檔，請到${VARIANTS[g.variant].label}匯入。`);await withLock(()=>{prepareNewSession(g);cancelAnimation();state=g;page='game';tab='business';save();render()});notify('存檔已載入。')}catch(err){notify(err.message||'無法讀取存檔')}e.target.value=''});
window.addEventListener('storage',e=>{if(e.key!==storageKey)return;if(e.newValue){try{adoptShared(importGame(e.newValue))}catch{}}else{cancelAnimation();state=null;render()}});
if(channel)channel.onmessage=e=>{const msg=e.data;if(!msg||msg.writerId===tabId)return;if(msg.type==='state'){try{adoptShared(importGame(JSON.stringify(msg.game)))}catch{}}if(msg.type==='reset'&&(!state||msg.updatedAt>=syncInfo(state).updatedAt)){resetAt=Math.max(resetAt,msg.updatedAt);cancelAnimation();state=null;render()}};
window.addEventListener('focus',()=>{const s=readStored();if(s)adoptShared(s)});
const saved=readStored();if(saved)state=saved;
renderStaticCopy();renderHomeRoles();render();
