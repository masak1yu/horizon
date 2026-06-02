import { assemble } from '../assembler/assembler.js';
import { CPU } from '../vm/cpu.js';
import { Memory } from '../vm/memory.js';
import { PageFlags, PAGE_SIZE } from '../vm/types.js';
import { Ring } from '../vm/opcodes.js';
import { domHypercallHandler, yieldRequested, resetYield } from './dom-bridge.js';

// Steps per time slice before yielding to the browser event loop.
const SLICE_STEPS = 200_000;
// Hard limit to prevent infinite loops without any poll yield.
const HARD_LIMIT = 100_000_000;

interface VMContext {
  cpu: CPU;
  totalSteps: number;
}

function makeMemory(code: Uint8Array): { mem: Memory; codeStart: number } {
  const pages = Math.ceil(code.length / PAGE_SIZE) + 16;
  const mem = new Memory(pages * PAGE_SIZE);

  const codeStart = 0x01000000;
  const codePages = Math.ceil(code.length / PAGE_SIZE) + 1;
  const physOffset = mem.allocPages(codePages, 0);
  for (let p = 0; p < codePages; p++) {
    mem.mapPage(
      codeStart + p * PAGE_SIZE,
      physOffset + p * PAGE_SIZE,
      PageFlags.Present | PageFlags.Read | PageFlags.Exec | PageFlags.User,
    );
  }
  // Data pages (read/write, for string buffers etc.)
  const dataStart = 0x02000000;
  const dataPhys = mem.allocPages(8, 0);
  for (let p = 0; p < 8; p++) {
    mem.mapPage(
      dataStart + p * PAGE_SIZE,
      dataPhys + p * PAGE_SIZE,
      PageFlags.Present | PageFlags.Read | PageFlags.Write | PageFlags.User,
    );
  }
  mem.writeBytesPhys(physOffset, code);
  return { mem, codeStart };
}

function runSlice(ctx: VMContext): void {
  resetYield();
  const { cpu } = ctx;
  const limit = Math.min(ctx.totalSteps + SLICE_STEPS, HARD_LIMIT);

  try {
    while (!cpu.isHalted() && ctx.totalSteps < limit && !yieldRequested) {
      cpu.step();
      ctx.totalSteps++;
    }
  } catch (err) {
    const fault = err as { vector?: number; message?: string };
    if (fault.vector !== undefined) {
      console.error(`[HorizonVM] Fault (vector 0x${fault.vector.toString(16)}): ${fault.message}`);
    } else {
      console.error('[HorizonVM] Runtime error:', err);
    }
    return;
  }

  if (cpu.isHalted() || ctx.totalSteps >= HARD_LIMIT) return;

  // More work to do — schedule next slice.
  setTimeout(() => runSlice(ctx), 0);
}

function launch(src: string): void {
  let code: Uint8Array;
  try {
    const result = assemble(src);
    code = result.code;
  } catch (err) {
    console.error('[HorizonVM] Assembly error:', err);
    return;
  }

  const { mem, codeStart } = makeMemory(code);

  // Syscall handler: SYS_WRITE (4) → console
  function syscallHandler(num: number, cpu: CPU): void {
    if (num === 4) {
      const len    = cpu.pop().v as number;
      const bufPtr = cpu.pop().v as number;
      const fd     = cpu.pop().v as number;
      const bytes: number[] = [];
      for (let i = 0; i < len; i++) bytes.push(cpu.mem.read8(bufPtr + i, cpu.ring));
      const text = new TextDecoder().decode(new Uint8Array(bytes));
      (fd === 2 ? console.error : console.log)('[HorizonVM stdout]', text);
    }
  }

  const cpu = new CPU(mem, domHypercallHandler, syscallHandler);
  cpu.pc   = codeStart;
  cpu.ring = Ring.Kernel; // Scripts run at ring 1 so they can call DOM hypercalls directly.

  runSlice({ cpu, totalSteps: 0 });
}

function processPage(): void {
  const scripts = document.querySelectorAll<HTMLScriptElement>(
    'script[type="application/horizon-vm"]',
  );

  scripts.forEach((el) => {
    const src = el.getAttribute('src');
    if (src) {
      const url = new URL(src, location.href).href;
      fetch(url)
        .then((r) => r.text())
        .then((text) => launch(text))
        .catch((e) => console.error('[HorizonVM] Failed to load', url, e));
    } else {
      const text = el.textContent?.trim() ?? '';
      if (text) launch(text);
    }
  });
}

// Run after DOM is available.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', processPage);
} else {
  processPage();
}
