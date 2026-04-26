// PeerJS session wrapper.
//
// REQ-UB-016 (inherited): room code pairing and the WebRTC data channel are
//   unchanged from the prior mirrored-board version — pairing is out of
//   scope for the unified-board rewrite.
//
// The connection-establishment flow is unchanged from the prior version
// (REQ-BG-001 / REQ-BG-002). The unified board adds new message types on
// top of the existing data channel; see specs/design.md → "Peer Messaging".
//   - { type:'hello', role }
//   - { type:'tap',  x, y }
//   - { type:'live', state, selectedDie }
//   - { type:'diceCommit' | 'diceReveal', ... }
//   - { type:'commit', state }
//   - { type:'abort', reason }
//
// This module delivers all messages to a single `onMessage` callback and
// lets main.js dispatch by type. The older `onState` / `onIntent`
// callbacks are gone — authority is no longer single-writer-host, so the
// host/guest distinction here is only about who dials whom.
(() => {
  'use strict';

  const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const CODE_LENGTH = 6;
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
      console.warn('[backgammon] No TURN config found — STUN only.');
    }
    return { debug: 1, config: { iceServers } };
  }

  // PeerJS errors that are recoverable through PeerJS's own reconnect
  // path (signaling drops, transient network blips). When these fire
  // after the peer is already open we used to bubble them to onError,
  // which kicked the host back to lobby — making the system wildly
  // fragile to peerjs.com signaling hiccups. Now we let the
  // 'disconnected' event handler run peer.reconnect() and just surface
  // 'reconnecting' status to the UI.
  const RECOVERABLE_ERROR_TYPES = new Set([
    'network',
    'disconnected',
    'server-error',
    'socket-error',
    'socket-closed',
  ]);

  // -------- Host --------

  // forceCode: if provided, the host MUST claim that exact peer ID (used by
  //   the rejoin flow so a refreshed host keeps the same room code). On
  //   'unavailable-id' (e.g., the previous Peer hasn't yet been freed by
  //   the signaling server), retry the same code with backoff. Without
  //   forceCode, host generates a fresh code and rolls a new one on
  //   collision.
  function createHost({ onPeerJoined, onMessage, onStatus, onError, forceCode }) {
    let peer = null;
    let conn = null;
    let closed = false;
    let idRetries = 0;
    let forceCodeRetries = 0;
    let peerOpened = false;
    const FORCE_CODE_MAX_RETRIES = 5;       // ~10–30s with exponential backoff
    const FORCE_CODE_BASE_MS = 1500;

    const api = {
      code: null,
      send(msg) { if (conn && conn.open) conn.send(msg); },
      close() {
        closed = true;
        if (conn) try { conn.close(); } catch (_) {}
        if (peer) try { peer.destroy(); } catch (_) {}
      },
    };

    function openPeerWithNewCode() {
      api.code = forceCode || randomCode();
      peer = new Peer(PEER_PREFIX + api.code, peerOptions());

      peer.on('open', () => {
        if (closed) return;
        peerOpened = true;
        onStatus && onStatus('waiting');
      });

      peer.on('connection', (c) => {
        if (closed) return;
        if (conn && conn.open) { try { c.close(); } catch (_) {} return; }
        conn = c;
        conn.on('open', () => {
          onStatus && onStatus('connected');
          onPeerJoined && onPeerJoined();
        });
        conn.on('data', (msg) => { if (msg) onMessage && onMessage(msg); });
        const drop = () => {
          if (conn === c) conn = null;
          if (closed) return;
          onStatus && onStatus('waiting');
        };
        conn.on('close', drop);
        conn.on('error', (err) => { onError && onError(err); drop(); });
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
        if (err && err.type === 'unavailable-id') {
          if (forceCode && forceCodeRetries < FORCE_CODE_MAX_RETRIES) {
            // Host is rejoining and the signaling server hasn't released
            // the previous Peer's id yet. Wait and retry the same code.
            forceCodeRetries += 1;
            const backoff = FORCE_CODE_BASE_MS * Math.pow(1.5, forceCodeRetries - 1);
            try { peer.destroy(); } catch (_) {}
            onStatus && onStatus('reconnecting');
            setTimeout(() => { if (!closed) openPeerWithNewCode(); }, backoff);
            return;
          }
          if (!forceCode && idRetries < MAX_HOST_ID_RETRIES) {
            idRetries += 1;
            try { peer.destroy(); } catch (_) {}
            openPeerWithNewCode();
            return;
          }
        }
        // After the peer is open, transient signaling/network errors
        // shouldn't kick the user back to lobby — peerjs.com hiccups
        // happen often enough that bouncing the player loses real games.
        // Surface reconnecting status; PeerJS auto-reconnect (via the
        // 'disconnected' event we wired above) handles recovery.
        if (peerOpened && err && RECOVERABLE_ERROR_TYPES.has(err.type)) {
          console.warn('[backgammon] host peer transient error (recovering):', err);
          onStatus && onStatus('reconnecting');
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

  function joinAsGuest(roomCode, { onMessage, onStatus, onError }) {
    const targetPeerId = PEER_PREFIX + roomCode;
    const peer = new Peer(peerOptions());
    let conn = null;
    let closed = false;
    let connectedOnce = false;
    let reconnectAttempts = 0;
    let reconnectTimer = null;

    const api = {
      send(msg) { if (conn && conn.open) conn.send(msg); },
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
      conn.on('data', (msg) => { if (msg) onMessage && onMessage(msg); });
      conn.on('close', () => { if (!closed) attemptReconnect(); });
      conn.on('error', (err) => { if (!closed) onError && onError(err); });
    }

    function attemptReconnect() {
      if (closed) return;
      if (!connectedOnce) return;
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
      setTimeout(() => {
        if (closed) return;
        try { peer.reconnect(); } catch (_) {}
      }, RECONNECT_BASE_MS);
    });

    peer.on('error', (err) => {
      if (closed) return;
      if (err && err.type === 'peer-unavailable') {
        clearTimeout(joinTimer);
        onError && onError(new Error('peer-unavailable'));
        return;
      }
      // After we've connected once, ride out transient signaling/network
      // errors via PeerJS's reconnect rather than throwing the user back
      // to the lobby. Only surface fatal errors (and pre-connect failures)
      // to the caller.
      if (connectedOnce && err && RECOVERABLE_ERROR_TYPES.has(err.type)) {
        console.warn('[backgammon] guest peer transient error (recovering):', err);
        onStatus && onStatus('reconnecting');
        return;
      }
      onError && onError(err);
    });

    return api;
  }

  window.BackgammonPeer = { createHost, joinAsGuest, normalizeCode };
})();
