// ============================================================
// NEON OVERDRIVE ONLINE // ui.js
// ============================================================

function bindClick(id, handler) {
  const el = document.getElementById(id);
  if (el) el.onclick = handler;
}

function t(key) {
  const lang = SaveSys?.data?.lang || "zh";
  return (typeof I18N !== "undefined" && I18N[lang] && I18N[lang][key]) ? I18N[lang][key] : key;
}

function applyTranslations() {
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const k = el.getAttribute("data-i18n");
    if (k) el.innerHTML = t(k);
  });
  buildRadial();
  updateMenuText();
}

function updateMenuText() {
  if (!SaveSys?.data) return;
  const nameEl = document.getElementById("account-name-txt");
  if (nameEl) nameEl.textContent = SaveSys.data.commanderName || t("btn_account");
  const bankEl = document.getElementById("bank-coins");
  if (bankEl) bankEl.textContent = SaveSys.data.coins;
  const bestEl = document.getElementById("best-wave-txt");
  if (bestEl) bestEl.textContent = SaveSys.data.bestWave || 1;
}

function handleSubModalClose(modalId) {
  document.getElementById(modalId)?.classList.add("hidden");
  if (modalId === "diy-overlay" || modalId === "settings-overlay") {
    if (returnToPause) {
      returnToPause = false;
      state = "PAUSE";
      document.getElementById("pause-overlay")?.classList.remove("hidden");
    } else if (resumePlayOnClose) {
      resumePlayOnClose = false;
      state = "PLAY";
    }
    syncBodyStateAttr();
  }
}

function renderShop() {
  const box = document.getElementById("shop-container");
  if (!box || !SaveSys?.data) return;
  const isEn = SaveSys.data.lang === "en";
  const ups = [
    { key: "dmgLvl", zh: "⚔️ 火力強化", en: "⚔️ Damage", descZh: "+15% 傷害", descEn: "+15% DMG", base: 100 },
    { key: "hpLvl", zh: "❤️ 裝甲強化", en: "❤️ Hull HP", descZh: "+25 生命", descEn: "+25 HP", base: 120 },
    { key: "speedLvl", zh: "💨 引擎強化", en: "💨 Thrusters", descZh: "+8% 移速", descEn: "+8% Speed", base: 90 },
    { key: "greedLvl", zh: "💰 財富增幅", en: "💰 Greed", descZh: "+20% 星幣", descEn: "+20% Coins", base: 150 },
    { key: "critLvl", zh: "🎯 暴擊瞄準", en: "🎯 Crit Rate", descZh: "+5% 暴擊", descEn: "+5% Crit", base: 130 },
    { key: "shieldLvl", zh: "🛡️ 護盾核心", en: "🛡️ Shield", descZh: "+20 護盾", descEn: "+20 Shield", base: 110 }
  ];
  box.innerHTML = "";
  ups.forEach(u => {
    const lvl = SaveSys.data[u.key] || 0;
    const cost = Math.round(u.base * Math.pow(1.55, lvl));
    const card = document.createElement("button");
    card.type = "button";
    card.className = "card";
    card.innerHTML = `
      <span class="tag">Lv.${lvl}</span>
      <div><h3>${isEn ? u.en : u.zh}</h3><p>${isEn ? u.descEn : u.descZh}</p></div>
      <div class="price">${t("shop_buy")}${cost}</div>`;
    card.onclick = () => {
      if (!GodMode.infiniteCoins && SaveSys.data.coins < cost) { AudioSys.playHit(); return; }
      if (!GodMode.infiniteCoins) SaveSys.data.coins -= cost;
      SaveSys.data[u.key] = lvl + 1;
      SaveSys.save();
      AudioSys.playPowerup();
      renderShop();
      updateMenuText();
    };
    box.appendChild(card);
  });
  updateMenuText();
}

function renderSkins() {
  const bar = document.getElementById("skin-selector-bar");
  if (!bar || typeof HULL_SKINS === "undefined") return;
  const isEn = SaveSys.data.lang === "en";
  bar.innerHTML = "";
  HULL_SKINS.forEach(skin => {
    const unlocked = SaveSys.data.unlockedSkins.includes(skin.id);
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "skin-chip" + (SaveSys.data.selectedSkin === skin.id ? " selected" : "") + (unlocked ? "" : " locked");
    chip.textContent = isEn ? skin.nameEn : skin.nameZh;
    if (unlocked) chip.style.borderColor = skin.color;
    chip.onclick = () => {
      if (!unlocked) return;
      SaveSys.data.selectedSkin = skin.id;
      SaveSys.save();
      renderSkins();
      AudioSys.playPowerup();
    };
    bar.appendChild(chip);
  });
}

