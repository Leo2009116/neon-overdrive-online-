// ============================================================
// NEON OVERDRIVE ONLINE // engine.js
// 核心模擬、渲染、輸入
// ============================================================

let state = "MENU";
let returnToPause = false;
let resumePlayOnClose = false;

function syncBodyStateAttr() { document.body.setAttribute("data-state", state); }

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true }) || canvas.getContext("2d");
let dpr = Math.min(window.devicePixelRatio || 1, 3);
let W = window.innerWidth, H = window.innerHeight;

function resizeCanvas() {
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);
window.addEventListener("orientationchange", () => setTimeout(resizeCanvas, 200));

const MAP_BORDER_PAD = 4;

function clampToMap(val, radius = 0) {
  const min = radius + MAP_BORDER_PAD;
  const max = MAP_SIZE - radius - MAP_BORDER_PAD;
  return Math.max(min, Math.min(max, val));
}

function getCameraPos() {
  if (!player) return { x: 0, y: 0 };
  let camX = Math.max(0, Math.min(MAP_SIZE - W, player.x - W / 2));
  let camY = Math.max(0, Math.min(MAP_SIZE - H, player.y - H / 2));
  if (W >= MAP_SIZE) camX = (MAP_SIZE - W) / 2;
  if (H >= MAP_SIZE) camY = (MAP_SIZE - H) / 2;
  return { x: camX, y: camY };
}

function screenToWorld(clientX, clientY) {
  const cam = getCameraPos();
  return { x: cam.x + clientX, y: cam.y + clientY };
}

function drawPolygonPath(c, sides, radius, rotation = 0) {
  c.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rotation + (i * Math.PI * 2) / sides;
    const x = Math.cos(a) * radius, y = Math.sin(a) * radius;
    if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
  }
  c.closePath();
}

function getBuildingAccentColor(type, diyTurretColor) {
  switch (type) {
    case "TURRET": return diyTurretColor || "#ff0055";
    case "TESLA": return "#00f3ff";
    case "HEAL": return "#00ff9d";
    case "MINER": return "#ffee00";
    case "WALL": return "#38bdf8";
    case "VORTEX": return "#b829ff";
    default: return "#00f3ff";
  }
}

function getBuildingRange(type) {
  switch (type) {
    case "TURRET": return 260;
    case "TESLA": return 180;
    case "HEAL": return 160;
    case "MINER": return 90;
    case "WALL": return 48;
    case "VORTEX": return 180;
    default: return 150;
  }
}

function renderBuilding(c, b, diyShape = "HEX", diyTurretColor = "#00ff9d", lowGlow = false) {
  if (window.NeonDecor && window.NeonDecor.renderBuilding) {
    return window.NeonDecor.renderBuilding(c, b, diyShape, diyTurretColor, lowGlow);
  }
  const accent = b.hitFlash > 0 ? "#ffffff" : getBuildingAccentColor(b.type, diyTurretColor);
  const sides = diyShape === "OCTA" ? 8 : diyShape === "TRI" ? 3 : 6;
  const baseRadius = b.r || 20;
  const baseRot = sides === 3 ? -Math.PI / 2 : sides === 8 ? Math.PI / 8 : 0;
  c.save();
  c.translate(b.x, b.y);
  c.scale(1, 0.9);
  drawPolygonPath(c, sides, baseRadius, baseRot);
  c.fillStyle = "#060a14"; c.fill();
  c.strokeStyle = accent; c.lineWidth = 2; c.stroke();
  c.restore();
}

