import { readFileSync } from 'node:fs';
import { runAssembly } from './vm/runner.js';
import { ValueKind } from './vm/types.js';

const file = process.argv[2];
if (!file) {
  console.error('Usage: horizon-run <file.hzs>');
  process.exit(1);
}

const src = readFileSync(file, 'utf-8');

try {
  const { stack, steps } = runAssembly(src);
  console.log(`Horizon VM — ${file}`);
  console.log(`Executed ${steps} steps`);
  console.log('Stack (top → bottom):');
  for (let i = stack.length - 1; i >= 0; i--) {
    const v = stack[i];
    switch (v.kind) {
      case ValueKind.I32: console.log(`  i32: ${v.v}`); break;
      case ValueKind.I64: console.log(`  i64: ${v.v}`); break;
      case ValueKind.F32: console.log(`  f32: ${v.v}`); break;
      case ValueKind.F64: console.log(`  f64: ${v.v}`); break;
      case ValueKind.Ptr: console.log(`  ptr: 0x${v.v.toString(16).padStart(8, '0')}`); break;
    }
  }
} catch (e: unknown) {
  const err = e as { vector?: number; message: string };
  if (err.vector !== undefined) {
    console.error(`VM Fault (vector 0x${err.vector.toString(16).padStart(2, '0')}): ${err.message}`);
  } else {
    console.error(`Error: ${err.message}`);
  }
  process.exit(1);
}
