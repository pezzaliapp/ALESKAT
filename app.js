'use strict';

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const CFG = {
  WORM_SPEED_BASE: 3.0,
  WORM_SPEED_MAX: 7.0,
  SEG_R: 14,
  INITIAL_LENGTH: 8,
  ENERGY_MAX: 100,
  ENERGY_DRAIN: 0.07,
  FOOD_SPAWN_INTERVAL: 80,
  PLANKTON_COUNT: 40,
  ENEMY_SPAWN_INTERVAL: 280,
  ENEMY_MAX: 7,
  DEPTH_RATE: 0.25,
  PARTICLE_MAX: 150,
  BUBBLE_COUNT: 28,
  BASE_W: 414,
};

// ─── STATO ────────────────────────────────────────────────────────────────────
let canvas, ctx, dpr;
let W = 414, H = 736, scale = 1;
let state = 'splash';
let animId, tick = 0;
let score = 0, depth = 0, energy = CFG.ENERGY_MAX;
let highScore = +localStorage.getItem('aleskat_hs') || 0;

let worm = null;
let foods = [], plankton = [], enemies = [], particles = [], bubbles = [];
let joyActive = false, joyStartX = 0, joyStartY = 0, joyDX = 0, joyDY = 0;

const WORM_PALETTE = [
  { h: 175, s: 100, l: 65 },
  { h: 290, s: 80,  l: 68 },
  { h: 150, s: 100, l: 62 },
  { h: 200, s: 90,  l: 62 },
];
let wormColor = WORM_PALETTE[0];

const FOOD_TYPES = [
  { label: 'krill',     color: '#ff6b35', glow: '#ff4400', r: 7,  energy: 22, pts: 10 },
  { label: 'jellyfish', color: '#ff2d78', glow: '#ff0055', r: 12, energy: 35, pts: 25 },
  { label: 'fish_egg',  color: '#ffb700', glow: '#ff8800', r: 6,  energy: 15, pts: 8  },
  { label: 'algae',     color: '#39ff14', glow: '#00cc00', r: 9,  energy: 18, pts: 12 },
];
const ENEMY_TYPES = [
  { name: 'anglerfish', color: '#ff2d78', r: 20, spd: 1.4, pts: 50, aggressive: true  },
  { name: 'barracuda',  color: '#ff6b35', r: 16, spd: 2.2, pts: 30, aggressive: false },
  { name: 'deep_worm',  color: '#9b5de5', r: 18, spd: 1.6, pts: 40, aggressive: true  },
  { name: 'crab',       color: '#ffb700', r: 14, spd: 0.9, pts: 20, aggressive: false },
];

// ─── INIT ─────────────────────────────────────────────────────────────────────
function init() {
  canvas = document.getElementById('gameCanvas');
  ctx = canvas.getContext('2d');
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  resize();
  window.addEventListener('resize', resize);
  setupJoystick();
  setupButtons();
  document.getElementById('splashHS').textContent = highScore;
  initBubbles();
  animId = requestAnimationFrame(loop);
}

function resize() {
  const ww = window.innerWidth, wh = window.innerHeight;
  const aspect = 9 / 16;
  if (ww / wh < aspect) { W = ww; H = Math.round(ww / aspect); }
  else { H = wh; W = Math.round(wh * aspect); }
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  canvas.width  = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  scale = W / CFG.BASE_W;
}

// ─── LOOP ─────────────────────────────────────────────────────────────────────
function loop() {
  animId = requestAnimationFrame(loop);
  tick++;
  ctx.clearRect(0, 0, W, H);
  if (state === 'playing') {
    update(); draw();
  } else {
    drawBg(0);
    tickBubbles(); tickDrift(); tickParticles();
    drawBubbles(); drawParticles();
  }
}

