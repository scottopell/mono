// Standalone game client that will be replaced by WASM version
// This is for testing the UI without WASM compilation

export interface GameState {
    turn: number;
    phase: string;
    tiles: TileData[];
    hazards: HazardData[];
    forced_card: CardData | null;
    optional_card: CardData | null;
    board_width: number;
    board_height: number;
}

export interface TileData {
    x: number;
    y: number;
    tile_type: string;
    turn_placed: number;
}

export interface HazardData {
    x: number;
    y: number;
}

export interface CardData {
    tile_type: string;
}

export interface PlacementResult {
    success: boolean;
    message: string;
    erosion_occurred: boolean;
    tiles_eroded: number;
}

// Tile types
const TILE_TYPES = [
    'STRAIGHT_NS', 'STRAIGHT_EW',
    'CORNER_NE', 'CORNER_NW', 'CORNER_SE', 'CORNER_SW',
    'T_N', 'T_E', 'T_S', 'T_W',
    'CROSS'
];

export class MockGameClient {
    private state: GameState;
    private rng: number;

    constructor(width: number, height: number, seed: number) {
        this.rng = seed;

        // Generate initial hazards
        const hazards: HazardData[] = [];
        const centerX = Math.floor(width / 2);
        const centerY = Math.floor(height / 2);

        for (let i = 0; i < 12; i++) {
            let x, y;
            do {
                x = this.random() % width;
                y = this.random() % height;
            } while (
                (x === centerX && y === centerY) ||
                Math.abs(x - centerX) < 2 && Math.abs(y - centerY) < 2 ||
                hazards.some(h => h.x === x && h.y === y)
            );
            hazards.push({ x, y });
        }

        this.state = {
            turn: 0,
            phase: 'PLACING_FORCED_CARD',
            tiles: [],
            hazards,
            forced_card: { tile_type: this.randomTileType() },
            optional_card: { tile_type: this.randomTileType() },
            board_width: width,
            board_height: height,
        };
    }

    private random(): number {
        // Simple seeded random
        this.rng = (this.rng * 1103515245 + 12345) & 0x7fffffff;
        return this.rng;
    }

    private randomTileType(): string {
        return TILE_TYPES[this.random() % TILE_TYPES.length];
    }

    private isHazard(x: number, y: number): boolean {
        return this.state.hazards.some(h => h.x === x && h.y === y);
    }

    private isOccupied(x: number, y: number): boolean {
        return this.state.tiles.some(t => t.x === x && t.y === y);
    }

    private hasAdjacentTile(x: number, y: number): boolean {
        if (this.state.tiles.length === 0) return true; // First tile can go anywhere

        return (
            this.isOccupied(x - 1, y) ||
            this.isOccupied(x + 1, y) ||
            this.isOccupied(x, y - 1) ||
            this.isOccupied(x, y + 1)
        );
    }

    getState(): GameState {
        return JSON.parse(JSON.stringify(this.state));
    }

    placeForcedCard(x: number, y: number): PlacementResult {
        if (x < 0 || x >= this.state.board_width || y < 0 || y >= this.state.board_height) {
            return {
                success: false,
                message: 'Out of bounds',
                erosion_occurred: false,
                tiles_eroded: 0,
            };
        }

        if (this.isOccupied(x, y)) {
            return {
                success: false,
                message: 'Position occupied',
                erosion_occurred: false,
                tiles_eroded: 0,
            };
        }

        if (this.isHazard(x, y)) {
            return {
                success: false,
                message: 'Blocked by hazard',
                erosion_occurred: false,
                tiles_eroded: 0,
            };
        }

        if (!this.hasAdjacentTile(x, y)) {
            // Trigger erosion
            if (this.state.tiles.length > 0) {
                this.state.tiles.pop();
                return {
                    success: false,
                    message: 'No adjacent tile - path eroded',
                    erosion_occurred: true,
                    tiles_eroded: 1,
                };
            }
            return {
                success: false,
                message: 'Not adjacent to path',
                erosion_occurred: false,
                tiles_eroded: 0,
            };
        }

        // Place the tile
        if (this.state.forced_card) {
            this.state.tiles.push({
                x,
                y,
                tile_type: this.state.forced_card.tile_type,
                turn_placed: this.state.turn,
            });
        }

        this.state.phase = 'PLACING_OPTIONAL_CARD';

        return {
            success: true,
            message: 'Tile placed',
            erosion_occurred: false,
            tiles_eroded: 0,
        };
    }

    placeOptionalCard(x: number, y: number): PlacementResult {
        if (x < 0 || x >= this.state.board_width || y < 0 || y >= this.state.board_height) {
            return {
                success: false,
                message: 'Out of bounds',
                erosion_occurred: false,
                tiles_eroded: 0,
            };
        }

        if (this.isOccupied(x, y)) {
            return {
                success: false,
                message: 'Position occupied',
                erosion_occurred: false,
                tiles_eroded: 0,
            };
        }

        if (this.isHazard(x, y)) {
            return {
                success: false,
                message: 'Blocked by hazard',
                erosion_occurred: false,
                tiles_eroded: 0,
            };
        }

        if (!this.hasAdjacentTile(x, y)) {
            return {
                success: false,
                message: 'Not adjacent to path',
                erosion_occurred: false,
                tiles_eroded: 0,
            };
        }

        // Place the tile
        if (this.state.optional_card) {
            this.state.tiles.push({
                x,
                y,
                tile_type: this.state.optional_card.tile_type,
                turn_placed: this.state.turn,
            });
        }

        this.startNewTurn();

        return {
            success: true,
            message: 'Tile placed',
            erosion_occurred: false,
            tiles_eroded: 0,
        };
    }

    skipOptionalCard(): void {
        this.startNewTurn();
    }

    private startNewTurn(): void {
        this.state.turn++;
        this.state.phase = 'PLACING_FORCED_CARD';
        this.state.forced_card = { tile_type: this.randomTileType() };
        this.state.optional_card = { tile_type: this.randomTileType() };
    }

    isWon(): boolean {
        // Would need full pathfinding logic - for now just return false
        return false;
    }
}
