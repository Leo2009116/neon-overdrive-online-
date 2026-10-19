// ============================================================
// NEON OVERDRIVE ONLINE // save.js
// ============================================================

const SaveSys = {
  key: "neon_overdrive_online_save_v1",
  data: {
    commanderName: "Commander",
    coins: 300,
    dmgLvl: 0, hpLvl: 0, speedLvl: 0, greedLvl: 0, critLvl: 0, shieldLvl: 0,
    bestWave: 1,
    unlockedSkins: [...BASE_UNLOCKED_SKINS],
    selectedSkin: DEFAULT_SKIN,
    achievements: [],
    parryCount: 0,
    lastAfkClaimTime: Date.now(),
    lang: "zh",
    settings: { sfx: true, neonGlow: true, showMinimap: true, showGodBtn: false },
    diy: {
      bulletShape: "CIRCLE", bulletColor: "#00f3ff", bulletTraj: "STRAIGHT",
      bulletScale: 1.0, turretShape: "HEX", turretColor: "#00ff9d"
    },
    mpFirstWin: false
  },

  load() {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      this.data = Object.assign({}, this.data, parsed);
      this.data.settings = Object.assign(
        { sfx: true, neonGlow: true, showMinimap: true, showGodBtn: false },
        parsed.settings || {}
      );
      this.data.diy = Object.assign({
        bulletShape: "CIRCLE", bulletColor: "#00f3ff", bulletTraj: "STRAIGHT", bulletScale: 1.0,
        turretShape: "HEX", turretColor: "#00ff9d"
      }, parsed.diy || {});
      const validIds = HULL_SKINS.map(s => s.id);
      this.data.unlockedSkins = (this.data.unlockedSkins || []).filter(id => validIds.includes(id));
      BASE_UNLOCKED_SKINS.forEach(id => {
        if (!this.data.unlockedSkins.includes(id)) this.data.unlockedSkins.push(id);
      });
      if (!validIds.includes(this.data.selectedSkin)) this.data.selectedSkin = DEFAULT_SKIN;
      if (typeof this.data.parryCount !== "number") this.data.parryCount = 0;
    } catch (e) { console.warn("[SaveSys] load failed:", e); }
  },

  save() {
    try { localStorage.setItem(this.key, JSON.stringify(this.data)); }
    catch (e) { console.warn("[SaveSys] save failed:", e); }
  },

  exportCode() {
    try { return btoa(encodeURIComponent(JSON.stringify(this.data))); }
    catch (e) { return ""; }
  },

  importCode(str) {
    try {
      const json = decodeURIComponent(atob(str.trim()));
      const parsed = JSON.parse(json);
      if (typeof parsed.coins === "number") {
        this.data = Object.assign({}, this.data, parsed);
        this.data.settings = Object.assign(
          { sfx: true, neonGlow: true, showMinimap: true, showGodBtn: false },
          parsed.settings || {}
        );
        this.data.diy = Object.assign({
          bulletShape: "CIRCLE", bulletColor: "#00f3ff", bulletTraj: "STRAIGHT", bulletScale: 1.0,
          turretShape: "HEX", turretColor: "#00ff9d"
        }, parsed.diy || {});
        const validIds = HULL_SKINS.map(s => s.id);
        this.data.unlockedSkins = (this.data.unlockedSkins || []).filter(id => validIds.includes(id));
        BASE_UNLOCKED_SKINS.forEach(id => {
          if (!this.data.unlockedSkins.includes(id)) this.data.unlockedSkins.push(id);
        });
        if (!validIds.includes(this.data.selectedSkin)) this.data.selectedSkin = DEFAULT_SKIN;
        this.save();
        return true;
      }
    } catch (e) { console.warn("[SaveSys] import failed:", e); }
    return false;
  }
};

SaveSys.load();