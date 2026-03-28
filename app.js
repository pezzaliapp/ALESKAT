'use strict';

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const CFG = {
  TARGET_W: 414,
  TARGET_H: 736,
  FPS: 60,
  WORM_SPEED_BASE: 2.2,
  WORM_SPEED_MAX: 5.5,
  SEGMENT_SIZE: 12,
  SEGMENT_GAP: 6,
  INITIAL_LENGTH: 6,
  ENERGY_MAX: 100,
  ENERGY_DRAIN: 0.08,
  ENERGY_BOOST_FOOD: 22,
  ENERGY_BOOST_PLANKTON: 8,
  FOOD_SPAWN_INTERVAL: 90,
  PLANKTON_COUNT: 35,
  ENEMY_SPAWN_INTERVAL: 300,
  ENEMY_MAX: 6,
  DEPTH_RATE: 0.3,
  PARTICLE_MAX: 120,
  BUBBLE_COUNT: 25,
};

// ─── STATE ────────────────────────────────────────────────────────────────────
let canvas, ctx, dpr, scaleX, scaleY, gameW, gameH;
let state = 'splash';
let animId;
let tick = 0;
let score = 0;
let depth = 0;
let energy = CFG.ENERGY_MAX;
let highScore = +localStorage.getItem('aleskat_hs') || 0;

// ─── GAME OBJECTS ─────────────────────────────────────────────────────────────
let worm = null;
let foods = [];
let plankton = [];
let enemies = [];
let particles = [];
let bubbles = [];
let bgLayers = [];

// ─── INPUT ────────────────────────────────────────────────────────────────────
let joyActive = false, joyStartX = 0, joyStartY = 0, joyDX = 0, joyDY = 0;
const joystickZone = document.getElementById('joystickZone');
const joystickBase = document.getElementById('joystickBase');
const joystickKnob = document.getElementById('joystickKnob');

// ─── COLORS ───────────────────────────────────────────────────────────────────
const WORM_COLORS = [
  { h: 175, s: 100, l: 65 },  // cyan
  { h: 290, s: 80,  l: 65 },  // violet
  { h: 150, s: 100, l: 60 },  // lime
  { h: 200, s: 90,  l: 60 },  // sky
];
let wormColor = WORM_COLORS[0];

const FOOD_TYPES = [
  { label: 'krill',    color: '#ff6b35', glow: '#ff4400', size: 6,  energy: 22, score: 10 },
  { label: 'jellyfish',color: '#ff2d78', glow: '#ff0055', size: 10, energy: 35, score: 25 },
  { label: 'fish_egg', color: '#ffb700', glow: '#ff8800', size: 5,  energy: 15, score: 8  },
  { label: 'algae',    color: '#39ff14', glow: '#00cc00', size: 8,  energy: 18, score: 12 },
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
  updateSplashHS();
  initBubbles();
  renderSplashCanvas();
  requestAnimationFrame(loop);
}

function resize() {
  const ww = window.innerWidth, wh = window.innerHeight;
  const aspect = 9 / 16;
  let w, h;
  if (ww / wh < aspect) { w = ww; h = ww / aspect; }
  else { h = wh; w = wh * aspect; }
  gameW = w; gameH = h;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.scale(dpr, dpr);
  scaleX = w / CFG.TARGET_W;
  scaleY = h / CFG.TARGET_H;
}

// ─── MAIN LOOP ────────────────────────────────────────────────────────────────
function loop() {
  animId = requestAnimationFrame(loop);
  tick++;
  ctx.clearRect(0, 0, gameW, gameH);

  if (state === 'playing') {
    updateGame();
    drawGame();
  } else {
    drawSplashBG();
  }
}

// ─── SPLASH BG ────────────────────────────────────────────────────────────────
function drawSplashBG() {
  drawOceanBg(0);
  drawBubbles();
  drawParticles();
  updateParticles();
  updateBubbles();
  if (tick % 3 === 0) spawnDriftParticle();
}

function renderSplashCanvas() {
  const svg = document.getElementById('splashWorm');
  if (svg) svg.innerHTML = ''; // canvas draws worm preview
}

