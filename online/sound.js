// 音效、背景音樂與震動：全部用 Web Audio 即時合成，不需要任何音檔（沒有版權問題）。
// 瀏覽器規定網頁被點過一下之後才能出聲，所以第一次點擊時呼叫 Sound.unlock()。
'use strict';
const Sound=(()=>{
  const PREF='life-board-sound';
  const pref=Object.assign({sfx:true,music:true,volume:.8},storeGet(PREF)||{});
  let ctx=null,master=null,sfxBus=null,musicBus=null,noiseBuf=null;
  const listeners=new Set(),changed=()=>listeners.forEach(f=>{try{f()}catch{}});

  function ensure(){
    if(ctx)return ctx;
    const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;
    // iPhone：讓遊戲音效不被靜音鍵吞掉（新版 Safari 才支援，不支援就照系統設定）。
    try{if(navigator.audioSession)navigator.audioSession.type='playback'}catch{}
    ctx=new AC();
    master=ctx.createGain();master.gain.value=pref.volume;master.connect(ctx.destination);
    sfxBus=ctx.createGain();sfxBus.gain.value=1;sfxBus.connect(master);
    musicBus=ctx.createGain();musicBus.gain.value=.55;musicBus.connect(master);
    noiseBuf=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate);
    const d=noiseBuf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
    ctx.onstatechange=()=>{if(running()&&pref.music&&wantMusic)startMusic();changed()};
    return ctx;
  }
  function unlock(){const c=ensure();if(c&&c.state!=='running')c.resume().then(changed).catch(()=>{});changed()}
  const running=()=>!!ctx&&ctx.state==='running';

  /* ---------- 基本音色 ---------- */
  const hz=n=>440*Math.pow(2,(n-69)/12);   // MIDI 音高 → 頻率
  function tone(freq,{at=0,dur=.18,type='sine',vol=.25,to=null,attack=.006,bus=sfxBus}={}){
    const t=Math.max(ctx.currentTime,ctx.currentTime+at),o=ctx.createOscillator(),g=ctx.createGain();
    o.type=type;o.frequency.setValueAtTime(freq,t);if(to)o.frequency.exponentialRampToValueAtTime(to,t+dur);
    g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(vol,t+attack);g.gain.exponentialRampToValueAtTime(.0001,t+dur);
    o.connect(g);g.connect(bus);o.start(t);o.stop(t+dur+.05);
  }
  function noise({at=0,dur=.12,vol=.2,freq=2000,q=1,type='bandpass',to=null,bus=sfxBus}={}){
    const t=Math.max(ctx.currentTime,ctx.currentTime+at),s=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();
    s.buffer=noiseBuf;f.type=type;f.Q.value=q;f.frequency.setValueAtTime(freq,t);if(to)f.frequency.exponentialRampToValueAtTime(to,t+dur);
    g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.0001,t+dur);
    s.connect(f);f.connect(g);g.connect(bus);s.start(t,Math.random()*.5);s.stop(t+dur+.02);
  }

  /* ---------- 音效 ---------- */
  const SFX={
    spin(){for(let i=0;i<16;i++)noise({at:i*.066+Math.max(0,i-10)*.025,dur:.03,vol:.16,freq:3200,q:4})},     // 拉霸轉動
    reelStop(i=0){tone(hz(84+i*4),{dur:.3,type:'triangle',vol:.22});noise({dur:.04,vol:.14,freq:1500})},       // 轉輪停下
    step(i=1){tone(hz(66+Math.min(i,14)),{dur:.09,type:'triangle',vol:.16});noise({dur:.03,vol:.07,freq:900})}, // 棋子每跳一格，越走越高
    flip(){noise({dur:.28,vol:.2,freq:600,to:4200,q:.8})},                                                      // 翻牌
    fortune(){[72,76,79,84].forEach((n,i)=>tone(hz(n),{at:.25+i*.08,dur:.4,type:'triangle',vol:.17}))},        // 好運：上揚和弦
    loss(){tone(hz(55),{at:.2,dur:.75,type:'sawtooth',vol:.1,to:hz(36)});tone(hz(43),{at:.2,dur:.85,vol:.26,to:hz(31)})}, // 災難：低沉下滑
    market(){tone(hz(76),{at:.25,dur:.5,vol:.2});tone(hz(72),{at:.58,dur:.7,vol:.2})},                          // 市場：叮咚
    chance(){[57,60,63,60,63,66].forEach((n,i)=>tone(hz(n),{at:.25+i*.09,dur:.17,type:'square',vol:.055}))},   // 機會：懸疑
    win(){[[60,0],[64,.12],[67,.24],[72,.36],[67,.56],[72,.68]].forEach(([n,a])=>tone(hz(n),{at:a,dur:a>.6?1:.2,type:'square',vol:.075}));[48,55,64].forEach(n=>tone(hz(n),{at:.68,dur:1.2,type:'triangle',vol:.12}))},
    bankrupt(){tone(hz(40),{dur:1.3,vol:.35,to:hz(28)});noise({dur:.6,vol:.22,freq:220,type:'lowpass'});tone(hz(52),{at:.15,dur:1,type:'sawtooth',vol:.06,to:hz(40)})},
    alliance(){tone(hz(67),{dur:.45,type:'triangle',vol:.18});tone(hz(74),{at:.15,dur:.6,type:'triangle',vol:.17});tone(hz(79),{at:.15,dur:.6,vol:.1})},
    steal(){[0,.13].forEach(a=>tone(hz(88),{at:a,dur:.09,type:'square',vol:.075}));tone(hz(76),{at:.28,dur:.22,type:'square',vol:.065,to:hz(70)})},
    settle(){noise({dur:.06,vol:.2,freq:3000});tone(hz(88),{at:.05,dur:.55,type:'triangle',vol:.2});tone(hz(93),{at:.12,dur:.65,type:'triangle',vol:.15});noise({at:.4,dur:.3,vol:.1,freq:900,to:3200,q:.7})}, // 收銀機＋翻頁
    turn(){tone(hz(74),{dur:.25,vol:.14});tone(hz(79),{at:.12,dur:.35,vol:.14})},                               // 換下一位
    join(){tone(hz(81),{dur:.12,type:'square',vol:.065});tone(hz(88),{at:.1,dur:.18,type:'square',vol:.065})}, // 有人加入
    tick(urgent){noise({dur:.025,vol:urgent?.3:.18,freq:urgent?4200:2600,q:6});if(urgent)noise({at:.13,dur:.025,vol:.22,freq:3600,q:6})}, // 催促
    click(){noise({dur:.02,vol:.1,freq:2400,q:3})},
    myTurn(){[76,79,84].forEach((n,i)=>tone(hz(n),{at:i*.11,dur:.32,type:'triangle',vol:.2}))},
    coinUp(){tone(hz(88),{dur:.08,type:'square',vol:.055});tone(hz(95),{at:.07,dur:.32,type:'square',vol:.055})},
    coinDown(){noise({dur:.28,vol:.14,freq:3000,to:400,q:1.5});tone(hz(72),{dur:.28,type:'triangle',vol:.1,to:hz(60)})},
    sigh(){noise({dur:1.1,vol:.16,freq:900,to:280,q:.9});tone(hz(57),{at:.05,dur:1,vol:.07,to:hz(50)})},        // 過勞：嘆氣
  };
  function play(name,arg){if(!pref.sfx||!running()||!SFX[name])return;try{SFX[name](arg)}catch{}}
  // 震動：手機有支援才震（多數 Android 可以；iPhone 的 Safari 不支援就略過）。
  function vibrate(pattern){if(!pref.sfx)return;try{navigator.vibrate?.(pattern)}catch{}}

  /* ---------- 背景音樂：8-bit 遊戲機風格（原創旋律），依景氣切換 ----------
     方波主旋律＋三角波「咚—喳」低音＋雜訊鼓，像紅白機時代的冒險遊戲。
     旋律是自己寫的，不是任何遊戲的曲子。一段 8 小節，每小節 8 個八分音符。 */
  const _=null;
  const SONGS={
    major:{   // C 大調，輕快跳躍：C–Am–F–G–C–Am–Dm–G
      mel:[67,72,76,79,_,76,77,76, 72,_,69,72,76,_,74,72, 69,72,77,_,77,76,74,72, 71,_,74,_,79,_,77,_,
           67,72,76,79,_,81,79,76, 77,76,74,72,_,74,76,_, 74,_,77,_,81,79,77,74, 79,77,74,71,72,_,_,_],
      roots:[48,45,41,43,48,45,38,43]},
    minor:{   // A 小調，慢一點、有點不安：Am–F–G–Em–Am–Dm–E–Am
      mel:[69,_,72,_,76,_,74,72, 69,_,72,_,77,76,74,_, 71,_,74,_,79,_,77,74, 76,_,_,_,71,_,_,_,
           69,72,76,_,74,72,71,_, 74,_,77,_,76,74,72,_, 71,_,68,_,71,74,76,_, 69,_,_,_,_,_,_,_],
      roots:[45,41,43,40,45,38,40,45]},
  };
  const MOODS={
    lobby:{song:'major',bpm:116,shift:0,drums:'none',lead:'triangle',vol:.8},
    normal:{song:'major',bpm:134,shift:0,drums:'full',lead:'square',vol:1},
    boom:{song:'major',bpm:154,shift:2,drums:'full',lead:'square',echo:true,vol:1},        // 景氣過熱：升調、加快、加回音
    recession:{song:'minor',bpm:96,shift:0,drums:'soft',lead:'triangle',vol:.95},          // 景氣衰退：小調、變慢
  };
  let mood='lobby',nextMood='lobby',step=0,nextTime=0,timer=null,wantMusic=false;
  function scheduleStep(m,t,i){
    const song=SONGS[m.song],s=i%64,b=Math.floor(s/8),beat=s%8,len=60/m.bpm/2,at=t-ctx.currentTime,v=m.vol;
    const n=song.mel[s];
    if(n!==null){
      let hold=1;while(hold<3&&s+hold<64&&song.mel[s+hold]===null&&(s+hold)%8!==0)hold++;
      const sq=m.lead==='square';
      tone(hz(n+m.shift),{at,dur:len*hold*.85,type:m.lead,vol:(sq?.045:.1)*v,bus:musicBus});
      if(m.echo)tone(hz(n+m.shift),{at:at+len*.5,dur:len*.5,type:'square',vol:.015*v,bus:musicBus});
    }
    // 低音：拍點彈根音、反拍彈五度（咚—喳—咚—喳）
    const root=song.roots[b]+m.shift,bassOn=m.drums==='soft'?[0,4]:[0,2,4,6];
    if(bassOn.includes(beat))tone(hz(beat%4===0?root:root+7),{at,dur:len*.8,type:'triangle',vol:.17*v,bus:musicBus});
    // 鼓：大鼓 0、4；小鼓 2、6；鈸每個八分音符
    if(m.drums!=='none'){
      if(beat===0||(m.drums==='full'&&beat===4))tone(150,{at,dur:.11,vol:.22*v,to:45,bus:musicBus});
      if(m.drums==='full'){
        if(beat===2||beat===6)noise({at,dur:.09,vol:.07*v,freq:1800,q:.8,bus:musicBus});
        noise({at,dur:.025,vol:(beat%2?.022:.012)*v,freq:7500,q:1,type:'highpass',bus:musicBus});
      }
    }
  }
  function pump(){
    if(!running())return;
    if(nextTime<ctx.currentTime)nextTime=ctx.currentTime+.05;
    while(nextTime<ctx.currentTime+.25){
      // 同一首曲子換小節就切換（例如正常→過熱）；換成另一首（大調↔小調）則等這段 8 小節結束再換。
      if(nextMood!==mood&&(step%64===0||(step%8===0&&MOODS[nextMood].song===MOODS[mood].song)))mood=nextMood;
      const m=MOODS[mood];scheduleStep(m,nextTime,step);nextTime+=60/m.bpm/2;step++;
    }
  }
  function startMusic(){wantMusic=true;if(!pref.music||!running()||timer)return;step=0;nextTime=0;timer=setInterval(pump,60);pump()}
  function stopMusic(){clearInterval(timer);timer=null}
  function setMood(m){if(MOODS[m])nextMood=m}

  function setPref(key,value){
    pref[key]=value;storeSet(PREF,pref);
    if(master&&key==='volume')master.gain.setTargetAtTime(value,ctx.currentTime,.05);
    if(key==='music'){if(value&&wantMusic)startMusic();else stopMusic()}
    changed();
  }
  return {unlock,running,play,vibrate,pref,setPref,startMusic,setMood,onChange:f=>listeners.add(f)};
})();
