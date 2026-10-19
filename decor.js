// ============================================================
// NEON OVERDRIVE ONLINE // decor.js
// 2.5D 霓虹渲染
// ============================================================
(function () {
  const style = document.createElement("style");
  style.id = "neon-decor-theme";
  style.textContent = `
    :root{
      --bg-main:#04060c; --bg-panel:rgba(6,10,20,.95); --bg-card:rgba(12,18,34,.9);
      --border-subtle:rgba(0,243,255,.35); --accent:#00f3ff;
      --neon-pink:#ff007f; --success:#00ff9d; --warning:#ffee00;
      --danger:#ff0055; --purple:#b829ff;
    }
  `;
  document.head.appendChild(style);

  function drawPoly(ctx, sides, radius, rot = 0) {
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = rot + (i * Math.PI * 2) / sides;
      const x = Math.cos(a) * radius, y = Math.sin(a) * radius;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function drawGroundShadow(ctx, x, y, r, alpha = 0.28) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.78, r * 0.92, r * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawGlowStroke(ctx, color, width, glowWidth, lowGlow) {
    if (!lowGlow) {
      ctx.save();
      ctx.strokeStyle = color; ctx.globalAlpha = 0.22; ctx.lineWidth = glowWidth;
      ctx.stroke(); ctx.restore();
    }
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
  }

  function drawShipModel(ctx, model, accent, r) {
    ctx.beginPath();
    switch (model) {
      case "starlight":
        for (let i = 0; i < 12; i++) {
          const a = (i * Math.PI) / 6 - Math.PI / 2;
          const rad = i % 2 === 0 ? r * 1.25 : r * 0.55;
          const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath(); break;
      case "void":
        ctx.arc(0, 0, r * 1.05, 0, Math.PI * 2);
        ctx.moveTo(r * 0.45, 0);
        ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2); break;
      case "tempest":
        ctx.moveTo(r * 1.3, 0); ctx.lineTo(-r * 0.3, -r * 0.9);
        ctx.lineTo(-r * 0.05, 0); ctx.lineTo(-r * 0.3, r * 0.9);
        ctx.closePath(); ctx.moveTo(-r * 0.95, 0); ctx.lineTo(r * 0.05, 0); break;
      case "nova":
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4;
          const rad = i % 2 === 0 ? r * 1.3 : r * 0.5;
          const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath(); break;
      case "phantom":
        ctx.moveTo(r * 1.25, 0); ctx.lineTo(0, -r * 0.95);
        ctx.lineTo(-r * 0.85, 0); ctx.lineTo(0, r * 0.95);
        ctx.closePath(); break;
      case "crimson":
        ctx.moveTo(r * 1.35, 0); ctx.lineTo(-r * 0.55, -r * 0.85);
        ctx.lineTo(-r * 0.2, 0); ctx.lineTo(-r * 0.55, r * 0.85);
        ctx.closePath(); break;
      case "gold": drawPoly(ctx, 6, r * 1.1, Math.PI / 6); break;
      case "emerald":
        ctx.moveTo(r * 1.1, 0); ctx.lineTo(-r * 0.2, -r * 0.95);
        ctx.lineTo(-r * 0.85, -r * 0.35); ctx.lineTo(-r * 0.45, 0);
        ctx.lineTo(-r * 0.85, r * 0.35); ctx.lineTo(-r * 0.2, r * 0.95);
        ctx.closePath(); break;
      default:
        ctx.moveTo(r * 1.25, 0); ctx.lineTo(-r * 0.75, -r * 0.75);
        ctx.lineTo(-r * 0.4, 0); ctx.lineTo(-r * 0.75, r * 0.75);
        ctx.closePath(); break;
    }
  }

  window.NeonDecor = {
    maxDpr: 3,
    bgColor: "#04060c",
    buildingColors: { TURRET: "#ff0055", TESLA: "#00f3ff", HEAL: "#00ff9d", MINER: "#ffee00", WALL: "#38bdf8", VORTEX: "#b829ff" },

    renderPlayerShip(ctx, player, skin, diy, lowGlow, isInvincible) {
      drawGroundShadow(ctx, player.x, player.y, player.r || 16, 0.32);
      ctx.save();
      ctx.translate(player.x, player.y);
      ctx.rotate(player.angle);
      ctx.scale(1, 0.86);
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      const accent = isInvincible ? "#ffee00" : (skin.color || player.skinColor || "#00f3ff");
      drawShipModel(ctx, skin.model || "vanguard", accent, player.r || 16);
      ctx.fillStyle = "#060a14"; ctx.fill();
      drawGlowStroke(ctx, accent, 2.2, 6, lowGlow);
      ctx.beginPath();
      ctx.arc(0, 0, (player.r || 16) * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = "#fff"; ctx.fill();
      ctx.restore();
    },

    renderBuilding(ctx, b, diyShape = "HEX", diyTurretColor = "#00ff9d", lowGlow = false) {
      const accent = b.hitFlash > 0 ? "#fff"
        : (b.type === "TURRET" ? (diyTurretColor || "#ff0055") : (this.buildingColors[b.type] || "#00f3ff"));
      const sides = diyShape === "OCTA" ? 8 : diyShape === "TRI" ? 3 : 6;
      const baseRadius = b.r || 20;
      const timeSec = (b.tick || 0) * 0.05;
      const baseRot = sides === 3 ? -Math.PI / 2 : sides === 8 ? Math.PI / 8 : 0;

      drawGroundShadow(ctx, b.x, b.y, baseRadius, 0.3);
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.scale(1, 0.9);
      ctx.lineJoin = "round"; ctx.lineCap = "round";

      drawPoly(ctx, sides, baseRadius, baseRot);
      ctx.fillStyle = "#060a14"; ctx.fill();
      drawGlowStroke(ctx, accent, 2, 5.5, lowGlow);

      if (b.type === "TURRET") {
        ctx.save();
        ctx.rotate(b.aimAngle || 0);
        const recoil = Math.max(0, b.recoil || 0) * 4;
        ctx.beginPath();
        ctx.moveTo(4 - recoil, 0); ctx.lineTo(baseRadius + 7 - recoil, 0);
        if (!lowGlow) {
          ctx.strokeStyle = accent; ctx.globalAlpha = 0.3; ctx.lineWidth = 7; ctx.stroke(); ctx.globalAlpha = 1;
        }
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, Math.PI * 2);
        ctx.fillStyle = "#060a14"; ctx.fill();
        ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.stroke();
        ctx.restore();
      } else if (b.type === "TESLA") {
        ctx.beginPath(); ctx.arc(0, 0, 9 + Math.sin(timeSec * 3) * 1.5, 0, Math.PI * 2);
        ctx.strokeStyle = accent; ctx.lineWidth = 1.6; ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, 3.8, 0, Math.PI * 2);
        ctx.fillStyle = "#fff"; ctx.fill();
      } else if (b.type === "HEAL") {
        const s = 7.5;
        ctx.beginPath();
        ctx.moveTo(-s, 0); ctx.lineTo(s, 0);
        ctx.moveTo(0, -s); ctx.lineTo(0, s);
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 3.2; ctx.stroke();
      } else if (b.type === "MINER") {
        ctx.save(); ctx.rotate(timeSec * 0.9);
        drawPoly(ctx, 4, 8.5, 0);
        ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.stroke();
        ctx.restore();
      } else if (b.type === "WALL") {
        drawPoly(ctx, sides, baseRadius * 0.62, baseRot);
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.6; ctx.stroke();
      } else if (b.type === "VORTEX") {
        ctx.save(); ctx.rotate(-timeSec * 2);
        for (let i = 0; i < 2; i++) {
          const a = i * Math.PI;
          ctx.beginPath(); ctx.arc(0, 0, 9.5, a, a + 1.8);
          ctx.strokeStyle = i === 0 ? accent : "#ff007f";
          ctx.lineWidth = 2.2; ctx.stroke();
        }
        ctx.restore();
      }

      if (b.hp < b.maxHp) {
        const barW = 26, barH = 3;
        const pct = Math.max(0, Math.min(1, b.hp / b.maxHp));
        ctx.fillStyle = "rgba(6,10,20,.9)";
        ctx.fillRect(-barW / 2, -baseRadius - 9, barW, barH);
        ctx.fillStyle = pct > 0.5 ? "#00ff9d" : pct > 0.25 ? "#ffee00" : "#ff0055";
        ctx.fillRect(-barW / 2, -baseRadius - 9, barW * pct, barH);
      }
      ctx.restore();
    },

    renderEnemy(ctx, e, lowGlow) {
      drawGroundShadow(ctx, e.x, e.y, e.r || 14, 0.26);
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle || 0);
      ctx.scale(1, 0.88);
      ctx.lineJoin = "round";
      const eCol = e.stunTick > 0 ? "#64748b" : (e.color || "#ff0055");
      ctx.beginPath();
      if (e.type === "BOSS") {
        for (let k = 0; k < 8; k++) {
          const a = (k * Math.PI) / 4;
          const rad = k % 2 === 0 ? e.r : e.r * 0.65;
          if (k === 0) ctx.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
          else ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
        }
        ctx.closePath();
      } else if (e.type === "SPEEDER") {
        ctx.moveTo(e.r * 1.15, 0); ctx.lineTo(-e.r, -e.r * 0.8);
        ctx.lineTo(-e.r * 0.45, 0); ctx.lineTo(-e.r, e.r * 0.8);
        ctx.closePath();
      } else if (e.type === "TANK") {
        drawPoly(ctx, 6, e.r, 0);
      } else if (e.type === "SNIPER") {
        drawPoly(ctx, 4, e.r * 1.1, 0);
      } else {
        ctx.arc(0, 0, e.r, 0, Math.PI * 2);
      }
      ctx.fillStyle = "#060a14"; ctx.fill();
      drawGlowStroke(ctx, eCol, 2, 5, lowGlow);
      ctx.restore();
    },

    // 多人模式專用：繪製玩家（不同於自己，帶隊伍顏色）
    renderRemotePlayer(ctx, p, lowGlow) {
      drawGroundShadow(ctx, p.x, p.y, MP_CONFIG.PLAYER_RADIUS, 0.32);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle || 0);
      ctx.scale(1, 0.86);
      ctx.lineJoin = "round";
      const teamCol = p.team === "red" ? "#ff0055" : "#00aaff";
      // 三角形戰機
      ctx.beginPath();
      ctx.moveTo(18, 0); ctx.lineTo(-12, -12); ctx.lineTo(-6, 0); ctx.lineTo(-12, 12);
      ctx.closePath();
      ctx.fillStyle = "#060a14"; ctx.fill();
      drawGlowStroke(ctx, teamCol, 2.2, 6, lowGlow);
      // 隊伍箭頭
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#fff"; ctx.fill();
      ctx.restore();
      // 名字
      ctx.save();
      ctx.fillStyle = teamCol;
      ctx.font = "bold 11px Orbitron, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(p.name || "???", p.x, p.y - MP_CONFIG.PLAYER_RADIUS - 10);
      if (p.hp < MP_CONFIG.PLAYER_HP) {
        const bw = 34, bh = 4;
        ctx.fillStyle = "rgba(0,0,0,.7)";
        ctx.fillRect(p.x - bw / 2, p.y - MP_CONFIG.PLAYER_RADIUS - 7, bw, bh);
        ctx.fillStyle = teamCol;
        ctx.fillRect(p.x - bw / 2, p.y - MP_CONFIG.PLAYER_RADIUS - 7, bw * (p.hp / MP_CONFIG.PLAYER_HP), bh);
      }
      ctx.restore();
    },

    // 多人模式：繪製障礙物
    renderObstacle(ctx, o, lowGlow) {
      drawGroundShadow(ctx, o.x, o.y, o.r, 0.4);
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.scale(1, 0.9);
      // 六邊形障礙物
      drawPoly(ctx, 6, o.r, Math.PI / 6);
      ctx.fillStyle = "#0a1220";
      ctx.fill();
      drawGlowStroke(ctx, "#ff80ff", 2.5, 8, lowGlow);
      // 內部紋路
      drawPoly(ctx, 6, o.r * 0.6, Math.PI / 6);
      ctx.strokeStyle = "rgba(255,128,255,.35)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }
  };
})();