// ─── GAME START ───────────────────────────────────────────────────────────────
function startGame() {
  tick = 0; score = 0; depth = 0; energy = CFG.ENERGY_MAX;
  wormColor = WORM_COLORS[Math.floor(Math.random() * WORM_COLORS.length)];
  foods = []; enemies = []; particles = [];
  plankton = []; bubbles = [];

  initBubbles();
  initPlankton();
  initBgLayers();

  // Spawn worm at center
  const cx = CFG.TARGET_W / 2, cy = CFG.TARGET_H / 2;
  const segs = [];
  for (let i = 0; i < CFG.INITIAL_LENGTH; i++) {
    segs.push({ x: cx, y: cy + i * (CFG.SEGMENT_SIZE + CFG.SEGMENT_GAP) });
  }
  worm = {
    segs,
    angle: -Math.PI / 2,
    speed: CFG.WORM_SPEED_BASE,
    length: CFG.INITIAL_LENGTH,
    boosting: false,
    tail: [],
    glowPhase: 0,
  };

  state = 'playing';
  showHUD(true);
  showJoystick(true);
}

// ─── UPDATE ───────────────────────────────────────────────────────────────────
function updateGame() {
  updateInput();
  updateWorm();
  updateFood();
  updateEnemies();
  updateParticles();
  updateBubbles();
  updatePlankton();
  updateHUD();
  checkCollisions();

  depth += CFG.DEPTH_RATE * scaleY * 0.1;
  score += 0.05;
  energy = Math.max(0, energy - CFG.ENERGY_DRAIN);
  if (energy <= 0) triggerDeath('Energia esaurita');
}

// ─── INPUT ────────────────────────────────────────────────────────────────────
function setupJoystick() {
  function getRelPos(e) {
    const touch = e.touches ? e.touches[0] : e;
    return { x: touch.clientX, y: touch.clientY };
  }
  function toGameCoords(x, y) {
    const rect = canvas.getBoundingClientRect();
    const ox = rect.left + (rect.width - gameW) / 2;
    const oy = rect.top + (rect.height - gameH) / 2;
    return { x: x - ox, y: y - oy };
  }

  joystickZone.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const p = getRelPos(e);
    joyActive = true;
    joyStartX = p.x; joyStartY = p.y;
    joyDX = 0; joyDY = 0;
    moveJoystickBase(p.x, p.y);
  }, { passive: false });

  joystickZone.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!joyActive) return;
    const p = getRelPos(e);
    const dx = p.x - joyStartX, dy = p.y - joyStartY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const maxR = 50;
    const cx = Math.min(dist, maxR) * dx / Math.max(dist, 1);
    const cy = Math.min(dist, maxR) * dy / Math.max(dist, 1);
    joyDX = dx / Math.max(dist, 1);
    joyDY = dy / Math.max(dist, 1);
    joystickKnob.style.transform = `translate(${cx}px, ${cy}px)`;
  }, { passive: false });

  const endJoy = () => {
    joyActive = false;
    joyDX = 0; joyDY = 0;
    joystickKnob.style.transform = 'translate(0,0)';
  };
  joystickZone.addEventListener('touchend', endJoy);
  joystickZone.addEventListener('touchcancel', endJoy);

  // Mouse fallback
  joystickZone.addEventListener('mousedown', (e) => {
    joyActive = true;
    joyStartX = e.clientX; joyStartY = e.clientY;
    joyDX = 0; joyDY = 0;
    moveJoystickBase(e.clientX, e.clientY);
  });
  window.addEventListener('mousemove', (e) => {
    if (!joyActive) return;
    const dx = e.clientX - joyStartX, dy = e.clientY - joyStartY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const maxR = 50;
    const cx = Math.min(dist, maxR) * dx / Math.max(dist, 1);
    const cy = Math.min(dist, maxR) * dy / Math.max(dist, 1);
    joyDX = dx / Math.max(dist, 1);
    joyDY = dy / Math.max(dist, 1);
    joystickKnob.style.transform = `translate(${cx}px, ${cy}px)`;
  });
  window.addEventListener('mouseup', () => {
    joyActive = false;
    joyDX = 0; joyDY = 0;
    joystickKnob.style.transform = 'translate(0,0)';
  });
}

function moveJoystickBase(x, y) {
  const rect = canvas.getBoundingClientRect();
  const relX = x - rect.left;
  const relY = y - rect.top;
  const pct_x = relX / rect.width * 100;
  const pct_y = relY / rect.height * 100;
  joystickBase.style.left = pct_x + '%';
  joystickBase.style.bottom = '';
  joystickBase.style.top = pct_y + '%';
  joystickBase.style.transform = 'translate(-50%, -50%)';
}

