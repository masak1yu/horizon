# Horizon VM — Instruction Set Architecture

**Version**: 0.1.0

## 1. Value Types

The Horizon VM operand stack holds typed values. Each stack slot carries one of the following types:

| Type | Size | Description |
|------|------|-------------|
| `i32` | 4 bytes | 32-bit signed integer (two's complement) |
| `i64` | 8 bytes | 64-bit signed integer (two's complement) |
| `f32` | 4 bytes | IEEE 754 single-precision float |
| `f64` | 8 bytes | IEEE 754 double-precision float |
| `ptr` | 4 bytes | 32-bit linear memory address |

Booleans are represented as `i32`: `0` = false, any non-zero = true.

## 2. Implicit Registers

The VM maintains the following implicit (not directly addressable) registers:

| Register | Type | Description |
|----------|------|-------------|
| `PC` | `ptr` | Program counter |
| `SP` | `ptr` | Operand stack pointer |
| `FP` | `ptr` | Frame pointer (base of current call frame) |
| `FLAGS` | `i32` | Status flags (ZF, CF, OF, SF) |
| `RING` | `i32` | Current privilege level (0, 1, or 2) |
| `PTBR` | `ptr` | Page table base register (Ring 0/1 only) |
| `IVT` | `ptr` | Interrupt vector table pointer (Ring 0 only) |

## 3. Instruction Encoding

Each instruction begins with a 1-byte opcode. Some opcodes are followed by immediate operands of fixed width. All multi-byte immediates are **little-endian**.

```
┌────────┬─────────────────────────────┐
│ opcode │  immediate operand(s)       │
│ 1 byte │  0–8 bytes (opcode-defined) │
└────────┴─────────────────────────────┘
```

## 4. Instruction Reference

### 4.1 Control / System

| Opcode | Mnemonic | Immediates | Ring | Description |
|--------|----------|------------|------|-------------|
| `0x00` | `NOP` | — | any | No operation |
| `0x01` | `HALT` | — | 0 | Halt the VM partition |
| `0x02` | `BRK` | — | any | Breakpoint trap |

### 4.2 Stack Manipulation

| Opcode | Mnemonic | Immediates | Description |
|--------|----------|------------|-------------|
| `0x10` | `PUSH.I32` | `val:i32` | Push 32-bit integer |
| `0x11` | `PUSH.I64` | `val:i64` | Push 64-bit integer |
| `0x12` | `PUSH.F32` | `val:f32` | Push 32-bit float |
| `0x13` | `PUSH.F64` | `val:f64` | Push 64-bit float |
| `0x14` | `POP` | — | Discard top of stack |
| `0x15` | `DUP` | — | Duplicate top of stack |
| `0x16` | `SWAP` | — | Swap top two stack values |
| `0x17` | `OVER` | — | Copy second value to top |

### 4.3 Integer Arithmetic (i32)

| Opcode | Mnemonic | Stack effect |
|--------|----------|--------------|
| `0x20` | `I32.ADD` | `(a b -- a+b)` |
| `0x21` | `I32.SUB` | `(a b -- a-b)` |
| `0x22` | `I32.MUL` | `(a b -- a*b)` |
| `0x23` | `I32.DIV_S` | `(a b -- a/b)` signed |
| `0x24` | `I32.DIV_U` | `(a b -- a/b)` unsigned |
| `0x25` | `I32.REM_S` | `(a b -- a%b)` signed |
| `0x26` | `I32.REM_U` | `(a b -- a%b)` unsigned |
| `0x27` | `I32.NEG` | `(a -- -a)` |

### 4.4 Integer Arithmetic (i64)

| Opcode | Mnemonic | Stack effect |
|--------|----------|--------------|
| `0x28` | `I64.ADD` | `(a b -- a+b)` |
| `0x29` | `I64.SUB` | `(a b -- a-b)` |
| `0x2A` | `I64.MUL` | `(a b -- a*b)` |
| `0x2B` | `I64.DIV_S` | `(a b -- a/b)` signed |
| `0x2C` | `I64.DIV_U` | `(a b -- a/b)` unsigned |
| `0x2D` | `I64.REM_S` | `(a b -- a%b)` signed |
| `0x2E` | `I64.REM_U` | `(a b -- a%b)` unsigned |
| `0x2F` | `I64.NEG` | `(a -- -a)` |

### 4.5 Floating-Point Arithmetic

| Opcode | Mnemonic | Stack effect |
|--------|----------|--------------|
| `0x30` | `F32.ADD` | `(a b -- a+b)` |
| `0x31` | `F32.SUB` | `(a b -- a-b)` |
| `0x32` | `F32.MUL` | `(a b -- a*b)` |
| `0x33` | `F32.DIV` | `(a b -- a/b)` |
| `0x34` | `F64.ADD` | `(a b -- a+b)` |
| `0x35` | `F64.SUB` | `(a b -- a-b)` |
| `0x36` | `F64.MUL` | `(a b -- a*b)` |
| `0x37` | `F64.DIV` | `(a b -- a/b)` |

### 4.6 Bitwise

| Opcode | Mnemonic | Stack effect |
|--------|----------|--------------|
| `0x40` | `I32.AND` | `(a b -- a&b)` |
| `0x41` | `I32.OR` | `(a b -- a\|b)` |
| `0x42` | `I32.XOR` | `(a b -- a^b)` |
| `0x43` | `I32.NOT` | `(a -- ~a)` |
| `0x44` | `I32.SHL` | `(a n -- a<<n)` |
| `0x45` | `I32.SHR_S` | `(a n -- a>>n)` arithmetic |
| `0x46` | `I32.SHR_U` | `(a n -- a>>>n)` logical |
| `0x47` | `I64.AND` | `(a b -- a&b)` |
| `0x48` | `I64.OR` | `(a b -- a\|b)` |
| `0x49` | `I64.XOR` | `(a b -- a^b)` |
| `0x4A` | `I64.NOT` | `(a -- ~a)` |
| `0x4B` | `I64.SHL` | `(a n -- a<<n)` |
| `0x4C` | `I64.SHR_S` | `(a n -- a>>n)` arithmetic |
| `0x4D` | `I64.SHR_U` | `(a n -- a>>>n)` logical |

### 4.7 Comparison (result: i32, 1=true 0=false)

| Opcode | Mnemonic | Stack effect |
|--------|----------|--------------|
| `0x50` | `I32.EQ` | `(a b -- a==b)` |
| `0x51` | `I32.NE` | `(a b -- a!=b)` |
| `0x52` | `I32.LT_S` | `(a b -- a<b)` signed |
| `0x53` | `I32.LT_U` | `(a b -- a<b)` unsigned |
| `0x54` | `I32.LE_S` | `(a b -- a<=b)` signed |
| `0x55` | `I32.LE_U` | `(a b -- a<=b)` unsigned |
| `0x56` | `I32.GT_S` | `(a b -- a>b)` signed |
| `0x57` | `I32.GT_U` | `(a b -- a>b)` unsigned |
| `0x58` | `I32.GE_S` | `(a b -- a>=b)` signed |
| `0x59` | `I32.GE_U` | `(a b -- a>=b)` unsigned |
| `0x5A` | `I64.EQ` | `(a b -- a==b)` |
| `0x5B` | `I64.NE` | `(a b -- a!=b)` |
| `0x5C` | `I64.LT_S` | `(a b -- a<b)` signed |
| `0x5D` | `I64.LT_U` | `(a b -- a<b)` unsigned |
| `0x5E` | `I64.LE_S` | `(a b -- a<=b)` signed |
| `0x5F` | `I64.LE_U` | `(a b -- a<=b)` unsigned |
| `0x60` | `F32.EQ` | `(a b -- a==b)` |
| `0x61` | `F32.LT` | `(a b -- a<b)` |
| `0x62` | `F32.LE` | `(a b -- a<=b)` |
| `0x63` | `F64.EQ` | `(a b -- a==b)` |
| `0x64` | `F64.LT` | `(a b -- a<b)` |
| `0x65` | `F64.LE` | `(a b -- a<=b)` |

### 4.8 Memory Access

All memory instructions take a `u32` offset immediate added to a base `ptr` address popped from the stack.

| Opcode | Mnemonic | Immediates | Stack effect |
|--------|----------|------------|--------------|
| `0x70` | `LOAD.I8S` | `offset:u32` | `(addr -- i32)` sign-extend |
| `0x71` | `LOAD.I8U` | `offset:u32` | `(addr -- i32)` zero-extend |
| `0x72` | `LOAD.I16S` | `offset:u32` | `(addr -- i32)` sign-extend |
| `0x73` | `LOAD.I16U` | `offset:u32` | `(addr -- i32)` zero-extend |
| `0x74` | `LOAD.I32` | `offset:u32` | `(addr -- i32)` |
| `0x75` | `LOAD.I64` | `offset:u32` | `(addr -- i64)` |
| `0x76` | `LOAD.F32` | `offset:u32` | `(addr -- f32)` |
| `0x77` | `LOAD.F64` | `offset:u32` | `(addr -- f64)` |
| `0x78` | `STORE.I8` | `offset:u32` | `(addr val --)` |
| `0x79` | `STORE.I16` | `offset:u32` | `(addr val --)` |
| `0x7A` | `STORE.I32` | `offset:u32` | `(addr val --)` |
| `0x7B` | `STORE.I64` | `offset:u32` | `(addr val --)` |
| `0x7C` | `STORE.F32` | `offset:u32` | `(addr val --)` |
| `0x7D` | `STORE.F64` | `offset:u32` | `(addr val --)` |

### 4.9 Control Flow

Branch offsets are `i32` values relative to the start of the **next** instruction (i.e., PC after decoding).

| Opcode | Mnemonic | Immediates | Stack effect | Description |
|--------|----------|------------|--------------|-------------|
| `0x80` | `JMP` | `offset:i32` | `(--)` | Unconditional jump |
| `0x81` | `JZ` | `offset:i32` | `(cond --)` | Jump if `cond == 0` |
| `0x82` | `JNZ` | `offset:i32` | `(cond --)` | Jump if `cond != 0` |
| `0x83` | `CALL` | `n_args:u8, offset:i32` | `(--)` | Call subroutine (relative). `n_args` args are on the stack; `RET`/`RET.VAL` cleans them. |
| `0x84` | `CALL.IND` | `n_args:u8` | `(addr --)` | Indirect call via address on stack. |
| `0x85` | `RET` | — | `(--)` | Return from subroutine; cleans `n_args` args from stack. |
| `0x86` | `RET.VAL` | — | `(val -- val)` | Return with value; cleans args, pushes return value. |

### 4.10 Local Variables / Call Frame

| Opcode | Mnemonic | Immediates | Stack effect | Description |
|--------|----------|------------|--------------|-------------|
| `0x90` | `ENTER` | `nlocals:u16` | `(--)` | Create frame with N local slots |
| `0x91` | `LEAVE` | — | `(--)` | Destroy frame |
| `0x92` | `LOCAL.GET` | `idx:u16` | `(-- val)` | Push local variable |
| `0x93` | `LOCAL.SET` | `idx:u16` | `(val --)` | Pop to local variable |
| `0x94` | `ARG.GET` | `idx:u16` | `(-- val)` | Push argument (caller-pushed) |

### 4.10.1 Calling Convention

The Horizon VM uses a **callee-cleans** convention:

1. Caller pushes arguments left-to-right (arg 0 pushed first, arg N-1 pushed last — last is on top).
2. Caller executes `CALL n_args @label` where `n_args` matches the number of pushed arguments.
3. Inside the callee, `ARG.GET 0` retrieves the last-pushed argument (arg N-1), `ARG.GET N-1` retrieves the first.
4. On `RET.VAL`, the VM automatically truncates the operand stack back to the pre-argument depth and pushes the return value. The caller does not need to clean up arguments.

This ensures the operand stack is clean after every function return, with no manual `POP` instructions required for argument cleanup.

### 4.11 Type Conversion

| Opcode | Mnemonic | Stack effect |
|--------|----------|--------------|
| `0xA0` | `I32.EXTEND_S` | `(i32 -- i64)` sign-extend |
| `0xA1` | `I32.EXTEND_U` | `(i32 -- i64)` zero-extend |
| `0xA2` | `I64.WRAP` | `(i64 -- i32)` truncate |
| `0xA3` | `F32.DEMOTE` | `(f64 -- f32)` |
| `0xA4` | `F64.PROMOTE` | `(f32 -- f64)` |
| `0xA5` | `I32.TRUNC_F32_S` | `(f32 -- i32)` |
| `0xA6` | `I32.TRUNC_F32_U` | `(f32 -- i32)` |
| `0xA7` | `I32.TRUNC_F64_S` | `(f64 -- i32)` |
| `0xA8` | `I32.TRUNC_F64_U` | `(f64 -- i32)` |
| `0xA9` | `I64.TRUNC_F32_S` | `(f32 -- i64)` |
| `0xAA` | `I64.TRUNC_F32_U` | `(f32 -- i64)` |
| `0xAB` | `I64.TRUNC_F64_S` | `(f64 -- i64)` |
| `0xAC` | `I64.TRUNC_F64_U` | `(f64 -- i64)` |
| `0xAD` | `F32.CONVERT_I32_S` | `(i32 -- f32)` |
| `0xAE` | `F32.CONVERT_I32_U` | `(i32 -- f32)` |
| `0xAF` | `F32.CONVERT_I64_S` | `(i64 -- f32)` |
| `0xB0` | `F32.CONVERT_I64_U` | `(i64 -- f32)` |
| `0xB1` | `F64.CONVERT_I32_S` | `(i32 -- f64)` |
| `0xB2` | `F64.CONVERT_I32_U` | `(i32 -- f64)` |
| `0xB3` | `F64.CONVERT_I64_S` | `(i64 -- f64)` |
| `0xB4` | `F64.CONVERT_I64_U` | `(i64 -- f64)` |

### 4.12 Privilege and System Instructions

These instructions control privilege transitions and system-level operations. Executing a privileged instruction at an insufficient ring level raises a **General Protection Fault** (interrupt vector `0x0D`).

| Opcode | Mnemonic | Immediates | Min Ring | Stack effect | Description |
|--------|----------|------------|----------|--------------|-------------|
| `0xC0` | `SYSCALL` | `num:u16` | 2 | varies | User → Kernel call |
| `0xC1` | `SYSRET` | — | 1 | varies | Return from syscall |
| `0xC2` | `HYPERCALL` | `num:u16` | 1 | varies | Kernel → Hypervisor call |
| `0xC3` | `HYPERET` | — | 0 | varies | Return from hypercall |
| `0xC4` | `INT` | `vec:u8` | any | `(--)` | Software interrupt |
| `0xC5` | `IRET` | — | 0/1 | `(--)` | Return from interrupt handler |
| `0xC6` | `CLI` | — | 1 | `(--)` | Disable interrupts |
| `0xC7` | `STI` | — | 1 | `(--)` | Enable interrupts |
| `0xC8` | `RING.GET` | — | any | `(-- i32)` | Push current ring level |
| `0xC9` | `PAGE.MAP` | — | 0 | `(phys virt flags --)` | Map physical page |
| `0xCA` | `PAGE.UNMAP` | — | 0 | `(virt --)` | Unmap virtual page |
| `0xCB` | `PTBR.SET` | — | 0 | `(addr --)` | Set page table base |
| `0xCC` | `PTBR.GET` | — | 0 | `(-- addr)` | Get page table base |
| `0xCD` | `IVT.SET` | — | 0 | `(addr --)` | Set interrupt vector table |
| `0xCE` | `PART.CREATE` | — | 0 | `(cfg -- pid)` | Create new partition |
| `0xCF` | `PART.DESTROY` | — | 0 | `(pid --)` | Destroy partition |
