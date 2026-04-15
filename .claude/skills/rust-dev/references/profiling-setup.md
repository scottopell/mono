# Profiling Setup

Platform-specific installation and configuration for Rust profiling tools.

## Table of Contents

- [macOS arm64 Setup](#macos-arm64-setup)
- [Linux Setup](#linux-setup)
- [Lima VM Setup](#lima-vm-setup)
- [Instruments (macOS)](#instruments-macos)

---

## macOS arm64 Setup

### samply

```bash
cargo install samply
```

No SIP changes, no sudo, no DTrace. samply uses macOS private perf APIs via
`task_for_pid`. It works out of the box on Apple Silicon.

First run may trigger a Gatekeeper prompt -- allow it.

### Why not DTrace / cargo flamegraph on macOS arm64?

DTrace does not work for userspace profiling on Apple Silicon. This is an
architectural limitation, not a SIP issue -- `csrutil enable --without dtrace`
does not fix it. `cargo flamegraph` uses DTrace as its macOS backend, so it
produces empty or garbage output on arm64 macOS. Do not use it there.

### Instruments

Instruments ships with Xcode. No separate install needed.

```bash
# Check it's available
xcrun xctrace list templates
```

### dhat crate

No special setup. Add as a dev-dependency:

```bash
cargo add --dev dhat --features dhat-heap
```

Or manually in Cargo.toml (see SKILL.md for the feature-gated setup).

---

## Linux Setup

### perf

```bash
# Debian/Ubuntu
sudo apt-get install linux-tools-common linux-tools-$(uname -r)

# Fedora
sudo dnf install perf

# Arch
sudo pacman -S perf
```

### perf sysctl configuration

```bash
# Allow perf for non-root (temporary)
sudo sh -c 'echo 1 > /proc/sys/kernel/perf_event_paranoid'

# Permanent
echo 'kernel.perf_event_paranoid = 1' | sudo tee /etc/sysctl.d/99-perf.conf
sudo sysctl -p /etc/sysctl.d/99-perf.conf

# Allow kernel symbol resolution
sudo sh -c 'echo 0 > /proc/sys/kernel/kptr_restrict'
```

### cargo flamegraph

```bash
cargo install flamegraph

# Uses perf as backend on Linux -- requires perf_event_paranoid <= 1
cargo flamegraph --profile profiling --bin myapp -- args
```

### heaptrack

```bash
# Debian/Ubuntu
sudo apt-get install heaptrack heaptrack-gui

# Run
heaptrack ./target/profiling/myapp args
heaptrack_print heaptrack.myapp.*.zst | head -50
```

### inferno (for manual flamegraph generation from perf data)

```bash
cargo install inferno

# Usage
perf script | inferno-collapse-perf | inferno-flamegraph > flamegraph.svg
```

---

## Lima VM Setup

Lima provides a Linux arm64 guest on macOS via Virtualization.framework. This
gives you full access to perf, heaptrack, and other Linux-only tools while
developing on macOS.

### Create and provision the VM

```bash
# Create VM (8 GiB RAM, 4 CPUs recommended for profiling)
limactl create --name=perf-bench template://default \
  --memory 8 --cpus 4
limactl start perf-bench

# Install Rust inside the VM
limactl shell perf-bench -- bash -c \
  'curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y'

# Install perf
limactl shell perf-bench -- sudo apt-get update
limactl shell perf-bench -- sudo apt-get install -y \
  linux-tools-common linux-tools-$(limactl shell perf-bench -- uname -r) \
  heaptrack build-essential pkg-config

# Configure perf sysctls
limactl shell perf-bench -- sudo sysctl -w kernel.perf_event_paranoid=-1
limactl shell perf-bench -- sudo sysctl -w kernel.kptr_restrict=0
```

### Cross-VM workflow

Your macOS home directory is mounted read-only inside the Lima VM at the same
path. You can build inside the VM using a VM-local target directory to avoid
cross-filesystem issues:

```bash
# Build inside VM with a local target dir
limactl shell perf-bench -- bash -c \
  'cd /Users/you/project && CARGO_TARGET_DIR=/home/cargo-target cargo build --profile profiling'

# Profile inside VM
limactl shell perf-bench -- bash -c \
  'cd /Users/you/project && perf record -g -F 999 /home/cargo-target/profiling/myapp args'

# Copy results back to host
limactl cp perf-bench:/home/cargo-target/perf.data ./perf.data
```

### Lima VM caveats

- **Hardware PMU counters**: Virtualization.framework may not expose hardware
  PMU to the guest. Check `perf list | grep hardware` inside the VM. If empty,
  you get software counters only (cpu-clock, task-clock) -- still useful for
  profiling, but `perf stat -e cycles,instructions` will fail or show zeros.
- **tmpfs loss on restart**: `/tmp` contents are lost when the VM restarts.
  Binaries, fixtures, and perf data stored in `/tmp` need to be re-transferred.
- **Swap**: Lima VMs may not have swap configured. For memory-intensive
  workloads, add swap manually:
  ```bash
  limactl shell perf-bench -- sudo fallocate -l 4G /swapfile
  limactl shell perf-bench -- sudo chmod 600 /swapfile
  limactl shell perf-bench -- sudo mkswap /swapfile
  limactl shell perf-bench -- sudo swapon /swapfile
  ```

---

## Instruments (macOS)

Instruments provides deep system-level profiling on macOS. The most useful
templates for Rust work:

### CPU Profiling (Time Profiler)

```bash
xcrun xctrace record --template "Time Profiler" \
  --launch -- ./target/profiling/myapp args
# Opens in Instruments.app
```

### Heap Profiling (Allocations)

```bash
xcrun xctrace record --template Allocations \
  --launch -- ./target/profiling/myapp args
```

Shows every allocation with call stack, size, and lifetime. More heavyweight
than dhat but integrates with the full Instruments UI.

### Leaks

```bash
xcrun xctrace record --template Leaks \
  --launch -- ./target/profiling/myapp args
```

Less relevant for Rust (ownership prevents most leaks), but useful when
interfacing with C/C++ libraries via FFI.
