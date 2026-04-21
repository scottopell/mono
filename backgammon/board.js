// Canvas board rendering + hit-testing in shared WORLD coordinates.
//
// REQ-UB-001: single shared world coord system spanning both phones.
// REQ-UB-002: no per-player flip on board surface. Each phone renders its
//   half only; the physical seating of the two players makes the viewing
//   orientation work out automatically.
// REQ-UB-010: hit-testing returns world coords so cross-seam taps can be
//   forwarded to the active phone for re-hit-testing.
// REQ-UB-013: bear-off strip along the outer short edge of the active
//   player's home quadrant.
//
// World layout:
//
//   x: 0                                             W
//   y: 0  ┌─┬──────────────┬─┬──────────────┬─┐
//         │ │  13 .. 18    │ │  19 .. 24    │T│   top half (role 'top')
//         │L│ (outer)      │B│ (home of p2) │R│
//   H/2   │ ├──────────────┤A├──────────────┤A│───── seam
//         │R│  12 .. 7     │R│   6 .. 1     │Y│
//         │ │ (outer)      │ │ (home of p1) │ │   bottom half ('bottom')
//   y: H  └─┴──────────────┴─┴──────────────┴─┘
//
// Points are indexed 0..23 in state.board. Visual layout:
//   index 0  = p1 1-point  (home, bottom-right-inner)
//   index 5  = p1 6-point  (bar-side of p1 home)
//   index 11 = p1 12-point (outer-right-top of bottom row... actually
//              leftmost of the bottom outer quadrant)
//   index 12 = p2 12-point mirror (leftmost of top outer quadrant)
//   index 23 = p2 1-point mirror (top-right-inner)
//
// Concretely: bottom row (y > H/2) shows points 1..12, visually
//   left-to-right as 12, 11, 10, 9, 8, 7, [BAR], 6, 5, 4, 3, 2, 1.
//   (That is: outer quadrant on the left, home on the right.)
//   → indices:           11, 10,  9, 8, 7, 6,       5, 4, 3, 2, 1, 0
// Top row (y < H/2) shows points 13..24, visually left-to-right as
//   13, 14, 15, 16, 17, 18, [BAR], 19, 20, 21, 22, 23, 24.
//   → indices:              12, 13, 14, 15, 16, 17,       18, 19, 20, 21, 22, 23
(() => {
  'use strict';

  const COLORS = {
    frame: '#1a0f08',
    felt: '#3a2a1a',
    pointLight: '#d9c3a0',
    pointDark: '#6b3b24',
    bar: '#2a1b0f',
    barEdge: '#1a0f08',
    checkerP1: '#f3e8d4',
    checkerP1Edge: '#a48c68',
    checkerP2: '#1f1610',
    checkerP2Edge: '#5a4a3a',
    highlight: '#f2c878',
    highlightDim: 'rgba(242, 200, 120, 0.35)',
    highlightSource: 'rgba(242, 200, 120, 0.55)',
    label: '#3a2a1a',
    labelLight: '#f3e8d4',
    trayBg: '#2a1b0f',
    dieFace: '#f3e8d4',
    dieFaceUsed: '#8a7a60',
    diePip: '#1a0f08',
    bearOffStrip: 'rgba(242, 200, 120, 0.18)',
    bearOffStripActive: 'rgba(242, 200, 120, 0.45)',
  };

  // World dimensions are arbitrary — the whole thing scales to the canvas.
  const WORLD_W = 1400;
  const WORLD_H = 900;
  const FRAME = 20;
  const BAR_W = 90;
  const TRAY_W = 90;
  const INNER_L = FRAME + TRAY_W;                  // left tray sits at 0..TRAY_W
  const INNER_R = WORLD_W - FRAME - TRAY_W;
  const INNER_W = INNER_R - INNER_L;
  const POINT_W = (INNER_W - BAR_W) / 12;
  const BAR_L = INNER_L + POINT_W * 6;
  const SEAM_Y = WORLD_H / 2;
  const POINT_H = (WORLD_H / 2 - FRAME) * 0.86;

  // Column center X in world coords, indexed 0..11 left-to-right within a half.
  function colCenter(col) {
    if (col < 6) return INNER_L + POINT_W * (col + 0.5);
    return BAR_L + BAR_W + POINT_W * (col - 6 + 0.5);
  }

  // Map board index → { x, yBase, yTip, half }.
  // Bottom row (half='bottom'): indices 0..11 visually left-to-right = 11..0.
  // Top row    (half='top'):    indices 12..23 visually left-to-right = 12..23.
  function pointAnchor(idx) {
    if (idx <= 11) {
      // col 0 (leftmost) = index 11; col 11 (rightmost) = index 0.
      const col = 11 - idx;
      return {
        x: colCenter(col),
        yBase: WORLD_H - FRAME,
        yTip: WORLD_H - FRAME - POINT_H,
        half: 'bottom',
        col,
      };
    }
    const col = idx - 12;
    return {
      x: colCenter(col),
      yBase: FRAME,
      yTip: FRAME + POINT_H,
      half: 'top',
      col,
    };
  }

  // Which half does a point live in? 'top' for 12..23, 'bottom' for 0..11.
  function halfForIndex(idx) { return idx <= 11 ? 'bottom' : 'top'; }

  // Each player's home quadrant in world terms.
  //   p1 home = indices 0..5, bottom-right quadrant.
  //   p2 home = indices 18..23, top-right quadrant.
  function homeQuadrantRect(player) {
    const x = BAR_L + BAR_W;
    const w = POINT_W * 6;
    if (player === 'p1') return { x, y: SEAM_Y, w, h: WORLD_H / 2 };
    return { x, y: 0, w, h: WORLD_H / 2 };
  }

  // Bear-off strip sits in the outer tray beside the player's home quadrant.
  function bearOffRect(player) {
    const x = WORLD_W - FRAME - TRAY_W;
    const w = TRAY_W;
    if (player === 'p1') return { x, y: SEAM_Y, w, h: WORLD_H / 2 };
    return { x, y: 0, w, h: WORLD_H / 2 };
  }

  // ---------- Viewport mapping ----------

  // Given a canvas size and a role, build a transform from world coords
  // (x in 0..W, y in 0..H) to canvas coords. Each phone sees its own half
  // stretched to fill the canvas; the 'local' hotseat role sees the whole
  // board (both halves) and is intended for single-device playtesting.
  function viewportFor(canvasW, canvasH, role) {
    let srcY, srcH;
    if (role === 'local') { srcY = 0; srcH = WORLD_H; }
    else if (role === 'top') { srcY = 0; srcH = WORLD_H / 2; }
    else { srcY = SEAM_Y; srcH = WORLD_H / 2; }
    const srcX = 0;
    const srcW = WORLD_W;
    const sx = canvasW / srcW;
    const sy = canvasH / srcH;
    const s = Math.min(sx, sy);
    const drawW = srcW * s;
    const drawH = srcH * s;
    const offX = (canvasW - drawW) / 2;
    const offY = (canvasH - drawH) / 2;
    return {
      srcX, srcY, srcW, srcH,
      scale: s,
      offX, offY,
      drawW, drawH,
      role,
    };
  }

  // World → canvas. Points in the other half end up off-canvas.
  function worldToCanvas(vp, wx, wy) {
    return {
      x: vp.offX + (wx - vp.srcX) * vp.scale,
      y: vp.offY + (wy - vp.srcY) * vp.scale,
    };
  }

  // Canvas → world. Used by hit-testing.
  function canvasToWorld(vp, cx, cy) {
    return {
      x: vp.srcX + (cx - vp.offX) / vp.scale,
      y: vp.srcY + (cy - vp.offY) / vp.scale,
    };
  }

  // ---------- Rendering ----------

  function renderBoard(ctx, state, role, uiState) {
    const canvas = ctx.canvas;
    const w = canvas.clientWidth || canvas.width;
    const h = canvas.clientHeight || canvas.height;
    const vp = viewportFor(w, h, role);

    ctx.clearRect(0, 0, w, h);

    // Backdrop fills the viewport only (the other half stays black).
    ctx.save();
    ctx.translate(vp.offX, vp.offY);
    ctx.scale(vp.scale, vp.scale);
    ctx.translate(-vp.srcX, -vp.srcY);

    // Clip to the visible half so nothing from the other half leaks in
    // (mostly belt-and-braces — we only draw this phone's geometry below).
    ctx.beginPath();
    ctx.rect(vp.srcX, vp.srcY, vp.srcW, vp.srcH);
    ctx.clip();

    // 'local' shows both halves; remote roles each show exactly one.
    const showsBottom = role === 'local' || role === 'bottom';
    const showsTop    = role === 'local' || role === 'top';

    // Frame + felt
    ctx.fillStyle = COLORS.frame;
    ctx.fillRect(0, vp.srcY, WORLD_W, vp.srcH);
    ctx.fillStyle = COLORS.felt;
    if (showsBottom) ctx.fillRect(INNER_L, SEAM_Y, INNER_R - INNER_L, WORLD_H / 2 - FRAME);
    if (showsTop)    ctx.fillRect(INNER_L, FRAME,  INNER_R - INNER_L, WORLD_H / 2 - FRAME);

    // Trays on left + right (outer) — one strip per half
    ctx.fillStyle = COLORS.trayBg;
    const trayH = WORLD_H / 2 - FRAME;
    if (showsBottom) {
      ctx.fillRect(FRAME, SEAM_Y, TRAY_W, trayH);
      ctx.fillRect(WORLD_W - FRAME - TRAY_W, SEAM_Y, TRAY_W, trayH);
    }
    if (showsTop) {
      ctx.fillRect(FRAME, FRAME, TRAY_W, trayH);
      ctx.fillRect(WORLD_W - FRAME - TRAY_W, FRAME, TRAY_W, trayH);
    }

    // Bar
    ctx.fillStyle = COLORS.bar;
    if (showsBottom) ctx.fillRect(BAR_L, SEAM_Y, BAR_W, trayH);
    if (showsTop)    ctx.fillRect(BAR_L, FRAME,  BAR_W, trayH);

    // Points
    const firstIdx = showsBottom ? 0  : 12;
    const lastIdx  = showsTop    ? 23 : 11;
    for (let i = firstIdx; i <= lastIdx; i++) drawPoint(ctx, i);

    // Bear-off strip for the active player, if legal and visible.
    const activePlayer = state.turn;
    if (
      state.phase === 'move' && activePlayer &&
      window.BackgammonRules.canBearOff(state, activePlayer)
    ) {
      const stripHalf = activePlayer === 'p1' ? 'bottom' : 'top';
      const stripVisible = (stripHalf === 'bottom' && showsBottom) ||
                           (stripHalf === 'top' && showsTop);
      if (stripVisible) {
        const r = bearOffRect(activePlayer);
        const active = uiState && uiState.highlights &&
          uiState.highlights.hasBearOff;
        ctx.fillStyle = active ? COLORS.bearOffStripActive : COLORS.bearOffStrip;
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = COLORS.highlight;
        ctx.lineWidth = active ? 3 : 1;
        ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
      }
    }

    // Highlights (sources in current selection and destinations)
    if (uiState && uiState.highlights) {
      const { sources, destinations } = uiState.highlights;
      if (sources) {
        for (const src of sources) drawSourceHighlight(ctx, src);
      }
      if (destinations) {
        for (const dst of destinations) drawDestinationHighlight(ctx, dst);
      }
    }

    // Checkers
    for (let i = firstIdx; i <= lastIdx; i++) {
      const count = Math.abs(state.board[i]);
      if (count === 0) continue;
      const owner = state.board[i] > 0 ? 'p1' : 'p2';
      drawCheckerStack(ctx, i, owner, count);
    }

    // Bar checkers for whichever player's bar stack is on this half.
    // Convention: p1's bar checkers sit on the bottom half (near p1's side),
    // p2's on the top half.
    drawBarStack(ctx, 'p1', state.bar.p1, role);
    drawBarStack(ctx, 'p2', state.bar.p2, role);

    // Borne-off tray: p1 tray sits in bottom-right outer, p2 in top-right outer.
    drawBornOffStack(ctx, 'p1', state.borneOff.p1, role);
    drawBornOffStack(ctx, 'p2', state.borneOff.p2, role);

    // Dice on the active player's home quadrant, if rolled.
    if (state.phase === 'move' && state.dice[0] != null && activePlayer) {
      drawDice(ctx, state, role, uiState && uiState.selectedDie);
    }

    ctx.restore();
  }

  function drawPoint(ctx, idx) {
    const a = pointAnchor(idx);
    const halfW = POINT_W / 2;
    const isLight = (a.col + (a.half === 'top' ? 1 : 0)) % 2 === 0;
    ctx.fillStyle = isLight ? COLORS.pointLight : COLORS.pointDark;
    ctx.beginPath();
    ctx.moveTo(a.x - halfW, a.yBase);
    ctx.lineTo(a.x + halfW, a.yBase);
    ctx.lineTo(a.x, a.yTip);
    ctx.closePath();
    ctx.fill();
  }

  function drawCheckerStack(ctx, idx, owner, count) {
    const a = pointAnchor(idx);
    const r = Math.min(POINT_W * 0.42, POINT_H / 10);
    const dy = a.half === 'top' ? 1 : -1;
    const visible = Math.min(count, 5);
    for (let i = 0; i < visible; i++) {
      const cy = a.yBase + dy * (r + i * 2 * r);
      drawChecker(ctx, a.x, cy, r, owner);
    }
    if (count > 5) {
      const cy = a.yBase + dy * (r + (visible - 1) * 2 * r);
      drawCountLabel(ctx, a.x, cy, r, count, owner);
    }
  }

  function drawBarStack(ctx, owner, count, role) {
    if (count === 0) return;
    const isOnThisHalf = role === 'local' ||
      (owner === 'p1' && role === 'bottom') ||
      (owner === 'p2' && role === 'top');
    if (!isOnThisHalf) return;

    const r = Math.min(BAR_W * 0.40, POINT_H / 10);
    const cx = BAR_L + BAR_W / 2;
    const startY = owner === 'p1'
      ? SEAM_Y + r + 8
      : SEAM_Y - r - 8;
    const dy = owner === 'p1' ? 1 : -1;
    const visible = Math.min(count, 4);
    for (let i = 0; i < visible; i++) {
      drawChecker(ctx, cx, startY + dy * i * 2 * r, r, owner);
    }
    if (count > 4) {
      const cy = startY + dy * (visible - 1) * 2 * r;
      drawCountLabel(ctx, cx, cy, r, count, owner);
    }
  }

  function drawBornOffStack(ctx, owner, count, role) {
    if (count === 0) return;
    const isOnThisHalf = role === 'local' ||
      (owner === 'p1' && role === 'bottom') ||
      (owner === 'p2' && role === 'top');
    if (!isOnThisHalf) return;
    const rect = bearOffRect(owner);
    const cx = rect.x + rect.w / 2;
    const thick = Math.max(6, rect.h / 24);
    const baseY = owner === 'p1' ? rect.y + rect.h - thick - 4 : rect.y + thick + 4;
    const dy = owner === 'p1' ? -1 : 1;
    const visible = Math.min(count, 8);
    for (let i = 0; i < visible; i++) {
      drawPuck(ctx, cx, baseY + dy * i * thick, rect.w * 0.38, thick, owner);
    }
    const labelY = baseY + dy * (visible + 0.7) * thick;
    ctx.fillStyle = COLORS.labelLight;
    ctx.font = `bold ${Math.floor(rect.w * 0.28)}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${count}/15`, cx, labelY);
  }

  function drawPuck(ctx, cx, cy, r, h, owner) {
    ctx.fillStyle = owner === 'p1' ? COLORS.checkerP1 : COLORS.checkerP2;
    ctx.strokeStyle = owner === 'p1' ? COLORS.checkerP1Edge : COLORS.checkerP2Edge;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(cx - r, cy - h / 2, r * 2, h);
    ctx.fill();
    ctx.stroke();
  }

  function drawChecker(ctx, cx, cy, r, owner) {
    ctx.fillStyle = owner === 'p1' ? COLORS.checkerP1 : COLORS.checkerP2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = owner === 'p1' ? COLORS.checkerP1Edge : COLORS.checkerP2Edge;
    ctx.lineWidth = Math.max(1, r * 0.08);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.65, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawCountLabel(ctx, cx, cy, r, count, owner) {
    ctx.fillStyle = owner === 'p1' ? COLORS.label : COLORS.labelLight;
    ctx.font = `bold ${Math.floor(r * 1.1)}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(count), cx, cy);
  }

  function drawSourceHighlight(ctx, src) {
    ctx.save();
    ctx.strokeStyle = COLORS.highlight;
    ctx.fillStyle = COLORS.highlightSource;
    ctx.lineWidth = 3;
    if (src === 'bar') {
      ctx.fillRect(BAR_L, FRAME, BAR_W, WORLD_H - 2 * FRAME);
      ctx.strokeRect(BAR_L, FRAME, BAR_W, WORLD_H - 2 * FRAME);
    } else if (typeof src === 'number') {
      const a = pointAnchor(src);
      const halfW = POINT_W / 2;
      ctx.beginPath();
      ctx.moveTo(a.x - halfW, a.yBase);
      ctx.lineTo(a.x + halfW, a.yBase);
      ctx.lineTo(a.x, a.yTip);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawDestinationHighlight(ctx, dst) {
    ctx.save();
    ctx.strokeStyle = COLORS.highlight;
    ctx.fillStyle = COLORS.highlightDim;
    ctx.lineWidth = 2;
    if (dst === 'off-p1' || dst === 'off-p2') {
      const r = bearOffRect(dst === 'off-p1' ? 'p1' : 'p2');
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeRect(r.x, r.y, r.w, r.h);
    } else if (typeof dst === 'number') {
      const a = pointAnchor(dst);
      const halfW = POINT_W / 2;
      ctx.beginPath();
      ctx.moveTo(a.x - halfW, a.yBase);
      ctx.lineTo(a.x + halfW, a.yBase);
      ctx.lineTo(a.x, a.yTip);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  // Dice positions in world coords — inside the active player's home quadrant.
  // Up to 4 positions (doubles); we always compute 4 and only draw as many as
  // are in state.dice/diceRemaining.
  function dicePositions(state) {
    const player = state.turn;
    const quad = homeQuadrantRect(player);
    const count = state.dice[0] === state.dice[1] ? 4 : 2;
    const size = Math.min(quad.w / 7, quad.h / 3.5);
    const gap = size * 0.3;
    const totalW = count * size + (count - 1) * gap;
    const startX = quad.x + (quad.w - totalW) / 2;
    const y = quad.y + (quad.h - size) / 2;
    const positions = [];
    for (let i = 0; i < count; i++) {
      positions.push({
        x: startX + i * (size + gap),
        y,
        size,
        value: count === 4 ? state.dice[0] : state.dice[i],
      });
    }
    return positions;
  }

  function drawDice(ctx, state, role, selectedDieIdx) {
    const player = state.turn;
    const quadHalf = player === 'p1' ? 'bottom' : 'top';
    if (role !== 'local' && quadHalf !== role) return;
    const positions = dicePositions(state);
    // Track which positions are "used" — a die value that's not in
    // diceRemaining is used.
    const remaining = state.diceRemaining.slice();
    const isDoubles = state.dice[0] === state.dice[1];
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
      let used;
      if (isDoubles) {
        // Used count for this value is (4 - remaining.length).
        const usedCount = 4 - remaining.length;
        used = i < usedCount;
      } else {
        const idx = remaining.indexOf(p.value);
        if (idx === -1) { used = true; } else { used = false; remaining.splice(idx, 1); }
      }
      drawDie(ctx, p.x, p.y, p.size, p.value, used, i === selectedDieIdx);
    }
  }

  function drawDie(ctx, x, y, size, value, used, selected) {
    ctx.save();
    ctx.fillStyle = used ? COLORS.dieFaceUsed : COLORS.dieFace;
    ctx.strokeStyle = selected ? COLORS.highlight : COLORS.frame;
    ctx.lineWidth = selected ? 4 : 2;
    const r = size * 0.15;
    roundRect(ctx, x, y, size, size, r);
    ctx.fill();
    ctx.stroke();
    // Pips
    ctx.fillStyle = COLORS.diePip;
    const pipR = size * 0.08;
    const pad = size * 0.25;
    const cx = x + size / 2, cy = y + size / 2;
    const lx = x + pad, rx = x + size - pad;
    const ty = y + pad, by_ = y + size - pad;
    const midY = cy;
    const pips = {
      1: [[cx, cy]],
      2: [[lx, ty], [rx, by_]],
      3: [[lx, ty], [cx, cy], [rx, by_]],
      4: [[lx, ty], [rx, ty], [lx, by_], [rx, by_]],
      5: [[lx, ty], [rx, ty], [cx, cy], [lx, by_], [rx, by_]],
      6: [[lx, ty], [rx, ty], [lx, midY], [rx, midY], [lx, by_], [rx, by_]],
    }[value] || [];
    for (const [px, py] of pips) {
      ctx.beginPath();
      ctx.arc(px, py, pipR, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ---------- Hit testing ----------

  // Given a canvas tap, return a descriptor in WORLD terms:
  //   { kind:'point', idx }
  //   { kind:'bar' }
  //   { kind:'bearOff', player: 'p1'|'p2' }
  //   { kind:'die', index: 0..3 }       — based on the dice currently rolled
  //   { kind:'world', x, y }             — generic world point (for forwarding)
  //   null (outside viewport)
  function hitTest(cx, cy, canvasW, canvasH, role, state) {
    const vp = viewportFor(canvasW, canvasH, role);
    if (cx < vp.offX || cx > vp.offX + vp.drawW) return null;
    if (cy < vp.offY || cy > vp.offY + vp.drawH) return null;
    const w = canvasToWorld(vp, cx, cy);

    // In local (full-board) mode the world-y decides which half; just
    // delegate to the world-coords hit tester.
    if (role === 'local') {
      const h = hitTestWorld(w.x, w.y, state);
      return h || { kind: 'world', x: w.x, y: w.y };
    }

    // Remote roles render only one half; clamp to that half's y-range.
    const yMin = role === 'top' ? 0 : SEAM_Y;
    const yMax = role === 'top' ? SEAM_Y : WORLD_H;
    if (w.y < yMin || w.y > yMax) return { kind: 'world', x: w.x, y: w.y };

    // Dice?
    if (state && state.phase === 'move' && state.dice[0] != null) {
      const quadHalf = state.turn === 'p1' ? 'bottom' : 'top';
      if (quadHalf === role) {
        const positions = dicePositions(state);
        for (let i = 0; i < positions.length; i++) {
          const p = positions[i];
          if (w.x >= p.x && w.x <= p.x + p.size &&
              w.y >= p.y && w.y <= p.y + p.size) {
            return { kind: 'die', index: i };
          }
        }
      }
    }

    // Bear-off strip for the active player?
    if (state && state.phase === 'move' && state.turn &&
        window.BackgammonRules.canBearOff(state, state.turn)) {
      const stripHalf = state.turn === 'p1' ? 'bottom' : 'top';
      if (stripHalf === role) {
        const r = bearOffRect(state.turn);
        if (w.x >= r.x && w.x <= r.x + r.w &&
            w.y >= r.y && w.y <= r.y + r.h) {
          return { kind: 'bearOff', player: state.turn };
        }
      }
    }

    // Bar?
    if (w.x >= BAR_L && w.x < BAR_L + BAR_W) {
      return { kind: 'bar' };
    }

    // Points by column?
    for (let col = 0; col < 12; col++) {
      const cxw = colCenter(col);
      if (w.x >= cxw - POINT_W / 2 && w.x < cxw + POINT_W / 2) {
        // Which index lives at (this col, this half)?
        if (role === 'bottom') return { kind: 'point', idx: 11 - col };
        return { kind: 'point', idx: 12 + col };
      }
    }
    return { kind: 'world', x: w.x, y: w.y };
  }

  // Re-run hit-testing against a world-coord point (from a forwarded tap).
  // Used by the active phone to interpret taps that originated on the
  // passive phone.
  function hitTestWorld(wx, wy, state) {
    // Which half does the world coord fall in? Interpret against that half.
    const role = wy < SEAM_Y ? 'top' : 'bottom';

    if (state && state.phase === 'move' && state.dice[0] != null) {
      const quadHalf = state.turn === 'p1' ? 'bottom' : 'top';
      if (quadHalf === role) {
        const positions = dicePositions(state);
        for (let i = 0; i < positions.length; i++) {
          const p = positions[i];
          if (wx >= p.x && wx <= p.x + p.size &&
              wy >= p.y && wy <= p.y + p.size) {
            return { kind: 'die', index: i };
          }
        }
      }
    }
    if (state && state.phase === 'move' && state.turn &&
        window.BackgammonRules.canBearOff(state, state.turn)) {
      const stripHalf = state.turn === 'p1' ? 'bottom' : 'top';
      if (stripHalf === role) {
        const r = bearOffRect(state.turn);
        if (wx >= r.x && wx <= r.x + r.w && wy >= r.y && wy <= r.y + r.h) {
          return { kind: 'bearOff', player: state.turn };
        }
      }
    }
    if (wx >= BAR_L && wx < BAR_L + BAR_W) return { kind: 'bar' };
    for (let col = 0; col < 12; col++) {
      const cxw = colCenter(col);
      if (wx >= cxw - POINT_W / 2 && wx < cxw + POINT_W / 2) {
        if (role === 'bottom') return { kind: 'point', idx: 11 - col };
        return { kind: 'point', idx: 12 + col };
      }
    }
    return null;
  }

  // ---------- Misc ----------

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Size the canvas to fit its wrap. Since each phone shows a single half
  // (world ratio 1400:450 → roughly 3.1:1), a landscape phone in portrait
  // orientation will letterbox; landscape orientation fills better.
  function resizeCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const wrap = canvas.parentElement;
    const wrapRect = wrap.getBoundingClientRect();
    let cssW = wrapRect.width;
    let cssH = wrapRect.height;
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.max(1, Math.floor(cssW * dpr));
    canvas.height = Math.max(1, Math.floor(cssH * dpr));
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w: cssW, h: cssH };
  }

  window.BackgammonBoard = {
    renderBoard,
    hitTest,
    hitTestWorld,
    resizeCanvas,
    // Exposed for test harness:
    viewportFor,
    canvasToWorld,
    worldToCanvas,
    pointAnchor,
    dicePositions,
    bearOffRect,
    homeQuadrantRect,
    WORLD_W, WORLD_H, SEAM_Y,
  };
})();
