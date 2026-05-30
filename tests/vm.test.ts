import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assemble } from '../src/assembler/assembler.js';
import { CPU } from '../src/vm/cpu.js';
import { Memory } from '../src/vm/memory.js';
import { PageFlags, PAGE_SIZE, asI32, asF64, i32 } from '../src/vm/types.js';
import { Ring } from '../src/vm/opcodes.js';

function makeVM(asmSrc: string): CPU {
  const { code } = assemble(asmSrc);
  const mem = new Memory(64 * PAGE_SIZE);

  const physOffset = mem.allocPages(Math.ceil(code.length / PAGE_SIZE) + 1, 0);
  const codeStart = 0x01000000;
  for (let p = 0; p * PAGE_SIZE < code.length + PAGE_SIZE; p++) {
    mem.mapPage(codeStart + p * PAGE_SIZE, physOffset + p * PAGE_SIZE,
      PageFlags.Present | PageFlags.Read | PageFlags.Exec | PageFlags.User);
  }
  mem.writeBytesPhys(physOffset, code);

  const cpu = new CPU(mem, () => {}, () => {});
  cpu.pc = codeStart;
  cpu.ring = Ring.User;
  return cpu;
}

describe('CPU — arithmetic', () => {
  it('adds two i32 values', () => {
    const cpu = makeVM('PUSH.I32 3\nPUSH.I32 4\nI32.ADD\nRET.VAL');
    cpu.run(100);
    const [result] = cpu.getStackSnapshot();
    assert.equal(asI32(result), 7);
  });

  it('subtracts i32', () => {
    const cpu = makeVM('PUSH.I32 10\nPUSH.I32 3\nI32.SUB\nRET.VAL');
    cpu.run(100);
    assert.equal(asI32(cpu.getStackSnapshot()[0]), 7);
  });

  it('multiplies i32', () => {
    const cpu = makeVM('PUSH.I32 6\nPUSH.I32 7\nI32.MUL\nRET.VAL');
    cpu.run(100);
    assert.equal(asI32(cpu.getStackSnapshot()[0]), 42);
  });

  it('signed divides i32', () => {
    const cpu = makeVM('PUSH.I32 20\nPUSH.I32 4\nI32.DIV_S\nRET.VAL');
    cpu.run(100);
    assert.equal(asI32(cpu.getStackSnapshot()[0]), 5);
  });

  it('negates i32', () => {
    const cpu = makeVM('PUSH.I32 42\nI32.NEG\nRET.VAL');
    cpu.run(100);
    assert.equal(asI32(cpu.getStackSnapshot()[0]), -42);
  });

  it('f64 arithmetic', () => {
    const cpu = makeVM('PUSH.F64 1.5\nPUSH.F64 2.5\nF64.ADD\nRET.VAL');
    cpu.run(100);
    assert.equal(asF64(cpu.getStackSnapshot()[0]), 4.0);
  });
});

describe('CPU — stack manipulation', () => {
  it('DUP duplicates top', () => {
    const cpu = makeVM('PUSH.I32 99\nDUP\nRET.VAL');
    cpu.run(100);
    const snap = cpu.getStackSnapshot();
    assert.equal(snap.length, 2);
    assert.equal(asI32(snap[0]), 99);
    assert.equal(asI32(snap[1]), 99);
  });

  it('SWAP exchanges top two', () => {
    const cpu = makeVM('PUSH.I32 1\nPUSH.I32 2\nSWAP\nRET.VAL');
    cpu.run(100);
    const snap = cpu.getStackSnapshot();
    assert.equal(asI32(snap[0]), 2);
    assert.equal(asI32(snap[1]), 1);
  });
});

describe('CPU — control flow', () => {
  it('JZ skips when zero', () => {
    const cpu = makeVM([
      'PUSH.I32 0',
      'JZ @skip',
      'PUSH.I32 1',
      'RET.VAL',
      'skip:',
      'PUSH.I32 42',
      'RET.VAL',
    ].join('\n'));
    cpu.run(100);
    assert.equal(asI32(cpu.getStackSnapshot()[0]), 42);
  });

  it('JNZ skips when non-zero', () => {
    const cpu = makeVM([
      'PUSH.I32 1',
      'JNZ @skip',
      'PUSH.I32 1',
      'RET.VAL',
      'skip:',
      'PUSH.I32 100',
      'RET.VAL',
    ].join('\n'));
    cpu.run(100);
    assert.equal(asI32(cpu.getStackSnapshot()[0]), 100);
  });

  it('CALL and RET.VAL return a value', () => {
    const cpu = makeVM([
      'CALL @double',
      'RET.VAL',
      'double:',
      'PUSH.I32 21',
      'PUSH.I32 2',
      'I32.MUL',
      'RET.VAL',
    ].join('\n'));
    cpu.run(200);
    assert.equal(asI32(cpu.getStackSnapshot()[0]), 42);
  });
});

describe('CPU — locals', () => {
  it('stores and retrieves a local variable', () => {
    const cpu = makeVM([
      'ENTER 1',
      'PUSH.I32 7',
      'LOCAL.SET 0',
      'LOCAL.GET 0',
      'LEAVE',
      'RET.VAL',
    ].join('\n'));
    cpu.run(100);
    assert.equal(asI32(cpu.getStackSnapshot()[0]), 7);
  });
});

describe('CPU — comparisons', () => {
  it('I32.EQ returns 1 for equal', () => {
    const cpu = makeVM('PUSH.I32 5\nPUSH.I32 5\nI32.EQ\nRET.VAL');
    cpu.run(100);
    assert.equal(asI32(cpu.getStackSnapshot()[0]), 1);
  });

  it('I32.LT_S returns 0 when not less', () => {
    const cpu = makeVM('PUSH.I32 5\nPUSH.I32 3\nI32.LT_S\nRET.VAL');
    cpu.run(100);
    assert.equal(asI32(cpu.getStackSnapshot()[0]), 0);
  });
});
