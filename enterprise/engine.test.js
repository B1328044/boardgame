import test from 'node:test';
import assert from 'node:assert/strict';
import {ROLES,GLOBAL_EVENTS,PERSONAL_EVENTS,FED_RULES,BOARD,STAFF} from './data.js';
import {macroFactor,createGame,financials,assetValue,effectBreakdown,makeSnapshot,evaluateFed,rollDice,drawEvent,movementPath,endTurn,settleSeason,adjustStaff,issueLoan,repayLoan,updateBadLoans,exportGame,importGame,confirmMove,resolveChoice,staffPreview,staffCurve,wageFactor,availableLabor,layoffRoom,severancePerHead,isHedged,companyPosition} from './engine.js';

const rev=(id,f=1)=>Math.round(ROLES.find(r=>r.id===id).base.revenue*f*100)/100;
const game=()=>createGame({players:[{name:'甲',roleId:'auto'},{name:'乙',roleId:'technology'}],seed:42});
const active=(eventId,scope='global',extra={})=>({instanceId:1,eventId,scope,ownerId:null,sector:null,startedRound:1,...extra});

test('新對局預設以建立時間作為亂數種子',()=>{
  const before=Date.now();
  const state=createGame({players:[{name:'甲',roleId:'auto'},{name:'乙',roleId:'technology'}]});
  const after=Date.now();
  assert.ok(state.seed>=before&&state.seed<=after);
  assert.equal(state.rng,state.seed|0||1);
});
test('八位玩家都完成回合後才結算，九位玩家無法開局',()=>{
  const players=ROLES.slice(0,8).map((role,i)=>({name:`玩家 ${i+1}`,roleId:role.id}));
  const state=createGame({players,seed:42});
  assert.equal(state.players.length,8);
  assert.deepEqual(state.players.map(player=>player.color),[0,1,2,3,4,5,6,7]);
  for(let i=0;i<8;i++){
    assert.equal(state.turnIndex,i);
    rollDice(state,[0,0]);
    assert.equal(state.phase,'manage');
    const result=endTurn(state);
    if(i<7){assert.equal(result,null);assert.equal(state.round,1)}
    else{assert.equal(result.finished,false);assert.equal(state.round,2);assert.equal(state.turnIndex,0)}
  }
  assert.throws(()=>createGame({players:[...players,{name:'玩家 9',roleId:ROLES[8].id}]}),/2 至 8 位玩家/);
});
test('撞上罷工幽靈時收入歸零、支出照付，停工一回合且不抽卡',()=>{
  const s=createGame({players:[{name:'甲',roleId:'bank'},{name:'乙',roleId:'technology'}],seed:42,targetWealth:100000});
  s.ghostPosition=1;
  const roll=rollDice(s,[0,1]);
  assert.equal(roll.struck,true);assert.equal(s.phase,'strike');assert.equal(s.lastDraw,null);
  assert.deepEqual(s.struckPlayerIds,['player-1']);
  const f=financials(s,'bank');
  assert.equal(f.revenue,0);assert.equal(f.otherIncome,0);assert.ok(f.costs<0);assert.equal(f.profit,f.costs);
  assert.throws(()=>drawEvent(s),/不需要抽卡/);
  assert.throws(()=>adjustStaff(s,'player-1',1),/經營階段/);
  assert.equal(endTurn(s),null);assert.equal(s.turnIndex,1);assert.equal(s.ghostPosition,1,'季中幽靈不移動');
  rollDice(s,[0,0]);endTurn(s);
  assert.equal(s.round,2);assert.deepEqual(s.struckPlayerIds,[]);
  assert.notEqual(s.ghostPosition,1,'季末幽靈移動一次');
  assert.ok(s.ghostTrail.length>=2&&s.ghostTrail.length<=4);
  assert.equal(s.ghostTrail[0],1);assert.equal(s.ghostTrail.at(-1),s.ghostPosition);
  for(let i=1;i<s.ghostTrail.length;i++)assert.ok([1,BOARD.length-1].includes((s.ghostTrail[i]-s.ghostTrail[i-1]+BOARD.length)%BOARD.length));
  assert.equal(s.companies.bank.cash,1200+f.profit);
  const crossing=createGame({players:[{name:'甲',roleId:'auto'},{name:'乙',roleId:'bank'}],seed:42});
  crossing.players[0].position=23;crossing.ghostPosition=0;
  rollDice(crossing,[0,1]);
  assert.equal(crossing.phase,'strike');assert.equal(crossing.companies.auto.cash,1200);
  const passing=game();passing.ghostPosition=2;
  const passed=rollDice(passing,[0,5]);
  assert.equal(passed.struck,false,'只經過幽靈格不會罷工');assert.deepEqual(passed.path,[1,2,3,4,5]);
  assert.equal(passing.players[0].position,5);assert.notEqual(passing.phase,'strike');
});
test('舊存檔載入時補上罷工幽靈狀態',()=>{
  const legacy=JSON.parse(exportGame(game()));
  delete legacy.ghostPosition;delete legacy.ghostRng;delete legacy.ghostTrail;delete legacy.struckPlayerIds;
  const restored=importGame(JSON.stringify(legacy));
  assert.ok(restored.ghostPosition>=1&&restored.ghostPosition<BOARD.length);
  assert.deepEqual(restored.ghostTrail,[]);
  assert.deepEqual(restored.struckPlayerIds,[]);
});
test('十種企業、十張全球卡、十條規則及基準淨利符合規格',()=>{
  assert.equal(ROLES.length,10);assert.equal(GLOBAL_EVENTS.length,10);assert.equal(FED_RULES.length,10);
  for(const r of ROLES)assert.ok(Object.values(r.base).reduce((a,b)=>a+b,0)>0,`${r.id} 基準淨利應為正`);
});
test('E01 依衰減向量計算，且不憑空建立銀行原物料成本',()=>{
  const s=game();s.activeEvents=[active('E01')];
  const energy=[],material=[];
  for(let k=1;k<=6;k++){s.round=k;energy.push(financials(s,'auto').flows.energy);material.push(financials(s,'auto').flows.material)}
  assert.deepEqual(energy,[-140,-130,-120,-110,-105,-100]);
  assert.deepEqual(material,[-300,-287.5,-275,-262.5,-256.25,-250]);
  assert.equal(financials(s,'bank').flows.material,0);
});
test('E05 依角色調整人力成本；全球卡同步套用所有適用企業',()=>{
  const s=game();s.activeEvents=[active('E05')];
  assert.equal(financials(s,'technology').flows.labor,-420);
  assert.equal(financials(s,'auto').flows.labor,-180);
  assert.equal(financials(s,'electronics').flows.revenue,rev('electronics',1.25));
});
test('個人、產業與全球事件同季疊加；資產從基準重估而非複利扣減',()=>{
  const s=game();s.activeEvents=[active('E02'),active('P01','personal',{instanceId:2,ownerId:'player-1'}),active('S01','sector',{instanceId:3,sector:'製造業'})];
  assert.equal(effectBreakdown(s,'auto','revenue').length,3);
  assert.equal(effectBreakdown(s,'technology','revenue').length,1);
  assert.equal(financials(s,'auto').flows.revenue,rev('auto',1.2));
  assert.equal(assetValue(s,'auto'),520);
  s.round=2;assert.equal(assetValue(s,'auto'),576);
  s.round=7;assert.equal(assetValue(s,'auto'),800);
});
test('失業、銀行比率與缺少歷史值的快照狀態正確',()=>{
  const s=game();let snap=makeSnapshot(s);
  assert.equal(snap.unemploymentPct,5);assert.equal(snap.liquidityPct,30);assert.equal(snap.nplPct,4);
  assert.equal(snap.growthPct,null);assert.equal(snap.stockReturn3Pct,null);assert.equal(snap.loanGrowth3Pct,null);
  for(const rule of FED_RULES)for(const field of rule.fields)assert.ok(Object.hasOwn(snap,field),`${rule.id} 缺 ${field}`);
  s.phase='manage';adjustStaff(s,'player-1',-50);snap=makeSnapshot(s);assert.equal(snap.unemploymentPct,10);
  const ev=evaluateFed(snap,s).evaluations.find(x=>x.ruleId==='F05');assert.equal(ev.status,'insufficient_data');
});
test('事件成本進入通膨公式，海灣戰爭首兩季為 6.4% 與 5.3%',()=>{
  const s=game();s.activeEvents=[active('E01')];
  assert.equal(Math.round(makeSnapshot(s).inflationPct*10)/10,6.4);
  s.round=2;assert.equal(Math.round(makeSnapshot(s).inflationPct*10)/10,5.3);
});
test('借還款與壞帳操作更新銀行存量，不把借款算成淨資產',()=>{
  const s=game();s.phase='manage';const before=s.companies.auto.cash+s.companies.auto.assetReferenceValue-s.companies.auto.debt;
  issueLoan(s,'player-1',100);
  assert.equal(s.bank.totalLoans,1100);assert.equal(s.bank.liquidAssets,200);
  assert.equal(s.companies.auto.cash+s.companies.auto.assetReferenceValue-s.companies.auto.debt,before);
  repayLoan(s,'player-1',50);assert.equal(s.bank.totalLoans,1050);assert.equal(s.companies.auto.debt,50);
  const bankGame=createGame({players:[{name:'甲',roleId:'bank'},{name:'乙',roleId:'auto'}]});bankGame.phase='manage';updateBadLoans(bankGame,'player-1',50);assert.equal(bankGame.bank.nonperformingLoans,90);
});
test('聯準會缺值不觸發，F03 優先於 F01，政策下一季生效',()=>{
  const s=game();const first=makeSnapshot(s);assert.equal(evaluateFed(first,s).evaluations.find(x=>x.ruleId==='F02').status,'insufficient_data');
  const snap={...first,inflationPct:8,growthPct:-6,previousInflationPct:5};
  const {evaluations,decision}=evaluateFed(snap,s);
  assert.equal(decision.ruleId,'F03');assert.equal(decision.kind,'none');
  assert.equal(evaluations.find(x=>x.ruleId==='F01').status,'suppressed_by_priority');
  const high={...first,inflationPct:8};const d=evaluateFed(high,s).decision;assert.equal(d.kind,'rate');assert.equal(d.nextEffectiveRound,2);
  assert.equal(s.fedRatePercent,4);
});
test('F07 市場崩盤與 F10 泡沫條件分別走 QE 與升息分支',()=>{
  const s=game(),base=makeSnapshot(s);
  const crash={...base,round:2,growthPct:-2,stockReturn1Pct:-25};
  assert.equal(evaluateFed(crash,s).decision.action,'啟動 QE 2 回合');
  const bubble={...base,round:3,growthPct:2,previousGrowthPct:2,previousInflationPct:2,stockReturn1Pct:10,stockReturn3Pct:30,loanGrowth3Pct:20};
  assert.equal(evaluateFed(bubble,s).decision.action,'升息 0.25 個百分點');
  assert.equal(evaluateFed({...bubble,fedRatePct:6},s).decision.action,'啟動 QT 2 回合');
});
test('利率決策在下一季才生效，事件消失不會重設政策利率',()=>{
  const s=game();s.activeEvents=[active('E01'),active('E06','global',{instanceId:2})];
  const result=settleSeason(s);
  assert.equal(result.snapshot.fedRatePct,4);
  assert.equal(result.decision.ruleId,'F01');
  assert.equal(s.round,2);assert.equal(s.fedRatePercent,4.75);
  assert.equal(makeSnapshot(s).rateCooldownRounds,2);
  s.activeEvents=[];s.round=7;
  assert.equal(makeSnapshot(s).fedRatePct,4.75);
});
test('兩輪拉霸後才結算全市場一季',()=>{
  const s=game();assert.equal(BOARD.length,24);
  rollDice(s,[2,2]);assert.equal(s.phase,'draw');assert.equal(s.activeEvents.length,0);
  assert.throws(()=>endTurn(s));assert.throws(()=>adjustStaff(s,'player-1',1));
  assert.equal(drawEvent(s).scope,'global');assert.equal(s.phase,'manage');assert.throws(()=>drawEvent(s));
  assert.equal(endTurn(s),null);assert.equal(s.turnIndex,1);assert.equal(s.round,1);
  rollDice(s,[1,1]);drawEvent(s,'P01');const result=endTurn(s);
  assert.equal(result.snapshot.round,1);assert.equal(s.round,2);assert.equal(s.turnIndex,0);assert.equal(s.economicHistory.length,1);
});
test('棋子逐格路徑與實際落點一致，經過起點只領一次獎金',()=>{
  assert.deepEqual(movementPath(22,5),[23,0,1,2,3]);
  const s=game();s.players[0].position=22;
  const result=rollDice(s,[3,2]);
  assert.deepEqual(result.reels,[3,2]);
  assert.equal(result.dice,5);
  assert.deepEqual(result.path,[23,0,1,2,3]);
  assert.equal(s.players[0].position,3);
  assert.equal(s.companies.auto.cash,1450);
});
test('兩輪 0–6 拉霸的步數範圍為 0–12 格',()=>{
  assert.deepEqual(movementPath(5,12),[6,7,8,9,10,11,12,13,14,15,16,17]);
  const low=game();assert.equal(rollDice(low,[0,0]).dice,0);
  assert.equal(low.phase,'manage');assert.equal(low.activeEvents.length,0);
  assert.throws(()=>drawEvent(low));
  const high=game();assert.equal(rollDice(high,[6,6]).dice,12);
  assert.throws(()=>rollDice(game(),[-1,1]));
  assert.throws(()=>rollDice(game(),[7,1]));
  assert.throws(()=>rollDice(game(),[1,1,1]));
});
test('繞回起點時不顯示事件卡',()=>{
  const s=game();s.players[0].position=22;
  rollDice(s,[1,1]);
  assert.equal(s.players[0].position,0);
  assert.equal(s.phase,'manage');
  assert.equal(s.activeEvents.length,0);
  assert.throws(()=>drawEvent(s));
});
test('固定種子可重現拉霸數字與事件',()=>{
  const a=game(),b=game();
  const x=rollDice(a),y=rollDice(b);
  assert.deepEqual(x.reels,y.reels);
  assert.ok(x.reels.every(n=>n>=0&&n<=6));
  assert.equal(x.dice,y.dice);
  if(a.phase==='draw')assert.equal(drawEvent(a).eventId,drawEvent(b).eventId);
});

