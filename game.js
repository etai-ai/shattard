// ─── CRAZYGAMES SDK ───
const CG = (() => {
  const sdk = window.CrazyGames?.CrazySDK?.getInstance() ?? window.CrazyGames?.SDK ?? null;
  const hasSDK = !!sdk;
  return {
    sdk,
    gameplayStart() { if (hasSDK && sdk.game) sdk.game.gameplayStart(); },
    gameplayStop() { if (hasSDK && sdk.game) sdk.game.gameplayStop(); },
    happytime() { if (hasSDK && sdk.game) sdk.game.happytime(); },
    showAd(type, cb = {}) {
      if (!hasSDK || !sdk.ad) { if (cb.adFinished) cb.adFinished(); return; }
      sdk.ad.requestAd(type, {
        adStarted: () => { if (cb.adStarted) cb.adStarted(); },
        adFinished: () => { if (cb.adFinished) cb.adFinished(); },
        adError: (e) => { if (cb.adError) cb.adError(e); },
      });
    },
    async saveScore(v) { if (!hasSDK || !sdk.data) return; try { await sdk.data.setItem('highScore', String(v)); } catch(_){} },
    async getScore() { if (!hasSDK || !sdk.data) return null; try { const v = await sdk.data.getItem('highScore'); return v !== null ? Number(v) : null; } catch(_){ return null; } },
  };
})();

let highScore = 0;

// ─── PERSISTENT STATS (localStorage) ───
const STATS_KEY = 'shattard_stats';
let allTimeStats = loadStats();
function loadStats() {
  try { const s = JSON.parse(localStorage.getItem(STATS_KEY)); if (s && typeof s === 'object') return s; } catch(_) {}
  return { gamesPlayed:0, totalCollected:0, totalDodged:0, totalNearMisses:0,
    longestCombo:0, highestWave:0, bestScore:0, totalSlowMoMs:0, totalPlayTimeMs:0 };
}
function saveStats() { try { localStorage.setItem(STATS_KEY, JSON.stringify(allTimeStats)); } catch(_) {} }
function showStats() {
  const s = allTimeStats;
  const grid = document.getElementById('statsGrid');
  grid.innerHTML = [
    ['GAMES PLAYED', s.gamesPlayed], null,
    ['BEST SCORE', s.bestScore], ['HIGHEST WAVE', s.highestWave],
    ['LONGEST COMBO', 'x' + s.longestCombo], null,
    ['TOTAL COLLECTED', s.totalCollected], ['TOTAL DODGED', s.totalDodged],
    ['NEAR MISSES', s.totalNearMisses], null,
    ['SLOW-MO USED', Math.round(s.totalSlowMoMs/1000) + 's'],
    ['PLAY TIME', Math.round(s.totalPlayTimeMs/60000) + ' min'],
  ].map(r => r === null ? '<div class="stats-divider"></div>' :
    `<div class="stats-label">${r[0]}</div><div class="stats-value">${r[1]}</div>`).join('');
  document.getElementById('statsScreen').classList.add('visible');
}
function hideStats() { document.getElementById('statsScreen').classList.remove('visible'); }
function commitSessionStats() {
  if (slowMo && slowMoStartTime) { sessionSlowMoMs += performance.now() - slowMoStartTime; slowMoStartTime = 0; }
  allTimeStats.gamesPlayed++;
  allTimeStats.totalCollected += totalCollected;
  allTimeStats.totalDodged += totalDodged;
  allTimeStats.totalNearMisses += totalNearMisses;
  allTimeStats.longestCombo = Math.max(allTimeStats.longestCombo, maxCombo);
  allTimeStats.highestWave = Math.max(allTimeStats.highestWave, wavesCompleted);
  allTimeStats.bestScore = Math.max(allTimeStats.bestScore, Math.floor(score));
  allTimeStats.totalSlowMoMs += sessionSlowMoMs;
  allTimeStats.totalPlayTimeMs += performance.now() - gameStartTime;
  saveStats();
}

// ─── MATRIX RAIN ───
const rainCanvas = document.getElementById('rain');
const rCtx = rainCanvas.getContext('2d');
let rainCols, drops;
function initRain() {
  rainCanvas.width = window.innerWidth; rainCanvas.height = window.innerHeight;
  rainCols = Math.floor(rainCanvas.width / 14);
  drops = Array.from({ length: rainCols }, () => Math.random() * rainCanvas.height / 14);
}
function drawRain() {
  rCtx.fillStyle = 'rgba(0, 0, 0, 0.05)';
  rCtx.fillRect(0, 0, rainCanvas.width, rainCanvas.height);
  rCtx.fillStyle = '#00ff41'; rCtx.font = '14px Share Tech Mono';
  const chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789';
  for (let i = 0; i < drops.length; i++) {
    rCtx.fillText(chars[Math.floor(Math.random() * chars.length)], i * 14, drops[i] * 14);
    if (drops[i] * 14 > rainCanvas.height && Math.random() > 0.975) drops[i] = 0;
    drops[i]++;
  }
  requestAnimationFrame(drawRain);
}
initRain(); drawRain();
window.addEventListener('resize', initRain);

// ─── STATE ───
const gc = document.getElementById('gameCanvas');
const ctx = gc.getContext('2d');
let W, H, player, entities, particles, score, combo, maxCombo, lives, gameRunning;
let slowMo, slowMoEnergy, slowMoCooldown;
let difficulty, spawnTimer, lastTime, elapsed;
let totalCollected, totalDodged, totalNearMisses;
let lastTap = 0, touching = false;
let currentWave, waveTimer, wavePhase, announceTimer, breatherTimer, waveGlyphsSpawned, wavesCompleted;
let paused = false, gameStartTime = 0, sessionSlowMoMs = 0, slowMoStartTime = 0;
let playerTrail = [];
let shakeTimer = 0, shakeIntensity = 0;
const PLAYER_TRAIL_MAX = 12, PLAYER_TRAIL_SPEED_THRESHOLD = 3;

const PLAYER_SIZE = 31, MAX_LIVES = 3, TOUCH_Y_OFFSET = -80, SLOW_MO_DURATION = 3000;
const CHARS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
const NEAR_MISS_RADIUS = 1.7, NEAR_MISS_SCORE = 25;

