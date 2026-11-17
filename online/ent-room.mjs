// 企業版連線房間（不含網路）：座位、開局、動作驗證、Bot 自動操作與視角過濾。
// 介面與個人版的 room.mjs 相同（大螢幕的 host.js 共用），差別在企業角色不能重複、財務資料只給本人。
import {ROLES,BOARD,ALL_EVENTS,SPECIAL,STAFF,METRIC_LABELS,CUSTOMER_GROUPS,CUSTOMER_GROUP_LABELS} from '../enterprise/data.js';
import {createGame,rollDice,confirmMove,drawEvent,resolveChoice,endTurn,adjustStaff,issueLoan,repayLoan,updateBadLoans,financials,companyPosition,staffPreview,layoffRoom,availableLabor,severancePerHead,customerRivals,assetValue,eventRemaining,makeSnapshot} from '../enterprise/engine.js';
import {makeBot,botAdjust,botChoice,botManageStep,botLabel,BOT_LEVELS} from '../enterprise/bot.js';

const CODE_CHARS='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const MAX_SEATS=8;
const randomBytes=n=>globalThis.crypto.getRandomValues(new Uint8Array(n));
export const newCode=()=>Array.from(randomBytes(4),b=>CODE_CHARS[b%CODE_CHARS.length]).join('');
const newToken=()=>Array.from(randomBytes(16),b=>b.toString(16).padStart(2,'0')).join('');
const r1=n=>Math.round(n*10)/10;
// 公開紀錄不顯示各公司的借貸、壞帳與資遣費金額。
const PRIVATE_LOG=/借款|償還|壞帳|資遣費|增資|贖金|售後租回|避險權利金|召回處理費/;
const LOG_KEEP=60;
const SECTORS=['製造業','消費業','金融業','能源與運輸','民生業','科技業'];
const sectorForTile=i=>SECTORS[((Math.floor((i-3)/3))%SECTORS.length+SECTORS.length)%SECTORS.length];
const entRole=id=>ROLES.find(r=>r.id===id);
const entEvent=id=>ALL_EVENTS.find(e=>e.id===id);
const SCOPE={global:'全球事件',personal:'個人事件',sector:'產業事件'};
// 卡片類型對應的提示音（共用個人版的四種卡片音效）。
const SCOPE_SOUND={global:'market',personal:'chance',sector:'fortune'};
const effectText=e=>e.effects.map(x=>`${x.metric==='asset_value'?'資產價值':METRIC_LABELS[x.metric]} ${x.pct>=0?'+':''}${x.pct}%${x.target!=='all'?`（${x.target.split(',').map(t=>entRole(t)?.name||({interest_negative:'有借款的企業',except_technology:'科技業以外'}[t]||t)).join('、')}）`:''}`);
const STAFF_STEPS=[5,10,20,40];

