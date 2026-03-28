'use strict';
// ═══════════════════════════════════════════════════════════════════════════════
//  ALESKAT v2 — Deep Sea Survival
//  • 3 vite  • Livelli  • Profondità visiva  • Squalo  • Lombrichi nemici grossi
//  • Nemo encounter  • Pesci luminosi in profondità  • Coordinata unica W×H
// ═══════════════════════════════════════════════════════════════════════════════

const CFG = {
  BASE_W: 414,
  SEG_R: 13,
  SPEED_BASE: 3.2,
  SPEED_MAX: 7.5,
  INIT_LEN: 8,
  ENERGY_MAX: 100,
  ENERGY_DRAIN: 0.065,
  FOOD_INT: 75,
  PLANKTON_N: 38,
  BUBBLE_N: 26,
  PARTICLE_MAX: 180,
  DEPTH_RATE: 0.22,
  LIVES: 3,
  LEVEL_SCORE: 300,       // punti per avanzare di livello
  NEMO_CHANCE: 0.003,     // probabilità per frame di spawn Nemo
  SHARK_LEVEL: 3,         // livello dal quale appare lo squalo
};

// ─── STATO ────────────────────────────────────────────────────────────────────
let canvas, ctx, dpr, W=414, H=736, sc=1;
let state = 'splash'; // splash | playing | nemo | gameover
let tick=0, score=0, depth=0, energy=CFG.ENERGY_MAX;
let lives=CFG.LIVES, level=1, levelScore=0;
let highScore = +localStorage.getItem('aleskat_hs')||0;

let worm=null, foods=[], plankton=[], enemies=[], particles=[], bubbles=[];
let nemoObj=null, nemoTimer=0, nemoMsg=0;
let shakeT=0; // schermo che trema

let joyActive=false, joyX=0, joyY=0, joyDX=0, joyDY=0;

// Lombrichi palette
const WORM_PAL = [
  {h:175,s:100,l:65},{h:290,s:80,l:68},{h:150,s:100,l:62},{h:200,s:90,l:62}
];
let wormCol = WORM_PAL[0];

// Cibo
const FOODS = [
  {label:'krill',    col:'#ff6b35',glow:'#ff4400',r:7, en:22,pts:10},
  {label:'jellyfish',col:'#ff2d78',glow:'#ff0055',r:12,en:35,pts:25},
  {label:'fish_egg', col:'#ffb700',glow:'#ff8800',r:6, en:15,pts:8 },
  {label:'algae',    col:'#39ff14',glow:'#00cc00',r:9, en:18,pts:12},
  {label:'starfish', col:'#ff9ff3',glow:'#ff44cc',r:11,en:28,pts:18},
  {label:'shrimp',   col:'#f9ca24',glow:'#e55a00',r:7, en:20,pts:14},
];

// Creature nemiche (NON lombrichi — quelli sono worm-enemies separati)
const CREATURE_TYPES = [
  {name:'anglerfish',col:'#ff2d78',r:19,spd:1.2,pts:50,agg:true, depth:0.4},
  {name:'barracuda', col:'#ff6b35',r:15,spd:2.4,pts:30,agg:false,depth:0.0},
  {name:'pufferfish',col:'#f9ca24',r:18,spd:0.7,pts:20,agg:false,depth:0.2},
  {name:'moray',     col:'#6c5ce7',r:13,spd:1.8,pts:35,agg:true, depth:0.3},
  {name:'mantaray',  col:'#74b9ff',r:22,spd:1.5,pts:15,agg:false,depth:0.5},
];

// ─── INIT ─────────────────────────────────────────────────────────────────────
function init(){
  canvas=document.getElementById('gameCanvas');
  ctx=canvas.getContext('2d');
  dpr=Math.min(window.devicePixelRatio||1,2);
  resize();
  window.addEventListener('resize',resize);
  setupJoystick();
  setupButtons();
  document.getElementById('splashHS').textContent=highScore;
  initBubbles();
  requestAnimationFrame(loop);
}

function resize(){
  const ww=window.innerWidth,wh=window.innerHeight,asp=9/16;
  if(ww/wh<asp){W=ww;H=Math.round(ww/asp);}
  else{H=wh;W=Math.round(wh*asp);}
  canvas.style.width=W+'px';canvas.style.height=H+'px';
  canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  sc=W/CFG.BASE_W;
}

// ─── LOOP ─────────────────────────────────────────────────────────────────────
function loop(){
  requestAnimationFrame(loop);
  tick++;
  ctx.save();
  if(shakeT>0){
    const sx=(Math.random()-0.5)*shakeT*8*sc;
    const sy=(Math.random()-0.5)*shakeT*8*sc;
    ctx.translate(sx,sy);
    shakeT=Math.max(0,shakeT-0.05);
  }
  ctx.clearRect(-20,-20,W+40,H+40);

  const dr=depthRatio();

  if(state==='splash'){
    drawBg(0); tickBubbles(); tickDrift(); tickParticles();
    drawBubbles(); drawParticles();
  } else if(state==='playing'){
    update(); draw(dr);
  } else if(state==='nemo'){
    draw(dr); drawNemoScene();
  } else if(state==='gameover'){
    draw(dr);
  }
  ctx.restore();
}

function depthRatio(){ return Math.min(depth/1200,1); }

// ─── START ────────────────────────────────────────────────────────────────────
function startGame(fresh){
  tick=0; depth=0; energy=CFG.ENERGY_MAX;
  if(fresh){ score=0; lives=CFG.LIVES; level=1; levelScore=0; }
  wormCol=WORM_PAL[Math.floor(Math.random()*WORM_PAL.length)];
  foods=[];enemies=[];particles=[];plankton=[];bubbles=[];nemoObj=null;
  initBubbles(); initPlankton();

  const cx=W/2, cy=H*0.4;
  const gap=(CFG.SEG_R*2+5)*sc;
  const segs=[];
  for(let i=0;i<CFG.INIT_LEN;i++) segs.push({x:cx,y:cy+i*gap});
  worm={segs,angle:-Math.PI/2,speed:CFG.SPEED_BASE*sc,length:CFG.INIT_LEN,
        boosting:false,glow:0,invincible:120};

  state='playing';
  showEl('hud',true); showEl('joystickZone',true);
  showEl('gameOver',false); showEl('splash',false);
  updateLivesHUD();
}

