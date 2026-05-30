# Horizon VM — Browser I/O Model

**Version**: 0.1.0

## 1. Philosophy

Horizon VM's I/O model bridges the VM's execution environment with browser host APIs. All I/O is mediated by the hypervisor (Ring 0); no partition can reach browser APIs directly.

This provides security isolation and a stable ABI that is independent of how browser APIs evolve.

## 2. I/O Categories

| Category | Hypercall prefix | Description |
|----------|-----------------|-------------|
| Display | `HCALL_DISPLAY_*` | Framebuffer-based rendering via `<canvas>` |
| Input | `HCALL_INPUT_*` | Keyboard, mouse, touch events |
| Network | `HCALL_NET_*` | WebSocket and Fetch-based networking |
| Storage | `HCALL_STORAGE_*` | IndexedDB-backed VFS (see `05-filesystem.md`) |
| Audio | `HCALL_AUDIO_*` | Web Audio API bridge |
| Timing | `HCALL_TIME_*` | High-resolution timestamps, timers |
| Console | `HCALL_CONSOLE_*` | Browser devtools console |

## 3. Display

The display is presented as a **linear framebuffer** mapped into the partition's address space. The partition writes pixels directly; the hypervisor flushes dirty regions to an HTML `<canvas>` element.

Default framebuffer format: `RGBA8888` (4 bytes per pixel, R at lowest address).

Resolution is determined by the canvas element size and device pixel ratio. Partitions query size via `HCALL_DISPLAY_GETFB`.

## 4. Input Events

The hypervisor translates browser DOM events into a VM input event queue. Partitions consume events via:

#### `HYPERCALL HCALL_INPUT_POLL` (`0x0060`)

Stack before: `(buf_ptr max_events --)`
Stack after: `(num_events)`

Each event (16 bytes):

| Offset | Type | Field |
|--------|------|-------|
| 0 | `u32` | `type` |
| 4 | `u32` | `code` |
| 8 | `i32` | `value` |
| 12 | `u32` | `timestamp_ms` |

Event types:

| `type` | Name | `code` / `value` |
|--------|------|-------------------|
| `0x01` | `KEY_DOWN` | `code` = key code, `value` = char code |
| `0x02` | `KEY_UP` | `code` = key code |
| `0x03` | `MOUSE_MOVE` | `code` = 0, `value` = packed `(x<<16\|y)` |
| `0x04` | `MOUSE_DOWN` | `code` = button index |
| `0x05` | `MOUSE_UP` | `code` = button index |
| `0x06` | `WHEEL` | `value` = delta (positive = down) |

## 5. Networking

#### `HYPERCALL HCALL_NET_CONNECT` (`0x0070`)

Open a WebSocket connection.

Stack before: `(url_ptr --)`
Stack after: `(sock_id)` (`< 0` = error)

#### `HYPERCALL HCALL_NET_SEND` (`0x0071`)

Stack before: `(sock_id buf_ptr len --)`
Stack after: `(result)`

#### `HYPERCALL HCALL_NET_RECV` (`0x0072`)

Stack before: `(sock_id buf_ptr max_len --)`
Stack after: `(bytes_received)` (`0` = no data, `< 0` = error/closed)

#### `HYPERCALL HCALL_NET_CLOSE` (`0x0073`)

Stack before: `(sock_id --)`
Stack after: `(result)`

#### `HYPERCALL HCALL_NET_FETCH` (`0x0074`)

Perform an HTTP request (Fetch API).

Stack before: `(url_ptr method_ptr headers_ptr body_ptr body_len --)`
Stack after: `(response_handle status_code)`

## 6. Timing

#### `HYPERCALL HCALL_TIME_NOW` (`0x0080`)

Get current time as milliseconds since Unix epoch.

Stack before: `(--)`
Stack after: `(ms_hi:i32 ms_lo:i32)` (two `i32` forming a 64-bit value)

#### `HYPERCALL HCALL_TIME_MONOTONIC` (`0x0081`)

Get monotonic time in nanoseconds (suitable for `performance.now()` equivalent).

Stack before: `(--)`
Stack after: `(ns_hi:i32 ns_lo:i32)`

## 7. Asynchrony

Browser I/O is fundamentally asynchronous. Horizon VM handles this as follows:

- When a hypercall initiates an async operation (e.g., IndexedDB read), the partition is set to `BLOCKED` state
- The hypervisor continues its scheduler loop (returning to the browser event loop)
- When the async operation completes (via a JS Promise callback), the partition is moved back to `READY` and the result is placed on its stack
- The partition resumes from the instruction following the `HYPERCALL`

This model is transparent to Ring 1 and Ring 2 code — blocking hypercalls appear synchronous.
