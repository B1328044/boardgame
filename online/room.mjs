// 連線版房間邏輯（不含網路）：座位、開局、動作驗證、Bot 自動操作，以及「每個人只看得到自己的資料」的視角過濾。
// 伺服器是唯一執行遊戲引擎的地方；手機與大螢幕只送出動作、接收過濾後的畫面資料。
import {ROLES,BOARD,ECON_TILES,FATIGUE,OVERTIME} from '../personal/data.js';
import {createGame,rollDice,drawEvent,resolveChoice,endTurn,setOvertime,repayDebt,borrow,buyGoal,canBuyGoal,housePlan,computeQuarter,totalDebt,debtRate,creditLimit,creditUsed,goalProgress,chanceOptions,cardById,roleById,economyRegime,tileType,tileFlipped,respond,responder,respondOptions} from '../personal/engine.js';
import {makeBot,botChoice,botRespond,botManageStep,botLabel,BOT_LEVELS} from '../personal/bot.js';

const CODE_CHARS='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const MAX_SEATS=8;
// 瀏覽器與 Node 都有 crypto.getRandomValues，房號與玩家憑證用它產生。
const randomBytes=n=>globalThis.crypto.getRandomValues(new Uint8Array(n));
export const newCode=()=>Array.from(randomBytes(4),b=>CODE_CHARS[b%CODE_CHARS.length]).join('');
const newToken=()=>Array.from(randomBytes(16),b=>b.toString(16).padStart(2,'0')).join('');
const round1=n=>Math.round(n*10)/10;
// 公開紀錄不顯示個人理財操作的金額。
const PRIVATE_LOG=/提前償還|申請信用貸款|自動動用信用貸款/;
const LOG_KEEP=60;   // 傳給畫面的最近動態則數；logCount 是公開動態的總數，用來判斷有幾則新的

