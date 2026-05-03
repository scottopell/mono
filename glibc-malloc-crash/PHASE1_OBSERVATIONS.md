# Phase 1: OBSERVE - Catalog Known Facts

## Step 1.1: Crash Baseline

**Test Command:**
```bash
RUST_BACKTRACE=full cargo test --test test_pure_std_repro test_concurrent_string_and_vec_growth --release -- --nocapture
```

**Result:**
- **Exit code**: 101 (cargo test failure)
- **Signal**: 11 (SIGSEGV: invalid memory reference)
- **Error message**: `process didn't exit successfully` with signal 11
- **Time to crash**: ~1 minute 13 seconds total (mostly compilation)
- **Test output**:
  - Started 3 threads (thread 0, 1, 2)
  - String size: 14,680,064 bytes (~14MB)
  - Crashed during concurrent work
- **Backtrace**: Not shown despite RUST_BACKTRACE=full (crash in C code, not Rust)

## Step 1.2: Environmental Fingerprint

### System Identity
- **Kernel**: Linux 4.4.0 (from January 2016 - VERY OLD!)
- **OS**: Ubuntu 24.04.3 LTS (Noble Numbat)
- **glibc**: 2.39-0ubuntu8.6 (from 2024 - VERY NEW!)
- **Architecture**: x86_64
- **🔴 CRITICAL ANOMALY: ~8 year gap between kernel (2016) and glibc (2024)**

### Hardware Resources
- **CPUs**: 16 cores
- **Memory**: 13GB total, 12GB available
- **Swap**: 0 kB (no swap configured)
- **Mapped memory**: 126700 kB

### Kernel Parameters
- **vm.overcommit_memory**: 0 (heuristic overcommit)
- **vm.max_map_count**: 2147483647 (essentially unlimited)
- **kernel.pid_max**: 65536

### glibc malloc Environment
- **No malloc environment variables set**
- No MALLOC_ARENA_MAX
- No MALLOC_CHECK_
- No LD_PRELOAD

### Process Limits
- **Most limits**: unlimited
- **Stack size**: 8192 kbytes (8MB)
- **Open files**: 20000
- **⚠️ Pending signals**: 0 (unusual!)
- **Max user processes**: unlimited

### Container/Virtualization
- **Virtualization**: docker (via systemd-detect-virt)
- **Docker**: YES (/.dockerenv exists)
- **Kubernetes**: NO
- **Container name**: container_01EmJhQKB6yA7dmoKq98o18B--claude_code_remote--angry-steel-young-ages
- **Kernel**: runsc (gVisor runtime - application kernel sandbox)

### Security/Sandbox Mechanisms
- **Seccomp**: 0 (not enabled for this process)
- **ptrace_scope**: 1 (restricted)
- **Capabilities**: Reduced (CapEff: 00000000a82c35fb, CapBnd: 00000000200404e1)
- **AppArmor**: Not detected
- **SELinux**: Not detected

### cgroup Constraints
- **Memory limit**: 9223372036854775807 bytes (~8 exabytes - essentially unlimited)
- **Memory cgroup active**: YES
- **cgroup hierarchy**: Custom per-container

### Namespaces
- **Custom namespaces**: ipc, mnt, net, pid, user, uts
- All processes running in isolated namespaces

### Rust Toolchain
- **rustc**: 1.91.1 (ed61e7d7e 2025-11-07)
- **cargo**: 1.91.1 (ea2d97820 2025-10-10)

## Step 1.3: Comparative Evidence

| Environmental Factor | THIS ENV (CRASH) | Remote Homelab (PASS) | Docker ARM64 (PASS) | Docker x86_64 emulated (PASS) |
|---------------------|------------------|----------------------|---------------------|-------------------------------|
| **Architecture** | x86_64 | x86_64 | aarch64 | x86_64 |
| **OS** | Ubuntu 24.04 | Ubuntu 22.04 | Ubuntu 24.04 | Ubuntu 24.04 |
| **glibc** | 2.39 | 2.35 | 2.39 | 2.39 |
| **Kernel** | 4.4.0 (2016!) | Modern (assumed 5.x+) | Modern | Modern |
| **Container** | Docker (gVisor/runsc) | Bare metal | Docker (standard) | Docker (standard) |
| **Test Runner** | cargo test | cargo test & nextest | cargo test | cargo test |
| **Swap** | 0 kB | Unknown | Unknown | Unknown |
| **Result** | **CRASH** | PASS | PASS | PASS |

### Key Differentiators (What's unique to crash environment?)

1. **🔴 PRIMARY SUSPECT: Ancient kernel (4.4.0) + modern glibc (2.39)**
   - 8 year version gap
   - glibc 2.39 may use syscalls/features not properly supported by kernel 4.4.0

2. **🟡 gVisor/runsc sandbox**
   - Using runsc (Google's gVisor application kernel)
   - May intercept or emulate syscalls differently
   - Could have bugs in mmap/brk emulation

3. **🟡 No swap configured**
   - Could affect memory overcommit behavior
   - May force different malloc code paths

4. **🟡 Pending signals = 0**
   - Unusual process limit
   - Could affect signal handling in malloc

5. **🟡 Custom namespace isolation**
   - All 6 namespace types customized
   - Could affect shared memory or IPC mechanisms

### Hypothesis Generation Inputs

**Strong correlations (likely causal):**
- Kernel-glibc version mismatch (8 year gap)
- gVisor/runsc sandbox (syscall interception/emulation)

**Moderate correlations (possibly causal):**
- No swap + vm.overcommit_memory=0
- Container-specific namespace isolation
- Pending signals = 0 limit

**Weak correlations (unlikely causal):**
- Specific glibc version (2.39 works on other Docker x86_64)
- Ubuntu 24.04 (works on Docker ARM64)
- CPU architecture (x86_64 works on remote homelab)

## Step 1.4: Crash Characteristics

### Test: Run 5 times to assess reproducibility

**Test procedure:**
```bash
for i in {1..5}; do
  echo "Run $i:"
  timeout 30 cargo test --test test_pure_std_repro test_concurrent_string_and_vec_growth --release 2>&1 | grep -E "PASS|SIGSEGV|signal|test result"
done
```

**Results:**
- **Crash rate**: 5/5 (100% reproducible!)
- **Time to crash**: 2-3 seconds (highly consistent)
- **Signal**: Always SIGSEGV (signal 11)
- **Threads**: Always starts 3 threads (0, 1, 2)
- **Crash location**: Early in concurrent execution phase
- **Consistency**: Extremely high - identical behavior every run

**Assessment:**
✅ **Highly deterministic crash** - This is ideal for systematic investigation. The 100% reproducibility means we can reliably test hypotheses and observe if changes prevent the crash.

---

## Summary of Observations

### Most Significant Finding

**🔴 CRITICAL: Ancient kernel (Linux 4.4.0 from 2016) running modern glibc (2.39 from 2024)**

This represents an ~8 year version gap. glibc 2.39 was released in 2024 and likely uses modern Linux kernel features, syscalls, or behaviors that may not have existed or were different in Linux 4.4.0.

The crash occurs in `sysmalloc()` which performs low-level memory management syscalls (mmap, brk). These syscalls may behave differently or have bugs when a modern userspace library interacts with an ancient kernel.

### Secondary Suspects

1. **gVisor/runsc sandbox**: Intercepts syscalls and may have bugs in memory management emulation
2. **No swap with overcommit=0**: Forces specific malloc behavior paths
3. **Container namespace isolation**: May affect shared memory primitives

### Next Steps

Proceed to **Phase 2: HYPOTHESIZE** to generate testable explanations for these observations.
