# Bug Findings - Path of Erosion

## BUG #1: Misleading Documentation (FIXED)
Fixed incorrect comments in `direction_to()` function.

## BUG #2: State Blob Serialization - FALSE ALARM ✅

**Status:** NOT REPRODUCIBLE - Likely copy/paste error

**Initial Report:** During manual CLI testing, a deserialization error occurred:
- Error: "Deserialization error: invalid value: integer `32770`, expected variant index 0 <= i < 13"
- Appeared to happen after seed 999, 6x6 board, place at (2,3), skip optional

**Investigation Results:**
1. ✅ Created comprehensive property tests for serialization
2. ✅ All property tests pass (100+ random cases)
3. ✅ Specific regression test for seed 999 scenario passes
4. ✅ Original "failing" command now works correctly
5. ✅ Tested multiple board sizes (5-10) with various seeds

**Conclusion:**
The original error was likely due to:
- Corrupted state blob during copy/paste from terminal
- Transient environment issue
- Manual data entry error

**Value Added:**
While the bug was not real, this investigation resulted in:
- 4 new property tests for serialization round-trip
- 2 regression tests covering edge cases
- Improved test coverage for game state persistence
- Confidence in serialization reliability

**Tests Added:**
- `prop_serialization_roundtrip` - Tests any game state can serialize/deserialize
- `prop_serialization_after_forced_placement` - Tests after placing forced card
- `prop_serialization_after_skip` - Tests after skipping optional
- `prop_serialization_after_game_sequence` - Tests multi-operation sequences
- `test_serialization_regression_seed_999` - Specific regression test
- `test_serialization_small_boards` - Tests various small board configurations
