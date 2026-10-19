const Net = {
  peer: null,
  conns: [],
  hostConn: null,
  isHost: false,
  roomCode: "",
  myPeerId: "",
  handlers: {},
  PEER_PREFIX: "neonovd-online-",
  loaded: false,

  async loadPeerJS() {
    if (this.loaded || window.Peer) { this.loaded = true; return; }
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
        if (window.Peer) return;
      } catch (e) {
        console.warn("[Net] CDN 載入失敗，嘗試下一個...", e);
      }
    }
    throw new Error("所有 PeerJS CDN 載入失敗，請檢查網路連線");
  },

  getPeerOptions() {
    return {
      debug: 0,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' }
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
      this.peer = new Peer(fullId, this.getPeerOptions());
      
      const timeout = setTimeout(() => {
        if (!this.peer.open) {
          this.peer.destroy();
          reject(new Error("連線超時，PeerJS 伺服器可能被封鎖 (香港網路常見)。請嘗試開啟 VPN 或使用自建伺服器。"));
        }
      }, 10000);

      this.peer.on("open", id => {
        clearTimeout(timeout);
        this.myPeerId = id;
        if (this.handlers.onOpen) this.handlers.onOpen(code);
        resolve(code);
      });
      
      this.peer.on("connection", conn => {
        this.conns.push(conn);
        this.wireConn(conn);
      });
      
      this.peer.on("error", e => {
        clearTimeout(timeout);
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
      this.peer = new Peer(undefined, this.getPeerOptions());
      
      const timeout = setTimeout(() => {
        if (!this.peer.open) {
          this.peer.destroy();
          reject(new Error("連線超時，PeerJS 伺服器可能被封鎖。請嘗試開啟 VPN。"));
        }
      }, 10000);

      this.peer.on("open", id => {
        clearTimeout(timeout);
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
        clearTimeout(timeout);
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

  broadcast(msg) {
    this.conns.forEach(c => {
      try { if (c.open) c.send(msg); } catch (e) {}
    });
  },

  send(msg) {
    try { if (this.hostConn && this.hostConn.open) this.hostConn.send(msg); } catch (e) {}
  },

  sendTo(conn, msg) {
    try { if (conn && conn.open) conn.send(msg); } catch (e) {}
  },

  disconnect() {
    try { if (this.hostConn) this.hostConn.close(); } catch (e) {}
    try { if (this.peer) this.peer.destroy(); } catch (e) {}
    this.peer = null;
    this.conns = [];
    this.hostConn = null;
    this.isHost = false;
    this.roomCode = "";
    this.myPeerId = "";
  }
};