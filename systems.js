// ============================================================
// NEON OVERDRIVE ONLINE // systems.js
// 音效、GodMode、成就、AFK、DIY、廣告、方向管理
// ============================================================

// ==================== 音效（WebAudio 合成） ====================
const AudioSys = {
  ctx: null,
  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    } catch (e) {}
  },
  playTone(freq, dur, type = "sine", vol = 0.12) {
    if (!SaveSys?.data?.settings?.sfx || !this.ctx) return;
    try {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
      o.connect(g); g.connect(this.ctx.destination);
      o.start(); o.stop(this.ctx.currentTime + dur);
    } catch (e) {}
  },
  playShoot() { this.playTone(880, 0.06, "square", 0.05); },
  playHit() { this.playTone(180, 0.15, "sawtooth", 0.1); },
  playExplosion() { this.playTone(90, 0.25, "sawtooth", 0.15); },
  playCoin() { this.playTone(1200, 0.08, "sine", 0.08); },
  playPowerup() { this.playTone(660, 0.12, "triangle", 0.1); setTimeout(() => this.playTone(990, 0.12, "triangle", 0.1), 80); },
  playDash() { this.playTone(400, 0.15, "sawtooth", 0.08); },
  playParry() { this.playTone(1400, 0.1, "triangle", 0.14); },
  playNova() { this.playTone(200, 0.4, "sawtooth", 0.18); }
};

// ==================== GodMode（特權面板） ====================
const PROMO_CODE = "@qwerty@";
const GodMode = {
  enabled: false,
  invincible: false,
  oneHitKill: false,
  zeroCooldown: false,
  globalMagnet: false,
  infiniteCoins: false,
  infiniteBuildCoins: false,
  gachaGuarantee: false,
  speedMult: 1,
  spawnMult: 1,
  luckMult: 1,
  dmgMult: 1,
  usedThisRun: false,
  promoActive: false,

  constructorInit() {
    try { this.promoActive = localStorage.getItem("neon_promo") === "1"; } catch (e) {}
    if (this.promoActive) this.enabled = true;
  },

  verifyPassword(pass) {
    if (pass === PROMO_CODE) {
      this.promoActive = true;
      this.enabled = true;
      try { localStorage.setItem("neon_promo", "1"); } catch (e) {}
      return true;
    }
    return false;
  },

  redeemPromoCode(code) { return this.verifyPassword(code); },
  isPromoActive() { return this.promoActive; },
  isRewardBlocked() { return !this.promoActive && this.usedThisRun; },
  markUsed() {
    this.usedThisRun = true;
    this.syncUI();
    this.updateBanner();
  },
  disableAll() {
    this.invincible = false;
    this.oneHitKill = false;
    this.zeroCooldown = false;
    this.globalMagnet = false;
    this.infiniteCoins = false;
    this.infiniteBuildCoins = false;
    this.gachaGuarantee = false;
    this.speedMult = 1;
    this.spawnMult = 1;
    this.luckMult = 1;
    this.dmgMult = 1;
    this.usedThisRun = false;
    this.syncUI();
    this.updateBanner();
  },
  registerSecretTap() {
    this._taps = (this._taps || 0) + 1;
    setTimeout(() => { this._taps = 0; }, 2000);
    if (this._taps >= 5) {
      if (!this.promoActive) {
        const pass = prompt("輸入優惠碼解鎖特權面板：");
        if (pass && this.verifyPassword(pass)) {
          SaveSys.data.settings.showGodBtn = true;
          SaveSys.save();
          SettingsSys.syncUI();
          alert("🎉 優惠碼兌換成功！");
        } else if (pass) {
          alert("❌ 優惠碼錯誤");
        }
      } else {
        SaveSys.data.settings.showGodBtn = true;
        SaveSys.save();
        SettingsSys.syncUI();
      }
      this._taps = 0;
    }
  },
  syncUI() {
    const setBtn = (id, on) => {
      const el = document.getElementById(id);
      if (el) {
        el.textContent = on ? "ON" : "OFF";
        el.classList.toggle("active", on);
      }
    };
    setBtn("god-inv-btn", this.invincible);
    setBtn("god-ohk-btn", this.oneHitKill);
    setBtn("god-cd-btn", this.zeroCooldown);
    setBtn("god-mag-btn", this.globalMagnet);
    setBtn("god-infcoin-btn", this.infiniteCoins);
    setBtn("god-bc-inf-btn", this.infiniteBuildCoins);
    setBtn("god-gacha-guarantee-btn", this.gachaGuarantee);
    const spdBtn = document.getElementById("god-spd-btn");
    if (spdBtn) spdBtn.textContent = this.speedMult + "x";
    const spwBtn = document.getElementById("god-spw-btn");
    if (spwBtn) spwBtn.textContent = this.spawnMult + "x";
    const luckBtn = document.getElementById("god-luck-btn");
    if (luckBtn) luckBtn.textContent = this.luckMult + "x";
    const authBadge = document.getElementById("god-auth-badge");
    if (authBadge) {
      authBadge.textContent = this.promoActive ? "✅ 已授權：紀錄正常" : "🔒 未授權：不計紀錄";
      authBadge.style.color = this.promoActive ? "var(--success)" : "var(--danger)";
    }
    const passStatus = document.getElementById("set-god-status");
    if (passStatus) {
      passStatus.textContent = this.promoActive ? "✅ 已兌換" : "未驗證";
      passStatus.style.color = this.promoActive ? "var(--success)" : "var(--text-muted)";
    }
    const hudGodBtn = document.getElementById("hud-god-btn");
    if (hudGodBtn) hudGodBtn.classList.toggle("hidden", !SaveSys?.data?.settings?.showGodBtn);
    this.updateBanner();
  },
  updateBanner() {
    const banner = document.getElementById("god-penalty-banner");
    if (!banner) return;
    banner.classList.toggle("hidden", !this.isRewardBlocked());
  }
};
GodMode.constructorInit();

