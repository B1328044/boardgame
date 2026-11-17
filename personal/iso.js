// 等角（半 2D 俯視）棋盤：主島＋中央高速公路＋右上角的浮空島（國外），可拖曳、縮放。
// 單機版（app.js）與連線大螢幕（online/host.js）共用。地圖大小固定為「剛好看得到兩座島再往外一些」，
// 最小縮放就是全覽，放大後只能在這個範圍內拖曳。
// 用法：const board=createIsoBoard(); 把 board.el 放進畫面；每次狀態改變呼叫 board.render(model)。
//   model.tiles：{main:[{type,flipped,boosted}], highway:['fortune',...], abroad:['arrival',...]}
//   model.pawns：[{id,key:'main-3',color:'#0f9688',icon:'🧾',name,current,moving}]
//   model.activeKey：要標亮的格子（走路動畫目前所在格）
import {MAP} from './data.js';

export function createIsoBoard(){
  const W=96,H=48,DEPTH=12,MARGIN=40,NS='http://www.w3.org/2000/svg';
  const LABEL={home:'家鄉',fortune:'好運',market:'市場',chance:'機會',loss:'災難',airport:'機場',ramp:'交流道',exit:'出口',toll:'收費站',arrival:'入境',abroad:'國外',return:'回國'};
  const ICON={home:'⌂',fortune:'✦',market:'◎',chance:'?',loss:'⚠',airport:'✈',ramp:'⇢',exit:'⇠',toll:'¤',arrival:'⇣',abroad:'◍',return:'⇡'};
  const iso=(x,y)=>({x:(x-y)*W/2,y:(x+y)*H/2});
  const {n,k}=MAP;
  // 浮空島放在右上邊外側（畫面右上角）。
  const edgeMid=iso((n-1)*.62,0),ic0=iso((k-1)/2,(k-1)/2);
  const islandOrigin={x:edgeMid.x+W*1.15-ic0.x,y:edgeMid.y-H*(k*.5+2.1)-ic0.y};
  const islandMid={x:islandOrigin.x+ic0.x,y:islandOrigin.y+ic0.y};
  const center=key=>{
    const [t,iStr]=key.split('-'),i=Number(iStr);
    const xy=t==='main'?MAP.main[i]:t==='highway'?MAP.highway[i]:MAP.abroad[i];
    if(!xy)return {x:0,y:0};
    const p=iso(xy[0],xy[1]);
    return t==='abroad'?{x:p.x+islandOrigin.x,y:p.y+islandOrigin.y}:p;
  };
  // 固定的地圖範圍：所有格子、浮空島的岩石與上方的棋子空間，再往外留一點邊。
  const rect=(()=>{
    const keys=[...MAP.main.map((_,i)=>`main-${i}`),...MAP.highway.map((_,i)=>`highway-${i}`),...MAP.abroad.map((_,i)=>`abroad-${i}`)];
    const pts=keys.map(center);
    const x0=Math.min(...pts.map(p=>p.x))-W/2,x1=Math.max(...pts.map(p=>p.x))+W/2;
    const y0=Math.min(...pts.map(p=>p.y))-H/2-56,y1=Math.max(islandMid.y+k*H*1.05,...pts.map(p=>p.y+H/2+DEPTH+14));
    return {x:x0-MARGIN,y:y0-MARGIN,w:x1-x0+2*MARGIN,h:y1-y0+2*MARGIN};
  })();

  const el=document.createElement('div');el.className='iso-board';el.tabIndex=0;
  el.setAttribute('aria-label','等角棋盤：拖曳移動、滾輪或兩指縮放、方向鍵平移');
  el.innerHTML=`<svg class="iso-svg" role="img" aria-label="人生棋局棋盤"><g class="iso-world"><g class="iso-static"></g><g class="iso-pawns"></g></g></svg>
    <div class="iso-cam"><button type="button" data-iso="main">🏠 主島</button><button type="button" data-iso="island">🏝 國外島</button><button type="button" data-iso="all">⤢ 全覽</button><span class="iso-zoom"><button type="button" data-iso="in" aria-label="放大">＋</button><button type="button" data-iso="out" aria-label="縮小">－</button></span></div>`;
  const svg=el.querySelector('svg'),world=el.querySelector('.iso-world'),staticG=el.querySelector('.iso-static'),pawnsG=el.querySelector('.iso-pawns');
  const mk=(tag,attrs,parent)=>{const e=document.createElementNS(NS,tag);for(const [a,v] of Object.entries(attrs))e.setAttribute(a,v);if(parent)parent.appendChild(e);return e};
  const txt=(parent,attrs,text)=>{const e=mk('text',attrs,parent);e.textContent=text;return e};
  const pts=a=>a.map(q=>`${q[0]},${q[1]}`).join(' ');

  /* ---------- 格子 ---------- */
  function tile(g,key,type,{road=false,event=null,flipped=false,boosted=false}={}){
    const c=center(key),f=(W/2-3)/(W/2);
    const T=[[c.x,c.y-H/2],[c.x+W/2,c.y],[c.x,c.y+H/2],[c.x-W/2,c.y]].map(q=>[c.x+(q[0]-c.x)*f,c.y+(q[1]-c.y)*f]);
    const down=q=>[q[0],q[1]+DEPTH];
    const tg=mk('g',{class:`iso-tile t-${road?'road':type}${flipped?' flipped':''}`,'data-node':key},g);
    mk('polygon',{points:pts([T[3],T[2],down(T[2]),down(T[3])]),class:'iso-side l'},tg);
    mk('polygon',{points:pts([T[2],T[1],down(T[1]),down(T[2])]),class:'iso-side r'},tg);
    mk('polygon',{points:pts(T),class:'iso-top'},tg);
    if(road){
      mk('line',{x1:c.x+W/4-4,y1:c.y-H/4+2,x2:c.x-W/4+4,y2:c.y+H/4-2,class:'iso-roadline'},tg);
      if(event){mk('circle',{cx:c.x,cy:c.y-1,r:10,class:`iso-ev ev-${event}`},tg);txt(tg,{x:c.x,y:c.y+3,'text-anchor':'middle',class:`iso-evicon ev-${event}`},ICON[event])}
      return;
    }
    txt(tg,{x:c.x,y:c.y+2,'text-anchor':'middle',class:'iso-lbl'},`${ICON[type]} ${LABEL[type]}`);
    const [t,i]=key.split('-');
    txt(tg,{x:c.x,y:c.y+15,'text-anchor':'middle',class:'iso-num'},t==='main'?String(i).padStart(2,'0'):t==='abroad'?`A${Number(i)+1}`:`H${Number(i)+1}`);
    if(flipped||boosted){const w=34;mk('rect',{x:c.x-w/2,y:c.y-H/2+2,width:w,height:13,rx:6.5,class:flipped?'iso-tag bad':'iso-tag good'},tg);txt(tg,{x:c.x,y:c.y-H/2+11.5,'text-anchor':'middle',class:'iso-tagtext'},flipped?'衰退':'×1.5')}
  }
  // 等角方塊（房子、塔台）：以底面中心 (cx,cy) 為準，邊長 w（以格子為單位）、高 h（像素）。
  function block(g,cx,cy,w,d,h,cls){
    const hw=w*W/2,hh=w*H/2;
    const L=[cx-hw,cy],F=[cx,cy+hh],R=[cx+hw,cy],Bk=[cx,cy-hh];
    const up=q=>[q[0],q[1]-h];
    mk('polygon',{points:pts([L,F,up(F),up(L)]),class:`iso-block ${cls} l`},g);
    mk('polygon',{points:pts([F,R,up(R),up(F)]),class:`iso-block ${cls} r`},g);
    mk('polygon',{points:pts([up(L),up(F),up(R),up(Bk)]),class:`iso-roof ${cls}`},g);
  }
  function cloud(g,x,y,s){for(const [dx,dy,r] of [[0,0,22],[24,-8,18],[46,2,20],[20,8,20]])mk('ellipse',{cx:x+dx*s,cy:y+dy*s,rx:r*s*1.4,ry:r*s*.75,class:'iso-cloud'},g)}

  let tileSig='';
  function drawStatic(tiles){
    staticG.textContent='';
    const g=staticG;
    // 浮空島：岩石＋草地＋格子（畫在最底層，主島會蓋住垂下來的岩石）
    const isl=mk('g',{class:'iso-island'},g);
    const ic=[iso(-.6,-.6),iso(k-.4,-.6),iso(k-.4,k-.4),iso(-.6,k-.4)].map(p=>[p.x+islandOrigin.x,p.y+islandOrigin.y]);
    const mid=[(ic[0][0]+ic[2][0])/2,(ic[0][1]+ic[2][1])/2],tip=[mid[0]+6,mid[1]+k*H*1.05],kink=[mid[0]-W*.4,ic[2][1]+H*1.2];
    mk('polygon',{points:pts([[ic[3][0],ic[3][1]+DEPTH],[ic[2][0],ic[2][1]+DEPTH],kink,tip]),class:'iso-rock l'},isl);
    mk('polygon',{points:pts([[ic[2][0],ic[2][1]+DEPTH],[ic[1][0],ic[1][1]+DEPTH],tip,kink]),class:'iso-rock r'},isl);
    mk('polygon',{points:pts(ic.map(p=>[p[0],p[1]+DEPTH])),class:'iso-grass'},isl);
    MAP.abroad.map((xy,i)=>({xy,i})).sort((a,b)=>(a.xy[0]+a.xy[1])-(b.xy[0]+b.xy[1])||a.xy[0]-b.xy[0])
      .forEach(({i})=>tile(isl,`abroad-${i}`,tiles.abroad[i]||'abroad'));
    for(const [dx,dy] of [[-10,0],[12,6],[0,-10]]){const x=islandMid.x+dx,y=islandMid.y+dy;mk('rect',{x:x-2,y:y-12,width:4,height:12,class:'iso-trunk'},isl);mk('circle',{cx:x,cy:y-18,r:9,class:'iso-tree'},isl)}
    // 主島：陰影、中央草地、格子（依 x+y 由後往前畫）
    const cs=[iso(-.6,-.6),iso(n-.4,-.6),iso(n-.4,n-.4),iso(-.6,n-.4)];
    mk('polygon',{points:pts(cs.map(p=>[p.x,p.y+DEPTH+10])),class:'iso-shadow'},g);
    const inner=[iso(.6,.6),iso(n-1.6,.6),iso(n-1.6,n-1.6),iso(.6,n-1.6)];
    mk('polygon',{points:pts(inner.map(p=>[p.x,p.y])),class:'iso-grass inner'},g);
    const all=[...MAP.main.map((xy,i)=>({xy,key:`main-${i}`,t:tiles.main[i]})),...MAP.highway.map((xy,i)=>({xy,key:`highway-${i}`,road:true,ev:tiles.highway[i]}))]
      .sort((a,b)=>(a.xy[0]+a.xy[1])-(b.xy[0]+b.xy[1])||a.xy[0]-b.xy[0]);
    const tg=mk('g',{},g);
    for(const x of all){if(x.road)tile(tg,x.key,'road',{road:true,event:x.ev});else tile(tg,x.key,x.t.type,{flipped:x.t.flipped,boosted:x.t.boosted})}
    // 裝飾：家鄉的房子、機場塔台、交流道路牌
    const deco=mk('g',{},g),home=center('main-0');block(deco,home.x+36,home.y-2,.2,.2,18,'house');
    const ai=tiles.main.findIndex(t=>t.type==='airport'),air=center(`main-${ai}`);block(deco,air.x+36,air.y-2,.12,.12,32,'tower');
    const ri=tiles.main.findIndex(t=>t.type==='ramp'),rc=center(`main-${ri}`);
    mk('line',{x1:rc.x,y1:rc.y-34,x2:rc.x,y2:rc.y-8,class:'iso-pole'},deco);
    mk('rect',{x:rc.x-30,y:rc.y-52,width:60,height:18,rx:3,class:'iso-sign'},deco);txt(deco,{x:rc.x,y:rc.y-39,'text-anchor':'middle',class:'iso-signtext'},'↙ 高速公路');
    // 航線：機場 → 入境
    const a1=center('abroad-0'),ctrl={x:Math.min(air.x,a1.x)-150,y:(air.y+a1.y)/2-30};
    const d=`M${air.x},${air.y-30} Q${ctrl.x},${ctrl.y} ${a1.x},${a1.y-24}`;
    mk('path',{d,class:'iso-flight glow'},g);mk('path',{d,class:'iso-flight'},g);
    const tp=.55,mx=(1-tp)**2*air.x+2*(1-tp)*tp*ctrl.x+tp**2*a1.x,my=(1-tp)**2*(air.y-30)+2*(1-tp)*tp*ctrl.y+tp**2*(a1.y-24);
    txt(g,{x:mx,y:my+7,'text-anchor':'middle',class:'iso-plane'},'✈️');
    const sky=mk('g',{},g);cloud(sky,islandMid.x+W*1.6,islandMid.y+H*1.2,.8);cloud(sky,islandMid.x-W*1.4,islandMid.y-H*2.2,.6);
  }

  /* ---------- 棋子 ---------- */
  const pawnEls=new Map();
  function drawPawns(pawns,activeKey){
    staticG.querySelectorAll('.iso-tile.active').forEach(t=>t.classList.remove('active'));
    if(activeKey)staticG.querySelector(`[data-node="${activeKey}"]`)?.classList.add('active');
    const seen=new Set(),groups=new Map();
    for(const p of pawns){if(!groups.has(p.key))groups.set(p.key,[]);groups.get(p.key).push(p)}
    // 同一格多人時排成小圓圈；目前玩家畫在最上面。
    const order=[...pawns].sort((a,b)=>(a.current||a.moving)-(b.current||b.moving));
    for(const p of order){
      seen.add(p.id);
      const list=groups.get(p.key),idx=list.indexOf(p),cnt=list.length,c=center(p.key);
      const ang=cnt>1?idx/cnt*Math.PI*2:0,r=cnt>1?16:0,x=c.x+Math.cos(ang)*r,y=c.y+Math.sin(ang)*r*.5;
      let g=pawnEls.get(p.id);
      if(!g){
        g=mk('g',{class:'iso-pawn'},null);
        mk('ellipse',{cx:0,cy:2,rx:12,ry:6,class:'iso-pawn-shadow'},g);
        mk('line',{x1:0,y1:0,x2:0,y2:-18,class:'iso-pawn-stick'},g);
        mk('circle',{cx:0,cy:-26,r:13,class:'iso-pawn-head'},g);
        mk('text',{x:0,y:-21.5,'text-anchor':'middle',class:'iso-pawn-icon'},g);
        mk('title',{},g);
        pawnEls.set(p.id,g);
        g.style.transform=`translate(${x}px,${y}px)`;
      }
      g.querySelector('.iso-pawn-stick').style.stroke=p.color;g.querySelector('.iso-pawn-head').style.fill=p.color;
      g.querySelector('.iso-pawn-icon').textContent=p.icon||'';g.querySelector('title').textContent=p.name||'';
      g.classList.toggle('current',!!p.current);g.classList.toggle('moving',!!p.moving);
      g.style.transform=`translate(${x}px,${y}px)`;
      pawnsG.appendChild(g);
    }
    for(const [id,g] of pawnEls)if(!seen.has(id)){g.remove();pawnEls.delete(id)}
  }

  /* ---------- 鏡頭 ---------- */
  const cam={x:0,y:0,s:1};let userMoved=false,anim=null;
  const reduce=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  const vw=()=>el.clientWidth,vh=()=>el.clientHeight;
  const minScale=()=>Math.min(vw()/rect.w,vh()/rect.h)||1;
  const maxScale=()=>Math.max(2.4,minScale()*3);
  function clamp(){
    if(!vw()||!vh())return;
    cam.s=Math.min(maxScale(),Math.max(minScale(),cam.s));
    // 地圖比畫面小的那個方向置中；比畫面大的方向只能在地圖範圍內移動。
    const fitX=rect.w*cam.s<=vw()+.5,fitY=rect.h*cam.s<=vh()+.5;
    cam.x=fitX?(vw()-rect.w*cam.s)/2-rect.x*cam.s:Math.min(-rect.x*cam.s,Math.max(vw()-(rect.x+rect.w)*cam.s,cam.x));
    cam.y=fitY?(vh()-rect.h*cam.s)/2-rect.y*cam.s:Math.min(-rect.y*cam.s,Math.max(vh()-(rect.y+rect.h)*cam.s,cam.y));
  }
  const apply=()=>world.setAttribute('transform',`translate(${cam.x},${cam.y}) scale(${cam.s})`);
  const focus=(pt,s)=>({x:vw()/2-pt.x*s,y:vh()/2-pt.y*s,s});
  function flyTo(t){
    cancelAnimationFrame(anim);
    const from={...cam};Object.assign(cam,t);clamp();const to={...cam};Object.assign(cam,from);
    if(reduce()){Object.assign(cam,to);apply();return}
    const t0=performance.now(),ease=x=>x<.5?2*x*x:1-(-2*x+2)**2/2;
    const step=now=>{const q=Math.min(1,(now-t0)/600),e=ease(q);for(const k2 of ['x','y','s'])cam[k2]=from[k2]+(to[k2]-from[k2])*e;apply();if(q<1)anim=requestAnimationFrame(step)};
    anim=requestAnimationFrame(step);
  }
  function fit(){userMoved=false;cam.s=minScale();clamp();apply()}
  const mainCenter=iso((n-1)/2,(n-1)/2);
  const views={
    all:()=>({...focus({x:rect.x+rect.w/2,y:rect.y+rect.h/2},minScale())}),
    main:()=>focus({x:mainCenter.x,y:mainCenter.y},Math.max(minScale(),Math.min(vw()/(n*W*1.05),vh()/(n*H*1.25+80)))),
    island:()=>focus({x:islandMid.x,y:islandMid.y+20},Math.max(minScale(),Math.min(vw()/(k*W*1.7),vh()/(k*H*3.2))))
  };
  function zoomAt(f,px=vw()/2,py=vh()/2){
    const s=Math.min(maxScale(),Math.max(minScale(),cam.s*f)),r=s/cam.s;
    cam.x=px-(px-cam.x)*r;cam.y=py-(py-cam.y)*r;cam.s=s;userMoved=true;clamp();apply();
  }
  el.addEventListener('click',e=>{const b=e.target.closest('[data-iso]');if(!b)return;const a=b.dataset.iso;
    if(a==='in')return zoomAt(1.25);if(a==='out')return zoomAt(1/1.25);
    userMoved=a!=='all';flyTo(views[a]())});
  const ptrs=new Map();let last=null,pinch=null,vel={x:0,y:0},lastT=0;
  el.addEventListener('pointerdown',e=>{
    if(e.target.closest('button'))return;
    el.setPointerCapture(e.pointerId);ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});cancelAnimationFrame(anim);el.classList.add('dragging');
    if(ptrs.size===2){const [a,b]=[...ptrs.values()];pinch=Math.hypot(a.x-b.x,a.y-b.y)}
    last={x:e.clientX,y:e.clientY};lastT=performance.now();vel={x:0,y:0};
  });
  el.addEventListener('pointermove',e=>{
    if(!ptrs.has(e.pointerId))return;ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(ptrs.size===2&&pinch){const [a,b]=[...ptrs.values()],d=Math.hypot(a.x-b.x,a.y-b.y),r=el.getBoundingClientRect();zoomAt(d/pinch,(a.x+b.x)/2-r.left,(a.y+b.y)/2-r.top);pinch=d;return}
    const now=performance.now(),dx=e.clientX-last.x,dy=e.clientY-last.y,dt=Math.max(1,now-lastT);
    if(Math.abs(dx)+Math.abs(dy)>0)userMoved=true;
    cam.x+=dx;cam.y+=dy;clamp();apply();vel={x:dx/dt,y:dy/dt};last={x:e.clientX,y:e.clientY};lastT=now;
  });
  const up=e=>{
    ptrs.delete(e.pointerId);if(ptrs.size<2)pinch=null;if(ptrs.size===1)last=[...ptrs.values()][0];
    if(ptrs.size)return;el.classList.remove('dragging');
    if(!reduce()&&Math.hypot(vel.x,vel.y)>.2){const v={x:vel.x*16,y:vel.y*16};const glide=()=>{cam.x+=v.x;cam.y+=v.y;clamp();apply();v.x*=.9;v.y*=.9;if(Math.hypot(v.x,v.y)>.4)anim=requestAnimationFrame(glide)};anim=requestAnimationFrame(glide)}
  };
  el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);
  el.addEventListener('wheel',e=>{e.preventDefault();const r=el.getBoundingClientRect();zoomAt(Math.exp(-e.deltaY*.0015),e.clientX-r.left,e.clientY-r.top)},{passive:false});
  el.addEventListener('keydown',e=>{const mv={ArrowLeft:[60,0],ArrowRight:[-60,0],ArrowUp:[0,60],ArrowDown:[0,-60]}[e.key];if(mv){e.preventDefault();userMoved=true;cam.x+=mv[0];cam.y+=mv[1];clamp();apply()}if(e.key==='+'||e.key==='=')zoomAt(1.2);if(e.key==='-')zoomAt(1/1.2)});
  // 畫面大小改變（含第一次放進頁面）：還沒自己移動過就保持全覽，否則只重新限制範圍。
  new ResizeObserver(()=>{if(!vw())return;if(!userMoved)fit();else{clamp();apply()}}).observe(el);

  return {
    el,fit,
    render({tiles,pawns=[],activeKey=null}){
      const sig=JSON.stringify(tiles);
      if(sig!==tileSig){tileSig=sig;drawStatic(tiles)}
      drawPawns(pawns,activeKey);
      if(vw()&&!world.getAttribute('transform'))fit();
    }
  };
}