function renderBulletShape(c, b) {
  c.save();
  c.translate(b.x, b.y);
  const angle = Math.atan2(b.vy, b.vx);

  if (b.shape === "LASER") {
    c.rotate(angle);
    c.fillStyle = b.color;
    c.fillRect(-b.r * 2.2, -b.r * 0.45, b.r * 4.4, b.r * 0.9);
    c.fillStyle = "#fff";
    c.fillRect(-b.r * 1.6, -b.r * 0.18, b.r * 3.2, b.r * 0.36);
  } else if (b.shape === "STAR") {
    c.rotate(angle);
    drawPolygonPath(c, 4, b.r * 1.4, 0);
    c.fillStyle = b.color; c.fill();
  } else if (b.shape === "DIAMOND") {
    c.rotate(angle);
    c.beginPath();
    c.moveTo(b.r * 1.5, 0); c.lineTo(0, b.r * 0.85);
    c.lineTo(-b.r * 1.5, 0); c.lineTo(0, -b.r * 0.85);
    c.closePath();
    c.fillStyle = b.color; c.fill();
  } else if (b.shape === "HEART") {
    c.fillStyle = b.color;
    c.beginPath();
    c.arc(-b.r * 0.38, -b.r * 0.35, b.r * 0.65, Math.PI, 0);
    c.arc(b.r * 0.38, -b.r * 0.35, b.r * 0.65, Math.PI, 0);
    c.lineTo(0, b.r * 1.15);
    c.closePath(); c.fill();
  } else {
    c.fillStyle = b.color;
    c.beginPath(); c.arc(0, 0, b.r, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#fff";
    c.beginPath(); c.arc(0, 0, b.r * 0.45, 0, Math.PI * 2); c.fill();
  }
  c.restore();
}

let player = null;
let bullets = [], enemyBullets = [], missiles = [], enemies = [], gems = [];
let supplyCrates = [], blackHoles = [], particles = [], floatTexts = [], shockwaves = [], lightningBolts = [], afterimages = [];
// ★ 多人模式專用（全域共用，讓 multiplayer.js 存取）
let obstacles = [];
let score = 0, runCoins = 0, bankedCoins = 0, wave = 1, waveTimer = 0, spawnTimer = 0, crateTimer = 0;
let screenShake = 0, revivedThisRun = false, doubledThisRun = false;
let slowmoTick = 0;
let timeScale = 1;

let selectedBuildingType = null;
let buildCoins = 100;
let buildingsBuiltThisRun = 0;
let buildings = [];
let currentChoices = [];

const touchJoy = { active: false, id: null, startX: 0, startY: 0, curX: 0, curY: 0, dx: 0, dy: 0 };
const mouseWorldPos = { x: MAP_SIZE / 2, y: MAP_SIZE / 2, active: false };
const keys = {};

function resetJoystick() {
  touchJoy.active = false; touchJoy.id = null; touchJoy.dx = 0; touchJoy.dy = 0;
}

function isPointInsideHud(clientX, clientY) {
  const hudEls = document.querySelectorAll("#hud .hud-group, #active-skills-hud, #god-panel, #god-penalty-banner, #build-fab-wrap, #build-radial, #mp-hud");
  for (let i = 0; i < hudEls.length; i++) {
    const el = hudEls[i];
    if (!el.classList.contains("hidden") && el.offsetParent !== null) {
      const rect = el.getBoundingClientRect();
      if (clientX >= rect.left - 8 && clientX <= rect.right + 8 &&
          clientY >= rect.top - 8 && clientY <= rect.bottom + 8) return true;
    }
  }
  return false;
}

window.addEventListener("keydown", e => {
  keys[e.code] = true;
  if (state !== "PLAY") return;

  if (e.code === "Space") { e.preventDefault(); openTeleportGrid(); }
  if (e.code === "KeyJ") { e.preventDefault(); ParrySys.start(); }
  if (e.code === "KeyE") { e.preventDefault(); triggerOverdriveBurst(); }
  if (e.code === "Escape" && selectedBuildingType) selectBuildSlot(selectedBuildingType);

  const mapKey = { Digit1: "TURRET", Digit2: "TESLA", Digit3: "HEAL", Digit4: "MINER", Digit5: "WALL", Digit6: "VORTEX" };
  if (mapKey[e.code]) selectBuildSlot(mapKey[e.code]);
});
window.addEventListener("keyup", e => { keys[e.code] = false; });

canvas.addEventListener("contextmenu", e => {
  e.preventDefault();
  if (selectedBuildingType) selectBuildSlot(selectedBuildingType);
});
canvas.addEventListener("mousemove", e => {
  if (!player) return;
  const wPos = screenToWorld(e.clientX, e.clientY);
  mouseWorldPos.x = clampToMap(wPos.x, 24);
  mouseWorldPos.y = clampToMap(wPos.y, 24);
  mouseWorldPos.active = true;
});
canvas.addEventListener("mousedown", e => {
  if (state !== "PLAY") return;
  if (e.button === 2) { if (selectedBuildingType) selectBuildSlot(selectedBuildingType); return; }
  if (isPointInsideHud(e.clientX, e.clientY)) return;
  AudioSys.init();
  if (selectedBuildingType && player) {
    const wPos = screenToWorld(e.clientX, e.clientY);
    tryBuildAt(wPos.x, wPos.y);
    return;
  }
  touchJoy.active = true; touchJoy.id = "mouse";
  touchJoy.startX = e.clientX; touchJoy.startY = e.clientY;
  touchJoy.curX = e.clientX; touchJoy.curY = e.clientY;
  touchJoy.dx = 0; touchJoy.dy = 0;
});
window.addEventListener("mousemove", e => {
  if (!touchJoy.active || touchJoy.id !== "mouse") return;
  const dx = e.clientX - touchJoy.startX, dy = e.clientY - touchJoy.startY;
  const dist = Math.hypot(dx, dy), maxR = 48;
  touchJoy.dx = dist > 0 ? (dx / dist) * Math.min(1, dist / maxR) : 0;
  touchJoy.dy = dist > 0 ? (dy / dist) * Math.min(1, dist / maxR) : 0;
});
window.addEventListener("mouseup", () => { if (touchJoy.id === "mouse") resetJoystick(); });

canvas.addEventListener("touchstart", e => {
  if (state !== "PLAY") return;
  AudioSys.init();
  for (const tTouch of e.changedTouches) {
    if (isPointInsideHud(tTouch.clientX, tTouch.clientY)) continue;
    if (selectedBuildingType && player) {
      e.preventDefault();
      const wPos = screenToWorld(tTouch.clientX, tTouch.clientY);
      tryBuildAt(wPos.x, wPos.y);
      return;
    }
    if (!touchJoy.active) {
      e.preventDefault();
      touchJoy.active = true; touchJoy.id = tTouch.identifier;
      touchJoy.startX = tTouch.clientX; touchJoy.startY = tTouch.clientY;
      touchJoy.curX = tTouch.clientX; touchJoy.curY = tTouch.clientY;
      touchJoy.dx = 0; touchJoy.dy = 0;
    }
  }
}, { passive: false });

window.addEventListener("touchmove", e => {
  if (!touchJoy.active) return;
  for (const tTouch of e.changedTouches) {
    if (tTouch.identifier === touchJoy.id) {
      if (e.cancelable) e.preventDefault();
      const dx = tTouch.clientX - touchJoy.startX, dy = tTouch.clientY - touchJoy.startY;
      const dist = Math.hypot(dx, dy), maxR = 48;
      touchJoy.dx = dist > 0 ? (dx / dist) * Math.min(1, dist / maxR) : 0;
      touchJoy.dy = dist > 0 ? (dy / dist) * Math.min(1, dist / maxR) : 0;
    }
  }
}, { passive: false });

const endTouch = e => {
  for (const tTouch of e.changedTouches) {
    if (tTouch.identifier === touchJoy.id) resetJoystick();
  }
};
window.addEventListener("touchend", endTouch);
window.addEventListener("touchcancel", endTouch);

function updateBuildCoinsUI() {
  const el = document.getElementById("build-coins-txt");
  if (el) el.textContent = buildCoins;
}

function selectBuildSlot(type) {
  selectedBuildingType = selectedBuildingType === type ? null : type;
  document.querySelectorAll(".radial-slot").forEach(slot => {
    slot.classList.toggle("selected", slot.getAttribute("data-build") === selectedBuildingType);
  });
}

function tryBuildAt(worldX, worldY) {
  if (!selectedBuildingType || !player) return;
  const cost = (GodMode.zeroCooldown || GodMode.enabled) ? 0 : (BUILD_COSTS[selectedBuildingType] || 25);
  if (buildCoins < cost && !GodMode.infiniteBuildCoins) {
    AudioSys.playHit();
    addFloatText(player.x, player.y - 25, "⚠️ 建造幣不足！", "#ff0055");
    updateBuildCoinsUI();
    return;
  }
  if (!GodMode.infiniteBuildCoins) buildCoins -= cost;
  buildingsBuiltThisRun++;
  updateBuildCoinsUI();

  const bx = clampToMap(worldX, 36);
  const by = clampToMap(worldY, 36);
  const maxHp = selectedBuildingType === "WALL" ? 450 : 140;
  buildings.push({
    x: bx, y: by, type: selectedBuildingType,
    hp: maxHp, maxHp,
    r: selectedBuildingType === "WALL" ? 24 : 20,
    tick: 0, level: 1, aimAngle: -Math.PI / 2, recoil: 0, hitFlash: 0
  });
  AudioSys.playPowerup();
  addParticles(bx, by, getBuildingAccentColor(selectedBuildingType, SaveSys.data.diy.turretColor), 8);
  addFloatText(bx, by - 22, `+ ${selectedBuildingType}`, "#00ff9d");
  if (buildingsBuiltThisRun >= 10) AchievementSys.unlock("master_builder");
}

function teleportTo(i, j) {
  if (!player) return false;
  if (player.dashCd > 0 && !GodMode.zeroCooldown) {
    AudioSys.playHit();
    addFloatText(player.x, player.y - 26, "WARP COOLDOWN", "#ff0055");
    return false;
  }
  const cell = MAP_SIZE / GRID_DIV;
  const tx = clampToMap((i - 0.5) * cell, player.r);
  const ty = clampToMap((j - 0.5) * cell, player.r);

  addParticles(player.x, player.y, "#b829ff", 16);
  shockwaves.push({ x: player.x, y: player.y, r: 6, maxR: 130, color: "#b829ff", alpha: 0.9 });

  player.x = tx; player.y = ty;
  player.dashCd = GodMode.zeroCooldown ? 0 : player.dashMaxCd;
  player.dashActive = 14;

  AudioSys.playDash();
  addParticles(tx, ty, "#00f3ff", 22);
  shockwaves.push({ x: tx, y: ty, r: 8, maxR: 170, color: "#00f3ff", alpha: 0.95 });
  addFloatText(tx, ty - 32, `X${i}Z${j} WARP`, "#00f3ff");
  return true;
}

function getSelectedSkinObj() {
  return HULL_SKINS.find(s => s.id === SaveSys.data.selectedSkin) || HULL_SKINS[0];
}

function initRun() {
  const d = SaveSys.data;
  const skin = getSelectedSkinObj();

  buildCoins = 150;
  buildingsBuiltThisRun = 0;
  buildings = [];
  obstacles = [];
  updateBuildCoinsUI();

  player = {
    x: MAP_SIZE / 2, y: MAP_SIZE / 2, r: 16, angle: -Math.PI / 2, lastDirX: 0, lastDirY: -1,
    skinColor: skin.color,
    maxHp: 100 + (d.hpLvl || 0) * 25,
    hp: 100 + (d.hpLvl || 0) * 25,
    maxShield: (d.shieldLvl || 0) * 20,
    shield: (d.shieldLvl || 0) * 20,
    shieldRegenTick: 0,
    speed: 4.3 * (1 + (d.speedLvl || 0) * 0.08 + skin.spdBonus),
    dmg: 22 * (1 + (d.dmgLvl || 0) * 0.15 + skin.dmgBonus),
    critChance: 0.05 + (d.critLvl || 0) * 0.05, critMult: 2.2,
    fireDelay: 21, fireTick: 0,
    multishot: 1, pierce: 1, ricochet: 0, orbitals: 0, orbitalAngle: 0,
    teslaLvl: 0, missileLvl: 0, missileTick: 0, empLvl: 0, empTick: 0,
    droneLvl: 0, droneAngle: 0, droneTick: 0, vampLvl: 0,
    dashCd: 0, dashMaxCd: 300, dashActive: 0,
    burstCd: 0, burstMaxCd: 420,
    overdriveBuffTick: 0, magnetRadius: 150, xp: 0, nextXp: 10, lvl: 1, pendingUpgrades: 0
  };

  bullets = []; enemyBullets = []; missiles = []; enemies = []; gems = [];
  supplyCrates = []; blackHoles = []; particles = []; floatTexts = [];
  shockwaves = []; lightningBolts = []; afterimages = [];
  score = 0; runCoins = 0; bankedCoins = 0; wave = 1; waveTimer = 0; spawnTimer = 0; crateTimer = 0;
  revivedThisRun = false; doubledThisRun = false; returnToPause = false; resumePlayOnClose = false;
  GodMode.usedThisRun = false;
  ParrySys.active = 0; ParrySys.cd = 0;
  slowmoTick = 0; timeScale = 1;
  resetJoystick();

  document.getElementById("revive-ad-btn")?.classList.remove("hidden");
  document.getElementById("double-ad-btn")?.classList.remove("hidden");
  document.getElementById("hud")?.classList.remove("hidden");
  document.getElementById("build-fab-wrap")?.classList.remove("hidden");
  document.getElementById("active-skills-hud")?.classList.remove("hidden");
  document.getElementById("boss-hud")?.classList.add("hidden");

  GodMode.syncUI();
  updateHUD();
}

function bankUnbankedCoins() {
  const unbanked = Math.max(0, runCoins - bankedCoins);
  if (unbanked > 0 && !GodMode.isRewardBlocked()) {
    SaveSys.data.coins += unbanked;
    bankedCoins = runCoins;
  }
  if (wave > (SaveSys.data.bestWave || 1) && !GodMode.isRewardBlocked()) SaveSys.data.bestWave = wave;
  SaveSys.save();
}

function triggerOverdriveBurst() {
  if (!player || state !== "PLAY") return;
  if (player.burstCd > 0 && !GodMode.zeroCooldown) return;
  player.burstCd = GodMode.zeroCooldown ? 0 : player.burstMaxCd;
  AudioSys.playNova();
  screenShake = 12;
  shockwaves.push({ x: player.x, y: player.y, r: 15, maxR: 320, color: "#ff007f", alpha: 1 });
  enemyBullets = [];
  const burstDmg = getEffectivePlayerDmg() * 3.8;
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (Math.hypot(e.x - player.x, e.y - player.y) <= 330) {
      e.hp -= burstDmg;
      addParticles(e.x, e.y, "#ff007f", 6);
      addFloatText(e.x, e.y - 12, Math.round(burstDmg), "#ff0055");
      if (e.hp <= 0) handleEnemyDeath(e, i);
    }
  }
}

