// Canvas board rendering + hit-testing — v2 split-board layout.
//
// REQ-BG-014: the two phones together form ONE board in a single fixed
// orientation (no per-player perspective flip). Each device renders a fixed
// half: host = LEFT 12 points, guest = RIGHT 12 points. Local hotseat
// renders the full board ('both') for solo playtesting.
// REQ-BG-015: hitTest converts a tap into a board index or 'bar'/'off';
// moves are committed via tap-source-then-tap-die (see main.js).
//
// Canonical orientation (same as v1's p1 view, now shared by both):
//   top row L→R:    12 13 14 15 16 17 | (bar) | 18 19 20 21 22 23
//   bottom row L→R: 11 10  9  8  7  6 | (bar) |  5  4  3  2  1  0
//
// Panel segment order (left→right):
//   'left'  : [P1 tray] [6 cols] [bar strip]
//   'right' : [bar strip] [6 cols] [P2 tray]
//   'both'  : [P1 tray] [6 cols] [bar] [6 cols] [P2 tray]
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
    label: '#3a2a1a',
    labelLight: '#f3e8d4',
    trayBg: '#2a1b0f',
  };

  // ---------- Index <-> slot mapping ----------

  // Returns { row:'top'|'bottom', col } for an index on this panel, or null
  // if the index does not belong to this side.
  function slotForIndex(idx, side) {
    if (side === 'left') {
      if (idx >= 12 && idx <= 17) return { row: 'top', col: idx - 12 };
      if (idx >= 6 && idx <= 11) return { row: 'bottom', col: 11 - idx };
      return null;
    }
    if (side === 'right') {
      if (idx >= 18 && idx <= 23) return { row: 'top', col: idx - 18 };
      if (idx >= 0 && idx <= 5) return { row: 'bottom', col: 5 - idx };
      return null;
    }
    // both
    if (idx >= 12 && idx <= 17) return { row: 'top', col: idx - 12 };
    if (idx >= 6 && idx <= 11) return { row: 'bottom', col: 11 - idx };
    if (idx >= 18 && idx <= 23) return { row: 'top', col: 6 + (idx - 18) };
    if (idx >= 0 && idx <= 5) return { row: 'bottom', col: 6 + (5 - idx) };
    return null;
  }

  function indexForSlot(side, row, col) {
    if (side === 'left') {
      return row === 'top' ? 12 + col : 11 - col;
    }
    if (side === 'right') {
      return row === 'top' ? 18 + col : 5 - col;
    }
    // both
    if (col < 6) return row === 'top' ? 12 + col : 11 - col;
    const c = col - 6;
    return row === 'top' ? 18 + c : 5 - c;
  }

  // Global column 0..11 across the full board, for a continuous point-color
  // pattern that doesn't break at the seam between the two phones.
  function globalCol(side, col) {
    if (side === 'right') return 6 + col;
    return col; // 'left' (0..5) or 'both' (0..11)
  }

  function pointColor(gCol, row) {
    const isLight = (gCol + (row === 'top' ? 1 : 0)) % 2 === 0;
    return isLight ? COLORS.pointLight : COLORS.pointDark;
  }

  // ---------- Layout ----------

  function computeLayout(canvasW, canvasH, side) {
    const padX = 6;
    const padY = 6;
    const boardW = canvasW - 2 * padX;
    const boardH = canvasH - 2 * padY;
    const originX = (canvasW - boardW) / 2;
    const originY = (canvasH - boardH) / 2;

    const frame = Math.max(6, Math.min(boardW, boardH) * 0.025);
    const innerW = boardW - 2 * frame;
    const innerH = boardH - 2 * frame;

    const nCols = side === 'both' ? 12 : 6;
    const nTrays = side === 'both' ? 2 : 1;
    const barW = innerW * (side === 'both' ? 0.05 : 0.07);
    const trayW = innerW * (side === 'both' ? 0.06 : 0.11);
    const pointW = (innerW - barW - nTrays * trayW) / nCols;
    const pointH = innerH * 0.44;

    const left = originX + frame;
    const top = originY + frame;

    const cols = [];
    let barX, trayLeftX, trayRightX;

    if (side === 'left') {
      // [P1 tray][6 cols][bar]
      trayLeftX = left;
      const ps = left + trayW;
      for (let c = 0; c < 6; c++) cols.push(ps + pointW * (c + 0.5));
      barX = ps + pointW * 6;
    } else if (side === 'right') {
      // [bar][6 cols][P2 tray]
      barX = left;
      const ps = left + barW;
      for (let c = 0; c < 6; c++) cols.push(ps + pointW * (c + 0.5));
      trayRightX = ps + pointW * 6;
    } else {
      // both: [P1 tray][6 cols][bar][6 cols][P2 tray]
      trayLeftX = left;
      const ps1 = left + trayW;
      for (let c = 0; c < 6; c++) cols.push(ps1 + pointW * (c + 0.5));
      barX = ps1 + pointW * 6;
      const ps2 = barX + barW;
      for (let c = 0; c < 6; c++) cols.push(ps2 + pointW * (c + 0.5));
      trayRightX = ps2 + pointW * 6;
    }

    return {
      side, canvasW, canvasH, originX, originY, boardW, boardH,
      padX, padY, frame, left, top, innerW, innerH,
      barX, barW, trayLeftX, trayRightX, trayW,
      pointW, pointH, cols,
      barCenterX: barX + barW / 2,
    };
  }

  function pointAnchor(layout, row, col) {
    const x = layout.cols[col];
    const y = row === 'top' ? layout.top : layout.top + layout.innerH;
    const tipY = row === 'top' ? y + layout.pointH : y - layout.pointH;
    return { x, y, tipY, row };
  }

  // Which player's bar/tray each panel surfaces.
  function barPlayerFor(side) {
    if (side === 'left') return 'p1';
    if (side === 'right') return 'p2';
    return 'both';
  }

  // ---------- Rendering ----------

  function renderBoard(ctx, state, side, ui) {
    const canvas = ctx.canvas;
    const w = canvas.clientWidth || canvas.width;
    const h = canvas.clientHeight || canvas.height;
    const layout = computeLayout(w, h, side);
    const selection = ui && ui.selection ? ui.selection : null;

    ctx.clearRect(0, 0, w, h);

    // Frame
    ctx.fillStyle = COLORS.frame;
    roundRect(ctx, layout.originX, layout.originY, layout.boardW, layout.boardH, 8);
    ctx.fill();

    // Felt
    ctx.fillStyle = COLORS.felt;
    ctx.fillRect(layout.left, layout.top, layout.innerW, layout.innerH);

    // Points
    const nCols = side === 'both' ? 12 : 6;
    for (let col = 0; col < nCols; col++) {
      drawPoint(ctx, layout, side, 'top', col);
      drawPoint(ctx, layout, side, 'bottom', col);
    }

    // Bar strip
    ctx.fillStyle = COLORS.bar;
    ctx.fillRect(layout.barX, layout.top, layout.barW, layout.innerH);
    ctx.strokeStyle = COLORS.barEdge;
    ctx.lineWidth = 1;
    ctx.strokeRect(layout.barX + 0.5, layout.top + 0.5, layout.barW - 1, layout.innerH - 1);

    // Trays
    if (layout.trayLeftX !== undefined) {
      ctx.fillStyle = COLORS.trayBg;
      ctx.fillRect(layout.trayLeftX, layout.top, layout.trayW, layout.innerH);
      ctx.strokeRect(layout.trayLeftX + 0.5, layout.top + 0.5, layout.trayW - 1, layout.innerH - 1);
    }
    if (layout.trayRightX !== undefined) {
      ctx.fillStyle = COLORS.trayBg;
      ctx.fillRect(layout.trayRightX, layout.top, layout.trayW, layout.innerH);
      ctx.strokeRect(layout.trayRightX + 0.5, layout.top + 0.5, layout.trayW - 1, layout.innerH - 1);
    }

    // Highlights (selected source + reachable destinations on this panel,
    // each labelled with the die that gets you there).
    if (selection && selection.source !== undefined && selection.source !== null) {
      highlightSource(ctx, layout, side, selection.source);
      const moves = window.BackgammonRules.legalMovesFrom(state, selection.source);
      for (const m of moves) drawDestinationHint(ctx, layout, side, state.turn, m);
    }

    // Checkers on points
    for (let i = 0; i < 24; i++) {
      const n = Math.abs(state.board[i]);
      if (n === 0) continue;
      const slot = slotForIndex(i, side);
      if (!slot) continue;
      drawCheckerStack(ctx, layout, slot, state.board[i] > 0 ? 'p1' : 'p2', n);
    }

    // Bar checkers (this panel's player only; 'both' shows both)
    const bp = barPlayerFor(side);
    if (bp === 'both') {
      drawBarStack(ctx, layout, 'p1', state.bar.p1, +1);
      drawBarStack(ctx, layout, 'p2', state.bar.p2, -1);
    } else {
      drawBarStack(ctx, layout, bp, state.bar[bp], +1);
    }

    // Trays: P1 tray on left, P2 tray on right
    if (layout.trayLeftX !== undefined) {
      drawTray(ctx, layout, layout.trayLeftX, 'p1', state.borneOff.p1);
    }
    if (layout.trayRightX !== undefined) {
      drawTray(ctx, layout, layout.trayRightX, 'p2', state.borneOff.p2);
    }
  }

  function drawPoint(ctx, layout, side, row, col) {
    const a = pointAnchor(layout, row, col);
    const halfW = layout.pointW / 2;
    ctx.fillStyle = pointColor(globalCol(side, col), row);
    ctx.beginPath();
    ctx.moveTo(a.x - halfW, a.y);
    ctx.lineTo(a.x + halfW, a.y);
    ctx.lineTo(a.x, a.tipY);
    ctx.closePath();
    ctx.fill();
  }

  function drawCheckerStack(ctx, layout, slot, owner, count) {
    const anchor = pointAnchor(layout, slot.row, slot.col);
    const r = Math.min(layout.pointW * 0.42, layout.pointH / 10);
    const dy = slot.row === 'top' ? 1 : -1;
    const visible = Math.min(count, 5);
    for (let i = 0; i < visible; i++) {
      drawChecker(ctx, anchor.x, anchor.y + dy * (r + i * 2 * r), r, owner);
    }
    if (count > 5) {
      drawCountLabel(ctx, anchor.x, anchor.y + dy * (r + (visible - 1) * 2 * r), r, count, owner);
    }
  }

  // dir: +1 stacks downward from a point above center, -1 upward from below.
  function drawBarStack(ctx, layout, owner, count, dir) {
    if (count === 0) return;
    const r = Math.min(layout.barW * 0.40, layout.pointH / 10);
    const cx = layout.barCenterX;
    const centerY = layout.top + layout.innerH / 2;
    const baseY = centerY + dir * r * 2;
    const visible = Math.min(count, 4);
    for (let i = 0; i < visible; i++) {
      drawChecker(ctx, cx, baseY + dir * i * 2 * r, r, owner);
    }
    if (count > 4) {
      drawCountLabel(ctx, cx, baseY + dir * (visible - 1) * 2 * r, r, count, owner);
    }
  }

  function drawTray(ctx, layout, trayX, owner, count) {
    if (count === 0) return;
    const r = layout.trayW * 0.38;
    const cx = trayX + layout.trayW / 2;
    const thickness = Math.max(4, r * 0.35);
    const visible = Math.min(count, 12);
    const baseY = layout.top + layout.innerH - r - 2;
    for (let i = 0; i < visible; i++) {
      drawPuck(ctx, cx, baseY - i * thickness, r, thickness, owner);
    }
    ctx.fillStyle = COLORS.labelLight;
    ctx.font = `bold ${Math.floor(r)}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${count}/15`, cx, layout.top + r);
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

  function highlightSource(ctx, layout, side, from) {
    ctx.save();
    ctx.strokeStyle = COLORS.highlight;
    ctx.lineWidth = 3;
    if (from === 'bar') {
      ctx.strokeRect(layout.barX, layout.top, layout.barW, layout.innerH);
    } else if (typeof from === 'number') {
      const slot = slotForIndex(from, side);
      if (slot) {
        const a = pointAnchor(layout, slot.row, slot.col);
        ctx.beginPath();
        ctx.moveTo(a.x - layout.pointW / 2, a.y);
        ctx.lineTo(a.x + layout.pointW / 2, a.y);
        ctx.lineTo(a.x, a.tipY);
        ctx.closePath();
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // Draws a faint destination marker + the die number that lands there,
  // but only if that destination falls on this panel.
  function drawDestinationHint(ctx, layout, side, turn, move) {
    ctx.save();
    if (move.to === 'off') {
      const trayX = turn === 'p1' ? layout.trayLeftX : layout.trayRightX;
      if (trayX === undefined) { ctx.restore(); return; }
      ctx.fillStyle = COLORS.highlightDim;
      ctx.fillRect(trayX, layout.top, layout.trayW, layout.innerH);
      ctx.strokeStyle = COLORS.highlight;
      ctx.lineWidth = 2;
      ctx.strokeRect(trayX, layout.top, layout.trayW, layout.innerH);
      drawDieBadge(ctx, trayX + layout.trayW / 2, layout.top + layout.innerH / 2, move.die);
      ctx.restore();
      return;
    }
    const slot = slotForIndex(move.to, side);
    if (!slot) { ctx.restore(); return; }
    const a = pointAnchor(layout, slot.row, slot.col);
    ctx.fillStyle = COLORS.highlightDim;
    ctx.beginPath();
    ctx.moveTo(a.x - layout.pointW / 2, a.y);
    ctx.lineTo(a.x + layout.pointW / 2, a.y);
    ctx.lineTo(a.x, a.tipY);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = COLORS.highlight;
    ctx.lineWidth = 2;
    ctx.stroke();
    drawDieBadge(ctx, a.x, (a.y + a.tipY) / 2, move.die);
    ctx.restore();
  }

  function drawDieBadge(ctx, cx, cy, die) {
    const s = 16;
    ctx.fillStyle = COLORS.highlight;
    ctx.fillRect(cx - s / 2, cy - s / 2, s, s);
    ctx.fillStyle = COLORS.frame;
    ctx.font = `bold ${s - 4}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(die), cx, cy + 1);
  }

  // ---------- Hit-testing ----------

  // Returns a board index 0..23, 'bar', 'off', or null.
  function hitTest(x, y, canvasW, canvasH, side) {
    const layout = computeLayout(canvasW, canvasH, side);
    if (y < layout.top || y > layout.top + layout.innerH) return null;
    if (x >= layout.barX && x < layout.barX + layout.barW) return 'bar';
    if (layout.trayLeftX !== undefined &&
        x >= layout.trayLeftX && x < layout.trayLeftX + layout.trayW) return 'off';
    if (layout.trayRightX !== undefined &&
        x >= layout.trayRightX && x < layout.trayRightX + layout.trayW) return 'off';
    const nCols = side === 'both' ? 12 : 6;
    for (let col = 0; col < nCols; col++) {
      const cx = layout.cols[col];
      if (x >= cx - layout.pointW / 2 && x < cx + layout.pointW / 2) {
        const row = y < layout.top + layout.innerH / 2 ? 'top' : 'bottom';
        return indexForSlot(side, row, col);
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

  // Size the canvas to its wrap. A single half is rendered on a phone held
  // in landscape (wide); the full board ('both') keeps the v1 aspect logic.
  function resizeCanvas(canvas, side) {
    const dpr = window.devicePixelRatio || 1;
    const wrap = canvas.parentElement;
    const wrapRect = wrap.getBoundingClientRect();
    let targetAspect;
    if (side === 'both') {
      targetAspect = wrapRect.height > wrapRect.width ? 1.25 : 1.6;
    } else {
      // Half board on a landscape phone.
      targetAspect = 1.5;
    }
    let cssW = wrapRect.width;
    let cssH = cssW / targetAspect;
    if (cssH > wrapRect.height) {
      cssH = wrapRect.height;
      cssW = cssH * targetAspect;
    }
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
    resizeCanvas,
    slotForIndex,
  };
})();
