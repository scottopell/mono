// PeerJS session wrapper.
//
// REQ-BG-001: host creates a room with a short code (6-char, no ambiguous glyphs).
// REQ-BG-002: guest joins by code; reports failure on timeout.
// REQ-BG-011: status events drive the connection indicator + bounded reconnect.
// REQ-BG-012: host is the only writer; guest only mirrors state.
(() => {
  'use strict';

  // No I/L/O/0/1 — these are the characters people misread on a phone.
  const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const CODE_LENGTH = 6;
  // Namespace prefix prevents collisions with other apps on peerjs.com.
  const PEER_PREFIX = 'bg26-';
  const JOIN_TIMEOUT_MS = 10000;
  const MAX_HOST_ID_RETRIES = 5;
  const MAX_RECONNECT_ATTEMPTS = 3;
  const RECONNECT_BASE_MS = 500;

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
    let peer = null;
    let conn = null;
    let closed = false;
    let idRetries = 0;

    const api = {
      code: null,
      send(msg) {
        if (conn && conn.open) conn.send(msg);
      },
      close() {
        closed = true;
        if (conn) try { conn.close(); } catch (_) {}
        if (peer) try { peer.destroy(); } catch (_) {}
      },
    };

    function openPeerWithNewCode() {
      api.code = randomCode();
      peer = new Peer(PEER_PREFIX + api.code, peerOptions());

      peer.on('open', () => {
        if (closed) return;
        onStatus && onStatus('waiting');
      });

      peer.on('connection', (c) => {
        if (closed) return;
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
        const dropToWaiting = () => {
          if (conn === c) conn = null;
          if (closed) return;
          // Guest left; host has nothing to do but wait for a (possibly new) guest.
          onStatus && onStatus('waiting');
        };
        conn.on('close', dropToWaiting);
        conn.on('error', (err) => {
          onError && onError(err);
          dropToWaiting();
        });
      });

      peer.on('disconnected', () => {
        if (closed) return;
        onStatus && onStatus('reconnecting');
        setTimeout(() => {
          if (closed) return;
          try { peer.reconnect(); } catch (_) {}
        }, RECONNECT_BASE_MS);
      });

      peer.on('error', (err) => {
        if (closed) return;
        // 'unavailable-id' = our custom peer id is taken; retry with a new code.
        if (err && err.type === 'unavailable-id' && idRetries < MAX_HOST_ID_RETRIES) {
          idRetries += 1;
          try { peer.destroy(); } catch (_) {}
          openPeerWithNewCode();
          return;
        }
        console.error('[backgammon] host peer error:', err);
        onError && onError(err);
      });
    }

    openPeerWithNewCode();
    return api;
  }

  // -------- Guest --------

  function joinAsGuest(roomCode, { onState, onStatus, onError }) {
    const targetPeerId = PEER_PREFIX + roomCode;
    const peer = new Peer(peerOptions());
    let conn = null;
    let closed = false;
    let connectedOnce = false;
    let reconnectAttempts = 0;
    let reconnectTimer = null;

    const api = {
      send(msg) {
        if (conn && conn.open) conn.send(msg);
      },
      close() {
        closed = true;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        if (conn) try { conn.close(); } catch (_) {}
        try { peer.destroy(); } catch (_) {}
      },
    };

    const joinTimer = setTimeout(() => {
      if (connectedOnce || closed) return;
      onError && onError(new Error('timeout'));
      api.close();
    }, JOIN_TIMEOUT_MS);

    function attachConn(c) {
      conn = c;
      conn.on('open', () => {
        if (!connectedOnce) {
          connectedOnce = true;
          clearTimeout(joinTimer);
        }
        reconnectAttempts = 0;
        onStatus && onStatus('connected');
      });
      conn.on('data', (msg) => {
        if (msg && msg.type === 'state') {
          onState && onState(msg.state, msg.selection || null);
        }
      });
      conn.on('close', () => {
        if (closed) return;
        attemptReconnect();
      });
      conn.on('error', (err) => {
        if (closed) return;
        onError && onError(err);
        // 'close' fires separately; reconnect is driven from there.
      });
    }

    function attemptReconnect() {
      if (closed) return;
      if (!connectedOnce) {
        // Never established a connection — this is the initial-join failure path.
        return;
      }
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        onStatus && onStatus('lost');
        return;
      }
      reconnectAttempts += 1;
      onStatus && onStatus('reconnecting');
      const backoff = RECONNECT_BASE_MS * Math.pow(2, reconnectAttempts - 1);
      reconnectTimer = setTimeout(() => {
        if (closed) return;
        try {
          if (peer.disconnected) peer.reconnect();
          attachConn(peer.connect(targetPeerId, { reliable: true }));
        } catch (e) {
          onError && onError(e);
          attemptReconnect();
        }
      }, backoff);
    }

    peer.on('open', () => {
      if (closed) return;
      onStatus && onStatus('connecting');
      attachConn(peer.connect(targetPeerId, { reliable: true }));
    });

    peer.on('disconnected', () => {
      if (closed) return;
      // Signaling dropped; data channel may still be alive. Try to reopen signaling
      // so a later reconnect can succeed. UI status is driven by the data channel.
      setTimeout(() => {
        if (closed) return;
        try { peer.reconnect(); } catch (_) {}
      }, RECONNECT_BASE_MS);
    });

    peer.on('error', (err) => {
      if (closed) return;
      // peer-unavailable = the code doesn't match any open room
      if (err && err.type === 'peer-unavailable') {
        clearTimeout(joinTimer);
        onError && onError(new Error('peer-unavailable'));
        return;
      }
      onError && onError(err);
    });

    return api;
  }

  window.BackgammonPeer = {
    createHost,
    joinAsGuest,
    normalizeCode,
  };
})();
