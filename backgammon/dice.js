// Commit-reveal dice protocol.
//
// REQ-UB-005: neither phone alone determines dice outcomes; mismatched
//   reveals abort the session. SHA-256 commitments, HMAC-SHA-256 combine.
//
// Flow per roll:
//   1. Each phone generates (secret, salt) and hashes → commit.
//   2. Each sends its commit. No reveals until both commits are in.
//   3. Each reveals (secret, salt); verify the peer's matches the earlier
//      commit.
//   4. Combined = secret_local XOR secret_remote.
//   5. Derived = HMAC-SHA-256(combined, "roll:<turn>:<purpose>").
//   6. Take successive bytes mod 6 + 1 to produce the required number of
//      die values.
//
// Exposes a roll-session API. The caller drives state transitions via
// start() / onPeerCommit() / onPeerReveal(); the session emits side-effect
// callbacks (send, onDice, onAbort).
(() => {
  'use strict';

  const subtle = (window.crypto && window.crypto.subtle) || null;

  // --- Hex helpers ---

  function bufToHex(buf) {
    const bytes = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < bytes.length; i++) {
      s += bytes[i].toString(16).padStart(2, '0');
    }
    return s;
  }

  function hexToBytes(hex) {
    if (hex.length % 2 !== 0) throw new Error('bad hex length');
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) {
      out[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return out;
  }

  function randomBytes(n) {
    const b = new Uint8Array(n);
    window.crypto.getRandomValues(b);
    return b;
  }

  function concatBytes(a, b) {
    const out = new Uint8Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
  }

  function xorBytes(a, b) {
    const n = Math.min(a.length, b.length);
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = a[i] ^ b[i];
    return out;
  }

  // SHA-256(bytes) → hex string.
  async function sha256Hex(bytes) {
    if (!subtle) throw new Error('crypto.subtle unavailable');
    const h = await subtle.digest('SHA-256', bytes);
    return bufToHex(h);
  }

  // HMAC-SHA-256(key, message) → Uint8Array.
  async function hmacSha256(keyBytes, messageStr) {
    if (!subtle) throw new Error('crypto.subtle unavailable');
    const key = await subtle.importKey(
      'raw', keyBytes,
      { name: 'HMAC', hash: 'SHA-256' },
      false, ['sign'],
    );
    const msg = new TextEncoder().encode(messageStr);
    const sig = await subtle.sign('HMAC', key, msg);
    return new Uint8Array(sig);
  }

  // Derive N die values (1..6) from an HMAC output. Successive bytes, but
  // skip bytes in [252, 255] (mod 6 is unbiased on 0..251).
  function bytesToDice(bytes, n) {
    const dice = [];
    let i = 0;
    while (dice.length < n && i < bytes.length) {
      const b = bytes[i++];
      if (b < 252) dice.push((b % 6) + 1);
    }
    if (dice.length < n) {
      // Astronomically unlikely, but be honest about it rather than looping
      // past the message length and silently biasing.
      throw new Error('ran out of entropy deriving dice');
    }
    return dice;
  }

  // ---------- Roll session ----------

  // purpose: 'opening' | 'turn'
  // count: number of dice to derive (1 for opening side, 2 for a regular turn)
  // turn: monotonic counter for domain separation
  //
  // Callbacks:
  //   send(msg)     — send a wire message to the peer
  //   onDice(dice)  — fires when both sides have verified; result is a list of die values
  //   onAbort(reason) — fires on any verification / protocol failure
  function createRollSession({ purpose, count, turn, send, onDice, onAbort }) {
    let state = 'idle';     // idle → committed → revealed → done / aborted
    let localSecret = null;
    let localSalt = null;
    let localCommit = null;
    let remoteCommit = null;
    let remoteReveal = null; // { secret: Uint8Array, salt: Uint8Array }
    let aborted = false;

    const abort = (reason) => {
      if (aborted) return;
      aborted = true;
      state = 'aborted';
      onAbort && onAbort(reason);
    };

    async function start() {
      if (state !== 'idle') return;
      try {
        localSecret = randomBytes(32);
        localSalt = randomBytes(16);
        localCommit = await sha256Hex(concatBytes(localSecret, localSalt));
        state = 'committed';
        send({
          type: 'diceCommit',
          commit: localCommit,
          purpose, turn, count,
        });
        // If peer's commit arrived first, we're ready to reveal now.
        if (remoteCommit) sendReveal();
      } catch (e) {
        abort('local commit failure: ' + e.message);
      }
    }

    function sendReveal() {
      if (state !== 'committed') return;
      send({
        type: 'diceReveal',
        secret: bufToHex(localSecret),
        salt: bufToHex(localSalt),
        purpose, turn,
      });
      state = 'revealed';
      // If their reveal is already in, finish.
      if (remoteReveal) finish();
    }

    function onPeerCommit(msg) {
      if (aborted) return;
      if (msg.purpose !== purpose || msg.turn !== turn) {
        return abort('commit purpose/turn mismatch');
      }
      if (remoteCommit) return abort('duplicate commit');
      remoteCommit = msg.commit;
      // If we already committed, we can reveal now.
      if (state === 'committed') sendReveal();
    }

    function onPeerReveal(msg) {
      if (aborted) return;
      if (msg.purpose !== purpose || msg.turn !== turn) {
        return abort('reveal purpose/turn mismatch');
      }
      if (!remoteCommit) return abort('reveal before commit');
      if (remoteReveal) return abort('duplicate reveal');
      let secret, salt;
      try {
        secret = hexToBytes(msg.secret);
        salt = hexToBytes(msg.salt);
      } catch (e) {
        return abort('bad reveal bytes');
      }
      remoteReveal = { secret, salt };
      if (state === 'revealed') finish();
    }

    async function finish() {
      try {
        const expected = await sha256Hex(
          concatBytes(remoteReveal.secret, remoteReveal.salt),
        );
        if (expected !== remoteCommit) {
          return abort('peer reveal does not match commitment');
        }
        const combined = xorBytes(localSecret, remoteReveal.secret);
        const hmac = await hmacSha256(
          combined, `roll:${turn}:${purpose}`,
        );
        const dice = bytesToDice(hmac, count);
        state = 'done';
        onDice && onDice(dice);
      } catch (e) {
        abort('finalize failure: ' + e.message);
      }
    }

    return { start, onPeerCommit, onPeerReveal, getState: () => state };
  }

  window.BackgammonDice = {
    createRollSession,
    // Exposed for local/hotseat mode only — bypasses the protocol.
    localRandomDice(count) {
      const out = [];
      for (let i = 0; i < count; i++) {
        out.push(1 + Math.floor(Math.random() * 6));
      }
      return out;
    },
  };
})();