// ==================== 成就 ====================
const AchievementSys = {
  unlock(id) {
    if (GodMode.isRewardBlocked()) return;
    const data = SaveSys.data;
    if (!data.achievements) data.achievements = [];
    if (data.achievements.includes(id)) return;
    data.achievements.push(id);
    const ach = ACHIEVEMENTS_LIST.find(a => a.id === id);
    if (ach) {
      if (!GodMode.infiniteCoins) data.coins += ach.reward;
      this.showToast(ach);
    }
    SaveSys.save();
  },
  showToast(ach) {
    const toast = document.getElementById("ach-toast");
    if (!toast) return;
    const iconEl = document.getElementById("ach-toast-icon");
    const titleEl = document.getElementById("ach-toast-title");
    if (iconEl) iconEl.textContent = ach.icon;
    if (titleEl) titleEl.textContent = SaveSys.data.lang === "en" ? ach.en : ach.zh;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 3000);
  },
  render() {
    const box = document.getElementById("ach-container");
    if (!box) return;
    const isEn = SaveSys.data.lang === "en";
    box.innerHTML = "";
    ACHIEVEMENTS_LIST.forEach(a => {
      const unlocked = SaveSys.data.achievements?.includes(a.id);
      const div = document.createElement("div");
      div.className = "ach-item" + (unlocked ? " unlocked" : "");
      div.innerHTML = `
        <div class="ach-icon">${a.icon}</div>
        <div style="flex:1;">
          <div style="font-weight:800;font-size:.85rem;">${isEn ? a.en : a.zh}</div>
          <div style="font-size:.7rem;color:var(--text-muted);">${isEn ? a.descEn : a.descZh}</div>
          <div style="font-size:.72rem;color:var(--warning);font-weight:800;margin-top:2px;">+₵${a.reward}</div>
        </div>
      `;
      box.appendChild(div);
    });
  }
};

