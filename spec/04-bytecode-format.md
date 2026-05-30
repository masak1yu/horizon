# Horizon VM — Bytecode File Format (.hzbc)

**Version**: 0.1.0

## 1. Overview

Horizon VM programs are distributed as `.hzbc` (Horizon Bytecode) files. The format is a binary container with typed sections. All multi-byte integers are **little-endian**.

## 2. File Layout

```
┌────────────────────────────────┐
│  File Header (32 bytes)        │
├────────────────────────────────┤
│  Section Table                 │
│  (num_sections × 20 bytes)     │
├────────────────────────────────┤
│  Section Data                  │
│  (variable length)             │
└────────────────────────────────┘
```

## 3. File Header

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| 0 | 4 | `magic` | `0x48 0x5A 0x42 0x43` ("HZBC") |
| 4 | 2 | `version_major` | Format major version (currently `0`) |
| 6 | 2 | `version_minor` | Format minor version (currently `1`) |
| 8 | 4 | `flags` | Module flags (see below) |
| 12 | 4 | `entry_point` | Offset within `.code` section of entry function; `0xFFFFFFFF` if none (library) |
| 16 | 2 | `min_ring` | Minimum ring required to load (`0`, `1`, or `2`) |
| 18 | 2 | `num_sections` | Number of sections |
| 20 | 4 | `code_size` | Total bytes in `.code` section |
| 24 | 8 | `reserved` | Must be zero |

### 3.1 Module Flags

| Bit | Name | Description |
|-----|------|-------------|
| 0 | `EXECUTABLE` | Has an entry point; can be executed directly |
| 1 | `LIBRARY` | No entry point; exports symbols for linking |
| 2 | `KERNEL` | Intended to run at Ring 1 |
| 3 | `HYPERVISOR` | Intended to run at Ring 0 |
| 4–31 | (reserved) | Must be zero |

## 4. Section Table Entry

Each section is described by a 20-byte entry in the section table immediately following the file header.

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| 0 | 4 | `type` | Section type identifier |
| 4 | 4 | `flags` | Section flags |
| 8 | 4 | `offset` | Byte offset from start of file to section data |
| 12 | 4 | `size` | Byte length of section data |
| 16 | 4 | `align` | Required alignment of section data in memory |

### 4.1 Section Types

| Value | Name | Description |
|-------|------|-------------|
| `0x01` | `.code` | Executable bytecode |
| `0x02` | `.data` | Mutable initialized data |
| `0x03` | `.rodata` | Read-only data (strings, constants) |
| `0x04` | `.bss` | Zero-initialized uninitialized data (size in `size`, no data bytes) |
| `0x05` | `.imports` | Import table |
| `0x06` | `.exports` | Export table |
| `0x07` | `.debug` | Debug information (optional) |
| `0x08` | `.meta` | Module metadata (name, description, version) |

### 4.2 Section Flags

| Bit | Name | Description |
|-----|------|-------------|
| 0 | `READ` | Readable |
| 1 | `WRITE` | Writable at runtime |
| 2 | `EXEC` | Executable |

## 5. Import Table (`.imports`)

A list of symbols this module requires from other modules.

Each entry:

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| 0 | 4 | `module_name_offset` | Offset into `.rodata` of module name (null-terminated UTF-8) |
| 4 | 4 | `symbol_name_offset` | Offset into `.rodata` of symbol name |
| 8 | 4 | `kind` | `0x01` = function, `0x02` = data |
| 12 | 4 | `local_ref` | Address within `.code`/`.data` where the resolved address will be written |

## 6. Export Table (`.exports`)

A list of symbols this module makes available.

Each entry:

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| 0 | 4 | `symbol_name_offset` | Offset into `.rodata` of symbol name |
| 4 | 4 | `kind` | `0x01` = function, `0x02` = data |
| 8 | 4 | `offset` | Offset within `.code` or `.data` section |

## 7. Loading Sequence

1. Validate `magic` bytes
2. Check `version_major` compatibility
3. Verify `min_ring` ≤ current ring level
4. Parse section table
5. Allocate memory for each section (respecting `align`)
6. Copy section data into allocated memory
7. Resolve imports by locating exported symbols in loaded modules
8. If `EXECUTABLE`: jump to `entry_point` within `.code`