function getEffectivePlayerDmg() {
  if (GodMode.oneHitKill) return 9999999;
  return player.dmg * GodMode.dmgMult * (player.overdriveBuffTick > 0 ? 1.8 : 1);
}

function spawnEnemy(forceBoss = false) {
  const ang = Math.random() * Math.PI * 2;
  const dist = 650 + Math.random() * 300;
  const x = clampToMap(player.x + Math.cos(ang) * dist, 36);
  const y = clampToMap(player.y + Math.sin(ang) * dist, 36);

  if (forceBoss) {
    const hp = 700 + wave * 300;
    enemies.push({ x, y, r: 36, hp, maxHp: hp, speed: 1.15, color: "#ff0055", type: "BOSS", xpVal: 50, shootTick: 0, stunTick: 0, angle: 0 });
    return;
  }

  const roll = Math.random();
  let type = "CHASER", r = 14, hp = 30 + wave * 15,
      speed = 1.7 + Math.min(wave * 0.08, 1.8), color = "#ff0055", xpVal = 3;

  if (wave >= 2 && roll < 0.24) { type = "SPEEDER"; r = 11; hp = 18 + wave * 9; speed = 3.1 + Math.min(wave * 0.1, 2.0); color = "#ffee00"; xpVal = 4; }
  else if (wave >= 3 && roll >= 0.24 && roll < 0.4) { type = "SPLITTER"; r = 16; hp = 42 + wave * 16; speed = 1.55; color = "#00ff9d"; xpVal = 5; }
  else if (wave >= 4 && roll >= 0.4 && roll < 0.54) { type = "SNIPER"; r = 14; hp = 32 + wave * 13; speed = 1.35; color = "#00f3ff"; xpVal = 6; }
  else if (wave >= 3 && roll > 0.84) { type = "TANK"; r = 24; hp = 100 + wave * 48; speed = 1.05; color = "#b829ff"; xpVal = 10; }

  enemies.push({ x, y, r, hp, maxHp: hp, speed, color, type, xpVal, shootTick: Math.floor(Math.random() * 60), stunTick: 0, angle: 0 });
}

