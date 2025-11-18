# Phase 1: OBSERVE - Complete Summary

## Crash Baseline (Step 1.1)

**Status:** CONFIRMED - 100% Reproducible
- **Signal:** SIGSEGV (signal: 11, invalid memory reference)
- **Test:** test_concurrent_string_and_vec_growth
- **String size:** 14,680,064 bytes (~14MB)
- **Threads:** 3 concurrent threads
- **Crash Rate:** 5/5 runs (100%)
- **Time to Crash:** 2-3 seconds (deterministic)

## Environmental Fingerprint (Step 1.2)

### System Identity
- **Kernel:** 4.4.0 (gVisor compatibility layer)
- **OS:** Ubuntu 24.04.3 LTS (Noble Numbat)
- **glibc:** 2.39-0ubuntu8.6
- **Architecture:** x86_64
- **Hostname:** runsc (gVisor runtime indicator)

### Virtualization & Sandbox
- **Container:** Docker with gVisor/runsc sandbox
- **Namespace Isolation:** YES (IPC, MNT, PID, USER, UTS all isolated)
- **Virtualization Type:** docker (detected by systemd-detect-virt)

### Security Mechanisms
- **Seccomp:** 0 (not in strict seccomp-bpf mode)
- **AppArmor:** Not detected
- **SELinux:** Not detected
- **ptrace_scope:** 1 (restricted)
- **Capabilities:** Limited (CapBnd: 00000000200404e1)

### Memory Configuration
- **Total Memory:** 13GB
- **Swap:** 0 (no swap)
- **Memory cgroup limit:** 9223372036854775807 (essentially unlimited)
- **vm.overcommit_memory:** 0 (heuristic overcommit)
- **vm.max_map_count:** 2147483647 (unlimited)

### malloc Configuration
- **MALLOC_ARENA_MAX:** NOT SET
- **MALLOC_* env vars:** NONE
- **LD_PRELOAD:** NOT SET

### Process Limits
- **max user processes:** unlimited
- **virtual memory:** unlimited
- **open files:** 20000
- **stack size:** 8192 KB
- **pending signals:** 0 (!)

### Rust Toolchain
- **rustc:** 1.91.1
- **cargo:** 1.91.1

## Comparative Evidence (Step 1.3)

| Environment | Arch | OS | glibc | Sandbox | Result |
|-------------|------|----|----|---------|--------|
| **THIS (gVisor)** | x86_64 | Ubuntu 24.04 | 2.39 | **gVisor/runsc** | **CRASH** |
| Homelab | x86_64 | Ubuntu 22.04 | 2.35 | None | PASS |
| Docker ARM64 | aarch64 | Ubuntu 24.04 | 2.39 | Docker std | PASS |
| Docker x86_64 | x86_64 | Ubuntu 24.04 | 2.39 | Docker std | PASS |

### Key Unique Factors (Differentiators)

**ONLY in crashing environment:**
1. 🔴 **gVisor/runsc sandbox** - User-space kernel that intercepts ALL syscalls
2. 🔴 **Kernel 4.4.0** - gVisor compatibility layer (not real kernel)
3. 🔴 **Namespace isolation** pattern specific to gVisor
4. 🔴 **pending signals: 0** - Unusual process limit

**Shared with working environments (NOT root cause):**
- ✅ glibc 2.39 works in Docker x86_64 standard
- ✅ Ubuntu 24.04 works in Docker ARM64
- ✅ x86_64 architecture works in homelab
- ✅ cargo test works everywhere else

## Crash Characteristics (Step 1.4)

| Run | Signal | Duration | Outcome |
|-----|--------|----------|---------|
| 1   | SIGSEGV (11) | 3s | CRASH |
| 2   | SIGSEGV (11) | 2s | CRASH |
| 3   | SIGSEGV (11) | 3s | CRASH |
| 4   | SIGSEGV (11) | 3s | CRASH |
| 5   | SIGSEGV (11) | 2s | CRASH |

**Analysis:**
- Deterministic crash (100% reproducible)
- Low variance in timing (2-3s)
- Same signal every time
- No Heisenbugs (observation doesn't affect outcome)
- Suitable for systematic testing

## Phase 1 Conclusions

### Facts (High Confidence)
1. Crash is deterministic and 100% reproducible
2. Environment is gVisor/runsc sandboxed (NOT standard Docker)
3. glibc 2.39 works fine in standard Docker with same OS
4. Crash location is in glibc's sysmalloc() during concurrent allocation
5. No malloc tuning environment variables are set

### Strong Correlations
1. gVisor/runsc presence correlates with crash
2. Standard Docker (without gVisor) correlates with success
3. All working environments lack gVisor

### Primary Hypothesis Direction
**gVisor's syscall interception (mmap/brk) has a bug or incompatibility with glibc 2.39's malloc implementation, specifically triggered by concurrent allocation patterns.**

### Evidence Quality
- **Reproducibility:** Excellent (5/5 crashes)
- **Environmental data:** Complete
- **Comparative data:** Good (4 working environments documented)
- **Baseline:** Solid

## Next Phase: Generate Testable Hypotheses

Focus areas based on observations:
1. gVisor-specific syscall interception bugs
2. glibc 2.39 + gVisor interaction
3. MALLOC_ARENA_MAX and arena contention under gVisor
4. Namespace isolation effects on shared memory
5. Thread synchronization under gVisor's user-space scheduler

---
**Phase 1 Status:** ✅ COMPLETE
**Readiness for Phase 2:** ✅ READY
**Data Quality:** ✅ HIGH