// ─── WAVE DEFS ───
const WAVE_DEFS = [
  { name:'WAVE 1', desc:'INITIALIZATION',   dur:20, sr:0.65, gr:0.55, sm:0.8,  pat:['normal'], br:3 },
  { name:'WAVE 2', desc:'ACCELERATION',      dur:22, sr:0.50, gr:0.48, sm:1.0,  pat:['normal'], br:3 },
  { name:'WAVE 3', desc:'EVASION PROTOCOL',  dur:24, sr:0.48, gr:0.45, sm:1.0,  pat:['normal','zigzag'], br:3 },
  { name:'WAVE 4', desc:'SWARM DETECTED',    dur:25, sr:0.40, gr:0.42, sm:1.15, pat:['normal','cluster'], br:4 },
  { name:'WAVE 5', desc:'FRAGMENTATION',     dur:27, sr:0.38, gr:0.40, sm:1.2,  pat:['normal','zigzag','splitter'], br:4 },
  { name:'WAVE 6', desc:'OVERLOAD',          dur:28, sr:0.32, gr:0.38, sm:1.3,  pat:['normal','zigzag','cluster','splitter'], br:4 },
  { name:'WAVE 7', desc:'CRITICAL MASS',     dur:30, sr:0.28, gr:0.35, sm:1.4,  pat:['normal','zigzag','cluster','splitter'], br:4 },
  { name:'WAVE 8', desc:'SINGULARITY',       dur:35, sr:0.22, gr:0.33, sm:1.5,  pat:['normal','zigzag','cluster','splitter'], br:5 },
];
function getWave(n) {
  if (n < WAVE_DEFS.length) return WAVE_DEFS[n];
  const b = WAVE_DEFS[7], e = n - 7;
  return { ...b, name:`WAVE ${n+1}`, desc:['SINGULARITY','MELTDOWN','ENTROPY','CHAOS','VOID'][e%5],
    sr: Math.max(0.15, b.sr - e*0.015), gr: Math.max(0.25, b.gr - e*0.01), sm: b.sm + e*0.08 };
}

function resizeGame() { W = gc.width = window.innerWidth; H = gc.height = window.innerHeight; }

// ─── SPAWNING ───
function spawnGlyph() {
  const w = getWave(currentWave);
  const pat = w.pat[Math.floor(Math.random() * w.pat.length)];
  if (pat === 'cluster') { spawnCluster(w); return; }
  const isGood = Math.random() < w.gr;
  const ent = {
    type: isGood ? 'good' : 'bad',
    x: Math.random() * (W - 40) + 20, y: -30,
    size: isGood ? 27 : (21 + Math.random() * 13),
    speed: (1.5 + Math.random() * 1.5) * w.sm * (isGood ? 0.8 : 1),
    char: CHARS[Math.floor(Math.random() * CHARS.length)],
    alpha: 0.7 + Math.random() * 0.3,
    wobble: Math.random() * Math.PI * 2,
    wobbleSpeed: 0.5 + Math.random() * 2,
    wobbleAmp: isGood ? 0 : (10 + Math.random() * 20),
    trail: [], nearMissed: false,
    isSplitter: pat === 'splitter' && !isGood, hasSplit: false,
  };
  if (pat === 'zigzag' && !isGood) { ent.wobbleAmp = 40 + Math.random() * 30; ent.wobbleSpeed = 3 + Math.random() * 2; }
  if (ent.isSplitter) { ent.size = 35 + Math.random() * 8; ent.speed *= 0.7; ent.char = '⬢'; }
  entities.push(ent);
  waveGlyphsSpawned++;
}
function spawnCluster(w) {
  const cx = Math.random() * (W - 100) + 50, count = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < count; i++) {
    const isGood = i === 0 && Math.random() < 0.3;
    entities.push({
      type: isGood ? 'good' : 'bad',
      x: cx + (Math.random()-0.5)*60, y: -30 - Math.random()*40,
      size: isGood ? 27 : (19 + Math.random()*8),
      speed: (1.8 + Math.random()*1.2) * w.sm,
      char: CHARS[Math.floor(Math.random()*CHARS.length)],
      alpha: 0.7 + Math.random()*0.3,
      wobble: Math.random()*Math.PI*2, wobbleSpeed: 0.5 + Math.random()*1.5,
      wobbleAmp: 5 + Math.random()*10,
      trail: [], nearMissed: false, isSplitter: false, hasSplit: false,
    });
  }
  waveGlyphsSpawned += count;
}
function splitEntity(e) {
  const count = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < count; i++) {
    const a = (Math.PI*2/count)*i + Math.random()*0.5;
    entities.push({
      type:'bad', x: e.x+Math.cos(a)*15, y: e.y+Math.sin(a)*10,
      size: 16+Math.random()*6, speed: e.speed*(1.2+Math.random()*0.5),
      char: CHARS[Math.floor(Math.random()*CHARS.length)], alpha: 0.8,
      wobble: Math.random()*Math.PI*2, wobbleSpeed: 2+Math.random()*3,
      wobbleAmp: 15+Math.random()*20,
      trail:[], nearMissed:false, isSplitter:false, hasSplit:false,
    });
  }
  emitParticles(e.x, e.y, '#ff6633', 10);
  sfxSplit();
}
function spawnPowerUp() {
  entities.push({
    type:'power', x: Math.random()*(W-60)+30, y:-30,
    size:29, speed:1+Math.random(), char:'⬡', alpha:1,
    wobble:0, wobbleSpeed:3, wobbleAmp:15, pulsePhase:0,
    trail:[], nearMissed:false, isSplitter:false, hasSplit:false,
  });
}

// ─── PARTICLES ───
function emitParticles(x,y,color,count) {
  for (let i=0; i<count; i++) {
    const a=Math.random()*Math.PI*2, s=1+Math.random()*4;
    particles.push({ x,y, vx:Math.cos(a)*s, vy:Math.sin(a)*s,
      life:0.5+Math.random()*0.5, maxLife:0.5+Math.random()*0.5,
      color, size:1+Math.random()*3,
      char: Math.random()>0.5 ? CHARS[Math.floor(Math.random()*CHARS.length)] : null,
    });
  }
}
function emitNearMissParticles(x,y) {
  for (let i=0;i<6;i++) {
    const a=Math.random()*Math.PI*2, s=2+Math.random()*3;
    particles.push({ x,y, vx:Math.cos(a)*s, vy:Math.sin(a)*s,
      life:0.35+Math.random()*0.25, maxLife:0.35+Math.random()*0.25,
      color:'#ffaa00', size:1.5+Math.random()*2, char:null,
    });
  }
}

