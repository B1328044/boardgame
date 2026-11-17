import test from 'node:test';
import assert from 'node:assert/strict';
import {ROLES,BOARD,FORTUNE_CARDS,MARKET_EVENTS,CHANCE_CARDS,LOSS_CARDS} from './data.js';
import {createGame,rollDice,drawEvent,resolveChoice,endTurn,setOvertime,repayDebt,borrow,buyCar,carOffer,buyHouse,canBuyHouse,housePlan,chanceDeck,computeQuarter,settleRound,totalDebt,goalProgress,evaluateCentralBank,exportGame,importGame,chanceOptions,cardById,economyRegime,tileType,respond,responder,respondOptions,stealChance,debtDue,quarterlyPayments,baseSalary} from './engine.js';

// 角色版（B）：天命卡固定發效果最中性的幾張，避免干擾數值。
const NEUTRAL=['D07','D10','D02','D04','D03','D06','D09','D01'];
const game=(roles=['low','office'],extra={})=>createGame({players:roles.map((roleId,i)=>({name:`P${i+1}`,roleId,destinyId:NEUTRAL[i]})),seed:42,variant:'roles',...extra});
// 把目前玩家放到指定類型的格子並抽指定卡。
const land=(s,type,cardId)=>{s.queue=[{kind:type}];s.dice=1;s.phase='draw';return drawEvent(s,cardId)};

