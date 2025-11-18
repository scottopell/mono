# Comparative Evidence Table

| Environment | Arch | OS | glibc | Sandbox | Test Runner | Result |
|-------------|------|----|----|---------|-------------|--------|
| **THIS ENV (gVisor)** | **x86_64** | **Ubuntu 24.04** | **2.39** | **gVisor/runsc** | **cargo test** | **CRASH** |
| Remote homelab | x86_64 | Ubuntu 22.04 | 2.35 | None | cargo test | PASS |
| Remote homelab | x86_64 | Ubuntu 22.04 | 2.35 | None | cargo nextest | PASS |
| Docker ARM64 | aarch64 | Ubuntu 24.04 | 2.39 | Docker (standard) | cargo test | PASS |
| Docker x86_64 (emulated) | x86_64 | Ubuntu 24.04 | 2.39 | Docker (standard) | cargo test | PASS |

## Key Differences

**UNIQUE to crashing environment:**
1. ✅ **gVisor/runsc sandbox** - User-space kernel that intercepts syscalls
2. ✅ **Kernel 4.4.0** - Very old kernel version (gVisor compatibility layer)
3. ✅ **Namespace isolation** - Separate IPC, MNT, PID, USER, UTS namespaces

**Shared with working environments:**
- glibc 2.39: Also works in Docker x86_64 (emulated) ✓
- Ubuntu 24.04: Also works in Docker ARM64 ✓
- cargo test: Works everywhere else ✓
- x86_64 arch: Works in homelab and Docker ✓

**HYPOTHESIS EMERGING:** gVisor's syscall interception may have a bug or incompatibility with glibc 2.39's malloc implementation, specifically in the sysmalloc() path.