function addParticles(x, y, color, count = 6) {
  if (particles.length > 220) return;
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2;
    const spd = 1 + Math.random() * 4.5;
    particles.push({
      x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
      life: 1, decay: 0.035 + Math.random() * 0.025, color, size: 2 + Math.random() * 2.5
    });
  }
}

function addFloatText(x, y, txt, color = "#fff") {
  if (floatTexts.length > 40) floatTexts.shift();
  floatTexts.push({ x, y, txt: String(txt), color, life: 1, vy: -1.1 });
}

function triggerLevelUp() {
  if (state === "LEVEL_UP") return;
  state = "LEVEL_UP";
  syncBodyStateAttr();
  resetJoystick();
  AudioSys.playPowerup();
  rollUpgradeChoices();
  document.getElementById("levelup-overlay").classList.remove("hidden");
}

function rollUpgradeChoices() {
  const box = document.getElementById("upgrade-choices");
  box.innerHTML = "";
  const isEn = SaveSys.data.lang === "en";
  currentChoices = [...RUN_UPGRADES].sort(() => Math.random() - 0.5).slice(0, 3);
  currentChoices.forEach(u => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "card";
    card.innerHTML = `<div><h3>${isEn ? u.en : u.zh}</h3><p>${isEn ? u.descEn : u.descZh}</p></div><div class="price" style="color:var(--accent);">SELECT ➔</div>`;
    card.onclick = () => { u.apply(player); finishLevelUpStep(); };
    box.appendChild(card);
  });
}

function finishLevelUpStep() {
  player.pendingUpgrades = Math.max(0, player.pendingUpgrades - 1);
  if (player.pendingUpgrades > 0) rollUpgradeChoices();
  else {
    document.getElementById("levelup-overlay")?.classList.add("hidden");
    state = "PLAY";
    syncBodyStateAttr();
  }
  updateHUD();
}

function updateHUD() {
  if (!player) return;
  const setT = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  const setW = (id, v) => { const e = document.getElementById(id); if (e) e.style.width = v; };

  setT("hp-text", `${Math.ceil(player.hp)}/${player.maxHp}`);
  setW("hp-bar", `${Math.max(0, (player.hp / player.maxHp) * 100)}%`);
  setT("shield-text", `${Math.ceil(player.shield)}/${player.maxShield}`);
  setW("shield-bar", player.maxShield > 0 ? `${Math.max(0, (player.shield / player.maxShield) * 100)}%` : "0%");
  setT("lvl-text", player.lvl);
  setW("xp-bar", `${Math.min(100, (player.xp / player.nextXp) * 100)}%`);
  setT("wave-text", wave);
  setT("score-text", score);
  setT("coin-text", runCoins);

  const dashPct = player.dashCd / (player.dashMaxCd || 1) * 100;
  const dEl = document.getElementById("dash-cd-fill");
  if (dEl) dEl.style.height = `${dashPct}%`;
  const novaPct = player.burstCd / (player.burstMaxCd || 1) * 100;
  const nEl = document.getElementById("nova-cd-fill");
  if (nEl) nEl.style.height = `${novaPct}%`;
  const pPct = ParrySys.cd / (ParrySys.CD || 1) * 100;
  const pEl = document.getElementById("parry-cd-fill");
  if (pEl) pEl.style.height = `${pPct}%`;

  const activeBoss = enemies.find(e => e.type === "BOSS");
  const bossHud = document.getElementById("boss-hud");
  if (activeBoss) {
    bossHud.classList.remove("hidden");
    const bb = document.getElementById("boss-bar");
    if (bb) bb.style.width = `${Math.max(0, (activeBoss.hp / activeBoss.maxHp) * 100)}%`;
  } else if (bossHud) bossHud.classList.add("hidden");
}

