// ============================================================
// NEON OVERDRIVE ONLINE // parry.js
// 完美格擋
// ============================================================

const ParrySys = {
  WINDOW: 12,
  CD: 96,
  active: 0,
  cd: 0,
  perfectCount: 0,
  flashTick: 0,
  slowTick: 0,

  canStart() {
    return this.active <= 0 && this.cd <= 0 && state === "PLAY" && !!player;
  },

  start() {
    if (!this.canStart()) { AudioSys.playHit(); return false; }
    this.active = this.WINDOW;
    this.cd = this.CD;
    AudioSys.playParry();
    addFloatText(player.x, player.y - 26, "PARRY READY", "#ffee00");
    return true;
  },

  update() {
    if (this.active > 0) this.active--;
    if (this.cd > 0) this.cd--;
    if (this.flashTick > 0) this.flashTick--;
  },

  tryParry() {
    if (this.active <= 0) return false;

    this.active = 0;
    this.cd = 0;
    this.flashTick = 16;
    this.perfectCount++;
    this.slowTick = 150;
    slowmoTick = Math.max(slowmoTick, 150);

    AudioSys.playParry();
    screenShake = 11;

    shockwaves.push({ x: player.x, y: player.y, r: 10, maxR: 460, color: "#00f3ff", alpha: 1 });
    shockwaves.push({ x: player.x, y: player.y, r: 10, maxR: 320, color: "#ff007f", alpha: 0.9 });
    addParticles(player.x, player.y, "#00f3ff", 26);
    addParticles(player.x, player.y, "#ffee00", 18);
    addFloatText(player.x, player.y - 34, "PERFECT PARRY!", "#ffee00");

    for (let i = enemyBullets.length - 1; i >= 0; i--) {
      const b = enemyBullets[i];
      const d = Math.hypot(b.x - player.x, b.y - player.y);
      if (d < 480) {
        enemyBullets.splice(i, 1);
        const a = Math.atan2(b.y - player.y, b.x - player.x);
        bullets.push({
          x: player.x, y: player.y,
          vx: Math.cos(a) * 15, vy: Math.sin(a) * 15,
          baseAngle: a, speed: 15, r: 5,
          dmg: getEffectivePlayerDmg() * 1.6,
          pierce: 2, ricochet: 1,
          color: "#00f3ff", shape: "DIAMOND", traj: "STRAIGHT", tick: 0
        });
      }
    }

    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (!e || e.hp <= 0) continue;
      const d = Math.hypot(e.x - player.x, e.y - player.y);
      if (d < 480) {
        e.hp -= getEffectivePlayerDmg() * 3;
        addFloatText(e.x, e.y - 14, "REFLECT", "#00f3ff");
      }
    }

    SaveSys.data.parryCount = (SaveSys.data.parryCount || 0) + 1;
    if (SaveSys.data.parryCount >= 20) AchievementSys.unlock("parry_master");
    SaveSys.save();

    return true;
  }
};