// ─── UPDATE ───────────────────────────────────────────────────────────────────
function update(){
  updateInput(); moveWorm();
  tickFood(); tickCreatures(); tickEnemyWorms();
  tickBubbles(); tickParticles(); tickPlankton(); tickDrift();
  checkCollisions();
  updateHUD();

  depth  += CFG.DEPTH_RATE*0.016*60*(1+level*0.1);
  score  += 0.05*level;
  levelScore += 0.05*level;
  energy  = Math.max(0,energy-CFG.ENERGY_DRAIN*(1+level*0.04));
  if(energy<=0) loseLife('Energia esaurita');

  // Avanzamento livello
  if(levelScore >= CFG.LEVEL_SCORE){
    levelScore=0; level++;
    showLevelBanner();
    spawnSharkIfNeeded();
  }

  // Nemo random encounter
  if(!nemoObj && Math.random()<CFG.NEMO_CHANCE*(1/60)) spawnNemo();
  if(worm) worm.invincible=Math.max(0,worm.invincible-1);
}

// ─── INPUT ────────────────────────────────────────────────────────────────────
function setupJoystick(){
  const zone=document.getElementById('joystickZone');
  const base=document.getElementById('joystickBase');
  const knob=document.getElementById('joystickKnob');
  const MR=50;

  function sj(cx,cy){
    joyActive=true;joyX=cx;joyY=cy;joyDX=0;joyDY=0;
    const r=canvas.getBoundingClientRect();
    base.style.left=(cx-r.left)+'px';base.style.top=(cy-r.top)+'px';
    base.style.bottom='';base.style.transform='translate(-50%,-50%)';
  }
  function mj(cx,cy){
    const dx=cx-joyX,dy=cy-joyY,d=Math.hypot(dx,dy)||1;
    joyDX=dx/d;joyDY=dy/d;
    const cl=Math.min(d,MR);
    knob.style.transform=`translate(${joyDX*cl}px,${joyDY*cl}px)`;
  }
  function ej(){joyActive=false;joyDX=0;joyDY=0;knob.style.transform='translate(0,0)';}

  zone.addEventListener('touchstart',e=>{e.preventDefault();sj(e.touches[0].clientX,e.touches[0].clientY);},{passive:false});
  zone.addEventListener('touchmove', e=>{e.preventDefault();mj(e.touches[0].clientX,e.touches[0].clientY);},{passive:false});
  zone.addEventListener('touchend',ej);zone.addEventListener('touchcancel',ej);
  zone.addEventListener('mousedown',e=>sj(e.clientX,e.clientY));
  window.addEventListener('mousemove',e=>{if(joyActive)mj(e.clientX,e.clientY);});
  window.addEventListener('mouseup',ej);
}

function updateInput(){
  if(!worm||!joyActive)return;
  if(Math.abs(joyDX)>0.05||Math.abs(joyDY)>0.05){
    const tgt=Math.atan2(joyDY,joyDX);
    let d=tgt-worm.angle;
    while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;
    worm.angle+=d*0.13;
    worm.boosting=Math.hypot(joyDX,joyDY)>0.7;
  } else { worm.boosting=false; }
}

// ─── WORM GIOCATORE ───────────────────────────────────────────────────────────
function moveWorm(){
  if(!worm)return;
  worm.glow+=0.05;
  const spd=worm.boosting
    ?Math.min(worm.speed*1.85,CFG.SPEED_MAX*sc)
    :worm.speed;
  const hd=worm.segs[0];
  let nx=hd.x+Math.cos(worm.angle)*spd;
  let ny=hd.y+Math.sin(worm.angle)*spd;
  nx=((nx%W)+W)%W;
  const mar=CFG.SEG_R*sc;
  if(ny<mar){ny=mar;worm.angle=Math.abs(worm.angle);}
  if(ny>H-mar){ny=H-mar;worm.angle=-Math.abs(worm.angle);}
  worm.segs.unshift({x:nx,y:ny});
  while(worm.segs.length>worm.length)worm.segs.pop();
  if(worm.boosting){
    energy=Math.max(0,energy-0.2);
    if(tick%2===0){
      const tl=worm.segs[worm.segs.length-1];
      addParticle(tl.x,tl.y,`hsla(${wormCol.h},${wormCol.s}%,${wormCol.l}%,0.4)`,3*sc,0.028);
    }
  }
}

// ─── CIBO ─────────────────────────────────────────────────────────────────────
function tickFood(){
  if(tick%Math.max(30,CFG.FOOD_INT-level*8)===0){
    const t=FOODS[Math.floor(Math.random()*FOODS.length)];
    foods.push({x:Math.random()*W,y:-20,type:t,
      drift:(0.5+Math.random()*0.9)*sc,wobble:Math.random()*Math.PI*2,pulse:0,dead:false});
  }
  foods.forEach(f=>{
    f.y+=f.drift;f.x+=Math.sin(f.wobble+tick*0.02)*0.6;
    f.wobble+=0.04;f.pulse+=0.09;
    if(f.y>H+30)f.dead=true;
  });
  foods=foods.filter(f=>!f.dead);
}

// ─── PLANCTON ────────────────────────────────────────────────────────────────
function initPlankton(){
  plankton=[];
  for(let i=0;i<CFG.PLANKTON_N;i++)plankton.push(mkP());
}
function mkP(){
  return{x:Math.random()*W,y:Math.random()*H,
    r:(2+Math.random()*3)*sc,vx:(Math.random()-0.5)*0.5,vy:(Math.random()-0.5)*0.5,
    hue:160+Math.random()*80,phase:Math.random()*Math.PI*2,dead:false};
}
function tickPlankton(){
  plankton.forEach(p=>{
    p.x=((p.x+p.vx+W)%W);p.y=((p.y+p.vy+H)%H);p.phase+=0.04;
  });
  plankton=plankton.filter(p=>!p.dead);
  while(plankton.length<CFG.PLANKTON_N)plankton.push(mkP());
}

