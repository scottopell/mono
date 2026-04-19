// PeerJS session wrapper.
//
// REQ-BG-001: host creates a room with a short code (6-char, no ambiguous glyphs).
// REQ-BG-002: guest joins by code; reports failure on timeout.
// REQ-BG-011: status events drive the connection indicator.
// REQ-BG-012: host is the only writer; guest only mirrors state.
(() => {
  'use strict';

  // No I/L/O/0/1 — these are the characters people misread on a phone.
  const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const CODE_LENGTH = 6;
  // Namespace prefix prevents collisions with other apps on peerjs.com.
  const PEER_PREFIX = 'bg26-';
  const JOIN_TIMEOUT_MS = 10000;

  function randomCode() {
    let s = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    return s;
  }

  function normalizeCode(s) {
    return (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function peerOptions() {
    const cfg = (window.BACKGAMMON_CONFIG && window.BACKGAMMON_CONFIG.turn) || null;
    const iceServers = [
      { urls: ['stun:stun.l.google.com:19302', 'stun:global.stun.twilio.com:3478'] },
    ];
    if (cfg) {
      iceServers.push({
        urls: cfg.urls,
        username: cfg.username,
        credential: cfg.credential,
      });
    } else {
      console.warn('[backgammon] No TURN config found — STUN only. Some networks may fail to connect.');
    }
    return {
      debug: 1,
      config: { iceServers },
    };
  }

  // -------- Host --------

  function createHost({ onGuestJoined, onIntent, onStatus, onError }) {
    const code = randomCode();
    const peer = new Peer(PEER_PREFIX + code, peerOptions());
    let conn = null;

    const api = {
      code,
      send(msg) {
        if (conn && conn.open) conn.send(msg);
      },
      close() {
        if (conn) try { conn.close(); } catch (_) {}
        try { peer.destroy(); } catch (_) {}
      },
    };

    peer.on('open', () => {
      onStatus && onStatus('waiting');
    });

    peer.on('connection', (c) => {
      if (conn && conn.open) {
        // Already have a guest; reject extras.
        try { c.close(); } catch (_) {}
        return;
      }
      conn = c;
      conn.on('open', () => {
        onStatus && onStatus('connected');
        onGuestJoined && onGuestJoined();
      });
      conn.on('data', (msg) => {
        if (msg && msg.type === 'intent') {
          onIntent && onIntent(msg);
        }
      });
      conn.on('close', () => {
        onStatus && onStatus('reconnecting');
      });
      conn.on('error', (err) => {
        onStatus && onStatus('reconnecting');
        onError && onError(err);
      });
    });

    peer.on('disconnected', () => {
      onStatus && onStatus('reconnecting');
      setTimeout(() => {
        try { peer.reconnect(); } catch (_) {}
      }, 500);
    });

    peer.on('error', (err) => {
      // 'unavailable-id' = our custom peer id collided. Very unlikely at 2-person scale.
      console.error('[backgammon] host peer error:', err);
      onError && onError(err);
    });

    return api;
  }

  // -------- Guest --------

  function joinAsGuest(roomCode, { onState, onStatus, onError }) {
    const peer = new Peer(peerOptions());
    let conn = null;
    let timedOut = false;

    const api = {
      send(msg) {
        if (conn && conn.open) conn.send(msg);
      },
      close() {
        if (conn) try { conn.close(); } catch (_) {}
        try { peer.destroy(); } catch (_) {}
      },
    };

    const timer = setTimeout(() => {
      timedOut = true;
      onError && onError(new Error('timeout'));
      api.close();
    }, JOIN_TIMEOUT_MS);

    peer.on('open', () => {
      if (timedOut) return;
      onStatus && onStatus('connecting');
      conn = peer.connect(PEER_PREFIX + roomCode, { reliable: true });
      conn.on('open', () => {
        clearTimeout(timer);
        onStatus && onStatus('connected');
      });
      conn.on('data', (msg) => {
        if (msg && msg.type === 'state') {
          onState && onState(msg.state);
        }
      });
      conn.on('close', () => {
        onStatus && onStatus('reconnecting');
      });
      conn.on('error', (err) => {
        clearTimeout(timer);
        onStatus && onStatus('reconnecting');
        onError && onError(err);
      });
    });

    peer.on('disconnected', () => {
      onStatus && onStatus('reconnecting');
      setTimeout(() => {
        try { peer.reconnect(); } catch (_) {}
      }, 500);
    });

    peer.on('error', (err) => {
      clearTimeout(timer);
      // peer-unavailable = the code doesn't match any open room
      if (err.type === 'peer-unavailable') {
        onError && onError(new Error('peer-unavailable'));
      } else {
        onError && onError(err);
      }
    });

    return api;
  }

  window.BackgammonPeer = {
    createHost,
    joinAsGuest,
    normalizeCode,
  };
})();
