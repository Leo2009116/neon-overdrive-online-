// ============================================================
// NEON OVERDRIVE ONLINE // gacha.js
// ============================================================

const GachaSys = {
  COST_SINGLE: 150,
  COST_TEN: 1350,

  getRates() {
    const luck = Math.max(1, GodMode.luckMult || 1);
    let ur = 0.05 * luck;
    let ssr = 0.15 * luck;
    const totalRare = ur + ssr;
    if (totalRare > 0.9) {
      const scale = 0.9 / totalRare;
      ur *= scale; ssr *= scale;
    }
    const remaining = 1 - ur - ssr;
    return { UR: ur, SSR: ssr, SR: remaining * (30 / 80), R: remaining * (50 / 80) };
  },

  rollRarity() {
    const rates = this.getRates();
    const roll = Math.random();
    let acc = 0;
    for (const rarity of ["UR", "SSR", "SR", "R"]) {
      acc += rates[rarity];
      if (roll < acc) return rarity;
    }
    return "R";
  },

  getUnlockedIds() { return SaveSys.data.unlockedSkins || []; },

  rollGuaranteedLocked() {
    const locked = HULL_SKINS.filter(s =>
      (s.rarity === "UR" || s.rarity === "SSR") && !this.getUnlockedIds().includes(s.id)
    );
    if (locked.length === 0) return null;
    return this.makeSkinReward(locked[Math.floor(Math.random() * locked.length)]);
  },

  makeSkinReward(skin) {
    return {
      type: "SKIN", skinId: skin.id,
      skinName: SaveSys.data.lang === "en" ? skin.nameEn : skin.nameZh,
      rarity: skin.rarity
    };
  },

  rollOne() {
    if (GodMode.gachaGuarantee) {
      const forced = this.rollGuaranteedLocked();
      if (forced) return forced;
    }
    const rarity = this.rollRarity();
    if (rarity === "UR" || rarity === "SSR") {
      const pool = HULL_SKINS.filter(s => s.rarity === rarity);
      const locked = pool.filter(s => !this.getUnlockedIds().includes(s.id));
      if (locked.length > 0) return this.makeSkinReward(locked[Math.floor(Math.random() * locked.length)]);
      return { type: "COINS", amount: rarity === "UR" ? 1500 : 400, rarity };
    }
    return { type: "COINS", amount: rarity === "SR" ? 200 : 80, rarity };
  },

  applyReward(reward) {
    if (!reward) return;
    if (reward.type === "SKIN") {
      if (!SaveSys.data.unlockedSkins.includes(reward.skinId)) SaveSys.data.unlockedSkins.push(reward.skinId);
      if (reward.rarity === "UR") AchievementSys.unlock("gacha_ur");
    } else if (reward.type === "COINS") {
      if (!GodMode.infiniteCoins) SaveSys.data.coins += reward.amount;
    }
  },

  roll(free = false) {
    if (!free && !GodMode.infiniteCoins) {
      if (SaveSys.data.coins < this.COST_SINGLE) { AudioSys.playHit(); return null; }
      SaveSys.data.coins -= this.COST_SINGLE;
    }
    const reward = this.rollOne();
    this.applyReward(reward);
    SaveSys.save();
    return reward;
  },

  rollTen() {
    if (!GodMode.infiniteCoins) {
      if (SaveSys.data.coins < this.COST_TEN) { AudioSys.playHit(); return null; }
      SaveSys.data.coins -= this.COST_TEN;
    }
    const results = [];
    let hasSRPlus = false;
    for (let i = 0; i < 10; i++) {
      const reward = this.rollOne();
      if (reward.rarity !== "R") hasSRPlus = true;
      results.push(reward);
      this.applyReward(reward);
    }
    if (!hasSRPlus) {
      results[9] = { type: "COINS", amount: 200, rarity: "SR" };
      if (!GodMode.infiniteCoins) SaveSys.data.coins += 200;
    }
    SaveSys.save();
    return results;
  }
};

function showGachaResult(r) {
  const box = document.getElementById("gacha-results");
  if (!box || !r) return;
  const placeholder = box.querySelector("[data-i18n='gacha_empty']");
  if (placeholder) placeholder.parentElement.remove();

  const div = document.createElement("div");
  div.className = `gacha-item rarity-${r.rarity}`;
  div.textContent = r.type === "SKIN" ? `${r.rarity}: ${r.skinName}` : `${r.rarity}: +${r.amount}₵`;
  box.appendChild(div);
  AudioSys.playCoin();
}