test('角色可以重複、2–8 人，起始現金與負債依角色設定',()=>{
  const s=game(['exec','exec','free']);
  assert.equal(s.players.length,3);
  assert.equal(s.players[0].cash,ROLES.find(r=>r.id==='exec').cash);
  assert.deepEqual(s.players[0].debts.map(d=>d.name),['房貸','車貸']);
  assert.throws(()=>game(['low']),/2 至 8/);
  assert.throws(()=>createGame({players:[{name:'A',roleId:'low'},{name:'A',roleId:'low'}]}),/重複/);
});
test('棋盤有 32 格：家鄉、機場、交流道、出口，機會 11、好運 8、市場 5、災難 4',()=>{
  const count=t=>BOARD.filter(x=>x.type===t).length;
  assert.equal(BOARD.length,32);assert.equal(BOARD[0].type,'home');
  assert.deepEqual([count('chance'),count('fortune'),count('market'),count('loss')],[11,8,5,4]);
  const s=game();assert.equal(s.variant,'roles');assert.ok(!chanceDeck(s).some(c=>c.id.startsWith('J')),'角色版沒有工作卡');
});
test('Fortune 卡一定獲利',()=>{
  for(const c of FORTUNE_CARDS)for(const r of ROLES){const s=game([r.id,'low']);const before=s.players[0].cash;land(s,'fortune',c.id);assert.ok(s.players[0].cash>before,`${c.id} ${r.id}`)}
});
test('每季最多一張市場事件，之後改抽機會卡',()=>{
  const s=game(['low','office']);
  assert.equal(land(s,'market','M10').type,'market');
  s.phase='manage';endTurn(s);
  const second=land(s,'market');
  assert.equal(second.type,'chance');assert.match(second.note,/市場事件/);
});
test('市場事件：基本工資只讓底層永久加薪；意外升息立即調整利率',()=>{
  const s=game(['low','exec']);
  land(s,'market','M02');
  assert.equal(s.players[0].salaryFactor,1.08);assert.equal(s.players[1].salaryFactor,1);
  const t=game(['low','exec']);land(t,'market','M06');assert.equal(t.economy.rate,2.5);
});
test('機會卡：先付本金再依機率結算；現金不足不能選',()=>{
  const s=game(['low','office']);land(s,'chance','C07');
  const opts=chanceOptions(s,s.players[0],cardById('C07'));
  assert.equal(opts[1].affordable,false,'底層只有 5 萬，付不起 30 萬');
  assert.throws(()=>resolveChoice(s,'player-1',1),/現金不足/);
  resolveChoice(s,'player-1',2);assert.equal(s.phase,'manage');assert.equal(s.players[0].cash,5);
  const t=game(['exec','low']);land(t,'chance','C03');resolveChoice(t,'player-1',0);
  const p=t.players[0];assert.equal(p.cash,70);assert.ok(p.investments.length===1||p.investments.length===0);
});
test('Loss 卡：有保險只付兩成；車禍會跳過下一回合',()=>{
  const s=game(['exec','low']);s.players[0].insured=true;land(s,'loss','L01');assert.equal(s.players[0].cash,96);
  const t=game(['exec','low']);land(t,'loss','L04');assert.equal(t.players[0].cash,85);assert.equal(t.players[0].waitTurns,1);
  endTurn(t);rollDice(t,[0,0]);endTurn(t);assert.equal(t.phase,'skip');assert.throws(()=>rollDice(t));
});
test('季結算：收入、生活費、利息與攤還正確入帳',()=>{
  const s=game(['low','office']);const p=s.players[0];
  const q=computeQuarter(s,p,{random:.5});
  assert.equal(q.earned,9);assert.equal(q.debt,1.5);
  const debt=totalDebt(p);settleRound(s);
  assert.ok(totalDebt(p)<debt);assert.equal(s.round,2);
  assert.equal(p.history.length,1);
});
test('加班提高收入並累積疲勞；疲勞過高收入下降',()=>{
  const s=game(['office','low']);s.phase='manage';const p=s.players[0];
  const base=computeQuarter(s,p).earned;setOvertime(s,'player-1',1);
  assert.equal(computeQuarter(s,p).earned,Math.round(base*1.15*100)/100);
  p.fatigue=75;p.overtime=0;assert.equal(computeQuarter(s,p).earned,Math.round(base*.8*100)/100);
});
test('目標：底層還清負債且存款 ≥ 50 萬即獲勝',()=>{
  const s=game(['low','office']);s.phase='manage';const p=s.players[0];p.cash=90;
  repayDebt(s,'player-1',p.debts[0].id,100);
  assert.equal(totalDebt(p),0);assert.equal(s.status,'finished');assert.deepEqual(s.winnerIds,['player-1']);
});
test('目標：上班族現金足夠就能一次付清買車',()=>{
  const s=game(['office','low']);s.phase='manage';const p=s.players[0];
  assert.equal(carOffer(s,p).cashOk,false);assert.throws(()=>buyCar(s,'player-1','cash'),/現金不足/);
  p.cash=120;buyCar(s,'player-1','cash');assert.equal(p.owns.car,true);assert.equal(s.status,'finished');
  const t=game(['office','low']);t.phase='manage';t.players[0].cash=60;buyCar(t,'player-1','loan');assert.equal(t.status,'playing','貸款買車不算達成目標');
});
test('目標：高管需頭期款且月付不超過收入 50%；還清車貸後才核貸',()=>{
  const s=game(['exec','low']);s.phase='manage';const p=s.players[0];p.cash=400;
  const h=housePlan(s,p);assert.ok(h.dsr>50,`還有車貸時 DSR ${h.dsr}`);assert.equal(canBuyHouse(s,p).ok,false);
  repayDebt(s,'player-1','auto-1',60);
  assert.ok(housePlan(s,p).dsr<=50);buyHouse(s,'player-1');assert.equal(p.owns.house,true);assert.equal(s.status,'finished');
});
test('目標：自由業連續 5 季收入 ≥ 18 萬',()=>{
  const s=game(['free','low']);const p=s.players[0];p.salaryFactor=4;
  for(let i=0;i<4;i++){settleRound(s);assert.equal(s.status,'playing')}
  assert.equal(p.streak,4);settleRound(s);assert.equal(s.status,'finished');assert.deepEqual(s.winnerIds,['player-1']);
});
test('AI 央行：通膨 ≥ 4% 升息 0.5，並有 2 季冷卻',()=>{
  const s=game();const snap={...s.economy,inflation:4.5,prevStock:100};
  const r=evaluateCentralBank(s,snap);assert.equal(r.chosen.id,'R1');assert.equal(r.cooling,false);
  s.lastRateChangeRound=1;s.round=2;assert.equal(evaluateCentralBank(s,snap).cooling,true);
  s.round=3;assert.equal(evaluateCentralBank(s,snap).cooling,false);
});
test('現金不足自動動用信用貸款；額度用盡就破產，最後一人獲勝',()=>{
  const s=game(['low','office']);const p=s.players[0];p.cash=-5;settleRound(s);
  assert.ok(p.debts.some(d=>d.type==='credit'));assert.equal(p.bankrupt,false);
  p.cash=-500;settleRound(s);assert.equal(p.bankrupt,true);assert.equal(s.status,'finished');assert.deepEqual(s.winnerIds,['player-2']);
});
test('手動信用貸款受額度限制',()=>{
  const s=game(['office','low']);s.phase='manage';borrow(s,'player-1',20);
  assert.equal(s.players[0].cash,35);assert.throws(()=>borrow(s,'player-1',20),/額度/);
});
test('達到季數上限時，目標進度最高者獲勝',()=>{
  const s=game(['low','office'],{maxRounds:4});s.players[1].cash=90;
  for(let i=0;i<4;i++)settleRound(s);
  assert.equal(s.status,'finished');assert.equal(s.winReason,'progress');assert.deepEqual(s.winnerIds,['player-2']);
  assert.ok(goalProgress(s,s.players[1])>goalProgress(s,s.players[0]));
});
test('所有卡片都能抽出並結算，不會拋出錯誤',()=>{
  for(const r of ROLES){
    for(const c of MARKET_EVENTS){const s=game([r.id,'low']);land(s,'market',c.id)}
    for(const c of LOSS_CARDS){const s=game([r.id,'low']);land(s,'loss',c.id)}
    for(const c of CHANCE_CARDS){const s=game([r.id,'exec']);s.players[0].cash=500;land(s,'chance',c.id);const n=c.options.length;for(let i=0;i<n;i++){const t=importGame(exportGame(s));resolveChoice(t,'player-1',i)}}
  }
});
test('存檔可以匯出與匯入',()=>{
  const s=game();rollDice(s,[1,2]);const t=importGame(exportGame(s));
  assert.equal(t.players[0].position,3);assert.equal(t.variant,'roles');assert.throws(()=>importGame('{"version":1}'),/格式/);
});