// ─── CREATURE NEMICHE (pesci, anguille, razze) ────────────────────────────────
function tickCreatures(){
  const dr=depthRatio();
  const maxC=3+level;
  if(tick%(Math.max(120,300-level*20))===0&&enemies.filter(e=>e.kind==='creature').length<maxC)
    spawnCreature(dr);

  enemies.filter(e=>e.kind==='creature').forEach(e=>{
    e.phase+=0.03;
    if(e.type.agg&&worm){
      const hd=worm.segs[0];
      const dx=hd.x-e.x,dy=hd.y-e.y;
      if(Math.hypot(dx,dy)<240*sc)e.angle=Math.atan2(dy,dx);
      else e.angle+=Math.sin(e.phase)*0.04;
    } else { e.angle+=Math.sin(e.phase)*0.03; }
    e.x+=Math.cos(e.angle)*e.type.spd*sc*(1+level*0.08);
    e.y+=Math.sin(e.angle)*e.type.spd*sc*(1+level*0.08);
    e.x=((e.x%W)+W)%W;
    e.y=Math.max(20*sc,Math.min(H-20*sc,e.y));
    e.segs.unshift({x:e.x,y:e.y});
    while(e.segs.length>e.segLen)e.segs.pop();
  });

  // Squalo
  const shark=enemies.find(e=>e.kind==='shark');
  if(shark){
    shark.phase+=0.02;
    if(worm){
      const hd=worm.segs[0];
      const dx=hd.x-shark.x,dy=hd.y-shark.y;
      if(Math.hypot(dx,dy)<350*sc) shark.angle=Math.atan2(dy,dx);
      else shark.angle+=Math.sin(shark.phase)*0.02;
    }
    shark.x+=Math.cos(shark.angle)*2.8*sc*(1+level*0.06);
    shark.y+=Math.sin(shark.angle)*2.8*sc*(1+level*0.06);
    shark.x=((shark.x%W)+W)%W;
    shark.y=Math.max(40*sc,Math.min(H-40*sc,shark.y));
    shark.segs.unshift({x:shark.x,y:shark.y});
    while(shark.segs.length>shark.segLen)shark.segs.pop();
  }

  enemies=enemies.filter(e=>!e.dead);
}

function spawnCreature(dr){
  // Filtra per profondità
  const available=CREATURE_TYPES.filter(t=>t.depth<=dr+0.2);
  const type=available[Math.floor(Math.random()*available.length)]||CREATURE_TYPES[0];
  const side=Math.floor(Math.random()*4);
  let x,y,angle;
  if(side===0){x=Math.random()*W;y=-40;angle=Math.PI/2;}
  else if(side===1){x=W+40;y=Math.random()*H;angle=Math.PI;}
  else if(side===2){x=Math.random()*W;y=H+40;angle=-Math.PI/2;}
  else{x=-40;y=Math.random()*H;angle=0;}
  const segLen=5+Math.floor(Math.random()*5);
  enemies.push({kind:'creature',x,y,angle,type,segLen,
    segs:Array.from({length:segLen},()=>({x,y})),
    phase:Math.random()*Math.PI*2,dead:false});
}

function spawnSharkIfNeeded(){
  if(level>=CFG.SHARK_LEVEL&&!enemies.find(e=>e.kind==='shark')){
    const x=W+50,y=H/2;
    enemies.push({kind:'shark',x,y,angle:Math.PI,segLen:20,
      segs:Array.from({length:20},()=>({x,y})),
      phase:0,dead:false});
  }
}

// ─── LOMBRICHI NEMICI GROSSI ──────────────────────────────────────────────────
// Compaiono dal livello 2 in poi, hanno segLen > worm.length → mangiano il giocatore
const WORM_ENEMY_COLS = [
  {h:0,s:90,l:55},{h:30,s:100,l:55},{h:260,s:70,l:60},{h:340,s:100,l:55}
];
function tickEnemyWorms(){
  if(level<2)return;
  const maxWE=1+Math.floor(level/2);
  if(tick%(Math.max(400,600-level*40))===0&&enemies.filter(e=>e.kind==='eworm').length<maxWE)
    spawnEnemyWorm();

  enemies.filter(e=>e.kind==='eworm').forEach(e=>{
    e.glow+=0.04;
    e.phase+=0.02;
    if(worm){
      const hd=worm.segs[0];
      const dx=hd.x-e.x,dy=hd.y-e.y;
      const dist=Math.hypot(dx,dy);
      if(dist<300*sc) e.angle=Math.atan2(dy,dx);
      else e.angle+=Math.sin(e.phase)*0.05;
    }
    const spd=e.speed*(1+level*0.07);
    e.x+=Math.cos(e.angle)*spd;
    e.y+=Math.sin(e.angle)*spd;
    e.x=((e.x%W)+W)%W;
    e.y=Math.max(20*sc,Math.min(H-20*sc,e.y));
    e.segs.unshift({x:e.x,y:e.y});
    while(e.segs.length>e.length)e.segs.pop();
    // il lombrico nemico mangia il cibo
    foods.forEach(f=>{
      if(!f.dead&&Math.hypot(e.x-f.x,e.y-f.y)<e.r+f.type.r*sc){
        f.dead=true;e.length=Math.min(e.length+1,40);
      }
    });
  });
}

function spawnEnemyWorm(){
  const col=WORM_ENEMY_COLS[Math.floor(Math.random()*WORM_ENEMY_COLS.length)];
  const side=Math.floor(Math.random()*4);
  let x,y,angle;
  if(side===0){x=Math.random()*W;y=-40;angle=Math.PI/2;}
  else if(side===1){x=W+40;y=Math.random()*H;angle=Math.PI;}
  else if(side===2){x=Math.random()*W;y=H+40;angle=-Math.PI/2;}
  else{x=-40;y=Math.random()*H;angle=0;}
  // Lunghezza tra 10 e 18+level — sempre più grosso del giocatore iniziale
  const len=10+Math.floor(Math.random()*8)+level*2;
  enemies.push({kind:'eworm',x,y,angle,col,
    r:(CFG.SEG_R+2)*sc,speed:(1.4+Math.random()*0.8)*sc,
    length:len,segLen:len,
    segs:Array.from({length:len},()=>({x,y})),
    glow:0,phase:Math.random()*Math.PI*2,dead:false});
}

// ─── NEMO ─────────────────────────────────────────────────────────────────────
function spawnNemo(){
  const x=W+60,y=H*0.3+Math.random()*H*0.4;
  nemoObj={x,y,angle:Math.PI,phase:0,
    segs:Array.from({length:8},()=>({x,y})),
    speed:1.2*sc,timer:0,msg:0};
  state='nemo';
  showEl('hud',false);showEl('joystickZone',false);
}

