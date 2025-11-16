use serde::{Deserialize, Serialize};

/// A position on the game board
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Position {
    pub x: i32,
    pub y: i32,
}

impl Position {
    pub fn new(x: i32, y: i32) -> Self {
        Position { x, y }
    }

    /// Get position moved in a direction
    pub fn moved(&self, direction: Direction) -> Position {
        match direction {
            Direction::North => Position {
                x: self.x,
                y: self.y - 1,
            },
            Direction::South => Position {
                x: self.x,
                y: self.y + 1,
            },
            Direction::East => Position {
                x: self.x + 1,
                y: self.y,
            },
            Direction::West => Position {
                x: self.x - 1,
                y: self.y,
            },
        }
    }

    /// Get the direction needed to reach another position (if adjacent)
    pub fn direction_to(&self, other: Position) -> Option<Direction> {
        if self.x == other.x && self.y == other.y - 1 {
            Some(Direction::North)
        } else if self.x == other.x && self.y == other.y + 1 {
            Some(Direction::South)
        } else if self.x == other.x + 1 && self.y == other.y {
            Some(Direction::East)
        } else if self.x == other.x - 1 && self.y == other.y {
            Some(Direction::West)
        } else {
            None
        }
    }

    /// Check if two positions are orthogonally adjacent
    pub fn is_adjacent(&self, other: Position) -> bool {
        self.direction_to(other).is_some()
    }
}

/// Cardinal directions
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Direction {
    North,
    South,
    East,
    West,
}

impl Direction {
    pub fn opposite(&self) -> Direction {
        match self {
            Direction::North => Direction::South,
            Direction::South => Direction::North,
            Direction::East => Direction::West,
            Direction::West => Direction::East,
        }
    }

    pub fn all() -> [Direction; 4] {
        [Direction::North, Direction::South, Direction::East, Direction::West]
    }
}

/// Types of tiles that can be placed
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum TileType {
    // Path tiles (directional connections)
    StraightNS,      // | vertical
    StraightEW,      // — horizontal
    CornerNE,        // └ northeast corner
    CornerNW,        // ┘ northwest corner
    CornerSE,        // ┐ southeast corner
    CornerSW,        // ┌ southwest corner
    TN,              // ├ T-junction pointing north
    TE,              // ┴ T-junction pointing east
    TS,              // ┤ T-junction pointing south
    TW,              // ┬ T-junction pointing west
    Cross,           // ┼ cross (all directions)

    // Special tiles
    START,           // Origin point
    END,             // Destination (not required to reach)
}

impl TileType {
    /// Get the set of directions this tile connects to
    pub fn connections(&self) -> Vec<Direction> {
        match self {
            TileType::StraightNS => vec![Direction::North, Direction::South],
            TileType::StraightEW => vec![Direction::East, Direction::West],
            TileType::CornerNE => vec![Direction::North, Direction::East],
            TileType::CornerNW => vec![Direction::North, Direction::West],
            TileType::CornerSE => vec![Direction::South, Direction::East],
            TileType::CornerSW => vec![Direction::South, Direction::West],
            TileType::TN => vec![Direction::North, Direction::East, Direction::West],
            TileType::TE => vec![Direction::East, Direction::North, Direction::South],
            TileType::TS => vec![Direction::South, Direction::East, Direction::West],
            TileType::TW => vec![Direction::West, Direction::North, Direction::South],
            TileType::Cross => vec![Direction::North, Direction::South, Direction::East, Direction::West],
            TileType::START => vec![Direction::North, Direction::South, Direction::East, Direction::West],
            TileType::END => vec![Direction::North, Direction::South, Direction::East, Direction::West],
        }
    }

    /// Check if this tile has a connection in a given direction
    pub fn has_connection(&self, direction: Direction) -> bool {
        self.connections().contains(&direction)
    }

    /// Get a random path tile (not START/END)
    pub fn random_path(rng: &mut impl rand::RngCore) -> TileType {
        use rand::seq::SliceRandom;
        let tiles = vec![
            TileType::StraightNS,
            TileType::StraightEW,
            TileType::CornerNE,
            TileType::CornerNW,
            TileType::CornerSE,
            TileType::CornerSW,
            TileType::TN,
            TileType::TE,
            TileType::TS,
            TileType::TW,
            TileType::Cross,
        ];
        *tiles.choose(rng).unwrap()
    }
}

/// A placed tile on the board
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Tile {
    pub id: u32,
    pub position: Position,
    pub tile_type: TileType,
    pub turn_placed: u32,
}

impl Tile {
    pub fn new(id: u32, position: Position, tile_type: TileType, turn_placed: u32) -> Self {
        Tile {
            id,
            position,
            tile_type,
            turn_placed,
        }
    }
}

/// A card that can be drawn from the deck
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Card {
    pub tile_type: TileType,
}

impl Card {
    pub fn new(tile_type: TileType) -> Self {
        Card { tile_type }
    }
}

/// Game states
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum GamePhase {
    PlacingForcedCard,
    PlacingOptionalCard,
    SessionEnded,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn position_adjacency() {
        let p1 = Position::new(0, 0);
        let p2 = Position::new(1, 0);
        let p3 = Position::new(2, 2);

        assert!(p1.is_adjacent(p2));
        assert!(!p1.is_adjacent(p3));
    }

    #[test]
    fn position_direction() {
        let p1 = Position::new(0, 0);
        assert_eq!(p1.moved(Direction::North), Position::new(0, -1));
        assert_eq!(p1.moved(Direction::South), Position::new(0, 1));
        assert_eq!(p1.moved(Direction::East), Position::new(1, 0));
        assert_eq!(p1.moved(Direction::West), Position::new(-1, 0));
    }

    #[test]
    fn tile_type_connections() {
        assert_eq!(
            TileType::Cross.connections().len(),
            4,
            "Cross should connect in all 4 directions"
        );
        assert_eq!(
            TileType::StraightNS.connections().len(),
            2,
            "Straight should connect in 2 directions"
        );
    }

    #[test]
    fn opposite_direction() {
        assert_eq!(Direction::North.opposite(), Direction::South);
        assert_eq!(Direction::East.opposite(), Direction::West);
    }
}