// ==================== AFK 系統 ====================
const AfkSys = {
  autoBattle: false,
  RATE_PER_MIN: 10,
  MAX_HOURS: 12,

  toggleAutoBattle() {
    this.autoBattle = !this.autoBattle;
    const btn = document.getElementById("hud-afk-btn");
    if (btn) btn.textContent = this.autoBattle ? "🤖 AFK: ON" : "🤖 AFK: OFF";
    const quick = document.getElementById("afk-Quick-btn");
    if (quick) quick.classList.toggle("afk-on", this.autoBattle);
    const quick2 = document.getElementById("afk-quick-btn");
    if (quick2) quick2.classList.toggle("afk-on", this.autoBattle);
    if (this.autoBattle) AfkSys.updateUI();
  },

  getElapsedMs() {
    const last = SaveSys.data.lastAfkClaimTime || Date.now();
    return Math.min(this.MAX_HOURS * 3600 * 1000, Date.now() - last);
  },

  getRatePerMin() {
    const greed = SaveSys.data.greedLvl || 0;
    return this.RATE_PER_MIN * (1 + greed * 0.2);
  },

  getPendingReward() {
    const ms = this.getElapsedMs();
    return Math.floor((ms / 60000) * this.getRatePerMin());
  },

  updateUI() {
    const reward = document.getElementById("afk-reward-txt");
    if (reward) reward.textContent = this.getPendingReward();
    const rate = document.getElementById("afk-rate-txt");
    if (rate) rate.textContent = this.getRatePerMin().toFixed(0) + " ₵ / min";
    const time = document.getElementById("afk-time-txt");
    if (time) {
      const ms = this.getElapsedMs();
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      time.textContent = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
    const badge = document.getElementById("afk-menu-badge");
    if (badge) badge.textContent = this.getPendingReward();
  },

  claim(mult) {
    const reward = this.getPendingReward() * mult;
    if (reward <= 0) {
      AudioSys.playHit();
      return;
    }
    if (!GodMode.infiniteCoins) SaveSys.data.coins += reward;
    SaveSys.data.lastAfkClaimTime = Date.now();
    SaveSys.save();
    AudioSys.playCoin();
    this.updateUI();
    document.getElementById("afk-overlay")?.classList.add("hidden");
    updateMenuText();
    renderShop();
  }
};

// ==================== DIY ====================
const DiySys = {
  init() {
    const d = SaveSys.data.diy;
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    setVal("diy-bullet-shape", d.bulletShape);
    setVal("diy-bullet-color", d.bulletColor);
    setVal("diy-bullet-traj", d.bulletTraj);
    setVal("diy-bsize-slider", d.bulletScale);
    setVal("diy-turret-shape", d.turretShape);
    setVal("diy-turret-color", d.turretColor);
    const bsizeVal = document.getElementById("diy-bsize-val");
    if (bsizeVal) bsizeVal.textContent = d.bulletScale.toFixed(1) + "x";

    this.renderPreview();
    this.bindTabs();
    this.bindInputs();
  },

  bindTabs() {
    document.querySelectorAll("[data-diytab]").forEach(tab => {
      tab.onclick = () => {
        const t = tab.getAttribute("data-diytab");
        document.querySelectorAll("[data-diytab]").forEach(x => x.classList.toggle("active", x === tab));
        document.getElementById("diy-panel-weapon")?.classList.toggle("hidden", t !== "weapon");
        document.getElementById("diy-panel-turret")?.classList.toggle("hidden", t !== "turret");
        if (t === "turret") this.renderPreview();
      };
    });
  },

  bindInputs() {
    const el = (id) => document.getElementById(id);
    const bsizeSlider = el("diy-bsize-slider");
    if (bsizeSlider) {
      bsizeSlider.oninput = () => {
        const v = parseFloat(bsizeSlider.value) || 1;
        const bsizeVal = el("diy-bsize-val");
        if (bsizeVal) bsizeVal.textContent = v.toFixed(1) + "x";
        SaveSys.data.diy.bulletScale = v;
      };
    }
    const tcolor = el("diy-turret-color");
    if (tcolor) tcolor.oninput = () => { SaveSys.data.diy.turretColor = tcolor.value; this.renderPreview(); };
    const tshape = el("diy-turret-shape");
    if (tshape) tshape.onchange = () => { SaveSys.data.diy.turretShape = tshape.value; this.renderPreview(); };

    const saveBtn = el("diy-save-btn");
    if (saveBtn) {
      saveBtn.onclick = () => {
        SaveSys.data.diy.bulletShape = el("diy-bullet-shape")?.value || "CIRCLE";
        SaveSys.data.diy.bulletColor = el("diy-bullet-color")?.value || "#00f3ff";
        SaveSys.data.diy.bulletTraj = el("diy-bullet-traj")?.value || "STRAIGHT";
        SaveSys.data.diy.bulletScale = parseFloat(el("diy-bsize-slider")?.value) || 1;
        SaveSys.data.diy.turretShape = el("diy-turret-shape")?.value || "HEX";
        SaveSys.data.diy.turretColor = el("diy-turret-color")?.value || "#00ff9d";
        SaveSys.save();
        AchievementSys.unlock("diy_creator");
        AudioSys.playPowerup();
        alert(SaveSys.data.lang === "en" ? "DIY saved!" : "DIY 設計已儲存！");
      };
    }
  },

  renderPreview() {
    const canvas = document.getElementById("diy-turret-preview-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height;
    ctx.fillStyle = "#04060c"; ctx.fillRect(0, 0, w, h);
    // 網格
    ctx.strokeStyle = "rgba(0,243,255,.1)";
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 20) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += 20) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    // 用 NeonDecor 繪製
    if (window.NeonDecor && window.NeonDecor.renderBuilding) {
      const mock = {
        x: w / 2, y: h / 2 + 10, r: 22, hp: 100, maxHp: 100,
        type: "TURRET", tick: 20, aimAngle: Math.PI, recoil: 0, hitFlash: 0
      };
      // 需要先 translate
      const origRender = window.NeonDecor.renderBuilding;
      origRender(ctx, mock, SaveSys.data.diy.turretShape, SaveSys.data.diy.turretColor, false);
    }
  }
};

