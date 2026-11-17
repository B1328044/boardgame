// 連線版房間邏輯（不含網路）：座位、開局、動作驗證、Bot 自動操作，以及「每個人只看得到自己的資料」的視角過濾。
// 伺服器是唯一執行遊戲引擎的地方；手機與大螢幕只送出動作、接收過濾後的畫面資料。
import {ROLES,BOARD,HIGHWAY,ABROAD,ECON_TILES,FATIGUE,OVERTIME,GOAL} from '../personal/data.js';
import {VARIANTS,createGame,drawDestiny,rollDice,drawEvent,resolveChoice,takeExam,endTurn,setOvertime,setHighway,repayDebt,borrow,buyCar,carOffer,buyHouse,canBuyHouse,computeQuarter,totalDebt,netWorth,debtRate,creditLimit,creditUsed,goalProgress,goalText,chanceOptions,cardById,isJobCard,jobOf,jobById,roleById,destinyById,economyRegime,tileAt,ticketPrice,jobConditionText,examTarget,respond,responder,respondOptions} from '../personal/engine.js';
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
  // variant：'jobs'（A 工作卡版）或 'roles'（B 角色版，玩家要選角色）。
  constructor(code,{mode='personal',variant='jobs'}={}){
    if(!VARIANTS[variant])throw Error('玩法無效。');
    this.code=code;this.mode=mode;this.variant=variant;this.hostKey=newToken();
    this.seats=[];this.game=null;this.maxRounds=24;this.serial=0;
    this.botMemo={key:null,memo:{}};this.lastActiveAt=Date.now();
  }
  // 大螢幕重新整理時用來存檔與還原（不含連線資訊）。
  toJSON(){return {v:2,code:this.code,mode:this.mode,variant:this.variant,hostKey:this.hostKey,maxRounds:this.maxRounds,serial:this.serial,seats:this.seats.map(({conn,lastSeen,...s})=>s),game:this.game}}
  static fromJSON(data){
    if(data?.v!==2||!data.code||!Array.isArray(data.seats))throw Error('房間存檔格式不正確。');
    const r=new Room(data.code,{mode:data.mode,variant:data.variant});
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
  // 工作卡版沒有角色：一律從基本工作開始，roleId 記成 null。
  checkRole(roleId){if(this.variant!=='roles')return null;if(!roleById(roleId))throw Error('角色無效。');return roleId}
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
    if(roleId!==undefined&&this.variant==='roles')seat.roleId=this.checkRole(roleId);
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
    this.game=createGame({players:this.seats.map(s=>({name:s.name,roleId:s.roleId,bot:s.bot})),maxRounds:this.maxRounds,variant:this.variant});
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
      case 'destiny':return drawDestiny(g);
      case 'exam':return takeExam(g);
      case 'highway':return setHighway(g,p.id,!!action.on);
      case 'roll':return rollDice(g);
      case 'draw':return drawEvent(g);
      case 'choose':return resolveChoice(g,p.id,n(action.index));
      case 'overtime':return setOvertime(g,p.id,n(action.level));
      case 'repay':return repayDebt(g,p.id,String(action.debtId),n(action.amount));
      case 'borrow':return borrow(g,p.id,n(action.amount));
      case 'car':return buyCar(g,p.id,action.mode==='loan'?'loan':'cash');
      case 'house':return buyHouse(g,p.id);
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
    if(g.phase==='destiny'){drawDestiny(g);return true}
    if(g.phase==='exam'){takeExam(g);return true}
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
      else if(step.type==='car')buyCar(g,q.id,step.mode);
      else if(step.type==='house')buyHouse(g,q.id);
      return true;
    }
    return false;
  }


  /* ---------- 視角過濾 ---------- */
  // 玩家的身分卡：角色版是角色，工作卡版是目前的工作（沒抽到工作卡就是基本工作）。兩者都是明牌。
  identity(p){
    if(p.variant==='roles'){const r=roleById(p.roleId);return {kind:'role',id:r.id,icon:r.icon,name:r.name,title:r.title}}
    const j=jobOf(p);return {kind:'job',id:j.id,icon:j.icon,name:j.name,title:`每季薪水 ${j.salary} 萬`}
  }
  // 大螢幕與所有人都看得到的資料：位置、身分卡、天命卡、車子、明牌負債、目標進度、事件與景氣。不含現金與非明牌的負債。
  publicView(){
    const g=this.game,variant=this.variant;
    const seats=this.seats.map(s=>({seatId:s.seatId,name:s.name,roleId:s.roleId,isBot:!!s.bot,botLabel:s.bot?botLabel(s.bot):'',connected:s.bot?true:s.connected}));
    const base={code:this.code,mode:this.mode,variant,variantLabel:VARIANTS[variant].label,variantShort:VARIANTS[variant].short,maxRounds:this.maxRounds,seats,
      goalText:variant==='roles'?'':GOAL.text,
      roles:variant==='roles'?ROLES.map(r=>({id:r.id,name:r.name,icon:r.icon,title:r.title,goal:r.goal.text})):[],
      botLevels:Object.entries(BOT_LEVELS).map(([id,v])=>({id,label:v.label,desc:v.desc}))};
    if(!g)return {...base,status:'lobby'};
    const cur=this.currentPlayer(),regime=economyRegime(g),last=g.decisions.at(-1),publicLog=g.log.filter(x=>!PRIVATE_LOG.test(x));
    const card=g.lastDraw?cardById(g.lastDraw.cardId):null,ld=g.lastDestiny?destinyById(g.lastDestiny.destinyId):null,ex=g.lastExam?jobById(g.lastExam.jobId):null;
    const pc=g.pendingChoice;
    return {...base,status:g.status,
      game:{round:g.round,maxRounds:g.maxRounds,turnIndex:g.turnIndex,phase:g.phase,dice:g.dice,reels:g.reels,effReels:g.effReels||null,winnerIds:g.winnerIds,winReason:g.winReason,
        currentId:cur?.id??null,skipReason:g.skipReason||'',
        economy:{growth:g.economy.growth,inflation:g.economy.inflation,unemployment:g.economy.unemployment,rate:g.economy.rate,carPrice:g.economy.carPrice,housePrice:g.economy.housePrice},
        regime,regimeText:regime==='normal'?'':ECON_TILES[regime].text,
        tiles:BOARD.map((t,i)=>{const x=tileAt('main',i,g);return {type:x.type,flipped:!!x.flipped,boosted:regime==='boom'&&x.type==='fortune'}}),
        highway:{from:HIGHWAY.from,to:HIGHWAY.to,toll:HIGHWAY.toll,tiles:HIGHWAY.tiles.map(t=>t.type)},
        abroad:{airport:ABROAD.airport,tiles:ABROAD.tiles.map(t=>t.type)},
        lastMove:g.lastMove?{playerId:g.lastMove.playerId,from:g.lastMove.from,path:g.lastMove.path,returned:!!g.lastMove.returned}:null,
        players:g.players.map((p,i)=>{const d=p.destinyId?destinyById(p.destinyId):null,idn=this.identity(p);return {id:p.id,seatId:this.seats[i]?.seatId,name:p.name,
          identity:idn,icon:idn.icon,roleName:idn.name,roleId:p.roleId,goal:goalText(p),color:p.color,track:p.track,position:p.position,bankrupt:p.bankrupt,
          destiny:d?{id:d.id,icon:d.icon,name:d.name,desc:d.desc}:null,car:!!p.owns.car,house:!!p.owns.house,waitTurns:p.waitTurns,
          training:p.training?{name:jobById(p.training.jobId).name,need:p.training.need}:null,
          publicDebts:p.debts.filter(x=>x.public&&x.balance>0).map(x=>({name:x.name,balance:x.balance})),
          isBot:!!p.bot,botLabel:p.bot?botLabel(p.bot):'',connected:this.seats[i]?.bot?true:!!this.seats[i]?.connected,progress:Math.round(goalProgress(g,p)*100)}}),
        destinyReveal:ld?{playerId:g.lastDestiny.playerId,seq:g.lastDestiny.seq,id:ld.id,icon:ld.icon,name:ld.name,desc:ld.desc}:null,
        card:card?{type:g.lastDraw.type,id:card.id,name:card.name,desc:card.desc||'',note:g.lastDraw.note||'',seq:g.lastDraw.seq||0,isJob:isJobCard(card),icon:card.icon||'',
          ...(isJobCard(card)?{salary:card.salary,cond:jobConditionText(card)}:{})}:null,
        // 機會卡的選項與機率只給輪到的玩家；大螢幕只看到「正在考慮」與結果。
        choiceKind:g.phase==='choice'&&pc?pc.kind:null,
        exam:g.lastExam?{name:ex.name,roll:g.lastExam.roll,bonus:g.lastExam.bonus,need:g.lastExam.need,ok:g.lastExam.ok}:null,
        result:g.lastResult?{text:g.lastResult.text,option:g.lastResult.option||''}:null,
        decision:last?{action:last.action,ruleId:last.ruleId}:null,
        respond:g.phase==='respond'&&g.pendingResponse?{type:g.pendingResponse.type,fromId:g.pendingResponse.fromId,targetId:g.pendingResponse.targetId,to:responder(g).name}:null,
        log:publicLog.slice(0,LOG_KEEP),logCount:publicLog.length}};
  }
  // 只給本人的資料：現金、負債、收支預估、輪到自己時可以做的操作。
  privateView(token){
    const seat=this.seatByToken(token);if(!seat)return null;
    const g=this.game,base={seatId:seat.seatId,name:seat.name,roleId:seat.roleId,variant:this.variant};
    if(!g)return base;
    const p=g.players.find(x=>x.id===seat.playerId);if(!p)return base;
    const isMyTurn=g.status==='playing'&&this.currentPlayer()?.id===p.id,q=computeQuarter(g,p),job=jobOf(p),idn=this.identity(p);
    const pc=g.pendingChoice,choosing=g.phase==='choice'&&isMyTurn&&pc;
    const card=choosing&&pc.cardId?cardById(pc.cardId):null;
    const mustRespond=g.status==='playing'&&responder(g)?.id===p.id;
    const car=carOffer(g,p),house=canBuyHouse(g,p),isRoles=p.variant==='roles',r=isRoles?roleById(p.roleId):null;
    const now=g.round,ally=p.effects.find(x=>x.source==='C13'&&x.until>=now),d=p.destinyId?destinyById(p.destinyId):null;
    let choice=null;
    if(choosing){
      const kind=pc.kind,opts=chanceOptions(g,p,card).map(o=>({index:o.index,key:o.key||'',label:o.label,stake:o.stake,affordable:o.affordable,reason:o.reason||'',odds:(o.outcomes||[]).map(x=>({p:x.p,text:x.text}))}));
      choice=kind==='airport'?{kind,id:'airport',name:'機場',icon:'✈️',desc:`剛好停在機場，可以買機票出國（${ticketPrice(g,p)?`${ticketPrice(g,p)} 萬`:'免費'}）。國外只用一個轉輪移動，走到終點自動回國。`,notice:'',options:opts}
        :{kind,id:card.id,name:card.name,icon:card.icon||'',desc:card.desc||'',
          ...(kind==='job'?{salary:card.salary,living:card.living,cond:jobConditionText(card),current:job.name}:{}),
          notice:pc.declined?.length?g.lastResult?.text||'':'',options:opts};
    }
    const exam=isMyTurn&&g.phase==='exam'&&p.training?(()=>{const j=jobById(p.training.jobId),t=examTarget(p,j);return {name:j.name,need:t.need,bonus:t.bonus}})():null;
    return {...base,playerId:p.id,isMyTurn,phase:isMyTurn?g.phase:null,
      me:{cash:p.cash,totalDebt:totalDebt(p),netWorth:netWorth(p),progress:Math.round(goalProgress(g,p)*100),goal:goalText(p),goalType:isRoles?r.goal.type:'netWorth',goalAmount:isRoles?r.goal.amount??null:GOAL.netWorth,
        identity:idn,icon:idn.icon,roleName:idn.name,
        job:{name:job.name,icon:job.icon,salary:job.salary,living:job.living,desc:job.desc||''},
        destiny:d?{id:d.id,icon:d.icon,name:d.name,desc:d.desc}:null,
        debts:p.debts.map(x=>({id:x.id,name:x.name,balance:x.balance,rate:debtRate(g,x),payment:x.payment,public:!!x.public})),
        fatigue:p.fatigue,burnout:FATIGUE.burnout,overtime:p.overtime,insured:p.insured,unemployedRounds:p.unemployedRounds,waitTurns:p.waitTurns,waitReason:p.waitReason||'',
        training:p.training?{name:jobById(p.training.jobId).name,need:p.training.need}:null,
        salaryFactor:p.salaryFactor,streak:p.streak,bestStreak:p.bestStreak,lastIncome:p.lastIncome,lastNet:p.lastNet,lastBreakdown:p.lastBreakdown,
        investments:p.investments.map(x=>({name:x.name,income:x.income,maturity:x.maturity})),
        alliance:ally?{until:ally.until,partner:g.players.find(x=>x.id===ally.partnerId)?.name||''}:null,
        penalties:p.effects.filter(x=>x.until>=now&&['C13-fallout','C13-decline'].includes(x.source)).map(x=>({text:x.source==='C13-fallout'?'合作鬧翻':'拒絕合作',income:x.income,until:x.until})),
        caseIn:round1(p.flatIncomes.filter(x=>x.until>=now&&x.label==='搶下的案子').reduce((s,x)=>s+x.amount,0)),
        caseOut:round1(p.flatIncomes.filter(x=>x.until>=now&&x.label==='被搶走的案子').reduce((s,x)=>s+x.amount,0)),
        preview:{earned:q.earned,living:q.living,debt:q.debt,net:q.net},
        creditRoom:Math.max(0,creditLimit(p)-creditUsed(p)),creditRate:g.economy.rate+8,
        car:{owned:!!p.owns.car,useHighway:!!p.useHighway,price:car.price,down:car.down,loan:car.loan,payment:car.payment,dsr:car.dsr,cashOk:car.cashOk,loanOk:car.loanOk,isGoal:isRoles&&r.goal.type==='car'},
        house:isRoles&&r.goal.type==='house'?{owned:!!p.owns.house,ok:!!house.ok,price:house.price,down:house.down,dsr:house.dsr,dsrLimit:r.goal.dsr}:null,
        overtimeLevels:Object.entries(OVERTIME).map(([lv,o])=>({level:Number(lv),label:o.label,income:o.income,fatigue:FATIGUE[`overtime${lv}`]})),
        fatigueRules:{normal:FATIGUE.none,rest:FATIGUE.restStop,burnout:FATIGUE.burnout,penalty:FATIGUE.burnoutIncome}},
      choice,exam,
      respond:mustRespond?respondOptions(g):null};
  }
}
