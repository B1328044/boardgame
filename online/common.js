// 大螢幕與手機共用的小工具與連線設定（一般 script，不需要打包）。
'use strict';
const $=s=>document.querySelector(s);
const h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n).toLocaleString('zh-TW',{maximumFractionDigits:Math.abs(n)<10?2:1});
const m=n=>`${fmt(n)} 萬`;
const signed=n=>`${n>=0?'+':'−'}${fmt(Math.abs(n))} 萬`;
const pct=(n,d=1)=>`${Number(n).toFixed(d)}%`;
const COLORS=['#0f9688','#5979b0','#ce9460','#aa6b91','#c55d5d','#7e9541','#348da5','#7a60ad'];
const TYPE_LABEL={fortune:'好運',market:'市場',chance:'機會',loss:'災難',start:'休息站'};
const TYPE_ICON={fortune:'✦',market:'◎',chance:'?',loss:'⚠',start:'☕'};
const PHASE_TEXT={roll:'準備拉霸',draw:'準備抽卡',choice:'正在考慮機會卡',respond:'等待對方回覆',manage:'理財中',skip:'暫停一回合',finished:'對局結束'};
const respondWait=r=>r?`等 ${r.to} ${r.type==='alliance'?'決定要不要合作':'決定要不要反制'}…`:'';
const WIN_TEXT={goal:'達成目標',progress:'季數用完，目標進度最高',survivor:'其他玩家都破產',bankruptcy:'所有玩家都破產'};
function boardCoords(i){if(i<=6)return [1,i+1];if(i<=12)return [i-5,7];if(i<=18)return [7,19-i];return [25-i,1]}
/* 動態分類：大螢幕與手機用來決定提示顏色、音效與震動 */
function splitLog(x){const r=/^第 (\d+) 季｜(.*)$/.exec(x);return r?{round:Number(r[1]),text:r[2]}:{round:null,text:x}}
function classify(t){
  if(/破產/.test(t))return ['bad','💥'];
  if(/達成目標|獲勝|買下/.test(t))return ['good','🏆'];
  if(/罷工|停擺|勒索/.test(t))return ['bad','👻'];
  if(/合作|案子|聯盟|大客戶/.test(t))return ['social','🤝'];
  if(/季結算|市場事件|聯準會/.test(t))return ['econ','📈'];
  if(/遭遇|倒會|自動動用|無法行動/.test(t))return ['bad','⚠️'];
  if(/抽到|選擇/.test(t))return ['card','🃏'];
  if(/拉出/.test(t))return ['roll','🎰'];
  if(/休息站|收回/.test(t))return ['good','☕'];
  return ['','•'];
}
// 重大事件對應的音效（優先順序高的先播；同一次更新只播一個，避免太吵）。
const EVENT_SOUNDS=[[/獲勝/,'win',6],[/破產/,'bankrupt',5],[/達成目標|買下/,'win',4],[/搶下/,'steal',3],[/合作，雙方|結成策略聯盟/,'alliance',2],[/撞上罷工幽靈|系統仍被勒索/,'loss',2],[/季結算/,'settle',1]];
function eventSound(lines){
  let best=null;
  for(const x of lines){const t=splitLog(x).text;for(const [re,name,p] of EVENT_SOUNDS)if(re.test(t)){if(!best||p>best.p)best={name,p,text:t};break}}
  return best;
}
function toast(msg){let el=$('#toast');if(!el){el=document.createElement('div');el.id='toast';el.className='toast';el.setAttribute('role','status');document.body.appendChild(el)}el.textContent=msg;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),3200)}
function storeGet(key){try{return JSON.parse(localStorage.getItem(key))}catch{return null}}
function storeSet(key,v){try{v==null?localStorage.removeItem(key):localStorage.setItem(key,JSON.stringify(v))}catch{}}
function setConn(kind,text){const el=$('#conn');if(el){el.className=`conn ${kind}`;el.textContent=text}}

/* ---------- 瀏覽器直連（WebRTC，透過 PeerJS 套件） ----------
   大螢幕＝房主：在自己的瀏覽器裡執行遊戲規則，並以「房號」向配對伺服器登記。
   手機＝玩家：用房號找到房主並直接連線，只送出動作、接收畫面資料。
   配對伺服器只負責牽線，遊戲資料不經過它。預設使用 PeerJS 的公用配對伺服器；
   測試或自架時可在網址加 ?signal=主機:埠號 改用自己的配對伺服器。 */
const NET={
  roomIdPrefix:'life-board-online-v1-',   // 改了訊息格式就把版本號往上加，新舊版本不會進到同一間
  beatMs:4000,                            // 手機每 4 秒回報一次「我還在」
  offlineMs:15000,                        // 房主 15 秒沒收到就標成離線
  retryMs:3000
};
// 個人版／企業版共用同一套大螢幕與手機程式；企業版頁面在載入 common.js 前先定義 ONLINE_CFG 覆蓋這些設定。
const CFG=Object.assign({mode:'personal',prefix:NET.roomIdPrefix,saveKey:'life-board-online-host',tokenPrefix:'life-board-player-',joinPage:'join.html'},globalThis.ONLINE_CFG||{});
function signalOptions(){
  const raw=new URLSearchParams(location.search).get('signal');
  if(!raw)return {};
  const [host,port]=raw.split(':');
  return {host,port:Number(port)||443,path:'/',secure:location.protocol==='https:'&&!/^(localhost|127\.|192\.168\.|10\.)/.test(host)};
}
// 給手機的加入網址：同一個資料夾的 join.html，帶上房號（與測試用的配對伺服器設定）。
function joinLink(code){
  const url=new URL(CFG.joinPage,location.href);url.search='';url.hash='';
  url.searchParams.set('room',code);
  const signal=new URLSearchParams(location.search).get('signal');if(signal)url.searchParams.set('signal',signal);
  return url.href;
}
const linkReachable=()=>location.protocol.startsWith('http')&&!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
