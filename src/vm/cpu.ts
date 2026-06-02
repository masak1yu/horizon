import { Opcode, Ring, InterruptVector } from './opcodes.js';
import { Memory } from './memory.js';
import {
  StackValue, ValueKind,
  i32, i64, f32, f64, ptr,
  asI32, asI64, asF32, asF64, asPtr,
  PageFlags, fault, HorizonFault,
} from './types.js';

export interface CpuState {
  pc: number;
  ring: Ring;
  interruptsEnabled: boolean;
}

export type HypercallHandler = (num: number, cpu: CPU) => void;
export type SyscallHandler   = (num: number, cpu: CPU) => void;

export class CPU {
  pc = 0;
  ring: Ring = Ring.User;
  interruptsEnabled = true;

  private readonly operandStack: StackValue[] = [];
  private readonly callStack: Array<{ retPc: number; retRing: Ring; fp: number; base: number }> = [];
  private readonly locals: StackValue[][] = [];
  private fp = 0;

  private ivt: number = 0;
  private ptbr: number = 0;

  private halted = false;

  constructor(
    public readonly mem: Memory,
    private readonly onHypercall: HypercallHandler,
    private readonly onSyscall: SyscallHandler,
  ) {}

  push(v: StackValue): void {
    this.operandStack.push(v);
  }

  pop(): StackValue {
    const v = this.operandStack.pop();
    if (v === undefined) throw fault(InterruptVector.StackFault, 'Operand stack underflow');
    return v;
  }

  peek(): StackValue {
    const v = this.operandStack[this.operandStack.length - 1];
    if (v === undefined) throw fault(InterruptVector.StackFault, 'Operand stack empty');
    return v;
  }

  private requireRing(minRing: Ring, op: string): void {
    if (this.ring > minRing) {
      throw fault(InterruptVector.GPF, `${op} requires Ring ${minRing}, current ring is ${this.ring}`);
    }
  }

  private readPcByte(): number {
    const b = this.mem.read8(this.pc, this.ring);
    this.pc = (this.pc + 1) >>> 0;
    return b;
  }

  private readPcI32(): number {
    const v = this.mem.read32(this.pc, this.ring);
    this.pc = (this.pc + 4) >>> 0;
    return v;
  }

  private readPcU16(): number {
    const v = this.mem.read16(this.pc, this.ring);
    this.pc = (this.pc + 2) >>> 0;
    return v;
  }

  private readPcU32(): number {
    return this.readPcI32() >>> 0;
  }

  private readPcI64(): bigint {
    const v = this.mem.read64(this.pc, this.ring);
    this.pc = (this.pc + 8) >>> 0;
    return v;
  }

  private readPcF32(): number {
    const v = this.mem.readF32(this.pc, this.ring);
    this.pc = (this.pc + 4) >>> 0;
    return v;
  }

  private readPcF64(): number {
    const v = this.mem.readF64(this.pc, this.ring);
    this.pc = (this.pc + 8) >>> 0;
    return v;
  }

