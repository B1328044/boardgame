import test from 'node:test';
import assert from 'node:assert/strict';
import {BOARD,HIGHWAY,ABROAD,JOBS,DESTINIES,START,GOAL,FORTUNE_CARDS,MARKET_EVENTS,CHANCE_CARDS,LOSS_CARDS,ABROAD_CARDS} from './data.js';
import {createGame,drawDestiny,rollDice,drawEvent,resolveChoice,takeExam,endTurn,setOvertime,repayDebt,borrow,buyCar,carOffer,computeQuarter,settleRound,totalDebt,netWorth,goalProgress,evaluateCentralBank,exportGame,importGame,chanceOptions,chanceDeck,cardById,movementPath,ticketPrice,jobOf} from './engine.js';

const game=(n=2,extra={},destinies=[])=>createGame({players:Array.from({length:n},(_,i)=>({name:`P${i+1}`,destinyId:destinies[i]})),seed:42,dealDestinies:true,...extra});
// 讓目前玩家在指定位置（預設主地圖）抽指定卡。
const draw=(s,kind,cardId)=>{s.queue=[{kind}];s.phase='draw';return drawEvent(s,cardId)};
const offer=(s,cardId)=>{draw(s,'chance',cardId);return chanceOptions(s,s.players[s.turnIndex],cardById(cardId))};
const at=(s,i,track='main')=>{const p=s.players[s.turnIndex];p.track=track;p.position=i;return p};