/* ---------- 員工機制 ---------- */
const managing=(s,i=0)=>{s.turnIndex=i;s.phase='manage';return s};
const drawPersonal=(s,id,i=s.turnIndex)=>{s.turnIndex=i;s.players[i].position=2;s.dice=1;s.phase='draw';return drawEvent(s,id)};

test('產值曲線：基準 1、峰值 2 倍人數、裁光只剩一成；薪資隨低失業上升',()=>{
  assert.equal(staffCurve(1),1);assert.equal(Math.round(staffCurve(0)*100)/100,.1);assert.equal(Math.round(staffCurve(2)*100)/100,1.3);
  assert.ok(staffCurve(2.5)<staffCurve(2));
  assert.equal(wageFactor(5),1);assert.equal(wageFactor(10),1);assert.equal(Math.round(wageFactor(0)*100)/100,1.15);
});
test('聘僱提高營收並連動原物料，受勞動力池限制；裁光員工大幅虧損',()=>{
  const s=managing(game()),before=financials(s,'auto');
  assert.equal(availableLabor(s),50);
  adjustStaff(s,'player-1',15);
  const after=financials(s,'auto');
  assert.ok(after.revenue>before.revenue);assert.ok(after.flows.material<before.flows.material);
  assert.ok(after.profit>before.profit,'汽車廠小幅擴編應該划算');
  assert.throws(()=>adjustStaff(s,'player-1',36),/只剩 35 人/);
  const fired=managing(game());fired.companies.auto.startHeadcount=150;
  for(let k=0;k<3;k++){fired.companies.auto.layoffsThis=0;fired.companies.auto.startHeadcount=fired.companies.auto.headcount;adjustStaff(fired,'player-1',-layoffRoom(fired,'auto'))}
  assert.ok(financials(fired,'auto').profit<before.profit-150,'大幅裁員應該讓淨利下降');
});
test('單季裁員上限為季初人數 1/3，並立即支付資遣費',()=>{
  const s=managing(game());
  assert.equal(layoffRoom(s,'auto'),50);
  const {severance}=adjustStaff(s,'player-1',-30);
  assert.equal(severance,Math.round(30*severancePerHead('auto')*100)/100);
  assert.equal(s.companies.auto.cash,1200-severance);
  assert.equal(layoffRoom(s,'auto'),20);
  assert.throws(()=>adjustStaff(s,'player-1',-21),/最多再裁 20 人/);
});
test('經營預覽與實際調整後的淨利一致，並提示士氣衝擊',()=>{
  const s=managing(game());
  const preview=staffPreview(s,'auto',-50);
  const before=financials(s,'auto').profit;adjustStaff(s,'player-1',-50);
  assert.equal(Math.round((financials(s,'auto').profit-before)*100)/100,preview.net);
  assert.equal(Math.round((preview.labor+preview.output)*100)/100,preview.net);
  assert.equal(preview.moraleHit,STAFF.massLayoffMorale+STAFF.capMorale);
  assert.equal(staffPreview(managing(game()),'auto',-10).moraleHit,0);
});
test('兩季累計裁員超過 20% 降低士氣；士氣低落造成離職與產值下降，不裁員則恢復',()=>{
  const s=game();
  managing(s,0);adjustStaff(s,'player-1',-15);
  s.turnIndex=1;s.phase='manage';endTurn(s);
  assert.equal(s.companies.auto.morale,100);assert.equal(s.companies.auto.layoffsPrev,15);
  managing(s,0);adjustStaff(s,'player-1',-20);
  s.turnIndex=1;s.phase='manage';endTurn(s);
  assert.equal(s.companies.auto.morale,70);
  s.companies.auto.morale=40;const head=s.companies.auto.headcount,output=financials(s,'auto').revenue;
  s.turnIndex=1;s.phase='manage';endTurn(s);
  assert.equal(s.companies.auto.morale,50);assert.equal(s.companies.auto.headcount,head-Math.round(head*.03));
  s.companies.auto.morale=0;assert.ok(financials(s,'auto').revenue<output);
});
test('勞動力每季成長 2%，失業率以勞動力計算',()=>{
  const s=game();s.turnIndex=1;s.phase='manage';endTurn(s);
  assert.equal(s.laborForce,1020);
  assert.equal(Math.round(makeSnapshot(s).unemploymentPct*100)/100,Math.round(5000/1020*100)/100,'非玩家企業吸收新增勞動力');
});