// ==================== 廣告模擬 ====================
const MonetizationManager = {
  triggerRewardedAd(onComplete) {
    if (GodMode.isPromoActive() || GodMode.enabled) {
      // 已兌換優惠碼：直接完成
      onComplete && onComplete();
      return;
    }
    const overlay = document.getElementById("ad-overlay");
    const title = document.getElementById("ad-status-title");
    const timer = document.getElementById("ad-timer-text");
    if (!overlay) { onComplete && onComplete(); return; }
    overlay.classList.remove("hidden");
    if (title) title.textContent = SaveSys.data.lang === "en" ? "Connecting to sponsor signal..." : "正在連線贊助商訊號...";
    let n = 2;
    if (timer) timer.textContent = (SaveSys.data.lang === "en" ? "Please wait" : "請稍候") + ` (${n}s)`;
    const iv = setInterval(() => {
      n--;
      if (timer) timer.textContent = (SaveSys.data.lang === "en" ? "Please wait" : "請稍候") + ` (${n}s)`;
      if (n <= 0) {
        clearInterval(iv);
        overlay.classList.add("hidden");
        onComplete && onComplete();
      }
    }, 1000);
  }
};

// ==================== 螢幕方向管理 ====================
const OrientationMgr = {
  requestLandscape() {
    try {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
      if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock("landscape").catch(() => {});
      }
    } catch (e) {}
  }
};

// ==================== 設置同步 ====================
const SettingsSys = {
  syncUI() {
    const setBtn = (id, on) => {
      const el = document.getElementById(id);
      if (el) { el.textContent = on ? "ON" : "OFF"; }
    };
    setBtn("set-sfx-btn", SaveSys.data.settings.sfx);
    setBtn("set-glow-btn", SaveSys.data.settings.neonGlow);
    setBtn("set-map-btn", SaveSys.data.settings.showMinimap);
    setBtn("set-god-vis-btn", SaveSys.data.settings.showGodBtn);

    GodMode.syncUI();
  }
};