function findNearestEnemy(x, y, maxDist = 9999, exclude = null) {
  let best = null, bestD = maxDist;
  for (const e of enemies) {
    if (e === exclude) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

// ============ 障礙物碰撞（多人模式） ============
function collideObstacles(entity, r) {
  if (!obstacles || obstacles.length === 0) return;
  for (const o of obstacles) {
    const d = Math.hypot(entity.x - o.x, entity.y - o.y);
    const minD = r + o.r;
    if (d < minD && d > 0.01) {
      const a = Math.atan2(entity.y - o.y, entity.x - o.x);
      entity.x = o.x + Math.cos(a) * minD;
      entity.y = o.y + Math.sin(a) * minD;
    }
  }
}

function pointInObstacle(x, y) {
  for (const o of obstacles) {
    if (Math.hypot(x - o.x, y - o.y) < o.r) return true;
  }
  return false;
}

function damagePlayer(amount) {
  if (GodMode.invincible || player.dashActive > 0) return;
  if (ParrySys.tryParry()) return;

  player.shieldRegenTick = 0;
  if (player.shield > 0) {
    const absorbed = Math.min(player.shield, amount);
    player.shield -= absorbed;
    amount -= absorbed;
  }
  if (amount > 0) {
    player.hp -= amount;
    screenShake = 7;
    AudioSys.playHit();
  }
  updateHUD();
  if (player.hp <= 0) { player.hp = 0; triggerGameOver(); }
}

function triggerGameOver() {
  state = "GAMEOVER";
  syncBodyStateAttr();
  resetJoystick();
  bankUnbankedCoins();
  const isEn = SaveSys.data.lang === "en";
  const gs = document.getElementById("go-stats-text");
  if (gs) gs.textContent = isEn
    ? `Survived until Wave ${wave} (Score: ${score})`
    : `你在第 ${wave} 波撐了下來（分數：${score}）`;
  const gc = document.getElementById("go-coins");
  if (gc) gc.textContent = runCoins;
  document.getElementById("gameover-overlay")?.classList.remove("hidden");
}

function handleEnemyDeath(e, index) {
  const realIdx = enemies.indexOf(e);
  if (realIdx >= 0) enemies.splice(realIdx, 1);

  AudioSys.playExplosion();
  addParticles(e.x, e.y, e.color, e.type === "BOSS" ? 18 : 6);
  score += e.xpVal * 10;
  AchievementSys.unlock("first_blood");
  if (e.type === "BOSS") { AchievementSys.unlock("boss_slayer"); screenShake = 12; }

  if (player.vampLvl > 0 && player.hp < player.maxHp) {
    player.hp = Math.min(player.maxHp, player.hp + player.vampLvl * 1.5);
  }

  const greedMult = 1 + (SaveSys.data.greedLvl || 0) * 0.2;
  const coinDrop = Math.max(1, Math.round((e.type === "BOSS" ? 45 : 3) * greedMult));
  buildCoins += e.type === "BOSS" ? 30 : 2;
  updateBuildCoinsUI();

  const gx = clampToMap(e.x, 8);
  const gy = clampToMap(e.y, 8);
  gems.push({ x: gx, y: gy, r: 5.5, type: "XP", val: e.xpVal });
  if (Math.random() < 0.58 || e.type === "BOSS") {
    gems.push({
      x: clampToMap(e.x + (Math.random() - 0.5) * 14, 8),
      y: clampToMap(e.y + (Math.random() - 0.5) * 14, 8),
      r: 6, type: "COIN", val: coinDrop
    });
  }
  if (e.type === "SPLITTER") {
    for (let k = 0; k < 2; k++) {
      enemies.push({
        x: clampToMap(e.x + (k === 0 ? -12 : 12), 9),
        y: clampToMap(e.y, 9),
        r: 9,
        hp: 15 + wave * 6, maxHp: 15 + wave * 6, speed: 2.5,
        color: "#00ff9d", type: "MINI", xpVal: 2, shootTick: 0, stunTick: 0, angle: 0
      });
    }
  }
}

function stepSimulation() {
  if (!player) return;

  if (GodMode.infiniteBuildCoins) {
    buildCoins = Math.max(buildCoins, 9999);
    updateBuildCoinsUI();
  }

  if (slowmoTick > 0) {
    slowmoTick--;
    if (slowmoTick === 0) timeScale = 1;
  }
  const ts = timeScale;

  let mx = 0, my = 0;
  if (keys["KeyW"] || keys["ArrowUp"]) my -= 1;
  if (keys["KeyS"] || keys["ArrowDown"]) my += 1;
  if (keys["KeyA"] || keys["ArrowLeft"]) mx -= 1;
  if (keys["KeyD"] || keys["ArrowRight"]) mx += 1;
  if (touchJoy.active) { mx = touchJoy.dx; my = touchJoy.dy; }

  if (mx === 0 && my === 0 && AfkSys.autoBattle) {
    let nearGem = null, minGD = 420;
    for (const g of gems) {
      const d = Math.hypot(g.x - player.x, g.y - player.y);
      if (d < minGD) { minGD = d; nearGem = g; }
    }
    const nearE = findNearestEnemy(player.x, player.y, 260);
    if (nearE && Math.hypot(nearE.x - player.x, nearE.y - player.y) < 160) {
      mx = player.x - nearE.x; my = player.y - nearE.y;
    } else if (nearGem) {
      mx = nearGem.x - player.x; my = nearGem.y - player.y;
    } else {
      mx = Math.cos(performance.now() * 0.001); my = Math.sin(performance.now() * 0.001);
    }
  }

  const len = Math.hypot(mx, my);
  if (len > 0) {
    const normX = mx / (len > 1 ? len : 1);
    const normY = my / (len > 1 ? len : 1);
    const spd = player.speed * (GodMode.speedMult || 1) * (player.dashActive > 0 ? 2.6 : 1);
    player.x = clampToMap(player.x + normX * spd, player.r);
    player.y = clampToMap(player.y + normY * spd, player.r);
    player.lastDirX = normX; player.lastDirY = normY;
    collideObstacles(player, player.r);
  }

  player.x = clampToMap(player.x, player.r);
  player.y = clampToMap(player.y, player.r);

  if (player.dashActive > 0) {
    player.dashActive--;
    if (player.dashActive % 2 === 0) afterimages.push({ x: player.x, y: player.y, angle: player.angle, alpha: 0.65 });
  }
  if (player.dashCd > 0) player.dashCd--;
  if (player.burstCd > 0) player.burstCd--;
  if (player.overdriveBuffTick > 0) player.overdriveBuffTick--;

  if (player.maxShield > 0 && player.shield < player.maxShield) {
    player.shieldRegenTick++;
    if (player.shieldRegenTick > 150) {
      player.shield = Math.min(player.maxShield, player.shield + 0.15);
      updateHUD();
    }
  }

  const target = findNearestEnemy(player.x, player.y, 680);
  if (target) player.angle = Math.atan2(target.y - player.y, target.x - player.x);
  else if (len > 0) player.angle = Math.atan2(player.lastDirY, player.lastDirX);

  player.fireTick++;
  const effDelay = player.overdriveBuffTick > 0 ? player.fireDelay * 0.55 : player.fireDelay;
  if (player.fireTick >= effDelay && target) {
    player.fireTick = 0;
    AudioSys.playShoot();
    const diy = SaveSys.data.diy;
    const count = player.multishot;
    const spread = 0.14;
    const baseAng = player.angle - ((count - 1) * spread) / 2;
    for (let i = 0; i < count; i++) {
      const a = baseAng + i * spread;
      bullets.push({
        x: player.x + Math.cos(a) * 16, y: player.y + Math.sin(a) * 16,
        vx: Math.cos(a) * 11, vy: Math.sin(a) * 11, baseAngle: a, speed: 11,
        r: 5 * (diy.bulletScale || 1), dmg: getEffectivePlayerDmg(),
        pierce: player.pierce, ricochet: player.ricochet,
        color: diy.bulletColor || "#00f3ff", shape: diy.bulletShape || "CIRCLE",
        traj: diy.bulletTraj || "STRAIGHT", tick: 0
      });
    }
  }

  const effDmg = getEffectivePlayerDmg();
  if (player.orbitals > 0) {
    player.orbitalAngle += 0.065;
    for (let i = 0; i < player.orbitals; i++) {
      const ang = player.orbitalAngle + (i * Math.PI * 2) / player.orbitals;
      const ox = player.x + Math.cos(ang) * 62, oy = player.y + Math.sin(ang) * 62;
      for (const e of enemies) {
        if (Math.hypot(e.x - ox, e.y - oy) < e.r + 12) e.hp -= effDmg * 0.22;
      }
    }
  }

  if (player.droneLvl > 0) {
    player.droneAngle += 0.05;
    const dx = player.x + Math.cos(player.droneAngle) * 45;
    const dy = player.y + Math.sin(player.droneAngle) * 45;
    player.droneTick++;
    if (player.droneTick > 25 && target) {
      player.droneTick = 0;
      const ang = Math.atan2(target.y - dy, target.x - dx);
      bullets.push({
        x: dx, y: dy, vx: Math.cos(ang) * 12, vy: Math.sin(ang) * 12,
        baseAngle: ang, speed: 12, r: 4, dmg: effDmg * 0.4,
        pierce: 1, ricochet: 0, color: "#ffee00", shape: "CIRCLE", traj: "STRAIGHT", tick: 0
      });
    }
  }

  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.tick++;
    if (b.traj === "WAVE") {
      const waveOffset = Math.sin(b.tick * 0.3) * 3;
      b.x += b.vx - Math.sin(b.baseAngle) * waveOffset;
      b.y += b.vy + Math.cos(b.baseAngle) * waveOffset;
    } else if (b.traj === "SPIRAL") {
      b.baseAngle += 0.1;
      b.x += Math.cos(b.baseAngle) * b.speed;
      b.y += Math.sin(b.baseAngle) * b.speed;
    } else {
      b.x += b.vx; b.y += b.vy;
    }

    if (pointInObstacle(b.x, b.y)) { bullets.splice(i, 1); continue; }

    let hit = false;
    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      if (!e || e.hp <= 0) continue;
      if (Math.hypot(b.x - e.x, b.y - e.y) < b.r + e.r) {
        const isCrit = Math.random() < player.critChance;
        const finalDmg = isCrit ? b.dmg * player.critMult : b.dmg;
        e.hp -= finalDmg;
        hit = true;
        addParticles(b.x, b.y, b.color, 4);
        if (isCrit) addFloatText(b.x, b.y - 10, "CRIT!", "#ffee00");
        if (e.hp <= 0) handleEnemyDeath(e, j);

        if (b.ricochet > 0) {
          b.ricochet--;
          const nextE = findNearestEnemy(b.x, b.y, 300, e);
          if (nextE) {
            const a = Math.atan2(nextE.y - b.y, nextE.x - b.x);
            b.vx = Math.cos(a) * b.speed; b.vy = Math.sin(a) * b.speed; b.baseAngle = a;
          }
        } else b.pierce--;
        break;
      }
    }
    if (hit && b.pierce <= 0) { bullets.splice(i, 1); continue; }
    if (b.x < 0 || b.x > MAP_SIZE || b.y < 0 || b.y > MAP_SIZE) bullets.splice(i, 1);
  }

  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (!e) continue;
    if (e.hp <= 0) { handleEnemyDeath(e, i); continue; }
    const a = Math.atan2(player.y - e.y, player.x - e.x);
    e.x = clampToMap(e.x + Math.cos(a) * e.speed * ts, e.r);
    e.y = clampToMap(e.y + Math.sin(a) * e.speed * ts, e.r);
    collideObstacles(e, e.r);

    if (e.shootTick !== undefined && e.type !== "BOSS" && e.type !== "MINI") {
      e.shootTick += ts;
      if (e.shootTick > 110 && Math.hypot(player.x - e.x, player.y - e.y) < 500) {
        e.shootTick = 0;
        const sa = Math.atan2(player.y - e.y, player.x - e.x);
        enemyBullets.push({ x: e.x, y: e.y, vx: Math.cos(sa) * 4.5, vy: Math.sin(sa) * 4.5, r: 5, color: "#ff0055" });
      }
    }

    if (Math.hypot(player.x - e.x, player.y - e.y) < e.r + player.r) {
      damagePlayer(e.type === "BOSS" ? 40 : 10);
      if (enemies.indexOf(e) < 0) continue;
      e.hp -= 50;
      if (e.hp <= 0) handleEnemyDeath(e, i);
    }
  }

  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const b = enemyBullets[i];
    b.x += b.vx * ts; b.y += b.vy * ts;
    if (pointInObstacle(b.x, b.y)) { enemyBullets.splice(i, 1); continue; }
    if (Math.hypot(player.x - b.x, player.y - b.y) < player.r + b.r) {
      damagePlayer(8);
      if (enemyBullets[i] === b) enemyBullets.splice(i, 1);
      continue;
    }
    if (b.x < 0 || b.x > MAP_SIZE || b.y < 0 || b.y > MAP_SIZE) enemyBullets.splice(i, 1);
  }

  const magnetR = GodMode.globalMagnet ? 9999 : player.magnetRadius;
  for (let i = gems.length - 1; i >= 0; i--) {
    const g = gems[i];
    const d = Math.hypot(player.x - g.x, player.y - g.y);
    if (d < magnetR) {
      const a = Math.atan2(player.y - g.y, player.x - g.x);
      g.x = clampToMap(g.x + Math.cos(a) * 8, g.r);
      g.y = clampToMap(g.y + Math.sin(a) * 8, g.r);
      if (d < player.r + g.r) {
        if (g.type === "XP") {
          player.xp += g.val;
          while (player.xp >= player.nextXp) {
            player.xp -= player.nextXp;
            player.lvl++;
            player.nextXp = Math.floor(player.nextXp * 1.5);
            player.pendingUpgrades++;
          }
          if (player.pendingUpgrades > 0 && state === "PLAY") triggerLevelUp();
        } else {
          runCoins += g.val;
          if (runCoins >= 3000) AchievementSys.unlock("rich_commander");
          AudioSys.playCoin();
        }
        gems.splice(i, 1);
      }
    }
  }

  for (let i = buildings.length - 1; i >= 0; i--) {
    const b = buildings[i];
    b.tick++;
    if (b.hitFlash > 0) b.hitFlash--;

    if (b.type === "TURRET" && b.tick % 30 === 0) {
      const e = findNearestEnemy(b.x, b.y, getBuildingRange(b.type));
      if (e) {
        b.aimAngle = Math.atan2(e.y - b.y, e.x - b.x);
        b.recoil = 2;
        bullets.push({
          x: b.x, y: b.y, vx: Math.cos(b.aimAngle) * 12, vy: Math.sin(b.aimAngle) * 12,
          baseAngle: b.aimAngle, speed: 12, r: 4, dmg: 15, pierce: 1, ricochet: 0,
          color: SaveSys.data.diy.turretColor || "#00ff9d", shape: "CIRCLE", traj: "STRAIGHT", tick: 0
        });
      }
    }
    if (b.type === "TESLA" && b.tick % 45 === 0) {
      const e = findNearestEnemy(b.x, b.y, getBuildingRange(b.type));
      if (e) {
        e.hp -= 20;
        shockwaves.push({ x: e.x, y: e.y, r: 5, maxR: 40, color: "#00f3ff", alpha: 0.8 });
        if (e.hp <= 0) handleEnemyDeath(e, enemies.indexOf(e));
      }
    }
    if (b.type === "HEAL" && b.tick % 60 === 0) {
      if (Math.hypot(player.x - b.x, player.y - b.y) < getBuildingRange(b.type)) {
        player.hp = Math.min(player.maxHp, player.hp + 5);
        addFloatText(player.x, player.y - 15, "+5 HP", "#00ff9d");
        updateHUD();
      }
    }
    if (b.type === "MINER" && b.tick % 120 === 0) {
      gems.push({
        x: clampToMap(b.x + (Math.random() - 0.5) * 20, 6),
        y: clampToMap(b.y + (Math.random() - 0.5) * 20, 6),
        r: 6, type: "COIN", val: 5
      });
    }
    if (b.type === "VORTEX") {
      const range = getBuildingRange("VORTEX");
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        if (!e || e.hp <= 0) continue;
        const d = Math.hypot(e.x - b.x, e.y - b.y);
        if (d < range && d > 10) {
          const pullAng = Math.atan2(b.y - e.y, b.x - e.x);
          e.x = clampToMap(e.x + Math.cos(pullAng) * 1.6 * ts, e.r);
          e.y = clampToMap(e.y + Math.sin(pullAng) * 1.6 * ts, e.r);
          if (b.tick % 20 === 0) { e.hp -= 6; if (e.hp <= 0) handleEnemyDeath(e, j); }
        }
      }
    }
    if (b.recoil > 0) b.recoil -= 0.2;

    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      if (!e || e.hp <= 0) continue;
      if (Math.hypot(b.x - e.x, b.y - e.y) < b.r + e.r) {
        b.hp -= 5; b.hitFlash = 5;
        e.hp -= (b.type === "WALL" ? 2 : 10);
        const pushAng = Math.atan2(e.y - b.y, e.x - b.x);
        e.x = clampToMap(e.x + Math.cos(pushAng) * 10, e.r);
        e.y = clampToMap(e.y + Math.sin(pushAng) * 10, e.r);
        if (e.hp <= 0) handleEnemyDeath(e, j);
      }
    }
    if (b.hp <= 0) {
      addParticles(b.x, b.y, getBuildingAccentColor(b.type, SaveSys.data.diy.turretColor), 15);
      buildings.splice(i, 1);
    }
  }

  waveTimer += ts;
  if (waveTimer > 600) {
    wave++;
    waveTimer = 0;
    if (wave >= 5) AchievementSys.unlock("wave_5");
    if (wave >= 10) AchievementSys.unlock("wave_10");
    if (wave % 5 === 0) spawnEnemy(true);
  }
  spawnTimer += ts;
  const spawnRate = Math.max(20, 100 - wave * 5) / (GodMode.spawnMult || 1);
  if (spawnTimer > spawnRate) { spawnTimer = 0; spawnEnemy(); }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy;
    p.life -= p.decay;
    if (p.life <= 0) particles.splice(i, 1);
  }
  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const s = shockwaves[i];
    s.r += 8; s.alpha -= 0.05;
    if (s.alpha <= 0) shockwaves.splice(i, 1);
  }
  for (let i = floatTexts.length - 1; i >= 0; i--) {
    const f = floatTexts[i];
    f.y += f.vy; f.life -= 0.02;
    if (f.life <= 0) floatTexts.splice(i, 1);
  }
  for (let i = afterimages.length - 1; i >= 0; i--) {
    afterimages[i].alpha -= 0.05;
    if (afterimages[i].alpha <= 0) afterimages.splice(i, 1);
  }

  updateHUD();
}