function updateNemo(){
  if(!nemoObj)return;
  nemoObj.phase+=0.04;
  nemoObj.timer++;
  // Nemo nuota verso centro
  const tx=W*0.5,ty=H*0.45;
  const dx=tx-nemoObj.x,dy=ty-nemoObj.y;
  const dist=Math.hypot(dx,dy)||1;
  if(dist>10){
    nemoObj.angle=Math.atan2(dy,dx);
    nemoObj.x+=Math.cos(nemoObj.angle)*nemoObj.speed;
    nemoObj.y+=Math.sin(nemoObj.angle)*nemoObj.speed*0.5;
  }
  nemoObj.segs.unshift({x:nemoObj.x,y:nemoObj.y});
  while(nemoObj.segs.length>8)nemoObj.segs.pop();

  // Dopo 3 secondi mostra messaggio, dopo 6 riparte
  if(nemoObj.timer===180) nemoObj.msg=1;
  if(nemoObj.timer>=360){
    nemoObj=null;
    state='playing';
    showEl('hud',true);showEl('joystickZone',true);
    energy=Math.min(CFG.ENERGY_MAX,energy+30);// bonus energia da Nemo
  }
}

// ─── SQUALO ───────────────────────────────────────────────────────────────────
// Già gestito in tickCreatures, qui solo check separato

// ─── COLLISIONI ───────────────────────────────────────────────────────────────
function checkCollisions(){
  if(!worm||!worm.segs.length)return;
  const hd=worm.segs[0];
  const hr=CFG.SEG_R*sc;
  const inv=worm.invincible>0;

  // Mangia cibo
  foods.forEach(f=>{
    if(f.dead)return;
    if(Math.hypot(hd.x-f.x,hd.y-f.y)<hr+f.type.r*sc){
      f.dead=true;energy=Math.min(CFG.ENERGY_MAX,energy+f.type.en);
      score+=f.type.pts*level;levelScore+=f.type.pts;
      worm.length+=2;worm.speed=Math.min(CFG.SPEED_MAX*sc,worm.speed+0.03);
      burst(f.x,f.y,f.type.col,12);
    }
  });

  // Mangia plancton
  plankton.forEach(p=>{
    if(p.dead)return;
    if(Math.hypot(hd.x-p.x,hd.y-p.y)<hr+p.r){
      p.dead=true;energy=Math.min(CFG.ENERGY_MAX,energy+7);score+=2*level;
    }
  });

  if(inv)return; // invincibile dopo respawn

  // Collisione creature
  enemies.filter(e=>e.kind==='creature').forEach(e=>{
    if(e.dead)return;
    if(Math.hypot(hd.x-e.x,hd.y-e.y)<hr+e.type.r*sc){
      if(worm.length>=e.segLen+4){
        e.dead=true;score+=e.type.pts*level;levelScore+=e.type.pts;
        worm.length+=3;energy=Math.min(CFG.ENERGY_MAX,energy+18);
        burst(e.x,e.y,e.type.col,14);
      } else {
        burst(hd.x,hd.y,`hsl(${wormCol.h},${wormCol.s}%,${wormCol.l}%)`,25);
        loseLife('Divorato da '+e.type.name);
      }
    }
  });

  // Collisione SQUALO — sempre mortale (perde 1 vita)
  const shark=enemies.find(e=>e.kind==='shark');
  if(shark&&Math.hypot(hd.x-shark.x,hd.y-shark.y)<hr+28*sc){
    burst(hd.x,hd.y,`hsl(${wormCol.h},${wormCol.s}%,${wormCol.l}%)`,30);
    shakeT=1;
    loseLife('Lo squalo ti ha mangiato!');
  }

  // Collisione LOMBRICHI NEMICI
  enemies.filter(e=>e.kind==='eworm').forEach(e=>{
    if(e.dead)return;
    if(Math.hypot(hd.x-e.x,hd.y-e.y)<hr+e.r){
      if(worm.length>e.length+4){
        // il giocatore è più grosso → mangia il lombrico nemico
        e.dead=true;score+=e.length*3*level;levelScore+=e.length*2;
        worm.length+=Math.floor(e.length/3);
        energy=Math.min(CFG.ENERGY_MAX,energy+25);
        burst(e.x,e.y,`hsl(${e.col.h},${e.col.s}%,${e.col.l}%)`,20);
      } else {
        // il lombrico nemico è più grosso → il giocatore perde vita
        burst(hd.x,hd.y,`hsl(${wormCol.h},${wormCol.s}%,${wormCol.l}%)`,25);
        shakeT=0.8;
        loseLife('Divorato da un lombrico più grosso!');
      }
    }
  });
}

// ─── PERDITA VITA ─────────────────────────────────────────────────────────────
function loseLife(reason){
  if(state!=='playing')return;
  lives--;
  updateLivesHUD();
  if(lives<=0){
    gameOver();
  } else {
    // Respawn con invincibilità temporanea
    const cx=W/2,cy=H*0.4;
    const gap=(CFG.SEG_R*2+5)*sc;
    const segs=[];
    for(let i=0;i<CFG.INIT_LEN;i++)segs.push({x:cx,y:cy+i*gap});
    worm={segs,angle:-Math.PI/2,speed:CFG.SPEED_BASE*sc,
          length:Math.max(CFG.INIT_LEN,Math.floor(worm?worm.length*0.7:CFG.INIT_LEN)),
          boosting:false,glow:0,invincible:180};
    energy=50;
    showFlash('#ff2d78',0.5);
  }
}

function gameOver(){
  state='gameover';
  showEl('hud',false);showEl('joystickZone',false);
  highScore=Math.max(highScore,Math.floor(score));
  localStorage.setItem('aleskat_hs',highScore);
  document.getElementById('goScore').textContent=Math.floor(score);
  document.getElementById('goLength').textContent=worm?worm.length:0;
  document.getElementById('goDepth').textContent=Math.floor(depth)+'m';
  document.getElementById('goHS').textContent=highScore;
  document.getElementById('goLevel').textContent='Liv. '+level;
  document.getElementById('gameOver').classList.remove('hidden');
}

