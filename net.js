// ============================================================
// NEON OVERDRIVE ONLINE // net.js
// PeerJS（WebRTC P2P）免費聯機封裝
// ============================================================

const Net = {
  peer: null,
  conns: [],          // 主機端維護多條連線
  hostConn: null,     // 客戶端連到主機的連線
  isHost: false,
  roomCode: "",
  myPeerId: "",
  handlers: {},
  PEER_PREFIX: "neonovd-online-",
  loaded: false,

  async loadPeerJS() {
    if (this.loaded || window.Peer) { this.loaded = true; return; }
    
    // 優先使用 jsdelivr，備用 unpkg (提升亞洲地區載入成功率)
    const cdns = [
      "https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js",
      "https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js"
    ];

    for (let url of cdns) {
      try {
        await new Promise((resolve, reject) => {
          const s = document.createElement("script");
          s.src = url;
          s.crossOrigin = "anonymous";
          s.onload = () => { this.loaded = true; resolve(); };
          s.onerror = () => reject(new Error("CDN load fail: " + url));
          document.head.appendChild(s);
        });
        if (window.Peer) return; // 加載成功直接返回
      } catch (e) {
        console.warn("[Net] CDN 載入失敗，嘗試下一個...", e);
      }
    }
    throw new Error("所有 PeerJS CDN 載入失敗，請檢查網路連線");
  },

  // 統一的 Peer 設定檔（加入 STUN 穿透）
  getPeerOptions() {
    return {
      debug: 0,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
          { urls: 'stun:stun4.l.google.com:19302' }
        ]
      }
    };
  },

  genCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let s = "";
    for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  },

  init(callbacks) {
    this.handlers = callbacks || {};
  },

  async host() {
    await this.loadPeerJS();
    const code = this.genCode();
    this.isHost = true;
    this.roomCode = code;
    const fullId = this.PEER_PREFIX + code;

    return new Promise((resolve, reject) => {
      // 使用包含 STUN 的設定
      this.peer = new Peer(fullId, this.getPeerOptions());
      
      this.peer.on("open", id => {
        this.myPeerId = id;
        if (this.handlers.onOpen) this.handlers.onOpen(code);
        resolve(code);
      });
      
      this.peer.on("connection", conn => {
        this.conns.push(conn);
        this.wireConn(conn);
      });
      
      this.peer.on("error", e => {
        if (this.handlers.onError) this.handlers.onError(e);
        reject(e);
      });
    });
  },

  async join(code) {
    await this.loadPeerJS();
    this.isHost = false;
    this.roomCode = code.toUpperCase().trim();

    return new Promise((resolve, reject) => {
      // 使用包含 STUN 的設定
      this.peer = new Peer(undefined, this.getPeerOptions());
      
      this.peer.on("open", id => {
        this.myPeerId = id;
        const conn = this.peer.connect(this.PEER_PREFIX + this.roomCode, { reliable: true });
        this.hostConn = conn;
        this.wireConn(conn, true);
        
        conn.on("open", () => {
          if (this.handlers.onOpen) this.handlers.onOpen(this.roomCode);
          resolve();
        });
        
        conn.on("error", e => {
          if (this.handlers.onError) this.handlers.onError(e);
          reject(e);
        });
      });
      
      this.peer.on("error", e => {
        if (this.handlers.onError) this.handlers.onError(e);
        reject(e);
      });
    });
  },

  wireConn(conn, isHostSide = false) {
    conn.on("open", () => {
      if (isHostSide && this.handlers.onConnected) this.handlers.onConnected(conn);
      if (!isHostSide && this.handlers.onPeerConnected) this.handlers.onPeerConnected(conn);
    });
    conn.on("data", data => {
      if (this.handlers.onMessage) this.handlers.onMessage(data, conn);
    });
    conn.on("close", () => {
      const i = this.conns.indexOf(conn);
      if (i >= 0) this.conns.splice(i, 1);
      if (this.handlers.onClose) this.handlers.onClose(conn);
    });
    conn.on("error", e => {
      if (this.handlers.onError) this.handlers.onError(e);
    });
  },

  // 主機廣播給所有客戶端
  broadcast(msg) {
    this.conns.forEach(c => {
      try { if (c.open) c.send(msg); } catch (e) {}
    });
  },

  // 客戶端發送給主機
  send(msg) {
    try { if (this.hostConn && this.hostConn.open) this.hostConn.send(msg); } catch (e) {}
  },

  // 主機回覆特定客戶端
  sendTo(conn, msg) {
    try { if (conn && conn.open) conn.send(msg); } catch (e) {}
  },

  disconnect() {
    try {
      if (this.hostConn) this.hostConn.close();
    } catch (e) {}
    try {
      if (this.peer) this.peer.destroy();
    } catch (e) {}
    this.peer = null;
    this.conns = [];
    this.hostConn = null;
    this.isHost = false;
    this.roomCode = "";
    this.myPeerId = "";
  }
};