/* ---------- 新個人事件 ---------- */
test('個人事件共 16 張，P07–P16 皆有說明',()=>{
  assert.equal(PERSONAL_EVENTS.length,16);
  for(const e of PERSONAL_EVENTS.slice(6))assert.ok(e.desc&&e.special,e.id);
});
test('P07 團體協約：下一次停在幽靈格照常營運，只抵擋一次',()=>{
  const s=game();drawPersonal(s,'P07');assert.equal(s.players[0].strikeShield,true);
  s.phase='roll';s.players[0].position=0;s.ghostPosition=4;
  const r=rollDice(s,[2,2]);
  assert.equal(r.struck,false);assert.equal(r.shielded,true);assert.equal(s.players[0].position,4);assert.equal(s.players[0].strikeShield,false);
});
test('P08 AEO：拉霸停定後可調整 ±1 格，共兩次',()=>{
  const s=game();drawPersonal(s,'P08');assert.equal(s.players[0].moveAdjust,2);
  s.phase='roll';s.players[0].position=0;s.ghostPosition=20;
  const r=rollDice(s,[2,1]);assert.equal(r.pending,true);assert.equal(s.phase,'adjust');
  assert.throws(()=>confirmMove(s,'player-1',2));
  const moved=confirmMove(s,'player-1',1);assert.equal(moved.dice,4);assert.equal(s.players[0].position,4);assert.equal(s.players[0].moveAdjust,1);
});
test('P09 期貨避險：付權利金，4 季內能源與原物料不受事件影響',()=>{
  const s=game();s.activeEvents=[active('E01')];
  drawPersonal(s,'P09');
  assert.equal(s.companies.auto.cash,1100);assert.equal(isHedged(s,'auto'),true);assert.equal(isHedged(s,'auto',5),false);
  assert.equal(financials(s,'auto').flows.energy,-100);assert.equal(financials(s,'auto').flows.material,-250);
  assert.equal(financials(s,'technology').flows.energy,-56);
});
test('P10 策略聯盟：指定玩家後雙方營收 +15%',()=>{
  const s=game();drawPersonal(s,'P10');assert.equal(s.phase,'choice');
  assert.throws(()=>endTurn(s));assert.throws(()=>resolveChoice(s,'player-1','player-1'));
  resolveChoice(s,'player-1','player-2');assert.equal(s.phase,'manage');
  assert.equal(financials(s,'auto').revenue,rev('auto',1.15));assert.equal(financials(s,'technology').revenue,rev('technology',1.15));
  assert.equal(financials(s,'retail').revenue,rev('retail'));
});
test('P11 現金增資：接受得 500，4 季內正淨利 25% 分給新股東；放棄則移除卡片',()=>{
  const s=game();drawPersonal(s,'P11');resolveChoice(s,'player-1','accept');
  assert.equal(s.companies.auto.cash,1700);
  const f=financials(s,'auto');assert.equal(f.payout,Math.round(f.profit*25)/100);assert.equal(f.netProfit,f.profit-f.payout);
  const d=game();drawPersonal(d,'P11');resolveChoice(d,'player-1','decline');
  assert.equal(d.companies.auto.cash,1200);assert.equal(d.activeEvents.length,0);
});
test('P12 售後租回：資產換現金、不再受資產跌價影響，固定成本 +10%',()=>{
  const s=game();drawPersonal(s,'P12');resolveChoice(s,'player-1','accept');
  assert.equal(s.companies.auto.cash,2000);assert.equal(assetValue(s,'auto'),0);
  assert.equal(financials(s,'auto').flows.fixed,-110);
  assert.equal(companyPosition(s,'auto').netWorth,2000);
});
test('P13 勒索軟體：付款扣 300；拒付則下一回合停擺',()=>{
  const pay=game();drawPersonal(pay,'P13');resolveChoice(pay,'player-1','pay');assert.equal(pay.companies.auto.cash,900);
  const s=game();drawPersonal(s,'P13');resolveChoice(s,'player-1','refuse');assert.equal(s.players[0].stallNext,true);
  endTurn(s);rollDice(s,[0,0]);endTurn(s);
  const r=rollDice(s);assert.equal(r.stalled,true);assert.equal(s.phase,'strike');assert.equal(s.strikeCause,'ransomware');
  assert.equal(financials(s,'auto').revenue,0);assert.equal(s.players[0].stallNext,false);
});
test('P14 搶下對手大客戶：2 季內取得對方營收 10%',()=>{
  const s=createGame({players:[{name:'甲',roleId:'auto'},{name:'乙',roleId:'retail'},{name:'丙',roleId:'bank'}],seed:42});
  drawPersonal(s,'P14');
  assert.throws(()=>resolveChoice(s,'player-1','player-3'),/客群重疊/);
  resolveChoice(s,'player-1','player-2');
  assert.equal(financials(s,'auto').revenue,Math.round((rev('auto')+rev('retail',.1))*100)/100);assert.equal(financials(s,'retail').revenue,rev('retail',.9));
  s.round=3;assert.equal(financials(s,'auto').revenue,rev('auto'));
});
test('個人事件只抽適用的卡：P14 需要客群重疊的對手，P09／P12／P15 限定企業',()=>{
  const lonely=createGame({players:[{name:'甲',roleId:'bank'},{name:'乙',roleId:'technology'}],seed:3});
  for(let i=0;i<300;i++){lonely.players[0].position=2;lonely.dice=1;lonely.phase='draw';lonely.turnIndex=0;
    const id=drawEvent(lonely).eventId;assert.ok(!['P09','P14','P15'].includes(id),id);
    lonely.phase='manage';lonely.pendingChoice=null;lonely.activeEvents=[]}
  const s=createGame({players:[{name:'甲',roleId:'investment'},{name:'乙',roleId:'bank'}],seed:5});
  const seen=new Set();for(let i=0;i<400;i++){s.players[0].position=2;s.dice=1;s.phase='draw';s.turnIndex=0;seen.add(drawEvent(s).eventId);s.phase='manage';s.pendingChoice=null;s.activeEvents=[]}
  assert.ok(seen.has('P14'),'銀行與投資公司同屬金融客戶');assert.ok(!seen.has('P12'),'投資公司不能售後租回');
});
test('P15 產品召回：立即扣 350，營收 −20% 兩季',()=>{
  const s=game();drawPersonal(s,'P15');
  assert.equal(s.companies.auto.cash,850);assert.equal(financials(s,'auto').revenue,rev('auto',.8));
});
test('P16 勞資談判破裂：幽靈移到前方並停留，下一次拉霸撞上',()=>{
  const s=game();drawPersonal(s,'P16');
  const ghost=s.ghostPosition,distance=(ghost-2+BOARD.length)%BOARD.length;
  assert.ok(distance>=1&&distance<=3);assert.equal(s.ghostPinnedBy,'player-1');
  endTurn(s);assert.equal(s.ghostPosition,ghost);
  rollDice(s,[0,0]);endTurn(s);assert.equal(s.ghostPosition,ghost);
  const r=rollDice(s,[3,0]);assert.equal(r.struck,true,'P16 的幽靈經過即觸發');assert.equal(s.ghostPinnedBy,null);
});
test('舊存檔載入時補上員工與特殊事件欄位',()=>{
  const legacy=JSON.parse(exportGame(game()));
  delete legacy.laborForce;for(const c of Object.values(legacy.companies)){delete c.morale;delete c.startHeadcount;delete c.layoffsThis}for(const p of legacy.players){delete p.strikeShield;delete p.moveAdjust}
  const s=importGame(JSON.stringify(legacy));
  assert.equal(s.laborForce,1000);assert.equal(s.companies.auto.morale,100);assert.equal(s.companies.auto.startHeadcount,150);assert.equal(s.players[0].moveAdjust,0);
});