// ─── PARTICELLE ───────────────────────────────────────────────────────────────
function addParticle(x,y,col,r,decay){
  particles.push({x,y,vx:(Math.random()-0.5)*1.5,vy:(Math.random()-0.5)*1.5,
    life:0.7,decay,r,color:col});
}
function burst(x,y,col,n){
  for(let i=0;i<n;i++){
    const a=(i/n)*Math.PI*2,spd=(1+Math.random()*4)*sc;
    particles.push({x,y,vx:Math.cos(a)*spd,vy:Math.sin(a)*spd,
      life:1,decay:0.032+Math.random()*0.03,r:(2+Math.random()*4)*sc,color:col});
  }
}
function tickParticles(){
  particles.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.vy+=0.04;p.life-=p.decay;});
  particles=particles.filter(p=>p.life>0);
  if(particles.length>CFG.PARTICLE_MAX)particles.splice(0,particles.length-CFG.PARTICLE_MAX);
}
function tickDrift(){
  if(tick%3===0){
    particles.push({x:Math.random()*W,y:-10,
      vx:(Math.random()-0.5)*0.3,vy:(0.3+Math.random()*0.6)*sc,
      life:1,decay:0.003,r:(1+Math.random()*2)*sc,
      color:`hsla(${170+Math.random()*60},80%,70%,0.35)`});
  }
}

// ─── BOLLE ────────────────────────────────────────────────────────────────────
function initBubbles(){
  bubbles=[];
  for(let i=0;i<CFG.BUBBLE_N;i++)bubbles.push(mkBubble(true));
}
function mkBubble(r){
  return{x:Math.random()*W,y:r?Math.random()*H:H+10,
    radius:(2+Math.random()*7)*sc,spd:(0.3+Math.random()*0.7)*sc,
    wobble:Math.random()*Math.PI*2,opacity:0.06+Math.random()*0.18};
}
function tickBubbles(){
  bubbles.forEach(b=>{
    b.y-=b.spd;b.x+=Math.sin(b.wobble+tick*0.02)*0.4;b.wobble+=0.02;
    if(b.y<-20)Object.assign(b,mkBubble(false));
  });
}

// ─── FLASH SCHERMO ────────────────────────────────────────────────────────────
let flashCol='',flashA=0;
function showFlash(col,a){flashCol=col;flashA=a;}

// ─── BANNER LIVELLO ───────────────────────────────────────────────────────────
let levelBanner=0;
function showLevelBanner(){levelBanner=180;}

// ─── HUD ─────────────────────────────────────────────────────────────────────
function updateHUD(){
  document.getElementById('scoreVal').textContent=Math.floor(score);
  document.getElementById('depthVal').textContent=Math.floor(depth)+'m';
  document.getElementById('lengthVal').textContent=worm?worm.length:0;
  document.getElementById('levelVal').textContent='LV '+level;
  const pct=(energy/CFG.ENERGY_MAX)*100;
  const fill=document.getElementById('energyFill');
  fill.style.width=pct+'%';fill.classList.toggle('low',pct<25);
}
function updateLivesHUD(){
  document.getElementById('livesVal').textContent='❤️'.repeat(Math.max(0,lives));
}

// ─── DISEGNO PRINCIPALE ───────────────────────────────────────────────────────
function draw(dr){
  drawBg(dr);
  drawBubbles();
  drawPlankton(dr);
  drawFood();
  drawCreatures(dr);
  drawEnemyWorms();
  if(worm) drawWorm(dr);
  drawParticles();

  // Velo abissale
  if(dr>0.25){
    ctx.fillStyle=`rgba(0,0,15,${(dr-0.25)/0.75*0.45})`;
    ctx.fillRect(0,0,W,H);
  }

  // Flash danno
  if(flashA>0){
    ctx.fillStyle=`${flashCol}${Math.round(flashA*255).toString(16).padStart(2,'0')}`;
    ctx.fillRect(0,0,W,H);
    flashA=Math.max(0,flashA-0.04);
  }

  // Banner livello
  if(levelBanner>0){
    const a=Math.min(1,levelBanner/30)*Math.min(1,(levelBanner)/30);
    ctx.save();
    ctx.globalAlpha=Math.min(1,levelBanner/60)*Math.min(1,levelBanner/60);
    ctx.font=`bold ${48*sc}px 'Orbitron',monospace`;
    ctx.textAlign='center';
    ctx.fillStyle=`rgba(0,245,255,0.9)`;
    ctx.shadowColor='#00f5ff';ctx.shadowBlur=30;
    ctx.fillText(`LIVELLO ${level}`,W/2,H*0.4);
    ctx.font=`${20*sc}px 'Rajdhani',sans-serif`;
    ctx.fillStyle='rgba(255,255,255,0.7)';ctx.shadowBlur=10;
    const msgs=['','Buona fortuna!','Attenzione ai predatori!','Lo squalo è in agguato!','Gli abissi ti chiamano…','Sopravvivi se puoi…'];
    ctx.fillText(msgs[Math.min(level-1,msgs.length-1)]||'Forza!',W/2,H*0.4+48*sc);
    ctx.restore();
    levelBanner--;
  }
}

// ─── SFONDO OCEANO (dipende dalla profondità) ─────────────────────────────────
function drawBg(dr){
  // Superficie: ciano brillante → profondità: blu-violetto-nero
  const topH  = Math.round(195 - dr*195);      // 195 ciano → 0 violetto scuro
  const topL  = Math.max(1, Math.round(12 - dr*10));
  const midH  = Math.round(210 - dr*200);
  const midL  = Math.max(1, Math.round(6  - dr*5));

  const grad=ctx.createLinearGradient(0,0,0,H);
  grad.addColorStop(0,   `hsl(${topH},90%,${topL}%)`);
  grad.addColorStop(0.4, `hsl(${midH},85%,${midL}%)`);
  grad.addColorStop(1,   `hsl(${Math.round(240+dr*20)},70%,${Math.max(1,Math.round(2-dr))}%)`);
  ctx.fillStyle=grad;
  ctx.fillRect(0,0,W,H);

  // Raggi caustica (solo in superficie/poca profondità)
  if(dr<0.6){
    const alpha=(1-dr/0.6)*0.06;
    ctx.save();
    for(let i=0;i<8;i++){
      const rx=(W*0.12*i+tick*0.45)%(W*1.3)-W*0.1;
      const rg=ctx.createLinearGradient(rx,0,rx+35*sc,H*0.5);
      rg.addColorStop(0,`rgba(0,245,255,${alpha})`);
      rg.addColorStop(1,'rgba(0,245,255,0)');
      ctx.fillStyle=rg;
      ctx.beginPath();
      ctx.moveTo(rx,0);ctx.lineTo(rx+22*sc,H*0.5);
      ctx.lineTo(rx+65*sc,H*0.5);ctx.lineTo(rx+43*sc,0);
      ctx.fill();
    }
    ctx.restore();
  }

  // Fondale
  const bedY=H-42*sc;
  const bedG=ctx.createLinearGradient(0,bedY,0,H);
  bedG.addColorStop(0,`hsla(${200+dr*30},60%,8%,0.9)`);
  bedG.addColorStop(1,`hsl(${190+dr*40},50%,2%)`);
  ctx.fillStyle=bedG;
  ctx.beginPath();ctx.moveTo(0,bedY);
  for(let x=0;x<=W;x+=18)
    ctx.lineTo(x,bedY+Math.sin(x*0.05+tick*0.007)*9*sc);
  ctx.lineTo(W,H);ctx.lineTo(0,H);ctx.fill();
}