const BUILD_DEFS = [
  { type: "TURRET", icon: "🔫", key: "1" },
  { type: "TESLA", icon: "⚡", key: "2" },
  { type: "HEAL", icon: "💚", key: "3" },
  { type: "MINER", icon: "⛏️", key: "4" },
  { type: "WALL", icon: "🧱", key: "5" },
  { type: "VORTEX", icon: "🌀", key: "6" }
];

let radialOpen = false;

function buildRadial() {
  const box = document.getElementById("build-radial");
  if (!box || typeof BUILD_COSTS === "undefined") return;
  box.innerHTML = "";
  const R = 100;
  const start = -Math.PI / 2;
  const end = 0;
  BUILD_DEFS.forEach((d, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "radial-slot" + (selectedBuildingType === d.type ? " selected" : "");
    btn.setAttribute("data-build", d.type);
    btn.innerHTML = `<span class="r-icon">${d.icon}</span><span class="r-name">${t("b_" + d.type.toLowerCase())}</span><span class="r-cost">${BUILD_COSTS[d.type]}₵</span>`;
    const ang = start + (end - start) * (i / (BUILD_DEFS.length - 1));
    const dx = Math.cos(ang) * R;
    const dy = Math.sin(ang) * R;
    btn.style.transform = `translate(-50%,-50%) translate(${dx}px, ${dy}px)`;
    btn.onclick = (ev) => { ev.stopPropagation(); AudioSys.init(); selectBuildSlot(d.type); toggleRadial(false); };
    box.appendChild(btn);
  });
}

function toggleRadial(force) {
  const box = document.getElementById("build-radial");
  const fab = document.getElementById("build-fab");
  if (!box || !fab) return;
  radialOpen = (typeof force === "boolean") ? force : !radialOpen;
  box.classList.toggle("open", radialOpen);
  box.classList.toggle("hidden", !radialOpen);
  fab.style.boxShadow = radialOpen ? "0 0 28px rgba(0,243,255,.95)" : "0 0 18px rgba(0,243,255,.6)";
}

function buildTeleportGrid() {
  const grid = document.getElementById("tp-grid");
  if (!grid || typeof GRID_DIV === "undefined") return;
  grid.innerHTML = "";
  for (let j = 1; j <= GRID_DIV; j++) {
    for (let i = 1; i <= GRID_DIV; i++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tp-cell";
      btn.setAttribute("data-i", i);
      btn.setAttribute("data-j", j);
      btn.innerHTML = `X${i}<small>Z${j}</small>`;
      btn.onclick = () => { if (teleportTo(i, j)) closeTeleportGrid(); };
      grid.appendChild(btn);
    }
  }
}

function highlightSelfCell() {
  if (!player) return;
  const cell = MAP_SIZE / GRID_DIV;
  const ci = Math.min(GRID_DIV, Math.max(1, Math.ceil(player.x / cell)));
  const cj = Math.min(GRID_DIV, Math.max(1, Math.ceil(player.y / cell)));
  document.querySelectorAll(".tp-cell").forEach(c => {
    c.classList.toggle("self", Number(c.getAttribute("data-i")) === ci && Number(c.getAttribute("data-j")) === cj);
  });
}

function openTeleportGrid() {
  if (state !== "PLAY" || !player) return;
  const tpOverlay = document.getElementById("teleport-overlay");
  if (tpOverlay && !tpOverlay.classList.contains("hidden")) { closeTeleportGrid(); return; }
  if (player.dashCd > 0 && !GodMode.zeroCooldown) {
    AudioSys.playHit();
    addFloatText(player.x, player.y - 26, "WARP COOLDOWN", "#ff0055");
    return;
  }
  highlightSelfCell();
  tpOverlay?.classList.remove("hidden");
}

function closeTeleportGrid() {
  document.getElementById("teleport-overlay")?.classList.add("hidden");
}

bindClick("start-btn", () => {
  OrientationMgr.requestLandscape();
  document.getElementById("menu-overlay")?.classList.add("hidden");
  state = "PLAY";
  initRun();
  syncBodyStateAttr();
});

bindClick("hud-exit-btn", () => {
  state = "PAUSE";
  syncBodyStateAttr();
  const pw = document.getElementById("pause-wave-txt"); if (pw) pw.textContent = wave;
  const pc = document.getElementById("pause-coins-txt"); if (pc) pc.textContent = runCoins;
  document.getElementById("pause-overlay")?.classList.remove("hidden");
});