// ─── START ────────────────────────────────────────────────────────────────────
function startGame() {
  tick = 0; score = 0; depth = 0; energy = CFG.ENERGY_MAX;
  wormColor = WORM_PALETTE[Math.floor(Math.random() * WORM_PALETTE.length)];
  foods = []; enemies = []; particles = []; plankton = []; bubbles = [];
  initBubbles();
  initPlankton();

  const cx = W / 2, cy = H / 2;
  const gap = (CFG.SEG_R * 2 + 5) * scale;
  const segs = [];
  for (let i = 0; i < CFG.INITIAL_LENGTH; i++) segs.push({ x: cx, y: cy + i * gap });
  worm = { segs, angle: -Math.PI / 2,
           speed: CFG.WORM_SPEED_BASE * scale,
           length: CFG.INITIAL_LENGTH,
           boosting: false, glow: 0 };

  state = 'playing';
  document.getElementById('hud').classList.remove('hidden');
  document.getElementById('joystickZone').classList.remove('hidden');
}

// ─── UPDATE ───────────────────────────────────────────────────────────────────
function update() {
  updateInput(); moveWorm();
  tickFood(); tickEnemies();
  tickBubbles(); tickParticles(); tickPlankton();
  checkCollisions(); updateHUD();
  depth  += CFG.DEPTH_RATE * 0.016 * 60;
  score  += 0.05;
  energy  = Math.max(0, energy - CFG.ENERGY_DRAIN);
  if (energy <= 0) die();
}

