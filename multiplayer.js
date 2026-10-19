// ============================================================
// NEON OVERDRIVE ONLINE // multiplayer.js
// 多人 / 團隊對戰模式（含場景障礙物）
// ============================================================

const MP = {
  active: false,
  isHost: false,
  myId: "",
  myName: "",
  myTeam: "red",
  players: {},        // id -> { x, y, hp, team, angle, alive, name, lastUpdate }
  bullets: [],        // 主機權威：{ x, y, vx, vy, owner, team, r, alive }
  obstacles: [],
  scores: { red: 0, blue: 0 },
  matchStart: 0,
  matchEnd: 0,
  finished: false,

  // 本地輸入狀態
  input: { mx: 0, my: 0, angle: 0, shoot: false },

  // 主機端計時
  _tickTimer: null,
  _inputTimer: null,
  _fireTick: 0,
  _lastSent: 0,

  // ============ 進入/離開 ============
  enterLobby() {
    this.active = false;
    document.getElementById("mp-lobby-overlay")?.classList.remove("hidden");
    this.renderLobbyPlayers();
  },

  exitLobby() {
    Net.disconnect();
    this.players = {};
    this.bullets = [];
    this.obstacles = [];
    this.active = false;
    document.getElementById("mp-lobby-overlay")?.classList.add("hidden");
    document.getElementById("mp-hud")?.classList.add("hidden");
  },

  // ============ 主機流程 ============
  async hostRoom() {
    const name = (SaveSys.data.commanderName || "Commander").slice(0, 12);
    this.myName = name;
    this.isHost = true;
    this.myTeam = "red";

    this.setStatus(t("mp_peer_loading"));
    Net.init({
      onOpen: (code) => {
        this.myId = Net.myPeerId;
        this.players[this.myId] = {
          x: MAP_SIZE / 2, y: MAP_SIZE / 2,
          hp: MP_CONFIG.PLAYER_HP, team: this.myTeam,
          angle: 0, alive: true, name, lastUpdate: performance.now()
        };
        this.showRoomCode(code);
        this.setStatus(t("mp_waiting"));
        this.renderLobbyPlayers();
      },
      onMessage: (data, conn) => this.hostHandleMessage(data, conn),
      onClose: () => this.setStatus(t("mp_host_left")),
      onError: (e) => this.setStatus(t("mp_error") + ": " + (e?.message || e))
    });

    try {
      await Net.host();
    } catch (e) {
      this.setStatus(t("mp_error") + ": " + (e?.message || e));
    }
  },

  async joinRoom(code) {
    const name = (SaveSys.data.commanderName || "Commander").slice(0, 12);
    this.myName = name;
    this.isHost = false;

    this.setStatus(t("mp_connecting"));
    Net.init({
      onOpen: () => {
        this.myId = Net.myPeerId;
        // 發送加入請求
        Net.send({ type: "join", name });
      },
      onMessage: (data) => this.clientHandleMessage(data),
      onClose: () => {
        this.setStatus(t("mp_host_left"));
        setTimeout(() => this.exitLobby(), 2000);
      },
      onError: (e) => this.setStatus(t("mp_error") + ": " + (e?.message || e))
    });

    try {
      await Net.join(code);
    } catch (e) {
      this.setStatus(t("mp_error") + ": " + (e?.message || e));
    }
  },

  showRoomCode(code) {
    const el = document.getElementById("mp-room-code-display");
    if (el) el.textContent = code;
    const box = document.getElementById("mp-room-code-box");
    if (box) box.classList.remove("hidden");
    const hostBtns = document.getElementById("mp-host-controls");
    if (hostBtns) hostBtns.classList.remove("hidden");
  },

  setStatus(msg) {
    const el = document.getElementById("mp-status");
    if (el) el.textContent = msg;
  },

  // ============ 主機消息處理 ============
  hostHandleMessage(data, conn) {
    if (!data || typeof data !== "object") return;

    if (data.type === "join") {
      // 分配 id（用 conn.peer）
      const id = conn.peer;
      const redCount = Object.values(this.players).filter(p => p.team === "red").length;
      const blueCount = Object.values(this.players).filter(p => p.team === "blue").length;
      let team = "blue";
      if (redCount <= blueCount) team = "red";
      // 也可以讓玩家選隊伍，先做自動分配
      if (redCount >= MP_CONFIG.TEAM_MAX && blueCount >= MP_CONFIG.TEAM_MAX) {
        Net.sendTo(conn, { type: "error", msg: t("mp_team_full") });
        return;
      }
      this.players[id] = {
        x: MAP_SIZE / 2 + (Math.random() - 0.5) * 400,
        y: MAP_SIZE / 2 + (Math.random() - 0.5) * 400,
        hp: MP_CONFIG.PLAYER_HP, team,
        angle: 0, alive: true, name: (data.name || "Player").slice(0, 12),
        lastUpdate: performance.now()
      };
      Net.sendTo(conn, { type: "welcome", yourId: id, yourTeam: team });
      this.broadcastLobbyState();
      this.renderLobbyPlayers();
    } else if (data.type === "input") {
      const p = this.players[conn.peer];
      if (p && this.active) {
        // 客戶端位置權威：直接採用其位置
        p.x = Math.max(0, Math.min(MAP_SIZE, data.x));
        p.y = Math.max(0, Math.min(MAP_SIZE, data.y));
        p.angle = data.angle || 0;
        p.lastUpdate = performance.now();
        // 處理射擊（客戶端直接發射，主機生成子彈）
        if (data.shoot && !p._cooldown) {
          this.spawnBulletFor(p);
          p._cooldown = MP_CONFIG.FIRE_DELAY;
        }
      }
    } else if (data.type === "leave") {
      delete this.players[conn.peer];
      this.broadcastLobbyState();
      this.renderLobbyPlayers();
    }
  },

  broadcastLobbyState() {
    const list = Object.entries(this.players).map(([id, p]) => ({
      id, name: p.name, team: p.team, hp: p.hp
    }));
    Net.broadcast({ type: "lobby", players: list, scores: this.scores });
  },

  // ============ 客戶端消息處理 ============
  clientHandleMessage(data) {
    if (!data || typeof data !== "object") return;

    if (data.type === "welcome") {
      this.myId = data.yourId;
      this.myTeam = data.yourTeam;
      this.setStatus(t("mp_ready") + " · " + (this.myTeam === "red" ? t("mp_team_red") : t("mp_team_blue")));
    } else if (data.type === "lobby") {
      const map = {};
      data.players.forEach(p => {
        map[p.id] = {
          x: (this.players[p.id] || {}).x || MAP_SIZE / 2,
          y: (this.players[p.id] || {}).y || MAP_SIZE / 2,
          hp: p.hp, team: p.team, angle: 0, alive: true, name: p.name, lastUpdate: performance.now()
        };
      });
      this.players = map;
      if (data.scores) this.scores = data.scores;
      this.renderLobbyPlayers();
    } else if (data.type === "start") {
      // 開局：接收地圖、玩家
      this.obstacles = data.obstacles || [];
      this.players = {};
      data.players.forEach(p => {
        this.players[p.id] = {
          x: p.x, y: p.y, hp: p.hp, team: p.team,
          angle: 0, alive: true, name: p.name, lastUpdate: performance.now()
        };
      });
      this.myTeam = data.teams[this.myId] || "blue";
      this.beginMatch();
    } else if (data.type === "state") {
      // 主機廣播的快照
      data.players.forEach(upd => {
        const p = this.players[upd.id];
        if (p) {
          // 遠程玩家插值；本地玩家信任自身
          if (upd.id === this.myId) {
            p.hp = upd.hp;
            p.alive = upd.alive;
            // 位置以本地為準，但若差異太大則強制校正
            if (Math.hypot(p.x - upd.x, p.y - upd.y) > 200) {
              p.x = upd.x; p.y = upd.y;
            }
          } else {
            p.x += (upd.x - p.x) * 0.35;
            p.y += (upd.y - p.y) * 0.35;
            p.hp = upd.hp; p.alive = upd.alive; p.angle = upd.angle;
          }
        }
      });
      this.bullets = data.bullets || [];
      if (data.scores) this.scores = data.scores;
      if (data.finished && !this.finished) this.endMatch(data.winner);
      this.updateMPHud();
    } else if (data.type === "hit") {
      // 主機通知本地玩家被擊中
      if (this.players[this.myId]) this.players[this.myId].hp = data.hp;
    } else if (data.type === "error") {
      this.setStatus(data.msg || t("mp_error"));
    }
  },

  // ============ 主機 spawn 子彈 ============
  spawnBulletFor(p) {
    const ang = p.angle || 0;
    this.bullets.push({
      x: p.x + Math.cos(ang) * 20,
      y: p.y + Math.sin(ang) * 20,
      vx: Math.cos(ang) * MP_CONFIG.BULLET_SPEED,
      vy: Math.sin(ang) * MP_CONFIG.BULLET_SPEED,
      owner: p.name, team: p.team,
      r: MP_CONFIG.BULLET_RADIUS,
      alive: true
    });
  },

  // ============ 主機開始對戰 ============
  hostStartMatch() {
    if (!this.isHost) return;
    if (Object.keys(this.players).length < 1) {
      alert("至少需要 1 名玩家");
      return;
    }
    // 生成障礙物
    const obs = [];
    for (let i = 0; i < MP_CONFIG.OBSTACLE_COUNT; i++) {
      const r = 50 + Math.random() * 60;
      let x, y, ok = false, tries = 0;
      while (!ok && tries++ < 30) {
        x = 300 + Math.random() * (MAP_SIZE - 600);
        y = 300 + Math.random() * (MAP_SIZE - 600);
        // 不要離中心太近，避免出生點重疊
        if (Math.hypot(x - MAP_SIZE / 2, y - MAP_SIZE / 2) > 400) ok = true;
        // 不要與其他障礙物重疊
        for (const o of obs) {
          if (Math.hypot(x - o.x, y - o.y) < r + o.r + 40) { ok = false; break; }
        }
      }
      if (ok) obs.push({ x, y, r });
    }
    this.obstacles = obs;

    // 分配出生位置
    const teams = {};
    const playerList = [];
    let redIdx = 0, blueIdx = 0;
    Object.entries(this.players).forEach(([id, p]) => {
      let sx, sy;
      if (p.team === "red") {
        sx = 400 + redIdx * 120;
        sy = MAP_SIZE / 2 + 400;
        redIdx++;
      } else {
        sx = 400 + blueIdx * 120;
        sy = MAP_SIZE / 2 - 400;
        blueIdx++;
      }
      p.x = sx; p.y = sy; p.hp = MP_CONFIG.PLAYER_HP; p.alive = true;
      teams[id] = p.team;
      playerList.push({ id, x: sx, y: sy, hp: p.hp, team: p.team, name: p.name });
    });

    this.matchStart = Date.now();
    this.matchEnd = this.matchStart + MP_CONFIG.MATCH_DURATION;
    this.scores = { red: 0, blue: 0 };
    this.finished = false;
    this.bullets = [];

    const payload = {
      type: "start",
      obstacles: this.obstacles,
      players: playerList,
      teams
    };
    Net.broadcast(payload);

    this.beginMatch();
  },

  beginMatch() {
    this.active = true;
    document.getElementById("mp-lobby-overlay")?.classList.add("hidden");
    document.getElementById("mp-hud")?.classList.remove("hidden");
    document.getElementById("hud")?.classList.add("hidden");
    document.getElementById("build-fab-wrap")?.classList.add("hidden");
    document.getElementById("active-skills-hud")?.classList.add("hidden");

    state = "PLAY";
    syncBodyStateAttr();

    // 主機權威的定時器
    if (this.isHost) {
      this._tickTimer = setInterval(() => this.hostTick(), 1000 / MP_CONFIG.TICK_RATE);
    }

    // 客戶端定期發送輸入
    if (!this.isHost) {
      this._inputTimer = setInterval(() => this.clientSendInput(), 1000 / MP_CONFIG.INPUT_RATE);
    }

    // 本地輸入監聽
    this.bindInput();
    this.updateMPHud();
    this.loopStart = performance.now();
    this.fireCooldown = 0;
  },

  // ============ 主機 tick ============
  hostTick() {
    if (!this.active) return;
    const now = Date.now();

    // 檢查結束
    if (now > this.matchEnd && !this.finished) {
      const winner = this.scores.red > this.scores.blue ? "red"
                    : this.scores.blue > this.scores.red ? "blue" : "draw";
      this.finished = true;
      this.broadcastState(winner);
      this.endMatch(winner);
      return;
    }

    // 子彈移動 & 碰撞
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx; b.y += b.vy;
      if (b.x < 0 || b.x > MAP_SIZE || b.y < 0 || b.y > MAP_SIZE) {
        this.bullets.splice(i, 1); continue;
      }
      // 障礙物
      let hitObs = false;
      for (const o of this.obstacles) {
        if (Math.hypot(b.x - o.x, b.y - o.y) < o.r + b.r) { hitObs = true; break; }
      }
      if (hitObs) { this.bullets.splice(i, 1); continue; }

      // 玩家碰撞
      let hit = false;
      for (const [id, p] of Object.entries(this.players)) {
        if (!p.alive) continue;
        if (p.team === b.team) continue; // 友軍不傷
        if (Math.hypot(b.x - p.x, b.y - p.y) < MP_CONFIG.PLAYER_RADIUS + b.r) {
          p.hp -= MP_CONFIG.BULLET_DMG;
          hit = true;
          if (p.hp <= 0) {
            p.hp = 0; p.alive = false;
            // 加分給攻擊方隊伍
            this.scores[b.team]++;
            // 重生
            setTimeout(() => {
              if (this.players[id] && !this.players[id].alive) {
                this.players[id].hp = MP_CONFIG.PLAYER_HP;
                this.players[id].alive = true;
                this.players[id].x = MAP_SIZE / 2 + (Math.random() - 0.5) * 200;
                this.players[id].y = MAP_SIZE / 2 + (Math.random() - 0.5) * 200;
              }
            }, 2500);
          }
          break;
        }
      }
      if (hit) this.bullets.splice(i, 1);
    }

    // 冷卻遞減
    for (const p of Object.values(this.players)) {
      if (p._cooldown > 0) p._cooldown--;
    }

    // 檢查勝分
    if (!this.finished && (this.scores.red >= MP_CONFIG.WIN_SCORE || this.scores.blue >= MP_CONFIG.WIN_SCORE)) {
      this.finished = true;
      const winner = this.scores.red >= MP_CONFIG.WIN_SCORE ? "red" : "blue";
      this.broadcastState(winner);
      this.endMatch(winner);
      return;
    }

    this.broadcastState();
  },

  broadcastState(winner) {
    const playersUpd = Object.entries(this.players).map(([id, p]) => ({
      id, x: p.x, y: p.y, hp: p.hp, alive: p.alive, angle: p.angle
    }));
    const bulletsUpd = this.bullets.map(b => ({
      x: b.x, y: b.y, vx: b.vx, vy: b.vy, team: b.team, r: b.r
    }));
    Net.broadcast({
      type: "state",
      players: playersUpd,
      bullets: bulletsUpd,
      scores: this.scores,
      finished: this.finished,
      winner
    });
    this.updateMPHud();
  },

  // ============ 客戶端發送輸入 ============
  clientSendInput() {
    if (!this.active || this.isHost) return;
    const me = this.players[this.myId];
    if (!me || !me.alive) return;
    Net.send({
      type: "input",
      x: me.x, y: me.y, angle: me.angle,
      shoot: this.input.shoot
    });
    // 本地立即處理射擊視覺（客戶端不生成子彈，只發信號）
    if (this.input.shoot && this.fireCooldown <= 0) {
      this.fireCooldown = MP_CONFIG.FIRE_DELAY;
    }
  },

  // ============ 本地輸入綁定 ============
  bindInput() {
    if (this._inputBound) return;
    this._inputBound = true;
    this._keys = {};
    this._mouseAngle = 0;

    window.addEventListener("keydown", e => {
      if (!this.active) return;
      this._keys[e.code] = true;
      if (e.code === "KeyJ" || e.code === "Space") this.input.shoot = true;
    });
    window.addEventListener("keyup", e => {
      if (!this.active) return;
      this._keys[e.code] = false;
      if (e.code === "KeyJ" || e.code === "Space") this.input.shoot = false;
    });

    // 觸控搖桿
    this._touch = { active: false, id: null, sx: 0, sy: 0, dx: 0, dy: 0 };
    const cvs = document.getElementById("gameCanvas");
    if (!cvs) return;
    cvs.addEventListener("touchstart", e => {
      if (!this.active) return;
      for (const t of e.changedTouches) {
        if (!this._touch.active) {
          this._touch.active = true;
          this._touch.id = t.identifier;
          this._touch.sx = t.clientX; this._touch.sy = t.clientY;
          this._touch.dx = 0; this._touch.dy = 0;
        }
      }
    }, { passive: true });
    cvs.addEventListener("touchmove", e => {
      if (!this.active || !this._touch.active) return;
      for (const t of e.changedTouches) {
        if (t.identifier === this._touch.id) {
          const dx = t.clientX - this._touch.sx;
          const dy = t.clientY - this._touch.sy;
          const d = Math.hypot(dx, dy), maxR = 60;
          this._touch.dx = dx / Math.max(1, d) * Math.min(1, d / maxR);
          this._touch.dy = dy / Math.max(1, d) * Math.min(1, d / maxR);
        }
      }
    }, { passive: true });
    const endT = () => { this._touch.active = false; this._touch.dx = 0; this._touch.dy = 0; };
    cvs.addEventListener("touchend", endT);
    cvs.addEventListener("touchcancel", endT);

    // 點擊螢幕＝射擊
    cvs.addEventListener("mousedown", e => {
      if (!this.active) return;
      this.input.shoot = true;
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

  // ============ 本地玩家更新（每幀） ============
  stepLocal() {
    if (!this.active) return;
    const me = this.players[this.myId];
    if (!me || !me.alive) {
      // 死亡狀態：顯示重生倒數
      return;
    }

    // 冷卻
    if (this.fireCooldown > 0) this.fireCooldown--;

    // 移動
    let mx = 0, my = 0;
    if (this._keys?.["KeyW"] || this._keys?.["ArrowUp"]) my -= 1;
    if (this._keys?.["KeyS"] || this._keys?.["ArrowDown"]) my += 1;
    if (this._keys?.["KeyA"] || this._keys?.["ArrowLeft"]) mx -= 1;
    if (this._keys?.["KeyD"] || this._keys?.["ArrowRight"]) mx += 1;
    if (this._touch?.active) { mx = this._touch.dx; my = this._touch.dy; }

    const len = Math.hypot(mx, my);
    if (len > 0) {
      const nx = mx / Math.max(1, len);
      const ny = my / Math.max(1, len);
      const spd = MP_CONFIG.PLAYER_SPEED;
      me.x = Math.max(0, Math.min(MAP_SIZE, me.x + nx * spd));
      me.y = Math.max(0, Math.min(MAP_SIZE, me.y + ny * spd));
      collideObstacles(me, MP_CONFIG.PLAYER_RADIUS);
      me.x = Math.max(0, Math.min(MAP_SIZE, me.x));
      me.y = Math.max(0, Math.min(MAP_SIZE, me.y));
    }

    // 角度：滑鼠瞄準
    me.angle = this._mouseAngle;
    this.input.angle = me.angle;

    // 主機：即時生成子彈
    if (this.isHost && this.input.shoot && this.fireCooldown <= 0) {
      this.spawnBulletFor(me);
      this.fireCooldown = MP_CONFIG.FIRE_DELAY;
    }

    // 更新輸入狀態
    this.input.mx = mx; this.input.my = my;
  },

  // ============ 結束對戰 ============
  endMatch(winner) {
    if (this._tickTimer) { clearInterval(this._tickTimer); this._tickTimer = null; }
    if (this._inputTimer) { clearInterval(this._inputTimer); this._inputTimer = null; }

    const overlay = document.getElementById("mp-result-overlay");
    if (overlay) {
      overlay.classList.remove("hidden");
      const titleEl = document.getElementById("mp-result-title");
      const myTeam = this.myTeam;
      if (titleEl) {
        if (winner === "draw") titleEl.textContent = "🤝 平局";
        else if (winner === myTeam) titleEl.textContent = t("mp_win");
        else titleEl.textContent = t("mp_lose");
        titleEl.style.color = (winner === myTeam) ? "var(--success)" : "var(--danger)";
      }
      const scoreEl = document.getElementById("mp-result-score");
      if (scoreEl) scoreEl.textContent = `🔴 ${this.scores.red} : ${this.scores.blue} 🔵`;
      // 成就
      if (winner === myTeam && winner !== "draw") {
        AchievementSys.unlock("mp_first_win");
      }
    }
    this.active = false;
  },

  // ============ 更新 HUD ============
  updateMPHud() {
    const redScore = document.getElementById("mp-red-score");
    const blueScore = document.getElementById("mp-blue-score");
    if (redScore) redScore.textContent = this.scores.red;
    if (blueScore) blueScore.textContent = this.scores.blue;

    const myHp = document.getElementById("mp-my-hp");
    const me = this.players[this.myId];
    if (myHp && me) myHp.textContent = `${Math.ceil(me.hp)}/${MP_CONFIG.PLAYER_HP}`;

    const myHpBar = document.getElementById("mp-my-hp-bar");
    if (myHpBar && me) myHpBar.style.width = `${Math.max(0, (me.hp / MP_CONFIG.PLAYER_HP) * 100)}%`;

    const myTeamEl = document.getElementById("mp-my-team");
    if (myTeamEl) {
      myTeamEl.textContent = this.myTeam === "red" ? t("mp_team_red") : t("mp_team_blue");
      myTeamEl.style.color = this.myTeam === "red" ? "#ff0055" : "#00aaff";
    }

    const timerEl = document.getElementById("mp-timer");
    if (timerEl) {
      const remain = Math.max(0, Math.ceil((this.matchEnd - Date.now()) / 1000));
      timerEl.textContent = `${Math.floor(remain / 60)}:${String(remain % 60).padStart(2, "0")}`;
    }
  },

  // ============ 大廳玩家列表 ============
  renderLobbyPlayers() {
    const box = document.getElementById("mp-player-list");
    if (!box) return;
    box.innerHTML = "";
    Object.entries(this.players).forEach(([id, p]) => {
      const div = document.createElement("div");
      div.style.cssText = `padding:8px;border-radius:8px;margin-bottom:6px;border:1.5px solid ${p.team === "red" ? "#ff0055" : "#00aaff"};background:rgba(12,18,34,.9);font-size:.82rem;display:flex;justify-content:space-between;`;
      div.innerHTML = `<span>${p.team === "red" ? "🔴" : "🔵"} ${p.name}${id === Net.myPeerId ? " " + t("mp_you") : ""}</span><span style="color:${p.team === "red" ? "#ff0055" : "#00aaff"};font-weight:800;">${p.team === "red" ? "RED" : "BLUE"}</span>`;
      box.appendChild(div);
    });
  },

  // ============ 渲染（主循環呼叫） ============
  draw() {
    ctx.fillStyle = "#04060c";
    ctx.fillRect(0, 0, W, H);

    const me = this.players[this.myId];
    if (!me) return;

    // 相機跟隨本地玩家
    let camX = Math.max(0, Math.min(MAP_SIZE - W, me.x - W / 2));
    let camY = Math.max(0, Math.min(MAP_SIZE - H, me.y - H / 2));
    if (W >= MAP_SIZE) camX = (MAP_SIZE - W) / 2;
    if (H >= MAP_SIZE) camY = (MAP_SIZE - H) / 2;

    ctx.save();
    ctx.translate(-camX, -camY);

    // 背景網格
    ctx.strokeStyle = "rgba(0,243,255,.05)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= MAP_SIZE; x += 100) { ctx.moveTo(x, 0); ctx.lineTo(x, MAP_SIZE); }
    for (let y = 0; y <= MAP_SIZE; y += 100) { ctx.moveTo(0, y); ctx.lineTo(MAP_SIZE, y); }
    ctx.stroke();

    // 邊框
    ctx.strokeStyle = "#ff0055";
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, MAP_SIZE, MAP_SIZE);

    // 中線
    ctx.strokeStyle = "rgba(184,41,255,.4)";
    ctx.lineWidth = 3;
    ctx.setLineDash([20, 15]);
    ctx.beginPath();
    ctx.moveTo(0, MAP_SIZE / 2); ctx.lineTo(MAP_SIZE, MAP_SIZE / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // 障礙物
    this.obstacles.forEach(o => {
      if (window.NeonDecor?.renderObstacle) {
        window.NeonDecor.renderObstacle(ctx, o, !SaveSys.data.settings.neonGlow);
      } else {
        ctx.fillStyle = "#1a0a2a";
        ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.fill();
      }
    });

    // 遠程玩家
    Object.entries(this.players).forEach(([id, p]) => {
      if (id === this.myId) return;
      if (!p.alive) {
        ctx.save();
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = p.team === "red" ? "#ff0055" : "#00aaff";
        ctx.font = "bold 12px Orbitron, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("☠️ " + (p.name || "Player"), p.x, p.y);
        ctx.restore();
        return;
      }
      if (window.NeonDecor?.renderRemotePlayer) {
        window.NeonDecor.renderRemotePlayer(ctx, p, !SaveSys.data.settings.neonGlow);
      } else {
        ctx.fillStyle = p.team === "red" ? "#ff0055" : "#00aaff";
        ctx.beginPath(); ctx.arc(p.x, p.y, MP_CONFIG.PLAYER_RADIUS, 0, Math.PI * 2); ctx.fill();
      }
    });

    // 本地玩家
    if (me.alive) {
      if (window.NeonDecor?.renderRemotePlayer) {
        const mySkin = getSelectedSkinObj();
        ctx.save();
        ctx.translate(me.x, me.y);
        ctx.rotate(me.angle);
        ctx.scale(1, 0.86);
        const teamCol = this.myTeam === "red" ? "#ff0055" : "#00aaff";
        ctx.beginPath();
        ctx.moveTo(18, 0); ctx.lineTo(-12, -12); ctx.lineTo(-6, 0); ctx.lineTo(-12, 12);
        ctx.closePath();
        ctx.fillStyle = "#060a14"; ctx.fill();
        ctx.strokeStyle = teamCol; ctx.lineWidth = 2.5;
        ctx.shadowColor = teamCol; ctx.shadowBlur = 10;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2);
        ctx.fillStyle = "#fff"; ctx.fill();
        ctx.restore();
        // 本地名字
        ctx.fillStyle = teamCol;
        ctx.font = "bold 11px Orbitron, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(this.myName + " (You)", me.x, me.y - 28);
        // HP bar
        const bw = 40;
        ctx.fillStyle = "rgba(0,0,0,.7)";
        ctx.fillRect(me.x - bw / 2, me.y - 24, bw, 5);
        ctx.fillStyle = teamCol;
        ctx.fillRect(me.x - bw / 2, me.y - 24, bw * (me.hp / MP_CONFIG.PLAYER_HP), 5);
      }
    } else {
      ctx.save();
      ctx.fillStyle = "rgba(255,0,85,.7)";
      ctx.font = "bold 16px Orbitron, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("☠️ 重生中...", me.x, me.y - 30);
      ctx.restore();
    }

    // 子彈
    this.bullets.forEach(b => {
      const col = b.team === "red" ? "#ff3366" : "#33aaff";
      ctx.save();
      ctx.shadowColor = col; ctx.shadowBlur = 12;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });

    ctx.restore();

    // 小地圖
    this.drawMPMinimap();
  },

  drawMPMinimap() {
    const size = Math.min(140, W * 0.2);
    const x0 = 12, y0 = 128;
    const k = size / MAP_SIZE;
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "rgba(4,6,12,.85)";
    ctx.fillRect(x0, y0, size, size);
    ctx.strokeStyle = "rgba(0,243,255,.6)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x0, y0, size, size);

    this.obstacles.forEach(o => {
      ctx.fillStyle = "rgba(255,128,255,.5)";
      ctx.beginPath();
      ctx.arc(x0 + o.x * k, y0 + o.y * k, Math.max(2, o.r * k), 0, Math.PI * 2);
      ctx.fill();
    });

    Object.entries(this.players).forEach(([id, p]) => {
      if (!p.alive) return;
      ctx.fillStyle = id === this.myId ? "#ffee00" : (p.team === "red" ? "#ff0055" : "#00aaff");
      ctx.beginPath();
      ctx.arc(x0 + p.x * k, y0 + p.y * k, id === this.myId ? 4 : 3, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }
};// ============================================================
// NEON OVERDRIVE ONLINE // multiplayer.js
// 多人 / 團隊對戰模式（含場景障礙物）
// ============================================================

const MP = {
  active: false,
  isHost: false,
  myId: "",
  myName: "",
  myTeam: "red",
  players: {},        // id -> { x, y, hp, team, angle, alive, name, lastUpdate }
  bullets: [],        // 主機權威：{ x, y, vx, vy, owner, team, r, alive }
  obstacles: [],
  scores: { red: 0, blue: 0 },
  matchStart: 0,
  matchEnd: 0,
  finished: false,

  // 本地輸入狀態
  input: { mx: 0, my: 0, angle: 0, shoot: false },

  // 主機端計時
  _tickTimer: null,
  _inputTimer: null,
  _fireTick: 0,
  _lastSent: 0,

  // ============ 進入/離開 ============
  enterLobby() {
    this.active = false;
    document.getElementById("mp-lobby-overlay")?.classList.remove("hidden");
    this.renderLobbyPlayers();
  },

  exitLobby() {
    Net.disconnect();
    this.players = {};
    this.bullets = [];
    this.obstacles = [];
    this.active = false;
    document.getElementById("mp-lobby-overlay")?.classList.add("hidden");
    document.getElementById("mp-hud")?.classList.add("hidden");
  },

  // ============ 主機流程 ============
  async hostRoom() {
    const name = (SaveSys.data.commanderName || "Commander").slice(0, 12);
    this.myName = name;
    this.isHost = true;
    this.myTeam = "red";

    this.setStatus(t("mp_peer_loading"));
    Net.init({
      onOpen: (code) => {
        this.myId = Net.myPeerId;
        this.players[this.myId] = {
          x: MAP_SIZE / 2, y: MAP_SIZE / 2,
          hp: MP_CONFIG.PLAYER_HP, team: this.myTeam,
          angle: 0, alive: true, name, lastUpdate: performance.now()
        };
        this.showRoomCode(code);
        this.setStatus(t("mp_waiting"));
        this.renderLobbyPlayers();
      },
      onMessage: (data, conn) => this.hostHandleMessage(data, conn),
      onClose: () => this.setStatus(t("mp_host_left")),
      onError: (e) => this.setStatus(t("mp_error") + ": " + (e?.message || e))
    });

    try {
      await Net.host();
    } catch (e) {
      this.setStatus(t("mp_error") + ": " + (e?.message || e));
    }
  },

  async joinRoom(code) {
    const name = (SaveSys.data.commanderName || "Commander").slice(0, 12);
    this.myName = name;
    this.isHost = false;

    this.setStatus(t("mp_connecting"));
    Net.init({
      onOpen: () => {
        this.myId = Net.myPeerId;
        // 發送加入請求
        Net.send({ type: "join", name });
      },
      onMessage: (data) => this.clientHandleMessage(data),
      onClose: () => {
        this.setStatus(t("mp_host_left"));
        setTimeout(() => this.exitLobby(), 2000);
      },
      onError: (e) => this.setStatus(t("mp_error") + ": " + (e?.message || e))
    });

    try {
      await Net.join(code);
    } catch (e) {
      this.setStatus(t("mp_error") + ": " + (e?.message || e));
    }
  },

  showRoomCode(code) {
    const el = document.getElementById("mp-room-code-display");
    if (el) el.textContent = code;
    const box = document.getElementById("mp-room-code-box");
    if (box) box.classList.remove("hidden");
    const hostBtns = document.getElementById("mp-host-controls");
    if (hostBtns) hostBtns.classList.remove("hidden");
  },

  setStatus(msg) {
    const el = document.getElementById("mp-status");
    if (el) el.textContent = msg;
  },

  // ============ 主機消息處理 ============
  hostHandleMessage(data, conn) {
    if (!data || typeof data !== "object") return;

    if (data.type === "join") {
      // 分配 id（用 conn.peer）
      const id = conn.peer;
      const redCount = Object.values(this.players).filter(p => p.team === "red").length;
      const blueCount = Object.values(this.players).filter(p => p.team === "blue").length;
      let team = "blue";
      if (redCount <= blueCount) team = "red";
      // 也可以讓玩家選隊伍，先做自動分配
      if (redCount >= MP_CONFIG.TEAM_MAX && blueCount >= MP_CONFIG.TEAM_MAX) {
        Net.sendTo(conn, { type: "error", msg: t("mp_team_full") });
        return;
      }
      this.players[id] = {
        x: MAP_SIZE / 2 + (Math.random() - 0.5) * 400,
        y: MAP_SIZE / 2 + (Math.random() - 0.5) * 400,
        hp: MP_CONFIG.PLAYER_HP, team,
        angle: 0, alive: true, name: (data.name || "Player").slice(0, 12),
        lastUpdate: performance.now()
      };
      Net.sendTo(conn, { type: "welcome", yourId: id, yourTeam: team });
      this.broadcastLobbyState();
      this.renderLobbyPlayers();
    } else if (data.type === "input") {
      const p = this.players[conn.peer];
      if (p && this.active) {
        // 客戶端位置權威：直接採用其位置
        p.x = Math.max(0, Math.min(MAP_SIZE, data.x));
        p.y = Math.max(0, Math.min(MAP_SIZE, data.y));
        p.angle = data.angle || 0;
        p.lastUpdate = performance.now();
        // 處理射擊（客戶端直接發射，主機生成子彈）
        if (data.shoot && !p._cooldown) {
          this.spawnBulletFor(p);
          p._cooldown = MP_CONFIG.FIRE_DELAY;
        }
      }
    } else if (data.type === "leave") {
      delete this.players[conn.peer];
      this.broadcastLobbyState();
      this.renderLobbyPlayers();
    }
  },

  broadcastLobbyState() {
    const list = Object.entries(this.players).map(([id, p]) => ({
      id, name: p.name, team: p.team, hp: p.hp
    }));
    Net.broadcast({ type: "lobby", players: list, scores: this.scores });
  },

  // ============ 客戶端消息處理 ============
  clientHandleMessage(data) {
    if (!data || typeof data !== "object") return;

    if (data.type === "welcome") {
      this.myId = data.yourId;
      this.myTeam = data.yourTeam;
      this.setStatus(t("mp_ready") + " · " + (this.myTeam === "red" ? t("mp_team_red") : t("mp_team_blue")));
    } else if (data.type === "lobby") {
      const map = {};
      data.players.forEach(p => {
        map[p.id] = {
          x: (this.players[p.id] || {}).x || MAP_SIZE / 2,
          y: (this.players[p.id] || {}).y || MAP_SIZE / 2,
          hp: p.hp, team: p.team, angle: 0, alive: true, name: p.name, lastUpdate: performance.now()
        };
      });
      this.players = map;
      if (data.scores) this.scores = data.scores;
      this.renderLobbyPlayers();
    } else if (data.type === "start") {
      // 開局：接收地圖、玩家
      this.obstacles = data.obstacles || [];
      this.players = {};
      data.players.forEach(p => {
        this.players[p.id] = {
          x: p.x, y: p.y, hp: p.hp, team: p.team,
          angle: 0, alive: true, name: p.name, lastUpdate: performance.now()
        };
      });
      this.myTeam = data.teams[this.myId] || "blue";
      this.beginMatch();
    } else if (data.type === "state") {
      // 主機廣播的快照
      data.players.forEach(upd => {
        const p = this.players[upd.id];
        if (p) {
          // 遠程玩家插值；本地玩家信任自身
          if (upd.id === this.myId) {
            p.hp = upd.hp;
            p.alive = upd.alive;
            // 位置以本地為準，但若差異太大則強制校正
            if (Math.hypot(p.x - upd.x, p.y - upd.y) > 200) {
              p.x = upd.x; p.y = upd.y;
            }
          } else {
            p.x += (upd.x - p.x) * 0.35;
            p.y += (upd.y - p.y) * 0.35;
            p.hp = upd.hp; p.alive = upd.alive; p.angle = upd.angle;
          }
        }
      });
      this.bullets = data.bullets || [];
      if (data.scores) this.scores = data.scores;
      if (data.finished && !this.finished) this.endMatch(data.winner);
      this.updateMPHud();
    } else if (data.type === "hit") {
      // 主機通知本地玩家被擊中
      if (this.players[this.myId]) this.players[this.myId].hp = data.hp;
    } else if (data.type === "error") {
      this.setStatus(data.msg || t("mp_error"));
    }
  },

  // ============ 主機 spawn 子彈 ============
  spawnBulletFor(p) {
    const ang = p.angle || 0;
    this.bullets.push({
      x: p.x + Math.cos(ang) * 20,
      y: p.y + Math.sin(ang) * 20,
      vx: Math.cos(ang) * MP_CONFIG.BULLET_SPEED,
      vy: Math.sin(ang) * MP_CONFIG.BULLET_SPEED,
      owner: p.name, team: p.team,
      r: MP_CONFIG.BULLET_RADIUS,
      alive: true
    });
  },

  // ============ 主機開始對戰 ============
  hostStartMatch() {
    if (!this.isHost) return;
    if (Object.keys(this.players).length < 1) {
      alert("至少需要 1 名玩家");
      return;
    }
    // 生成障礙物
    const obs = [];
    for (let i = 0; i < MP_CONFIG.OBSTACLE_COUNT; i++) {
      const r = 50 + Math.random() * 60;
      let x, y, ok = false, tries = 0;
      while (!ok && tries++ < 30) {
        x = 300 + Math.random() * (MAP_SIZE - 600);
        y = 300 + Math.random() * (MAP_SIZE - 600);
        // 不要離中心太近，避免出生點重疊
        if (Math.hypot(x - MAP_SIZE / 2, y - MAP_SIZE / 2) > 400) ok = true;
        // 不要與其他障礙物重疊
        for (const o of obs) {
          if (Math.hypot(x - o.x, y - o.y) < r + o.r + 40) { ok = false; break; }
        }
      }
      if (ok) obs.push({ x, y, r });
    }
    this.obstacles = obs;

    // 分配出生位置
    const teams = {};
    const playerList = [];
    let redIdx = 0, blueIdx = 0;
    Object.entries(this.players).forEach(([id, p]) => {
      let sx, sy;
      if (p.team === "red") {
        sx = 400 + redIdx * 120;
        sy = MAP_SIZE / 2 + 400;
        redIdx++;
      } else {
        sx = 400 + blueIdx * 120;
        sy = MAP_SIZE / 2 - 400;
        blueIdx++;
      }
      p.x = sx; p.y = sy; p.hp = MP_CONFIG.PLAYER_HP; p.alive = true;
      teams[id] = p.team;
      playerList.push({ id, x: sx, y: sy, hp: p.hp, team: p.team, name: p.name });
    });

    this.matchStart = Date.now();
    this.matchEnd = this.matchStart + MP_CONFIG.MATCH_DURATION;
    this.scores = { red: 0, blue: 0 };
    this.finished = false;
    this.bullets = [];

    const payload = {
      type: "start",
      obstacles: this.obstacles,
      players: playerList,
      teams
    };
    Net.broadcast(payload);

    this.beginMatch();
  },

  beginMatch() {
    this.active = true;
    document.getElementById("mp-lobby-overlay")?.classList.add("hidden");
    document.getElementById("mp-hud")?.classList.remove("hidden");
    document.getElementById("hud")?.classList.add("hidden");
    document.getElementById("build-fab-wrap")?.classList.add("hidden");
    document.getElementById("active-skills-hud")?.classList.add("hidden");

    state = "PLAY";
    syncBodyStateAttr();

    // 主機權威的定時器
    if (this.isHost) {
      this._tickTimer = setInterval(() => this.hostTick(), 1000 / MP_CONFIG.TICK_RATE);
    }

    // 客戶端定期發送輸入
    if (!this.isHost) {
      this._inputTimer = setInterval(() => this.clientSendInput(), 1000 / MP_CONFIG.INPUT_RATE);
    }

    // 本地輸入監聽
    this.bindInput();
    this.updateMPHud();
    this.loopStart = performance.now();
    this.fireCooldown = 0;
  },

  // ============ 主機 tick ============
  hostTick() {
    if (!this.active) return;
    const now = Date.now();

    // 檢查結束
    if (now > this.matchEnd && !this.finished) {
      const winner = this.scores.red > this.scores.blue ? "red"
                    : this.scores.blue > this.scores.red ? "blue" : "draw";
      this.finished = true;
      this.broadcastState(winner);
      this.endMatch(winner);
      return;
    }

    // 子彈移動 & 碰撞
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx; b.y += b.vy;
      if (b.x < 0 || b.x > MAP_SIZE || b.y < 0 || b.y > MAP_SIZE) {
        this.bullets.splice(i, 1); continue;
      }
      // 障礙物
      let hitObs = false;
      for (const o of this.obstacles) {
        if (Math.hypot(b.x - o.x, b.y - o.y) < o.r + b.r) { hitObs = true; break; }
      }
      if (hitObs) { this.bullets.splice(i, 1); continue; }

      // 玩家碰撞
      let hit = false;
      for (const [id, p] of Object.entries(this.players)) {
        if (!p.alive) continue;
        if (p.team === b.team) continue; // 友軍不傷
        if (Math.hypot(b.x - p.x, b.y - p.y) < MP_CONFIG.PLAYER_RADIUS + b.r) {
          p.hp -= MP_CONFIG.BULLET_DMG;
          hit = true;
          if (p.hp <= 0) {
            p.hp = 0; p.alive = false;
            // 加分給攻擊方隊伍
            this.scores[b.team]++;
            // 重生
            setTimeout(() => {
              if (this.players[id] && !this.players[id].alive) {
                this.players[id].hp = MP_CONFIG.PLAYER_HP;
                this.players[id].alive = true;
                this.players[id].x = MAP_SIZE / 2 + (Math.random() - 0.5) * 200;
                this.players[id].y = MAP_SIZE / 2 + (Math.random() - 0.5) * 200;
              }
            }, 2500);
          }
          break;
        }
      }
      if (hit) this.bullets.splice(i, 1);
    }

    // 冷卻遞減
    for (const p of Object.values(this.players)) {
      if (p._cooldown > 0) p._cooldown--;
    }

    // 檢查勝分
    if (!this.finished && (this.scores.red >= MP_CONFIG.WIN_SCORE || this.scores.blue >= MP_CONFIG.WIN_SCORE)) {
      this.finished = true;
      const winner = this.scores.red >= MP_CONFIG.WIN_SCORE ? "red" : "blue";
      this.broadcastState(winner);
      this.endMatch(winner);
      return;
    }

    this.broadcastState();
  },

  broadcastState(winner) {
    const playersUpd = Object.entries(this.players).map(([id, p]) => ({
      id, x: p.x, y: p.y, hp: p.hp, alive: p.alive, angle: p.angle
    }));
    const bulletsUpd = this.bullets.map(b => ({
      x: b.x, y: b.y, vx: b.vx, vy: b.vy, team: b.team, r: b.r
    }));
    Net.broadcast({
      type: "state",
      players: playersUpd,
      bullets: bulletsUpd,
      scores: this.scores,
      finished: this.finished,
      winner
    });
    this.updateMPHud();
  },

  // ============ 客戶端發送輸入 ============
  clientSendInput() {
    if (!this.active || this.isHost) return;
    const me = this.players[this.myId];
    if (!me || !me.alive) return;
    Net.send({
      type: "input",
      x: me.x, y: me.y, angle: me.angle,
      shoot: this.input.shoot
    });
    // 本地立即處理射擊視覺（客戶端不生成子彈，只發信號）
    if (this.input.shoot && this.fireCooldown <= 0) {
      this.fireCooldown = MP_CONFIG.FIRE_DELAY;
    }
  },

  // ============ 本地輸入綁定 ============
  bindInput() {
    if (this._inputBound) return;
    this._inputBound = true;
    this._keys = {};
    this._mouseAngle = 0;

    window.addEventListener("keydown", e => {
      if (!this.active) return;
      this._keys[e.code] = true;
      if (e.code === "KeyJ" || e.code === "Space") this.input.shoot = true;
    });
    window.addEventListener("keyup", e => {
      if (!this.active) return;
      this._keys[e.code] = false;
      if (e.code === "KeyJ" || e.code === "Space") this.input.shoot = false;
    });

    // 觸控搖桿
    this._touch = { active: false, id: null, sx: 0, sy: 0, dx: 0, dy: 0 };
    const cvs = document.getElementById("gameCanvas");
    if (!cvs) return;
    cvs.addEventListener("touchstart", e => {
      if (!this.active) return;
      for (const t of e.changedTouches) {
        if (!this._touch.active) {
          this._touch.active = true;
          this._touch.id = t.identifier;
          this._touch.sx = t.clientX; this._touch.sy = t.clientY;
          this._touch.dx = 0; this._touch.dy = 0;
        }
      }
    }, { passive: true });
    cvs.addEventListener("touchmove", e => {
      if (!this.active || !this._touch.active) return;
      for (const t of e.changedTouches) {
        if (t.identifier === this._touch.id) {
          const dx = t.clientX - this._touch.sx;
          const dy = t.clientY - this._touch.sy;
          const d = Math.hypot(dx, dy), maxR = 60;
          this._touch.dx = dx / Math.max(1, d) * Math.min(1, d / maxR);
          this._touch.dy = dy / Math.max(1, d) * Math.min(1, d / maxR);
        }
      }
    }, { passive: true });
    const endT = () => { this._touch.active = false; this._touch.dx = 0; this._touch.dy = 0; };
    cvs.addEventListener("touchend", endT);
    cvs.addEventListener("touchcancel", endT);

    // 點擊螢幕＝射擊
    cvs.addEventListener("mousedown", e => {
      if (!this.active) return;
      this.input.shoot = true;
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

  // ============ 本地玩家更新（每幀） ============
  stepLocal() {
    if (!this.active) return;
    const me = this.players[this.myId];
    if (!me || !me.alive) {
      // 死亡狀態：顯示重生倒數
      return;
    }

    // 冷卻
    if (this.fireCooldown > 0) this.fireCooldown--;

    // 移動
    let mx = 0, my = 0;
    if (this._keys?.["KeyW"] || this._keys?.["ArrowUp"]) my -= 1;
    if (this._keys?.["KeyS"] || this._keys?.["ArrowDown"]) my += 1;
    if (this._keys?.["KeyA"] || this._keys?.["ArrowLeft"]) mx -= 1;
    if (this._keys?.["KeyD"] || this._keys?.["ArrowRight"]) mx += 1;
    if (this._touch?.active) { mx = this._touch.dx; my = this._touch.dy; }

    const len = Math.hypot(mx, my);
    if (len > 0) {
      const nx = mx / Math.max(1, len);
      const ny = my / Math.max(1, len);
      const spd = MP_CONFIG.PLAYER_SPEED;
      me.x = Math.max(0, Math.min(MAP_SIZE, me.x + nx * spd));
      me.y = Math.max(0, Math.min(MAP_SIZE, me.y + ny * spd));
      collideObstacles(me, MP_CONFIG.PLAYER_RADIUS);
      me.x = Math.max(0, Math.min(MAP_SIZE, me.x));
      me.y = Math.max(0, Math.min(MAP_SIZE, me.y));
    }

    // 角度：滑鼠瞄準
    me.angle = this._mouseAngle;
    this.input.angle = me.angle;

    // 主機：即時生成子彈
    if (this.isHost && this.input.shoot && this.fireCooldown <= 0) {
      this.spawnBulletFor(me);
      this.fireCooldown = MP_CONFIG.FIRE_DELAY;
    }

    // 更新輸入狀態
    this.input.mx = mx; this.input.my = my;
  },

  // ============ 結束對戰 ============
  endMatch(winner) {
    if (this._tickTimer) { clearInterval(this._tickTimer); this._tickTimer = null; }
    if (this._inputTimer) { clearInterval(this._inputTimer); this._inputTimer = null; }

    const overlay = document.getElementById("mp-result-overlay");
    if (overlay) {
      overlay.classList.remove("hidden");
      const titleEl = document.getElementById("mp-result-title");
      const myTeam = this.myTeam;
      if (titleEl) {
        if (winner === "draw") titleEl.textContent = "🤝 平局";
        else if (winner === myTeam) titleEl.textContent = t("mp_win");
        else titleEl.textContent = t("mp_lose");
        titleEl.style.color = (winner === myTeam) ? "var(--success)" : "var(--danger)";
      }
      const scoreEl = document.getElementById("mp-result-score");
      if (scoreEl) scoreEl.textContent = `🔴 ${this.scores.red} : ${this.scores.blue} 🔵`;
      // 成就
      if (winner === myTeam && winner !== "draw") {
        AchievementSys.unlock("mp_first_win");
      }
    }
    this.active = false;
  },

  // ============ 更新 HUD ============
  updateMPHud() {
    const redScore = document.getElementById("mp-red-score");
    const blueScore = document.getElementById("mp-blue-score");
    if (redScore) redScore.textContent = this.scores.red;
    if (blueScore) blueScore.textContent = this.scores.blue;

    const myHp = document.getElementById("mp-my-hp");
    const me = this.players[this.myId];
    if (myHp && me) myHp.textContent = `${Math.ceil(me.hp)}/${MP_CONFIG.PLAYER_HP}`;

    const myHpBar = document.getElementById("mp-my-hp-bar");
    if (myHpBar && me) myHpBar.style.width = `${Math.max(0, (me.hp / MP_CONFIG.PLAYER_HP) * 100)}%`;

    const myTeamEl = document.getElementById("mp-my-team");
    if (myTeamEl) {
      myTeamEl.textContent = this.myTeam === "red" ? t("mp_team_red") : t("mp_team_blue");
      myTeamEl.style.color = this.myTeam === "red" ? "#ff0055" : "#00aaff";
    }

    const timerEl = document.getElementById("mp-timer");
    if (timerEl) {
      const remain = Math.max(0, Math.ceil((this.matchEnd - Date.now()) / 1000));
      timerEl.textContent = `${Math.floor(remain / 60)}:${String(remain % 60).padStart(2, "0")}`;
    }
  },

  // ============ 大廳玩家列表 ============
  renderLobbyPlayers() {
    const box = document.getElementById("mp-player-list");
    if (!box) return;
    box.innerHTML = "";
    Object.entries(this.players).forEach(([id, p]) => {
      const div = document.createElement("div");
      div.style.cssText = `padding:8px;border-radius:8px;margin-bottom:6px;border:1.5px solid ${p.team === "red" ? "#ff0055" : "#00aaff"};background:rgba(12,18,34,.9);font-size:.82rem;display:flex;justify-content:space-between;`;
      div.innerHTML = `<span>${p.team === "red" ? "🔴" : "🔵"} ${p.name}${id === Net.myPeerId ? " " + t("mp_you") : ""}</span><span style="color:${p.team === "red" ? "#ff0055" : "#00aaff"};font-weight:800;">${p.team === "red" ? "RED" : "BLUE"}</span>`;
      box.appendChild(div);
    });
  },

  // ============ 渲染（主循環呼叫） ============
  draw() {
    ctx.fillStyle = "#04060c";
    ctx.fillRect(0, 0, W, H);

    const me = this.players[this.myId];
    if (!me) return;

    // 相機跟隨本地玩家
    let camX = Math.max(0, Math.min(MAP_SIZE - W, me.x - W / 2));
    let camY = Math.max(0, Math.min(MAP_SIZE - H, me.y - H / 2));
    if (W >= MAP_SIZE) camX = (MAP_SIZE - W) / 2;
    if (H >= MAP_SIZE) camY = (MAP_SIZE - H) / 2;

    ctx.save();
    ctx.translate(-camX, -camY);

    // 背景網格
    ctx.strokeStyle = "rgba(0,243,255,.05)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= MAP_SIZE; x += 100) { ctx.moveTo(x, 0); ctx.lineTo(x, MAP_SIZE); }
    for (let y = 0; y <= MAP_SIZE; y += 100) { ctx.moveTo(0, y); ctx.lineTo(MAP_SIZE, y); }
    ctx.stroke();

    // 邊框
    ctx.strokeStyle = "#ff0055";
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, MAP_SIZE, MAP_SIZE);

    // 中線
    ctx.strokeStyle = "rgba(184,41,255,.4)";
    ctx.lineWidth = 3;
    ctx.setLineDash([20, 15]);
    ctx.beginPath();
    ctx.moveTo(0, MAP_SIZE / 2); ctx.lineTo(MAP_SIZE, MAP_SIZE / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // 障礙物
    this.obstacles.forEach(o => {
      if (window.NeonDecor?.renderObstacle) {
        window.NeonDecor.renderObstacle(ctx, o, !SaveSys.data.settings.neonGlow);
      } else {
        ctx.fillStyle = "#1a0a2a";
        ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.fill();
      }
    });

    // 遠程玩家
    Object.entries(this.players).forEach(([id, p]) => {
      if (id === this.myId) return;
      if (!p.alive) {
        ctx.save();
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = p.team === "red" ? "#ff0055" : "#00aaff";
        ctx.font = "bold 12px Orbitron, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("☠️ " + (p.name || "Player"), p.x, p.y);
        ctx.restore();
        return;
      }
      if (window.NeonDecor?.renderRemotePlayer) {
        window.NeonDecor.renderRemotePlayer(ctx, p, !SaveSys.data.settings.neonGlow);
      } else {
        ctx.fillStyle = p.team === "red" ? "#ff0055" : "#00aaff";
        ctx.beginPath(); ctx.arc(p.x, p.y, MP_CONFIG.PLAYER_RADIUS, 0, Math.PI * 2); ctx.fill();
      }
    });

    // 本地玩家
    if (me.alive) {
      if (window.NeonDecor?.renderRemotePlayer) {
        const mySkin = getSelectedSkinObj();
        ctx.save();
        ctx.translate(me.x, me.y);
        ctx.rotate(me.angle);
        ctx.scale(1, 0.86);
        const teamCol = this.myTeam === "red" ? "#ff0055" : "#00aaff";
        ctx.beginPath();
        ctx.moveTo(18, 0); ctx.lineTo(-12, -12); ctx.lineTo(-6, 0); ctx.lineTo(-12, 12);
        ctx.closePath();
        ctx.fillStyle = "#060a14"; ctx.fill();
        ctx.strokeStyle = teamCol; ctx.lineWidth = 2.5;
        ctx.shadowColor = teamCol; ctx.shadowBlur = 10;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2);
        ctx.fillStyle = "#fff"; ctx.fill();
        ctx.restore();
        // 本地名字
        ctx.fillStyle = teamCol;
        ctx.font = "bold 11px Orbitron, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(this.myName + " (You)", me.x, me.y - 28);
        // HP bar
        const bw = 40;
        ctx.fillStyle = "rgba(0,0,0,.7)";
        ctx.fillRect(me.x - bw / 2, me.y - 24, bw, 5);
        ctx.fillStyle = teamCol;
        ctx.fillRect(me.x - bw / 2, me.y - 24, bw * (me.hp / MP_CONFIG.PLAYER_HP), 5);
      }
    } else {
      ctx.save();
      ctx.fillStyle = "rgba(255,0,85,.7)";
      ctx.font = "bold 16px Orbitron, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("☠️ 重生中...", me.x, me.y - 30);
      ctx.restore();
    }

    // 子彈
    this.bullets.forEach(b => {
      const col = b.team === "red" ? "#ff3366" : "#33aaff";
      ctx.save();
      ctx.shadowColor = col; ctx.shadowBlur = 12;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });

    ctx.restore();

    // 小地圖
    this.drawMPMinimap();
  },

  drawMPMinimap() {
    const size = Math.min(140, W * 0.2);
    const x0 = 12, y0 = 128;
    const k = size / MAP_SIZE;
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "rgba(4,6,12,.85)";
    ctx.fillRect(x0, y0, size, size);
    ctx.strokeStyle = "rgba(0,243,255,.6)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x0, y0, size, size);

    this.obstacles.forEach(o => {
      ctx.fillStyle = "rgba(255,128,255,.5)";
      ctx.beginPath();
      ctx.arc(x0 + o.x * k, y0 + o.y * k, Math.max(2, o.r * k), 0, Math.PI * 2);
      ctx.fill();
    });

    Object.entries(this.players).forEach(([id, p]) => {
      if (!p.alive) return;
      ctx.fillStyle = id === this.myId ? "#ffee00" : (p.team === "red" ? "#ff0055" : "#00aaff");
      ctx.beginPath();
      ctx.arc(x0 + p.x * k, y0 + p.y * k, id === this.myId ? 4 : 3, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }
};