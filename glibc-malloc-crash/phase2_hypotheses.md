# Phase 2: HYPOTHESIZE - Testable Explanations

## Overview

**Primary Observable:** gVisor/runsc is the ONLY unique factor in crashing environment.

**Key Question:** What specific interaction between gVisor, glibc 2.39, and concurrent malloc causes SIGSEGV?

---

## Hypothesis H-A1: MALLOC_ARENA_MAX Unset Causes gVisor-Specific Arena Contention Race

**Claim:** glibc's default arena allocation strategy (8 * num_cores = 128 arenas) triggers a race condition in gVisor's mmap syscall handler when multiple threads simultaneously request new arenas.

**Supporting Evidence:**
- MALLOC_ARENA_MAX is not set (defaults to 8*cores = 128 possible arenas)
- 3 concurrent threads may trigger simultaneous arena creation
- gVisor's user-space kernel may not handle concurrent mmap calls safely
- Crash happens during sysmalloc() which allocates new memory regions

**Contradicting Evidence:**
- Same test passes in standard Docker with same glibc 2.39 and unlimited arenas
- If arena count were the issue, would expect to see crashes in standard environments too

**Prediction:**
- If TRUE: Setting MALLOC_ARENA_MAX=1 will prevent crash (forces single arena, no contention)
- If FALSE: Setting MALLOC_ARENA_MAX=1 will still crash

**Falsification Criteria:**
- Crash occurs even with MALLOC_ARENA_MAX=1

**Confidence Level:** High

**Test Priority:** 1 (Easiest test, high impact if confirmed)

---

## Hypothesis H-B1: gVisor mmap Implementation Has Thread Safety Bug

**Claim:** gVisor's implementation of the mmap syscall has a race condition when called concurrently from multiple threads, causing memory corruption that manifests as SIGSEGV in malloc.

**Supporting Evidence:**
- gVisor intercepts all mmap syscalls with user-space implementation
- sysmalloc() uses mmap to allocate large chunks
- Crash only happens under gVisor, not standard kernel
- 3 concurrent threads creating large allocations (14MB each)

**Contradicting Evidence:**
- gVisor is widely used; a fundamental mmap race should be more commonly reported
- gVisor has been around since 2018, likely well-tested

**Prediction:**
- If TRUE: Running test with 1 thread (sequential) will prevent crash
- If FALSE: Single-threaded test will still crash

**Falsification Criteria:**
- Crash occurs even with single-threaded execution

**Confidence Level:** Medium-High

**Test Priority:** 2 (Easy to test by modifying thread count)

---

## Hypothesis H-B2: gVisor's Memory Mapping Limit Exceeded

**Claim:** gVisor has an internal limit on the number of memory mappings (distinct mmap regions) that is lower than the kernel's vm.max_map_count, and concurrent large allocations exceed this limit.

**Supporting Evidence:**
- vm.max_map_count is set to 2147483647 (unlimited) but this may not apply to gVisor
- gVisor maintains its own memory mapping table in user space
- Large allocations (14MB * 3 threads) create many mappings
- No swap available (SwapTotal: 0) forces physical mapping

**Contradicting Evidence:**
- If limit were reached, would expect ENOMEM, not SIGSEGV
- 14MB * 3 = ~42MB is tiny compared to 13GB available memory

**Prediction:**
- If TRUE: Reducing allocation size from 14MB to 1MB will prevent crash
- If FALSE: Smaller allocations will still crash

**Falsification Criteria:**
- Crash occurs even with 1MB allocations

**Confidence Level:** Low-Medium

**Test Priority:** 4 (Requires code modification)

---

## Hypothesis H-C1: glibc 2.39 Uses New malloc Feature Incompatible with gVisor

**Claim:** glibc 2.39 introduced a new malloc optimization or feature that relies on kernel behavior not properly emulated by gVisor, and this feature is triggered by the specific allocation pattern.

**Supporting Evidence:**
- glibc 2.39 is very new (Ubuntu 24.04)
- glibc 2.35 (Ubuntu 22.04) works fine in homelab
- gVisor emulates kernel 4.4.0 (2016), may not implement newer syscall semantics
- sysmalloc() is where crash occurs (core malloc allocation path)

**Contradicting Evidence:**
- glibc 2.39 works in standard Docker x86_64 (same version)
- Would need to identify specific feature change between 2.35 and 2.39

**Prediction:**
- If TRUE: Using an older glibc (2.35) would prevent crash
- If FALSE: Using alternative allocator (jemalloc) won't affect outcome
- Alternative test: Enabling jemalloc will prevent crash (bypasses glibc malloc entirely)