function updateInput() {
  if (!worm || !joyActive) return;
  if (Math.abs(joyDX) > 0.05 || Math.abs(joyDY) > 0.05) {
    const targetAngle = Math.atan2(joyDY, joyDX);
    let diff = targetAngle - worm.angle;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    worm.angle += diff * 0.12;
    const mag = Math.min(Math.sqrt(joyDX * joyDX + joyDY * joyDY), 1);
    worm.boosting = mag > 0.7;
  }
}

// ─── WORM ────────────────────────────────────────────────────────────────────
function updateWorm() {
  if (!worm) return;
  worm.glowPhase += 0.05;
  const spd = worm.boosting
    ? Math.min(worm.speed * 1.8, CFG.WORM_SPEED_MAX)
    : worm.speed;
  const head = worm.segs[0];
  const nx = head.x + Math.cos(worm.angle) * spd * scaleX;
  const ny = head.y + Math.sin(worm.angle) * spd * scaleY;

  // Wrap horizontally, bounce vertically
  const tx = ((nx % CFG.TARGET_W) + CFG.TARGET_W) % CFG.TARGET_W;
  const ty = Math.max(20, Math.min(CFG.TARGET_H - 20, ny));
  if (ty !== ny) worm.angle = -worm.angle * 0.7;

  worm.segs.unshift({ x: tx, y: ty });
  while (worm.segs.length > worm.length) worm.segs.pop();

  if (worm.boosting) {
    energy = Math.max(0, energy - 0.15);
    if (tick % 2 === 0) spawnTrailParticle();
  }
}

// ─── FOOD ─────────────────────────────────────────────────────────────────────
function updateFood() {
  if (tick % CFG.FOOD_SPAWN_INTERVAL === 0) spawnFood();
  foods.forEach(f => {
    f.y += f.drift;
    f.x += Math.sin(f.wobble + tick * 0.02) * 0.5;
    f.wobble += 0.05;
    f.pulse += 0.08;
    if (f.y > CFG.TARGET_H + 20) f.dead = true;
  });
  foods = foods.filter(f => !f.dead);
}

function spawnFood() {
  const type = FOOD_TYPES[Math.floor(Math.random() * FOOD_TYPES.length)];
  foods.push({
    x: Math.random() * CFG.TARGET_W,
    y: -20,
    type,
    drift: 0.4 + Math.random() * 0.8,
    wobble: Math.random() * Math.PI * 2,
    pulse: 0,
    dead: false,
  });
}

// ─── PLANKTON ─────────────────────────────────────────────────────────────────
function initPlankton() {
  plankton = [];
  for (let i = 0; i < CFG.PLANKTON_COUNT; i++) {
    plankton.push(createPlankton());
  }
}

function createPlankton() {
  return {
    x: Math.random() * CFG.TARGET_W,
    y: Math.random() * CFG.TARGET_H,
    r: 2 + Math.random() * 3,
    vx: (Math.random() - 0.5) * 0.5,
    vy: (Math.random() - 0.5) * 0.5,
    hue: 160 + Math.random() * 80,
    phase: Math.random() * Math.PI * 2,
    dead: false,
  };
}

function updatePlankton() {
  plankton.forEach(p => {
    p.x += p.vx;
    p.y += p.vy;
    p.phase += 0.04;
    if (p.x < 0) p.x = CFG.TARGET_W;
    if (p.x > CFG.TARGET_W) p.x = 0;
    if (p.y < 0) p.y = CFG.TARGET_H;
    if (p.y > CFG.TARGET_H) p.y = 0;
  });
  if (plankton.length < CFG.PLANKTON_COUNT) {
    plankton.push(createPlankton());
  }
}

// ─── ENEMIES ──────────────────────────────────────────────────────────────────
const ENEMY_TYPES = [
  { name: 'anglerfish', color: '#ff2d78', size: 18, speed: 1.2, score: 50, aggressive: true },
  { name: 'barracuda',  color: '#ff6b35', size: 14, speed: 2.0, score: 30, aggressive: false },
  { name: 'deep_worm',  color: '#9b5de5', size: 16, speed: 1.5, score: 40, aggressive: true },
  { name: 'crab',       color: '#ffb700', size: 12, speed: 0.8, score: 20, aggressive: false },
];