function drawMinimap() {
  if (!SaveSys.data.settings.showMinimap || !player) return;
  const size = Math.min(148, W * 0.22);
  const x0 = 12, y0 = 128;
  const k = size / MAP_SIZE;

  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = "rgba(4,6,12,.82)";
  ctx.fillRect(x0, y0, size, size);
  ctx.strokeStyle = "rgba(0,243,255,.6)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x0, y0, size, size);

  ctx.strokeStyle = "rgba(184,41,255,.35)";
  ctx.lineWidth = 1;
  for (let i = 1; i < GRID_DIV; i++) {
    const p = (size / GRID_DIV) * i;
    ctx.beginPath(); ctx.moveTo(x0 + p, y0); ctx.lineTo(x0 + p, y0 + size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x0, y0 + p); ctx.lineTo(x0 + size, y0 + p); ctx.stroke();
  }

  buildings.forEach(b => {
    ctx.fillStyle = getBuildingAccentColor(b.type, SaveSys.data.diy.turretColor);
    ctx.fillRect(x0 + b.x * k - 1.5, y0 + b.y * k - 1.5, 3, 3);
  });
  obstacles.forEach(o => {
    ctx.fillStyle = "rgba(255,128,255,.6)";
    ctx.beginPath();
    ctx.arc(x0 + o.x * k, y0 + o.y * k, Math.max(2, o.r * k), 0, Math.PI * 2);
    ctx.fill();
  });
  enemies.forEach(e => {
    ctx.fillStyle = e.type === "BOSS" ? "#ff0055" : "rgba(255,0,127,.85)";
    const r = e.type === "BOSS" ? 3 : 1.8;
    ctx.beginPath();
    ctx.arc(x0 + e.x * k, y0 + e.y * k, r, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = "#00f3ff";
  ctx.beginPath();
  ctx.arc(x0 + player.x * k, y0 + player.y * k, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function draw() {
  ctx.fillStyle = "#04060c";
  ctx.fillRect(0, 0, W, H);
  if (state === "MENU" || !player) return;

  // ★ 多人模式：交給 multiplayer.js 專用渲染
  if (typeof MP !== "undefined" && MP.active) {
    MP.draw();
    return;
  }

  ctx.save();

  const cam = getCameraPos();
  let camX = cam.x;
  let camY = cam.y;

  if (screenShake > 0) {
    camX += (Math.random() - 0.5) * screenShake;
    camY += (Math.random() - 0.5) * screenShake;
    screenShake--;
  }
  ctx.translate(-camX, -camY);

  ctx.save();
  ctx.strokeStyle = "rgba(0,243,255,.05)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= MAP_SIZE; x += 100) { ctx.moveTo(x, 0); ctx.lineTo(x, MAP_SIZE); }
  for (let y = 0; y <= MAP_SIZE; y += 100) { ctx.moveTo(0, y); ctx.lineTo(MAP_SIZE, y); }
  ctx.stroke();
  ctx.strokeStyle = "#ff0055";
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, MAP_SIZE, MAP_SIZE);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(184,41,255,.16)";
  ctx.lineWidth = 2;
  const cell = MAP_SIZE / GRID_DIV;
  for (let i = 1; i < GRID_DIV; i++) {
    ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, MAP_SIZE); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(MAP_SIZE, i * cell); ctx.stroke();
  }
  ctx.restore();

  gems.forEach(g => {
    ctx.fillStyle = "rgba(0,0,0,.3)";
    ctx.beginPath();
    ctx.ellipse(g.x, g.y + g.r * 0.7, g.r * 0.9, g.r * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = g.type === "XP" ? "#00f3ff" : "#ffee00";
    ctx.beginPath(); ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2); ctx.fill();
  });

  buildings.forEach(b => renderBuilding(ctx, b, SaveSys.data.diy.turretShape, SaveSys.data.diy.turretColor, !SaveSys.data.settings.neonGlow));
  bullets.forEach(b => renderBulletShape(ctx, b));

  enemyBullets.forEach(b => {
    ctx.fillStyle = b.color || "#ff0055";
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.4, 0, Math.PI * 2); ctx.fill();
  });

  enemies.forEach(e => {
    if (window.NeonDecor && window.NeonDecor.renderEnemy) {
      window.NeonDecor.renderEnemy(ctx, e, !SaveSys.data.settings.neonGlow);
    } else {
      ctx.fillStyle = e.color;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
    }
    if (e.hp < e.maxHp) {
      ctx.fillStyle = "rgba(0,0,0,.5)";
      ctx.fillRect(e.x - 10, e.y - e.r - 8, 20, 3);
      ctx.fillStyle = "#ff0055";
      ctx.fillRect(e.x - 10, e.y - e.r - 8, 20 * (e.hp / e.maxHp), 3);
    }
  });

  afterimages.forEach(a => {
    ctx.save();
    ctx.translate(a.x, a.y); ctx.rotate(a.angle);
    ctx.globalAlpha = a.alpha;
    ctx.fillStyle = player.skinColor;
    ctx.beginPath(); ctx.arc(0, 0, player.r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  });

  const currentSkin = getSelectedSkinObj();
  if (window.NeonDecor && window.NeonDecor.renderPlayerShip) {
    window.NeonDecor.renderPlayerShip(ctx, player, currentSkin, SaveSys.data.diy, !SaveSys.data.settings.neonGlow, player.dashActive > 0);
  } else {
    ctx.save();
    ctx.translate(player.x, player.y); ctx.rotate(player.angle);
    ctx.fillStyle = player.skinColor;
    ctx.beginPath();
    ctx.moveTo(player.r, 0); ctx.lineTo(-player.r, player.r * 0.7); ctx.lineTo(-player.r, -player.r * 0.7);
    ctx.fill(); ctx.restore();
  }

  if (ParrySys.active > 0) {
    ctx.strokeStyle = "#ffee00"; ctx.lineWidth = 3; ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r + 12 + Math.sin(performance.now() * 0.05) * 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (ParrySys.flashTick > 0) {
    ctx.strokeStyle = "#00f3ff"; ctx.lineWidth = 4;
    ctx.globalAlpha = ParrySys.flashTick / 16;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r + 22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  if (player.shield > 0) {
    ctx.strokeStyle = "#00f3ff"; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r + 4, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (player.orbitals > 0) {
    for (let i = 0; i < player.orbitals; i++) {
      const ang = player.orbitalAngle + (i * Math.PI * 2) / player.orbitals;
      const ox = player.x + Math.cos(ang) * 62;
      const oy = player.y + Math.sin(ang) * 62;
      ctx.fillStyle = "#00ff9d";
      ctx.beginPath(); ctx.arc(ox, oy, 4, 0, Math.PI * 2); ctx.fill();
    }
  }
  if (player.droneLvl > 0) {
    const dx = player.x + Math.cos(player.droneAngle) * 45;
    const dy = player.y + Math.sin(player.droneAngle) * 45;
    ctx.fillStyle = "#ffee00";
    ctx.beginPath(); ctx.arc(dx, dy, 6, 0, Math.PI * 2); ctx.fill();
  }

  particles.forEach(p => {
    ctx.fillStyle = p.color;
    ctx.globalAlpha = p.life;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  });
  shockwaves.forEach(s => {
    ctx.strokeStyle = s.color;
    ctx.globalAlpha = s.alpha;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
  });
  floatTexts.forEach(f => {
    ctx.fillStyle = f.color;
    ctx.globalAlpha = f.life;
    ctx.font = "bold 12px Orbitron, sans-serif";
    ctx.fillText(f.txt, f.x, f.y);
    ctx.globalAlpha = 1;
  });

  if (selectedBuildingType && mouseWorldPos.active && !touchJoy.active) {
    ctx.globalAlpha = 0.5;
    renderBuilding(ctx, {
      x: mouseWorldPos.x, y: mouseWorldPos.y, hp: 100, maxHp: 100, r: 20,
      type: selectedBuildingType, tick: 0, aimAngle: 0, hitFlash: 0
    }, SaveSys.data.diy.turretShape, SaveSys.data.diy.turretColor, true);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(0,255,157,.3)";
    ctx.beginPath();
    ctx.arc(mouseWorldPos.x, mouseWorldPos.y, getBuildingRange(selectedBuildingType), 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();

  if (slowmoTick > 0) {
    ctx.save();
    ctx.globalAlpha = 0.1 + Math.sin(performance.now() * 0.01) * 0.03;
    ctx.fillStyle = "#00f3ff";
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  drawMinimap();
}