  step(): boolean {
    if (this.halted) return false;

    const opcode = this.readPcByte() as Opcode;

    switch (opcode) {
      // ── Control ──────────────────────────────────────────────
      case Opcode.NOP: break;

      case Opcode.HALT:
        this.requireRing(Ring.Hypervisor, 'HALT');
        this.halted = true;
        return false;

      case Opcode.BRK: break; // Debugger hook; implementation may intercept

      // ── Stack manipulation ────────────────────────────────────
      case Opcode.PUSH_I32: this.push(i32(this.readPcI32())); break;
      case Opcode.PUSH_I64: this.push(i64(this.readPcI64())); break;
      case Opcode.PUSH_F32: this.push(f32(this.readPcF32())); break;
      case Opcode.PUSH_F64: this.push(f64(this.readPcF64())); break;
      case Opcode.POP:  this.pop(); break;
      case Opcode.DUP:  { const v = this.peek(); this.push({ ...v }); break; }
      case Opcode.SWAP: { const b = this.pop(); const a = this.pop(); this.push(b); this.push(a); break; }
      case Opcode.OVER: { const b = this.pop(); const a = this.peek(); this.push(b); this.push({ ...a }); break; }

      // ── i32 arithmetic ────────────────────────────────────────
      case Opcode.I32_ADD: { const b = asI32(this.pop()), a = asI32(this.pop()); this.push(i32(a + b)); break; }
      case Opcode.I32_SUB: { const b = asI32(this.pop()), a = asI32(this.pop()); this.push(i32(a - b)); break; }
      case Opcode.I32_MUL: { const b = asI32(this.pop()), a = asI32(this.pop()); this.push(i32(Math.imul(a, b))); break; }
      case Opcode.I32_DIV_S: {
        const b = asI32(this.pop()), a = asI32(this.pop());
        if (b === 0) throw fault(InterruptVector.DivideByZero, 'I32.DIV_S by zero');
        this.push(i32((a / b) | 0)); break;
      }
      case Opcode.I32_DIV_U: {
        const b = asI32(this.pop()) >>> 0, a = asI32(this.pop()) >>> 0;
        if (b === 0) throw fault(InterruptVector.DivideByZero, 'I32.DIV_U by zero');
        this.push(i32((a / b) >>> 0)); break;
      }
      case Opcode.I32_REM_S: {
        const b = asI32(this.pop()), a = asI32(this.pop());
        if (b === 0) throw fault(InterruptVector.DivideByZero, 'I32.REM_S by zero');
        this.push(i32(a % b)); break;
      }
      case Opcode.I32_REM_U: {
        const b = asI32(this.pop()) >>> 0, a = asI32(this.pop()) >>> 0;
        if (b === 0) throw fault(InterruptVector.DivideByZero, 'I32.REM_U by zero');
        this.push(i32(a % b)); break;
      }
      case Opcode.I32_NEG: { this.push(i32(-asI32(this.pop()))); break; }

      // ── i64 arithmetic ────────────────────────────────────────
      case Opcode.I64_ADD: { const b = asI64(this.pop()), a = asI64(this.pop()); this.push(i64(a + b)); break; }
      case Opcode.I64_SUB: { const b = asI64(this.pop()), a = asI64(this.pop()); this.push(i64(a - b)); break; }
      case Opcode.I64_MUL: { const b = asI64(this.pop()), a = asI64(this.pop()); this.push(i64(a * b)); break; }
      case Opcode.I64_DIV_S: {
        const b = asI64(this.pop()), a = asI64(this.pop());
        if (b === 0n) throw fault(InterruptVector.DivideByZero, 'I64.DIV_S by zero');
        this.push(i64(a / b)); break;
      }
      case Opcode.I64_DIV_U: {
        const b = BigInt.asUintN(64, asI64(this.pop())), a = BigInt.asUintN(64, asI64(this.pop()));
        if (b === 0n) throw fault(InterruptVector.DivideByZero, 'I64.DIV_U by zero');
        this.push(i64(BigInt.asIntN(64, a / b))); break;
      }
      case Opcode.I64_REM_S: {
        const b = asI64(this.pop()), a = asI64(this.pop());
        if (b === 0n) throw fault(InterruptVector.DivideByZero, 'I64.REM_S by zero');
        this.push(i64(a % b)); break;
      }
      case Opcode.I64_REM_U: {
        const b = BigInt.asUintN(64, asI64(this.pop())), a = BigInt.asUintN(64, asI64(this.pop()));
        if (b === 0n) throw fault(InterruptVector.DivideByZero, 'I64.REM_U by zero');
        this.push(i64(BigInt.asIntN(64, a % b))); break;
      }
      case Opcode.I64_NEG: { this.push(i64(-asI64(this.pop()))); break; }

      // ── float arithmetic ──────────────────────────────────────
      case Opcode.F32_ADD: { const b = asF32(this.pop()), a = asF32(this.pop()); this.push(f32(a + b)); break; }
      case Opcode.F32_SUB: { const b = asF32(this.pop()), a = asF32(this.pop()); this.push(f32(a - b)); break; }
      case Opcode.F32_MUL: { const b = asF32(this.pop()), a = asF32(this.pop()); this.push(f32(a * b)); break; }
      case Opcode.F32_DIV: { const b = asF32(this.pop()), a = asF32(this.pop()); this.push(f32(a / b)); break; }
      case Opcode.F64_ADD: { const b = asF64(this.pop()), a = asF64(this.pop()); this.push(f64(a + b)); break; }
      case Opcode.F64_SUB: { const b = asF64(this.pop()), a = asF64(this.pop()); this.push(f64(a - b)); break; }
      case Opcode.F64_MUL: { const b = asF64(this.pop()), a = asF64(this.pop()); this.push(f64(a * b)); break; }
      case Opcode.F64_DIV: { const b = asF64(this.pop()), a = asF64(this.pop()); this.push(f64(a / b)); break; }

      // ── i32 bitwise ───────────────────────────────────────────
      case Opcode.I32_AND: { const b = asI32(this.pop()), a = asI32(this.pop()); this.push(i32(a & b)); break; }
      case Opcode.I32_OR:  { const b = asI32(this.pop()), a = asI32(this.pop()); this.push(i32(a | b)); break; }
      case Opcode.I32_XOR: { const b = asI32(this.pop()), a = asI32(this.pop()); this.push(i32(a ^ b)); break; }
      case Opcode.I32_NOT: { this.push(i32(~asI32(this.pop()))); break; }
      case Opcode.I32_SHL:   { const n = asI32(this.pop()) & 31, a = asI32(this.pop()); this.push(i32(a << n)); break; }
      case Opcode.I32_SHR_S: { const n = asI32(this.pop()) & 31, a = asI32(this.pop()); this.push(i32(a >> n)); break; }
      case Opcode.I32_SHR_U: { const n = asI32(this.pop()) & 31, a = asI32(this.pop()); this.push(i32(a >>> n)); break; }

      // ── i64 bitwise ───────────────────────────────────────────
      case Opcode.I64_AND: { const b = asI64(this.pop()), a = asI64(this.pop()); this.push(i64(a & b)); break; }
      case Opcode.I64_OR:  { const b = asI64(this.pop()), a = asI64(this.pop()); this.push(i64(a | b)); break; }
      case Opcode.I64_XOR: { const b = asI64(this.pop()), a = asI64(this.pop()); this.push(i64(a ^ b)); break; }
      case Opcode.I64_NOT: { this.push(i64(~asI64(this.pop()))); break; }
      case Opcode.I64_SHL:   { const n = asI64(this.pop()) & 63n, a = asI64(this.pop()); this.push(i64(a << n)); break; }
      case Opcode.I64_SHR_S: { const n = asI64(this.pop()) & 63n, a = asI64(this.pop()); this.push(i64(a >> n)); break; }
      case Opcode.I64_SHR_U: { const n = asI64(this.pop()) & 63n, a = BigInt.asUintN(64, asI64(this.pop())); this.push(i64(BigInt.asIntN(64, a >> n))); break; }

      // ── i32 comparison ────────────────────────────────────────
      case Opcode.I32_EQ:   { const b = asI32(this.pop()), a = asI32(this.pop()); this.push(i32(a === b ? 1 : 0)); break; }
      case Opcode.I32_NE:   { const b = asI32(this.pop()), a = asI32(this.pop()); this.push(i32(a !== b ? 1 : 0)); break; }
      case Opcode.I32_LT_S: { const b = asI32(this.pop()), a = asI32(this.pop()); this.push(i32(a < b ? 1 : 0)); break; }
      case Opcode.I32_LT_U: { const b = asI32(this.pop()) >>> 0, a = asI32(this.pop()) >>> 0; this.push(i32(a < b ? 1 : 0)); break; }
      case Opcode.I32_LE_S: { const b = asI32(this.pop()), a = asI32(this.pop()); this.push(i32(a <= b ? 1 : 0)); break; }
      case Opcode.I32_LE_U: { const b = asI32(this.pop()) >>> 0, a = asI32(this.pop()) >>> 0; this.push(i32(a <= b ? 1 : 0)); break; }
      case Opcode.I32_GT_S: { const b = asI32(this.pop()), a = asI32(this.pop()); this.push(i32(a > b ? 1 : 0)); break; }
      case Opcode.I32_GT_U: { const b = asI32(this.pop()) >>> 0, a = asI32(this.pop()) >>> 0; this.push(i32(a > b ? 1 : 0)); break; }
      case Opcode.I32_GE_S: { const b = asI32(this.pop()), a = asI32(this.pop()); this.push(i32(a >= b ? 1 : 0)); break; }
      case Opcode.I32_GE_U: { const b = asI32(this.pop()) >>> 0, a = asI32(this.pop()) >>> 0; this.push(i32(a >= b ? 1 : 0)); break; }

      // ── i64 comparison ────────────────────────────────────────
      case Opcode.I64_EQ:   { const b = asI64(this.pop()), a = asI64(this.pop()); this.push(i32(a === b ? 1 : 0)); break; }
      case Opcode.I64_NE:   { const b = asI64(this.pop()), a = asI64(this.pop()); this.push(i32(a !== b ? 1 : 0)); break; }
      case Opcode.I64_LT_S: { const b = asI64(this.pop()), a = asI64(this.pop()); this.push(i32(a < b ? 1 : 0)); break; }
      case Opcode.I64_LT_U: { const b = BigInt.asUintN(64, asI64(this.pop())), a = BigInt.asUintN(64, asI64(this.pop())); this.push(i32(a < b ? 1 : 0)); break; }
      case Opcode.I64_LE_S: { const b = asI64(this.pop()), a = asI64(this.pop()); this.push(i32(a <= b ? 1 : 0)); break; }
      case Opcode.I64_LE_U: { const b = BigInt.asUintN(64, asI64(this.pop())), a = BigInt.asUintN(64, asI64(this.pop())); this.push(i32(a <= b ? 1 : 0)); break; }

      // ── float comparison ──────────────────────────────────────
      case Opcode.F32_EQ: { const b = asF32(this.pop()), a = asF32(this.pop()); this.push(i32(a === b ? 1 : 0)); break; }
      case Opcode.F32_LT: { const b = asF32(this.pop()), a = asF32(this.pop()); this.push(i32(a < b ? 1 : 0)); break; }
      case Opcode.F32_LE: { const b = asF32(this.pop()), a = asF32(this.pop()); this.push(i32(a <= b ? 1 : 0)); break; }
      case Opcode.F64_EQ: { const b = asF64(this.pop()), a = asF64(this.pop()); this.push(i32(a === b ? 1 : 0)); break; }
      case Opcode.F64_LT: { const b = asF64(this.pop()), a = asF64(this.pop()); this.push(i32(a < b ? 1 : 0)); break; }
      case Opcode.F64_LE: { const b = asF64(this.pop()), a = asF64(this.pop()); this.push(i32(a <= b ? 1 : 0)); break; }

      // ── Memory ────────────────────────────────────────────────
      case Opcode.LOAD_I8S:  { const off = this.readPcU32(), addr = asPtr(this.pop()); this.push(i32((this.mem.read8(addr + off, this.ring) << 24) >> 24)); break; }
      case Opcode.LOAD_I8U:  { const off = this.readPcU32(), addr = asPtr(this.pop()); this.push(i32(this.mem.read8(addr + off, this.ring))); break; }
      case Opcode.LOAD_I16S: { const off = this.readPcU32(), addr = asPtr(this.pop()); this.push(i32((this.mem.read16(addr + off, this.ring) << 16) >> 16)); break; }
      case Opcode.LOAD_I16U: { const off = this.readPcU32(), addr = asPtr(this.pop()); this.push(i32(this.mem.read16(addr + off, this.ring))); break; }
      case Opcode.LOAD_I32:  { const off = this.readPcU32(), addr = asPtr(this.pop()); this.push(i32(this.mem.read32(addr + off, this.ring))); break; }
      case Opcode.LOAD_I64:  { const off = this.readPcU32(), addr = asPtr(this.pop()); this.push(i64(this.mem.read64(addr + off, this.ring))); break; }
      case Opcode.LOAD_F32:  { const off = this.readPcU32(), addr = asPtr(this.pop()); this.push(f32(this.mem.readF32(addr + off, this.ring))); break; }
      case Opcode.LOAD_F64:  { const off = this.readPcU32(), addr = asPtr(this.pop()); this.push(f64(this.mem.readF64(addr + off, this.ring))); break; }
      case Opcode.STORE_I8:  { const off = this.readPcU32(), val = asI32(this.pop()), addr = asPtr(this.pop()); this.mem.write8(addr + off, val, this.ring); break; }
      case Opcode.STORE_I16: { const off = this.readPcU32(), val = asI32(this.pop()), addr = asPtr(this.pop()); this.mem.write16(addr + off, val, this.ring); break; }
      case Opcode.STORE_I32: { const off = this.readPcU32(), val = asI32(this.pop()), addr = asPtr(this.pop()); this.mem.write32(addr + off, val, this.ring); break; }
      case Opcode.STORE_I64: { const off = this.readPcU32(), val = asI64(this.pop()), addr = asPtr(this.pop()); this.mem.write64(addr + off, val, this.ring); break; }
      case Opcode.STORE_F32: { const off = this.readPcU32(), val = asF32(this.pop()), addr = asPtr(this.pop()); this.mem.writeF32(addr + off, val, this.ring); break; }
      case Opcode.STORE_F64: { const off = this.readPcU32(), val = asF64(this.pop()), addr = asPtr(this.pop()); this.mem.writeF64(addr + off, val, this.ring); break; }

      // ── Control flow ──────────────────────────────────────────
      case Opcode.JMP: { const off = this.readPcI32(); this.pc = (this.pc + off) >>> 0; break; }
      case Opcode.JZ:  { const off = this.readPcI32(); if (asI32(this.pop()) === 0) this.pc = (this.pc + off) >>> 0; break; }
      case Opcode.JNZ: { const off = this.readPcI32(); if (asI32(this.pop()) !== 0) this.pc = (this.pc + off) >>> 0; break; }
      case Opcode.CALL: {
        const nArgs = this.readPcByte();  // u8: number of args already on stack
        const off = this.readPcI32();
        const retPc = this.pc;
        const newFp = this.operandStack.length;
        const base = newFp - nArgs;
        this.callStack.push({ retPc, retRing: this.ring, fp: this.fp, base });
        this.locals.push([]);
        this.fp = newFp;
        this.pc = (retPc + off) >>> 0;
        break;
      }
      case Opcode.CALL_IND: {
        const nArgs = this.readPcByte();
        const addr = asPtr(this.pop());
        const newFp = this.operandStack.length;
        const base = newFp - nArgs;
        this.callStack.push({ retPc: this.pc, retRing: this.ring, fp: this.fp, base });
        this.locals.push([]);
        this.fp = newFp;
        this.pc = addr;
        break;
      }
      case Opcode.RET: {
        const frame = this.callStack.pop();
        if (!frame) { this.halted = true; return false; }
        this.locals.pop();
        this.operandStack.length = frame.base;
        this.pc = frame.retPc;
        this.ring = frame.retRing;
        this.fp = frame.fp;
        break;
      }
      case Opcode.RET_VAL: {
        const retVal = this.pop();
        const frame = this.callStack.pop();
        if (!frame) { this.push(retVal); this.halted = true; return false; }
        this.locals.pop();
        this.operandStack.length = frame.base;
        this.pc = frame.retPc;
        this.ring = frame.retRing;
        this.fp = frame.fp;
        this.push(retVal);
        break;
      }

      // ── Call frame ────────────────────────────────────────────
      case Opcode.ENTER: {
        const n = this.readPcU16();
        const localFrame: StackValue[] = new Array(n).fill(i32(0));
        this.locals.push(localFrame);
        break;
      }
      case Opcode.LEAVE: {
        this.locals.pop();
        break;
      }
      case Opcode.LOCAL_GET: {
        const idx = this.readPcU16();
        const frame = this.locals[this.locals.length - 1];
        if (!frame || idx >= frame.length) throw fault(InterruptVector.GPF, `LOCAL.GET out of bounds: ${idx}`);
        this.push({ ...frame[idx] });
        break;
      }
      case Opcode.LOCAL_SET: {
        const idx = this.readPcU16();
        const frame = this.locals[this.locals.length - 1];
        if (!frame || idx >= frame.length) throw fault(InterruptVector.GPF, `LOCAL.SET out of bounds: ${idx}`);
        frame[idx] = this.pop();
        break;
      }
      case Opcode.ARG_GET: {
        const idx = this.readPcU16();
        const stackIdx = this.fp - 1 - idx;
        const v = this.operandStack[stackIdx];
        if (v === undefined) throw fault(InterruptVector.GPF, `ARG.GET out of bounds: ${idx}`);
        this.push({ ...v });
        break;
      }

      // ── Type conversion ───────────────────────────────────────
      case Opcode.I32_EXTEND_S: { this.push(i64(BigInt(asI32(this.pop())))); break; }
      case Opcode.I32_EXTEND_U: { this.push(i64(BigInt(asI32(this.pop()) >>> 0))); break; }
      case Opcode.I64_WRAP:     { this.push(i32(Number(asI64(this.pop()) & 0xFFFFFFFFn))); break; }
      case Opcode.F32_DEMOTE:   { this.push(f32(asF64(this.pop()))); break; }
      case Opcode.F64_PROMOTE:  { this.push(f64(asF32(this.pop()))); break; }
      case Opcode.I32_TRUNC_F32_S: { this.push(i32(Math.trunc(asF32(this.pop())))); break; }
      case Opcode.I32_TRUNC_F32_U: { this.push(i32(Math.trunc(asF32(this.pop())) >>> 0)); break; }
      case Opcode.I32_TRUNC_F64_S: { this.push(i32(Math.trunc(asF64(this.pop())))); break; }
      case Opcode.I32_TRUNC_F64_U: { this.push(i32(Math.trunc(asF64(this.pop())) >>> 0)); break; }
      case Opcode.I64_TRUNC_F32_S: { this.push(i64(BigInt(Math.trunc(asF32(this.pop()))))); break; }
      case Opcode.I64_TRUNC_F32_U: { this.push(i64(BigInt.asIntN(64, BigInt(Math.trunc(asF32(this.pop()))) & 0xFFFFFFFFFFFFFFFFn))); break; }
      case Opcode.I64_TRUNC_F64_S: { this.push(i64(BigInt(Math.trunc(asF64(this.pop()))))); break; }
      case Opcode.I64_TRUNC_F64_U: { this.push(i64(BigInt.asIntN(64, BigInt(Math.trunc(asF64(this.pop()))) & 0xFFFFFFFFFFFFFFFFn))); break; }
      case Opcode.F32_CONVERT_I32_S: { this.push(f32(asI32(this.pop()))); break; }
      case Opcode.F32_CONVERT_I32_U: { this.push(f32(asI32(this.pop()) >>> 0)); break; }
      case Opcode.F32_CONVERT_I64_S: { this.push(f32(Number(asI64(this.pop())))); break; }
      case Opcode.F32_CONVERT_I64_U: { this.push(f32(Number(BigInt.asUintN(64, asI64(this.pop()))))); break; }
      case Opcode.F64_CONVERT_I32_S: { this.push(f64(asI32(this.pop()))); break; }
      case Opcode.F64_CONVERT_I32_U: { this.push(f64(asI32(this.pop()) >>> 0)); break; }
      case Opcode.F64_CONVERT_I64_S: { this.push(f64(Number(asI64(this.pop())))); break; }
      case Opcode.F64_CONVERT_I64_U: { this.push(f64(Number(BigInt.asUintN(64, asI64(this.pop()))))); break; }

      // ── Privilege ─────────────────────────────────────────────
      case Opcode.SYSCALL: {
        const num = this.readPcU16();
        this.callStack.push({ retPc: this.pc, retRing: this.ring, fp: this.fp, base: this.fp });
        this.locals.push([]);
        this.ring = Ring.Kernel;
        this.onSyscall(num, this);
        break;
      }
      case Opcode.SYSRET: {
        const frame = this.callStack.pop();
        if (!frame) throw fault(InterruptVector.StackFault, 'SYSRET with empty call stack');
        this.locals.pop();
        this.pc = frame.retPc;
        this.ring = Ring.User;
        this.fp = frame.fp;
        break;
      }
      case Opcode.HYPERCALL: {
        const num = this.readPcU16();
        this.requireRing(Ring.Kernel, 'HYPERCALL');
        const savedRing = this.ring;
        this.ring = Ring.Hypervisor;
        this.onHypercall(num, this);
        this.ring = savedRing; // JS handler runs inline; restore ring without a HYPERET.
        break;
      }
      case Opcode.HYPERET: {
        const frame = this.callStack.pop();
        if (!frame) throw fault(InterruptVector.StackFault, 'HYPERET with empty call stack');
        this.locals.pop();
        this.pc = frame.retPc;
        this.ring = frame.retRing;
        this.fp = frame.fp;
        break;
      }
      case Opcode.RING_GET: {
        this.push(i32(this.ring));
        break;
      }
      case Opcode.CLI: { this.requireRing(Ring.Kernel, 'CLI'); this.interruptsEnabled = false; break; }
      case Opcode.STI: { this.requireRing(Ring.Kernel, 'STI'); this.interruptsEnabled = true; break; }
      case Opcode.PAGE_MAP: {
        this.requireRing(Ring.Hypervisor, 'PAGE.MAP');
        const flags = asI32(this.pop());
        const virt = asPtr(this.pop());
        const phys = asPtr(this.pop());
        this.mem.mapPage(virt, phys, flags);
        break;
      }
      case Opcode.PAGE_UNMAP: {
        this.requireRing(Ring.Hypervisor, 'PAGE.UNMAP');
        this.mem.unmapPage(asPtr(this.pop()));
        break;
      }
      case Opcode.PTBR_SET: { this.requireRing(Ring.Hypervisor, 'PTBR.SET'); this.ptbr = asPtr(this.pop()); break; }
      case Opcode.PTBR_GET: { this.requireRing(Ring.Hypervisor, 'PTBR.GET'); this.push(ptr(this.ptbr)); break; }
      case Opcode.IVT_SET:  { this.requireRing(Ring.Hypervisor, 'IVT.SET');  this.ivt = asPtr(this.pop()); break; }
      case Opcode.INT: {
        const vec = this.readPcByte();
        const handlerAddr = this.mem.read32(this.ivt + vec * 4, Ring.Hypervisor);
        this.callStack.push({ retPc: this.pc, retRing: this.ring, fp: this.fp, base: this.fp });
        this.locals.push([]);
        this.pc = handlerAddr >>> 0;
        break;
      }
      case Opcode.IRET: {
        const frame = this.callStack.pop();
        if (!frame) throw fault(InterruptVector.StackFault, 'IRET with empty call stack');
        this.locals.pop();
        this.pc = frame.retPc;
        this.ring = frame.retRing;
        this.fp = frame.fp;
        break;
      }

      default:
        throw fault(InterruptVector.GPF, `Unknown opcode: 0x${opcode.toString(16).padStart(2, '0')}`);
    }

    return true;
  }

  run(maxSteps = Infinity): void {
    let steps = 0;
    while (!this.halted && steps < maxSteps) {
      this.step();
      steps++;
    }
  }

  isHalted(): boolean { return this.halted; }

  getStackSnapshot(): StackValue[] {
    return [...this.operandStack];
  }
}