function updateEnemies() {
  if (tick % CFG.ENEMY_SPAWN_INTERVAL === 0 && enemies.length < CFG.ENEMY_MAX) spawnEnemy();
  enemies.forEach(e => {
    e.phase += 0.03;
    if (e.type.aggressive && worm) {
      const head = worm.segs[0];
      const dx = head.x - e.x, dy = head.y - e.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 200 * scaleX) {
        e.angle = Math.atan2(dy, dx);
      } else {
        e.angle += (Math.random() - 0.5) * 0.1;
      }
    } else {
      e.angle += Math.sin(e.phase) * 0.05;
    }
    e.x += Math.cos(e.angle) * e.type.speed * scaleX;
    e.y += Math.sin(e.angle) * e.type.speed * scaleY;
    e.x = ((e.x % CFG.TARGET_W) + CFG.TARGET_W) % CFG.TARGET_W;
    e.y = Math.max(30, Math.min(CFG.TARGET_H - 30, e.y));

    // Enemy segments (snake-like)
    e.segs.unshift({ x: e.x, y: e.y });
    while (e.segs.length > e.segLen) e.segs.pop();
  });
  enemies = enemies.filter(e => !e.dead);
}

function spawnEnemy() {
  const type = ENEMY_TYPES[Math.floor(Math.random() * ENEMY_TYPES.length)];
  const side = Math.floor(Math.random() * 4);
  let x, y, angle;
  if (side === 0) { x = Math.random() * CFG.TARGET_W; y = -30; angle = Math.PI / 2; }
  else if (side === 1) { x = CFG.TARGET_W + 30; y = Math.random() * CFG.TARGET_H; angle = Math.PI; }
  else if (side === 2) { x = Math.random() * CFG.TARGET_W; y = CFG.TARGET_H + 30; angle = -Math.PI / 2; }
  else { x = -30; y = Math.random() * CFG.TARGET_H; angle = 0; }

  const segLen = 4 + Math.floor(Math.random() * 6);
  enemies.push({
    x, y, angle, type,
    segs: Array(segLen).fill(null).map(() => ({ x, y })),
    segLen,
    phase: Math.random() * Math.PI * 2,
    dead: false,
  });
}

// ─── COLLISIONS ───────────────────────────────────────────────────────────────
function checkCollisions() {
  if (!worm || worm.segs.length === 0) return;
  const head = worm.segs[0];
  const hr = CFG.SEGMENT_SIZE * scaleX;

  // Eat food
  foods.forEach(f => {
    if (f.dead) return;
    const dx = head.x - f.x, dy = head.y - f.y;
    if (Math.sqrt(dx * dx + dy * dy) < hr + f.type.size * scaleX) {
      f.dead = true;
      energy = Math.min(CFG.ENERGY_MAX, energy + f.type.energy);
      score += f.type.score;
      worm.length += 2;
      worm.speed = Math.min(CFG.WORM_SPEED_MAX, CFG.WORM_SPEED_BASE + worm.length * 0.02);
      spawnEatParticles(f.x, f.y, f.type.color);
    }
  });

  // Eat plankton
  plankton.forEach(p => {
    if (p.dead) return;
    const dx = head.x - p.x, dy = head.y - p.y;
    if (Math.sqrt(dx * dx + dy * dy) < hr + p.r * scaleX) {
      p.dead = true;
      energy = Math.min(CFG.ENERGY_MAX, energy + CFG.ENERGY_BOOST_PLANKTON);
      score += 3;
      plankton.push(createPlankton());
    }
  });

  // Enemy collision
  enemies.forEach(e => {
    if (e.dead) return;
    const dx = head.x - e.x, dy = head.y - e.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const er = e.type.size * scaleX;
    if (dist < hr + er) {
      // Big enemy = death, small = push
      if (worm.length < e.segLen + 2) {
        spawnDeathParticles(head.x, head.y);
        triggerDeath('Divorato!');
      } else {
        // We eat the enemy!
        e.dead = true;
        score += e.type.score;
        worm.length += 3;
        energy = Math.min(CFG.ENERGY_MAX, energy + 20);
        spawnEatParticles(e.x, e.y, e.type.color);
      }
    }
  });
}

// ─── PARTICLES ────────────────────────────────────────────────────────────────
function spawnEatParticles(x, y, color) {
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    particles.push({
      x, y,
      vx: Math.cos(a) * (1 + Math.random() * 3),
      vy: Math.sin(a) * (1 + Math.random() * 3),
      life: 1, decay: 0.04 + Math.random() * 0.04,
      r: 2 + Math.random() * 4,
      color,
    });
  }
}

