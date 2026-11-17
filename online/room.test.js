import test from 'node:test';
import assert from 'node:assert/strict';
import {Room,newCode} from './room.mjs';
import {drawEvent as drawCard,rollDice as forceRoll} from '../personal/engine.js';

const R=code=>new Room(code,{variant:'roles'});
// 開局先輪流抽天命卡（真人用自己的手機抽，Bot 由大螢幕代抽）。
const drawDestinies=room=>{
  while(room.game.phase==='destiny'){if(room.botStep())continue;const seat=room.seatOf(room.actor());room.act(seat.token,{type:'destiny'})}
};
const playUntilDone=(room,humans,limit=20000)=>{
  for(let i=0;i<limit&&room.game.status==='playing';i++){
    if(room.botStep())continue;
    const p=room.actor(),seat=humans.find(s=>s.playerId===p.id),g=room.game;
    if(g.phase==='respond'){room.act(seat.token,{type:'respond',yes:Math.random()<.5});continue}
    if(g.phase==='destiny')room.act(seat.token,{type:'destiny'});
    else if(g.phase==='exam')room.act(seat.token,{type:'exam'});
    else if(g.phase==='roll')room.act(seat.token,{type:'roll'});
    else if(g.phase==='draw')room.act(seat.token,{type:'draw'});
    else if(g.phase==='choice'){const opts=room.privateView(seat.token).choice.options;room.act(seat.token,{type:'choose',index:opts.find(o=>o.affordable).index})}
    else room.act(seat.token,{type:'end'});
  }
};

