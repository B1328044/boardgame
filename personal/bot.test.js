import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,drawEvent,rollDice,carOffer} from './engine.js';
import {makeBot,botLabel,botChoice,botManageStep,jobValue,tripValue} from './bot.js';
import {runSim} from './simulate.mjs';
import {JOBS} from './data.js';

const seq=values=>{let i=0;return ()=>values[i++%values.length]};
const game=bots=>createGame({players:bots.map((bot,i)=>({name:`P${i+1}`,bot,destinyId:['D06','D01','D03','D04'][i]})),seed:7,dealDestinies:true});
const chance=(s,id)=>{s.queue=[{kind:'chance'}];s.phase='draw';drawEvent(s,id);return s.players[s.turnIndex]};

test('建立 Bot：低難度會分配個性，中高難度沒有；存進玩家資料',()=>{
  assert.equal(makeBot('low',seq([0])).style,'random');
  assert.equal(makeBot('low',seq([.5])).style,'gambler');
  assert.equal(makeBot('low',seq([.9])).style,'cautious');
  assert.deepEqual(makeBot('high'),{level:'high'});
  assert.equal(makeBot('human'),null);
  const s=game([{level:'mid'},null]);assert.deepEqual(s.players[0].bot,{level:'mid'});assert.equal(s.players[1].bot,null);
  assert.equal(botLabel({level:'low',style:'gambler'}),'Bot·低（賭徒）');
  assert.throws(()=>game([{level:'god'},null]),/難度/);
});
test('低難度個性：賭徒押最大、保守派不冒險',()=>{
  const g=game([{level:'low',style:'gambler'},null]);const p=chance(g,'C07');p.cash=100;
  assert.equal(botChoice(g,p),1,'加密貨幣押 30 萬');
  const c=game([{level:'low',style:'cautious'},null]);const q=chance(c,'C07');q.cash=100;
  assert.equal(botChoice(c,q),2,'不碰');
});
test('高難度：期望值為正才出手；直銷拒絕',()=>{
  const s=game([{level:'high'},null]);const p=chance(s,'C06');p.cash=50;
  assert.equal(botChoice(s,p,seq([.9])),1);
});
test('高難度工作判斷：醫生值得受訓；比現在差的工作改洗回重抽',()=>{
  assert.ok(jobValue(game([{level:'high'},null]),game([{level:'high'},null]).players[0],JOBS.find(j=>j.id==='J09'))>0);
  const s=game([{level:'high'},null]);const p=chance(s,'J09');
  assert.equal(botChoice(s,p,seq([.9])),0,'應徵醫生');
  const t=game([{level:'high'},null]);t.players[0].jobId='J09';const q=chance(t,'J01');
  assert.equal(botChoice(t,q,seq([.9])),2,'已是醫生，把文書工作洗回重抽');
});
test('高難度機場判斷：只有趟次價值高於機票才出國',()=>{
  const s=game([{level:'high'},null]);const p=s.players[0];p.position=7;p.cash=40;rollDice(s,[1,1]);
  const v=tripValue(s,p),choice=botChoice(s,p,seq([.9]));
  assert.equal(choice,v>8?0:1);
});
test('經營步驟：高難度收入夠高才貸款買車；賭徒天天爆肝',()=>{
  const s=game([{level:'high'},null]);s.phase='manage';const p=s.players[0];p.jobId='J09';p.roleId='exec';p.cash=60;
  const steps=[];const memo={};let step;while((step=botManageStep(s,p,memo))){steps.push(step);if(step.type==='overtime')p.overtime=step.level;if(step.type==='car')break}
  assert.ok(steps.some(x=>x.type==='car'),JSON.stringify(steps));
  const t=game([{level:'high'},null]);t.phase='manage';t.players[0].cash=30;
  assert.ok(!(()=>{const m={};let x;while((x=botManageStep(t,t.players[0],m)))if(x.type==='car')return true;return false})(),'基本工作不買車');
  const g=game([{level:'low',style:'gambler'},null]);g.phase='manage';
  assert.deepEqual(botManageStep(g,g.players[0],{}),{type:'overtime',level:2});
  assert.ok(carOffer(s,p).price>0);
});
test('各難度 Bot 都能把整局打完，且高難度勝率高於低難度',()=>{
  const r=runSim(300,4,{quiet:true,levels:['low','mid','high'],offset:99});
  const low=['low-random','low-gambler','low-cautious'];
  const lowRate=low.reduce((s,k)=>s+(r.byLevel[k]?.wins||0),0)/low.reduce((s,k)=>s+(r.byLevel[k]?.seats||0),0);
  const high=r.byLevel.high.wins/r.byLevel.high.seats;
  assert.ok(high>lowRate,`高 ${high} 應高於低 ${lowRate}`);
});
