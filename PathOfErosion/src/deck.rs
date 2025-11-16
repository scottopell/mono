use crate::types::{Card, TileType};
use rand::prelude::*;
use rand_chacha::ChaCha8Rng;
use serde::{Deserialize, Serialize};

/// Manages the card deck with seeded RNG for deterministic behavior
#[derive(Debug, Clone, Serialize)]
pub struct Deck {
    #[serde(skip)]
    rng: ChaCha8Rng,
    remaining_cards: Vec<Card>,
    discard_pile: Vec<Card>,
    seed: u64,
}

impl<'de> Deserialize<'de> for Deck {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        #[derive(Deserialize)]
        struct DeckData {
            remaining_cards: Vec<Card>,
            discard_pile: Vec<Card>,
            seed: u64,
        }

        let data = DeckData::deserialize(deserializer)?;
        let rng = ChaCha8Rng::seed_from_u64(data.seed);

        Ok(Deck {
            rng,
            remaining_cards: data.remaining_cards,
            discard_pile: data.discard_pile,
            seed: data.seed,
        })
    }
}

impl Deck {
    /// Create a new deck with a given seed
    pub fn new(seed: u64) -> Self {
        let rng = ChaCha8Rng::seed_from_u64(seed);
        let mut deck = Deck {
            rng,
            remaining_cards: Vec::new(),
            discard_pile: Vec::new(),
            seed,
        };
        deck.initialize();
        deck
    }

    /// Initialize the deck with cards
    fn initialize(&mut self) {
        // Create a standard deck of tiles
        // For now, just fill with random tiles (can be adjusted for distribution later)
        for _ in 0..50 {
            let tile_type = TileType::random_path(&mut self.rng);
            self.remaining_cards.push(Card::new(tile_type));
        }
        self.remaining_cards.shuffle(&mut self.rng);
    }

    /// Draw a card from the deck
    pub fn draw_card(&mut self) -> Option<Card> {
        if self.remaining_cards.is_empty() {
            self.reshuffle();
        }

        self.remaining_cards.pop()
    }

    /// Draw multiple cards at once
    pub fn draw_cards(&mut self, count: usize) -> Vec<Card> {
        let mut cards = Vec::new();
        for _ in 0..count {
            if let Some(card) = self.draw_card() {
                cards.push(card);
            }
        }
        cards
    }

    /// Discard a card
    pub fn discard_card(&mut self, card: Card) {
        self.discard_pile.push(card);
    }

    /// Reshuffle the discard pile back into the deck
    pub fn reshuffle(&mut self) {
        if self.discard_pile.is_empty() {
            return; // Nothing to reshuffle
        }

        self.remaining_cards = self.discard_pile.drain(..).collect();
        self.remaining_cards.shuffle(&mut self.rng);
    }

    /// Get the number of cards remaining in deck
    pub fn cards_remaining(&self) -> usize {
        self.remaining_cards.len()
    }

    /// Get the total number of cards (remaining + discard)
    pub fn total_cards(&self) -> usize {
        self.remaining_cards.len() + self.discard_pile.len()
    }

    /// Peek at the top card without drawing
    pub fn peek_card(&self) -> Option<&Card> {
        self.remaining_cards.last()
    }

    /// Get the seed used for this deck
    pub fn seed(&self) -> u64 {
        self.seed
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_deck_initialization() {
        let deck = Deck::new(12345);
        assert_eq!(deck.total_cards(), 50);
    }

    #[test]
    fn test_draw_card() {
        let mut deck = Deck::new(12345);
        let initial_count = deck.cards_remaining();

        let card = deck.draw_card();
        assert!(card.is_some());
        assert_eq!(deck.cards_remaining(), initial_count - 1);
    }

    #[test]
    fn test_deck_conservation() {
        let mut deck = Deck::new(12345);
        let initial_total = deck.total_cards();

        // Draw and discard multiple times
        for _ in 0..10 {
            if let Some(card) = deck.draw_card() {
                deck.discard_card(card);
            }
        }

        assert_eq!(deck.total_cards(), initial_total);
    }

    #[test]
    fn test_reshuffle() {
        let mut deck = Deck::new(12345);

        // Draw all cards
        while deck.draw_card().is_some() {}
        assert_eq!(deck.cards_remaining(), 0);

        // Discard some
        let card = Card::new(TileType::StraightNS);
        deck.discard_card(card);

        // Reshuffle
        deck.reshuffle();
        assert_eq!(deck.cards_remaining(), 1);
    }

    #[test]
    fn test_seeded_deck_reproducibility() {
        let mut deck1 = Deck::new(42);
        let mut deck2 = Deck::new(42);

        // Draw same sequence and verify it matches
        for _ in 0..5 {
            let card1 = deck1.draw_card().unwrap();
            let card2 = deck2.draw_card().unwrap();
            assert_eq!(card1.tile_type, card2.tile_type);
        }
    }
}
