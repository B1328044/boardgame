import test from 'node:test';
import assert from 'node:assert/strict';
import {Room,newCode} from './room.mjs';
import {drawEvent as drawCard} from '../personal/engine.js';

const playUntilDone=(room,humans,limit=20000)=>{
  for(let i=0;i<limit&&room.game.status==='playing';i++){
    if(room.botStep())continue;
    const p=room.actor(),seat=humans.find(s=>s.playerId===p.id),g=room.game;
    if(g.phase==='respond'){room.act(seat.token,{type:'respond',yes:Math.random()<.5});continue}
    if(g.phase==='roll')room.act(seat.token,{type:'roll'});
    else if(g.phase==='draw')room.act(seat.token,{type:'draw'});
    else if(g.phase==='choice'){const opts=room.privateView(seat.token).choice.options;room.act(seat.token,{type:'choose',index:opts.find(o=>o.affordable).index})}
    else room.act(seat.token,{type:'end'});
  }
};

test('房號為 4 碼且不含易混淆字元',()=>{for(let i=0;i<200;i++)assert.match(newCode(),/^[A-HJ-NP-Z2-9]{4}$/)});
test('加入、改角色、重名自動加編號、加 Bot、移除座位',()=>{
  const r=new Room('ABCD');
  const a=r.addHuman({name:'小明',roleId:'low'}),b=r.addHuman({name:'小明',roleId:'exec'});
  assert.equal(b.name,'小明 2');
  r.updateSeat(a,{roleId:'free'});assert.equal(a.roleId,'free');
  assert.throws(()=>r.updateSeat(a,{roleId:'god'}),/角色/);
  const bot=r.addBot({level:'high',roleId:'office'});assert.equal(bot.token,null);
  r.removeSeat(b.seatId);assert.equal(r.seats.length,2);
});
test('至少 2 人才能開始；開始後不能再加入',()=>{
  const r=new Room('ABCD');r.addHuman({name:'甲',roleId:'low'});
  assert.throws(()=>r.start(),/至少需要 2 位/);
  r.addBot({level:'low',roleId:'exec'});r.start({maxRounds:8});
  assert.equal(r.game.players.length,2);assert.equal(r.game.maxRounds,8);
  assert.throws(()=>r.addHuman({name:'乙'}),/已經開始/);
});
test('只有輪到的玩家能操作，別人送出的動作會被拒絕',()=>{
  const r=new Room('ABCD');const a=r.addHuman({name:'甲',roleId:'low'}),b=r.addHuman({name:'乙',roleId:'office'});r.start();
  assert.throws(()=>r.act(b.token,{type:'roll'}),/還沒輪到你/);
  assert.throws(()=>r.act('fake',{type:'roll'}),/找不到你的座位/);
  r.act(a.token,{type:'roll'});assert.notEqual(r.game.phase,'roll');
});
test('公開視角不含任何人的現金與負債；私人視角只有本人的資料',()=>{
  const r=new Room('ABCD');const a=r.addHuman({name:'甲',roleId:'exec'}),b=r.addHuman({name:'乙',roleId:'low'});r.start();
  const pub=JSON.stringify(r.publicView());
  for(const key of ['"cash"','"debts"','"totalDebt"','"lastBreakdown"','"token"','"options"'])assert.ok(!pub.includes(key),`公開資料不應有 ${key}`);
  const mine=r.privateView(a.token);
  assert.equal(mine.me.cash,100);assert.equal(mine.me.debts.length,2);assert.equal(mine.isMyTurn,true);
  const theirs=r.privateView(b.token);assert.equal(theirs.me.cash,5);assert.equal(theirs.isMyTurn,false);
  assert.ok(!JSON.stringify(theirs).includes('"cash":100'),'乙看不到甲的現金');
});
test('機會卡選項只給輪到的玩家',()=>{
  const r=new Room('ABCD');const a=r.addHuman({name:'甲',roleId:'exec'}),b=r.addHuman({name:'乙',roleId:'low'});r.start();
  const g=r.game;g.players[0].position=1;g.dice=1;g.phase='draw';r.act(a.token,{type:'draw'});
  assert.equal(g.phase,'choice');
  assert.ok(r.privateView(a.token).choice.options.length>=2);
  assert.equal(r.privateView(b.token).choice,null);
  assert.equal(r.publicView().game.card.type,'chance');
});
test('真人與各難度 Bot 混合可以把整局打完',()=>{
  for(let k=0;k<20;k++){
    const r=new Room('ABCD');const humans=[r.addHuman({name:'甲',roleId:'low'}),r.addHuman({name:'乙',roleId:'free'})];
    r.addBot({level:'low',roleId:'exec'});r.addBot({level:'high',roleId:'office'});
    r.start({maxRounds:12});playUntilDone(r,humans);
    assert.equal(r.game.status,'finished');assert.ok(r.publicView().game.winReason);
  }
});
test('房間可以存檔與還原：重新整理大螢幕後座位、憑證與對局都在，真人先標成離線',()=>{
  const r=new Room('ABCD');const a=r.addHuman({name:'甲',roleId:'low'});r.addBot({level:'mid',roleId:'exec'});r.start();
  r.act(a.token,{type:'roll'});
  const back=Room.fromJSON(JSON.parse(JSON.stringify(r)));
  assert.equal(back.code,'ABCD');assert.equal(back.seatByToken(a.token).name,'甲');
  assert.equal(back.seatByToken(a.token).connected,false);assert.equal(back.seats[1].connected,true);
  assert.equal(back.game.round,r.game.round);assert.equal(back.game.phase,r.game.phase);
  assert.throws(()=>Room.fromJSON({v:2}),/格式/);
});
test('公開動態帶有總則數：畫面只收最近 60 則，但 logCount 一直增加，用來判斷新動態',()=>{
  const r=new Room('ABCD');const humans=[r.addHuman({name:'甲',roleId:'low'}),r.addHuman({name:'乙',roleId:'free'})];
  r.start({maxRounds:12});playUntilDone(r,humans);
  const v=r.publicView().game;
  assert.ok(v.log.length<=60);assert.ok(v.logCount>=v.log.length);
  assert.equal(v.logCount,r.game.log.filter(x=>!/提前償還|申請信用貸款|自動動用信用貸款/.test(x)).length);
  assert.ok(v.log.every(x=>!/申請信用貸款|自動動用信用貸款/.test(x)));
});

test('合作邀請與搶案反制：由被指定的人在自己的手機回覆；離線的人自動拒絕，不會卡住',()=>{
  const r=new Room('ABCD');const a=r.addHuman({name:'甲',roleId:'office'}),b=r.addHuman({name:'乙',roleId:'low'});r.start();
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
