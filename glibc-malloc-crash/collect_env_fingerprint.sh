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
