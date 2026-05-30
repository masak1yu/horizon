# Horizon VM — Overview

**Status**: Draft (pre-W3C submission)
**Version**: 0.1.0

## Abstract

Horizon VM defines a virtual machine architecture designed to run natively inside web browsers. Unlike WebAssembly, which targets the execution of individual compute modules, Horizon VM positions the web browser as a full computing **platform**: capable of hosting operating system kernels, hypervisors, isolated guest partitions, and user-facing applications — all within a single browser tab or origin.

The specification covers:

- A stack-based bytecode instruction set with first-class privilege levels
- A linear, page-protected memory model
- A hypervisor interface enabling multiple isolated VM partitions
- A virtual filesystem (VFS) layer backed by browser storage APIs
- A browser I/O bridge for display, input, and network

## Motivation

Web browsers today have a single, hard constraint: **the only language that runs natively is JavaScript**. Every other language must be transpiled to JavaScript or compiled to WebAssembly — a compute sandbox, not a platform. Neither path gives non-JavaScript runtimes the OS-level services they depend on: process isolation, privilege separation, persistent storage, or a stable ABI.

Horizon VM removes this constraint. Any language whose runtime or interpreter can be compiled to Horizon VM bytecode runs natively in the browser. A Ruby interpreter compiled to `.hzbc` can execute Ruby scripts from an HTML page. A Python runtime, a Lua VM, a compiled Rust binary — all become first-class browser citizens without JavaScript being in the execution path.

Horizon VM proposes a standardized substrate that allows:

- **Language implementors** to target the browser by compiling their runtime to `.hzbc`
- **OS developers** to port or write kernels targeting the browser platform
- **Platform operators** to run multiple isolated workloads (partitions) in a single browser context
- **Application developers** to target a stable, well-specified bytecode ABI independent of any host language

## Non-Goals

- Horizon VM is **not** a replacement for, nor a layer on top of, WebAssembly
- Horizon VM is **not** a JavaScript sandbox
- Horizon VM is **not** intended for compute acceleration (that is WASM's domain)

## Relationship to Existing Standards

| Standard | Role |
|---|---|
| WebAssembly | Compute acceleration; not a platform |
| Service Workers | Background fetch/cache; no general execution |
| WebContainers | Node.js compat layer; JS-specific |
| Horizon VM | General-purpose browser platform VM |

## Architecture Summary

```
┌─────────────────────────────────────────────────┐
│                 Browser Host                     │
│  ┌───────────────────────────────────────────┐  │
│  │            Horizon Hypervisor (Ring 0)     │  │
│  │  ┌──────────────┐  ┌──────────────────┐   │  │
│  │  │  Partition A │  │   Partition B    │   │  │
│  │  │  Kernel(R1)  │  │   Kernel (R1)    │   │  │
│  │  │  App (R2)    │  │   App (R2)       │   │  │
│  │  └──────────────┘  └──────────────────┘   │  │
│  └───────────────────────────────────────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ VFS      │ │ I/O Ports│ │  Web Workers     │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
└─────────────────────────────────────────────────┘
```

## Document Structure

- `01-isa.md` — Instruction Set Architecture
- `02-memory-model.md` — Memory model and page protection
- `03-privilege-model.md` — Privilege levels and transitions
- `04-bytecode-format.md` — Binary file format (.hzbc)
- `05-filesystem.md` — Virtual filesystem specification
- `06-hypervisor.md` — Hypervisor interface and partition management
- `07-io-model.md` — Browser I/O bridge