export class Room{
  constructor(code,{mode='personal'}={}){
    this.code=code;this.mode=mode;this.hostKey=newToken();
    this.seats=[];this.game=null;this.maxRounds=24;this.serial=0;
    this.botMemo={key:null,memo:{}};this.lastActiveAt=Date.now();
  }
  // 大螢幕重新整理時用來存檔與還原（不含連線資訊）。
  toJSON(){return {v:1,code:this.code,mode:this.mode,hostKey:this.hostKey,maxRounds:this.maxRounds,serial:this.serial,seats:this.seats.map(({conn,lastSeen,...s})=>s),game:this.game}}
  static fromJSON(data){
    if(data?.v!==1||!data.code||!Array.isArray(data.seats))throw Error('房間存檔格式不正確。');
    const r=new Room(data.code,{mode:data.mode});
    Object.assign(r,{hostKey:data.hostKey,maxRounds:data.maxRounds,serial:data.serial,game:data.game||null});
    r.seats=data.seats.map(s=>({...s,connected:!!s.bot}));
    return r;
  }
  seatByToken(token){return token?this.seats.find(s=>s.token===token):undefined}
  uniqueName(name,except){
    const base=String(name||'').trim().slice(0,16)||'玩家';
    let n=base,i=2;while(this.seats.some(s=>s!==except&&s.name===n))n=`${base} ${i++}`;
    return n;
  }
  checkRole(roleId){if(!roleById(roleId))throw Error('角色無效。');return roleId}
  addHuman({name,roleId}){
    if(this.game)throw Error('遊戲已經開始，無法加入新玩家。');
    if(this.seats.length>=MAX_SEATS)throw Error('房間已滿（最多 8 人）。');
    const seat={seatId:`s${++this.serial}`,token:newToken(),name:'',roleId:this.checkRole(roleId||'low'),bot:null,connected:true,playerId:null};
    seat.name=this.uniqueName(name,seat);this.seats.push(seat);return seat;
  }
  addBot({level='mid',roleId='office'}={}){
    if(this.game)throw Error('遊戲已經開始。');
    if(this.seats.length>=MAX_SEATS)throw Error('房間已滿（最多 8 人）。');
    if(!BOT_LEVELS[level])throw Error('Bot 難度無效。');
    const seat={seatId:`s${++this.serial}`,token:null,name:'',roleId:this.checkRole(roleId),bot:makeBot(level),connected:true,playerId:null};
    seat.name=this.uniqueName(`Bot ${this.seats.filter(s=>s.bot).length+1}`,seat);this.seats.push(seat);return seat;
  }
  updateSeat(seat,{name,roleId}){
    if(this.game)throw Error('遊戲已經開始，無法更改。');
    if(roleId!==undefined)seat.roleId=this.checkRole(roleId);
    if(name!==undefined)seat.name=this.uniqueName(name,seat);
  }
  removeSeat(seatId){
    if(this.game)throw Error('遊戲已經開始。');
    this.seats=this.seats.filter(s=>s.seatId!==seatId);
  }
  start({maxRounds=this.maxRounds}={}){
    if(this.game&&this.game.status==='playing')throw Error('遊戲已經開始。');
    if(this.seats.length<2)throw Error('至少需要 2 位玩家（可以加入 Bot）。');
    this.maxRounds=Number(maxRounds)||24;
    this.game=createGame({players:this.seats.map(s=>({name:s.name,roleId:s.roleId,bot:s.bot})),maxRounds:this.maxRounds});
    this.seats.forEach((s,i)=>{s.playerId=this.game.players[i].id});
    this.botMemo={key:null,memo:{}};
  }
  backToLobby(){this.game=null;this.seats.forEach(s=>{s.playerId=null})}
  currentPlayer(){return this.game?.players[this.game.turnIndex]}
  // 現在該誰動作：平常是輪到的玩家；有人被邀請合作或被搶案子時，是要回覆的那個人。
  actor(){const g=this.game;return g?.phase==='respond'?responder(g):this.currentPlayer()}
  seatOf(p){return this.seats.find(s=>s.playerId===p?.id)}
  // 玩家送出的動作：只有該動作的那位玩家可以操作，其餘一律拒絕。
  act(token,action){
    const g=this.game,seat=this.seatByToken(token);
    if(!seat)throw Error('找不到你的座位，請重新加入。');
    if(!g||g.status!=='playing')throw Error('遊戲尚未開始或已經結束。');
    if(action?.type==='respond'){
      const r=responder(g);
      if(!r||r.id!==seat.playerId)throw Error('現在不需要你回覆。');
      return respond(g,r.id,!!action.yes);
    }
    const p=this.currentPlayer();
    if(g.phase==='respond')throw Error(`正在等 ${responder(g).name} 回覆。`);
    if(p.id!==seat.playerId)throw Error(`還沒輪到你，現在是 ${p.name} 的回合。`);
    const n=x=>{const v=Number(x);if(!Number.isFinite(v))throw Error('請輸入數字。');return v};
    switch(action?.type){
      case 'roll':return rollDice(g);
      case 'draw':return drawEvent(g);
      case 'choose':return resolveChoice(g,p.id,n(action.index));
      case 'overtime':return setOvertime(g,p.id,n(action.level));
      case 'repay':return repayDebt(g,p.id,String(action.debtId),n(action.amount));
      case 'borrow':return borrow(g,p.id,n(action.amount));
      case 'buy':return buyGoal(g,p.id);
      case 'end':return endTurn(g);
      default:throw Error('未知的動作。');
    }
  }
  // 需要大螢幕自動處理：該動作的是 Bot；或要回覆的真人已經離線（自動拒絕／不反制，避免整局卡住）。
  needsBot(){
    const g=this.game;if(g?.status!=='playing')return false;
    const a=this.actor();if(!a)return false;
    if(a.bot)return true;
    return g.phase==='respond'&&this.seatOf(a)?.connected===false;
  }
  // Bot 一次走一步，讓大螢幕看得到過程。回傳 false 代表現在不需要自動處理。
  botStep(rng=Math.random){
    if(!this.needsBot())return false;
    const g=this.game,q=this.currentPlayer();
    if(g.phase==='respond'){const a=this.actor();respond(g,a.id,a.bot?botRespond(g,a,rng):false);return true}
    if(g.phase==='roll'){rollDice(g);return true}
    if(g.phase==='skip'){endTurn(g);return true}
    if(g.phase==='draw'){drawEvent(g);return true}
    if(g.phase==='choice'){resolveChoice(g,q.id,botChoice(g,q,rng));return true}
    if(g.phase==='manage'){
      const key=`${g.round}:${g.turnIndex}`;
      if(this.botMemo.key!==key)this.botMemo={key,memo:{}};
      const step=botManageStep(g,q,this.botMemo.memo,rng);
      if(!step){endTurn(g);return true}
      if(step.type==='overtime')setOvertime(g,q.id,step.level);
      else if(step.type==='repay')repayDebt(g,q.id,step.debtId,step.amount);
      else if(step.type==='buy')buyGoal(g,q.id);
      return true;
    }
    return false;
  }

