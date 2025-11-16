"use strict";
(() => {
  // src/ui/game-client.ts
  var TILE_TYPES = [
    "STRAIGHT_NS",
    "STRAIGHT_EW",
    "CORNER_NE",
    "CORNER_NW",
    "CORNER_SE",
    "CORNER_SW",
    "T_N",
    "T_E",
    "T_S",
    "T_W",
    "CROSS"
  ];
  var MockGameClient = class {
    constructor(width, height, seed) {
      this.rng = seed;
      const hazards = [];
      const centerX = Math.floor(width / 2);
      const centerY = Math.floor(height / 2);
      for (let i = 0; i < 12; i++) {
        let x, y;
        do {
          x = this.random() % width;
          y = this.random() % height;
        } while (x === centerX && y === centerY || Math.abs(x - centerX) < 2 && Math.abs(y - centerY) < 2 || hazards.some((h) => h.x === x && h.y === y));
        hazards.push({ x, y });
      }
      this.state = {
        turn: 0,
        phase: "PLACING_FORCED_CARD",
        tiles: [],
        hazards,
        forced_card: { tile_type: this.randomTileType() },
        optional_card: { tile_type: this.randomTileType() },
        board_width: width,
        board_height: height
      };
    }
    random() {
      this.rng = this.rng * 1103515245 + 12345 & 2147483647;
      return this.rng;
    }
    randomTileType() {
      return TILE_TYPES[this.random() % TILE_TYPES.length];
    }
    isHazard(x, y) {
      return this.state.hazards.some((h) => h.x === x && h.y === y);
    }
    isOccupied(x, y) {
      return this.state.tiles.some((t) => t.x === x && t.y === y);
    }
    hasAdjacentTile(x, y) {
      if (this.state.tiles.length === 0)
        return true;
      return this.isOccupied(x - 1, y) || this.isOccupied(x + 1, y) || this.isOccupied(x, y - 1) || this.isOccupied(x, y + 1);
    }
    getState() {
      return JSON.parse(JSON.stringify(this.state));
    }
    placeForcedCard(x, y) {
      if (x < 0 || x >= this.state.board_width || y < 0 || y >= this.state.board_height) {
        return {
          success: false,
          message: "Out of bounds",
          erosion_occurred: false,
          tiles_eroded: 0
        };
      }
      if (this.isOccupied(x, y)) {
        return {
          success: false,
          message: "Position occupied",
          erosion_occurred: false,
          tiles_eroded: 0
        };
      }
      if (this.isHazard(x, y)) {
        return {
          success: false,
          message: "Blocked by hazard",
          erosion_occurred: false,
          tiles_eroded: 0
        };
      }
      if (!this.hasAdjacentTile(x, y)) {
        if (this.state.tiles.length > 0) {
          this.state.tiles.pop();
          return {
            success: false,
            message: "No adjacent tile - path eroded",
            erosion_occurred: true,
            tiles_eroded: 1
          };
        }
        return {
          success: false,
          message: "Not adjacent to path",
          erosion_occurred: false,
          tiles_eroded: 0
        };
      }
      if (this.state.forced_card) {
        this.state.tiles.push({
          x,
          y,
          tile_type: this.state.forced_card.tile_type,
          turn_placed: this.state.turn
        });
      }
      this.state.phase = "PLACING_OPTIONAL_CARD";
      return {
        success: true,
        message: "Tile placed",
        erosion_occurred: false,
        tiles_eroded: 0
      };
    }
    placeOptionalCard(x, y) {
      if (x < 0 || x >= this.state.board_width || y < 0 || y >= this.state.board_height) {
        return {
          success: false,
          message: "Out of bounds",
          erosion_occurred: false,
          tiles_eroded: 0
        };
      }
      if (this.isOccupied(x, y)) {
        return {
          success: false,
          message: "Position occupied",
          erosion_occurred: false,
          tiles_eroded: 0
        };
      }
      if (this.isHazard(x, y)) {
        return {
          success: false,
          message: "Blocked by hazard",
          erosion_occurred: false,
          tiles_eroded: 0
        };
      }
      if (!this.hasAdjacentTile(x, y)) {
        return {
          success: false,
          message: "Not adjacent to path",
          erosion_occurred: false,
          tiles_eroded: 0
        };
      }
      if (this.state.optional_card) {
        this.state.tiles.push({
          x,
          y,
          tile_type: this.state.optional_card.tile_type,
          turn_placed: this.state.turn
        });
      }
      this.startNewTurn();
      return {
        success: true,
        message: "Tile placed",
        erosion_occurred: false,
        tiles_eroded: 0
      };
    }
    skipOptionalCard() {
      this.startNewTurn();
    }
    startNewTurn() {
      this.state.turn++;
      this.state.phase = "PLACING_FORCED_CARD";
      this.state.forced_card = { tile_type: this.randomTileType() };
      this.state.optional_card = { tile_type: this.randomTileType() };
    }
    isWon() {
      return false;
    }
  };

  // src/ui/main.ts
  var GameUI = class {
    constructor() {
      this.tileSize = 40;
      this.offsetX = 0;
      this.offsetY = 0;
      this.canvas = document.getElementById("gameCanvas");
      this.ctx = this.canvas.getContext("2d");
      this.initGame();
      this.setupEventListeners();
    }
    initGame() {
      this.game = new MockGameClient(20, 20, Date.now());
      console.log("Game initialized with mock client");
      this.render();
    }
    setupEventListeners() {
      this.canvas.addEventListener("click", (e) => this.onCanvasClick(e));
      const skipButton = document.getElementById("skipButton");
      if (skipButton) {
        skipButton.addEventListener("click", () => this.skipOptionalCard());
      }
    }
    onCanvasClick(event) {
      if (!this.game)
        return;
      const rect = this.canvas.getBoundingClientRect();
      const canvasX = event.clientX - rect.left;
      const canvasY = event.clientY - rect.top;
      const gridX = Math.floor((canvasX - this.offsetX) / this.tileSize);
      const gridY = Math.floor((canvasY - this.offsetY) / this.tileSize);
      this.placeTile(gridX, gridY);
    }
    placeTile(x, y) {
      if (!this.game)
        return;
      try {
        const state = this.game.getState();
        const phase = state.phase;
        let result;
        if (phase === "PLACING_FORCED_CARD") {
          result = this.game.placeForcedCard(x, y);
        } else if (phase === "PLACING_OPTIONAL_CARD") {
          result = this.game.placeOptionalCard(x, y);
        } else {
          return;
        }
        console.log("Placement result:", result);
        this.render();
      } catch (e) {
        console.error("Error placing tile:", e);
      }
    }
    skipOptionalCard() {
      if (!this.game)
        return;
      try {
        this.game.skipOptionalCard();
        console.log("Skipped optional card");
        this.render();
      } catch (e) {
        console.error("Error skipping card:", e);
      }
    }
    render() {
      if (!this.game)
        return;
      try {
        const state = this.game.getState();
        this.renderGame(state);
        this.updateUI(state);
      } catch (e) {
        console.error("Error rendering game:", e);
      }
    }
    renderGame(state) {
      this.ctx.fillStyle = "#ecf0f1";
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.drawGrid(state);
      this.drawTiles(state);
      this.drawHazards(state);
      console.log(`Rendering: ${state.tiles.length} tiles, ${state.hazards.length} hazards`);
    }
    drawGrid(state) {
      this.ctx.strokeStyle = "#bdc3c7";
      this.ctx.lineWidth = 0.5;
      const startX = Math.floor(-this.offsetX / this.tileSize);
      const startY = Math.floor(-this.offsetY / this.tileSize);
      const endX = startX + Math.ceil(this.canvas.width / this.tileSize) + 1;
      const endY = startY + Math.ceil(this.canvas.height / this.tileSize) + 1;
      for (let x = startX; x < endX; x++) {
        const screenX = x * this.tileSize + this.offsetX;
        this.ctx.beginPath();
        this.ctx.moveTo(screenX, 0);
        this.ctx.lineTo(screenX, this.canvas.height);
        this.ctx.stroke();
      }
      for (let y = startY; y < endY; y++) {
        const screenY = y * this.tileSize + this.offsetY;
        this.ctx.beginPath();
        this.ctx.moveTo(0, screenY);
        this.ctx.lineTo(this.canvas.width, screenY);
        this.ctx.stroke();
      }
    }
    drawHazards(state) {
      this.ctx.fillStyle = "#e74c3c";
      for (const hazard of state.hazards) {
        const screenX = hazard.x * this.tileSize + this.offsetX;
        const screenY = hazard.y * this.tileSize + this.offsetY;
        this.ctx.fillRect(screenX + 2, screenY + 2, this.tileSize - 4, this.tileSize - 4);
        this.ctx.fillStyle = "#ffffff";
        this.ctx.font = "bold 20px Arial";
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "middle";
        this.ctx.fillText("\u2716", screenX + this.tileSize / 2, screenY + this.tileSize / 2);
        this.ctx.fillStyle = "#e74c3c";
      }
    }
    drawTiles(state) {
      const tileColors = {
        START: "#27ae60",
        STRAIGHT_NS: "#3498db",
        STRAIGHT_EW: "#3498db",
        CORNER_NE: "#9b59b6",
        CORNER_NW: "#9b59b6",
        CORNER_SE: "#9b59b6",
        CORNER_SW: "#9b59b6",
        T_N: "#f39c12",
        T_E: "#f39c12",
        T_S: "#f39c12",
        T_W: "#f39c12",
        CROSS: "#e67e22",
        END: "#c0392b"
      };
      for (const tile of state.tiles) {
        const screenX = tile.x * this.tileSize + this.offsetX;
        const screenY = tile.y * this.tileSize + this.offsetY;
        const color = tileColors[tile.tile_type] || "#95a5a6";
        console.log(`Drawing tile ${tile.tile_type} at grid (${tile.x}, ${tile.y}) -> screen (${screenX}, ${screenY}), color=${color}`);
        this.ctx.fillStyle = color;
        this.ctx.fillRect(screenX, screenY, this.tileSize, this.tileSize);
        this.ctx.strokeStyle = "#2c3e50";
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(screenX, screenY, this.tileSize, this.tileSize);
        this.ctx.fillStyle = "#ffffff";
        this.ctx.font = "bold 12px Arial";
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "middle";
        const labelText = tile.tile_type.replace(/_/g, "\n").slice(0, 6);
        this.ctx.fillText(labelText.split("\n")[0], screenX + this.tileSize / 2, screenY + this.tileSize / 2 - 5);
        if (labelText.includes("\n")) {
          this.ctx.fillText(labelText.split("\n")[1] || "", screenX + this.tileSize / 2, screenY + this.tileSize / 2 + 5);
        }
      }
    }
    updateUI(state) {
      const turnInfo = document.getElementById("turnInfo");
      const scoreDiv = document.getElementById("score");
      const forcedCardDiv = document.getElementById("forcedCard");
      const optionalCardDiv = document.getElementById("optionalCard");
      const skipButton = document.getElementById("skipButton");
      if (turnInfo) {
        turnInfo.textContent = `Turn: ${state.turn}`;
      }
      if (scoreDiv) {
        const score = state.tiles.length * 10;
        scoreDiv.textContent = `Score: ${score}`;
      }
      if (forcedCardDiv && state.forced_card) {
        forcedCardDiv.textContent = `Forced: ${state.forced_card.tile_type}`;
      }
      if (optionalCardDiv && state.optional_card) {
        optionalCardDiv.textContent = `Optional: ${state.optional_card.tile_type}`;
      }
      if (skipButton) {
        skipButton.disabled = state.phase !== "PLACING_OPTIONAL_CARD";
      }
    }
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      new GameUI();
    });
  } else {
    new GameUI();
  }
})();