function resumeFromPause() {
  returnToPause = false;
  resumePlayOnClose = false;
  document.getElementById("pause-overlay")?.classList.add("hidden");
  if (state === "PAUSE") { state = "PLAY"; syncBodyStateAttr(); }
}

bindClick("pause-resume-btn", resumeFromPause);
bindClick("pause-resume-x", resumeFromPause);

function backToMainMenuFromRun() {
  bankUnbankedCoins();
  document.getElementById("pause-overlay")?.classList.add("hidden");
  document.getElementById("gameover-overlay")?.classList.add("hidden");
  document.getElementById("menu-overlay")?.classList.remove("hidden");
  document.getElementById("hud")?.classList.add("hidden");
  document.getElementById("build-fab-wrap")?.classList.add("hidden");
  document.getElementById("active-skills-hud")?.classList.add("hidden");
  document.getElementById("god-panel")?.classList.add("hidden");
  state = "MENU";
  syncBodyStateAttr();
  renderShop();
  updateMenuText();
}

bindClick("pause-quit-btn", backToMainMenuFromRun);
bindClick("return-menu-btn", backToMainMenuFromRun);
bindClick("gameover-close-x", backToMainMenuFromRun);

bindClick("dash-btn", openTeleportGrid);
bindClick("nova-btn", triggerOverdriveBurst);
bindClick("parry-btn", () => ParrySys.start());
bindClick("hud-afk-btn", () => AfkSys.toggleAutoBattle());
bindClick("afk-Quick-btn", () => AfkSys.toggleAutoBattle());
bindClick("afk-quick-btn", () => AfkSys.toggleAutoBattle());
bindClick("pause-afk-btn", () => { AfkSys.toggleAutoBattle(); resumeFromPause(); });

bindClick("tp-close-btn", closeTeleportGrid);

bindClick("build-fab", (e) => { e.stopPropagation(); AudioSys.init(); toggleRadial(); });

document.querySelectorAll("[data-close]").forEach(btn => {
  btn.onclick = () => handleSubModalClose(btn.getAttribute("data-close"));
});

bindClick("open-diy-btn", () => {
  returnToPause = false; resumePlayOnClose = false;
  document.getElementById("diy-overlay")?.classList.remove("hidden");
  DiySys.init();
});
bindClick("hud-diy-btn", () => {
  returnToPause = false; resumePlayOnClose = true; state = "PAUSE"; syncBodyStateAttr();
  document.getElementById("diy-overlay")?.classList.remove("hidden");
  DiySys.init();
});
bindClick("pause-diy-btn", () => {
  returnToPause = true; resumePlayOnClose = false;
  document.getElementById("pause-overlay")?.classList.add("hidden");
  document.getElementById("diy-overlay")?.classList.remove("hidden");
  DiySys.init();
});

function openSettingsModal() {
  document.getElementById("settings-overlay")?.classList.remove("hidden");
  SettingsSys.syncUI();
  const passInput = document.getElementById("set-god-pass-input");
  const passMsg = document.getElementById("set-pass-msg");
  if (GodMode.isPromoActive()) {
    if (passInput && !passInput.value) passInput.placeholder = "🎟️ 優惠碼已兌換生效";
    if (passMsg && !passMsg.textContent) {
      passMsg.textContent = "🎟️ 專屬優惠碼已生效（免廣告 + 解鎖特權紀錄）";
      passMsg.style.color = "var(--success)";
    }
  }
}

bindClick("open-settings-btn", () => { returnToPause = false; resumePlayOnClose = false; openSettingsModal(); });
bindClick("hud-settings-btn", () => { returnToPause = false; resumePlayOnClose = true; state = "PAUSE"; syncBodyStateAttr(); openSettingsModal(); });
bindClick("pause-settings-btn", () => {
  returnToPause = true; resumePlayOnClose = false; state = "PAUSE"; syncBodyStateAttr();
  document.getElementById("pause-overlay")?.classList.add("hidden");
  openSettingsModal();
});

bindClick("ach-btn", () => { document.getElementById("ach-overlay")?.classList.remove("hidden"); AchievementSys.render(); });
bindClick("help-btn", () => { document.getElementById("help-overlay")?.classList.remove("hidden"); });

