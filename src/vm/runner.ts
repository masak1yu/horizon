import { assemble } from '../assembler/assembler.js';
import { CPU } from './cpu.js';
import { Memory } from './memory.js';
import { PageFlags, PAGE_SIZE } from './types.js';
import { Ring } from './opcodes.js';

export interface RunResult {
  stack: import('./types.js').StackValue[];
  steps: number;
  halted: boolean;
}

export function runAssembly(src: string, maxSteps = 1_000_000): RunResult {
  const { code } = assemble(src);

  const memPages = Math.ceil(code.length / PAGE_SIZE) + 8;
  const mem = new Memory(memPages * PAGE_SIZE);

  const codeStart = 0x01000000;
  const physOffset = mem.allocPages(Math.ceil(code.length / PAGE_SIZE) + 1, 0);
  const pageCount = Math.ceil(code.length / PAGE_SIZE) + 1;
  for (let p = 0; p < pageCount; p++) {
    mem.mapPage(
      codeStart + p * PAGE_SIZE,
      physOffset + p * PAGE_SIZE,
      PageFlags.Present | PageFlags.Read | PageFlags.Exec | PageFlags.User,
    );
  }
  mem.writeBytesPhys(physOffset, code);

  const cpu = new CPU(mem, () => {}, () => {});
  cpu.pc = codeStart;
  cpu.ring = Ring.User;

  let steps = 0;
  while (!cpu.isHalted() && steps < maxSteps) {
    cpu.step();
    steps++;
  }

  return { stack: cpu.getStackSnapshot(), steps, halted: cpu.isHalted() };
}