function initPlayer() {
  player = { x:W/2, y:H*0.8, targetX:W/2, targetY:H*0.8, size:PLAYER_SIZE, glowPhase:0, orbitPhase:0, radarRing:0, prevX:W/2, prevY:H*0.8 };
  playerTrail = [];
}

// ─── INPUT ───
gc.addEventListener('touchstart', (e) => {
  e.preventDefault(); const t = e.touches[0]; touching = true;
  player.targetX = t.clientX; player.targetY = t.clientY + TOUCH_Y_OFFSET;
  const now = Date.now(); if (now - lastTap < 300) activateSlowMo(); lastTap = now;
}, { passive: false });
gc.addEventListener('touchmove', (e) => {
  e.preventDefault(); if (!touching) return;
  const t = e.touches[0]; player.targetX = t.clientX; player.targetY = t.clientY + TOUCH_Y_OFFSET;
}, { passive: false });
gc.addEventListener('touchend', () => { touching = false; });
gc.addEventListener('mousedown', (e) => {
  touching = true; player.targetX = e.clientX; player.targetY = e.clientY;
  const now = Date.now(); if (now - lastTap < 300) activateSlowMo(); lastTap = now;
});
gc.addEventListener('mousemove', (e) => { if (touching) { player.targetX = e.clientX; player.targetY = e.clientY; } });
gc.addEventListener('mouseup', () => { touching = false; });

function activateSlowMo() {
  if (slowMoEnergy < 30 || slowMoCooldown > 0) return;
  slowMo = true; sfxSlowMo(); slowMoStartTime = performance.now();
  setTimeout(() => { if(slowMo){sessionSlowMoMs+=performance.now()-slowMoStartTime;slowMoStartTime=0;slowMo=false;} }, SLOW_MO_DURATION);
}

// ─── PAUSE ───
function togglePause() {
  if (!gameRunning) return;
  paused = !paused;
  document.getElementById('pauseOverlay').classList.toggle('visible', paused);
  if (!paused) { lastTime = performance.now(); requestAnimationFrame(gameLoop); }
}
function quitToTitle() {
  paused = false;
  document.getElementById('pauseOverlay').classList.remove('visible');
  gameRunning = false;
  commitSessionStats();
  document.getElementById('hud').classList.add('hidden');
  document.getElementById('slowMoBar').classList.add('hidden');
  document.getElementById('slowMoLabel').classList.add('hidden');
  gc.classList.add('hidden');
  hideBreather();
  document.getElementById('titleScreen').classList.remove('hidden');
}

function flash(type) {
  const el = document.getElementById('flashOverlay');
  el.className = ''; void el.offsetWidth; el.classList.add(type);
}
function vibrate(ms) { if (navigator.vibrate) navigator.vibrate(ms); }
function screenShake() {
  shakeTimer = 0.22; // seconds of shake remaining
  shakeIntensity = 5; // max px offset
}

function showNearMissText(x, y, pts) {
  const el = document.createElement('div');
  el.className = 'near-miss-text';
  el.textContent = `+${pts} CLOSE!`;
  el.style.left = (x - 40) + 'px'; el.style.top = (y - 20) + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 800);
}

function announceWave(n) {
  const w = getWave(n);
  document.getElementById('waveNumber').textContent = w.name;
  document.getElementById('waveDesc').textContent = w.desc;
  document.getElementById('waveAnnounce').classList.add('visible');
  document.getElementById('waveDisplay').textContent = w.name;
  sfxWaveStart();
  setTimeout(() => document.getElementById('waveAnnounce').classList.remove('visible'), 2200);
}
function showBreather(dur) {
  const bar = document.getElementById('breatherBar');
  const fill = document.getElementById('breatherFill');
  bar.classList.add('visible'); fill.style.width = '100%';
  const start = performance.now(), ms = dur * 1000;
  (function anim() {
    const pct = Math.max(0, 1 - (performance.now() - start) / ms);
    fill.style.width = (pct*100) + '%';
    if (pct > 0 && wavePhase === 'breather') requestAnimationFrame(anim);
  })();
}
function hideBreather() { document.getElementById('breatherBar').classList.remove('visible'); }

// ─── AUDIO ───
let audioCtx = null, audioUnlocked = false;
// Tiny silent WAV for iOS audio session unlock
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

function initAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  // Safari requires unlocking to happen SYNCHRONOUSLY within the user event.
  if (!audioUnlocked) {
    // 1. Prime a silent oscillator in the Web Audio graph immediately
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    // Use setValueAtTime for better WebKit compatibility instead of g.gain.value = 0
    g.gain.setValueAtTime(0, audioCtx.currentTime); 
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start(0);
    o.stop(audioCtx.currentTime + 0.001);

    // 2. Prime the HTML5 Audio element synchronously
    const a = new Audio(SILENT_WAV);
    a.playsInline = true;
    a.play().catch(() => {}); // Catch safely without delaying execution

    audioUnlocked = true;
  }

  // 3. Ensure the context is running
  if (audioCtx.state !== 'running') {
    audioCtx.resume().catch(() => {});
  }
}
// Re-resume audio on every user gesture — iOS suspends the context on
// tab switch, lock screen, and after ads, so a one-shot listener isn't enough.
function _unlockAudio() {
  initAudio();
}
document.addEventListener('touchstart', _unlockAudio, { passive: true, capture: true });
document.addEventListener('touchend', _unlockAudio, { passive: true, capture: true });
document.addEventListener('pointerdown', _unlockAudio, { passive: true, capture: true });
document.addEventListener('click', _unlockAudio, { capture: true });
document.addEventListener('keydown', _unlockAudio, { capture: true });
// Re-resume after tab becomes visible again (iOS suspends audio in background)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && audioCtx && audioCtx.state !== 'running') audioCtx.resume().catch(() => {});
});
function playTone(freq, dur, vol=0.3, type='sine') {
  if (!audioCtx) return;
  if (audioCtx.state !== 'running') {
    audioCtx.resume().then(() => {
      if (audioCtx && audioCtx.state === 'running') playTone(freq, dur, vol, type);
    }).catch(() => {});
    return;
  }
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
  o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + dur);
}
function sfxCollect() { if(!audioCtx)return; playTone(880,0.12,0.18,'sine'); playTone(1320,0.12,0.1,'triangle'); setTimeout(()=>playTone(1760,0.15,0.14,'sine'),50); }
function sfxPowerUp() { if(!audioCtx)return; playTone(660,0.1,0.15,'sine'); setTimeout(()=>playTone(880,0.1,0.15,'sine'),60); setTimeout(()=>playTone(1320,0.15,0.18,'triangle'),120); }
function sfxHit() { if(!audioCtx)return; playTone(320,0.15,0.3,'sawtooth'); playTone(240,0.2,0.25,'square'); setTimeout(()=>playTone(180,0.15,0.2,'sawtooth'),60); }
function sfxSlowMo() {
  if(!audioCtx)return;
  const o=audioCtx.createOscillator(), g=audioCtx.createGain();
  o.type='sine'; o.frequency.setValueAtTime(800,audioCtx.currentTime);
  o.frequency.exponentialRampToValueAtTime(120,audioCtx.currentTime+0.5);
  g.gain.setValueAtTime(0.2,audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001,audioCtx.currentTime+0.5);
  o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime+0.5);
}
function sfxDeath() {
  if(!audioCtx)return;
  playTone(280,0.4,0.3,'sawtooth'); playTone(220,0.6,0.25,'square');
  setTimeout(()=>{playTone(180,0.4,0.25,'sawtooth');playTone(140,0.5,0.2,'square');},200);
  setTimeout(()=>playTone(100,0.6,0.2,'square'),450);
}
function sfxCombo() {
  if(!audioCtx)return; const t=audioCtx.currentTime;
  const o=audioCtx.createOscillator(),g=audioCtx.createGain();
  o.type='sine'; o.frequency.setValueAtTime(1200,t); o.frequency.exponentialRampToValueAtTime(1800,t+0.08);
  g.gain.setValueAtTime(0.12,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.1);
  o.connect(g);g.connect(audioCtx.destination);o.start(t);o.stop(t+0.1);
}
function sfxNearMiss() {
  if(!audioCtx)return; const t=audioCtx.currentTime;
  const o=audioCtx.createOscillator(),g=audioCtx.createGain();
  o.type='triangle'; o.frequency.setValueAtTime(600,t);
  o.frequency.exponentialRampToValueAtTime(1200,t+0.06);
  o.frequency.exponentialRampToValueAtTime(800,t+0.12);
  g.gain.setValueAtTime(0.15,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.15);
  o.connect(g);g.connect(audioCtx.destination);o.start(t);o.stop(t+0.15);
}
function sfxWaveStart() {
  if(!audioCtx)return;
  playTone(440,0.15,0.12,'sine'); setTimeout(()=>playTone(660,0.15,0.12,'sine'),100);
  setTimeout(()=>playTone(880,0.2,0.15,'triangle'),200); setTimeout(()=>playTone(1100,0.25,0.1,'sine'),300);
}
function sfxSplit() { if(!audioCtx)return; playTone(400,0.12,0.2,'sawtooth'); playTone(300,0.15,0.15,'square'); setTimeout(()=>playTone(500,0.1,0.12,'triangle'),50); }
function sfxNewBest() {
  if(!audioCtx) return;
  // Triumphant ascending arpeggio
  playTone(523, 0.15, 0.15, 'sine');    // C5
  setTimeout(() => playTone(659, 0.15, 0.15, 'sine'), 100);  // E5
  setTimeout(() => playTone(784, 0.15, 0.18, 'sine'), 200);  // G5
  setTimeout(() => playTone(1047, 0.25, 0.2, 'triangle'), 320); // C6
  setTimeout(() => {
    playTone(1047, 0.3, 0.12, 'sine');
    playTone(1319, 0.3, 0.08, 'sine'); // E6 harmony
  }, 450);
}

function updateLivesUI() {
  const el = document.getElementById('livesDisplay'); el.innerHTML = '';
  for (let i=0;i<MAX_LIVES;i++) {
    const p = document.createElement('div');
    p.className = 'life-pip' + (i >= lives ? ' lost' : '');
    el.appendChild(p);
  }
}

function dist(a,b) { return Math.hypot(a.x-b.x, a.y-b.y); }

// ─── TUTORIAL ───
let tutorialStep = 0, tutorialShown = !!localStorage.getItem('tutDone'), tutAnimFrames = [];

