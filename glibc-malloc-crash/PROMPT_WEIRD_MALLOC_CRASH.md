# Scientific Investigation: glibc malloc SIGSEGV Root Cause Analysis

## Mission

Systematically identify the environmental factors causing a reproducible SIGSEGV in `sysmalloc()` during concurrent Rust std allocation tests. Use rigorous scientific method to narrow the root cause until reaching natural investigation boundaries.

**Out of Scope:** Writing a custom malloc implementation (LD_PRELOAD) - this is the explicit stopping point.

---

## Scientific Method Framework

You are a methodical scientist investigating this crash. Your approach must be rigorous and evidence-based.

**Core Principles:**
- Never guess or assume. State explicitly when information is missing.
- Generate multiple testable hypotheses before reaching conclusions.
- Design specific tests/questions to validate or falsify each hypothesis.
- Request additional data when needed rather than speculating.

**Systematic Process:**
1. **Observe:** Catalog all available facts without interpretation
2. **Hypothesize:** Generate 3-5 distinct, testable explanations for the observations
3. **Test Design:** For each hypothesis, identify:
   - What evidence would support it
   - What evidence would refute it
   - What specific information/tests are needed
4. **Analyze:** Evaluate each hypothesis against available evidence
5. **Iterate:** Identify which hypotheses remain viable, what's been ruled out, and what additional testing is needed
6. **Conclude:** Only draw conclusions supported by evidence, clearly marking confidence levels

**Communication Style:**
- Use precise language: "The evidence suggests..." not "I think..."
- Explicitly state uncertainties and knowledge gaps
- Distinguish between correlation and causation
- Present findings in order of confidence level

---

## Phase 1: OBSERVE - Catalog Known Facts

### Step 1.1: Reproduce the Crash (Establish Baseline)

**Run the reproducer test:**

```bash
cd /path/to/project
RUST_BACKTRACE=full cargo test --test test_pure_std_repro test_concurrent_string_and_vec_growth --release -- --nocapture
```

**Document:**
- Exit code
- Exact error message
- Backtrace (if SIGSEGV occurs)
- Time to crash
- Any warnings or unusual output

**Expected baseline:** SIGSEGV in `sysmalloc()` at `malloc.c:2936`

### Step 1.2: Complete Environmental Fingerprint

**Gather comprehensive system state:**

```bash
#!/bin/bash
echo "=== ENVIRONMENT FINGERPRINT ==="
echo ""

echo "--- System Identity ---"
uname -a
cat /etc/os-release
ldd --version | head -n 1

echo ""
echo "--- Hardware Resources ---"
nproc
free -h | grep Mem
cat /proc/meminfo | grep -E "MemTotal|MemAvailable|SwapTotal|Dirty|Mapped"

echo ""
echo "--- Kernel Parameters (malloc-relevant) ---"
sysctl -a 2>/dev/null | grep -E "vm.overcommit|vm.max_map_count|vm.swappiness|kernel.threads-max|kernel.pid_max"

echo ""
echo "--- glibc malloc Environment ---"
env | grep -E "MALLOC|LD_PRELOAD|GLIBC"

echo ""
echo "--- Process Limits ---"
ulimit -a

echo ""
echo "--- Container/Virtualization Detection ---"
cat /proc/1/cgroup 2>/dev/null | head -n 10
systemd-detect-virt 2>/dev/null || echo "systemd-detect-virt: not available"
echo "Docker: $([ -f /.dockerenv ] && echo YES || echo NO)"
echo "Kubernetes: $([ -d /var/run/secrets/kubernetes.io ] && echo YES || echo NO)"

echo ""
echo "--- Security/Sandbox Mechanisms ---"
cat /proc/self/status | grep -E "Seccomp|CapEff|CapBnd|NoNewPrivs"
cat /proc/sys/kernel/seccomp 2>/dev/null || echo "seccomp: status unknown"
cat /proc/sys/kernel/yama/ptrace_scope 2>/dev/null || echo "ptrace_scope: unknown"
aa-status 2>/dev/null | head -n 15 || echo "AppArmor: not detected"
getenforce 2>/dev/null || echo "SELinux: not detected"

echo ""
echo "--- cgroup Constraints ---"
echo "Memory cgroup:"
cat /sys/fs/cgroup/memory/memory.limit_in_bytes 2>/dev/null || \
  cat /sys/fs/cgroup/memory.max 2>/dev/null || \
  echo "No memory cgroup limit detected"

cat /proc/self/cgroup | head -n 10

echo ""
echo "--- Rust Toolchain ---"
rustc --version
cargo --version
which cargo

echo ""
echo "--- Process Namespace Info ---"
ls -la /proc/self/ns/ 2>/dev/null || echo "Cannot read namespaces"

echo ""
echo "=== END FINGERPRINT ==="
```

