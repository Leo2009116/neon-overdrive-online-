// ============================================================
// NEON OVERDRIVE ONLINE // main.js
// 初始化 + 主循環
// ============================================================

document.addEventListener("neon-ready", () => {
  applyTranslations();
  renderSkins();
  renderShop();
  updateMenuText();
  syncBodyStateAttr();
  SettingsSys.syncUI();
  buildRadial();
  buildTeleportGrid();

  try {
    const base = localStorage.getItem("neon_hot_base") || "";
    const input = document.getElementById("hot-base-input");
    if (input) input.value = base;
  } catch (e) {}

  setInterval(() => {
    if (GodMode.infiniteCoins) {
      SaveSys.data.coins = 999999999;
      updateMenuText();
    }
  }, 600);

  document.addEventListener("click", (e) => {
    if (!radialOpen) return;
    const fab = document.getElementById("build-fab");
    const radial = document.getElementById("build-radial");
    if (fab && fab.contains(e.target)) return;
    if (radial && radial.contains(e.target)) return;
    toggleRadial(false);
  });

  requestAnimationFrame(gameLoop);
});

let _mpPrevState = null;

function gameLoop(time) {
  // ★ 多人模式優先處理
  if (typeof MP !== "undefined" && MP.active) {
    MP.stepLocal();
    MP.draw();
    // HUD 定時刷新（主機已在 tick 更新，客端用本地步進）
    if (!MP.isHost) {
      MP.updateMPHud();
    }
    requestAnimationFrame(gameLoop);
    return;
  }

  if (state === "PLAY") {
    if (slowmoTick > 0) { slowmoTick--; timeScale = 0.35; }
    else timeScale = 1;

    ParrySys.update();

    const loops = GodMode.speedMult || 1;
    for (let i = 0; i < loops; i++) {
      if (state !== "PLAY") break;
      stepSimulation();
    }
  }
  draw();
  requestAnimationFrame(gameLoop);
}