function showTutorial(cb) {
  tutorialStep = 0;
  document.getElementById('tutorial').classList.add('visible');
  updateTutorialStep();
  startTutorialAnims();
  window._tutCb = cb;
}
function nextTutStep() {
  tutorialStep++;
  if (tutorialStep >= 4) { closeTutorial(); return; }
  updateTutorialStep();
}
function updateTutorialStep() {
  document.querySelectorAll('.tutorial-step').forEach((el,i) => el.classList.toggle('active', i===tutorialStep));
}
function closeTutorial() {
  document.getElementById('tutorial').classList.remove('visible');
  tutorialShown = true;
  try { localStorage.setItem('tutDone', '1'); } catch(_) {}
  tutAnimFrames.forEach(id => cancelAnimationFrame(id)); tutAnimFrames = [];
  if (window._tutCb) { window._tutCb(); window._tutCb = null; }
}
function startTutorialAnims() {
  animTut('tutMove', (cx,t) => {
    const px = 80+Math.sin(t)*35, py = 80+Math.sin(t*2)*20;
    for (let i=0;i<5;i++) {
      const tt=t-i*0.08; cx.globalAlpha=0.15-i*0.025; cx.strokeStyle='#00ff41'; cx.lineWidth=1.5;
      cx.beginPath(); cx.arc(80+Math.sin(tt)*35, 80+Math.sin(tt*2)*20, 12, 0, Math.PI*2); cx.stroke();
    }
    cx.globalAlpha=1; cx.strokeStyle='#00ff41'; cx.shadowColor='#00ff41'; cx.shadowBlur=8; cx.lineWidth=2;
    cx.beginPath(); cx.arc(px,py,12,0,Math.PI*2); cx.stroke();
    cx.shadowBlur=0; cx.fillStyle='#00ff4160'; cx.beginPath(); cx.arc(px+5,py+18,8,0,Math.PI*2); cx.fill();
  });
  animTut('tutCollect', (cx,t) => {
    for (let i=0;i<3;i++) {
      cx.globalAlpha=0.8; cx.fillStyle='#00ff41'; cx.shadowColor='#00ff41'; cx.shadowBlur=6;
      cx.font='20px Share Tech Mono'; cx.textAlign='center';
      cx.fillText(CHARS[(i*7)%CHARS.length], 50+i*30, ((t*60+i*55)%180)-10);
    }
    cx.shadowBlur=0; cx.globalAlpha=1; cx.strokeStyle='#00ff41'; cx.shadowColor='#00ff41'; cx.shadowBlur=6; cx.lineWidth=2;
    cx.beginPath(); cx.arc(80,130,12,0,Math.PI*2); cx.stroke();
    cx.shadowBlur=0; cx.globalAlpha=(Math.sin(t*2)+1)/2; cx.fillStyle='#00ff41'; cx.font='bold 14px Orbitron'; cx.textAlign='center'; cx.fillText('+10',80,100);
  });
  animTut('tutDodge', (cx,t) => {
    const badX=80+Math.sin(t*3)*20, badY=(t*50)%160;
    cx.globalAlpha=0.9; cx.fillStyle='#ff3333'; cx.shadowColor='#ff3333'; cx.shadowBlur=8;
    cx.font='22px Share Tech Mono'; cx.textAlign='center'; cx.fillText('ダ',badX,badY);
    cx.shadowBlur=0; cx.globalAlpha=1;
    const px=80-Math.sin(t*3)*25;
    cx.strokeStyle='#00ff41'; cx.shadowColor='#00ff41'; cx.shadowBlur=6; cx.lineWidth=2;
    cx.beginPath(); cx.arc(px,120,12,0,Math.PI*2); cx.stroke();
    cx.shadowBlur=0; cx.globalAlpha=(Math.sin(t*5)+1)/2*0.4;
    cx.strokeStyle='#ffaa00'; cx.lineWidth=1.5; cx.setLineDash([3,3]);
    cx.beginPath(); cx.arc(px,120,28,0,Math.PI*2); cx.stroke(); cx.setLineDash([]);
    cx.globalAlpha=(Math.sin(t*4)+1)/2; cx.fillStyle='#ffaa00'; cx.shadowColor='#ffaa00'; cx.shadowBlur=4;
    cx.font='bold 11px Orbitron'; cx.fillText('CLOSE! +25',px,85); cx.shadowBlur=0;
  });
  animTut('tutSlow', (cx,t) => {
    const sf=(Math.sin(t*2)+1)/2;
    if (sf>0.5) { cx.fillStyle='rgba(0,255,65,0.05)'; cx.fillRect(0,0,160,160); }
    const speed = sf > 0.5 ? 15 : 50;
    for (let i=0;i<4;i++) {
      cx.globalAlpha=0.6; cx.fillStyle = i%2===0 ? '#ff3333' : '#00ff41';
      cx.font='16px Share Tech Mono'; cx.textAlign='center';
      cx.fillText(CHARS[(i*11)%CHARS.length], 30+i*33, ((t*speed+i*45)%180)-10);
    }
    const tp=(Math.sin(t*6)+1)/2;
    cx.globalAlpha=0.3+tp*0.4; cx.fillStyle='#00ff41';
    cx.beginPath(); cx.arc(80,140,10+tp*3,0,Math.PI*2); cx.fill();
    cx.globalAlpha=0.7; cx.font='bold 9px Orbitron'; cx.fillText('×2 TAP',80,144);
  });
}
function animTut(id, drawFn) {
  const c = document.getElementById(id); if (!c) return;
  const cx = c.getContext('2d'); let t = 0;
  (function draw() {
    cx.clearRect(0,0,160,160); t += 0.03; cx.globalAlpha = 1;
    drawFn(cx, t);
    cx.globalAlpha = 1;
    const fid = requestAnimationFrame(draw); tutAnimFrames.push(fid);
  })();
}

// ─── START ───
function startGame() {
  document.getElementById('titleScreen').classList.add('hidden');
  document.getElementById('gameOver').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  document.getElementById('slowMoBar').classList.remove('hidden');
  document.getElementById('slowMoLabel').classList.remove('hidden');
  gc.classList.remove('hidden');
  initAudio(); resizeGame();
  window.addEventListener('resize', resizeGame);
  entities=[]; particles=[]; score=0; combo=0; maxCombo=0; lives=MAX_LIVES;
  difficulty=0; spawnTimer=0; slowMo=false; slowMoEnergy=100; slowMoCooldown=0;
  totalCollected=0; totalDodged=0; totalNearMisses=0; gameRunning=true;
  lastTime=performance.now(); gameStartTime=performance.now(); sessionSlowMoMs=0; slowMoStartTime=0; paused=false;
  shakeTimer=0; shakeIntensity=0;
  currentWave=0; waveTimer=0; wavePhase='announce'; announceTimer=0;
  breatherTimer=0; waveGlyphsSpawned=0; wavesCompleted=0;
  playerTrail=[];
  initPlayer(); updateLivesUI();
  CG.gameplayStart();
  CG.getScore().then(v => { if (v !== null && v > highScore) highScore = v; });

  if (!tutorialShown) {
    showTutorial(() => {
      announceWave(0); announceTimer = 2.5;
      lastTime = performance.now();
      requestAnimationFrame(gameLoop);
    });
  } else {
    announceWave(0); announceTimer = 2.5;
    requestAnimationFrame(gameLoop);
  }
}

// ─── PLAYER TRAIL ───
function updatePlayerTrail() {
  const dx = player.x - player.prevX, dy = player.y - player.prevY;
  const speed = Math.sqrt(dx*dx + dy*dy);
  if (speed > PLAYER_TRAIL_SPEED_THRESHOLD) {
    playerTrail.push({ x:player.x, y:player.y, alpha:0.6, size:player.size*(0.3+Math.min(speed/20,0.5)) });
  }
  for (let i=playerTrail.length-1; i>=0; i--) {
    playerTrail[i].alpha -= 0.04;
    if (playerTrail[i].alpha <= 0) playerTrail.splice(i, 1);
  }
  if (playerTrail.length > PLAYER_TRAIL_MAX) playerTrail.splice(0, playerTrail.length - PLAYER_TRAIL_MAX);
}