function spawnDeathParticles(x, y) {
  for (let i = 0; i < 30; i++) {
    const a = Math.random() * Math.PI * 2;
    const spd = 1 + Math.random() * 5;
    particles.push({
      x, y,
      vx: Math.cos(a) * spd,
      vy: Math.sin(a) * spd,
      life: 1, decay: 0.025,
      r: 3 + Math.random() * 6,
      color: `hsl(${wormColor.h}, ${wormColor.s}%, ${wormColor.l}%)`,
    });
  }
}

function spawnTrailParticle() {
  if (!worm || worm.segs.length === 0) return;
  const tail = worm.segs[worm.segs.length - 1];
  particles.push({
    x: tail.x + (Math.random() - 0.5) * 4,
    y: tail.y + (Math.random() - 0.5) * 4,
    vx: (Math.random() - 0.5) * 0.5,
    vy: (Math.random() - 0.5) * 0.5,
    life: 0.6, decay: 0.025,
    r: 2 + Math.random() * 3,
    color: `hsla(${wormColor.h}, ${wormColor.s}%, ${wormColor.l}%, 0.5)`,
  });
}

function spawnDriftParticle() {
  particles.push({
    x: Math.random() * CFG.TARGET_W,
    y: -10,
    vx: (Math.random() - 0.5) * 0.3,
    vy: 0.3 + Math.random() * 0.5,
    life: 1, decay: 0.004,
    r: 1 + Math.random() * 2,
    color: `hsla(${170 + Math.random() * 60}, 80%, 70%, 0.4)`,
  });
}

function updateParticles() {
  particles.forEach(p => {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.05;
    p.life -= p.decay;
  });
  particles = particles.filter(p => p.life > 0);
  if (particles.length > CFG.PARTICLE_MAX) particles.splice(0, particles.length - CFG.PARTICLE_MAX);
}

// ─── BUBBLES ──────────────────────────────────────────────────────────────────
function initBubbles() {
  bubbles = [];
  for (let i = 0; i < CFG.BUBBLE_COUNT; i++) {
    bubbles.push(createBubble(true));
  }
}

function createBubble(random = false) {
  return {
    x: Math.random() * CFG.TARGET_W,
    y: random ? Math.random() * CFG.TARGET_H : CFG.TARGET_H + 20,
    r: 2 + Math.random() * 8,
    speed: 0.3 + Math.random() * 0.7,
    wobble: Math.random() * Math.PI * 2,
    opacity: 0.05 + Math.random() * 0.2,
  };
}

function updateBubbles() {
  bubbles.forEach(b => {
    b.y -= b.speed;
    b.x += Math.sin(b.wobble + tick * 0.02) * 0.4;
    b.wobble += 0.02;
    if (b.y < -20) Object.assign(b, createBubble(false));
  });
}

// ─── BG LAYERS ────────────────────────────────────────────────────────────────
function initBgLayers() {
  bgLayers = [
    { y: 0,   speed: 0.1, hue: 200 },
    { y: 200, speed: 0.07, hue: 220 },
    { y: 500, speed: 0.04, hue: 240 },
  ];
}

// ─── DRAW ─────────────────────────────────────────────────────────────────────
function drawGame() {
  const depthRatio = Math.min(depth / 1000, 1);
  drawOceanBg(depthRatio);
  drawBubbles();
  drawPlankton();
  drawFood();
  drawEnemies();
  drawWorm();
  drawParticles();
  drawDepthEffect(depthRatio);
}