test('房號為 4 碼且不含易混淆字元',()=>{for(let i=0;i<200;i++)assert.match(newCode(),/^[A-HJ-NP-Z2-9]{4}$/)});
test('加入、改角色、重名自動加編號、加 Bot、移除座位',()=>{
  const r=R('ABCD');
  const a=r.addHuman({name:'小明',roleId:'low'}),b=r.addHuman({name:'小明',roleId:'exec'});
  assert.equal(b.name,'小明 2');
  r.updateSeat(a,{roleId:'free'});assert.equal(a.roleId,'free');
  assert.throws(()=>r.updateSeat(a,{roleId:'god'}),/角色/);
  const bot=r.addBot({level:'high',roleId:'office'});assert.equal(bot.token,null);
  r.removeSeat(b.seatId);assert.equal(r.seats.length,2);
});
test('至少 2 人才能開始；開始後不能再加入',()=>{
  const r=R('ABCD');r.addHuman({name:'甲',roleId:'low'});
  assert.throws(()=>r.start(),/至少需要 2 位/);
  r.addBot({level:'low',roleId:'exec'});r.start({maxRounds:8});
  assert.equal(r.game.players.length,2);assert.equal(r.game.maxRounds,8);
  assert.throws(()=>r.addHuman({name:'乙'}),/已經開始/);
});
test('只有輪到的玩家能操作，別人送出的動作會被拒絕',()=>{
  const r=R('ABCD');const a=r.addHuman({name:'甲',roleId:'low'}),b=r.addHuman({name:'乙',roleId:'office'});r.start();drawDestinies(r);
  assert.throws(()=>r.act(b.token,{type:'roll'}),/還沒輪到你/);
  assert.throws(()=>r.act('fake',{type:'roll'}),/找不到你的座位/);
  r.act(a.token,{type:'roll'});assert.notEqual(r.game.phase,'roll');
});
test('公開視角不含任何人的現金與負債；私人視角只有本人的資料',()=>{
  const r=R('ABCD');const a=r.addHuman({name:'甲',roleId:'exec'}),b=r.addHuman({name:'乙',roleId:'low'});r.start();drawDestinies(r);
  const pub=JSON.stringify(r.publicView());
  for(const key of ['"cash"','"debts"','"totalDebt"','"lastBreakdown"','"token"','"options"'])assert.ok(!pub.includes(key),`公開資料不應有 ${key}`);
  const mine=r.privateView(a.token);
  assert.equal(mine.me.cash,100);assert.equal(mine.me.debts.length,2);assert.equal(mine.isMyTurn,true);
  const theirs=r.privateView(b.token);assert.equal(theirs.me.cash,5);assert.equal(theirs.isMyTurn,false);
  assert.ok(!JSON.stringify(theirs).includes('"cash":100'),'乙看不到甲的現金');
});
test('機會卡選項只給輪到的玩家',()=>{
  const r=R('ABCD');const a=r.addHuman({name:'甲',roleId:'exec'}),b=r.addHuman({name:'乙',roleId:'low'});r.start();drawDestinies(r);
  const g=r.game;g.players[0].position=1;g.dice=1;g.phase='draw';r.act(a.token,{type:'draw'});
  assert.equal(g.phase,'choice');
  assert.ok(r.privateView(a.token).choice.options.length>=2);
  assert.equal(r.privateView(b.token).choice,null);
  assert.equal(r.publicView().game.card.type,'chance');
});
test('真人與各難度 Bot 混合可以把整局打完',()=>{
  for(let k=0;k<20;k++){
    const r=R('ABCD');const humans=[r.addHuman({name:'甲',roleId:'low'}),r.addHuman({name:'乙',roleId:'free'})];
    r.addBot({level:'low',roleId:'exec'});r.addBot({level:'high',roleId:'office'});
    r.start({maxRounds:12});playUntilDone(r,humans);
    assert.equal(r.game.status,'finished');assert.ok(r.publicView().game.winReason);
  }
});
test('房間可以存檔與還原：重新整理大螢幕後座位、憑證與對局都在，真人先標成離線',()=>{
  const r=R('ABCD');const a=r.addHuman({name:'甲',roleId:'low'});r.addBot({level:'mid',roleId:'exec'});r.start();drawDestinies(r);
  r.act(a.token,{type:'roll'});
  const back=Room.fromJSON(JSON.parse(JSON.stringify(r)));
  assert.equal(back.code,'ABCD');assert.equal(back.seatByToken(a.token).name,'甲');
  assert.equal(back.seatByToken(a.token).connected,false);assert.equal(back.seats[1].connected,true);
  assert.equal(back.game.round,r.game.round);assert.equal(back.game.phase,r.game.phase);
  assert.throws(()=>Room.fromJSON({v:1}),/格式/);assert.equal(back.variant,'roles');
});
test('公開動態帶有總則數：畫面只收最近 60 則，但 logCount 一直增加，用來判斷新動態',()=>{
  const r=R('ABCD');const humans=[r.addHuman({name:'甲',roleId:'low'}),r.addHuman({name:'乙',roleId:'free'})];
  r.start({maxRounds:12});playUntilDone(r,humans);
  const v=r.publicView().game;
  assert.ok(v.log.length<=60);assert.ok(v.logCount>=v.log.length);
  assert.equal(v.logCount,r.game.log.filter(x=>!/提前償還|申請信用貸款|自動動用信用貸款/.test(x)).length);
  assert.ok(v.log.every(x=>!/申請信用貸款|自動動用信用貸款/.test(x)));
});

test('合作邀請與搶案反制：由被指定的人在自己的手機回覆；離線的人自動拒絕，不會卡住',()=>{
  const r=R('ABCD');const a=r.addHuman({name:'甲',roleId:'office'}),b=r.addHuman({name:'乙',roleId:'low'});r.start();drawDestinies(r);
  const g=r.game;g.players[0].position=1;g.dice=1;g.phase='draw';drawCard(g,'C13');
  r.act(a.token,{type:'choose',index:0});
  assert.equal(g.phase,'respond');assert.equal(r.actor().id,b.playerId);
  assert.equal(r.publicView().game.respond.to,'乙');
  assert.match(r.privateView(b.token).respond.question,/甲邀請你合作/);assert.equal(r.privateView(a.token).respond,null);
  assert.throws(()=>r.act(a.token,{type:'end'}),/正在等 乙 回覆/);
  assert.throws(()=>r.act(a.token,{type:'respond',yes:true}),/不需要你回覆/);
  assert.equal(r.needsBot(),false);
  b.connected=false;assert.equal(r.needsBot(),true);
  r.botStep();assert.equal(g.phase,'manage');assert.match(g.log[0],/拒絕/);
});