// ─── BOLLE ────────────────────────────────────────────────────────────────────
function drawBubbles(){
  ctx.save();
  bubbles.forEach(b=>{
    ctx.beginPath();ctx.arc(b.x,b.y,b.radius,0,Math.PI*2);
    ctx.strokeStyle=`rgba(180,240,255,${b.opacity})`;ctx.lineWidth=0.8;ctx.stroke();
    ctx.beginPath();ctx.arc(b.x-b.radius*0.3,b.y-b.radius*0.3,b.radius*0.28,0,Math.PI*2);
    ctx.fillStyle=`rgba(255,255,255,${b.opacity*1.4})`;ctx.fill();
  });
  ctx.restore();
}

// ─── PLANCTON (più luminoso in profondità) ────────────────────────────────────
function drawPlankton(dr){
  ctx.save();
  plankton.forEach(p=>{
    const g=(Math.sin(p.phase)+1)*0.5;
    // In profondità i pesci e il plancton splendono di più
    const luminosity=dr>0.3?70+dr*20:50+g*22;
    const glowIntensity=dr>0.3?(8+dr*16):8;
    ctx.shadowColor=`hsla(${p.hue},80%,60%,0.9)`;
    ctx.shadowBlur=glowIntensity;
    ctx.beginPath();ctx.arc(p.x,p.y,p.r*(1+dr*0.5),0,Math.PI*2);
    ctx.fillStyle=`hsla(${p.hue},80%,${luminosity}%,${0.45+g*0.4+dr*0.3})`;
    ctx.fill();
  });
  ctx.restore();
}

// ─── CIBO ─────────────────────────────────────────────────────────────────────
function drawFood(){
  ctx.save();
  foods.forEach(f=>{
    const g=(Math.sin(f.pulse)+1)*0.5;
    const r=f.type.r*sc;
    ctx.shadowColor=f.type.glow;ctx.shadowBlur=9+g*9;
    if(f.type.label==='jellyfish'){
      ctx.beginPath();ctx.arc(f.x,f.y,r,-Math.PI,0);
      ctx.fillStyle=f.type.col+'88';ctx.fill();
      for(let i=0;i<5;i++){
        const tx=f.x+(i-2)*r*0.42;
        ctx.beginPath();ctx.moveTo(tx,f.y);
        ctx.bezierCurveTo(tx,f.y+r*1.4,tx+Math.sin(tick*0.05+i)*r,f.y+r*2.4,tx,f.y+r*3);
        ctx.strokeStyle=f.type.col+'66';ctx.lineWidth=1.5;ctx.stroke();
      }
    } else {
      ctx.beginPath();ctx.arc(f.x,f.y,r*(0.9+g*0.13),0,Math.PI*2);
      ctx.fillStyle=f.type.col;ctx.fill();
      const ig=ctx.createRadialGradient(f.x,f.y,0,f.x,f.y,r);
      ig.addColorStop(0,'rgba(255,255,255,0.5)');ig.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=ig;ctx.fill();
    }
  });
  ctx.restore();
}

