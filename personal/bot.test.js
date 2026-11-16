import test from 'node:test';
import assert from 'node:assert/strict';
import {BOARD} from './data.js';
import {createGame,drawEvent} from './engine.js';
import {makeBot,botLabel,botChoice,botManageStep} from './bot.js';
import {runSim} from './simulate.mjs';

const seq=values=>{let i=0;return ()=>values[i++%values.length]};
const game=(players)=>createGame({players:players.map(([roleId,bot],i)=>({name:`P${i+1}`,roleId,bot})),seed:7});
const chance=(s,id)=>{const p=s.players[s.turnIndex];p.position=BOARD.findIndex(t=>t.type==='chance');s.dice=1;s.phase='draw';drawEvent(s,id);return p};

test('建立 Bot：低難度會分配個性，中高難度沒有；存進玩家資料',()=>{
  assert.equal(makeBot('low',seq([0])).style,'random');
  assert.equal(makeBot('low',seq([.5])).style,'gambler');
  assert.equal(makeBot('low',seq([.9])).style,'cautious');
  assert.deepEqual(makeBot('high'),{level:'high'});
  assert.equal(makeBot('human'),null);
  const s=game([['low',{level:'mid'}],['office',null]]);
  assert.deepEqual(s.players[0].bot,{level:'mid'});assert.equal(s.players[1].bot,null);
  assert.equal(botLabel({level:'low',style:'gambler'}),'Bot·低（賭徒）');
  assert.throws(()=>game([['low',{level:'god'}],['office',null]]),/難度/);
});
test('低難度個性：賭徒押最大、保守派不冒險且會投保',()=>{
  const g=game([['exec',{level:'low',style:'gambler'}],['low',null]]);const p=chance(g,'C07');
  assert.equal(botChoice(g,p),1,'加密貨幣押 30 萬');
  const c=game([['exec',{level:'low',style:'cautious'}],['low',null]]);const q=chance(c,'C07');
  assert.equal(botChoice(c,q),2,'不碰');
  const i=game([['exec',{level:'low',style:'cautious'}],['low',null]]);const r=chance(i,'C08');
  assert.equal(botChoice(i,r),0,'投保');
});
test('高難度：選期望值為正的選項，且保留生活費緩衝',()=>{
  const s=game([['exec',{level:'high'}],['low',null]]);const p=chance(s,'C02');
  assert.equal(botChoice(s,p,seq([.9])),0,'併購消息期望值為正，現金充足就買');
  const t=game([['office',{level:'high'}],['low',null]]);const q=chance(t,'C06');
  assert.equal(botChoice(t,q,seq([.9])),1,'直銷期望值為負，拒絕');
});
test('經營步驟：高難度先還信用卡、存夠錢就買車；賭徒天天爆肝',()=>{
  const s=game([['office',{level:'high'}],['low',null]]);s.phase='manage';const p=s.players[0];p.cash=130;
  const memo={},steps=[];let step;
  while((step=botManageStep(s,p,memo))){steps.push(step);if(step.type==='repay'){const d=p.debts.find(x=>x.id===step.debtId);p.cash-=step.amount;d.balance-=step.amount}}
  assert.equal(steps[0].type,'overtime');
  assert.ok(steps.some(x=>x.type==='repay'&&x.debtId==='card-1'));
  assert.equal(steps.at(-1).type,'buy');
  const g=game([['free',{level:'low',style:'gambler'}],['low',null]]);g.phase='manage';
  assert.deepEqual(botManageStep(g,g.players[0],{}),{type:'overtime',level:2});
});
test('各難度 Bot 都能把整局打完，且高難度勝率高於低難度',()=>{
  const r=runSim(300,4,{quiet:true,levels:['low','mid','high'],offset:99});
  const rate=k=>r.byLevel[k].wins/r.byLevel[k].seats;
  const low=['low-random','low-gambler','low-cautious'].reduce((s,k)=>s+r.byLevel[k].wins,0)/['low-random','low-gambler','low-cautious'].reduce((s,k)=>s+r.byLevel[k].seats,0);
  assert.ok(rate('high')>low,`高 ${rate('high')} 應高於低 ${low}`);
});