bindClick("open-gacha-btn", () => {
  document.getElementById("gacha-overlay")?.classList.remove("hidden");
  const bankTxt = document.getElementById("gacha-bank-txt");
  if (bankTxt) bankTxt.textContent = SaveSys.data.coins;
  const resBox = document.getElementById("gacha-results");
  if (resBox) resBox.innerHTML = `<div style="grid-column:1/-1;color:var(--text-muted);padding:16px 0;" data-i18n="gacha_empty">${t("gacha_empty")}</div>`;
});

bindClick("gacha-1-btn", () => {
  const resBox = document.getElementById("gacha-results");
  if (resBox) resBox.innerHTML = "";
  const r = GachaSys.roll();
  if (r) showGachaResult(r);
  const bankTxt = document.getElementById("gacha-bank-txt"); if (bankTxt) bankTxt.textContent = SaveSys.data.coins;
  updateMenuText(); renderSkins();
});

bindClick("gacha-10-btn", () => {
  const resBox = document.getElementById("gacha-results");
  if (resBox) resBox.innerHTML = "";
  const rs = GachaSys.rollTen();
  if (rs) rs.forEach(showGachaResult);
  const bankTxt = document.getElementById("gacha-bank-txt"); if (bankTxt) bankTxt.textContent = SaveSys.data.coins;
  updateMenuText(); renderSkins();
});

bindClick("gacha-ad-btn", () => {
  MonetizationManager.triggerRewardedAd(() => {
    const resBox = document.getElementById("gacha-results");
    if (resBox) resBox.innerHTML = "";
    const r = GachaSys.roll(true);
    if (r) showGachaResult(r);
    const bankTxt = document.getElementById("gacha-bank-txt"); if (bankTxt) bankTxt.textContent = SaveSys.data.coins;
    updateMenuText(); renderSkins();
  });
});

bindClick("open-afk-btn", () => { document.getElementById("afk-overlay")?.classList.remove("hidden"); AfkSys.updateUI(); });
bindClick("claim-afk-btn", () => { AfkSys.claim(1); });
bindClick("claim-afk-2x-btn", () => { MonetizationManager.triggerRewardedAd(() => AfkSys.claim(2)); });

bindClick("ad-bonus-btn", () => {
  MonetizationManager.triggerRewardedAd(() => {
    if (!GodMode.infiniteCoins) SaveSys.data.coins += 500;
    SaveSys.save();
    renderShop();
    updateMenuText();
  });
});

bindClick("revive-ad-btn", () => {
  MonetizationManager.triggerRewardedAd(() => {
    if (!player) return;
    player.hp = player.maxHp;
    revivedThisRun = true;
    document.getElementById("revive-ad-btn")?.classList.add("hidden");
    document.getElementById("gameover-overlay")?.classList.add("hidden");
    state = "PLAY"; syncBodyStateAttr(); updateHUD();
  });
});

bindClick("double-ad-btn", () => {
  MonetizationManager.triggerRewardedAd(() => {
    if (!doubledThisRun) {
      runCoins *= 2;
      doubledThisRun = true;
      bankUnbankedCoins();
      const goCoins = document.getElementById("go-coins"); if (goCoins) goCoins.textContent = runCoins;
      updateMenuText();
    }
    document.getElementById("double-ad-btn")?.classList.add("hidden");
  });
});

bindClick("levelup-skip-x", () => {
  if (currentChoices[0] && player) currentChoices[0].apply(player);
  finishLevelUpStep();
});
bindClick("reroll-ad-btn", () => { MonetizationManager.triggerRewardedAd(() => rollUpgradeChoices()); });
bindClick("takeall-ad-btn", () => {
  MonetizationManager.triggerRewardedAd(() => {
    if (player) currentChoices.forEach(u => u.apply(player));
    finishLevelUpStep();
  });
});

bindClick("set-sfx-btn", () => { SaveSys.data.settings.sfx = !SaveSys.data.settings.sfx; SaveSys.save(); SettingsSys.syncUI(); });
bindClick("set-glow-btn", () => { SaveSys.data.settings.neonGlow = !SaveSys.data.settings.neonGlow; SaveSys.save(); SettingsSys.syncUI(); });
bindClick("set-map-btn", () => { SaveSys.data.settings.showMinimap = !SaveSys.data.settings.showMinimap; SaveSys.save(); SettingsSys.syncUI(); });
bindClick("set-god-vis-btn", () => { SaveSys.data.settings.showGodBtn = !SaveSys.data.settings.showGodBtn; SaveSys.save(); SettingsSys.syncUI(); });
bindClick("set-god-off-btn", () => {
  GodMode.disableAll();
  const msg = document.getElementById("set-pass-msg");
  if (msg) { msg.textContent = "已關閉所有特權開關與加速效果"; msg.style.color = "var(--warning)"; }
});
bindClick("set-reset-btn", () => {
  if (confirm("警告：此操作將刪除所有星幣、升級與解鎖項目，確定要重置嗎？")) {
    localStorage.removeItem(SaveSys.key);
    localStorage.removeItem("neon_promo");
    location.reload();
  }
});