**Falsification Criteria:**
- Using jemalloc still produces crash (indicates not glibc-specific)

**Confidence Level:** Medium

**Test Priority:** 3 (jemalloc test is easy; glibc downgrade harder)

---

## Hypothesis H-D1: gVisor Has Bug with brk Syscall Under Thread Contention

**Claim:** glibc's malloc uses brk() for small allocations and mmap() for large ones. gVisor's brk() implementation has a race when called from multiple threads simultaneously.

**Supporting Evidence:**
- malloc can use both brk and mmap depending on size
- 14MB is above DEFAULT_MMAP_THRESHOLD (128KB), should use mmap
- But internal malloc metadata may use brk
- gVisor implements brk in user space

**Contradicting Evidence:**
- The error occurs in sysmalloc() which typically handles mmap, not brk
- brk is generally for small allocations, test uses large ones

**Prediction:**
- If TRUE: Setting MALLOC_MMAP_THRESHOLD_=0 to force all allocations via mmap will change behavior
- If FALSE: Forcing mmap-only won't affect crash

**Falsification Criteria:**
- Crash persists with MALLOC_MMAP_THRESHOLD_=0

**Confidence Level:** Low-Medium

**Test Priority:** 5 (Easy to test with env var)

---

## Hypothesis H-E1: Namespace Isolation Breaks Shared Memory Assumptions

**Claim:** glibc's malloc assumes certain shared memory semantics that are broken by gVisor's aggressive namespace isolation (IPC, MNT, PID, USER, UTS all isolated).

**Supporting Evidence:**
- Environment has unusual namespace isolation
- All working environments lack this level of isolation
- malloc may assume process-global state consistency

**Contradicting Evidence:**
- Namespace isolation is common in containers
- Malloc shouldn't rely on IPC or shared memory across processes (single-process test)
- Each test runs in isolated process anyway

**Prediction:**
- If TRUE: Running test outside container (if possible) will prevent crash
- If FALSE: Cannot test this in current environment (boundary reached)

**Falsification Criteria:**
- Cannot be directly tested without elevated privileges or different environment

**Confidence Level:** Low

**Test Priority:** 6 (Cannot test in current environment - natural boundary)

---

## Hypothesis H-F1: gVisor's User-Space Scheduling Introduces Timing Window

**Claim:** gVisor implements thread scheduling in user space. This introduces a specific timing window where malloc metadata structures are accessed concurrently in a way that wouldn't occur with kernel-space scheduling.

**Supporting Evidence:**
- gVisor's "user-space kernel" implements its own scheduler
- Crash is timing-sensitive (happens during concurrent allocation)
- Race conditions often depend on exact scheduling behavior

**Contradicting Evidence:**
- If it were a pure timing issue, crash rate might be <100%
- Observed crash rate is 100% (5/5 runs), suggests deterministic trigger

**Prediction:**
- If TRUE: Adding sleep/delays between thread starts might prevent crash
- If FALSE: Thread delays won't affect outcome

**Falsification Criteria:**
- Crash persists even with significant inter-thread delays (1 second)

**Confidence Level:** Low

**Test Priority:** 7 (Requires code modification, low confidence)

---

## Hypothesis Summary Table

| ID | Hypothesis | Confidence | Test Difficulty | Priority |
|----|-----------|------------|----------------|----------|
| H-A1 | MALLOC_ARENA_MAX contention | High | Very Easy | 1 |
| H-B1 | gVisor mmap thread safety bug | Medium-High | Easy | 2 |
| H-C1 | glibc 2.39 incompatibility | Medium | Easy (jemalloc) | 3 |
| H-B2 | Memory mapping limit | Low-Medium | Medium | 4 |
| H-D1 | brk syscall race | Low-Medium | Easy | 5 |
| H-E1 | Namespace isolation | Low | Cannot test | 6 |
| H-F1 | Scheduling timing window | Low | Medium | 7 |

---

## Next Steps: Phase 3 - Design Tests

Prioritize testing in order:
1. T-A1: Test MALLOC_ARENA_MAX=1
2. T-B1: Test single-threaded execution
3. T-C1: Test with jemalloc allocator
4. T-D1: Test MALLOC_MMAP_THRESHOLD_=0
5. T-B2: Test smaller allocation sizes

These 5 tests are all feasible in current environment and will significantly narrow hypothesis space.

---
**Phase 2 Status:** ✅ COMPLETE
**Hypotheses Generated:** 7
**Testable in Current Environment:** 5
**Next Phase:** Design specific test procedures