test('所有人相同開局：基本工作、相同現金、學貸是明牌；天命卡不重複',()=>{
  const s=game(8);
  for(const p of s.players){
    assert.equal(p.jobId,null);assert.equal(jobOf(p).name,'基本工作');assert.equal(p.cash,START.cash);
    assert.equal(p.debts[0].name,'學貸');assert.equal(p.debts[0].public,true);
  }
  assert.equal(new Set(s.players.map(p=>p.destinyId)).size,8);
  assert.throws(()=>game(1),/2 至 8/);
  assert.throws(()=>createGame({players:[{name:'A'},{name:'A'}],dealDestinies:true}),/重複/);
});
test('天命卡「學霸」學貸減半',()=>{
  const s=game(2,{},['D09','D01']);
  assert.equal(totalDebt(s.players[0]),START.debts[0].balance/2);assert.equal(totalDebt(s.players[1]),START.debts[0].balance);
});
test('主地圖：0 為家鄉、6 為機場、9 為交流道；高速公路 3 格、國外 7 格',()=>{
  assert.equal(BOARD.length,24);assert.equal(BOARD[0].type,'home');assert.equal(BOARD[6].type,'airport');assert.equal(BOARD[9].type,'ramp');
  assert.equal(HIGHWAY.tiles.length,3);assert.equal(ABROAD.tiles.at(-1).type,'return');
});
test('經過家鄉會多抽一張機會卡（停在家鄉也算）',()=>{
  const s=game();at(s,22);rollDice(s,[2,1]);
  assert.equal(s.players[0].position,1);
  assert.deepEqual(s.queue.map(q=>q.kind),['chance','chance']);assert.equal(s.queue[1].source,'home');
  const t=game();at(t,22);rollDice(t,[1,1]);assert.equal(t.players[0].position,0);assert.deepEqual(t.queue.map(q=>q.source),['home']);
});
test('家人後援：經過家鄉再拿 2 萬',()=>{
  const s=game(2,{},['D10','D01']);at(s,23);rollDice(s,[1,0]);assert.equal(s.players[0].cash,START.cash+2);
});
test('有車時每個轉輪的 1/2/3 視為 4/5/6，0 和 4–6 不變',()=>{
  const s=game();const p=at(s,1);p.owns.car=true;
  const r=rollDice(s,[1,3]);assert.deepEqual(r.eff,[4,6]);assert.equal(r.dice,10);
  const t=game();at(t,1).owns.car=true;assert.deepEqual(rollDice(t,[0,5]).eff,[0,5]);
});
test('有車經過交流道會走高速公路，並在第 17 格回到主地圖；沒車照走主地圖',()=>{
  const s=game();const p=at(s,8);p.owns.car=true;
  const path=movementPath(p,5);
  assert.deepEqual(path.map(n=>`${n.t}-${n.i}`),['main-9','highway-0','highway-1','highway-2','main-17']);
  p.owns.car=false;assert.deepEqual(movementPath(p,5).map(n=>`${n.t}-${n.i}`),['main-9','main-10','main-11','main-12','main-13']);
  p.owns.car=true;p.useHighway=false;assert.equal(movementPath(p,2).at(-1).t,'main');
});
test('通過收費站付 1 萬',()=>{
  const s=game();const p=at(s,9);p.owns.car=true;rollDice(s,[4,0]);
  assert.equal(p.track,'main');assert.equal(p.position,HIGHWAY.to);assert.equal(p.cash,START.cash-HIGHWAY.toll);
});
test('剛好停在機場可以買機票出國；職業與天命卡可減免',()=>{
  const s=game();at(s,4);rollDice(s,[1,1]);
  assert.equal(s.phase,'choice');assert.equal(s.pendingChoice.kind,'airport');
  const p=s.players[0];p.cash=20;
  resolveChoice(s,p.id,0);
  assert.equal(p.track,'abroad');assert.equal(p.position,0);assert.equal(p.cash,20-ABROAD.ticket);
  const t=game(2,{},['D07','D01']);assert.equal(ticketPrice(t,t.players[0]),0);
  const u=game();u.players[0].jobId='J06';assert.equal(ticketPrice(u,u.players[0]),ABROAD.ticket/2);
  u.players[0].jobId='J10';assert.equal(ticketPrice(u,u.players[0]),0);
});
test('經過機場不會觸發出國；在國外只用第一個轉輪，走到回國自動回機場',()=>{
  const s=game();at(s,4);rollDice(s,[2,1]);assert.notEqual(s.pendingChoice?.kind,'airport');
  const t=game();const p=at(t,0,'abroad');p.owns.car=true;
  const r=rollDice(t,[2,6]);assert.equal(r.dice,2);assert.equal(p.track,'abroad');assert.equal(p.position,2);
  assert.deepEqual(t.queue.map(q=>q.kind),['abroad']);
  const u=game();const q=at(u,3,'abroad');rollDice(u,[6,0]);
  assert.equal(q.track,'main');assert.equal(q.position,ABROAD.airport);assert.equal(u.phase,'manage');
});
test('國外卡都能結算；詐騙園區會受困，學習天才少等一回合',()=>{
  for(const c of ABROAD_CARDS){const s=game();at(s,2,'abroad');s.players[0].cash=100;draw(s,'abroad',c.id)}
  const s=game();at(s,2,'abroad');s.players[0].cash=100;draw(s,'abroad','A10');
  assert.equal(s.players[0].cash,50);assert.equal(s.players[0].waitTurns,1);
  const t=game(2,{},['D02','D01']);at(t,2,'abroad');draw(t,'abroad','A10');assert.equal(t.players[0].waitTurns,0);
});
test('工作卡混在機會牌堆；被持有的工作卡不會再被抽到',()=>{
  const s=game();assert.equal(chanceDeck(s).length,CHANCE_CARDS.length+JOBS.length);
  s.players[1].jobId='J09';assert.ok(!chanceDeck(s).some(c=>c.id==='J09'));
});
test('無條件工作卡：直接上工，階層與薪水跟著改變',()=>{
  const s=game();const opts=offer(s,'J01');
  assert.deepEqual(opts.map(o=>o.key),['take','pass']);
  resolveChoice(s,'player-1',0);
  const p=s.players[0];assert.equal(p.jobId,'J01');assert.equal(computeQuarter(s,p).earned,11);
});
test('已有工作卡時可以洗回牌堆重抽一張',()=>{
  const s=game();s.players[0].jobId='J01';const opts=offer(s,'J07');
  assert.equal(opts[2].key,'redraw');
  const r=resolveChoice(s,'player-1',2);assert.ok(r.redraw);assert.equal(s.phase,'choice');assert.equal(s.pendingChoice.cardId,r.redraw);
  assert.equal(s.players[0].jobId,'J01');
});
test('需要車的工作：沒車不能選',()=>{
  const s=game();const opts=offer(s,'J03');assert.equal(opts[0].affordable,false);assert.match(opts[0].reason,/車/);
  assert.throws(()=>resolveChoice(s,'player-1',0),/車/);
});
test('醫生：停留 2 回合後擲骰 ≥ 3 錄取',()=>{
  const s=game();offer(s,'J09');resolveChoice(s,'player-1',0);
  const p=s.players[0];assert.equal(p.waitTurns,2);assert.equal(p.training.jobId,'J09');
  assert.ok(!chanceDeck(s).some(c=>c.id==='J09'),'受訓中的工作卡不在牌堆');
  for(let k=0;k<2;k++){endTurn(s);rollDice(s,[0,0]);endTurn(s);assert.equal(s.phase,'skip');assert.throws(()=>rollDice(s))}
  endTurn(s);rollDice(s,[0,0]);endTurn(s);
  assert.equal(s.phase,'exam');takeExam(s,3);assert.equal(p.jobId,'J09');assert.equal(s.phase,'roll');
});
test('應考失敗：工作卡洗回牌堆；人脈王擲骰 +1；學習天才少等一回合',()=>{
  const s=game(2,{},['D01','D02']);const p=s.players[0];p.training={jobId:'J08',need:4};s.phase='exam';
  takeExam(s,3);assert.equal(p.jobId,null);assert.ok(chanceDeck(s).some(c=>c.id==='J08'));
  const t=game(2,{},['D05','D01']);t.players[0].training={jobId:'J08',need:4};t.phase='exam';takeExam(t,3);assert.equal(t.players[0].jobId,'J08');
  const u=game(2,{},['D02','D01']);offer(u,'J09');resolveChoice(u,'player-1',0);assert.equal(u.players[0].waitTurns,1);
});
test('付學費的工作：先付錢，當場擲骰；現金不足不能選',()=>{
  const s=game();assert.equal(offer(s,'J04')[0].affordable,false);
  const t=game();t.players[0].cash=30;offer(t,'J04');resolveChoice(t,'player-1',0);
  assert.equal(t.players[0].cash,20);assert.ok(t.lastExam);assert.equal(t.players[0].jobId===('J04'),t.lastExam.ok);
});
test('遠洋漁船船員有機率整回合無法移動；技術長每季疲勞 +30',()=>{
  const s=game();s.players[1].jobId='J12';
  let skips=0;for(let k=0;k<40;k++){s.turnIndex=0;s.phase='manage';endTurn(s);if(s.phase==='skip')skips++}
  assert.ok(skips>3&&skips<30,`出海 ${skips} 次`);
  const t=game();t.players[0].jobId='J11';settleRound(t);assert.equal(t.players[0].fatigue,30);
});
test('買車：全額或貸款（頭期 20%、車貸明牌）；車迷八折；車子計入淨資產',()=>{
  const s=game();s.phase='manage';const p=s.players[0];p.jobId='J09';p.cash=100;
  const o=carOffer(s,p);buyCar(s,'player-1','loan');
  assert.equal(p.owns.car,true);assert.equal(p.cash,100-o.down);
  const loan=p.debts.find(d=>d.type==='auto');assert.equal(loan.public,true);assert.equal(loan.balance,o.loan);
  assert.throws(()=>buyCar(s,'player-1','cash'),/已經有車/);
  const t=game(2,{},['D08','D01']);assert.equal(carOffer(t,t.players[0]).price,carOffer(t,t.players[1]).price*.8);
  const u=game();u.phase='manage';const q=u.players[0];q.cash=100;const before=netWorth(q);buyCar(u,'player-1','cash');
  assert.ok(netWorth(q)<before&&netWorth(q)>before-carOffer(u,u.players[1]).price);
});
test('車貸需通過銀行審核：每季還款超過薪水 50% 不核貸',()=>{
  const s=game();s.phase='manage';const p=s.players[0];p.cash=30;p.debts.push({id:'card-9',type:'card',name:'卡債',balance:20,rate:15,payment:3});assert.throws(()=>buyCar(s,'player-1','loan'),/核貸/);
});
test('富爸爸：收入比上一季高就發零用錢',()=>{
  const s=game(2,{},['D01','D02']);const p=s.players[0];settleRound(s);
  const cash=p.cash;p.jobId='J01';settleRound(s);
  assert.ok(s.log.some(x=>x.includes('富爸爸')));assert.ok(p.cash>cash);
});
test('每季最多一張市場事件，之後改抽機會卡',()=>{
  const s=game();assert.equal(draw(s,'market','M10').type,'market');
  s.phase='manage';endTurn(s);const second=draw(s,'market');
  assert.equal(second.type,'chance');assert.match(second.note,/市場事件/);
});
test('Loss：有保險只付兩成；車禍下一回合無法行動',()=>{
  const s=game();s.players[0].cash=100;s.players[0].insured=true;draw(s,'loss','L01');assert.equal(s.players[0].cash,96);
  const t=game();t.players[0].cash=100;draw(t,'loss','L04');assert.equal(t.players[0].waitTurns,1);
  endTurn(t);rollDice(t,[0,0]);endTurn(t);assert.equal(t.phase,'skip');
});
test('季結算：收入、生活費、利息與攤還正確入帳',()=>{
  const s=game();const p=s.players[0];
  const q=computeQuarter(s,p,{random:.5});
  assert.equal(q.earned,9);assert.equal(q.debt,1.5);
  const debt=totalDebt(p);settleRound(s);
  assert.ok(totalDebt(p)<debt);assert.equal(s.round,2);assert.equal(p.history.length,1);
});
test('勝利：淨資產先達標者獲勝；季數用完時淨資產最高者獲勝',()=>{
  const s=game();s.players[0].cash=GOAL.netWorth+50;s.phase='manage';endTurn(s);
  assert.equal(s.status,'finished');assert.deepEqual(s.winnerIds,['player-1']);
  const t=game(2,{maxRounds:4});t.players[1].cash=90;for(let i=0;i<4;i++)settleRound(t);
  assert.equal(t.winReason,'progress');assert.deepEqual(t.winnerIds,['player-2']);
  assert.ok(goalProgress(t,t.players[1])>goalProgress(t,t.players[0]));
});
test('加班提高收入並累積疲勞；鐵人體質疲勞減半',()=>{
  const s=game();s.phase='manage';const p=s.players[0];
  const base=computeQuarter(s,p).earned;setOvertime(s,'player-1',1);
  assert.equal(computeQuarter(s,p).earned,Math.round(base*1.15*100)/100);
  const t=game(2,{},['D04','D01']);t.players[0].overtime=2;settleRound(t);assert.equal(t.players[0].fatigue,12.5);
});
test('AI 央行：通膨 ≥ 4% 升息 0.5，並有 2 季冷卻',()=>{
  const s=game();const snap={...s.economy,inflation:4.5,prevStock:100};
  const r=evaluateCentralBank(s,snap);assert.equal(r.chosen.id,'R1');assert.equal(r.cooling,false);
  s.lastRateChangeRound=1;s.round=2;assert.equal(evaluateCentralBank(s,snap).cooling,true);
});
test('現金不足自動動用信用貸款；額度用盡就破產',()=>{
  const s=game();const p=s.players[0];p.cash=-5;settleRound(s);
  assert.ok(p.debts.some(d=>d.type==='credit'));assert.equal(p.bankrupt,false);
  p.cash=-500;settleRound(s);assert.equal(p.bankrupt,true);assert.equal(s.status,'finished');
});
test('提前還款與信用貸款額度',()=>{
  const s=game();s.phase='manage';const p=s.players[0];p.cash=50;
  repayDebt(s,'player-1',p.debts[0].id,36);assert.equal(totalDebt(p),0);
  borrow(s,'player-1',10);assert.throws(()=>borrow(s,'player-1',20),/額度/);
});
test('所有卡片都能抽出並結算，現金為負時仍能選擇不花錢的選項',()=>{
  for(const c of MARKET_EVENTS){const s=game();draw(s,'market',c.id)}
  for(const c of LOSS_CARDS){const s=game();draw(s,'loss',c.id)}
  for(const c of FORTUNE_CARDS){const s=game();const before=s.players[0].cash;draw(s,'fortune',c.id);assert.ok(s.players[0].cash>before)}
  for(const c of [...CHANCE_CARDS,...JOBS]){
    const s=game();s.players[0].cash=500;s.players[0].owns.car=true;s.players[0].jobId=c.id==='J01'?'J02':'J01';
    const n=offer(s,c.id).length;for(let i=0;i<n;i++){const t=importGame(exportGame(s));resolveChoice(t,'player-1',i)}
  }
  const s=game();s.players[0].cash=-3;const opts=offer(s,'C04');assert.ok(opts.some(o=>o.affordable));
});
test('存檔可以匯出與匯入；舊版存檔會被拒絕',()=>{
  const s=game();at(s,1);rollDice(s,[1,2]);const t=importGame(exportGame(s));
  assert.equal(t.players[0].position,4);assert.throws(()=>importGame('{"version":3,"game":"life","players":[],"economy":{}}'),/格式/);
  assert.equal(DESTINIES.length,10);
});
test('開局先輪流抽天命卡：一人一張不重複，抽完才開始第一季',()=>{
  const s=createGame({players:[{name:'A'},{name:'B'},{name:'C'}],seed:3});
  assert.equal(s.phase,'destiny');assert.equal(s.turnIndex,0);assert.equal(s.players[0].destinyId,null);
  assert.throws(()=>rollDice(s,[1,1]));
  const a=drawDestiny(s,'D01');assert.equal(s.players[0].destinyId,a);assert.equal(s.turnIndex,1);assert.equal(s.lastDestiny.playerId,'player-1');
  drawDestiny(s,'D09');assert.equal(s.players[1].debts[0].balance,START.debts[0].balance/2);
  assert.throws(()=>drawDestiny(s,'D09'),/無效/);
  drawDestiny(s);assert.equal(s.phase,'roll');assert.equal(s.turnIndex,0);
  assert.equal(new Set(s.players.map(p=>p.destinyId)).size,3);
  const t=createGame({players:[{name:'A',destinyId:'D01'},{name:'B'}],seed:3});assert.equal(t.turnIndex,1);
});
test('本回合抽到的卡會記錄下來，換人時清空',()=>{
  const s=game();draw(s,'fortune','F03');draw(s,'loss','L03');
  assert.deepEqual(s.turnCards,['F03','L03']);s.phase='manage';endTurn(s);assert.deepEqual(s.turnCards,[]);
});
