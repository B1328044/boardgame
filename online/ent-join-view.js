// 企業版手機畫面：覆蓋 join.js 裡個人版的 joinForm、turnCard、meCard 等函式；連線與音效沿用 join.js。
'use strict';
const ENT_ROLES=[["auto","汽車製造商","🚘","製造業"],["electronics","電子製造商","💻","製造業"],["retail","百貨零售商","🛍️","消費業"],["bank","銀行","🏦","金融業"],["investment","投資公司","📈","金融業"],["energy","能源公司","⚡","能源與運輸"],["logistics","物流運輸公司","🚚","能源與運輸"],["property","房地產公司","🏙️","民生業"],["agriculture","農業食品公司","🌾","民生業"],["technology","科技服務公司","🧪","科技業"]].map(([id,name,icon,sector])=>({id,name,icon,sector}));
const ENT_WIN_TEXT={goal:'淨資產達標',progress:'季數用完，淨資產最高',bankruptcy:'有企業破產，對局提前結束'};
const coin=n=>n===null||n===undefined?'—':Math.round(n).toLocaleString('zh-TW');
const coinSigned=n=>`${n>=0?'+':'−'}${coin(Math.abs(n))}`;

function joinForm(){
  return `<section class="phone-card" id="join-form"><p class="eyebrow">加入房間</p><h2>經濟棋局 · 企業版</h2>
    <label class="field">房號<input id="code" maxlength="4" autocomplete="off" value="${h(code)}" placeholder="例如 AB12"></label>
    <label class="field">你的名字<input id="name" maxlength="16" placeholder="例如 小明"></label>
    <fieldset class="role-pick"><legend>選擇企業（每家企業只能一個人選，被選走會自動換一家，加入後還能改）</legend>${ENT_ROLES.map((r,i)=>`<label class="role-opt"><input type="radio" name="role" value="${r.id}" ${i===0?'checked':''}><span><b>${r.icon} ${h(r.name)}</b><small>${h(r.sector)}</small></span></label>`).join('')}</fieldset>
    <button class="primary big" data-a="join">加入 <span>→</span></button><p class="muted small"><a href="../index.html">☰ 回到選單</a></p></section>`;
}
function lobbyWait(){
  const taken=new Set(pub.seats.filter(s=>s.seatId!==priv.seatId).map(s=>s.roleId));
  const roleOpts=ENT_ROLES.filter(r=>!taken.has(r.id)).map(r=>`<option value="${r.id}" ${r.id===priv.roleId?'selected':''}>${r.icon} ${h(r.name)}</option>`).join('');
  const row=s=>{const r=ENT_ROLES.find(x=>x.id===s.roleId);return `<li class="seat-row"><span class="seat-icon">${r.icon}</span><span class="seat-name"><b>${h(s.name)}${s.seatId===priv.seatId?'（你）':''}</b><small>${h(r.name)}</small></span><span class="seat-tag ${s.isBot?'bot':s.connected?'on':'off'}">${s.isBot?h(s.botLabel):s.connected?'已連線':'離線'}</span></li>`};
  return `<section class="phone-card"><p class="eyebrow">已加入 · 房間 ${code}</p><h2>等待主持人開始</h2><label class="field">我的企業<select id="my-role">${roleOpts}</select></label><p class="muted">淨資產目標 ${coin(pub.targetWealth)} · 最多 ${pub.maxRounds} 季</p><h3>房間裡的玩家（${pub.seats.length}）</h3><ul class="seat-list small">${pub.seats.map(row).join('')}</ul></section>`;
}
function finishedCard(g){
  const winners=g.players.filter(p=>g.winnerIds.includes(p.id)),me=winners.some(w=>w.id===priv.playerId);
  return `<section class="phone-card turn ${me?'win':''}"><p class="eyebrow">對局結束</p><h2>${me?'🏆 你獲勝了！':`${h(winners.map(w=>w.name).join('、')||'無人')} 獲勝`}</h2><p>${h(ENT_WIN_TEXT[g.winReason]||'')}</p><p class="muted">等待主持人開始下一局。</p></section>`;
}
function entCard(g){
  const c=g.card;if(!c)return '';
  return `<div class="action-block"><h4>${h(c.scopeLabel)} · ${h(c.name)}</h4><p>${c.fallback?`${h(c.fallback)}，改抽個人事件。`:''}${h(c.desc||c.effects.join('、'))}（持續 ${c.duration} 季）</p></div>`;
}
function turnCard(g){
  const cur=g.players.find(p=>p.id===g.currentId),me=priv.me,ph=priv.phase,dis=busy?'disabled':'';
  if(!priv.isMyTurn)return `<section class="phone-card waiting"><p class="eyebrow">等待中</p><h2>輪到 ${h(cur.name)}</h2><p>${cur.roleName} · ${h({roll:'準備拉霸',adjust:'選擇 AEO 調整',strike:'停工中',draw:'準備抽卡',choice:'正在決定事件',manage:'經營中'}[g.phase]||'')}${cur.isBot?'（Bot）':''}</p>${g.card&&g.phase==='manage'?entCard(g):''}</section>`;
  const head=t=>`<section class="phone-card turn"><p class="eyebrow">輪到你了 · 第 ${g.round} 季</p><h2>${t}</h2>`;
  if(ph==='roll')return head('啟動拉霸')+`<p>兩個轉輪各 0–6，相加就是前進格數。罷工幽靈在第 ${g.ghostPosition} 格${me.shield?'，你有團體協約可抵銷一次':''}。${me.aeo?`AEO 認證：停定後可調整 ±1 格（剩 ${me.aeo} 次）。`:''}${me.stall?'⚠ 上回合拒付贖金，這回合系統會停擺。':''}</p><button class="primary big draw-btn" data-a="roll" ${dis}>🎰 拉霸</button></section>`;
  if(ph==='adjust'){const a=priv.adjust;return head(`拉出 ${a.dice}，要調整嗎？`)+`<p>AEO 認證（剩 ${a.left} 次）：選擇實際前進格數。罷工幽靈在第 ${g.ghostPosition} 格。</p><div class="choice-list">${a.options.map(o=>`<button class="choice-btn" data-a="ent-adjust" data-v="${o.value}" ${dis}><b>${o.value>0?'+1':o.value<0?'−1':'±0'} · 前進 ${o.steps} 格</b><small>停在第 ${o.to} 格${o.ghost?' · ⚠ 會撞上罷工幽靈':''}</small></button>`).join('')}</div></section>`}
  if(ph==='strike')return head(g.strikeCause==='ransomware'?'🔒 系統停擺':'👻 遇上罷工')+`<p>本季收入歸零、支出照付，這回合不能抽卡、聘僱、裁員或借貸。</p><button class="primary big" data-a="end" ${dis}>停工，交給下一位 →</button></section>`;
  if(ph==='draw')return head('抽一張事件卡')+`<p>停在第 ${cur.position} 格「${h(g.tiles[cur.position].label)}」。</p><button class="primary big draw-btn" data-a="draw" ${dis}>🃏 抽卡</button></section>`;
  if(ph==='choice'&&priv.choice){const c=priv.choice;return head(h(c.name))+`<p>${h(c.desc)}</p><div class="choice-list">${c.options.map(o=>`<button class="choice-btn" data-a="ent-choose" data-v="${h(o.value)}" ${dis}><b>${h(o.label)}</b></button>`).join('')}</div></section>`}
  // 經營階段
  const staff=me.staffOptions.map(o=>`<button class="choice-btn" data-a="staff" data-v="${o.delta}" ${dis}><b>${o.delta>0?`聘僱 ${o.delta} 人`:`裁員 ${-o.delta} 人`}</b><small>每季淨效果 ${coinSigned(o.net)}${o.severance?` · 資遣費 ${coin(o.severance)}`:''}${o.payback?` · 約 ${o.payback} 季回收`:''}${o.moraleHit?` · ⚠ 士氣 −${o.moraleHit}`:''}</small></button>`).join('');
  return head('經營你的公司')+`${g.card?entCard(g):''}
    <div class="action-block"><h4>員工 · 目前 ${me.headcount} 人（基準 ${me.base}）· 士氣 ${me.morale}</h4><p>本季最多再裁 ${me.layoffRoom} 人，市場可聘 ${me.pool} 人，資遣費每人 ${me.severance}。</p><div class="choice-list staff-grid">${staff||'<p class="muted">目前沒有可調整的人數。</p>'}</div></div>
    <div class="action-block"><h4>銀行借貸 · 未償 ${coin(me.debt)}</h4><p>借款增加現金與負債；政策利率 ${me.fedRate}%。${me.loanBlocked?'⚠ 目前限制新增風險放款。':`銀行可借 ${coin(me.bankLiquid)}。`}</p><div class="action-row"><input id="ent-loan" type="number" min="1" step="1" value="100" aria-label="金額"><button data-a="ent-loan" ${dis}>借款</button><button data-a="ent-repay" ${dis}>還款</button></div></div>
    ${me.isBank?`<div class="action-block"><h4>銀行壞帳 · 目前 ${coin(me.npl)}</h4><div class="action-row"><input id="ent-bad" type="number" min="1" step="1" value="20" aria-label="金額"><button data-a="ent-bad-mark" ${dis}>認列</button><button data-a="ent-bad-recover" ${dis}>收回</button></div></div>`:''}
    <button class="primary big" data-a="end" ${dis}>${g.turnIndex===g.players.length-1?'結算本季 →':'交給下一位 →'}</button></section>`;
}
function meCard(){
  const me=priv.me;if(!me)return '';
  const badges=[me.shield?'<span class="badge good">🛡 團體協約</span>':'',me.aeo?`<span class="badge good">AEO ±1 · ${me.aeo} 次</span>`:'',me.stall?'<span class="badge warn">🔒 下回合停擺</span>':'',me.hedgeUntil?`<span class="badge good">避險至第 ${me.hedgeUntil} 季</span>`:'',me.leaseUntil?`<span class="badge">租回至第 ${me.leaseUntil} 季</span>`:'',me.equityUntil?`<span class="badge">增資分配至第 ${me.equityUntil} 季</span>`:'',`<span class="badge ${me.morale<me.attritionMorale?'warn':''}">士氣 ${me.morale}</span>`,`<span class="badge ${me.macro>1.005?'good':me.macro<.995?'warn':''}">景氣 ×${me.macro.toFixed(2)}</span>`].filter(Boolean).join('');
  return `<section class="phone-card me"><div class="me-head"><span class="role-icon">${me.icon}</span><div><h3>${h(priv.name)}</h3><small>${h(me.roleName)} · ${h(me.sector)} · 只有你看得到</small></div></div>
    <div class="wealth-line"><span>淨資產</span><strong>${coin(me.netWorth)}</strong></div>
    <div class="goal-line"><div class="goal-line-head"><span>目標 ${coin(me.target)}</span><b>${me.progress}%</b></div><div class="goal-track"><i style="width:${me.progress}%"></i></div></div>
    <div class="player-badges">${badges}</div>
    <div class="finance-grid"><div class="finance-stat"><span>現金</span><strong>${coin(me.cash)}</strong></div><div class="finance-stat"><span>投資資產</span><strong>${coin(me.assetValue)}</strong></div><div class="finance-stat negative"><span>借款</span><strong>${coin(me.debt)}</strong></div><div class="finance-stat"><span>本季收入</span><strong>${coinSigned(me.revenue)}</strong></div><div class="finance-stat negative"><span>本季成本</span><strong>${coinSigned(-me.costs)}</strong></div><div class="finance-stat ${me.netProfit<0?'negative':''}"><span>預估淨利</span><strong>${coinSigned(me.netProfit)}</strong></div></div>
    <details class="finance-details"><summary>損益明細與作用中的事件（${me.events.length}）</summary><table class="flow-table"><tbody>${me.flows.map(l=>`<tr><td>${h(l.label)}</td><td>${coinSigned(l.amount)}</td></tr>`).join('')}</tbody></table><table class="flow-table"><tbody>${me.events.map(e=>`<tr><td>${h(e.name)}<br><small>${h(e.scope)}${e.note?` · ${h(e.note)}`:''}</small></td><td>剩 ${e.left} 季</td></tr>`).join('')||'<tr><td>沒有</td></tr>'}</tbody></table>${me.groups.length?`<p class="muted small">客群：${me.groups.map(h).join('、')}</p>`:''}</details></section>`;
}
function modeAction(a,b){
  const val=id=>Number($(id)?.value);
  if(a==='ent-adjust'){act({type:'adjust',value:Number(b.dataset.v)});return true}
  if(a==='ent-choose'){act({type:'choose',value:b.dataset.v});return true}
  if(a==='staff'){act({type:'staff',delta:Number(b.dataset.v)});return true}
  if(a==='ent-loan'){act({type:'loan',amount:val('#ent-loan')});return true}
  if(a==='ent-repay'){act({type:'repay',amount:val('#ent-repay')||val('#ent-loan')});return true}
  if(a==='ent-bad-mark'){act({type:'bad',amount:val('#ent-bad')});return true}
  if(a==='ent-bad-recover'){act({type:'bad',amount:-val('#ent-bad')});return true}
  return false;
}
// 手機音效與震動：只處理跟自己有關的事。
function phoneFx(pp,pv){
  const g=pub?.game,pg=pp?.game,me=priv?.me,pm=pv?.me,name=priv?.name||'';
  const ck=g?.card?`${g.round}-${g.turnIndex}-${g.card.id}`:null;
  if(pp&&priv?.isMyTurn&&!pv?.isMyTurn){Sound.play('myTurn');document.body.classList.remove('turn-flash');void document.body.offsetWidth;document.body.classList.add('turn-flash')}
  if(!g||!pg||!me||!pm){fxLogLen=g?g.logCount:null;fxCardKey=ck;return}
  const myCard=ck&&ck!==fxCardKey&&g.currentId===priv.playerId;
  if(myCard){Sound.play('flip');Sound.play(g.card.sound)}
  fxCardKey=ck;
  const fresh=fxLogLen!==null&&g.logCount>fxLogLen?g.log.slice(0,g.logCount-fxLogLen).map(x=>splitLog(x).text):[];
  fxLogLen=g.logCount;
  let snd=null,vib=null;
  const won=pub.status!=='playing'&&g.winnerIds.includes(priv.playerId);
  for(const t of fresh){
    if(won&&/結算完成/.test(t)){snd='win';vib=[100,50,100,50,300];break}
    if(t.startsWith(name)&&/罷工幽靈！|停擺/.test(t)){snd=snd||'loss';vib=vib||[200,100,200]}
    else if(t.includes(`搶下${name}的大客戶`)){snd=snd||'steal';vib=vib||[80,60,80,60,80]}
    else if(/結成策略聯盟/.test(t)&&(t.startsWith(name)||t.includes(`與${name}結成`))){snd=snd||'alliance';vib=vib||[60,40,60]}
    else if(/結算完成/.test(t)){vib=vib||[120]}
  }
  const delay=myCard?700:0;
  if(snd)setTimeout(()=>Sound.play(snd),delay);
  if(vib)setTimeout(()=>Sound.vibrate(vib),delay);
  const diff=me.cash-pm.cash;
  if(Math.abs(diff)>=1)setTimeout(()=>Sound.play(diff>0?'coinUp':'coinDown'),snd?delay+900:delay);
}