function toggleLang() {
  SaveSys.data.lang = SaveSys.data.lang === "en" ? "zh" : "en";
  SaveSys.save();
  applyTranslations();
  renderShop();
  renderSkins();
  AchievementSys.render();
  updateMenuText();
  if (MP.active) MP.updateMPHud();
}
bindClick("lang-switch-btn", toggleLang);
bindClick("set-lang-btn", toggleLang);

bindClick("hot-base-save-btn", () => {
  const input = document.getElementById("hot-base-input");
  const msg = document.getElementById("hot-base-msg");
  if (!input || !msg) return;
  const v = input.value.trim();
  try {
    if (v) localStorage.setItem("neon_hot_base", v);
    else localStorage.removeItem("neon_hot_base");
    localStorage.removeItem("neon_hot_ver");
    msg.textContent = v ? "已儲存，下次啟動會檢查遠端版本。" : "已清空，只使用本地版。";
    msg.style.color = "var(--success)";
  } catch (e) {
    msg.textContent = "儲存失敗：" + e.message;
    msg.style.color = "var(--danger)";
  }
});

bindClick("account-btn", () => {
  document.getElementById("account-overlay")?.classList.remove("hidden");
  const cmdInput = document.getElementById("commander-input"); if (cmdInput) cmdInput.value = SaveSys.data.commanderName || "";
  const codeBox = document.getElementById("save-code-box"); if (codeBox) codeBox.value = "";
  const msg = document.getElementById("acc-status-msg"); if (msg) msg.textContent = "";
});
bindClick("save-callsign-btn", () => {
  const cmdInput = document.getElementById("commander-input");
  const msg = document.getElementById("acc-status-msg");
  const name = cmdInput ? cmdInput.value.trim() : "";
  if (name) {
    SaveSys.data.commanderName = name;
    SaveSys.save();
    updateMenuText();
    if (msg) { msg.textContent = "指揮官呼號已儲存！"; msg.style.color = "var(--success)"; }
  }
});
bindClick("export-save-btn", () => {
  const code = SaveSys.exportCode();
  const codeBox = document.getElementById("save-code-box"); if (codeBox) codeBox.value = code;
  navigator.clipboard?.writeText(code).catch(() => {});
  const msg = document.getElementById("acc-status-msg");
  if (msg) { msg.textContent = "代碼已產生並嘗試複製到剪貼簿！"; msg.style.color = "var(--accent)"; }
});
bindClick("import-save-btn", () => {
  const codeBox = document.getElementById("save-code-box");
  const msg = document.getElementById("acc-status-msg");
  const code = codeBox ? codeBox.value.trim() : "";
  if (SaveSys.importCode(code)) {
    if (msg) { msg.textContent = "存檔匯入成功！數據已刷新。"; msg.style.color = "var(--success)"; }
    updateMenuText(); renderShop(); renderSkins(); AchievementSys.render(); SettingsSys.syncUI();
  } else if (msg) {
    msg.textContent = "無效的存檔代碼或格式錯誤！"; msg.style.color = "var(--danger)";
  }
});

bindClick("settings-title-secret", () => GodMode.registerSecretTap());

function handlePromoRedeem() {
  const input = document.getElementById("set-god-pass-input");
  const msg = document.getElementById("set-pass-msg");
  const code = input ? input.value.trim() : "";
  const ok = GodMode.redeemPromoCode(code);
  if (ok) {
    if (SaveSys?.data?.settings) { SaveSys.data.settings.showGodBtn = true; SaveSys.save(); }
    SettingsSys.syncUI();
    if (input) { input.value = ""; input.placeholder = "🎟️ 優惠碼已兌換生效"; }
    if (msg) { msg.textContent = "🎉 優惠碼兌換成功！已解鎖免廣告福利與專屬特權面板！"; msg.style.color = "var(--success)"; }
  } else {
    AudioSys.playHit();
    if (msg) { msg.textContent = "❌ 優惠碼無效或輸入錯誤，請重新確認！"; msg.style.color = "var(--danger)"; }
  }
}

bindClick("set-god-pass-btn", handlePromoRedeem);

