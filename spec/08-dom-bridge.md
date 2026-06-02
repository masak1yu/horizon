# Horizon VM — DOM Bridge

**Version**: 0.1.0

## 1. Overview

The DOM Bridge exposes the browser's DOM to Horizon VM programs via hypercalls.
All DOM access is mediated by the hypervisor; no partition can call browser APIs directly.

DOM hypercall numbers occupy the range `0x00A0`–`0x00CF`.

## 2. Element Handles

DOM elements are referenced by opaque integer **handles** (`i32`, > 0).
A handle of `0` means null/not found. Handles are valid for the lifetime of the partition.

## 3. String Convention

Strings are passed as null-terminated UTF-8 in VM memory.
Lengths returned by read hypercalls exclude the null terminator.

## 4. Hypercalls

### `HCALL_DOM_QUERY` (`0x00A0`)
```
(selector_ptr → handle)
```
`document.querySelector`. Returns `0` if not found.

### `HCALL_DOM_QUERY_ALL` (`0x00A1`)
```
(selector_ptr out_buf_ptr max_handles → count)
```
`document.querySelectorAll`. Writes up to `max_handles` i32 handles to `out_buf_ptr`.

### `HCALL_DOM_GET_ATTR` (`0x00A2`)
```
(handle attr_ptr buf_ptr buf_len → len)
```
`element.getAttribute`. Returns byte length written (excl. null), or `-1` if handle invalid.

### `HCALL_DOM_SET_ATTR` (`0x00A3`)
```
(handle attr_ptr val_ptr → result)
```
`element.setAttribute`. Returns `0` on success, `-1` on error.

### `HCALL_DOM_GET_TEXT` (`0x00A4`)
```
(handle buf_ptr buf_len → len)
```
`element.textContent`. Returns byte length written (excl. null), or `-1`.

### `HCALL_DOM_SET_TEXT` (`0x00A5`)
```
(handle text_ptr → result)
```
`element.textContent = ...`. Returns `0` on success, `-1` on error.

### `HCALL_DOM_CREATE` (`0x00A6`)
```
(tag_ptr → handle)
```
`document.createElement`.

### `HCALL_DOM_APPEND` (`0x00A7`)
```
(parent_handle child_handle → result)
```
`parent.appendChild(child)`.

### `HCALL_DOM_REMOVE` (`0x00A8`)
```
(handle → result)
```
`element.remove()`. Frees the handle.

### `HCALL_DOM_LISTEN` (`0x00A9`)
```
(handle event_ptr → queue_id)
```
Register a DOM event listener. Returns an event queue ID (`> 0`).
Events fired on the element are stored in the queue for later retrieval.

### `HCALL_DOM_POLL` (`0x00AA`)
```
(queue_id buf_ptr buf_len → count)
```
Dequeue pending events. Each event is 8 bytes:

| Offset | Type  | Field       |
|--------|-------|-------------|
| 0      | `u32` | `type_hash` — FNV-1a hash of event type string |
| 4      | `u32` | `timestamp` — `performance.now()` truncated to ms |

Returns number of events written. Non-blocking; returns `0` if queue is empty.

### `HCALL_DOM_STYLE_SET` (`0x00AB`)
```
(handle prop_ptr val_ptr → result)
```
`element.style.setProperty(prop, val)`.

### `HCALL_DOM_GET_PARENT` (`0x00AC`)
```
(handle → parent_handle)
```
`element.parentElement`. Returns `0` if none.

### `HCALL_DOM_GET_CHILD` (`0x00AD`)
```
(handle index → child_handle)
```
`element.children[index]`. Returns `0` if out of range.

### `HCALL_DOM_CHILD_COUNT` (`0x00AE`)
```
(handle → count)
```
`element.children.length`.

### `HCALL_DOM_RELEASE` (`0x00AF`)
```
(handle → result)
```
Explicitly release a handle. The underlying element is not removed from the DOM.

## 5. Console Hypercalls (`0x00B0`–`0x00BF`)

### `HCALL_CONSOLE_LOG` (`0x00B0`)
```
(str_ptr → −)
```
`console.log` from within the VM.

### `HCALL_CONSOLE_ERROR` (`0x00B1`)
```
(str_ptr → −)
```
`console.error` from within the VM.

## 6. Event Handling Pattern

Because Horizon VM execution is synchronous, event-driven programs
use a **poll loop**:

```asm
  ; setup
  PUSH.PTR selector   ; "#my-button\0"
  HYPERCALL 0x00A0    ; HCALL_DOM_QUERY → handle
  LOCAL.SET 0

  PUSH.I32 local.0    ; handle
  PUSH.PTR ev_click   ; "click\0"
  HYPERCALL 0x00A9    ; HCALL_DOM_LISTEN → queue_id
  LOCAL.SET 1

loop:
  PUSH.I32 local.1    ; queue_id
  PUSH.PTR event_buf  ; scratch buffer
  PUSH.I32 64         ; buf_len
  HYPERCALL 0x00AA    ; HCALL_DOM_POLL → count

  PUSH.I32 0
  I32.EQ
  JNZ @loop           ; no events, keep polling

  ; handle click ...
  JMP @loop
```

The hypervisor runs the VM in short bursts via `setTimeout(0)` between polls
so the browser event loop is not starved.