// ─── GAME LOOP ───
function gameLoop(now) {
  if (!gameRunning || paused) return;
  const rawDt = (now - lastTime) / 1000; lastTime = now;
  const dt = Math.min(rawDt, 0.05);
  const timeScale = slowMo ? 0.3 : 1;
  elapsed = dt * timeScale;
  update(elapsed, dt);
  if (shakeTimer > 0) shakeTimer -= dt;
  render();
  requestAnimationFrame(gameLoop);
}

function update(dt, realDt) {
  // Wave phases
  if (wavePhase === 'announce') {
    announceTimer -= realDt;
    if (announceTimer <= 0) { wavePhase = 'active'; waveTimer = 0; waveGlyphsSpawned = 0; }
    updateCommon(dt, realDt); return;
  }
  if (wavePhase === 'breather') {
    breatherTimer -= realDt;
    if (breatherTimer <= 0) {
      hideBreather(); currentWave++; wavePhase = 'announce'; announceTimer = 2.5;
      announceWave(currentWave);
    }
    updateCommon(dt, realDt); return;
  }

  // Active wave
  const w = getWave(currentWave);
  waveTimer += realDt;
  difficulty = currentWave + (waveTimer / w.dur) * 0.5;

  if (waveTimer >= w.dur) {
    wavePhase = 'breather'; breatherTimer = w.br; wavesCompleted++;
    showBreather(w.br);
    if (lives < MAX_LIVES) { lives++; updateLivesUI(); emitParticles(player.x, player.y, '#00ff41', 12); }
    return;
  }

  // Slow-mo
  if (slowMo) { slowMoEnergy = Math.max(0, slowMoEnergy - realDt*35); if (slowMoEnergy<=0) { if(slowMoStartTime){sessionSlowMoMs+=performance.now()-slowMoStartTime;slowMoStartTime=0;} slowMo=false; } }
  else { slowMoEnergy = Math.min(100, slowMoEnergy + realDt*8); }
  if (slowMoCooldown > 0) slowMoCooldown -= realDt;
  document.getElementById('slowMoFill').style.width = slowMoEnergy+'%';

  // Player
  const ease = 0.15;
  player.prevX = player.x; player.prevY = player.y;
  player.x += (player.targetX - player.x) * ease;
  player.y += (player.targetY - player.y) * ease;
  player.x = Math.max(player.size, Math.min(W-player.size, player.x));
  player.y = Math.max(player.size, Math.min(H-player.size, player.y));
  player.glowPhase += dt * 4;
  player.orbitPhase += dt * (combo > 5 ? 3.5 : 2);
  if (slowMo) { player.radarRing += dt * 1.5; if (player.radarRing > 1) player.radarRing = 0; } else { player.radarRing = 0; }
  updatePlayerTrail();

  // Spawning
  spawnTimer += dt;
  if (spawnTimer >= w.sr) { spawnTimer = 0; spawnGlyph(); if (Math.random() < 0.04) spawnPowerUp(); }

  // Entities
  updateEntities(dt, realDt);

  // Particles
  for (let i=particles.length-1;i>=0;i--) {
    const p=particles[i]; p.x+=p.vx*60*dt; p.y+=p.vy*60*dt; p.vy+=2*dt; p.life-=dt;
    if (p.life<=0) particles.splice(i,1);
  }

  // HUD
  document.getElementById('scoreDisplay').textContent = Math.floor(score);
  document.getElementById('comboDisplay').textContent = combo > 1 ? `x${combo} COMBO` : '';
}

function updateCommon(dt, realDt) {
  // Shared update for announce/breather phases
  if (slowMo) { slowMoEnergy = Math.max(0, slowMoEnergy - realDt*35); if (slowMoEnergy<=0) { if(slowMoStartTime){sessionSlowMoMs+=performance.now()-slowMoStartTime;slowMoStartTime=0;} slowMo=false; } }
  else { slowMoEnergy = Math.min(100, slowMoEnergy + realDt*8); }
  if (slowMoCooldown > 0) slowMoCooldown -= realDt;
  document.getElementById('slowMoFill').style.width = slowMoEnergy+'%';

  const ease = 0.15;
  player.prevX = player.x; player.prevY = player.y;
  player.x += (player.targetX - player.x) * ease;
  player.y += (player.targetY - player.y) * ease;
  player.x = Math.max(player.size, Math.min(W-player.size, player.x));
  player.y = Math.max(player.size, Math.min(H-player.size, player.y));
  player.glowPhase += dt * 4;
  player.orbitPhase += dt * (combo > 5 ? 3.5 : 2);
  if (slowMo) { player.radarRing += dt * 1.5; if (player.radarRing > 1) player.radarRing = 0; } else { player.radarRing = 0; }
  updatePlayerTrail();

  updateEntities(dt, realDt);
  for (let i=particles.length-1;i>=0;i--) {
    const p=particles[i]; p.x+=p.vx*60*dt; p.y+=p.vy*60*dt; p.vy+=2*dt; p.life-=dt;
    if (p.life<=0) particles.splice(i,1);
  }
  document.getElementById('scoreDisplay').textContent = Math.floor(score);
  document.getElementById('comboDisplay').textContent = combo > 1 ? `x${combo} COMBO` : '';
}