function drawOceanBg(depthRatio) {
  const W = CFG.TARGET_W, H = CFG.TARGET_H;
  const h1 = Math.round(210 - depthRatio * 170);
  const h2 = Math.round(200 - depthRatio * 180);
  const l1 = Math.round(8 - depthRatio * 6);
  const l2 = Math.round(3 - depthRatio * 2);

  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, `hsl(${h1}, 90%, ${l1}%)`);
  grad.addColorStop(0.4, `hsl(${h2}, 85%, ${Math.max(l2, 1.5)}%)`);
  grad.addColorStop(1, `hsl(${180 + depthRatio * 20}, 70%, ${Math.max(1, 1 - depthRatio * 0.5)}%)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Caustics (light rays from above)
  if (depthRatio < 0.7) {
    const alpha = (1 - depthRatio) * 0.06;
    ctx.save();
    for (let i = 0; i < 8; i++) {
      const rx = (W * 0.1 * i + tick * 0.3) % (W * 1.2) - W * 0.1;
      const rayGrad = ctx.createLinearGradient(rx, 0, rx + 30, H * 0.6);
      rayGrad.addColorStop(0, `rgba(0,245,255,${alpha})`);
      rayGrad.addColorStop(1, 'rgba(0,245,255,0)');
      ctx.fillStyle = rayGrad;
      ctx.beginPath();
      ctx.moveTo(rx, 0);
      ctx.lineTo(rx + 20, H * 0.6);
      ctx.lineTo(rx + 60, H * 0.6);
      ctx.lineTo(rx + 40, 0);
      ctx.fill();
    }
    ctx.restore();
  }

  // Seabed
  ctx.save();
  const bedY = H - 40 * scaleY;
  const bedGrad = ctx.createLinearGradient(0, bedY, 0, H);
  bedGrad.addColorStop(0, `hsla(${200 + depthRatio * 20}, 60%, 8%, 0.9)`);
  bedGrad.addColorStop(1, `hsl(${190 + depthRatio * 30}, 50%, 3%)`);
  ctx.fillStyle = bedGrad;
  ctx.beginPath();
  ctx.moveTo(0, bedY);
  for (let x = 0; x <= W; x += 20) {
    ctx.lineTo(x, bedY + Math.sin(x * 0.05 + tick * 0.01) * 8);
  }
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.fill();
  ctx.restore();
}

function drawBubbles() {
  ctx.save();
  bubbles.forEach(b => {
    ctx.beginPath();
    ctx.arc(b.x * scaleX, b.y * scaleY, b.r * scaleX, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(180,240,255,${b.opacity})`;
    ctx.lineWidth = 0.8;
    ctx.stroke();
    // Highlight
    ctx.beginPath();
    ctx.arc(b.x * scaleX - b.r * 0.3 * scaleX, b.y * scaleY - b.r * 0.3 * scaleY, b.r * 0.3 * scaleX, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${b.opacity * 1.5})`;
    ctx.fill();
  });
  ctx.restore();
}

function drawPlankton() {
  ctx.save();
  plankton.forEach(p => {
    const glow = (Math.sin(p.phase) + 1) * 0.5;
    ctx.shadowColor = `hsla(${p.hue}, 80%, 60%, 0.8)`;
    ctx.shadowBlur = 6 * scaleX;
    ctx.beginPath();
    ctx.arc(p.x * scaleX, p.y * scaleY, p.r * scaleX, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${p.hue}, 80%, ${50 + glow * 20}%, ${0.4 + glow * 0.4})`;
    ctx.fill();
  });
  ctx.restore();
}

