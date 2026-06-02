import { CPU } from '../vm/cpu.js';
import { Memory } from '../vm/memory.js';
import { Ring } from '../vm/opcodes.js';
import { i32 } from '../vm/types.js';

// ── Yield signal (checked by the runner after each step slice) ────────────────
export let yieldRequested = false;
export function resetYield(): void { yieldRequested = false; }

// ── Element handle registry ──────────────────────────────────────────────────

let nextHandle = 1;
const handles = new Map<number, Element>();

function registerEl(el: Element): number {
  const id = nextHandle++;
  handles.set(id, el);
  return id;
}

function getEl(id: number): Element | undefined {
  return handles.get(id);
}

// ── Event queue ───────────────────────────────────────────────────────────────

let nextQueueId = 1;
// Each queue entry: [type_hash: u32, timestamp_ms: u32]
const eventQueues = new Map<number, Array<[number, number]>>();

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (Math.imul(h, 0x01000193)) >>> 0;
  }
  return h;
}

// ── Memory helpers ────────────────────────────────────────────────────────────

function readStr(mem: Memory, virt: number, ring: Ring): string {
  const bytes: number[] = [];
  let addr = virt >>> 0;
  for (let i = 0; i < 4096; i++) {
    const b = mem.read8(addr + i, ring);
    if (b === 0) break;
    bytes.push(b);
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

function writeStr(mem: Memory, s: string, virtBuf: number, bufLen: number, ring: Ring): number {
  const enc = new TextEncoder().encode(s);
  const len = Math.min(enc.length, bufLen - 1);
  for (let i = 0; i < len; i++) mem.write8(virtBuf + i, enc[i], ring);
  mem.write8(virtBuf + len, 0, ring);
  return len;
}

// ── Hypercall numbers ─────────────────────────────────────────────────────────

export const HCALL = {
  DOM_QUERY:       0x00A0,
  DOM_QUERY_ALL:   0x00A1,
  DOM_GET_ATTR:    0x00A2,
  DOM_SET_ATTR:    0x00A3,
  DOM_GET_TEXT:    0x00A4,
  DOM_SET_TEXT:    0x00A5,
  DOM_CREATE:      0x00A6,
  DOM_APPEND:      0x00A7,
  DOM_REMOVE:      0x00A8,
  DOM_LISTEN:      0x00A9,
  DOM_POLL:        0x00AA,
  DOM_STYLE_SET:   0x00AB,
  DOM_GET_PARENT:  0x00AC,
  DOM_GET_CHILD:   0x00AD,
  DOM_CHILD_COUNT: 0x00AE,
  DOM_RELEASE:     0x00AF,
  CONSOLE_LOG:     0x00B0,
  CONSOLE_ERROR:   0x00B1,
} as const;

// ── Handler ───────────────────────────────────────────────────────────────────

export function domHypercallHandler(num: number, cpu: CPU): void {
  const { ring, mem } = cpu;

  switch (num) {
    case HCALL.DOM_QUERY: {
      const selPtr = cpu.pop().v as number;
      const el = document.querySelector(readStr(mem, selPtr, ring));
      cpu.push(i32(el ? registerEl(el) : 0));
      break;
    }

    case HCALL.DOM_QUERY_ALL: {
      const maxHandles = cpu.pop().v as number;
      const outBuf     = cpu.pop().v as number;
      const selPtr     = cpu.pop().v as number;
      const els = Array.from(document.querySelectorAll(readStr(mem, selPtr, ring)));
      const count = Math.min(els.length, maxHandles);
      for (let i = 0; i < count; i++) {
        mem.write32(outBuf + i * 4, registerEl(els[i]), ring);
      }
      cpu.push(i32(count));
      break;
    }

    case HCALL.DOM_GET_ATTR: {
      const bufLen  = cpu.pop().v as number;
      const bufPtr  = cpu.pop().v as number;
      const attrPtr = cpu.pop().v as number;
      const handle  = cpu.pop().v as number;
      const el = getEl(handle);
      if (!el) { cpu.push(i32(-1)); break; }
      const val = el.getAttribute(readStr(mem, attrPtr, ring)) ?? '';
      cpu.push(i32(writeStr(mem, val, bufPtr, bufLen, ring)));
      break;
    }

    case HCALL.DOM_SET_ATTR: {
      const valPtr  = cpu.pop().v as number;
      const attrPtr = cpu.pop().v as number;
      const handle  = cpu.pop().v as number;
      const el = getEl(handle);
      if (!el) { cpu.push(i32(-1)); break; }
      el.setAttribute(readStr(mem, attrPtr, ring), readStr(mem, valPtr, ring));
      cpu.push(i32(0));
      break;
    }

    case HCALL.DOM_GET_TEXT: {
      const bufLen = cpu.pop().v as number;
      const bufPtr = cpu.pop().v as number;
      const handle = cpu.pop().v as number;
      const el = getEl(handle);
      if (!el) { cpu.push(i32(-1)); break; }
      cpu.push(i32(writeStr(mem, el.textContent ?? '', bufPtr, bufLen, ring)));
      break;
    }

    case HCALL.DOM_SET_TEXT: {
      const textPtr = cpu.pop().v as number;
      const handle  = cpu.pop().v as number;
      const el = getEl(handle);
      if (!el) { cpu.push(i32(-1)); break; }
      el.textContent = readStr(mem, textPtr, ring);
      cpu.push(i32(0));
      break;
    }

    case HCALL.DOM_CREATE: {
      const tagPtr = cpu.pop().v as number;
      const tag = readStr(mem, tagPtr, ring);
      cpu.push(i32(registerEl(document.createElement(tag))));
      break;
    }

    case HCALL.DOM_APPEND: {
      const childHandle  = cpu.pop().v as number;
      const parentHandle = cpu.pop().v as number;
      const parent = getEl(parentHandle);
      const child  = getEl(childHandle);
      if (!parent || !child) { cpu.push(i32(-1)); break; }
      parent.appendChild(child);
      cpu.push(i32(0));
      break;
    }

    case HCALL.DOM_REMOVE: {
      const handle = cpu.pop().v as number;
      const el = getEl(handle);
      if (!el) { cpu.push(i32(-1)); break; }
      el.remove();
      handles.delete(handle);
      cpu.push(i32(0));
      break;
    }

    case HCALL.DOM_LISTEN: {
      const evPtr  = cpu.pop().v as number;
      const handle = cpu.pop().v as number;
      const el = getEl(handle);
      if (!el) { cpu.push(i32(-1)); break; }
      const evType = readStr(mem, evPtr, ring);
      const qid = nextQueueId++;
      const queue: Array<[number, number]> = [];
      eventQueues.set(qid, queue);
      el.addEventListener(evType, () => {
        queue.push([fnv1a(evType), Math.trunc(performance.now())]);
      });
      cpu.push(i32(qid));
      break;
    }

    case HCALL.DOM_POLL: {
      const bufLen = cpu.pop().v as number;
      const bufPtr = cpu.pop().v as number;
      const qid    = cpu.pop().v as number;
      const queue  = eventQueues.get(qid);
      if (!queue) { cpu.push(i32(-1)); break; }
      const maxEvents = Math.floor(bufLen / 8);
      const count = Math.min(queue.length, maxEvents);
      const evs = queue.splice(0, count);
      for (let i = 0; i < evs.length; i++) {
        const [typeHash, ts] = evs[i];
        mem.write32(bufPtr + i * 8,     typeHash, ring);
        mem.write32(bufPtr + i * 8 + 4, ts,       ring);
      }
      cpu.push(i32(count));
      if (count === 0) yieldRequested = true; // Let browser event loop run.
      break;
    }

    case HCALL.DOM_STYLE_SET: {
      const valPtr  = cpu.pop().v as number;
      const propPtr = cpu.pop().v as number;
      const handle  = cpu.pop().v as number;
      const el = getEl(handle);
      if (!(el instanceof HTMLElement)) { cpu.push(i32(-1)); break; }
      el.style.setProperty(readStr(mem, propPtr, ring), readStr(mem, valPtr, ring));
      cpu.push(i32(0));
      break;
    }

    case HCALL.DOM_GET_PARENT: {
      const handle = cpu.pop().v as number;
      const el = getEl(handle);
      if (!el?.parentElement) { cpu.push(i32(0)); break; }
      cpu.push(i32(registerEl(el.parentElement)));
      break;
    }

    case HCALL.DOM_GET_CHILD: {
      const index  = cpu.pop().v as number;
      const handle = cpu.pop().v as number;
      const el = getEl(handle);
      const child = el?.children[index];
      cpu.push(i32(child ? registerEl(child) : 0));
      break;
    }

    case HCALL.DOM_CHILD_COUNT: {
      const handle = cpu.pop().v as number;
      const el = getEl(handle);
      cpu.push(i32(el ? el.children.length : -1));
      break;
    }

    case HCALL.DOM_RELEASE: {
      const handle = cpu.pop().v as number;
      cpu.push(i32(handles.delete(handle) ? 0 : -1));
      break;
    }

    case HCALL.CONSOLE_LOG: {
      const strPtr = cpu.pop().v as number;
      console.log('[HorizonVM]', readStr(mem, strPtr, ring));
      break;
    }

    case HCALL.CONSOLE_ERROR: {
      const strPtr = cpu.pop().v as number;
      console.error('[HorizonVM]', readStr(mem, strPtr, ring));
      break;
    }

    default:
      console.warn('[HorizonVM] Unknown hypercall:', num.toString(16));
      cpu.push(i32(-1));
  }
}
