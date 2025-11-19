# Investigation Branches Guide

This document tracks different investigation branches and their purposes.

---

## Active Investigations

### FRESH-analyze-geojson-vs-std-allocation-patterns

**Created**: 2025-11-18
**Status**: Ready for sandbox execution
**Objective**: Compare allocation patterns between GeoJSON and pure-std reproduction tests

**Key Question**: Which test has worse allocation pattern characteristics?

**Prompt Location**: `glibc-malloc-crash/PROMPT_GEOJSON_VS_STD_ALLOCATION_PATTERNS.md`

**Context**: Building on PR #14's breakthrough that allocation COUNT (not SIZE) triggers crash

**Expected Outcome**:
- Determine which test has higher allocation count
- Document allocation pattern differences
- Recommend canonical reproducer test

**Transfer to Sandbox**: Copy this branch's prompt to sandbox environment for execution

---

## Completed Investigations (Merged/Analyzed)

### Investigation Path #1-4 (PRs #10-14)
- **Root Cause**: Allocation count × arena overhead > address space limit
- **Key Finding**: ~4M+ allocations/thread triggers crash
- **Workaround**: `MALLOC_ARENA_MAX=2` (100% effective)
- **Analysis**: See `CROSS_PR_SYNTHESIS.md`

---

## Investigation Workflow

1. **Create branch**: `git checkout -b FRESH-<investigation-name>`
2. **Write prompt**: Clear objective, methodology, success criteria
3. **Transfer to sandbox**: Copy prompt to environment where crash reproduces
4. **Execute**: Follow prompt methodology
5. **Document**: Create findings document
6. **Commit**: Push results back to branch
7. **PR**: Create PR with comprehensive description
8. **Analyze**: Cross-reference with other investigations

---

## Prompt Templates

All investigation prompts should include:
- [ ] Clear objective
- [ ] Background context (known facts from prior investigations)
- [ ] Specific questions to answer
- [ ] Methodology (phases/steps)
- [ ] Expected findings/hypotheses
- [ ] Deliverables list
- [ ] Scope boundaries
- [ ] Success criteria
- [ ] Tools & commands reference

---

## Sandbox Environment Requirements

**For crash reproduction:**
- Kernel: Linux 4.4.0
- Runtime: gVisor/runsc
- glibc: 2.39
- Rust: Latest stable

**Cannot repro on:**
- Modern kernels (5.15+)
- Standard Docker
- macOS/Windows
