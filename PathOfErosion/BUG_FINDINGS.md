# Bug Findings - Path of Erosion

## BUG #1: Misleading Documentation (FIXED)
Fixed incorrect comments in `direction_to()` function.

## BUG #2: State Blob Serialization - NOT REPRODUCIBLE ⚠️

**Status:** OBSERVED REAL FAILURE, but cannot reproduce despite exhaustive testing

**What I Observed:**
- **Real error occurred** during manual CLI testing
- Error: "Deserialization error: invalid value: integer `32770`, expected variant index 0 <= i < 13"
- Occurred after: seed 999, 6x6 board, place at (2,3), skip optional
- This was NOT a hypothetical - I literally saw the game break with this error

**Exhaustive Testing Performed:**
1. ✅ **10,000 manual iterations** - random seeds, sizes, operation sequences
2. ✅ **10,000+ property test cases** - automated testing with proptest
3. ✅ **Specific regression test** for exact seed 999 scenario
4. ✅ **Edge case testing** - problematic seeds (0, MAX, 999, etc.)
5. ✅ **Stress testing** - serialization after every single operation
6. ✅ **Re-ran original "failing" state blob** - now works

**Result:** Cannot reproduce the bug despite ~20,000+ test iterations

**Possible Explanations:**
1. **Non-deterministic bug** (heisenbug) - race condition, memory issue, etc.
2. **Environment-specific** - only occurs under certain conditions not captured in tests
3. **Copy/paste corruption** - state blob was corrupted when I copied it
4. **Build state changed** - something changed between failure and testing
5. **Sequence-dependent** - specific operation sequence not captured by tests

**Current Assessment:**
- Bug was **observed and real**
- Cannot **reliably reproduce** it
- Serialization appears robust under extensive testing
- Monitoring for future occurrences

**Tests Added (Comprehensive Coverage):**
- `prop_serialization_roundtrip` - Tests any game state can serialize/deserialize
- `prop_serialization_after_forced_placement` - Tests after placing forced card
- `prop_serialization_after_skip` - Tests after skipping optional
- `prop_serialization_after_game_sequence` - Tests multi-operation sequences
- `prop_serialization_stress_test` - 20 operations with serialization at each step
- `prop_serialization_problematic_seeds` - Edge case seeds (0, MAX, 999)
- `test_serialization_manual_stress` - **10,000 manual iterations**
- `test_serialization_regression_seed_999` - Specific seed 999 reproduction
- `test_serialization_small_boards` - Various board sizes

**Next Steps if Bug Reoccurs:**
1. Capture full environment state (build, dependencies, system)
2. Save exact binary state for forensic analysis
3. Add instrumentation to serialization code
4. Consider memory safety analysis tools (Miri, valgrind)