test('景氣連動：上一季的總體數值影響本季營收；利率效果不受事件下限截斷',()=>{
  const s=game();assert.equal(macroFactor(s,'retail'),1,'第 1 季沒有上一季資料');
  s.economicHistory=[{round:1,growthPct:10,unemploymentPct:10,energyChangePct:50,materialChangePct:25,stockIndex:80}];s.round=2;
  assert.equal(macroFactor(s,'auto'),1.06);assert.equal(macroFactor(s,'retail'),.9);
  assert.equal(macroFactor(s,'energy'),1.2);assert.equal(macroFactor(s,'agriculture'),1.2);
  assert.equal(macroFactor(s,'investment'),.8);assert.equal(macroFactor(s,'bank'),1);
  assert.equal(financials(s,'retail').revenue,rev('retail',.9));
  const r=game();r.fedRatePercent=0;const low=financials(r,'property').flows.interest;r.fedRatePercent=2;
  assert.ok(financials(r,'property').flows.interest<low,'利率 0% 與 2% 應有差異');
  r.fedRatePercent=6;assert.equal(financials(r,'bank').flows.interest,Math.round(ROLES.find(x=>x.id==='bank').base.interest*1.4*100)/100);
});

test('每季最多一張全球事件、每個產業最多一張產業事件，之後改抽個人事件',()=>{
  const s=createGame({players:[{name:'甲',roleId:'auto'},{name:'乙',roleId:'retail'},{name:'丙',roleId:'bank'}],seed:8});
  const draw=(i,pos)=>{s.turnIndex=i;s.players[i].position=pos;s.dice=1;s.phase='draw';const a=drawEvent(s);s.phase='manage';s.pendingChoice=null;return a};
  assert.equal(draw(0,1).scope,'global');
  const second=draw(1,1);assert.equal(second.scope,'personal');assert.match(second.fallback,/全球事件/);
  assert.equal(draw(0,3).scope,'sector');assert.equal(draw(1,3).scope,'personal');
  assert.equal(draw(2,6).scope,'sector','不同產業不受影響');
  s.round=2;assert.equal(draw(0,1).scope,'global','下一季重新計算');
});
