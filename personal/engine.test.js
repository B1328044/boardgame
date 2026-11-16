import test from 'node:test';
import assert from 'node:assert/strict';
import {ROLES,BOARD,FORTUNE_CARDS,MARKET_EVENTS,CHANCE_CARDS,LOSS_CARDS} from './data.js';
import {createGame,rollDice,drawEvent,resolveChoice,endTurn,setOvertime,repayDebt,borrow,buyGoal,canBuyGoal,housePlan,computeQuarter,settleRound,totalDebt,goalProgress,evaluateCentralBank,exportGame,importGame,chanceOptions,cardById,economyRegime,tileType} from './engine.js';

const game=(roles=['low','office'],extra={})=>createGame({players:roles.map((roleId,i)=>({name:`P${i+1}`,roleId})),seed:42,...extra});
// 把目前玩家放到指定類型的格子並抽指定卡。
const land=(s,type,cardId)=>{const i=BOARD.findIndex(t=>t.type===type);const p=s.players[s.turnIndex];p.position=i;s.dice=1;s.phase='draw';return drawEvent(s,cardId)};

test('角色可以重複、2–8 人，起始現金與負債依角色設定',()=>{
  const s=game(['exec','exec','free']);
  assert.equal(s.players.length,3);
  assert.equal(s.players[0].cash,ROLES.find(r=>r.id==='exec').cash);
  assert.deepEqual(s.players[0].debts.map(d=>d.name),['房貸','車貸']);
  assert.throws(()=>game(['low']),/2 至 8/);
  assert.throws(()=>createGame({players:[{name:'A',roleId:'low'},{name:'A',roleId:'low'}]}),/重複/);
});
test('棋盤有 24 格：機會 9、好運 6、市場 5、災難 3',()=>{
  const count=t=>BOARD.filter(x=>x.type===t).length;
  assert.equal(BOARD.length,24);assert.equal(BOARD[0].type,'start');
  assert.deepEqual([count('chance'),count('fortune'),count('market'),count('loss')],[9,6,5,3]);
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
  const t=game(['exec','low']);land(t,'loss','L04');assert.equal(t.players[0].cash,85);assert.equal(t.players[0].skipNext,true);
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
  assert.equal(canBuyGoal(s,p).ok,false);assert.throws(()=>buyGoal(s,'player-1'),/現金不足/);
  p.cash=120;buyGoal(s,'player-1');assert.equal(p.owns.car,true);assert.equal(s.status,'finished');
});
test('目標：高管需頭期款且月付不超過收入 50%；還清車貸後才核貸',()=>{
  const s=game(['exec','low']);s.phase='manage';const p=s.players[0];p.cash=400;
  const h=housePlan(s,p);assert.ok(h.dsr>50,`還有車貸時 DSR ${h.dsr}`);assert.equal(canBuyGoal(s,p).ok,false);
  repayDebt(s,'player-1','auto-1',60);
  assert.ok(housePlan(s,p).dsr<=50);buyGoal(s,'player-1');assert.equal(p.owns.house,true);assert.equal(s.status,'finished');
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
  assert.equal(t.players[0].position,3);assert.throws(()=>importGame('{"version":1}'),/格式/);
});

/* ---------- 互動卡與景氣棋盤 ---------- */
test('C13 找人合作：選項依其他玩家展開，雙方收入都 +15%，持續 3 季',()=>{
  const s=game(['office','low','free']);land(s,'chance','C13');
  const opts=chanceOptions(s,s.players[0],cardById('C13'));
  assert.deepEqual(opts.map(o=>o.label),['與 P2 合作','與 P3 合作','自己來']);
  const before=computeQuarter(s,s.players[1]).earned;
  resolveChoice(s,'player-1',0);
  assert.equal(computeQuarter(s,s.players[1]).earned,Math.round(before*1.15*100)/100);
  assert.ok(s.players[0].effects.some(x=>x.source==='C13'&&x.until===3));
  s.round=4;assert.equal(computeQuarter(s,s.players[1]).earned,before,'第 4 季合作結束');
});
test('C14 搶案子：2 季內把對方薪資 10%（每季最多 3 萬）轉成自己的收入',()=>{
  const s=game(['low','exec']);land(s,'chance','C14');
  resolveChoice(s,'player-1',0);
  const me=computeQuarter(s,s.players[0]),them=computeQuarter(s,s.players[1]);
  assert.deepEqual(me.lines.find(l=>l.label==='搶下的案子'),{label:'搶下的案子',amount:3});
  assert.deepEqual(them.lines.find(l=>l.label==='被搶走的案子'),{label:'被搶走的案子',amount:-3});
  s.round=3;assert.equal(computeQuarter(s,s.players[0]).lines.some(l=>l.label==='搶下的案子'),false);
});
test('景氣衰退時第 8、17 格市場格變成災難格；過熱時好運獎金 ×1.5',()=>{
  const s=game(['low','office']);
  assert.equal(economyRegime(s),'normal');assert.equal(tileType(s,8),'market');
  s.economy.growth=-3;assert.equal(economyRegime(s),'recession');
  assert.equal(tileType(s,8),'loss');assert.equal(tileType(s,17),'loss');assert.equal(tileType(s,3),'market');
  s.players[0].position=7;rollDice(s,[0,1]);assert.equal(s.phase,'draw');
  const d=drawEvent(s,'L06');assert.equal(d.type,'loss');assert.match(d.note,/衰退/);
  const t=game(['low','office']);t.economy.growth=4;assert.equal(economyRegime(t),'boom');
  land(t,'fortune','F07');assert.equal(t.players[0].cash,5+15);
});