function drawFood() {
  ctx.save();
  foods.forEach(f => {
    const glow = (Math.sin(f.pulse) + 1) * 0.5;
    const r = f.type.size * scaleX;
    const sx = f.x * scaleX, sy = f.y * scaleY;

    ctx.shadowColor = f.type.glow;
    ctx.shadowBlur = (8 + glow * 8) * scaleX;

    if (f.type.label === 'jellyfish') {
      // Bell
      ctx.beginPath();
      ctx.arc(sx, sy, r, -Math.PI, 0);
      ctx.fillStyle = `${f.type.color}88`;
      ctx.fill();
      // Tentacles
      for (let i = 0; i < 5; i++) {
        const tx = sx + (i - 2) * r * 0.4;
        ctx.beginPath();
        ctx.moveTo(tx, sy);
        ctx.bezierCurveTo(tx, sy + r * 1.5, tx + Math.sin(tick * 0.05 + i) * r, sy + r * 2.5, tx, sy + r * 3);
        ctx.strokeStyle = `${f.type.color}66`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      ctx.arc(sx, sy, r * (0.9 + glow * 0.15), 0, Math.PI * 2);
      ctx.fillStyle = f.type.color;
      ctx.fill();
      // Inner glow
      const inner = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      inner.addColorStop(0, 'rgba(255,255,255,0.5)');
      inner.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = inner;
      ctx.fill();
    }
  });
  ctx.restore();
}

function drawEnemies() {
  ctx.save();
  enemies.forEach(e => {
    const segs = e.segs;
    if (segs.length < 2) return;
    const r = e.type.size * scaleX;
    const glow = (Math.sin(e.phase) + 1) * 0.5;

    ctx.shadowColor = e.type.color;
    ctx.shadowBlur = (10 + glow * 10) * scaleX;

    // Draw body
    for (let i = segs.length - 1; i >= 0; i--) {
      const t = 1 - i / segs.length;
      const segR = r * (0.3 + t * 0.7);
      const alpha = 0.4 + t * 0.5;
      ctx.beginPath();
      ctx.arc(segs[i].x * scaleX, segs[i].y * scaleY, segR, 0, Math.PI * 2);
      ctx.fillStyle = hexAlpha(e.type.color, alpha * 0.7);
      ctx.fill();
      ctx.strokeStyle = hexAlpha(e.type.color, alpha);
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Head
    ctx.shadowBlur = (16 + glow * 16) * scaleX;
    ctx.beginPath();
    ctx.arc(e.x * scaleX, e.y * scaleY, r, 0, Math.PI * 2);
    ctx.fillStyle = e.type.color + 'cc';
    ctx.fill();
    // Eyes
    const eyeOff = e.type.size * 0.3 * scaleX;
    const eyeAngle = e.angle;
    const ex1 = e.x * scaleX + Math.cos(eyeAngle - 0.5) * eyeOff;
    const ey1 = e.y * scaleY + Math.sin(eyeAngle - 0.5) * eyeOff;
    const ex2 = e.x * scaleX + Math.cos(eyeAngle + 0.5) * eyeOff;
    const ey2 = e.y * scaleY + Math.sin(eyeAngle + 0.5) * eyeOff;
    ctx.fillStyle = '#fff';
    ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.arc(ex1, ey1, 2.5 * scaleX, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(ex2, ey2, 2.5 * scaleX, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(ex1, ey1, 1.2 * scaleX, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(ex2, ey2, 1.2 * scaleX, 0, Math.PI * 2); ctx.fill();
  });
  ctx.restore();
}

function drawWorm() {
  if (!worm || worm.segs.length === 0) return;
  const segs = worm.segs;
  const h = wormColor.h, s = wormColor.s, l = wormColor.l;
  const glow = (Math.sin(worm.glowPhase) + 1) * 0.5;

  ctx.save();
  ctx.shadowColor = `hsl(${h},${s}%,${l}%)`;
  ctx.shadowBlur = (12 + glow * 10) * scaleX;

  // Draw each segment from tail to head
  for (let i = segs.length - 1; i >= 0; i--) {
    const t = 1 - i / segs.length;
    const progress = i / segs.length;
    const segR = (CFG.SEGMENT_SIZE * 0.35 + t * CFG.SEGMENT_SIZE * 0.65) * scaleX;
    const alpha = 0.25 + t * 0.6;
    const lightness = l - progress * 15;
    const biolum = Math.sin(worm.glowPhase + i * 0.3);

    ctx.beginPath();
    ctx.arc(segs[i].x * scaleX, segs[i].y * scaleY, segR, 0, Math.PI * 2);

    // Translucent body fill
    const fillGrad = ctx.createRadialGradient(
      segs[i].x * scaleX - segR * 0.2, segs[i].y * scaleY - segR * 0.2, 0,
      segs[i].x * scaleX, segs[i].y * scaleY, segR
    );
    fillGrad.addColorStop(0, `hsla(${h},${s}%,${lightness + 20}%,${alpha * 0.8})`);
    fillGrad.addColorStop(0.5, `hsla(${h},${s}%,${lightness}%,${alpha * 0.5})`);
    fillGrad.addColorStop(1, `hsla(${h},${s}%,${lightness - 10}%,${alpha * 0.2})`);
    ctx.fillStyle = fillGrad;
    ctx.fill();

    // Outer glow ring
    ctx.strokeStyle = `hsla(${h},${s}%,${lightness + 10}%,${alpha * 0.7})`;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Bioluminescent spots
    if (i % 3 === 0) {
      ctx.beginPath();
      ctx.arc(segs[i].x * scaleX, segs[i].y * scaleY, segR * 0.25, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${h + 30},${s}%,${l + 20}%,${0.3 + biolum * 0.3})`;
      ctx.fill();
    }
  }

  // Head
  const head = segs[0];
  const headR = CFG.SEGMENT_SIZE * scaleX;
  ctx.shadowBlur = (20 + glow * 15) * scaleX;
  ctx.beginPath();
  ctx.arc(head.x * scaleX, head.y * scaleY, headR, 0, Math.PI * 2);
  const headGrad = ctx.createRadialGradient(
    head.x * scaleX - headR * 0.25, head.y * scaleY - headR * 0.25, 0,
    head.x * scaleX, head.y * scaleY, headR
  );
  headGrad.addColorStop(0, `hsla(${h},${s}%,${l + 25}%,0.95)`);
  headGrad.addColorStop(0.6, `hsla(${h},${s}%,${l}%,0.75)`);
  headGrad.addColorStop(1, `hsla(${h},${s}%,${l - 15}%,0.3)`);
  ctx.fillStyle = headGrad;
  ctx.fill();
  ctx.strokeStyle = `hsla(${h},${s}%,${l + 15}%,0.9)`;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Eyes
  const eyeOff = headR * 0.4;
  ctx.shadowBlur = 0;
  const ex1 = head.x * scaleX + Math.cos(worm.angle - 0.6) * eyeOff;
  const ey1 = head.y * scaleY + Math.sin(worm.angle - 0.6) * eyeOff;
  const ex2 = head.x * scaleX + Math.cos(worm.angle + 0.6) * eyeOff;
  const ey2 = head.y * scaleY + Math.sin(worm.angle + 0.6) * eyeOff;
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(ex1, ey1, 3 * scaleX, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(ex2, ey2, 3 * scaleX, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#001a2e';
  ctx.beginPath(); ctx.arc(ex1 + Math.cos(worm.angle) * scaleX, ey1 + Math.sin(worm.angle) * scaleX, 1.8 * scaleX, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(ex2 + Math.cos(worm.angle) * scaleX, ey2 + Math.sin(worm.angle) * scaleX, 1.8 * scaleX, 0, Math.PI * 2); ctx.fill();

  ctx.restore();
}

function drawParticles() {
  ctx.save();
  particles.forEach(p => {
    ctx.globalAlpha = p.life;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 6 * scaleX;
    ctx.beginPath();
    ctx.arc(p.x * scaleX, p.y * scaleY, p.r * scaleX * p.life, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawDepthEffect(depthRatio) {
  if (depthRatio < 0.3) return;
  const alpha = (depthRatio - 0.3) / 0.7 * 0.35;
  ctx.fillStyle = `rgba(0,0,10,${alpha})`;
  ctx.fillRect(0, 0, CFG.TARGET_W, CFG.TARGET_H);
}

// ─── HUD UPDATE ───────────────────────────────────────────────────────────────
function updateHUD() {
  document.getElementById('scoreVal').textContent = Math.floor(score);
  document.getElementById('depthVal').textContent = Math.floor(depth) + 'm';
  document.getElementById('lengthVal').textContent = worm ? worm.length : 0;
  const fill = document.getElementById('energyFill');
  const pct = (energy / CFG.ENERGY_MAX) * 100;
  fill.style.width = pct + '%';
  fill.classList.toggle('low', pct < 25);
}

// ─── DEATH ────────────────────────────────────────────────────────────────────
function triggerDeath(reason) {
  if (state !== 'playing') return;
  state = 'dead';
  showJoystick(false);
  const hs = Math.max(highScore, Math.floor(score));
  highScore = hs;
  localStorage.setItem('aleskat_hs', hs);

  document.getElementById('goScore').textContent = Math.floor(score);
  document.getElementById('goLength').textContent = worm ? worm.length : 0;
  document.getElementById('goDepth').textContent = Math.floor(depth) + 'm';
  document.getElementById('goHS').textContent = hs;

  showHUD(false);
  document.getElementById('gameOver').classList.remove('hidden');

  // Keep rendering for death animation
  let deathTick = 0;
  const deathLoop = () => {
    deathTick++;
    ctx.clearRect(0, 0, gameW, gameH);
    drawOceanBg(Math.min(depth / 1000, 1));
    drawBubbles();
    drawParticles();
    updateParticles();
    updateBubbles();
    if (deathTick < 120) requestAnimationFrame(deathLoop);
  };
  cancelAnimationFrame(animId);
  requestAnimationFrame(deathLoop);
}

// ─── BUTTONS ──────────────────────────────────────────────────────────────────
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
    state = 'splash';
    document.getElementById('splash').classList.remove('hidden');
    updateSplashHS();
    cancelAnimationFrame(animId);
    animId = requestAnimationFrame(loop);
  });
}

function showHUD(v) {
  document.getElementById('hud').classList.toggle('hidden', !v);
}
function showJoystick(v) {
  document.getElementById('joystickZone').classList.toggle('hidden', !v);
}
function updateSplashHS() {
  document.getElementById('splashHS').textContent = highScore;
}

// ─── UTILS ────────────────────────────────────────────────────────────────────
function hexAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ─── KICK OFF ─────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', init);