function updateEntities(dt, realDt) {
  for (let i=entities.length-1; i>=0; i--) {
    const e = entities[i];
    e.wobble += e.wobbleSpeed * dt;
    e.y += e.speed * 60 * dt;
    e.x += Math.sin(e.wobble) * e.wobbleAmp * dt;
    if (e.type === 'power') e.pulsePhase = (e.pulsePhase||0) + dt*5;

    // Splitter
    if (e.isSplitter && !e.hasSplit && e.y > H*0.45) {
      e.hasSplit = true; splitEntity(e); entities.splice(i,1); continue;
    }

    // Trail
    e.trail.push({x:e.x, y:e.y, alpha:0.5});
    if (e.trail.length > 6) e.trail.shift();
    e.trail.forEach(t => t.alpha *= 0.9);

    // Off screen
    if (e.y > H + 50) {
      if (e.type === 'bad') totalDodged++;
      entities.splice(i,1); continue;
    }

    // Collision
    const d = dist(e, player);
    const hitDist = player.size + e.size * 0.6;

    if (d < hitDist) {
      if (e.type === 'good') {
        score += 10 * (1 + combo * 0.5); combo++; maxCombo = Math.max(maxCombo, combo);
        totalCollected++; emitParticles(e.x, e.y, '#00ff41', 8);
        flash('collect'); sfxCollect(); if (combo > 1) sfxCombo();
        if (combo > 0 && combo % 10 === 0) CG.happytime();
      } else if (e.type === 'power') {
        slowMoEnergy = 100; score += 50;
        emitParticles(e.x, e.y, '#00ffff', 15); flash('collect'); sfxPowerUp();
      } else {
        lives--; combo = 0; updateLivesUI();
        emitParticles(e.x, e.y, '#ff3333', 20); flash('hit'); vibrate(100); sfxHit(); screenShake();
        if (lives <= 0) { sfxDeath(); gameOver(); return; }
      }
      entities.splice(i,1);
    }
    // Near-miss (once per entity)
    else if (e.type === 'bad' && !e.nearMissed) {
      const nearDist = hitDist * NEAR_MISS_RADIUS;
      if (d < nearDist && d >= hitDist) {
        e.nearMissed = true;
        score += NEAR_MISS_SCORE; totalNearMisses++;
        emitNearMissParticles(e.x, e.y);
        showNearMissText(e.x, e.y, NEAR_MISS_SCORE);
        flash('nearmiss'); sfxNearMiss();
      }
    }
  }
}

