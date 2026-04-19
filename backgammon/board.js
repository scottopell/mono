// Canvas board rendering + hit-testing.
//
// REQ-BG-003: perspective flip is a render-time transform. Board state
// indices are shared; only the slot-to-index mapping differs per player.
// REQ-BG-005: hitTest converts (x,y) taps into board indices / 'bar' / 'off'.
(() => {
  'use strict';

  // Color palette — kept in sync with style.css variables.
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

  // ---------- Layout ----------

  function computeLayout(canvasW, canvasH) {
    // Reserve some padding inside the canvas
    const padX = 6;
    const padY = 6;

    // Canvas is already sized to roughly the right aspect (resizeCanvas);
    // use nearly all of it, leaving only the small padding.
    let boardW = canvasW - 2 * padX;
    let boardH = canvasH - 2 * padY;
    const originX = (canvasW - boardW) / 2;
    const originY = (canvasH - boardH) / 2;

    const frame = Math.max(6, Math.min(boardW, boardH) * 0.025);
    const barW = boardW * 0.07;
    const trayW = boardW * 0.08;
    const innerW = boardW - 2 * frame;
    const innerH = boardH - 2 * frame;
    const pointW = (innerW - barW - trayW) / 12;
    const pointH = innerH * 0.44;

    const left = originX + frame;
    const top = originY + frame;

    const cols = [];
    // Left 6 columns
    for (let i = 0; i < 6; i++) cols.push(left + pointW * (i + 0.5));
    // Bar after col 5
    const barX = left + pointW * 6;
    // Right 6 columns
    for (let i = 0; i < 6; i++) cols.push(left + pointW * 6 + barW + pointW * (i + 0.5));
    const trayX = left + pointW * 12 + barW;

    return {
      canvasW, canvasH,
      originX, originY,
      boardW, boardH,
      padX, padY, frame,
      left, top, innerW, innerH,
      barX, barW, trayX, trayW,
      pointW, pointH, cols,
      barCenterX: barX + barW / 2,
      trayCenterX: trayX + trayW / 2,
    };
  }

  function slotForIndex(idx, perspective) {
    if (perspective === 'p1') {
      return idx >= 12
        ? { row: 'top', col: idx - 12 }
        : { row: 'bottom', col: 11 - idx };
    }
    return idx >= 12
      ? { row: 'bottom', col: 23 - idx }
      : { row: 'top', col: idx };
  }

  function indexForSlot(row, col, perspective) {
    if (perspective === 'p1') {
      return row === 'top' ? 12 + col : 11 - col;
    }
    return row === 'top' ? col : 23 - col;
  }

  function pointColor(col, row) {
    const isLight = (col + (row === 'top' ? 1 : 0)) % 2 === 0;
    return isLight ? COLORS.pointLight : COLORS.pointDark;
  }

  // Anchor = base of the triangle (checker stack grows from here).
  function pointAnchor(layout, row, col) {
    const x = layout.cols[col];
    const y = row === 'top' ? layout.top : layout.top + layout.innerH;
    const tipY = row === 'top' ? y + layout.pointH : y - layout.pointH;
    return { x, y, tipY, row };
  }

  // ---------- Rendering ----------

  function renderBoard(ctx, state, perspective, uiState) {
    const canvas = ctx.canvas;
    const w = canvas.clientWidth || canvas.width;
    const h = canvas.clientHeight || canvas.height;
    const layout = computeLayout(w, h);

    // Full-canvas clear
    ctx.clearRect(0, 0, w, h);

    // Frame
    ctx.fillStyle = COLORS.frame;
    roundRect(ctx, layout.originX, layout.originY, layout.boardW, layout.boardH, 8);
    ctx.fill();

    // Felt
    ctx.fillStyle = COLORS.felt;
    ctx.fillRect(layout.left, layout.top, layout.innerW, layout.innerH);

    // Points
    for (let col = 0; col < 12; col++) {
      drawPoint(ctx, layout, 'top', col);
      drawPoint(ctx, layout, 'bottom', col);
    }

    // Bar
    ctx.fillStyle = COLORS.bar;
    ctx.fillRect(layout.barX, layout.top, layout.barW, layout.innerH);
    ctx.strokeStyle = COLORS.barEdge;
    ctx.lineWidth = 1;
    ctx.strokeRect(layout.barX + 0.5, layout.top + 0.5, layout.barW - 1, layout.innerH - 1);

    // Tray
    ctx.fillStyle = COLORS.trayBg;
    ctx.fillRect(layout.trayX, layout.top, layout.trayW, layout.innerH);
    ctx.strokeRect(layout.trayX + 0.5, layout.top + 0.5, layout.trayW - 1, layout.innerH - 1);

    // Selection + legal-destination highlights
    const selected = uiState && uiState.selected;
    let legalTargets = new Set();
    if (selected !== undefined && selected !== null) {
      const moves = window.BackgammonRules.legalMovesFrom(state, selected);
      for (const m of moves) legalTargets.add(m.to);
      highlightSource(ctx, layout, perspective, selected);
    }
    for (const t of legalTargets) highlightDestination(ctx, layout, perspective, t);

    // Checkers on points
    for (let i = 0; i < 24; i++) {
      const count = Math.abs(state.board[i]);
      if (count === 0) continue;
      const owner = state.board[i] > 0 ? 'p1' : 'p2';
      drawCheckerStack(ctx, layout, i, perspective, owner, count);
    }

    // Bar checkers
    drawBarStack(ctx, layout, perspective, 'p1', state.bar.p1);
    drawBarStack(ctx, layout, perspective, 'p2', state.bar.p2);

    // Borne-off tray
    drawTray(ctx, layout, perspective, state.borneOff);
  }

  function drawPoint(ctx, layout, row, col) {
    const a = pointAnchor(layout, row, col);
    const halfW = layout.pointW / 2;
    ctx.fillStyle = pointColor(col, row);
    ctx.beginPath();
    ctx.moveTo(a.x - halfW, a.y);
    ctx.lineTo(a.x + halfW, a.y);
    ctx.lineTo(a.x, a.tipY);
    ctx.closePath();
    ctx.fill();
  }

  function drawCheckerStack(ctx, layout, idx, perspective, owner, count) {
    const slot = slotForIndex(idx, perspective);
    const anchor = pointAnchor(layout, slot.row, slot.col);
    const r = Math.min(layout.pointW * 0.42, layout.pointH / 10);
    const dy = slot.row === 'top' ? 1 : -1;

    const visible = Math.min(count, 5);
    for (let i = 0; i < visible; i++) {
      const cy = anchor.y + dy * (r + i * 2 * r);
      drawChecker(ctx, anchor.x, cy, r, owner);
    }
    if (count > 5) {
      const cy = anchor.y + dy * (r + (visible - 1) * 2 * r);
      drawCountLabel(ctx, anchor.x, cy, r, count, owner);
    }
  }

  function drawBarStack(ctx, layout, perspective, owner, count) {
    if (count === 0) return;
    // Bar always shows the current-perspective player on bottom half and
    // opponent on top half, so each player sees their own bar checkers
    // near their side.
    const isSelf = owner === perspective;
    const r = Math.min(layout.barW * 0.40, layout.pointH / 10);
    const cx = layout.barCenterX;
    const centerY = layout.top + layout.innerH / 2;
    const baseY = isSelf ? centerY + r * 2 : centerY - r * 2;
    const dy = isSelf ? 1 : -1;
    const visible = Math.min(count, 4);
    for (let i = 0; i < visible; i++) {
      drawChecker(ctx, cx, baseY + dy * i * 2 * r, r, owner);
    }
    if (count > 4) {
      const cy = baseY + dy * (visible - 1) * 2 * r;
      drawCountLabel(ctx, cx, cy, r, count, owner);
    }
  }

  function drawTray(ctx, layout, perspective, borneOff) {
    const selfKey = perspective;
    const oppKey = perspective === 'p1' ? 'p2' : 'p1';
    const r = layout.trayW * 0.38;
    const cx = layout.trayCenterX;

    // Self (bottom half): stack from bottom up
    drawTrayStack(ctx, cx, layout.top + layout.innerH - r - 2, r, borneOff[selfKey], selfKey, -1);
    // Opponent (top half)
    drawTrayStack(ctx, cx, layout.top + r + 2, r, borneOff[oppKey], oppKey, 1);
  }

  function drawTrayStack(ctx, cx, baseY, r, count, owner, dy) {
    if (count === 0) return;
    const thickness = Math.max(4, r * 0.35);
    const visible = Math.min(count, 8);
    for (let i = 0; i < visible; i++) {
      const y = baseY + dy * i * thickness;
      drawPuck(ctx, cx, y, r, thickness, owner);
    }
    if (count > 0) {
      const y = baseY + dy * (visible + 0.5) * thickness;
      ctx.fillStyle = COLORS.labelLight;
      ctx.font = `bold ${Math.floor(r)}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${count}/15`, cx, y);
    }
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
    // Inner ring for a tactile look
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

  function highlightSource(ctx, layout, perspective, from) {
    ctx.save();
    ctx.strokeStyle = COLORS.highlight;
    ctx.lineWidth = 3;
    if (from === 'bar') {
      ctx.strokeRect(layout.barX, layout.top, layout.barW, layout.innerH);
    } else if (typeof from === 'number') {
      const slot = slotForIndex(from, perspective);
      const a = pointAnchor(layout, slot.row, slot.col);
      ctx.beginPath();
      ctx.moveTo(a.x - layout.pointW / 2, a.y);
      ctx.lineTo(a.x + layout.pointW / 2, a.y);
      ctx.lineTo(a.x, a.tipY);
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  }

  function highlightDestination(ctx, layout, perspective, to) {
    ctx.save();
    if (to === 'off') {
      ctx.fillStyle = COLORS.highlightDim;
      ctx.fillRect(layout.trayX, layout.top, layout.trayW, layout.innerH);
      ctx.strokeStyle = COLORS.highlight;
      ctx.lineWidth = 2;
      ctx.strokeRect(layout.trayX, layout.top, layout.trayW, layout.innerH);
    } else if (typeof to === 'number') {
      const slot = slotForIndex(to, perspective);
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
    }
    ctx.restore();
  }

  // ---------- Hit-testing ----------

  function hitTest(x, y, canvasW, canvasH, perspective) {
    const layout = computeLayout(canvasW, canvasH);
    if (y < layout.top || y > layout.top + layout.innerH) return null;
    if (x < layout.left) return null;

    if (x >= layout.barX && x < layout.barX + layout.barW) return 'bar';
    if (x >= layout.trayX && x < layout.trayX + layout.trayW) return 'off';

    for (let col = 0; col < 12; col++) {
      const cx = layout.cols[col];
      if (x >= cx - layout.pointW / 2 && x < cx + layout.pointW / 2) {
        const row = y < layout.top + layout.innerH / 2 ? 'top' : 'bottom';
        return indexForSlot(row, col, perspective);
      }
    }
    return null;
  }

  // ---------- Misc ----------

  // Builds the path for a rounded rectangle. Caller decides fill/stroke.
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Size the canvas to fit its wrap while maintaining a 3:2 aspect ratio.
  // Sets both CSS size and buffer size (DPR-scaled).
  function resizeCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const wrap = canvas.parentElement;
    const wrapRect = wrap.getBoundingClientRect();
    // Narrower aspect on tall portrait viewports so the board fills more of
    // the available space; wider aspect on landscape/desktop for the
    // traditional look.
    const isPortrait = wrapRect.height > wrapRect.width;
    const targetAspect = isPortrait ? 1.25 : 1.6;
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
  };
})();
