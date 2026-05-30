# Horizon VM — Hypervisor Interface

**Version**: 0.1.0

## 1. Overview

The **Horizon Hypervisor** runs at Ring 0 and manages all VM partitions within a browser context. It is the only code that directly interfaces with the browser host environment (JavaScript APIs, IndexedDB, WebSocket, canvas, etc.).

Kernels at Ring 1 access hypervisor services via `HYPERCALL`. User code at Ring 2 cannot call hypercalls directly.

## 2. Partition Model

A **partition** is an isolated execution environment containing:

- Its own virtual address space (32-bit)
- Its own ring 1/2 stacks
- Its own interrupt vector table
- Its own page table
- An optional VFS mount

Multiple partitions can run concurrently within one browser context, scheduled by the hypervisor.

### Partition States

```
CREATED → READY → RUNNING → BLOCKED → READY
                          ↘ TERMINATED
```

## 3. Hypercall Interface

Hypercall arguments are passed on the Ring 1 operand stack before `HYPERCALL num`. Return values are pushed after `HYPERET`.

### 3.1 Memory Management

#### `HYPERCALL HCALL_MEM_ALLOC` (`0x0001`)

Allocate physical pages.

Stack before: `(num_pages --)`
Stack after: `(phys_addr)` (`0` = out of memory)

#### `HYPERCALL HCALL_MEM_FREE` (`0x0002`)

Free physical pages previously allocated.

Stack before: `(phys_addr num_pages --)`
Stack after: `(result)`

#### `HYPERCALL HCALL_MEM_SHARE` (`0x0003`)

Grant another partition access to a physical page.

Stack before: `(target_pid phys_addr flags --)`
Stack after: `(grant_id)` (`< 0` = error)

#### `HYPERCALL HCALL_MEM_UNSHARE` (`0x0004`)

Revoke a previously granted memory share.

Stack before: `(grant_id --)`
Stack after: `(result)`

### 3.2 Partition Management

#### `HYPERCALL HCALL_PART_CREATE` (`0x0010`)

Create a new partition.

Stack before: `(config_ptr --)`
Stack after: `(pid)` (partition ID, `< 0` = error)

`config` block (64 bytes):

| Offset | Type | Field |
|--------|------|-------|
| 0 | `u32` | `mem_pages` — initial physical pages to allocate |
| 4 | `u32` | `flags` — see below |
| 8 | `ptr` | `entry_point` — initial PC in the new partition |
| 12 | `ptr` | `stack_top` — initial SP |
| 16 | `u32` | `priority` — scheduling priority (0=lowest) |
| 20 | `u44` | reserved |

Config flags:

| Bit | Name | Description |
|-----|------|-------------|
| 0 | `ALLOW_VFS` | Partition may use VFS hypercalls |
| 1 | `ALLOW_NETWORK` | Partition may use network hypercalls |
| 2 | `ALLOW_DISPLAY` | Partition may use display hypercalls |
| 3 | `INHERIT_VFS` | Mount the same VFS as the creating partition |

#### `HYPERCALL HCALL_PART_DESTROY` (`0x0011`)

Terminate a partition and free its resources.

Stack before: `(pid --)`
Stack after: `(result)`

#### `HYPERCALL HCALL_PART_YIELD` (`0x0012`)

Yield the current time slice to another partition.

Stack before: `(--)`
Stack after: `(--)`

#### `HYPERCALL HCALL_PART_SLEEP` (`0x0013`)

Block the current partition for at least N milliseconds.

Stack before: `(ms --)`
Stack after: `(--)`

#### `HYPERCALL HCALL_PART_SELF` (`0x0014`)

Get the current partition's ID.

Stack before: `(--)`
Stack after: `(pid)`

### 3.3 Syscall Table

#### `HYPERCALL HCALL_SET_SYSCALL_TABLE` (`0x0020`)

Register the kernel's syscall dispatch table for the current partition. Called once during kernel initialization.

Stack before: `(table_ptr num_entries --)`
Stack after: `(result)`

The table is an array of `ptr` values. `SYSCALL num` jumps to `table[num]`.

### 3.4 Storage (VFS Backend)

#### `HYPERCALL HCALL_STORAGE_OPEN` (`0x0030`)

Stack before: `(path_ptr flags mode --)`
Stack after: `(handle)` (`< 0` = error)

#### `HYPERCALL HCALL_STORAGE_READ` (`0x0031`)

Stack before: `(handle buf_ptr len offset --)`
Stack after: `(bytes_read)`

#### `HYPERCALL HCALL_STORAGE_WRITE` (`0x0032`)

Stack before: `(handle buf_ptr len offset --)`
Stack after: `(bytes_written)`

#### `HYPERCALL HCALL_STORAGE_CLOSE` (`0x0033`)

Stack before: `(handle --)`
Stack after: `(result)`

#### `HYPERCALL HCALL_STORAGE_STAT` (`0x0034`)

Stack before: `(path_ptr stat_buf_ptr --)`
Stack after: `(result)`

#### `HYPERCALL HCALL_STORAGE_READDIR` (`0x0035`)

Stack before: `(handle buf_ptr len --)`
Stack after: `(result)`

#### `HYPERCALL HCALL_STORAGE_MKDIR` (`0x0036`)

Stack before: `(path_ptr mode --)`
Stack after: `(result)`

#### `HYPERCALL HCALL_STORAGE_UNLINK` (`0x0037`)

Stack before: `(path_ptr --)`
Stack after: `(result)`

### 3.5 Display

#### `HYPERCALL HCALL_DISPLAY_GETFB` (`0x0040`)

Map the framebuffer into the partition's address space.

Stack before: `(virt_addr --)`
Stack after: `(width height stride format)` (`width=0` if display not available)

`format`: `0` = RGBA8888, `1` = BGR888

#### `HYPERCALL HCALL_DISPLAY_FLUSH` (`0x0041`)

Flush a region of the framebuffer to the browser canvas.

Stack before: `(x y w h --)`
Stack after: `(--)`

### 3.6 Inter-Partition Messaging

#### `HYPERCALL HCALL_MSG_SEND` (`0x0050`)

Send a message to another partition.

Stack before: `(target_pid buf_ptr len --)`
Stack after: `(result)`

#### `HYPERCALL HCALL_MSG_RECV` (`0x0051`)

Receive a pending message (blocks until available).

Stack before: `(buf_ptr max_len --)`
Stack after: `(sender_pid bytes_received)`

## 4. Scheduling

The hypervisor uses **cooperative + preemptive** scheduling. Partitions should yield voluntarily via `HCALL_PART_YIELD`, but the hypervisor may preempt a partition that has consumed its time slice (default: 10ms). Preemption is implemented via the browser's `setTimeout` mechanism in the reference implementation.
