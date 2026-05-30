# Horizon VM — Memory Model

**Version**: 0.1.0

## 1. Linear Address Space

Each VM partition has its own **32-bit linear address space** (4 GiB). Addresses are unsigned 32-bit integers (`ptr`). The address space is flat and byte-addressable.

```
0x00000000 ┬─────────────────────────────┐
           │  Hypervisor Reserved        │  256 MiB
0x10000000 ├─────────────────────────────┤
           │  Kernel Space               │  256 MiB
0x20000000 ├─────────────────────────────┤
           │  User Space                 │  3.5 GiB
0xFFFFFFFF └─────────────────────────────┘
```

Exact boundaries are configured per-partition by the hypervisor via the partition configuration block. The ranges above are the default layout.

## 2. Page Model

The address space is divided into **4 KiB pages** (4096 bytes, `0x1000`).

Each page has associated protection bits:

| Bit | Name | Description |
|-----|------|-------------|
| 0 | `P` | Present (page is mapped to physical memory) |
| 1 | `R` | Readable |
| 2 | `W` | Writable |
| 3 | `X` | Executable |
| 4 | `U` | User-accessible (Ring 2 can access) |
| 5 | `S` | Shared (visible to multiple partitions via grant) |

A page not marked `P` raises a **Page Fault** (interrupt vector `0x0E`) on access. Accessing a page without `U` from Ring 2 raises a **General Protection Fault** (`0x0D`).

## 3. Physical Memory Allocation

Physical memory is managed by the hypervisor. Partitions request pages via the `HYPERCALL` interface and map them into their virtual address space using `PAGE.MAP`.

A partition cannot reference physical addresses directly from user or kernel code — all access is via the virtual address space.

## 4. Memory Isolation

Partitions are fully isolated. There is no shared memory between partitions unless the hypervisor explicitly creates a **shared memory region** (both partitions map the same physical page with the `S` flag).

## 5. Memory-Mapped I/O (MMIO)

The hypervisor may map special I/O regions into a partition's address space. These behave like normal memory but reads/writes are intercepted and routed to the I/O bridge (see `07-io-model.md`). MMIO regions are always Ring 1 or Ring 0 accessible only.

## 6. Endianness

All multi-byte values in linear memory are **little-endian**. This applies to instruction immediates and to values read/written by memory instructions.

## 7. Alignment

Memory accesses are permitted at any byte alignment. However, aligned accesses (to natural alignment boundaries) are recommended and may be faster in implementations. Unaligned accesses are well-defined and do not trap.

## 8. Stack Memory

Each ring level has a dedicated stack region within the partition's address space:

| Ring | Default Stack Top |
|------|------------------|
| Ring 0 (Hypervisor) | `0x0FFF0000` |
| Ring 1 (Kernel) | `0x1FFF0000` |
| Ring 2 (User) | `0xFFFE0000` |

Stack grows downward. The stack pointer `SP` is initialized to the stack top. Stack overflow (writing below the stack guard page) raises a **Stack Fault** (interrupt vector `0x0C`).
