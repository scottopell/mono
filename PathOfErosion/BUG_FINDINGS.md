# Bug Findings - Path of Erosion

## BUG #1: Misleading Documentation (FIXED)
Fixed incorrect comments in `direction_to()` function.

## BUG #2: State Blob Serialization Corruption ⚠️ CRITICAL

**Severity:** CRITICAL - Breaks game state persistence

**Description:** Under certain conditions, the game serializes a corrupted state blob that cannot be deserialized.

**Reproduction Steps:**
1. Start new game with seed 999, 6x6 board
2. Place forced card CORNER_SE at (2,3)
3. Try to skip the optional card
4. Error: "Deserialization error: invalid value: integer `32770`, expected variant index 0 <= i < 13"

**Root Cause:** The state blob generated after placing the forced card is malformed:
- The base64 encoding has incorrect padding
- When decoded, contains value 32770 where TileType enum variant (0-12) is expected
- Value 32770 = 0x8002 suggests possible byte alignment or endianness issue

**Failing State Blob:**
```
AgAAAAAAAAADAAAAAwAAAAEAAAADAAAAAwAAAAsAAAAAAAAAAgAAAAMAAAACAAAAAgAAAAMAAAAEAAAAAAAAAAMAAAAGAAAABgAAADAAAAAAAAAACQAAAAEAAAABAAAABQAAAAEAAAAEAAAAAwAAAAoAAAAFAAAAAwAAAAcAAAADAAAAAgAAAAkAAAAGAAAAAAAAAAgAAAAKAAAACAAAAAoAAAADAAAAAAAAAAoAAAABAAAAAAAAAAgAAAAJAAAAAAAAAAEAAAACAAAAAQAAAAKAAAAIAAAABAAAAAMAAAABAAAACQAAAAgAAAAAAAAAAwAAAAoAAAAFAAAABQAAAAkAAAAJAAAAAQAAAAQAAAADAAAAAQAAAAAAAAAEAAAA5wMAAAAAAAAMAAAAAAAAAAAAAAAEAAAABQAAAAAAAAAAAAAAAgAAAAQAAAACAAAAAQAAAAQAAAAFAAAAAgAAAAQAAAAEAAAAAwAAAAAAAAAEAAAABQAAAAIAAAAFAAAAAAAAAAUAAAABAAAAAQAAAOcDAAAAAAAAAQQAAAABBgAAAAEAAAAAAAAA5wMAAAAAAAA=
```

**Error Details:**
- Location: json_state.rs:332 (bincode::deserialize)
- Expected: TileType enum variant (0-12)
- Got: 32770

**Impact:**
- Game state cannot be continued after certain moves
- Saves are corrupted and unrecoverable
- Affects gameplay reliability

**Potential Causes:**
1. Bincode version compatibility issue
2. Custom Serialize/Deserialize implementation bug in Deck
3. Memory corruption during serialization
4. RNG state interfering with serialization

**Next Steps:**
1. Add unit test to reproduce the issue
2. Investigate Deck's custom Deserialize implementation
3. Check if bincode configuration options are needed
4. Verify all structs have correct Serialize/Deserialize derives