// ─── CREATURE (pesci, razze — più luminosi in profondità) ─────────────────────
function drawCreatures(dr){
  ctx.save();
  const depthGlow=1+dr*2.5;   // glow amplificato in profondità

  enemies.filter(e=>e.kind==='creature'||e.kind==='shark').forEach(e=>{
    const isShark=(e.kind==='shark');
    const r=isShark?28*sc:e.type.r*sc;
    const col=isShark?'#4a4a8a':e.type.col;
    const g=(Math.sin(e.phase)+1)*0.5;

    ctx.shadowColor=isShark?'#7777ff':col;
    ctx.shadowBlur=(isShark?20:12+g*10)*depthGlow;

    // Corpo segmentato
    const segs=e.segs;
    for(let i=segs.length-1;i>=0;i--){
      const t=1-i/segs.length;
      const sr=r*(0.3+t*0.7);
      ctx.beginPath();ctx.arc(segs[i].x,segs[i].y,sr,0,Math.PI*2);
      ctx.fillStyle=hexA(col,(0.3+t*0.5)*0.8);ctx.fill();
      ctx.strokeStyle=hexA(col,0.4+t*0.5);ctx.lineWidth=1;ctx.stroke();
    }

    // Testa
    ctx.shadowBlur=(isShark?30:18+g*14)*depthGlow;
    ctx.beginPath();ctx.arc(e.x,e.y,r,0,Math.PI*2);
    ctx.fillStyle=col+'cc';ctx.fill();

    if(isShark){
      // Pinna dorsale
      ctx.beginPath();
      ctx.moveTo(e.x,e.y-r);
      ctx.lineTo(e.x+Math.cos(e.angle-0.3)*r*1.5,e.y+Math.sin(e.angle-0.3)*r*1.5-r*0.5);
      ctx.lineTo(e.x+Math.cos(e.angle)*r*0.5,e.y+Math.sin(e.angle)*r*0.5);
      ctx.fillStyle='rgba(80,80,160,0.8)';ctx.fill();
      // Lettera "S" o denti simbolici
      ctx.shadowBlur=0;ctx.fillStyle='rgba(255,50,50,0.9)';
      ctx.font=`bold ${12*sc}px monospace`;ctx.textAlign='center';
      ctx.fillText('🦈',e.x,e.y+4*sc);
    }

    // Occhi (più vividi in profondità)
    if(!isShark){
      const eo=r*0.42;
      const eyeCol=dr>0.4?`rgba(255,${Math.round(200-dr*150)},0,1)`:'#fff';
      [e.angle-0.5,e.angle+0.5].forEach(a=>{
        const ex=e.x+Math.cos(a)*eo,ey=e.y+Math.sin(a)*eo;
        ctx.shadowBlur=dr>0.4?12:0;
        ctx.shadowColor=dr>0.4?'rgba(255,150,0,0.8)':'transparent';
        ctx.fillStyle=eyeCol;
        ctx.beginPath();ctx.arc(ex,ey,3*sc,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#111';
        ctx.beginPath();ctx.arc(ex+Math.cos(e.angle)*sc,ey+Math.sin(e.angle)*sc,1.5*sc,0,Math.PI*2);ctx.fill();
      });
    }
  });
  ctx.restore();
}

// ─── LOMBRICHI NEMICI ─────────────────────────────────────────────────────────
function drawEnemyWorms(){
  ctx.save();
  enemies.filter(e=>e.kind==='eworm').forEach(e=>{
    const {h,s,l}=e.col;
    const gv=(Math.sin(e.glow)+1)*0.5;
    ctx.shadowColor=`hsl(${h},${s}%,${l}%)`;
    ctx.shadowBlur=16+gv*12;

    for(let i=e.segs.length-1;i>=0;i--){
      const t=1-i/e.segs.length;
      const r=e.r*(0.35+t*0.65);
      const alpha=0.3+t*0.65;
      const biolum=Math.sin(e.glow+i*0.3);
      const fg=ctx.createRadialGradient(e.segs[i].x-r*0.2,e.segs[i].y-r*0.2,0,e.segs[i].x,e.segs[i].y,r);
      fg.addColorStop(0,`hsla(${h},${s}%,${l+20}%,${alpha*0.88})`);
      fg.addColorStop(0.5,`hsla(${h},${s}%,${l}%,${alpha*0.55})`);
      fg.addColorStop(1,`hsla(${h},${s}%,${l-12}%,${alpha*0.18})`);
      ctx.beginPath();ctx.arc(e.segs[i].x,e.segs[i].y,r,0,Math.PI*2);
      ctx.fillStyle=fg;ctx.fill();
      ctx.strokeStyle=`hsla(${h},${s}%,${l+12}%,${alpha*0.7})`;
      ctx.lineWidth=1.3;ctx.stroke();
      if(i%3===0){
        ctx.beginPath();ctx.arc(e.segs[i].x,e.segs[i].y,r*0.27,0,Math.PI*2);
        ctx.fillStyle=`hsla(${h+30},${s}%,${l+22}%,${0.32+biolum*0.28})`;ctx.fill();
      }
    }
    // Testa
    ctx.shadowBlur=24+gv*16;
    const hg=ctx.createRadialGradient(e.x-e.r*0.25,e.y-e.r*0.25,0,e.x,e.y,e.r);
    hg.addColorStop(0,`hsla(${h},${s}%,${l+28}%,0.96)`);
    hg.addColorStop(0.6,`hsla(${h},${s}%,${l}%,0.78)`);
    hg.addColorStop(1,`hsla(${h},${s}%,${l-16}%,0.28)`);
    ctx.beginPath();ctx.arc(e.x,e.y,e.r,0,Math.PI*2);
    ctx.fillStyle=hg;ctx.fill();
    ctx.strokeStyle=`hsla(${h},${s}%,${l+18}%,0.9)`;ctx.lineWidth=1.8;ctx.stroke();
    // Occhi rossi — è un nemico!
    ctx.shadowBlur=10;ctx.shadowColor='red';
    const eo=e.r*0.42;
    [e.angle-0.55,e.angle+0.55].forEach(a=>{
      const ex=e.x+Math.cos(a)*eo,ey=e.y+Math.sin(a)*eo;
      ctx.fillStyle='#ff3030';ctx.beginPath();ctx.arc(ex,ey,3.5*sc,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#220000';ctx.beginPath();ctx.arc(ex+Math.cos(e.angle)*sc,ey+Math.sin(e.angle)*sc,1.8*sc,0,Math.PI*2);ctx.fill();
    });
  });
  ctx.restore();
}

// ─── LOMBRICO GIOCATORE ───────────────────────────────────────────────────────
function drawWorm(dr){
  const segs=worm.segs;
  const {h,s,l}=wormCol;
  const gv=(Math.sin(worm.glow)+1)*0.5;
  const inv=worm.invincible>0;

  ctx.save();
  if(inv&&Math.floor(tick/8)%2===0)ctx.globalAlpha=0.4; // lampeggia se invincibile

  ctx.shadowColor=`hsl(${h},${s}%,${l}%)`;
  ctx.shadowBlur=14+gv*10;

  for(let i=segs.length-1;i>=0;i--){
    const t=1-i/segs.length;
    const r=(CFG.SEG_R*0.38+t*CFG.SEG_R*0.62)*sc;
    const alpha=0.28+t*0.65;
    const biolum=Math.sin(worm.glow+i*0.3);
    const fg=ctx.createRadialGradient(segs[i].x-r*0.2,segs[i].y-r*0.2,0,segs[i].x,segs[i].y,r);
    fg.addColorStop(0,`hsla(${h},${s}%,${l+22}%,${alpha*0.85})`);
    fg.addColorStop(0.5,`hsla(${h},${s}%,${l}%,${alpha*0.52})`);
    fg.addColorStop(1,`hsla(${h},${s}%,${l-12}%,${alpha*0.18})`);
    ctx.beginPath();ctx.arc(segs[i].x,segs[i].y,r,0,Math.PI*2);
    ctx.fillStyle=fg;ctx.fill();
    ctx.strokeStyle=`hsla(${h},${s}%,${l+12}%,${alpha*0.7})`;
    ctx.lineWidth=1.2;ctx.stroke();
    if(i%3===0){
      ctx.beginPath();ctx.arc(segs[i].x,segs[i].y,r*0.27,0,Math.PI*2);
      ctx.fillStyle=`hsla(${h+30},${s}%,${l+22}%,${0.3+biolum*0.28})`;ctx.fill();
    }
  }

  const hd=segs[0],hr=CFG.SEG_R*sc;
  ctx.shadowBlur=22+gv*16;
  const hg=ctx.createRadialGradient(hd.x-hr*0.25,hd.y-hr*0.25,0,hd.x,hd.y,hr);
  hg.addColorStop(0,`hsla(${h},${s}%,${l+26}%,0.96)`);
  hg.addColorStop(0.6,`hsla(${h},${s}%,${l}%,0.76)`);
  hg.addColorStop(1,`hsla(${h},${s}%,${l-16}%,0.28)`);
  ctx.beginPath();ctx.arc(hd.x,hd.y,hr,0,Math.PI*2);ctx.fillStyle=hg;ctx.fill();
  ctx.strokeStyle=`hsla(${h},${s}%,${l+16}%,0.92)`;ctx.lineWidth=1.5;ctx.stroke();
  ctx.shadowBlur=0;
  const eo=hr*0.42;
  [worm.angle-0.6,worm.angle+0.6].forEach(a=>{
    const ex=hd.x+Math.cos(a)*eo,ey=hd.y+Math.sin(a)*eo;
    ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(ex,ey,3.2*sc,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#001a2e';ctx.beginPath();ctx.arc(ex+Math.cos(worm.angle)*sc,ey+Math.sin(worm.angle)*sc,1.8*sc,0,Math.PI*2);ctx.fill();
  });
  ctx.globalAlpha=1;
  ctx.restore();
}

// ─── NEMO SCENE ───────────────────────────────────────────────────────────────
function drawNemoScene(){
  updateNemo();
  if(!nemoObj)return;
  ctx.save();

  // Overlay semitrasparente
  ctx.fillStyle='rgba(0,30,60,0.55)';ctx.fillRect(0,0,W,H);

  // Corpo di Nemo (pesce clown stilizzato)
  const nx=nemoObj.x,ny=nemoObj.y;
  const nr=18*sc;
  const g=(Math.sin(nemoObj.phase)+1)*0.5;

  // Coda
  ctx.beginPath();
  ctx.moveTo(nx+Math.cos(nemoObj.angle+Math.PI)*nr,ny+Math.sin(nemoObj.angle+Math.PI)*nr);
  ctx.lineTo(nx+Math.cos(nemoObj.angle+Math.PI+0.6)*nr*2,ny+Math.sin(nemoObj.angle+Math.PI+0.6)*nr*2);
  ctx.lineTo(nx+Math.cos(nemoObj.angle+Math.PI-0.6)*nr*2,ny+Math.sin(nemoObj.angle+Math.PI-0.6)*nr*2);
  ctx.fillStyle='#ff6b35';ctx.fill();

  // Corpo arancione
  ctx.shadowColor='#ff6b35';ctx.shadowBlur=20+g*15;
  ctx.beginPath();ctx.ellipse(nx,ny,nr*1.2,nr*0.85,nemoObj.angle,0,Math.PI*2);
  ctx.fillStyle='#ff6b35';ctx.fill();

  // Strisce bianche
  ctx.strokeStyle='rgba(255,255,255,0.9)';ctx.lineWidth=4*sc;
  for(let s=0;s<3;s++){
    const sx=nx+Math.cos(nemoObj.angle)*(nr*(0.5-s*0.5));
    const sy=ny+Math.sin(nemoObj.angle)*(nr*(0.5-s*0.5));
    ctx.beginPath();
    ctx.arc(sx,sy,nr*(0.3+s*0.1),nemoObj.angle-Math.PI/2,nemoObj.angle+Math.PI/2);
    ctx.stroke();
  }

  // Occhio
  const ex=nx+Math.cos(nemoObj.angle)*nr*0.6,ey=ny+Math.sin(nemoObj.angle)*nr*0.3;
  ctx.shadowBlur=0;ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(ex,ey,4*sc,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#111';ctx.beginPath();ctx.arc(ex+Math.cos(nemoObj.angle)*1.5*sc,ey+Math.sin(nemoObj.angle)*1.5*sc,2.2*sc,0,Math.PI*2);ctx.fill();

  // Messaggio
  if(nemoObj.timer>80){
    const msgAlpha=Math.min(1,(nemoObj.timer-80)/40);
    ctx.globalAlpha=msgAlpha;
    ctx.font=`bold ${22*sc}px 'Orbitron',monospace`;
    ctx.textAlign='center';ctx.fillStyle='#ff6b35';
    ctx.shadowColor='#ff6b35';ctx.shadowBlur=20;
    ctx.fillText('NEMO!',W/2,H*0.28);
    ctx.font=`${15*sc}px 'Rajdhani',sans-serif`;
    ctx.fillStyle='rgba(255,255,255,0.85)';ctx.shadowBlur=8;
    ctx.fillText('"Ehi! Ti do un po\' di energia!"',W/2,H*0.28+30*sc);
    if(nemoObj.timer>220){
      ctx.fillStyle='rgba(57,255,20,0.9)';ctx.shadowColor='#39ff14';ctx.shadowBlur=15;
      ctx.font=`bold ${18*sc}px 'Orbitron',monospace`;
      ctx.fillText('+30 ENERGIA',W/2,H*0.28+58*sc);
    }
    ctx.globalAlpha=1;
  }
  ctx.restore();
}

// ─── PARTICELLE ───────────────────────────────────────────────────────────────
function drawParticles(){
  ctx.save();
  particles.forEach(p=>{
    ctx.globalAlpha=Math.max(0,p.life);
    ctx.shadowColor=p.color;ctx.shadowBlur=6;
    ctx.beginPath();ctx.arc(p.x,p.y,Math.max(0.1,p.r*p.life),0,Math.PI*2);
    ctx.fillStyle=p.color;ctx.fill();
  });
  ctx.globalAlpha=1;ctx.restore();
}

// ─── BOTTONI ──────────────────────────────────────────────────────────────────
function setupButtons(){
  document.getElementById('btnPlay').addEventListener('click',()=>{
    showEl('splash',false);startGame(true);
  });
  document.getElementById('btnRestart').addEventListener('click',()=>{
    showEl('gameOver',false);startGame(true);
  });
  document.getElementById('btnMenu').addEventListener('click',()=>{
    showEl('gameOver',false);showEl('splash',true);
    document.getElementById('splashHS').textContent=highScore;
    state='splash';
  });
}

// ─── UTILS ────────────────────────────────────────────────────────────────────
function showEl(id,v){document.getElementById(id).classList.toggle('hidden',!v);}
function hexA(hex,a){
  const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  return`rgba(${r},${g},${b},${a})`;
}

window.addEventListener('DOMContentLoaded',init);
