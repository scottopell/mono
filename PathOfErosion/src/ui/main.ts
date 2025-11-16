// Main TypeScript entry point for the web UI
import { MockGameClient, GameState, TileData, HazardData, CardData, PlacementResult } from './game-client';

// WASM Game wrapper (will be imported from compiled wasm module)
let GameWrapper: any;

class GameUI {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private game: any;
    private tileSize: number = 40;
    private offsetX: number = 0;
    private offsetY: number = 0;

    constructor() {
        this.canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
        this.ctx = this.canvas.getContext('2d')!;

        // Wait for WASM to load
        this.initGame();
        this.setupEventListeners();
    }

    private initGame() {
        // Use mock client for now (will be replaced by WASM)
        this.game = new MockGameClient(20, 20, Date.now());
        console.log('Game initialized with mock client');
        this.render();
    }

    private setupEventListeners() {
        this.canvas.addEventListener('click', (e) => this.onCanvasClick(e));

        const skipButton = document.getElementById('skipButton') as HTMLButtonElement;
        if (skipButton) {
            skipButton.addEventListener('click', () => this.skipOptionalCard());
        }
    }

    private onCanvasClick(event: MouseEvent) {
        if (!this.game) return;

        const rect = this.canvas.getBoundingClientRect();
        const canvasX = event.clientX - rect.left;
        const canvasY = event.clientY - rect.top;

        // Convert canvas coordinates to grid coordinates
        const gridX = Math.floor((canvasX - this.offsetX) / this.tileSize);
        const gridY = Math.floor((canvasY - this.offsetY) / this.tileSize);

        this.placeTile(gridX, gridY);
    }

    private placeTile(x: number, y: number) {
        if (!this.game) return;

        try {
            const state = this.game.getState();
            const phase = state.phase;

            let result: PlacementResult;
            if (phase === 'PLACING_FORCED_CARD') {
                result = this.game.placeForcedCard(x, y);
            } else if (phase === 'PLACING_OPTIONAL_CARD') {
                result = this.game.placeOptionalCard(x, y);
            } else {
                return;
            }

            console.log('Placement result:', result);
            this.render();
        } catch (e) {
            console.error('Error placing tile:', e);
        }
    }

    private skipOptionalCard() {
        if (!this.game) return;

        try {
            this.game.skipOptionalCard();
            console.log('Skipped optional card');
            this.render();
        } catch (e) {
            console.error('Error skipping card:', e);
        }
    }

    private render() {
        if (!this.game) return;

        try {
            const state = this.game.getState();
            this.renderGame(state);
            this.updateUI(state);
        } catch (e) {
            console.error('Error rendering game:', e);
        }
    }

    private renderGame(state: GameState) {
        // Clear canvas
        this.ctx.fillStyle = '#ecf0f1';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw grid
        this.drawGrid(state);

        // Draw tiles first (so they appear behind hazards)
        this.drawTiles(state);

        // Draw hazards on top
        this.drawHazards(state);

        // Debug: Log what we're rendering
        console.log(`Rendering: ${state.tiles.length} tiles, ${state.hazards.length} hazards`);
    }

    private drawGrid(state: GameState) {
        this.ctx.strokeStyle = '#bdc3c7';
        this.ctx.lineWidth = 0.5;

        // Calculate visible grid range
        const startX = Math.floor(-this.offsetX / this.tileSize);
        const startY = Math.floor(-this.offsetY / this.tileSize);
        const endX = startX + Math.ceil(this.canvas.width / this.tileSize) + 1;
        const endY = startY + Math.ceil(this.canvas.height / this.tileSize) + 1;

        // Draw vertical lines
        for (let x = startX; x < endX; x++) {
            const screenX = x * this.tileSize + this.offsetX;
            this.ctx.beginPath();
            this.ctx.moveTo(screenX, 0);
            this.ctx.lineTo(screenX, this.canvas.height);
            this.ctx.stroke();
        }

        // Draw horizontal lines
        for (let y = startY; y < endY; y++) {
            const screenY = y * this.tileSize + this.offsetY;
            this.ctx.beginPath();
            this.ctx.moveTo(0, screenY);
            this.ctx.lineTo(this.canvas.width, screenY);
            this.ctx.stroke();
        }
    }

    private drawHazards(state: GameState) {
        this.ctx.fillStyle = '#e74c3c';

        for (const hazard of state.hazards) {
            const screenX = hazard.x * this.tileSize + this.offsetX;
            const screenY = hazard.y * this.tileSize + this.offsetY;

            this.ctx.fillRect(screenX + 2, screenY + 2, this.tileSize - 4, this.tileSize - 4);
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = 'bold 20px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('✖', screenX + this.tileSize / 2, screenY + this.tileSize / 2);
            this.ctx.fillStyle = '#e74c3c';
        }
    }

    private drawTiles(state: GameState) {
        const tileColors: Record<string, string> = {
            START: '#27ae60',
            STRAIGHT_NS: '#3498db',
            STRAIGHT_EW: '#3498db',
            CORNER_NE: '#9b59b6',
            CORNER_NW: '#9b59b6',
            CORNER_SE: '#9b59b6',
            CORNER_SW: '#9b59b6',
            T_N: '#f39c12',
            T_E: '#f39c12',
            T_S: '#f39c12',
            T_W: '#f39c12',
            CROSS: '#e67e22',
            END: '#c0392b',
        };

        for (const tile of state.tiles) {
            const screenX = tile.x * this.tileSize + this.offsetX;
            const screenY = tile.y * this.tileSize + this.offsetY;
            const color = tileColors[tile.tile_type] || '#95a5a6';

            console.log(`Drawing tile ${tile.tile_type} at grid (${tile.x}, ${tile.y}) -> screen (${screenX}, ${screenY}), color=${color}`);

            // Draw tile background - use full tile size
            this.ctx.fillStyle = color;
            this.ctx.fillRect(screenX, screenY, this.tileSize, this.tileSize);

            // Draw tile border
            this.ctx.strokeStyle = '#2c3e50';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(screenX, screenY, this.tileSize, this.tileSize);

            // Label
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = 'bold 12px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            const labelText = tile.tile_type.replace(/_/g, '\n').slice(0, 6);
            this.ctx.fillText(labelText.split('\n')[0], screenX + this.tileSize / 2, screenY + this.tileSize / 2 - 5);
            if (labelText.includes('\n')) {
                this.ctx.fillText(labelText.split('\n')[1] || '', screenX + this.tileSize / 2, screenY + this.tileSize / 2 + 5);
            }
        }
    }

    private updateUI(state: GameState) {
        const turnInfo = document.getElementById('turnInfo');
        const scoreDiv = document.getElementById('score');
        const forcedCardDiv = document.getElementById('forcedCard');
        const optionalCardDiv = document.getElementById('optionalCard');
        const skipButton = document.getElementById('skipButton') as HTMLButtonElement;

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

        // Update button state
        if (skipButton) {
            skipButton.disabled = state.phase !== 'PLACING_OPTIONAL_CARD';
        }
    }
}

// Initialize game when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new GameUI();
    });
} else {
    new GameUI();
}