**Save complete output as `environment_fingerprint.txt`**

### Step 1.3: Document Comparative Evidence

**Known data points from previous testing:**

| Environment | Arch | OS | glibc | Test Runner | Result |
|-------------|------|----|----|-------------|--------|
| **THIS ENV** | **?** | **?** | **?** | **?** | **CRASH** |
| Remote homelab | x86_64 | Ubuntu 22.04 | 2.35 | cargo test | PASS |
| Remote homelab | x86_64 | Ubuntu 22.04 | 2.35 | cargo nextest | PASS |
| Docker ARM64 | aarch64 | Ubuntu 24.04 | 2.39 | cargo test | PASS |
| Docker x86_64 (emulated) | x86_64 | Ubuntu 24.04 | 2.39 | cargo test | PASS |

**Fill in the "THIS ENV" row with actual values from Step 1.2**

### Step 1.4: Crash Characteristics

**Document crash properties:**

```bash
# Run test 5 times, record outcomes
for i in {1..5}; do
  echo "Run $i:"
  timeout 30 cargo test --test test_pure_std_repro test_concurrent_string_and_vec_growth --release 2>&1 | grep -E "PASS|SIGSEGV|signal|test result"
done
```

**Questions to answer:**
- Crash rate: 5/5? 4/5? Variable?
- Time to crash: Consistent or variable?
- Always same test? Or random?
- Always same thread? (check backtraces)

---

## Phase 2: HYPOTHESIZE - Generate Testable Explanations

**Based on observations from Phase 1, generate AT LEAST 5 distinct hypotheses.**

Use this template for each:

```markdown
### Hypothesis H[N]: [Concise Name]

**Claim:** [Specific, testable statement about causation]

**Supporting Evidence:**
- [Why this might be true based on observations]
- [Any correlations noticed]

**Contradicting Evidence:**
- [What argues against this]
- [Any inconsistencies]

**Prediction:**
- If TRUE: [Observable outcome from specific test]
- If FALSE: [Observable outcome from specific test]

**Falsification Criteria:**
- [Specific result that would disprove this hypothesis]

**Confidence Level:** [Low | Medium | High] based on current evidence
```

### Suggested Hypothesis Categories

**Category A: glibc malloc Tuning**
- H-A1: MALLOC_ARENA_MAX unset causes arena contention race
- H-A2: Specific arena count (2, 4, 8) triggers bug
- H-A3: Memory allocation size threshold (14MB) critical

**Category B: Kernel/Memory Management**
- H-B1: Specific kernel version has vm subsystem bug
- H-B2: vm.overcommit_memory setting triggers different malloc path
- H-B3: cgroup memory limits force sysmalloc() path with bug

**Category C: Security/Sandboxing**
- H-C1: seccomp-bpf filter interferes with mmap/brk syscalls
- H-C2: AppArmor/SELinux profile blocks malloc syscalls
- H-C3: Namespace isolation corrupts shared memory state
- H-C4: ASLR (Address Space Layout Randomization) interaction

**Category D: Test/Process Model**
- H-D1: cargo nextest process isolation model required
- H-D2: Specific thread count (3) triggers race window
- H-D3: Test execution order matters (state from previous test)

**Category E: glibc Version/Build**
- H-E1: Bug specific to glibc 2.39 (not 2.35)
- H-E2: Ubuntu-specific glibc patches introduce bug
- H-E3: glibc built with specific compiler flags

**Category F: Hardware/Architecture**
- H-F1: x86_64-specific assembly in malloc
- H-F2: CPU cache behavior with specific model
- H-F3: NUMA (Non-Uniform Memory Access) configuration

---

## Phase 3: TEST DESIGN - Plan Experiments

For your top 5 hypotheses (prioritize by confidence and ease of testing), design specific tests:

### Test Design Template

```markdown
## Test T[N]: [Hypothesis Being Tested]

**Hypothesis:** H-[X]

**Test Procedure:**
```bash
# Exact commands to run
[command 1]
[command 2]
```

**Expected Outcomes:**
- If hypothesis TRUE: [Specific observable result]
- If hypothesis FALSE: [Different specific result]

**Success Criteria:**
- [Quantifiable metric showing support/rejection]

**Controls:**
- Baseline: [What to compare against]
- Variables changed: [Only these, nothing else]

**Data to Collect:**
- [ ] Exit code
- [ ] Stderr/stdout
- [ ] Backtrace if crash
- [ ] Time to completion/crash
- [ ] System state changes (via dmesg, etc.)
```