// ─── JOYSTICK ─────────────────────────────────────────────────────────────────
function setupJoystick() {
  const zone = document.getElementById('joystickZone');
  const base = document.getElementById('joystickBase');
  const knob = document.getElementById('joystickKnob');
  const MAX_R = 50;

  function startJoy(cx, cy) {
    joyActive = true; joyStartX = cx; joyStartY = cy; joyDX = 0; joyDY = 0;
    const rect = canvas.getBoundingClientRect();
    base.style.left = (cx - rect.left) + 'px';
    base.style.top  = (cy - rect.top)  + 'px';
    base.style.bottom = '';
    base.style.transform = 'translate(-50%,-50%)';
  }
  function moveJoy(cx, cy) {
    const dx = cx - joyStartX, dy = cy - joyStartY;
    const dist = Math.hypot(dx, dy) || 1;
    joyDX = dx / dist; joyDY = dy / dist;
    const cl = Math.min(dist, MAX_R);
    knob.style.transform = `translate(${joyDX * cl}px,${joyDY * cl}px)`;
  }
  function endJoy() {
    joyActive = false; joyDX = 0; joyDY = 0;
    knob.style.transform = 'translate(0,0)';
  }

  zone.addEventListener('touchstart',  e => { e.preventDefault(); startJoy(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
  zone.addEventListener('touchmove',   e => { e.preventDefault(); moveJoy(e.touches[0].clientX, e.touches[0].clientY); },  { passive: false });
  zone.addEventListener('touchend',    endJoy);
  zone.addEventListener('touchcancel', endJoy);
  zone.addEventListener('mousedown',   e => startJoy(e.clientX, e.clientY));
  window.addEventListener('mousemove', e => { if (joyActive) moveJoy(e.clientX, e.clientY); });
  window.addEventListener('mouseup',   endJoy);
}

function updateInput() {
  if (!worm || !joyActive) return;
  if (Math.abs(joyDX) > 0.05 || Math.abs(joyDY) > 0.05) {
    const target = Math.atan2(joyDY, joyDX);
    let diff = target - worm.angle;
    while (diff >  Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    worm.angle += diff * 0.12;
    worm.boosting = Math.hypot(joyDX, joyDY) > 0.7;
  } else { worm.boosting = false; }
}

// ─── WORM ────────────────────────────────────────────────────────────────────
function moveWorm() {
  if (!worm) return;
  worm.glow += 0.05;
  const spd = worm.boosting
    ? Math.min(worm.speed * 1.8, CFG.WORM_SPEED_MAX * scale)
    : worm.speed;
  const hd = worm.segs[0];
  let nx = hd.x + Math.cos(worm.angle) * spd;
  let ny = hd.y + Math.sin(worm.angle) * spd;
  nx = ((nx % W) + W) % W;
  const mar = CFG.SEG_R * scale;
  if (ny < mar)     { ny = mar;     worm.angle =  Math.abs(worm.angle); }
  if (ny > H - mar) { ny = H - mar; worm.angle = -Math.abs(worm.angle); }
  worm.segs.unshift({ x: nx, y: ny });
  while (worm.segs.length > worm.length) worm.segs.pop();
  if (worm.boosting) {
    energy = Math.max(0, energy - 0.18);
    if (tick % 2 === 0) {
      const tl = worm.segs[worm.segs.length - 1];
      particles.push({ x: tl.x, y: tl.y,
        vx: (Math.random()-0.5)*1.2, vy: (Math.random()-0.5)*1.2,
        life: 0.65, decay: 0.025,
        r: 3 * scale,
        color: `hsla(${wormColor.h},${wormColor.s}%,${wormColor.l}%,0.5)` });
    }
  }
}

// ─── CIBO ─────────────────────────────────────────────────────────────────────
function tickFood() {
  if (tick % CFG.FOOD_SPAWN_INTERVAL === 0) {
    const t = FOOD_TYPES[Math.floor(Math.random() * FOOD_TYPES.length)];
    foods.push({ x: Math.random() * W, y: -20, type: t,
      drift: (0.5 + Math.random() * 0.9) * scale,
      wobble: Math.random() * Math.PI * 2, pulse: 0, dead: false });
  }
  foods.forEach(f => {
    f.y += f.drift;
    f.x += Math.sin(f.wobble + tick * 0.02) * 0.6;
    f.wobble += 0.04; f.pulse += 0.08;
    if (f.y > H + 30) f.dead = true;
  });
  foods = foods.filter(f => !f.dead);
}

// ─── PLANCTON ────────────────────────────────────────────────────────────────
function initPlankton() {
  for (let i = 0; i < CFG.PLANKTON_COUNT; i++) plankton.push(mkPlankton());
}
function mkPlankton() {
  return { x: Math.random() * W, y: Math.random() * H,
           r: (2 + Math.random() * 3) * scale,
           vx: (Math.random()-0.5)*0.5, vy: (Math.random()-0.5)*0.5,
           hue: 160 + Math.random() * 80,
           phase: Math.random() * Math.PI * 2, dead: false };
}
function tickPlankton() {
  plankton.forEach(p => {
    p.x = ((p.x + p.vx + W) % W);
    p.y = ((p.y + p.vy + H) % H);
    p.phase += 0.04;
  });
  plankton = plankton.filter(p => !p.dead);
  while (plankton.length < CFG.PLANKTON_COUNT) plankton.push(mkPlankton());
}

// ─── NEMICI ───────────────────────────────────────────────────────────────────
function tickEnemies() {
  if (tick % CFG.ENEMY_SPAWN_INTERVAL === 0 && enemies.length < CFG.ENEMY_MAX) spawnEnemy();
  enemies.forEach(e => {
    e.phase += 0.03;
    if (e.type.aggressive && worm) {
      const hd = worm.segs[0];
      const dx = hd.x - e.x, dy = hd.y - e.y;
      if (Math.hypot(dx, dy) < 220 * scale) e.angle = Math.atan2(dy, dx);
      else e.angle += (Math.random()-0.5) * 0.08;
    } else {
      e.angle += Math.sin(e.phase) * 0.04;
    }
    e.x += Math.cos(e.angle) * e.type.spd * scale;
    e.y += Math.sin(e.angle) * e.type.spd * scale;
    e.x = ((e.x % W) + W) % W;
    e.y = Math.max(30 * scale, Math.min(H - 30 * scale, e.y));
    e.segs.unshift({ x: e.x, y: e.y });
    while (e.segs.length > e.segLen) e.segs.pop();
  });
  enemies = enemies.filter(e => !e.dead);
}
function spawnEnemy() {
  const type = ENEMY_TYPES[Math.floor(Math.random() * ENEMY_TYPES.length)];
  const side = Math.floor(Math.random() * 4);
  let x, y, angle;
  if      (side === 0) { x = Math.random()*W; y = -40;         angle =  Math.PI/2; }
  else if (side === 1) { x = W+40;            y = Math.random()*H; angle =  Math.PI; }
  else if (side === 2) { x = Math.random()*W; y = H+40;        angle = -Math.PI/2; }
  else                 { x = -40;             y = Math.random()*H; angle =  0; }
  const segLen = 5 + Math.floor(Math.random() * 6);
  enemies.push({ x, y, angle, type, segLen,
    segs: Array.from({ length: segLen }, () => ({ x, y })),
    phase: Math.random() * Math.PI * 2, dead: false });
}

// ─── COLLISIONI ───────────────────────────────────────────────────────────────
function checkCollisions() {
  if (!worm || !worm.segs.length) return;
  const hd = worm.segs[0];
  const hr = CFG.SEG_R * scale;

  foods.forEach(f => {
    if (f.dead) return;
    if (Math.hypot(hd.x - f.x, hd.y - f.y) < hr + f.type.r * scale) {
      f.dead = true;
      energy = Math.min(CFG.ENERGY_MAX, energy + f.type.energy);
      score += f.type.pts;
      worm.length += 2;
      worm.speed = Math.min(CFG.WORM_SPEED_MAX * scale, worm.speed + 0.04);
      burst(f.x, f.y, f.type.color, 12);
    }
  });

  plankton.forEach(p => {
    if (p.dead) return;
    if (Math.hypot(hd.x - p.x, hd.y - p.y) < hr + p.r) {
      p.dead = true;
      energy = Math.min(CFG.ENERGY_MAX, energy + 8);
      score += 3;
    }
  });

  enemies.forEach(e => {
    if (e.dead) return;
    if (Math.hypot(hd.x - e.x, hd.y - e.y) < hr + e.type.r * scale) {
      if (worm.length < e.segLen + 2) {
        burst(hd.x, hd.y, `hsl(${wormColor.h},${wormColor.s}%,${wormColor.l}%)`, 30);
        die();
      } else {
        e.dead = true; score += e.type.pts;
        worm.length += 3;
        energy = Math.min(CFG.ENERGY_MAX, energy + 20);
        burst(e.x, e.y, e.type.color, 14);
      }
    }
  });
}

// ─── PARTICELLE ───────────────────────────────────────────────────────────────
function burst(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const spd = (1 + Math.random() * 4) * scale;
    particles.push({ x, y,
      vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
      life: 1, decay: 0.035 + Math.random() * 0.03,
      r: (2 + Math.random() * 4) * scale, color });
  }
}
function tickParticles() {
  particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.04; p.life -= p.decay; });
  particles = particles.filter(p => p.life > 0);
  if (particles.length > CFG.PARTICLE_MAX)
    particles.splice(0, particles.length - CFG.PARTICLE_MAX);
}
function tickDrift() {
  if (tick % 3 === 0) {
    particles.push({ x: Math.random() * W, y: -10,
      vx: (Math.random()-0.5)*0.3, vy: (0.3 + Math.random()*0.6)*scale,
      life: 1, decay: 0.003,
      r: (1 + Math.random()*2)*scale,
      color: `hsla(${170+Math.random()*60},80%,70%,0.35)` });
  }
}

// ─── BOLLE ────────────────────────────────────────────────────────────────────
function initBubbles() {
  bubbles = [];
  for (let i = 0; i < CFG.BUBBLE_COUNT; i++) bubbles.push(mkBubble(true));
}
function mkBubble(rand) {
  return { x: Math.random()*W,
           y: rand ? Math.random()*H : H+10,
           r: (2 + Math.random()*7)*scale,
           spd: (0.3 + Math.random()*0.7)*scale,
           wobble: Math.random()*Math.PI*2,
           opacity: 0.06 + Math.random()*0.18 };
}
function tickBubbles() {
  bubbles.forEach(b => {
    b.y -= b.spd;
    b.x += Math.sin(b.wobble + tick * 0.02) * 0.4;
    b.wobble += 0.02;
    if (b.y < -20) Object.assign(b, mkBubble(false));
  });
}

// ─── DISEGNO ──────────────────────────────────────────────────────────────────
function draw() {
  const dr = Math.min(depth / 1000, 1);
  drawBg(dr);
  drawBubbles();
  drawPlankton();
  drawFood();
  drawEnemies();
  drawWorm();
  drawParticles();
  if (dr > 0.3) {
    ctx.fillStyle = `rgba(0,0,10,${(dr - 0.3) / 0.7 * 0.38})`;
    ctx.fillRect(0, 0, W, H);
  }
}

function drawBg(dr) {
  const h1 = Math.round(210 - dr * 170);
  const l1 = Math.max(1, Math.round(9 - dr * 7));
  const l2 = Math.max(1, Math.round(3 - dr * 2));
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0,    `hsl(${h1},90%,${l1}%)`);
  grad.addColorStop(0.45, `hsl(${Math.round(200-dr*180)},85%,${l2}%)`);
  grad.addColorStop(1,    `hsl(${Math.round(180+dr*25)},70%,1%)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Raggi caustica
  if (dr < 0.7) {
    const alpha = (1 - dr) * 0.055;
    ctx.save();
    for (let i = 0; i < 8; i++) {
      const rx = (W * 0.12 * i + tick * 0.4) % (W * 1.3) - W * 0.1;
      const rg = ctx.createLinearGradient(rx, 0, rx + 35*scale, H*0.55);
      rg.addColorStop(0, `rgba(0,245,255,${alpha})`);
      rg.addColorStop(1, 'rgba(0,245,255,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.moveTo(rx, 0);
      ctx.lineTo(rx + 22*scale, H*0.55);
      ctx.lineTo(rx + 65*scale, H*0.55);
      ctx.lineTo(rx + 43*scale, 0);
      ctx.fill();
    }
    ctx.restore();
  }

  // Fondale ondulato
  const bedY = H - 45 * scale;
  const bedG = ctx.createLinearGradient(0, bedY, 0, H);
  bedG.addColorStop(0, `hsla(${200+dr*20},60%,8%,0.9)`);
  bedG.addColorStop(1, `hsl(${190+dr*30},50%,2%)`);
  ctx.fillStyle = bedG;
  ctx.beginPath();
  ctx.moveTo(0, bedY);
  for (let x = 0; x <= W; x += 20) {
    ctx.lineTo(x, bedY + Math.sin(x * 0.05 + tick * 0.008) * 9 * scale);
  }
  ctx.lineTo(W, H); ctx.lineTo(0, H);
  ctx.fill();
}

function drawBubbles() {
  ctx.save();
  bubbles.forEach(b => {
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI*2);
    ctx.strokeStyle = `rgba(180,240,255,${b.opacity})`;
    ctx.lineWidth = 0.8; ctx.stroke();
    ctx.beginPath();
    ctx.arc(b.x - b.r*0.3, b.y - b.r*0.3, b.r*0.28, 0, Math.PI*2);
    ctx.fillStyle = `rgba(255,255,255,${b.opacity*1.4})`; ctx.fill();
  });
  ctx.restore();
}

function drawPlankton() {
  ctx.save();
  plankton.forEach(p => {
    const g = (Math.sin(p.phase)+1)*0.5;
    ctx.shadowColor = `hsla(${p.hue},80%,60%,0.9)`;
    ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
    ctx.fillStyle = `hsla(${p.hue},80%,${50+g*22}%,${0.45+g*0.4})`;
    ctx.fill();
  });
  ctx.restore();
}

function drawFood() {
  ctx.save();
  foods.forEach(f => {
    const g = (Math.sin(f.pulse)+1)*0.5;
    const r = f.type.r * scale;
    ctx.shadowColor = f.type.glow;
    ctx.shadowBlur = 9 + g*9;
    if (f.type.label === 'jellyfish') {
      ctx.beginPath(); ctx.arc(f.x, f.y, r, -Math.PI, 0);
      ctx.fillStyle = f.type.color+'88'; ctx.fill();
      for (let i = 0; i < 5; i++) {
        const tx = f.x + (i-2)*r*0.42;
        ctx.beginPath();
        ctx.moveTo(tx, f.y);
        ctx.bezierCurveTo(tx, f.y+r*1.4, tx+Math.sin(tick*0.05+i)*r, f.y+r*2.4, tx, f.y+r*3);
        ctx.strokeStyle = f.type.color+'66'; ctx.lineWidth = 1.5; ctx.stroke();
      }
    } else {
      ctx.beginPath(); ctx.arc(f.x, f.y, r*(0.9+g*0.13), 0, Math.PI*2);
      ctx.fillStyle = f.type.color; ctx.fill();
      const ig = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
      ig.addColorStop(0,'rgba(255,255,255,0.5)'); ig.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle = ig; ctx.fill();
    }
  });
  ctx.restore();
}

function drawEnemies() {
  ctx.save();
  enemies.forEach(e => {
    const r = e.type.r * scale;
    const g = (Math.sin(e.phase)+1)*0.5;
    ctx.shadowColor = e.type.color; ctx.shadowBlur = 12+g*10;
    for (let i = e.segs.length-1; i >= 0; i--) {
      const t = 1 - i/e.segs.length;
      const sr = r*(0.3+t*0.7);
      ctx.beginPath(); ctx.arc(e.segs[i].x, e.segs[i].y, sr, 0, Math.PI*2);
      ctx.fillStyle = hexA(e.type.color, (0.3+t*0.5)*0.75); ctx.fill();
      ctx.strokeStyle = hexA(e.type.color, 0.4+t*0.5); ctx.lineWidth=1; ctx.stroke();
    }
    ctx.shadowBlur = 18+g*14;
    ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI*2);
    ctx.fillStyle = e.type.color+'cc'; ctx.fill();
    const eo = r*0.42;
    [e.angle-0.5, e.angle+0.5].forEach(a => {
      const ex = e.x+Math.cos(a)*eo, ey = e.y+Math.sin(a)*eo;
      ctx.shadowBlur=0; ctx.fillStyle='#fff';
      ctx.beginPath(); ctx.arc(ex, ey, 3*scale, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle='#111';
      ctx.beginPath(); ctx.arc(ex+Math.cos(e.angle)*scale, ey+Math.sin(e.angle)*scale, 1.5*scale, 0, Math.PI*2); ctx.fill();
    });
  });
  ctx.restore();
}

function drawWorm() {
  if (!worm || !worm.segs.length) return;
  const segs = worm.segs;
  const { h, s, l } = wormColor;
  const gv = (Math.sin(worm.glow)+1)*0.5;
  ctx.save();
  ctx.shadowColor = `hsl(${h},${s}%,${l}%)`;
  ctx.shadowBlur = 14+gv*10;

  for (let i = segs.length-1; i >= 0; i--) {
    const t = 1 - i/segs.length;
    const r = (CFG.SEG_R*0.35 + t*CFG.SEG_R*0.65)*scale;
    const alpha = 0.28 + t*0.62;
    const biolum = Math.sin(worm.glow + i*0.3);
    const fg = ctx.createRadialGradient(segs[i].x-r*0.2, segs[i].y-r*0.2, 0, segs[i].x, segs[i].y, r);
    fg.addColorStop(0,   `hsla(${h},${s}%,${l+22}%,${alpha*0.85})`);
    fg.addColorStop(0.5, `hsla(${h},${s}%,${l}%,${alpha*0.52})`);
    fg.addColorStop(1,   `hsla(${h},${s}%,${l-12}%,${alpha*0.18})`);
    ctx.beginPath(); ctx.arc(segs[i].x, segs[i].y, r, 0, Math.PI*2);
    ctx.fillStyle = fg; ctx.fill();
    ctx.strokeStyle = `hsla(${h},${s}%,${l+12}%,${alpha*0.7})`;
    ctx.lineWidth = 1.2; ctx.stroke();
    if (i % 3 === 0) {
      ctx.beginPath(); ctx.arc(segs[i].x, segs[i].y, r*0.27, 0, Math.PI*2);
      ctx.fillStyle = `hsla(${h+30},${s}%,${l+22}%,${0.3+biolum*0.28})`; ctx.fill();
    }
  }

  const hd = segs[0], hr = CFG.SEG_R*scale;
  ctx.shadowBlur = 22+gv*16;
  const hg = ctx.createRadialGradient(hd.x-hr*0.25, hd.y-hr*0.25, 0, hd.x, hd.y, hr);
  hg.addColorStop(0,   `hsla(${h},${s}%,${l+26}%,0.96)`);
  hg.addColorStop(0.6, `hsla(${h},${s}%,${l}%,0.76)`);
  hg.addColorStop(1,   `hsla(${h},${s}%,${l-16}%,0.28)`);
  ctx.beginPath(); ctx.arc(hd.x, hd.y, hr, 0, Math.PI*2);
  ctx.fillStyle = hg; ctx.fill();
  ctx.strokeStyle = `hsla(${h},${s}%,${l+16}%,0.92)`;
  ctx.lineWidth = 1.5; ctx.stroke();
  ctx.shadowBlur = 0;
  const eo = hr*0.42;
  [worm.angle-0.6, worm.angle+0.6].forEach(a => {
    const ex = hd.x+Math.cos(a)*eo, ey = hd.y+Math.sin(a)*eo;
    ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(ex, ey, 3.2*scale, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle='#001a2e'; ctx.beginPath(); ctx.arc(ex+Math.cos(worm.angle)*scale, ey+Math.sin(worm.angle)*scale, 1.8*scale, 0, Math.PI*2); ctx.fill();
  });
  ctx.restore();
}

function drawParticles() {
  ctx.save();
  particles.forEach(p => {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.shadowColor = p.color; ctx.shadowBlur = 6;
    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.1, p.r*p.life), 0, Math.PI*2);
    ctx.fillStyle = p.color; ctx.fill();
  });
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ─── HUD ─────────────────────────────────────────────────────────────────────
function updateHUD() {
  document.getElementById('scoreVal').textContent  = Math.floor(score);
  document.getElementById('depthVal').textContent  = Math.floor(depth)+'m';
  document.getElementById('lengthVal').textContent = worm ? worm.length : 0;
  const pct = (energy/CFG.ENERGY_MAX)*100;
  const fill = document.getElementById('energyFill');
  fill.style.width = pct+'%';
  fill.classList.toggle('low', pct < 25);
}

// ─── MORTE ────────────────────────────────────────────────────────────────────
function die() {
  if (state !== 'playing') return;
  state = 'dead';
  document.getElementById('joystickZone').classList.add('hidden');
  document.getElementById('hud').classList.add('hidden');
  highScore = Math.max(highScore, Math.floor(score));
  localStorage.setItem('aleskat_hs', highScore);
  document.getElementById('goScore').textContent  = Math.floor(score);
  document.getElementById('goLength').textContent = worm ? worm.length : 0;
  document.getElementById('goDepth').textContent  = Math.floor(depth)+'m';
  document.getElementById('goHS').textContent     = highScore;
  document.getElementById('gameOver').classList.remove('hidden');
}

// ─── BOTTONI ──────────────────────────────────────────────────────────────────
function setupButtons() {
  document.getElementById('btnPlay').addEventListener('click', () => {
    document.getElementById('splash').classList.add('hidden');
    startGame();
  });
  document.getElementById('btnRestart').addEventListener('click', () => {
    document.getElementById('gameOver').classList.add('hidden');
    startGame();
  });
  document.getElementById('btnMenu').addEventListener('click', () => {
    document.getElementById('gameOver').classList.add('hidden');
    document.getElementById('splash').classList.remove('hidden');
    document.getElementById('splashHS').textContent = highScore;
    state = 'splash';
  });
}

// ─── UTIL ────────────────────────────────────────────────────────────────────
function hexA(hex, a) {
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}

window.addEventListener('DOMContentLoaded', init);
