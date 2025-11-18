# Phase 5: Deeper Investigation - Understanding the Mechanism

## Current State

**What we know:**
- MALLOC_ARENA_MAX >= 3 crashes
- MALLOC_ARENA_MAX <= 2 works
- Environment: kernel 4.4.0 + gVisor + glibc 2.39

**What we DON'T know:**
- WHY does arena count matter?
- What's different about 3+ arenas vs 2?
- What specific operation fails?
- Is it memory limits? Address space? Syscall behavior?

## New Hypotheses (Mechanism-Focused)

### Hypothesis M1: Virtual Address Space Exhaustion

**Claim:** With 3+ arenas, the combined memory mappings exceed available virtual address space in the gVisor/kernel 4.4.0 environment.

**Mechanism:**
- Each arena may request large virtual address space via mmap
- 3 threads × ~14MB allocations × arena overhead = significant virtual memory
- gVisor or kernel 4.4.0 may have lower virtual memory limits
- mmap fails, returning NULL, malloc dereferences NULL → SIGSEGV

**Test:** Check /proc/self/maps before crash, compare arena counts

---

### Hypothesis M2: Memory Mapping Count Limit (vm.max_map_count)

**Claim:** Multiple arenas create many separate memory mappings, hitting a system limit.

**Evidence from fingerprint:**
- vm.max_map_count = 2147483647 (seems unlimited, but may be gVisor limit)

**Mechanism:**
- Each arena creates multiple heap segments via mmap
- Kernel or gVisor tracks each mapping
- Hitting internal limit causes mmap failure

**Test:** Count actual mappings in /proc/self/maps with different arena counts

---

### Hypothesis M3: Stack Space Exhaustion

**Claim:** Each arena requires stack space for management structures, 3+ arenas exhaust stack.

**Evidence from fingerprint:**
- Stack size limit: 8192 kbytes (8MB)
- 3 threads × 8MB stack = 24MB minimum

**Mechanism:**
- Arena metadata stored on stack or in thread-local storage
- 3+ arenas push stack usage over limit
- Stack overflow in malloc code → SIGSEGV

**Test:** Increase stack size with ulimit -s unlimited

---

### Hypothesis M4: gVisor Syscall Tracking Limit

**Claim:** gVisor has internal limits on concurrent or pending syscalls that are hit with 3+ arenas.

**Mechanism:**
- gVisor tracks syscall state in userspace
- Multiple concurrent mmap/brk from 3 arenas overwhelm tracking
- Syscall returns error or corrupted state
- malloc proceeds with bad pointer → SIGSEGV

**Test:** strace to see if syscalls are failing with -EINVAL, -ENOMEM, etc.

---

### Hypothesis M5: Arena Heap Chunk Size × Count Exceeds Limit

**Claim:** The default heap size per arena, when multiplied by 3+ arenas, exceeds a memory limit.

**Mechanism:**
- glibc allocates large initial heap per arena (HEAP_MAX_SIZE)
- 3 arenas × default heap size = exceeds cgroup or gVisor limit
- Even though cgroup shows "unlimited", may have internal constraint

**Test:** Check actual committed memory vs limits during crash

---

## Test Plan

### Test M1: Memory Map Analysis

**Procedure:**
```bash
# Capture memory maps with ARENA_MAX=2 (works)
MALLOC_ARENA_MAX=2 /path/to/test &
PID=$!
sleep 5
cat /proc/$PID/maps > maps_arena2.txt
wc -l maps_arena2.txt

# Try with ARENA_MAX=3 (crashes) - capture before crash
MALLOC_ARENA_MAX=3 /path/to/test &
PID=$!
sleep 1  # Capture early before crash
cat /proc/$PID/maps > maps_arena3.txt 2>/dev/null || echo "Process already crashed"
```

**Analysis:**
- Count number of mappings
- Check for failed mappings or address space gaps
- Look for pattern differences

---

### Test M2: strace Syscall Capture

**Procedure:**
```bash
# Trace syscalls with ARENA_MAX=3 to see failure
strace -f -e trace=mmap,munmap,brk,mprotect -o strace_arena3.log \
  sh -c 'MALLOC_ARENA_MAX=3 cargo test --test test_pure_std_repro --release'

# Compare with working case
strace -f -e trace=mmap,munmap,brk,mprotect -o strace_arena2.log \
  sh -c 'MALLOC_ARENA_MAX=2 cargo test --test test_pure_std_repro --release'

# Analyze differences
grep -i "= -1\|= 0x0\|ENOMEM\|EINVAL" strace_arena3.log
```

**Look for:**
- Failed mmap calls (returning -1 or NULL)
- Error codes (ENOMEM, EINVAL, EOVERFLOW)
- Last successful syscall before crash
- Address patterns

---

### Test M3: Increase Stack Size

**Procedure:**
```bash
# Test if stack limit is the issue
ulimit -s unlimited
MALLOC_ARENA_MAX=3 cargo test --test test_pure_std_repro --release

# Or try larger stack
ulimit -s 16384  # Double current 8MB
MALLOC_ARENA_MAX=3 cargo test --test test_pure_std_repro --release
```

**Expected:**
- If M3 TRUE: Crash prevented with unlimited stack
- If M3 FALSE: Still crashes

---

### Test M4: Smaller Per-Thread Allocations

**Claim:** Maybe it's total memory, not arena count

**Procedure:**
Create test with 3 threads but only 1MB each:
```rust
let target_size = 1_048_576; // 1MB instead of 14MB
```

**Expected:**
- If crashes: Arena count is the trigger regardless of allocation size
- If works: Total memory is the real constraint

---

### Test M5: Check Actual Memory Usage

**Procedure:**
```bash
# Monitor memory during test
while true; do
  cat /proc/$PID/status | grep -E "VmPeak|VmSize|VmRSS|VmData|Threads"
  sleep 0.1
done &

MALLOC_ARENA_MAX=3 cargo test --test test_pure_std_repro --release
```

**Look for:**
- VmSize approaching any limit
- VmData growth pattern
- Memory usage at crash point

---

## Priority Order

1. **Test M2 (strace)** - Most direct way to see what syscall fails
2. **Test M1 (memory maps)** - Visual inspection of address space
3. **Test M4 (smaller allocations)** - Disambiguate arena count vs total memory
4. **Test M3 (stack size)** - Easy to test
5. **Test M5 (memory monitoring)** - Background data collection

Let's execute these tests to understand the mechanism.
