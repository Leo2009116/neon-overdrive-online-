// ============================================================
// NEON OVERDRIVE ONLINE // multiplayer.js
// PVE + PVP 混合大亂鬥版 (終極完美修復)
// ============================================================

const MP = {
  active: false,
  isHost: false,
  myId: "",
  myName: "",
  myTeam: "red",
  players: {},
  bullets: [],
  obstacles: [],
  enemies: [],
  scores: { red: 0, blue: 0 },
  matchStart: 0,
  matchEnd: 0,
  finished: false,
  input: { mx: 0, my: 0, angle: 0, shoot: false },
  
  _tickTimer: null,
  _inputTimer: null,
  _fireTick: 0,
  _lastSent: 0,
  _enemySpawnTimer: 0,
  _hudCollapsed: false,

  resolveCollision(entity, radius) {
    for (const o of this.obstacles) {
      const d = Math.hypot(entity.x - o.x, entity.y - o.y);
      const minD = radius + o.r;
      if (d < minD && d > 0.01) {
        const a = Math.atan2(entity.y - o.y, entity.x - o.x);
        entity.x = o.x + Math.cos(a) * minD;
        entity.y = o.y + Math.sin(a) * minD;
      }
    }
  },

  scheduleRespawn(id) {
    setTimeout(() => {
      if (this.players[id] && !this.players[id].alive) {
        this.players[id].hp = MP_CONFIG.PLAYER_HP; 
        this.players[id].alive = true;
        this.players[id].x = MAP_SIZE / 2 + (Math.random() - 0.5) * 400;
        this.players[id].y = MAP_SIZE / 2 + (Math.random() - 0.5) * 400;
        this.resolveCollision(this.players[id], MP_CONFIG.PLAYER_RADIUS);
      }
    }, 3000);
  },

  // 已經存在於 HTML，這個函數作為備用防呆
  injectLobbyUI() {
    if (document.getElementById("mp-lobby-overlay")) return;
    // ... (省略，因為我們已經在 HTML 寫好了，這裡不再重複貼長代碼)
  },

  bindDynamicUI() {
    const bind = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
    bind("mp-leave-btn", () => this.exitLobby());
    bind("mp-leave-btn-2", () => this.exitLobby());
    
    bind("mp-create-btn", () => {
      document.getElementById("mp-mode-select").classList.add("hidden");
      this.setStatus("載入模組...");
      this.hostRoom();
    });
    
    bind("mp-join-btn", () => {
      document.getElementById("mp-mode-select").classList.add("hidden");
      document.getElementById("mp-join-form").classList.remove("hidden");
    });
    
    bind("mp-join-confirm-btn", () => {
      const codeEl = document.getElementById("mp-code-input");
      const code = (codeEl?.value || "").trim().toUpperCase();
      if (code.length !== 6) { alert("請輸入 6 位房間碼"); return; }
      document.getElementById("mp-join-form").classList.add("hidden");
      this.joinRoom(code);
    });
    
    bind("mp-copy-code-btn", () => {
      const el = document.getElementById("mp-room-code-display");
      if (el) {
        navigator.clipboard?.writeText(el.textContent).then(() => {
          AudioSys.playCoin();
          alert("房間碼已複製：" + el.textContent);
        }).catch(() => alert("請手動複製：" + el.textContent));
      }
    });
    
    bind("mp-start-btn", () => this.hostStartMatch());

    bind("mp-hud-collapse-btn", () => {
      const left = document.getElementById("mp-hud-left");
      const right = document.getElementById("mp-hud-right");
      const scoreBox = document.getElementById("mp-score-display");
      const timer = document.getElementById("mp-timer");
      const btn = document.getElementById("mp-hud-collapse-btn");
      
      this._hudCollapsed = !this._hudCollapsed;
      if (this._hudCollapsed) {
        left.style.display = "none";
        scoreBox.style.transform = "scale(0.6) translate(20px, -15px)";
        scoreBox.style.opacity = "0.3";
        timer.style.opacity = "0";
        right.style.background = "transparent";
        right.style.border = "none";
        right.style.boxShadow = "none";
        btn.textContent = "➕";
      } else {
        left.style.display = "flex";
        scoreBox.style.transform = "none";
        scoreBox.style.opacity = "1";
        timer.style.opacity = "1";
        right.style.background = "rgba(6,10,20,.92)";
        right.style.border = "1.5px solid var(--border-subtle)";
        right.style.boxShadow = "none";
        btn.textContent = "➖";
      }
    });
  },

  enterLobby() {
    this.injectLobbyUI();
    this.bindDynamicUI();
    this.active = false;
    document.getElementById("mp-lobby-overlay")?.classList.remove("hidden");
    this.renderLobbyPlayers();
    this.setStatus("—");
    document.getElementById("mp-mode-select")?.classList.remove("hidden");
    document.getElementById("mp-join-form")?.classList.add("hidden");
    document.getElementById("mp-room-code-box")?.classList.add("hidden");
    document.getElementById("mp-host-controls")?.classList.add("hidden");
  },

  exitLobby() {
    Net.disconnect();
    this.players = {}; this.bullets = []; this.obstacles = []; this.enemies = [];
    this.active = false;
    document.getElementById("mp-lobby-overlay")?.classList.add("hidden");
    document.getElementById("mp-hud")?.classList.add("hidden");
    document.getElementById("mp-result-overlay")?.classList.add("hidden");
    document.getElementById("menu-overlay")?.classList.remove("hidden");
    state = "MENU"; syncBodyStateAttr();
  },

  async hostRoom() {
    const name = (SaveSys.data.commanderName || "Commander").slice(0, 12);
    this.myName = name;
    this.isHost = true;
    this.myTeam = "red"; // 房主固定紅隊

    Net.init({
      onOpen: (code) => {
        this.myId = Net.myPeerId;
        this.players[this.myId] = {
          x: MAP_SIZE / 2, y: MAP_SIZE / 2,
          hp: MP_CONFIG.PLAYER_HP, team: this.myTeam,
          angle: 0, alive: true, name, lastUpdate: performance.now()
        };
        this.showRoomCode(code);
        this.setStatus("等待玩家加入...");
        this.renderLobbyPlayers();
      },
      onMessage: (data, conn) => this.hostHandleMessage(data, conn),
      onClose: () => this.setStatus("房主已離開房間"),
      onError: (e) => this.setStatus("❌ 連線失敗: " + (e?.message || e))
    });

    try { await Net.host(); } catch (e) { this.setStatus("❌ 連線失敗: " + (e?.message || e)); }
  },

  async joinRoom(code) {
    const name = (SaveSys.data.commanderName || "Commander").slice(0, 12);
    this.myName = name;
    this.isHost = false;

    this.setStatus("正在連線...");
    Net.init({
      onOpen: () => { this.myId = Net.myPeerId; Net.send({ type: "join", name }); },
      onMessage: (data) => this.clientHandleMessage(data),
      onClose: () => { this.setStatus("房主已離開房間"); setTimeout(() => this.exitLobby(), 2000); },
      onError: (e) => this.setStatus("❌ 連線失敗: " + (e?.message || e))
    });

    try { await Net.join(code); } catch (e) { this.setStatus("❌ 連線失敗: " + (e?.message || e)); }
  },

  showRoomCode(code) {
    const el = document.getElementById("mp-room-code-display"); if (el) el.textContent = code;
    const box = document.getElementById("mp-room-code-box"); if (box) box.classList.remove("hidden");
    const hostBtns = document.getElementById("mp-host-controls"); if (hostBtns) hostBtns.classList.remove("hidden");
  },

  setStatus(msg) { const el = document.getElementById("mp-status"); if (el) el.textContent = msg; },

  hostHandleMessage(data, conn) {
    if (!data || typeof data !== "object") return;

    if (data.type === "join") {
      const id = conn.peer;
      // ★ 強制將客機分配為藍隊！
      const team = "blue";

      this.players[id] = { x: MAP_SIZE / 2 + (Math.random() - 0.5) * 400, y: MAP_SIZE / 2 + (Math.random() - 0.5) * 400, hp: MP_CONFIG.PLAYER_HP, team, angle: 0, alive: true, name: (data.name || "Player").slice(0, 12), lastUpdate: performance.now() };
      Net.sendTo(conn, { type: "welcome", yourId: id, yourTeam: team });
      this.broadcastLobbyState(); this.renderLobbyPlayers();
    } else if (data.type === "input") {
      const p = this.players[conn.peer];
      if (p && this.active && p.alive) {
        p.x = data.x; 
        p.y = data.y;
        this.resolveCollision(p, MP_CONFIG.PLAYER_RADIUS);
        p.angle = data.angle || 0; p.lastUpdate = performance.now();
        if (data.shoot && !p._cooldown) { this.spawnBulletFor(p); p._cooldown = MP_CONFIG.FIRE_DELAY; }
      }
    } else if (data.type === "leave") {
      delete this.players[conn.peer]; this.broadcastLobbyState(); this.renderLobbyPlayers();
    }
  },

  broadcastLobbyState() {
    const list = Object.entries(this.players).map(([id, p]) => ({ id, name: p.name, team: p.team, hp: p.hp }));
    Net.broadcast({ type: "lobby", players: list, scores: this.scores });
  },

  clientHandleMessage(data) {
    if (!data || typeof data !== "object") return;
    if (data.type === "welcome") {
      this.myId = data.yourId; this.myTeam = data.yourTeam;
      this.setStatus("準備完成 · " + (this.myTeam === "red" ? "🔴 紅隊" : "🔵 藍隊"));
    } else if (data.type === "lobby") {
      const map = {};
      data.players.forEach(p => { map[p.id] = { x: (this.players[p.id] || {}).x || MAP_SIZE / 2, y: (this.players[p.id] || {}).y || MAP_SIZE / 2, hp: p.hp, team: p.team, angle: 0, alive: true, name: p.name, lastUpdate: performance.now() }; });
      this.players = map; if (data.scores) this.scores = data.scores; this.renderLobbyPlayers();
    } else if (data.type === "start") {
      this.obstacles = data.obstacles || [];
      this.players = {};
      data.players.forEach(p => { this.players[p.id] = { x: p.x, y: p.y, hp: p.hp, team: p.team, angle: 0, alive: true, name: p.name, lastUpdate: performance.now() }; });
      this.myTeam = data.teams[this.myId] || "blue";
      this.beginMatch();
    } else if (data.type === "state") {
      data.players.forEach(upd => {
        const p = this.players[upd.id];
        if (p) {
          if (upd.id === this.myId) {
            p.hp = upd.hp; 
            p.alive = upd.alive;
            if (!p.alive) { p.x = upd.x; p.y = upd.y; } 
            else if (Math.hypot(p.x - upd.x, p.y - upd.y) > 300) { p.x = upd.x; p.y = upd.y; }
          } else {
            p.x += (upd.x - p.x) * 0.4; 
            p.y += (upd.y - p.y) * 0.4;
            p.hp = upd.hp; p.alive = upd.alive; p.angle = upd.angle;
          }
        }
      });
      this.bullets = data.bullets || [];
      this.enemies = data.enemies || [];
      if (data.scores) this.scores = data.scores;
      if (data.finished && !this.finished) this.endMatch(data.winner);
      this.updateMPHud();
    } else if (data.type === "error") { this.setStatus(data.msg || "錯誤"); }
  },

  spawnBulletFor(p) {
    const ang = p.angle || 0;
    this.bullets.push({ 
      x: p.x + Math.cos(ang) * 20, 
      y: p.y + Math.sin(ang) * 20, 
      vx: Math.cos(ang) * MP_CONFIG.BULLET_SPEED, 
      vy: Math.sin(ang) * MP_CONFIG.BULLET_SPEED, 
      ownerId: p === this.players[this.myId] ? this.myId : p.id,
      team: p.team, 
      r: MP_CONFIG.BULLET_RADIUS + 3, // ★ 子彈體積加大
      alive: true 
    });
  },

  hostStartMatch() {
    if (!this.isHost) return;
    if (Object.keys(this.players).length < 1) { alert("至少需要 1 名玩家"); return; }
    
    const obs = [];
    let attempts = 0;
    while (obs.length < 60 && attempts < 2000) {
      attempts++;
      const r = 40 + Math.random() * 80;
      const x = 300 + Math.random() * (MAP_SIZE - 600);
      const y = 300 + Math.random() * (MAP_SIZE - 600);
      if (Math.hypot(x - MAP_SIZE / 2, y - MAP_SIZE / 2) < 400) continue; 
      let overlap = false;
      for (const o of obs) {
        if (Math.hypot(x - o.x, y - o.y) < r + o.r + 30) { overlap = true; break; }
      }
      if (!overlap) obs.push({ x, y, r });
    }
    this.obstacles = obs;

    const teams = {}; const playerList = []; let redIdx = 0, blueIdx = 0;
    Object.entries(this.players).forEach(([id, p]) => {
      let sx, sy;
      if (p.team === "red") { sx = 400 + redIdx * 120; sy = MAP_SIZE / 2 + 400; redIdx++; }
      else { sx = 400 + blueIdx * 120; sy = MAP_SIZE / 2 - 400; blueIdx++; }
      p.x = sx; p.y = sy; p.hp = MP_CONFIG.PLAYER_HP; p.alive = true;
      teams[id] = p.team; playerList.push({ id, x: sx, y: sy, hp: p.hp, team: p.team, name: p.name });
    });

    this.matchStart = Date.now(); this.matchEnd = this.matchStart + MP_CONFIG.MATCH_DURATION;
    this.scores = { red: 0, blue: 0 }; this.finished = false; this.bullets = [];
    this.enemies = [];
    this._enemySpawnTimer = 0;

    Net.broadcast({ type: "start", obstacles: this.obstacles, players: playerList, teams });
    this.beginMatch();
  },

  beginMatch() {
    this.active = true;
    document.getElementById("mp-lobby-overlay")?.classList.add("hidden");
    document.getElementById("mp-hud")?.classList.remove("hidden");
    document.getElementById("hud")?.classList.add("hidden");
    document.getElementById("build-fab-wrap")?.classList.add("hidden");
    document.getElementById("active-skills-hud")?.classList.add("hidden");
    state = "PLAY"; syncBodyStateAttr();
    
    if (this.isHost) this._tickTimer = setInterval(() => this.hostTick(), 1000 / MP_CONFIG.TICK_RATE);
    if (!this.isHost) this._inputTimer = setInterval(() => this.clientSendInput(), 1000 / MP_CONFIG.INPUT_RATE);
    
    this.bindInput(); this.updateMPHud(); this.loopStart = performance.now(); this.fireCooldown = 0;
  },

  hostTick() {
    if (!this.active) return;
    const now = Date.now();
    if (now > this.matchEnd && !this.finished) {
      const winner = this.scores.red > this.scores.blue ? "red" : this.scores.blue > this.scores.red ? "blue" : "draw";
      this.finished = true; this.broadcastState(winner); this.endMatch(winner); return;
    }

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx; b.y += b.vy;
      
      let hit = false;
      for (const o of this.obstacles) {
        if (Math.hypot(b.x - o.x, b.y - o.y) < o.r + b.r) { hit = true; break; }
      }
      
      for (let j = this.enemies.length - 1; j >= 0; j--) {
        const e = this.enemies[j];
        if (Math.hypot(b.x - e.x, b.y - e.y) < e.r + b.r + 10) { 
          e.hp -= MP_CONFIG.BULLET_DMG; hit = true;
          if (e.hp <= 0) { this.scores[b.team] += 1; this.enemies.splice(j, 1); }
          break;
        }
      }
      
      // ★ 修復：打中玩家的判定範圍大幅增加 (原本 +15，現在 +35)
      if (!hit) {
        for (const [id, p] of Object.entries(this.players)) {
          if (!p.alive || p.team === b.team) continue;
          if (Math.hypot(b.x - p.x, b.y - p.y) < MP_CONFIG.PLAYER_RADIUS + b.r + 35) {
            p.hp -= MP_CONFIG.BULLET_DMG; 
            hit = true;
            if (p.hp <= 0) {
              p.hp = 0; p.alive = false; 
              if (this.scores[b.team] !== undefined) this.scores[b.team]++;
              this.scheduleRespawn(id);
            }
            break;
          }
        }
      }

      if (hit || b.x < 0 || b.x > MAP_SIZE || b.y < 0 || b.y > MAP_SIZE) {
        this.bullets.splice(i, 1);
      }
    }

    this._enemySpawnTimer++;
    if (this._enemySpawnTimer > 40) { 
      this._enemySpawnTimer = 0;
      if (this.enemies.length < 30) { 
        const ang = Math.random() * Math.PI * 2;
        const dist = 600 + Math.random() * 400;
        this.enemies.push({
          id: Math.random(),
          x: Math.max(50, Math.min(MAP_SIZE - 50, MAP_SIZE / 2 + Math.cos(ang) * dist)),
          y: Math.max(50, Math.min(MAP_SIZE - 50, MAP_SIZE / 2 + Math.sin(ang) * dist)),
          hp: 50, maxHp: 50, speed: 2.8, r: 18
        });
      }
    }

    for (let j = this.enemies.length - 1; j >= 0; j--) {
      const e = this.enemies[j];
      let targetId = null; let target = null; let minD = 99999;
      for (const [id, p] of Object.entries(this.players)) {
        if (!p.alive) continue;
        const d = Math.hypot(p.x - e.x, p.y - e.y);
        if (d < minD) { minD = d; target = p; targetId = id; }
      }
      
      if (target) {
        const a = Math.atan2(target.y - e.y, target.x - e.x);
        e.x += Math.cos(a) * e.speed;
        e.y += Math.sin(a) * e.speed;
        this.resolveCollision(e, e.r);

        if (Math.hypot(e.x - target.x, e.y - target.y) < e.r + MP_CONFIG.PLAYER_RADIUS + 10) {
          target.hp -= 20; e.hp -= 30; 
          if (target.hp <= 0) { 
            target.hp = 0; target.alive = false; 
            this.scheduleRespawn(targetId);
          }
          if (e.hp <= 0) this.enemies.splice(j, 1);
        }
      }
    }

    for (const p of Object.values(this.players)) { if (p._cooldown > 0) p._cooldown--; }

    if (!this.finished && (this.scores.red >= MP_CONFIG.WIN_SCORE || this.scores.blue >= MP_CONFIG.WIN_SCORE)) {
      this.finished = true; const winner = this.scores.red >= MP_CONFIG.WIN_SCORE ? "red" : "blue";
      this.broadcastState(winner); this.endMatch(winner); return;
    }

    this.broadcastState();
  },

  broadcastState(winner) {
    const playersUpd = Object.entries(this.players).map(([id, p]) => ({ id, x: p.x, y: p.y, hp: p.hp, alive: p.alive, angle: p.angle }));
    const bulletsUpd = this.bullets.map(b => ({ x: b.x, y: b.y, vx: b.vx, vy: b.vy, team: b.team, r: b.r }));
    const enemiesUpd = this.enemies.map(e => ({ x: e.x, y: e.y, hp: e.hp, maxHp: e.maxHp, r: e.r }));
    
    Net.broadcast({ type: "state", players: playersUpd, bullets: bulletsUpd, enemies: enemiesUpd, scores: this.scores, finished: this.finished, winner });
    this.updateMPHud();
  },

  clientSendInput() {
    if (!this.active || this.isHost) return;
    const me = this.players[this.myId];
    if (!me || !me.alive) return;
    Net.send({ type: "input", x: me.x, y: me.y, angle: me.angle, shoot: this.input.shoot });
    if (this.input.shoot && this.fireCooldown <= 0) this.fireCooldown = MP_CONFIG.FIRE_DELAY;
  },

  bindInput() {
    if (this._inputBound) return;
    this._inputBound = true; this._keys = {}; this._mouseAngle = 0;
    window.addEventListener("keydown", e => { if (!this.active) return; this._keys[e.code] = true; if (e.code === "KeyJ" || e.code === "Space") this.input.shoot = true; });
    window.addEventListener("keyup", e => { if (!this.active) return; this._keys[e.code] = false; if (e.code === "KeyJ" || e.code === "Space") this.input.shoot = false; });
    this._touch = { active: false, id: null, sx: 0, sy: 0, dx: 0, dy: 0 };
    const cvs = document.getElementById("gameCanvas");
    if (!cvs) return;
    cvs.addEventListener("touchstart", e => {
      if (!this.active) return;
      for (const t of e.changedTouches) {
        if (!this._touch.active) { this._touch.active = true; this._touch.id = t.identifier; this._touch.sx = t.clientX; this._touch.sy = t.clientY; this._touch.dx = 0; this._touch.dy = 0; }
      }
    }, { passive: true });
    cvs.addEventListener("touchmove", e => {
      if (!this.active || !this._touch.active) return;
      for (const t of e.changedTouches) {
        if (t.identifier === this._touch.id) {
          const dx = t.clientX - this._touch.sx, dy = t.clientY - this._touch.sy;
          const d = Math.hypot(dx, dy), maxR = 60;
          this._touch.dx = dx / Math.max(1, d) * Math.min(1, d / maxR);
          this._touch.dy = dy / Math.max(1, d) * Math.min(1, d / maxR);
        }
      }
    }, { passive: true });
    const endT = () => { this._touch.active = false; this._touch.dx = 0; this._touch.dy = 0; };
    cvs.addEventListener("touchend", endT); cvs.addEventListener("touchcancel", endT);
    cvs.addEventListener("mousedown", e => {
      if (!this.active) return; this.input.shoot = true;
      const rect = cvs.getBoundingClientRect();
      this._mouseAngle = Math.atan2(e.clientY - rect.top - H / 2, e.clientX - rect.left - W / 2);
    });
    cvs.addEventListener("mouseup", () => { this.input.shoot = false; });
    cvs.addEventListener("mousemove", e => {
      if (!this.active) return;
      const rect = cvs.getBoundingClientRect();
      this._mouseAngle = Math.atan2(e.clientY - rect.top - H / 2, e.clientX - rect.left - W / 2);
    });
  },

  stepLocal() {
    if (!this.active) return;
    const me = this.players[this.myId];
    if (!me || !me.alive) return;

    if (this.fireCooldown > 0) this.fireCooldown--;
    
    let mx = 0, my = 0;
    if (this._keys?.["KeyW"] || this._keys?.["ArrowUp"]) my -= 1;
    if (this._keys?.["KeyS"] || this._keys?.["ArrowDown"]) my += 1;
    if (this._keys?.["KeyA"] || this._keys?.["ArrowLeft"]) mx -= 1;
    if (this._keys?.["KeyD"] || this._keys?.["ArrowRight"]) mx += 1;
    if (this._touch?.active) { mx = this._touch.dx; my = this._touch.dy; }

    const len = Math.hypot(mx, my);
    if (len > 0) {
      const nx = mx / Math.max(1, len), ny = my / Math.max(1, len);
      const spd = MP_CONFIG.PLAYER_SPEED;
      me.x = Math.max(0, Math.min(MAP_SIZE, me.x + nx * spd));
      me.y = Math.max(0, Math.min(MAP_SIZE, me.y + ny * spd));
      this.resolveCollision(me, MP_CONFIG.PLAYER_RADIUS);
      me.x = Math.max(0, Math.min(MAP_SIZE, me.x));
      me.y = Math.max(0, Math.min(MAP_SIZE, me.y));
    }
    
    me.angle = this._mouseAngle; this.input.angle = me.angle;
    if (this.isHost && this.input.shoot && this.fireCooldown <= 0) { this.spawnBulletFor(me); this.fireCooldown = MP_CONFIG.FIRE_DELAY; }
    this.input.mx = mx; this.input.my = my;
  },

  endMatch(winner) {
    if (this._tickTimer) { clearInterval(this._tickTimer); this._tickTimer = null; }
    if (this._inputTimer) { clearInterval(this._inputTimer); this._inputTimer = null; }
    const overlay = document.getElementById("mp-result-overlay");
    if (overlay) {
      overlay.classList.remove("hidden");
      const titleEl = document.getElementById("mp-result-title");
      if (titleEl) {
        if (winner === "draw") titleEl.textContent = "🤝 平局";
        else if (winner === this.myTeam) titleEl.textContent = "🎉 勝利！";
        else titleEl.textContent = "💀 戰敗";
        titleEl.style.color = (winner === this.myTeam) ? "var(--success)" : "var(--danger)";
      }
      const scoreEl = document.getElementById("mp-result-score");
      if (scoreEl) scoreEl.textContent = `🔴 ${this.scores.red} : ${this.scores.blue} 🔵`;
    }
    this.active = false;
  },

  updateMPHud() {
    const redScore = document.getElementById("mp-red-score"); if (redScore) redScore.textContent = this.scores.red;
    const blueScore = document.getElementById("mp-blue-score"); if (blueScore) blueScore.textContent = this.scores.blue;
    const myHp = document.getElementById("mp-my-hp"); const me = this.players[this.myId];
    if (myHp && me) myHp.textContent = `${Math.ceil(me.hp)}/${MP_CONFIG.PLAYER_HP}`;
    const myHpBar = document.getElementById("mp-my-hp-bar"); if (myHpBar && me) myHpBar.style.width = `${Math.max(0, (me.hp / MP_CONFIG.PLAYER_HP) * 100)}%`;
    const myTeamEl = document.getElementById("mp-my-team");
    if (myTeamEl) { myTeamEl.textContent = this.myTeam === "red" ? "🔴 紅隊" : "🔵 藍隊"; myTeamEl.style.color = this.myTeam === "red" ? "#ff0055" : "#00aaff"; }
    const timerEl = document.getElementById("mp-timer");
    if (timerEl) { const remain = Math.max(0, Math.ceil((this.matchEnd - Date.now()) / 1000)); timerEl.textContent = `${Math.floor(remain / 60)}:${String(remain % 60).padStart(2, "0")}`; }
  },

  renderLobbyPlayers() {
    const box = document.getElementById("mp-player-list");
    if (!box) return;
    box.innerHTML = "";
    Object.entries(this.players).forEach(([id, p]) => {
      const div = document.createElement("div");
      div.style.cssText = `padding:8px;border-radius:8px;margin-bottom:6px;border:1.5px solid ${p.team === "red" ? "#ff0055" : "#00aaff"};background:rgba(12,18,34,.9);font-size:.82rem;display:flex;justify-content:space-between;`;
      div.innerHTML = `<span>${p.team === "red" ? "🔴" : "🔵"} ${p.name}${id === Net.myPeerId ? " (你)" : ""}</span><span style="color:${p.team === "red" ? "#ff0055" : "#00aaff"};font-weight:800;">${p.team === "red" ? "RED" : "BLUE"}</span>`;
      box.appendChild(div);
    });
  },

  draw() {
    ctx.fillStyle = "#04060c"; ctx.fillRect(0, 0, W, H);
    const me = this.players[this.myId];
    if (!me) return;
    let camX = Math.max(0, Math.min(MAP_SIZE - W, me.x - W / 2));
    let camY = Math.max(0, Math.min(MAP_SIZE - H, me.y - H / 2));
    if (W >= MAP_SIZE) camX = (MAP_SIZE - W) / 2;
    if (H >= MAP_SIZE) camY = (MAP_SIZE - H) / 2;
    
    ctx.save(); ctx.translate(-camX, -camY);
    
    ctx.strokeStyle = "rgba(0,243,255,.05)"; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = 0; x <= MAP_SIZE; x += 100) { ctx.moveTo(x, 0); ctx.lineTo(x, MAP_SIZE); }
    for (let y = 0; y <= MAP_SIZE; y += 100) { ctx.moveTo(0, y); ctx.lineTo(MAP_SIZE, y); }
    ctx.stroke();
    ctx.strokeStyle = "#ff0055"; ctx.lineWidth = 4; ctx.strokeRect(0, 0, MAP_SIZE, MAP_SIZE);

    this.obstacles.forEach(o => { if (window.NeonDecor?.renderObstacle) window.NeonDecor.renderObstacle(ctx, o, !SaveSys.data.settings.neonGlow); });

    this.enemies.forEach(e => {
      ctx.save(); ctx.translate(e.x, e.y);
      ctx.beginPath(); ctx.arc(0, 0, e.r, 0, Math.PI * 2);
      ctx.fillStyle = "#1a0a2a"; ctx.fill();
      ctx.strokeStyle = "#ff00aa"; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = "#ff00aa"; ctx.beginPath(); ctx.arc(-5, -3, 4, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(5, -3, 4, 0, Math.PI*2); ctx.fill();
      if (e.hp < e.maxHp) {
        ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.fillRect(-18, -e.r - 10, 36, 5);
        ctx.fillStyle = "#ff00aa"; ctx.fillRect(-18, -e.r - 10, 36 * (e.hp / e.maxHp), 5);
      }
      ctx.restore();
    });

    Object.entries(this.players).forEach(([id, p]) => {
      if (id === this.myId) return;
      if (!p.alive) {
        ctx.save(); ctx.globalAlpha = 0.4; ctx.fillStyle = p.team === "red" ? "#ff0055" : "#00aaff"; ctx.font = "bold 12px Orbitron, sans-serif"; ctx.textAlign = "center"; ctx.fillText("☠️ " + (p.name || "Player"), p.x, p.y); ctx.restore(); return;
      }
      if (window.NeonDecor?.renderRemotePlayer) window.NeonDecor.renderRemotePlayer(ctx, p, !SaveSys.data.settings.neonGlow);
    });

    if (me.alive) {
      if (window.NeonDecor?.renderRemotePlayer) {
        ctx.save(); ctx.translate(me.x, me.y); ctx.rotate(me.angle); ctx.scale(1, 0.86);
        const teamCol = this.myTeam === "red" ? "#ff0055" : "#00aaff";
        ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-12, -12); ctx.lineTo(-6, 0); ctx.lineTo(-12, 12); ctx.closePath();
        ctx.fillStyle = "#060a14"; ctx.fill();
        ctx.strokeStyle = teamCol; ctx.lineWidth = 2.5; ctx.shadowColor = teamCol; ctx.shadowBlur = 10; ctx.stroke(); ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill(); ctx.restore();
        ctx.fillStyle = teamCol; ctx.font = "bold 11px Orbitron, sans-serif"; ctx.textAlign = "center"; ctx.fillText(this.myName + " (You)", me.x, me.y - 28);
        const bw = 40; ctx.fillStyle = "rgba(0,0,0,.7)"; ctx.fillRect(me.x - bw / 2, me.y - 24, bw, 5);
        ctx.fillStyle = teamCol; ctx.fillRect(me.x - bw / 2, me.y - 24, bw * (me.hp / MP_CONFIG.PLAYER_HP), 5);
      }
    } else {
      ctx.save(); ctx.fillStyle = "rgba(255,0,85,.7)"; ctx.font = "bold 16px Orbitron, sans-serif"; ctx.textAlign = "center"; ctx.fillText("☠️ 重生中(3s)...", me.x, me.y - 30); ctx.restore();
    }

    this.bullets.forEach(b => {
      const col = b.team === "red" ? "#ff3366" : "#33aaff";
      ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = 12; ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    });

    ctx.restore();
    this.drawMPMinimap();
  },

  drawMPMinimap() {
    const size = Math.min(140, W * 0.2); const x0 = 12, y0 = 128; const k = size / MAP_SIZE;
    ctx.save(); ctx.globalAlpha = 0.92; ctx.fillStyle = "rgba(4,6,12,.85)"; ctx.fillRect(x0, y0, size, size);
    ctx.strokeStyle = "rgba(0,243,255,.6)"; ctx.lineWidth = 1.5; ctx.strokeRect(x0, y0, size, size);
    
    this.obstacles.forEach(o => { ctx.fillStyle = "rgba(255,128,255,.3)"; ctx.beginPath(); ctx.arc(x0 + o.x * k, y0 + o.y * k, Math.max(1, o.r * k), 0, Math.PI * 2); ctx.fill(); });
    this.enemies.forEach(e => { ctx.fillStyle = "#ff00aa"; ctx.beginPath(); ctx.arc(x0 + e.x * k, y0 + e.y * k, 2, 0, Math.PI * 2); ctx.fill(); });
    
    Object.entries(this.players).forEach(([id, p]) => {
      if (!p.alive) return; ctx.fillStyle = id === this.myId ? "#ffee00" : (p.team === "red" ? "#ff0055" : "#00aaff");
      ctx.beginPath(); ctx.arc(x0 + p.x * k, y0 + p.y * k, id === this.myId ? 4 : 3, 0, Math.PI * 2); ctx.fill();
    });
    ctx.restore();
  }
};