  /* ---------- 視角過濾 ---------- */
  // 大螢幕與所有人都看得到的資料：位置、角色、目標進度、事件與景氣。不含現金、負債與收支明細。
  publicView(){
    const g=this.game;
    const seats=this.seats.map(s=>({seatId:s.seatId,name:s.name,roleId:s.roleId,isBot:!!s.bot,botLabel:s.bot?botLabel(s.bot):'',connected:s.bot?true:s.connected}));
    const base={code:this.code,mode:this.mode,maxRounds:this.maxRounds,seats,roles:ROLES.map(r=>({id:r.id,name:r.name,icon:r.icon,title:r.title,goal:r.goal.text})),botLevels:Object.entries(BOT_LEVELS).map(([id,v])=>({id,label:v.label,desc:v.desc}))};
    if(!g)return {...base,status:'lobby'};
    const cur=this.currentPlayer(),regime=economyRegime(g),last=g.decisions.at(-1),publicLog=g.log.filter(x=>!PRIVATE_LOG.test(x));
    const card=g.lastDraw?cardById(g.lastDraw.cardId):null;
    return {...base,status:g.status,
      game:{round:g.round,maxRounds:g.maxRounds,turnIndex:g.turnIndex,phase:g.phase,dice:g.dice,reels:g.reels,winnerIds:g.winnerIds,winReason:g.winReason,
        currentId:cur?.id??null,
        economy:{growth:g.economy.growth,inflation:g.economy.inflation,unemployment:g.economy.unemployment,rate:g.economy.rate,carPrice:g.economy.carPrice,housePrice:g.economy.housePrice},
        regime,regimeText:regime==='normal'?'':ECON_TILES[regime].text,
        tiles:BOARD.map((t,i)=>({type:tileType(g,i),flipped:tileFlipped(g,i),boosted:regime==='boom'&&t.type==='fortune'})),
        players:g.players.map((p,i)=>{const r=roleById(p.roleId);return {id:p.id,seatId:this.seats[i]?.seatId,name:p.name,roleId:p.roleId,icon:r.icon,roleName:r.name,goal:r.goal.text,color:p.color,position:p.position,bankrupt:p.bankrupt,isBot:!!p.bot,botLabel:p.bot?botLabel(p.bot):'',connected:this.seats[i]?.bot?true:!!this.seats[i]?.connected,progress:Math.round(goalProgress(g,p)*100)}}),
        card:card?{type:g.lastDraw.type,id:card.id,name:card.name,desc:card.desc||'',note:g.lastDraw.note||''}:null,
        // 機會卡的選項與機率只給輪到的玩家；大螢幕只看到「正在考慮」與結果。
        result:g.lastResult?{text:g.lastResult.text,option:g.lastResult.option||''}:null,
        decision:last?{action:last.action,ruleId:last.ruleId}:null,
        respond:g.phase==='respond'&&g.pendingResponse?{type:g.pendingResponse.type,fromId:g.pendingResponse.fromId,targetId:g.pendingResponse.targetId,to:responder(g).name}:null,
        log:publicLog.slice(0,LOG_KEEP),logCount:publicLog.length}};
  }
  // 只給本人的資料：現金、負債、收支預估、輪到自己時可以做的操作。
  privateView(token){
    const seat=this.seatByToken(token);if(!seat)return null;
    const g=this.game,base={seatId:seat.seatId,name:seat.name,roleId:seat.roleId};
    if(!g)return base;
    const p=g.players.find(x=>x.id===seat.playerId);if(!p)return base;
    const r=roleById(p.roleId),isMyTurn=g.status==='playing'&&this.currentPlayer()?.id===p.id,q=computeQuarter(g,p);
    const card=g.phase==='choice'&&isMyTurn?cardById(g.pendingChoice.cardId):null;
    const mustRespond=g.status==='playing'&&responder(g)?.id===p.id;
    const buy=canBuyGoal(g,p),hp=p.roleId==='exec'?housePlan(g,p):null;
    const now=g.round,ally=p.effects.find(x=>x.source==='C13'&&x.until>=now);
    return {...base,playerId:p.id,isMyTurn,phase:isMyTurn?g.phase:null,
      me:{cash:p.cash,totalDebt:totalDebt(p),progress:Math.round(goalProgress(g,p)*100),goal:r.goal.text,goalType:r.goal.type,icon:r.icon,roleName:r.name,
        debts:p.debts.map(d=>({id:d.id,name:d.name,balance:d.balance,rate:debtRate(g,d),payment:d.payment})),
        fatigue:p.fatigue,burnout:FATIGUE.burnout,overtime:p.overtime,insured:p.insured,unemployedRounds:p.unemployedRounds,skipNext:p.skipNext,
        salaryFactor:p.salaryFactor,streak:p.streak,bestStreak:p.bestStreak,lastIncome:p.lastIncome,lastNet:p.lastNet,lastBreakdown:p.lastBreakdown,
        investments:p.investments.map(x=>({name:x.name,income:x.income,maturity:x.maturity})),
        alliance:ally?{until:ally.until,partner:g.players.find(x=>x.id===ally.partnerId)?.name||''}:null,
        penalties:p.effects.filter(x=>x.until>=now&&['C13-fallout','C13-decline'].includes(x.source)).map(x=>({text:x.source==='C13-fallout'?'合作鬧翻':'拒絕合作',income:x.income,until:x.until})),
        caseIn:round1(p.flatIncomes.filter(x=>x.until>=now&&x.label==='搶下的案子').reduce((s,x)=>s+x.amount,0)),
        caseOut:round1(p.flatIncomes.filter(x=>x.until>=now&&x.label==='被搶走的案子').reduce((s,x)=>s+x.amount,0)),
        preview:{earned:q.earned,living:q.living,debt:q.debt,net:q.net},
        creditRoom:Math.max(0,creditLimit(p)-creditUsed(p)),creditRate:g.economy.rate+8,
        buy:{ok:buy.ok,type:r.goal.type,price:p.roleId==='office'?g.economy.carPrice:hp?.price??null,down:hp?.down??null,dsr:hp?.dsr??null,dsrLimit:r.goal.dsr??null},
        overtimeLevels:Object.entries(OVERTIME).map(([lv,o])=>({level:Number(lv),label:o.label,income:o.income,fatigue:FATIGUE[`overtime${lv}`]})),
        fatigueRules:{normal:FATIGUE.none,rest:FATIGUE.restStop,burnout:FATIGUE.burnout,penalty:FATIGUE.burnoutIncome}},
      choice:card?{id:card.id,name:card.name,desc:card.desc||'',notice:g.pendingChoice.declined?.length?g.lastResult?.text||'':'',options:chanceOptions(g,p,card).map(o=>({index:o.index,label:o.label,stake:o.stake,affordable:o.affordable,reason:o.reason||'',odds:o.outcomes.map(x=>({p:x.p,text:x.text}))}))}:null,
      respond:mustRespond?respondOptions(g):null};
  }
}