export class Room{
  constructor(code,{mode='enterprise'}={}){
    this.code=code;this.mode=mode;this.hostKey=newToken();
    this.seats=[];this.game=null;this.maxRounds=12;this.targetWealth=5500;this.serial=0;
    this.botMemo={key:null,memo:{}};
  }
  toJSON(){return {v:1,code:this.code,mode:this.mode,hostKey:this.hostKey,maxRounds:this.maxRounds,targetWealth:this.targetWealth,serial:this.serial,seats:this.seats.map(({conn,lastSeen,...s})=>s),game:this.game}}
  static fromJSON(data){
    if(data?.v!==1||!data.code||!Array.isArray(data.seats)||data.mode!=='enterprise')throw Error('房間存檔格式不正確。');
    const r=new Room(data.code);
    Object.assign(r,{hostKey:data.hostKey,maxRounds:data.maxRounds,targetWealth:data.targetWealth??5500,serial:data.serial,game:data.game||null});
    r.seats=data.seats.map(s=>({...s,connected:!!s.bot}));
    return r;
  }
  seatByToken(token){return token?this.seats.find(s=>s.token===token):undefined}
  seatOf(p){return this.seats.find(s=>s.playerId===p?.id)}
  uniqueName(name,except){
    const base=String(name||'').trim().slice(0,16)||'玩家';
    let n=base,i=2;while(this.seats.some(s=>s!==except&&s.name===n))n=`${base} ${i++}`;
    return n;
  }
  // 企業不能重複：指定的企業被選走時，自動換成第一個還沒人選的。
  freeRole(roleId,except){
    const taken=new Set(this.seats.filter(s=>s!==except).map(s=>s.roleId));
    if(roleId&&!entRole(roleId))throw Error('企業無效。');
    if(roleId&&!taken.has(roleId))return roleId;
    const free=ROLES.find(r=>!taken.has(r.id));if(!free)throw Error('所有企業都被選走了。');
    return free.id;
  }
  addHuman({name,roleId}){
    if(this.game)throw Error('遊戲已經開始，無法加入新玩家。');
    if(this.seats.length>=MAX_SEATS)throw Error('房間已滿（最多 8 人）。');
    const seat={seatId:`s${++this.serial}`,token:newToken(),name:'',roleId:null,bot:null,connected:true,playerId:null};
    seat.roleId=this.freeRole(roleId,seat);seat.name=this.uniqueName(name,seat);this.seats.push(seat);return seat;
  }
  addBot({level='mid',roleId}={}){
    if(this.game)throw Error('遊戲已經開始。');
    if(this.seats.length>=MAX_SEATS)throw Error('房間已滿（最多 8 人）。');
    if(!BOT_LEVELS[level])throw Error('Bot 難度無效。');
    const seat={seatId:`s${++this.serial}`,token:null,name:'',roleId:null,bot:makeBot(level),connected:true,playerId:null};
    seat.roleId=this.freeRole(roleId,seat);seat.name=this.uniqueName(`Bot ${this.seats.filter(s=>s.bot).length+1}`,seat);this.seats.push(seat);return seat;
  }
  updateSeat(seat,{name,roleId}){
    if(this.game)throw Error('遊戲已經開始，無法更改。');
    if(roleId!==undefined){
      if(this.seats.some(s=>s!==seat&&s.roleId===roleId))throw Error(`${entRole(roleId)?.name||'這個企業'}已經有人選了。`);
      seat.roleId=this.freeRole(roleId,seat);
    }
    if(name!==undefined)seat.name=this.uniqueName(name,seat);
  }
  removeSeat(seatId){if(this.game)throw Error('遊戲已經開始。');this.seats=this.seats.filter(s=>s.seatId!==seatId)}
  start({maxRounds=this.maxRounds,targetWealth=this.targetWealth}={}){
    if(this.game)throw Error('遊戲已經開始。');
    if(this.seats.length<2)throw Error('至少需要 2 位玩家。');
    this.maxRounds=Math.max(4,Math.min(30,Math.round(Number(maxRounds)||12)));
    this.targetWealth=Math.max(2000,Math.round(Number(targetWealth)||5500));
    this.game=createGame({players:this.seats.map(s=>({name:s.name,roleId:s.roleId,bot:s.bot})),seed:Date.now()%2147483647||1,maxRounds:this.maxRounds,targetWealth:this.targetWealth});
    this.seats.forEach((s,i)=>{s.playerId=this.game.players[i].id});
    this.botMemo={key:null,memo:{}};
  }
  backToLobby(){this.game=null;for(const s of this.seats)s.playerId=null}
  currentPlayer(){return this.game?.players[this.game.turnIndex]}
  actor(){return this.currentPlayer()}
  act(token,action){
    const g=this.game,seat=this.seatByToken(token);
    if(!seat)throw Error('找不到你的座位，請重新加入。');
    if(!g||g.status!=='playing')throw Error('遊戲尚未開始或已經結束。');
    const p=this.currentPlayer();
    if(p.id!==seat.playerId)throw Error(`還沒輪到你，現在是 ${p.name} 的回合。`);
    const int=x=>{const v=Number(x);if(!Number.isInteger(v))throw Error('請輸入整數。');return v};
    switch(action?.type){
      case 'roll':return rollDice(g);
      case 'adjust':return confirmMove(g,p.id,int(action.value));
      case 'draw':return drawEvent(g);
      case 'choose':return resolveChoice(g,p.id,String(action.value));
      case 'staff':return adjustStaff(g,p.id,int(action.delta));
      case 'loan':return issueLoan(g,p.id,int(action.amount));
      case 'repay':return repayLoan(g,p.id,int(action.amount));
      case 'bad':return updateBadLoans(g,p.id,int(action.amount));
      case 'end':return endTurn(g);
      default:throw Error('未知的動作。');
    }
  }
  needsBot(){const g=this.game;return g?.status==='playing'&&!!this.currentPlayer()?.bot}
  botStep(rng=Math.random){
    if(!this.needsBot())return false;
    const g=this.game,q=this.currentPlayer();
    if(g.phase==='roll'){rollDice(g);return true}
    if(g.phase==='adjust'){confirmMove(g,q.id,botAdjust(g,q,rng));return true}
    if(g.phase==='strike'){endTurn(g);return true}
    if(g.phase==='draw'){drawEvent(g);return true}
    if(g.phase==='choice'){resolveChoice(g,q.id,botChoice(g,q,rng));return true}
    if(g.phase==='manage'){
      const key=`${g.round}:${g.turnIndex}`;
      if(this.botMemo.key!==key)this.botMemo={key,memo:{}};
      const step=botManageStep(g,q,this.botMemo.memo,rng);
      if(!step){endTurn(g);return true}
      adjustStaff(g,q.id,step.delta);return true;
    }
    return false;
  }