// ─── RENDER ───
function render() {
  ctx.clearRect(0,0,W,H);

  // Screen shake offset
  let shakeX = 0, shakeY = 0;
  if (shakeTimer > 0) {
    const progress = shakeTimer / 0.22; // 1 at start, 0 at end
    const mag = shakeIntensity * progress;
    shakeX = (Math.random() - 0.5) * 2 * mag;
    shakeY = (Math.random() - 0.5) * 2 * mag;
    ctx.save();
    ctx.translate(shakeX, shakeY);
  }

  const vg = ctx.createRadialGradient(W/2,H/2,H*0.2,W/2,H/2,H*0.8);
  vg.addColorStop(0,'transparent'); vg.addColorStop(1,'rgba(0,0,0,0.6)');
  ctx.fillStyle=vg; ctx.fillRect(0,0,W,H);
  if (slowMo) { ctx.fillStyle='rgba(0,255,65,0.03)'; ctx.fillRect(0,0,W,H); }

  // Entities
  for (const e of entities) {
    for (const t of e.trail) {
      ctx.globalAlpha = t.alpha * 0.15;
      ctx.fillStyle = e.type==='bad'?'#ff3333':e.type==='power'?'#00ffff':'#00ff41';
      ctx.font = `${e.size}px Share Tech Mono`; ctx.textAlign='center';
      ctx.fillText(e.char, t.x, t.y);
    }
    ctx.globalAlpha = e.alpha;
    if (e.type==='bad') {
      ctx.fillStyle='#ff3333'; ctx.shadowColor=e.isSplitter?'#ff6633':'#ff3333';
      ctx.shadowBlur=e.isSplitter?14:8;
    } else if (e.type==='power') {
      const pulse=0.7+Math.sin(e.pulsePhase)*0.3;
      ctx.fillStyle=`rgba(0,255,255,${pulse})`; ctx.shadowColor='#00ffff'; ctx.shadowBlur=15;
    } else {
      ctx.fillStyle='#00ff41'; ctx.shadowColor='#00ff41'; ctx.shadowBlur=6;
    }
    ctx.font=`bold ${e.size}px Share Tech Mono`; ctx.textAlign='center';
    ctx.fillText(e.char, e.x, e.y); ctx.shadowBlur=0;
  }

  // Particles
  for (const p of particles) {
    const a = p.life/p.maxLife; ctx.globalAlpha=a; ctx.fillStyle=p.color;
    if (p.char) { ctx.font=`${p.size*4}px Share Tech Mono`; ctx.textAlign='center'; ctx.fillText(p.char,p.x,p.y); }
    else { ctx.beginPath(); ctx.arc(p.x,p.y,p.size*a,0,Math.PI*2); ctx.fill(); }
  }

  // Near-miss ring
  let closestBad = Infinity;
  for (const e of entities) { if (e.type==='bad') { const d=dist(e,player); if(d<closestBad) closestBad=d; } }
  const nzo = (player.size+25)*NEAR_MISS_RADIUS;
  if (closestBad < nzo*1.5) {
    const prox = 1 - Math.min(closestBad/(nzo*1.5), 1);
    ctx.globalAlpha = prox*0.25; ctx.strokeStyle='#ffaa00'; ctx.lineWidth=1;
    ctx.setLineDash([4,4]); ctx.beginPath(); ctx.arc(player.x,player.y,nzo,0,Math.PI*2); ctx.stroke(); ctx.setLineDash([]);
  }

  // Player trail (ghostly echoes)
  for (const t of playerTrail) {
    ctx.globalAlpha = t.alpha * 0.35;
    ctx.strokeStyle = '#00ff41'; ctx.shadowColor = '#00ff41'; ctx.shadowBlur = t.alpha * 6; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(t.x, t.y, t.size, 0, Math.PI*2); ctx.stroke();
    ctx.fillStyle = `rgba(0,255,65,${t.alpha*0.2})`;
    ctx.beginPath(); ctx.arc(t.x, t.y, t.size*0.5, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;
  }

  // Player — layered geometry avatar
  ctx.globalAlpha=1;
  const px=player.x, py=player.y, ps=player.size, gp=player.glowPhase, op=player.orbitPhase;
  const comboBoost = combo > 5 ? 1 : 0;
  const baseGlow = 8 + Math.sin(gp)*4 + comboBoost*6;

  // Slow-mo radar ping
  if (slowMo && player.radarRing > 0) {
    const rr = player.radarRing;
    ctx.globalAlpha = (1-rr)*0.35;
    ctx.strokeStyle='#00ff41'; ctx.shadowColor='#00ff41'; ctx.shadowBlur=6; ctx.lineWidth=1.5*(1-rr);
    ctx.beginPath(); ctx.arc(px,py, ps + rr*40, 0, Math.PI*2); ctx.stroke();
    ctx.shadowBlur=0; ctx.globalAlpha=1;
  }

  // Pulsing double outer ring
  const outerW = 1.5 + Math.sin(gp)*0.6;
  const innerW = 1.5 + Math.sin(gp+Math.PI)*0.6;
  ctx.shadowColor='#00ff41'; ctx.shadowBlur=baseGlow;
  ctx.strokeStyle='#00ff4190'; ctx.lineWidth=outerW;
  ctx.beginPath(); ctx.arc(px,py, ps+3, 0, Math.PI*2); ctx.stroke();
  ctx.strokeStyle='#00ff4160'; ctx.lineWidth=innerW;
  ctx.beginPath(); ctx.arc(px,py, ps-1, 0, Math.PI*2); ctx.stroke();

  // Dual counter-rotating hexagons
  const drawHex = (cx,cy,r,rot,fill,stroke,lw) => {
    ctx.beginPath();
    for (let i=0;i<6;i++) { const a=(Math.PI/3)*i+rot; const hx=cx+Math.cos(a)*r, hy=cy+Math.sin(a)*r; i===0?ctx.moveTo(hx,hy):ctx.lineTo(hx,hy); }
    ctx.closePath();
    if (fill) { ctx.fillStyle=fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle=stroke; ctx.lineWidth=lw||1; ctx.stroke(); }
  };
  ctx.shadowBlur=baseGlow*0.7;
  drawHex(px,py, ps*0.78, gp*0.3, '#00ff4118', '#00ff4150', 1);
  ctx.shadowBlur=baseGlow;
  drawHex(px,py, ps*0.48, -gp*0.5, '#00ff4130', '#00ff41a0', 1.2);

  // Orbiting energy dots with ghost trails
  const dotCount=3, dotR=2.2, orbitR=ps*1.25;
  for (let d=0;d<dotCount;d++) {
    const baseAngle = op*(1.2+d*0.4) + (Math.PI*2/dotCount)*d;
    const dr = orbitR + Math.sin(gp+d*2)*2;
    // Ghost trail (3 positions)
    for (let t=2;t>=0;t--) {
      const trailAngle = baseAngle - t*0.18;
      const tx=px+Math.cos(trailAngle)*dr, ty=py+Math.sin(trailAngle)*dr;
      ctx.globalAlpha = (1-t*0.3) * (0.3+comboBoost*0.2);
      ctx.fillStyle='#00ff41'; ctx.shadowBlur=4+comboBoost*4;
      ctx.beginPath(); ctx.arc(tx,ty, dotR*(1-t*0.2), 0, Math.PI*2); ctx.fill();
    }
  }
  ctx.globalAlpha=1;

  // Glowing pulsing core
  const coreR = 2.5 + Math.sin(gp*1.5)*1.2 + comboBoost*0.8;
  ctx.fillStyle='#00ff41'; ctx.shadowColor='#00ff41'; ctx.shadowBlur=12+comboBoost*6;
  ctx.beginPath(); ctx.arc(px,py, coreR, 0, Math.PI*2); ctx.fill();

  // Crosshair through center
  const chLen=ps*0.3;
  ctx.strokeStyle='#00ff4170'; ctx.lineWidth=0.8; ctx.shadowBlur=0;
  ctx.beginPath(); ctx.moveTo(px-chLen,py); ctx.lineTo(px+chLen,py); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(px,py-chLen); ctx.lineTo(px,py+chLen); ctx.stroke();

  ctx.shadowBlur=0; ctx.globalAlpha=1;

  // End screen shake
  if (shakeTimer > 0) { ctx.restore(); }
}

// ─── GAME OVER ───
function gameOver() {
  gameRunning=false; CG.gameplayStop(); hideBreather();
  document.getElementById('hud').classList.add('hidden');
  document.getElementById('slowMoBar').classList.add('hidden');
  document.getElementById('slowMoLabel').classList.add('hidden');
  gc.classList.add('hidden');

  const fs = Math.floor(score);
  const isNewBest = fs > highScore && highScore > 0;
  document.getElementById('finalScore').textContent = fs;
  document.getElementById('finalStats').innerHTML =
    `GLYPHS COLLECTED: ${totalCollected}<br>THREATS DODGED: ${totalDodged}<br>NEAR MISSES: ${totalNearMisses}<br>WAVES SURVIVED: ${wavesCompleted}<br>MAX COMBO: x${maxCombo}`;

  if (fs > highScore) { highScore = fs; CG.saveScore(highScore); }
  document.getElementById('highScoreDisplay').textContent = highScore > 0 ? `HIGH SCORE: ${highScore}` : '';

  // New best badge
  const badge = document.getElementById('newBestBadge');
  const sparks = document.getElementById('newBestParticles');
  badge.classList.toggle('hidden', !isNewBest);
  sparks.innerHTML = '';

  commitSessionStats();

  setTimeout(() => {
    document.getElementById('gameOver').classList.remove('hidden');
    if (isNewBest) {
      sfxNewBest();
      CG.happytime();
      // Spawn celebration sparks
      for (let i = 0; i < 20; i++) {
        const spark = document.createElement('div');
        spark.className = 'new-best-spark';
        const x = 30 + Math.random() * 40;
        const y = 15 + Math.random() * 25;
        const dx = (Math.random() - 0.5) * 120;
        const dy = -(30 + Math.random() * 80);
        const dur = 0.6 + Math.random() * 0.8;
        spark.style.cssText = `--x:${x}%;--y:${y}%;--dx:${dx}px;--dy:${dy}px;--dur:${dur}s;animation-delay:${Math.random()*0.4}s`;
        sparks.appendChild(spark);
      }
      setTimeout(() => sparks.innerHTML = '', 2000);
    }
    setTimeout(() => {
      CG.showAd('midgame', {
        adStarted: () => { if(audioCtx) audioCtx.suspend(); },
        adFinished: () => { if(audioCtx) audioCtx.resume(); },
        adError: () => { if(audioCtx) audioCtx.resume(); },
      });
    }, 1500);
  }, 300);
}

window.addEventListener('keydown', e => {
  if (['ArrowUp','ArrowDown',' '].includes(e.key)) e.preventDefault();
  if ((e.key === 'p' || e.key === 'P') && gameRunning) togglePause();
});
CG.getScore().then(v => { if (v !== null) highScore = v; });