/* ---------- 互動卡與景氣棋盤 ---------- */
// 讓接下來的亂數依序符合條件（例如 [x=>x<.75] 代表下一個亂數小於 0.75），方便測試機率結果。
function forceRandom(s,preds){
  for(let seed=1;seed<2e6;seed++){
    let x=seed|0,ok=true;
    for(const f of preds){x^=x<<13;x^=x>>>17;x^=x<<5;x|=0;if(!f((x>>>0)/4294967296)){ok=false;break}}
    if(ok){s.rng=seed;return}
  }
  throw Error('找不到符合的亂數');
}
const effect=(p,src)=>p.effects.find(x=>x.source===src);
test('C13 合作：邀請 → 對方答應 → 75% 順利，雙方收入 +15%，持續 3 季',()=>{
  const s=game(['office','low','free']);land(s,'chance','C13');
  const opts=chanceOptions(s,s.players[0],cardById('C13'));
  assert.deepEqual(opts.map(o=>o.label),['邀請 P2 合作','邀請 P3 合作','自己來']);
  const before=computeQuarter(s,s.players[1]).earned;
  resolveChoice(s,'player-1',0);
  assert.equal(s.phase,'respond');assert.equal(responder(s).id,'player-2');assert.match(respondOptions(s).question,/P1邀請你合作/);
  assert.throws(()=>respond(s,'player-3',true),/不需要你回覆/);
  forceRandom(s,[x=>x<.75]);respond(s,'player-2',true);
  assert.equal(s.phase,'manage');
  assert.equal(computeQuarter(s,s.players[1]).earned,Math.round(before*1.15*100)/100);
  assert.equal(effect(s.players[0],'C13').partnerId,'player-2');assert.equal(effect(s.players[0],'C13').until,3);
  s.round=4;assert.equal(computeQuarter(s,s.players[1]).earned,before,'第 4 季合作結束');
});
test('C13 合作：25% 鬧翻，雙方收入 −10%，持續 2 季，不算合作關係',()=>{
  const s=game(['office','low']);land(s,'chance','C13');
  const before=computeQuarter(s,s.players[1]).earned;
  resolveChoice(s,'player-1',0);forceRandom(s,[x=>x>=.75]);respond(s,'player-2',true);
  assert.match(s.lastResult.text,/鬧翻/);
  assert.equal(computeQuarter(s,s.players[1]).earned,Math.round(before*.9*100)/100);
  assert.equal(effect(s.players[0],'C13'),undefined);assert.equal(effect(s.players[0],'C13-fallout').until,2);
});
test('C13 拒絕：可以改邀另一位一次；邀到人的話，拒絕的人收入 −5%；兩人局拒絕沒有風險',()=>{
  const s=game(['office','low','free']);land(s,'chance','C13');
  resolveChoice(s,'player-1',0);respond(s,'player-2',false);
  assert.equal(s.phase,'choice');
  const opts=chanceOptions(s,s.players[0],cardById('C13'));
  assert.equal(opts[0].reason,'已經拒絕過你');assert.equal(opts[1].label,'改邀 P3 合作');assert.ok(opts[1].affordable);
  resolveChoice(s,'player-1',1);forceRandom(s,[x=>x<.75]);respond(s,'player-3',true);
  assert.equal(effect(s.players[1],'C13-decline').income,-5);assert.equal(effect(s.players[1],'C13-decline').until,2);
  // 第二次也被拒絕：這張卡結束，不能再邀
  const t=game(['office','low','free']);land(t,'chance','C13');
  resolveChoice(t,'player-1',0);respond(t,'player-2',false);resolveChoice(t,'player-1',1);respond(t,'player-3',false);
  assert.equal(t.phase,'manage');assert.match(t.lastResult.text,/沒找到合作夥伴/);
  assert.ok(t.players.every(p=>!p.effects.length));
  const two=game(['office','low']);land(two,'chance','C13');resolveChoice(two,'player-1',0);
  assert.match(respondOptions(two).no.detail,/兩人局拒絕沒有風險/);
  respond(two,'player-2',false);assert.equal(two.phase,'manage');
});
test('C13 同一時間只能有一個合作；合作期間災難損失（保險後）由夥伴分擔 20%',()=>{
  const s=game(['office','low','free']);land(s,'chance','C13');
  resolveChoice(s,'player-1',0);forceRandom(s,[x=>x<.75]);respond(s,'player-2',true);
  s.turnIndex=2;land(s,'chance','C13');
  const opts=chanceOptions(s,s.players[2],cardById('C13'));
  assert.equal(opts[0].reason,'已經有合作對象');assert.equal(opts[1].reason,'已經有合作對象');
  s.phase='manage';s.pendingChoice=null;
  s.turnIndex=0;const [me,ally]=s.players,c1=me.cash,c2=ally.cash;
  land(s,'loss','L01');                      // 重病住院 20 萬，沒有保險
  assert.equal(me.cash,c1-16);assert.equal(ally.cash,c2-4);assert.match(s.lastResult.text,/P2分擔 4 萬/);
});
test('有人破產：合作直接結束，另一方不用負責；他搶來或被搶的案子也結束',()=>{
  const s=game(['office','low','free']);land(s,'chance','C13');
  resolveChoice(s,'player-1',0);forceRandom(s,[x=>x<.75]);respond(s,'player-2',true);
  s.players[2].flatIncomes.push({amount:2,until:5,label:'搶下的案子',victimId:'player-2'});
  s.players[1].cash=-999;settleRound(s);
  assert.equal(s.players[1].bankrupt,true);
  assert.equal(effect(s.players[0],'C13'),undefined);assert.equal(s.players[2].flatIncomes.length,0);
});
test('C14 搶案：成功率看雙方薪水（20%～80%），投標費 1 萬；搶到後 2 季每季轉走對方薪資 10%（最多 3 萬）',()=>{
  const s=game(['low','exec','office']);
  assert.equal(stealChance(s.players[0],s.players[1]),.2);assert.equal(stealChance(s.players[1],s.players[0]),.8);
  assert.equal(stealChance(s.players[2],s.players[1]),Math.round(16.5/(16.5+45)*100)/100);
  land(s,'chance','C14');const cash=s.players[0].cash;
  resolveChoice(s,'player-1',0);
  assert.equal(s.players[0].cash,cash-1);assert.equal(s.phase,'respond');assert.equal(responder(s).id,'player-2');
  forceRandom(s,[x=>x<.2]);respond(s,'player-2',false);
  const me=computeQuarter(s,s.players[0]),them=computeQuarter(s,s.players[1]);
  assert.deepEqual(me.lines.find(l=>l.label==='搶下的案子'),{label:'搶下的案子',amount:3});
  assert.deepEqual(them.lines.find(l=>l.label==='被搶走的案子'),{label:'被搶走的案子',amount:-3});
  assert.equal(s.players[1].stealImmuneUntil,4,'搶完 2 季內不能再被選');
  s.round=3;assert.equal(computeQuarter(s,s.players[0]).lines.some(l=>l.label==='搶下的案子'),false);
  s.turnIndex=2;land(s,'chance','C14');
  assert.match(chanceOptions(s,s.players[2],cardById('C14'))[1].reason,/剛被搶過/);
});
test('C14 反制：對方花 1 萬讓成功率減半；沒搶到的話投標費歸對方；付不起就不能反制，直接結算',()=>{
  const s=game(['office','low']);land(s,'chance','C14');
  resolveChoice(s,'player-1',0);const r=s.pendingResponse.chance,t=s.players[1],c=t.cash;
  forceRandom(s,[x=>x>=r/2]);respond(s,'player-2',true);
  assert.match(s.lastResult.text,/反制，成功率降到/);assert.match(s.lastResult.text,/投標費 1 萬 歸P2/);
  assert.equal(t.cash,c-1+1);
  const u=game(['office','low']);u.players[1].cash=.5;land(u,'chance','C14');
  resolveChoice(u,'player-1',0);assert.equal(u.phase,'manage','付不起反制費，不用問直接結算');
  const v=game(['office','low']);v.players[1].unemployedRounds=1;land(v,'chance','C14');
  const o=chanceOptions(v,v.players[0],cardById('C14'))[0];
  assert.equal(o.reason,'失業中，沒有案子可搶');assert.throws(()=>resolveChoice(v,'player-1',0),/失業中/);
});
test('背叛：搶自己的合作夥伴，合作立刻結束、不能再合作；對方 70% 告贏，賠償＝剩餘季數 × 15% × 對方薪資，案子還回去',()=>{
  const s=game(['exec','office','low']);land(s,'chance','C13');
  resolveChoice(s,'player-1',0);forceRandom(s,[x=>x<.75]);respond(s,'player-2',true);
  s.phase='manage';s.pendingChoice=null;
  land(s,'chance','C14');
  const opt=chanceOptions(s,s.players[0],cardById('C14'))[0];
  assert.equal(opt.betray,true);assert.match(opt.label,/背叛合作/);
  const [me,ally]=s.players,c1=me.cash,c2=ally.cash;
  resolveChoice(s,'player-1',0);forceRandom(s,[x=>x<.4,x=>x<.7]);respond(s,'player-2',false);
  const comp=Math.round(3*.15*baseSalary(ally)*100)/100;
  assert.ok(Math.abs(me.cash-(c1-1-comp))<.02);assert.ok(Math.abs(ally.cash-(c2+comp))<.02);
  assert.equal(effect(me,'C13'),undefined);assert.equal(effect(ally,'C13'),undefined);
  assert.equal(me.flatIncomes.length,0,'告贏後案子還回去');assert.equal(ally.flatIncomes.length,0);
  assert.deepEqual(me.feuds,['player-2']);
  s.phase='manage';land(s,'chance','C13');
  assert.match(chanceOptions(s,me,cardById('C13'))[0].reason,/背叛/);
  // 沒搶到也算背叛；官司敗訴就沒有賠償
  const t=game(['exec','office']);land(t,'chance','C13');resolveChoice(t,'player-1',0);forceRandom(t,[x=>x<.75]);respond(t,'player-2',true);
  t.phase='manage';land(t,'chance','C14');resolveChoice(t,'player-1',0);
  const d1=t.players[0].cash;forceRandom(t,[x=>x>=.9,x=>x>=.7]);respond(t,'player-2',false);
  assert.match(t.lastResult.text,/沒搶到/);assert.match(t.lastResult.text,/敗訴/);assert.equal(effect(t.players[0],'C13'),undefined);assert.equal(t.players[0].cash,d1);
});
test('房貸：利率上升到月付金付不起利息時，預估與結算都要把利息繳足',()=>{
  const s=game(['exec','low']);s.economy.rate=6;
  const p=s.players[0],m=p.debts.find(d=>d.type==='mortgage'),{interest,pay}=debtDue(s,m);
  assert.equal(interest,Math.round(900*6.6/400*100)/100);assert.ok(interest>m.payment);assert.equal(pay,interest);
  assert.ok(quarterlyPayments(s,p)>=interest+4.5);
  const q=computeQuarter(s,p,{random:.5}),cash=p.cash;settleRound(s);
  assert.equal(m.balance,900,'只夠付利息，本金不變');
  assert.ok(Math.abs(p.cash-(cash+q.net))<.02,'實際扣款＝預估扣款');
});
test('景氣衰退時第 3、21 格市場格變成災難格；過熱時好運獎金 ×1.5',()=>{
  const s=game(['low','office']);
  assert.equal(economyRegime(s),'normal');assert.equal(tileType(s,3),'market');
  s.economy.growth=-3;assert.equal(economyRegime(s),'recession');
  assert.equal(tileType(s,3),'loss');assert.equal(tileType(s,21),'loss');assert.equal(tileType(s,15),'market');
  s.players[0].position=20;rollDice(s,[0,1]);assert.equal(s.phase,'draw');
  const d=drawEvent(s,'L06');assert.equal(d.type,'loss');assert.match(d.note,/衰退/);
  const t=game(['low','office']);t.economy.growth=4;assert.equal(economyRegime(t),'boom');
  land(t,'fortune','F07');assert.equal(t.players[0].cash,5+15);
});