### Suggested Test Priority Order

1. **Test T-A1:** MALLOC_ARENA_MAX=1 (easiest, high impact)
2. **Test T-C1:** Check seccomp mode (read-only, fast)
3. **Test T-B3:** Check cgroup memory limits (read-only, fast)
4. **Test T-D2:** Thread count variation (easy to modify)
5. **Test T-E1:** Confirm glibc version (read-only)

---

## Phase 4: ANALYZE - Execute Tests & Evaluate Evidence

For each test executed, document using this format:

```markdown
## Test Execution: T[N]

**Date/Time:** [timestamp]

**Commands Run:**
```bash
[exact commands with output]
```

**Observed Result:**
[What actually happened]

**Outcome Classification:**
- [ ] CRASH (SIGSEGV occurred)
- [ ] PASS (test completed successfully)
- [ ] ERROR (test failed for other reason)
- [ ] INCONCLUSIVE (ambiguous result)

**Analysis:**

**Matches Prediction:**
- [ ] YES - Hypothesis supported
- [ ] NO - Hypothesis contradicted
- [ ] PARTIAL - Mixed evidence

**Evidence Quality:**
- Reproducibility: [5/5 runs | 3/5 runs | etc.]
- Clarity: [Clear signal | Noisy | Ambiguous]
- Consistency: [Matches other evidence | Contradicts other evidence]

**Confidence Change:**
- Hypothesis H-[X]: [Previous confidence] → [New confidence]
- Reasoning: [Why confidence changed]

**New Questions Raised:**
- [What new unknowns emerged?]
- [What should be tested next?]

**Next Action:**
- [ ] Test deeper variant of this hypothesis
- [ ] Move to next hypothesis
- [ ] Hypothesis ruled out, archive
- [ ] Hypothesis confirmed, design validation test
```

---

## Phase 5: ITERATE - Refine Hypotheses

After each test cycle:

### 5.1 Update Hypothesis Confidence Table

| Hypothesis | Initial Confidence | Evidence For | Evidence Against | Current Confidence | Status |
|------------|-------------------|--------------|------------------|-------------------|--------|
| H-A1 | Medium | [list] | [list] | High | Active |
| H-B1 | Low | [list] | [list] | Ruled Out | Archived |
| ... | ... | ... | ... | ... | ... |

### 5.2 Identify Convergent Evidence

**Look for patterns:**
- Do multiple tests point to same root cause?
- Are there unexpected correlations?
- What factors appear in multiple hypothesis paths?

**Document synthesis:**
```markdown
## Evidence Synthesis [Iteration N]

**Strongest Signals:**
1. [Factor X] appears in H-A1, H-C2, T-3 results
2. [Factor Y] consistently correlates with crashes

**Ruled Out:**
- [Factor Z] - tested in T-1, T-4, no correlation

**Remaining Unknowns:**
- [What critical info is still missing?]
- [What assumptions are still untested?]

**Next Cycle Focus:**
- [Which hypothesis to prioritize next]
- [Why this is the logical next step]
```

### 5.3 Design Next Generation Tests

Based on synthesis, design refined tests that:
- Test combinations (if multi-factor interaction suspected)
- Test boundary conditions (if thresholds suspected)
- Test negative cases (prove factor is necessary)

---

## Phase 6: CONCLUDE - Synthesize Findings

### Stopping Criteria (Stop When ANY is Met)

#### Success Criteria:

✅ **Root Cause Identified**
- Single factor change prevents crash (100% reproducible)
- Mechanism understood and documented
- Falsification attempts failed (robust finding)

✅ **Multi-Factor Interaction Mapped**
- Specific combination of factors required (A AND B AND C)
- All factors identified with confidence >80%
- Interaction mechanism documented

#### Natural Boundaries:

🛑 **Source Code Analysis Required**
- Need to read glibc malloc.c implementation at line 2936
- Need to read kernel mm/ subsystem source
- Environmental testing exhausted, requires code inspection

🛑 **Custom malloc Implementation Required**
- Only remaining test is LD_PRELOAD custom malloc
- This is OUT OF SCOPE (explicit stopping point)

🛑 **Privileged Access Required**
- Need root to disable seccomp/AppArmor/modify cgroups
- Cannot obtain necessary permissions in this environment
- Hypothesis cannot be tested without privilege escalation

🛑 **Heisenbug - Observation Affects Outcome**
- Crash rate <30% or highly variable
- Adding instrumentation changes behavior
- Race condition too sensitive for practical testing

#### Resource Limits:

⏱️ **Diminishing Returns**
- 15+ hypotheses tested
- No hypothesis confidence >60%
- No new evidence from last 5 tests
- Further testing unlikely to converge

---

## Final Deliverable Format

```markdown
# SIGSEGV Root Cause Analysis - Final Report

## Executive Summary

**Crash Location:** [exact function/line]
**Root Cause:** [if identified] OR **Status:** [boundary reached]
**Confidence:** [0-100%]

## Environment Fingerprint

[Full output from Phase 1.2]

## Investigation Summary

**Hypotheses Generated:** [N]
**Tests Executed:** [N]
**Hypotheses Ruled Out:** [N]
**Hypotheses Supported:** [N]

## Evidence Hierarchy (by confidence)

### Tier 1: High Confidence (>80%)
[Findings with strong, reproducible evidence]

### Tier 2: Medium Confidence (50-80%)
[Findings with suggestive but not conclusive evidence]

### Tier 3: Low Confidence (<50%)
[Weak correlations, insufficient testing]

## Critical Factors Identified

**Factor 1: [Name]**
- Evidence: [What tests support this]
- Mechanism: [How it contributes to crash]
- Confidence: [%]

**Factor 2: [Name]**
- Evidence: [What tests support this]
- Mechanism: [How it contributes to crash]
- Confidence: [%]

[Continue for all identified factors]

## Minimal Reproducer

```bash
#!/bin/bash
# Minimal reproducer based on investigation findings
#
# Crashes when: [specific conditions identified]
# Prevents crash when: [specific change identified]

[exact script to reproduce crash]
```

## Comparative Analysis

| Environmental Factor | Crash Environment | Working Environment | Correlation |
|---------------------|------------------|--------------------|-----------  |
| [Factor 1] | [value] | [value] | [Strong/Weak/None] |
| [Factor 2] | [value] | [value] | [Strong/Weak/None] |
| ... | ... | ... | ... |

## Recommended Actions

**If root cause identified:**
1. [Specific fix or workaround]
2. [Upstream bug report to X project]
3. [Documentation updates needed]

**If boundary reached:**
1. [What would be needed to proceed]
2. [Alternative investigation approaches]
3. [Workarounds available now]

## Knowledge Gaps

**Unanswered Questions:**
- [What remains unknown]
- [What couldn't be tested]
- [What requires expertise beyond scope]

**Future Investigation:**
- [What should be done if this is pursued further]
- [What resources would be needed]

## Appendices

### Appendix A: Full Test Log
[Detailed logs of all tests executed]

### Appendix B: Hypothesis Archive
[All hypotheses considered, including rejected ones]

### Appendix C: Environmental Data
[Complete dumps of system state]

---

**Investigation Completed:** [Date]
**Total Time Invested:** [Hours]
**Outcome:** [Root Cause Identified | Boundary Reached | Inconclusive]
```

---

## Investigation Principles (Always Follow)

### Scientific Rigor

1. **Single Variable Testing**
   - Change ONE thing at a time
   - Document exact change
   - Revert before next test

2. **Reproducibility**
   - Run each test 3-5 times minimum
   - Document variance
   - Don't trust single data points

3. **Documentation**
   - Every command executed
   - Every output observed
   - Every decision made and why

4. **Skepticism**
   - Question your assumptions
   - Test negative cases
   - Look for disconfirming evidence

5. **Objectivity**
   - Follow data, not intuition
   - Report inconvenient findings
   - Don't force conclusions

### Red Flags (Violation of Scientific Method)

🚩 **Jumping to conclusions** - Testing only favorite hypothesis
🚩 **Cherry-picking data** - Ignoring contradictory evidence
🚩 **Changing multiple variables** - Cannot determine causation
🚩 **Vague predictions** - "Might affect something"
🚩 **Undocumented tests** - Can't reproduce or verify
🚩 **Continuing past boundaries** - Diminishing returns ignored

### When Stuck

**If no progress after 10 tests:**
1. Re-examine observations (Phase 1) - did you miss something?
2. Generate radically different hypotheses - think outside current frame
3. Consult comparative evidence - what's DIFFERENT about this env?
4. Ask for help - what expertise is missing?
5. Consider stopping - maybe boundary has been reached

---

## Begin Investigation

**Start with Phase 1: OBSERVE**

Execute the environmental fingerprint script, reproduce the crash, document everything. Do not proceed to Phase 2 until observations are complete and documented.

Remember: The goal is **understanding**, not necessarily **fixing**. A well-documented boundary ("requires custom malloc to proceed") is a successful outcome.

The truth is in the data. Follow the evidence wherever it leads.

**Good luck, scientist.**
