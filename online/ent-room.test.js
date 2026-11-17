import test from 'node:test';
import assert from 'node:assert/strict';
import {Room} from './ent-room.mjs';

test('企業不能重複：被選走的企業會自動換一個；手動改成別人的企業會被拒絕',()=>{
  const r=new Room('ABCD');
  const a=r.addHuman({name:'甲',roleId:'auto'}),b=r.addHuman({name:'乙',roleId:'auto'});
  assert.equal(a.roleId,'auto');assert.notEqual(b.roleId,'auto');
  assert.throws(()=>r.updateSeat(b,{roleId:'auto'}),/已經有人選了/);
  const bot=r.addBot({level:'high',roleId:b.roleId});assert.ok(![a.roleId,b.roleId].includes(bot.roleId));
});
test('公開畫面沒有現金與負債；私人畫面只給本人，且只有輪到的人看得到可做的操作',()=>{
  const r=new Room('ABCD');const a=r.addHuman({name:'甲',roleId:'auto'}),b=r.addHuman({name:'乙',roleId:'bank'});r.start();
  const pub=JSON.stringify(r.publicView());
  assert.ok(!/"cash"|"debt"|"netWorth"|"flows"/.test(pub));
  const mine=r.privateView(a.token),other=r.privateView(b.token);
  assert.equal(mine.isMyTurn,true);assert.equal(other.isMyTurn,false);assert.equal(typeof mine.me.cash,'number');
  assert.equal(other.me.isBank,true);
  assert.throws(()=>r.act(b.token,{type:'roll'}),/還沒輪到你/);
  r.act(a.token,{type:'roll'});
  assert.notEqual(r.game.phase,'roll');
});
test('借款、還款與壞帳的金額不出現在公開動態',()=>{
  const r=new Room('ABCD');const a=r.addHuman({name:'甲',roleId:'bank'}),b=r.addHuman({name:'乙',roleId:'auto'});r.start();
  r.game.phase='manage';
  r.act(a.token,{type:'loan',amount:100});r.act(a.token,{type:'repay',amount:50});r.act(a.token,{type:'bad',amount:10});
  assert.ok(r.publicView().game.log.every(x=>!/借款|償還|壞帳/.test(x)));
});
test('全部 Bot 也能自動打完一整局；存檔還原後狀態一致',()=>{
  const r=new Room('WXYZ');for(const level of ['low','mid','high'])r.addBot({level});
  r.start({maxRounds:6});
  let guard=0;while(r.game.status==='playing'&&guard++<5000)assert.ok(r.botStep());
  assert.notEqual(r.game.status,'playing');assert.ok(r.game.winnerIds.length>=1);
  const back=Room.fromJSON(JSON.parse(JSON.stringify(r.toJSON())));
  assert.deepEqual(back.publicView(),r.publicView());
});