const promoInputEl = document.getElementById("set-god-pass-input");
if (promoInputEl) {
  promoInputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); handlePromoRedeem(); }
  });
}

bindClick("god-close-btn", () => document.getElementById("god-panel")?.classList.add("hidden"));
bindClick("hud-god-btn", () => document.getElementById("god-panel")?.classList.toggle("hidden"));

bindClick("god-inv-btn", () => { GodMode.invincible = !GodMode.invincible; GodMode.markUsed(); });
bindClick("god-ohk-btn", () => { GodMode.oneHitKill = !GodMode.oneHitKill; GodMode.markUsed(); });
bindClick("god-cd-btn", () => { GodMode.zeroCooldown = !GodMode.zeroCooldown; GodMode.markUsed(); });
bindClick("god-mag-btn", () => { GodMode.globalMagnet = !GodMode.globalMagnet; GodMode.markUsed(); });
bindClick("god-spd-btn", () => { GodMode.speedMult = GodMode.speedMult >= 3 ? 1 : GodMode.speedMult + 1; GodMode.markUsed(); });
bindClick("god-spw-btn", () => { GodMode.spawnMult = GodMode.spawnMult >= 5 ? 1 : GodMode.spawnMult + 2; GodMode.markUsed(); });
bindClick("god-luck-btn", () => { const seq = [1, 2, 5, 10]; GodMode.luckMult = seq[(seq.indexOf(GodMode.luckMult) + 1) % seq.length]; GodMode.markUsed(); });
bindClick("god-gacha-guarantee-btn", () => { GodMode.gachaGuarantee = !GodMode.gachaGuarantee; GodMode.markUsed(); });

function requirePromoCodeAlert() {
  if (GodMode.isPromoActive()) return true;
  AudioSys.playHit();
  alert("🎟️ 此項永久特權需先兌換「活動優惠碼 (Promo Code)」！\n請前往「設置」輸入優惠碼解鎖。");
  return false;
}

bindClick("god-infcoin-btn", () => {
  if (!requirePromoCodeAlert()) return;
  GodMode.infiniteCoins = !GodMode.infiniteCoins;
  if (GodMode.infiniteCoins) { SaveSys.data.coins = 999999999; SaveSys.save(); updateMenuText(); renderShop(); }
  GodMode.markUsed();
});
bindClick("god-bc-inf-btn", () => {
  GodMode.infiniteBuildCoins = !GodMode.infiniteBuildCoins;
  if (GodMode.infiniteBuildCoins) { buildCoins = Math.max(buildCoins, 9999); updateBuildCoinsUI(); }
  GodMode.markUsed();
});
bindClick("god-bc-add-btn", () => { buildCoins += 1000; updateBuildCoinsUI(); GodMode.markUsed(); });
bindClick("god-unlock-all-btn", () => {
  if (!requirePromoCodeAlert()) return;
  HULL_SKINS.forEach(s => { if (!SaveSys.data.unlockedSkins.includes(s.id)) SaveSys.data.unlockedSkins.push(s.id); });
  SaveSys.save(); renderSkins(); AudioSys.playPowerup(); GodMode.markUsed();
});
bindClick("god-coin-btn", () => {
  if (!requirePromoCodeAlert()) return;
  SaveSys.data.coins += 100000; SaveSys.save();
  updateMenuText(); renderShop(); updateHUD(); AudioSys.playCoin(); GodMode.markUsed();
});
bindClick("god-lvl-btn", () => {
  if (player) {
    player.lvl++; player.pendingUpgrades++; updateHUD();
    if (state === "PLAY") triggerLevelUp();
  }
  GodMode.markUsed();
});
bindClick("god-boss-btn", () => { if (state === "PLAY") spawnEnemy(true); GodMode.markUsed(); });
bindClick("god-nuke-btn", () => { for (let i = enemies.length - 1; i >= 0; i--) handleEnemyDeath(enemies[i], i); GodMode.markUsed(); });

bindClick("hud-fullscreen-btn", () => OrientationMgr.requestLandscape());

// ============ 多人模式 UI ============
bindClick("open-mp-btn", () => {
  if (typeof MP !== "undefined") {
    MP.enterLobby();
  } else {
    alert("聯機模組未載入，請重新整理頁面或重啟 APP！");
  }
});

// 將第二個聯機按鈕也綁定，避免使用 HTML 的 onclick 導致重複觸發
bindClick("open-mp-btn-2", () => {
  if (typeof MP !== "undefined") {
    MP.enterLobby();
  }
});