/* ---------- A 工作卡版 ---------- */
const J=code=>new Room(code,{variant:'jobs'});
test('工作卡版：沒有角色，大家都從基本工作開始；開局輪流抽天命卡，大螢幕看得到抽到什麼',()=>{
  const r=J('WXYZ');const a=r.addHuman({name:'甲',roleId:'exec'}),b=r.addHuman({name:'乙'});
  assert.equal(a.roleId,null);assert.equal(r.publicView().roles.length,0);
  r.start();assert.equal(r.game.phase,'destiny');
  assert.throws(()=>r.act(b.token,{type:'destiny'}),/還沒輪到你/);
  r.act(a.token,{type:'destiny'});
  const v=r.publicView().game;
  assert.equal(v.destinyReveal.playerId,a.playerId);assert.ok(v.destinyReveal.name);
  assert.equal(v.players[0].identity.name,'基本工作');assert.equal(v.players[0].publicDebts[0].name,'學貸');
  r.act(b.token,{type:'destiny'});assert.equal(r.game.phase,'roll');
  assert.equal(r.privateView(a.token).me.goalType,'netWorth');
});
test('工作卡版：抽到工作卡時只有本人看到選項；可以應徵、不要或（已有工作時）洗回重抽',()=>{
  const r=J('WXYZ');const a=r.addHuman({name:'甲'}),b=r.addHuman({name:'乙'});r.start();drawDestinies(r);
  const g=r.game;g.players[0].position=1;g.dice=1;g.phase='draw';drawCard(g,'J01');
  const c=r.privateView(a.token).choice;
  assert.equal(c.kind,'job');assert.deepEqual(c.options.map(o=>o.key),['take','pass']);
  assert.equal(r.privateView(b.token).choice,null);assert.equal(r.publicView().game.choiceKind,'job');assert.equal(r.publicView().game.card.isJob,true);
  r.act(a.token,{type:'choose',index:0});
  assert.equal(r.publicView().game.players[0].identity.name,'基本文書處理人員');
});
test('工作卡版：剛好停在機場可以選擇出國；有車可以切換走不走高速公路',()=>{
  const r=J('WXYZ');const a=r.addHuman({name:'甲'}),b=r.addHuman({name:'乙'});r.start();drawDestinies(r);
  const g=r.game;g.players[0].cash=100;forceRoll(g,[3,3]);
  assert.equal(g.phase,'choice');const c=r.privateView(a.token).choice;
  assert.equal(c.kind,'airport');assert.equal(c.options[0].key,'fly');
  r.act(a.token,{type:'choose',index:0});
  assert.equal(r.publicView().game.players[0].track,'abroad');
  while(g.phase!=='manage')r.act(a.token,{type:'draw'});
  r.act(a.token,{type:'car',mode:'cash'});
  assert.equal(r.publicView().game.players[0].car,true);
  r.act(a.token,{type:'highway',on:false});assert.equal(r.privateView(a.token).me.car.useHighway,false);
});
test('工作卡版：真人與 Bot 混合可以把整局打完',()=>{
  for(let k=0;k<20;k++){
    const r=J('WXYZ');const humans=[r.addHuman({name:'甲'}),r.addHuman({name:'乙'})];
    r.addBot({level:'low'});r.addBot({level:'high'});
    r.start({maxRounds:12});playUntilDone(r,humans);
    assert.equal(r.game.status,'finished');assert.ok(r.publicView().game.winReason);
  }
});
