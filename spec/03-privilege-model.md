# Horizon VM — Privilege Model

**Version**: 0.1.0

## 1. Privilege Levels (Rings)

The Horizon VM defines three privilege levels, called **rings**:

| Level | Name | Purpose |
|-------|------|---------|
| Ring 0 | Hypervisor | Manages partitions, physical memory, and the I/O bridge |
| Ring 1 | Kernel | OS kernel within a partition; manages processes and syscalls |
| Ring 2 | User | Application code; most restricted |

The current ring is stored in the `RING` implicit register. Software cannot write to `RING` directly — it is changed only via privilege transition instructions (`SYSCALL`, `SYSRET`, `HYPERCALL`, `HYPERET`, `INT`, `IRET`).

## 2. Privilege Transitions

### 2.1 User → Kernel: `SYSCALL num`

Raises privilege from Ring 2 to Ring 1.

On execution:
1. `RING` is set to 1
2. The stack switches to the Ring 1 stack
3. The return `PC` and caller `RING` are pushed onto the Ring 1 stack
4. Execution continues at the kernel's syscall dispatch table entry for `num`

The kernel's syscall table base address is configured via `HYPERCALL HCALL_SET_SYSCALL_TABLE` during partition initialization.

### 2.2 Kernel → User: `SYSRET`

Lowers privilege from Ring 1 to Ring 2.

On execution:
1. The return `PC` and `RING` are popped from the Ring 1 stack
2. `RING` is set to 2
3. The stack switches back to the Ring 2 stack
4. Execution resumes at the saved `PC`

### 2.3 Kernel → Hypervisor: `HYPERCALL num`

Raises privilege from Ring 1 to Ring 0.

Identical in structure to `SYSCALL`, but transitions Ring 1 → Ring 0.

The hypervisor's hypercall dispatch table is fixed and defined in `06-hypervisor.md`.

### 2.4 Hypervisor → Kernel: `HYPERET`

Lowers privilege from Ring 0 to Ring 1. Mirrors `SYSRET`.

### 2.5 Interrupt Dispatch: `INT vec` / `IRET`

`INT vec` raises a software interrupt. Hardware (I/O bridge) interrupts use the same mechanism. On interrupt:

1. The current `PC`, `RING`, and `FLAGS` are pushed to the ring-appropriate stack
2. `RING` is set to the ring of the interrupt handler (Ring 0 for hypervisor vectors, Ring 1 for kernel vectors)
3. Execution transfers to the handler at `IVT[vec]`

`IRET` restores `PC`, `RING`, and `FLAGS` from the stack.

## 3. Interrupt Vector Table

The IVT is a 256-entry table of `ptr` values (4 bytes each, 1 KiB total). Address set via `IVT.SET` (Ring 0 only).

### Reserved Vectors

| Vector | Name | Triggered by |
|--------|------|-------------|
| `0x00` | Divide-by-zero | `I32.DIV_S` / `I64.DIV_S` with divisor 0 |
| `0x01` | Debug | Single-step trap |
| `0x02` | BRK | `BRK` instruction |
| `0x0C` | Stack Fault | Stack overflow/underflow |
| `0x0D` | General Protection Fault | Privilege violation, bad instruction |
| `0x0E` | Page Fault | Unmapped or permission-denied page access |
| `0x10`–`0xFF` | User-defined | Available for OS/hypervisor use |

## 4. Privilege Enforcement

Any instruction marked with a minimum ring requirement in the ISA that is executed at a lower privilege raises `GPF (0x0D)` immediately, before the instruction takes effect.

This check is unconditional and cannot be disabled.

## 5. Partition Isolation

Ring 0 code in one partition cannot access physical memory mapped to another partition unless the hypervisor explicitly created a shared mapping. There is no direct inter-partition call mechanism — partitions communicate via shared memory regions or hypervisor-mediated message passing (see `06-hypervisor.md`).