  /* ---------- 視角過濾 ---------- */
  // 公開：位置、企業、淨資產目標進度、事件、景氣與聯準會；不含現金、負債與損益明細。
  publicView(){
    const g=this.game;
    const seats=this.seats.map(s=>({seatId:s.seatId,name:s.name,roleId:s.roleId,isBot:!!s.bot,botLabel:s.bot?botLabel(s.bot):'',connected:s.bot?true:s.connected}));
    const base={code:this.code,mode:this.mode,maxRounds:this.maxRounds,targetWealth:this.targetWealth,seats,
      roles:ROLES.map(r=>({id:r.id,name:r.name,icon:r.icon,title:r.sector,goal:`${r.sector} · 基準員工 ${r.baseHeadcount} 人`})),
      botLevels:Object.entries(BOT_LEVELS).map(([id,v])=>({id,label:v.label,desc:v.desc}))};
    if(!g)return {...base,status:'lobby'};
    const cur=this.currentPlayer(),publicLog=g.log.filter(x=>!PRIVATE_LOG.test(x)),snap=makeSnapshot(g),last=g.decisions.at(-1);
    const draw=g.lastDraw&&g.lastDraw.startedRound===g.round?g.lastDraw:null,e=draw?entEvent(draw.eventId):null;
    const winReason={goal:'goal',round_limit:'progress',bankruptcy:'bankruptcy'}[g.status]||'';
    return {...base,status:g.status==='playing'?'playing':'finished',
      game:{round:g.round,maxRounds:g.maxRounds,targetWealth:g.targetWealth,turnIndex:g.turnIndex,phase:g.phase,dice:g.dice,reels:g.reels,winnerIds:g.winnerIds,winReason,endStatus:g.status,
        currentId:cur?.id??null,ghostPosition:g.ghostPosition,strikeCause:g.strikeCause,
        // 背景音樂依景氣切換：營收成長 ≤ −2% 算衰退、≥ 4% 算過熱。
        regime:snap.growthPct===null?'normal':snap.growthPct<=-2?'recession':snap.growthPct>=4?'boom':'normal',
        tiles:BOARD.map((t,i)=>({type:t.type,label:t.type==='sector'?sectorForTile(i):t.label})),
        players:g.players.map((p,i)=>{const r=entRole(p.roleId),pos=companyPosition(g,p.roleId);return {id:p.id,seatId:this.seats[i]?.seatId,name:p.name,roleId:p.roleId,icon:r.icon,roleName:r.name,sector:r.sector,color:p.color,position:p.position,bankrupt:false,
          isBot:!!p.bot,botLabel:p.bot?botLabel(p.bot):'',connected:this.seats[i]?.bot?true:!!this.seats[i]?.connected,
          progress:Math.max(0,Math.min(100,Math.round(pos.netWorth/g.targetWealth*100))),
          shield:p.strikeShield,aeo:p.moveAdjust,stall:p.stallNext,struck:g.struckPlayerIds.includes(p.id)}}),
        card:e?{id:e.id,name:e.name,scope:draw.scope,scopeLabel:SCOPE[draw.scope],sector:draw.sector,duration:e.duration,desc:e.desc||'',effects:effectText(e),fallback:draw.fallback||'',sound:SCOPE_SOUND[draw.scope],ownerId:draw.ownerId}:null,
        choosing:g.phase==='choice'&&g.pendingChoice?{name:entEvent(g.pendingChoice.eventId).name}:null,
        fed:{rate:g.fedRatePercent,program:g.monetaryProgram?.type||null,inflation:snap.inflationPct,unemployment:snap.unemploymentPct,growth:snap.growthPct,stock:snap.stockIndex,
          decision:last?{action:last.action,ruleId:last.ruleId,round:last.round}:null},
        events:g.activeEvents.filter(a=>a.scope!=='personal'&&eventRemaining(a,g.round)>0).map(a=>({name:entEvent(a.eventId).name,scope:a.scope,sector:a.sector,left:eventRemaining(a,g.round)})),
        log:publicLog.slice(0,LOG_KEEP),logCount:publicLog.length}};
  }
  // 只給本人：公司財務、員工、借貸與輪到自己時可以做的事。
  privateView(token){
    const seat=this.seatByToken(token);if(!seat)return null;
    const g=this.game,base={seatId:seat.seatId,name:seat.name,roleId:seat.roleId};
    if(!g)return base;
    const p=g.players.find(x=>x.id===seat.playerId);if(!p)return base;
    const r=entRole(p.roleId),c=g.companies[p.roleId],f=financials(g,p.roleId),pos=companyPosition(g,p.roleId);
    const isMyTurn=g.status==='playing'&&this.currentPlayer()?.id===p.id,phase=isMyTurn?g.phase:null;
    const room=layoffRoom(g,p.roleId),pool=availableLabor(g);
    const preview=d=>{const pv=staffPreview(g,p.roleId,d);return pv&&(d>0?d<=pool:-d<=room)?{delta:d,net:pv.net,severance:pv.severance,moraleHit:pv.moraleHit,payback:pv.payback}:null};
    let choice=null;
    if(phase==='choice'&&g.pendingChoice){
      const e=entEvent(g.pendingChoice.eventId);let options=[];
      if(e.choice==='target')options=(e.special==='transfer'?customerRivals(g,p):g.players.filter(x=>x.id!==p.id)).map(x=>({value:x.id,label:`${x.name}（${entRole(x.roleId).name}）`}));
      else if(e.special==='equity')options=[{value:'accept',label:`接受，現金 +${SPECIAL.equityCash}`},{value:'decline',label:'放棄'}];
      else if(e.special==='leaseback'){const v=assetValue(g,p.roleId);options=[...(v>0?[{value:'accept',label:`出售資產，換得 ${Math.round(v)}`}]:[]),{value:'decline',label:'放棄'}]}
      else if(e.choice==='ransom')options=[{value:'pay',label:`支付贖金 ${SPECIAL.ransomCost}`},{value:'refuse',label:'拒付，下回合停擺'}];
      choice={id:e.id,name:e.name,desc:e.desc||'',options};
    }
    const adjust=phase==='adjust'&&g.pendingRoll?{dice:g.pendingRoll.dice,left:p.moveAdjust,options:[-1,0,1].filter(d=>g.pendingRoll.dice+d>=0).map(d=>{const steps=g.pendingRoll.dice+d,to=(p.position+steps)%BOARD.length;return {value:d,steps,to,ghost:to===g.ghostPosition}})}:null;
    const groups=Object.entries(CUSTOMER_GROUPS).filter(([,ids])=>ids.includes(p.roleId)).map(([k])=>CUSTOMER_GROUP_LABELS[k]);
    const mine=g.activeEvents.filter(a=>eventRemaining(a,g.round)>0&&(a.scope==='global'||a.scope==='sector'&&a.sector===r.sector||a.scope==='personal'&&(a.ownerId===p.id||a.partnerId===p.id||a.targetId===p.id)))
      .map(a=>({name:entEvent(a.eventId).name,scope:SCOPE[a.scope],left:eventRemaining(a,g.round),note:a.eventId==='P14'&&a.targetId?(a.ownerId===p.id?'取得對方營收 10%':'營收的 10% 轉給對手'):a.partnerId?'策略聯盟':''}));
    return {...base,playerId:p.id,isMyTurn,phase,
      me:{icon:r.icon,roleName:r.name,sector:r.sector,groups,
        cash:c.cash,assetValue:pos.assetValue,debt:c.debt,netWorth:pos.netWorth,target:g.targetWealth,progress:Math.max(0,Math.min(100,Math.round(pos.netWorth/g.targetWealth*100))),
        revenue:r1(f.revenue+f.otherIncome),costs:r1(-f.costs),netProfit:r1(f.netProfit),macro:Math.round(f.macro*100)/100,
        flows:Object.entries(f.flows).filter(([,v])=>v).map(([k,v])=>({label:METRIC_LABELS[k],amount:r1(v)})),
        headcount:c.headcount,base:r.baseHeadcount,morale:c.morale,attritionMorale:STAFF.attritionMorale,layoffRoom:room,pool,severance:Math.round(severancePerHead(p.roleId)*100)/100,
        staffOptions:STAFF_STEPS.flatMap(n=>[preview(n),preview(-n)]).filter(Boolean),
        bankLiquid:g.bank.liquidAssets,loanBlocked:g.bank.riskRestrictionUntil>=g.round,fedRate:g.fedRatePercent,
        isBank:p.roleId==='bank',npl:g.bank.nonperformingLoans,
        shield:p.strikeShield,aeo:p.moveAdjust,stall:p.stallNext,
        hedgeUntil:c.hedgeUntil&&g.round<=c.hedgeUntil?c.hedgeUntil:null,leaseUntil:c.leaseUntil&&g.round<=c.leaseUntil?c.leaseUntil:null,equityUntil:c.equityUntil&&g.round<=c.equityUntil?c.equityUntil:null,
        events:mine},
      choice,adjust};
  }
}
