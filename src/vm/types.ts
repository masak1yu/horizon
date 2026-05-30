export const enum ValueKind {
  I32 = 0,
  I64 = 1,
  F32 = 2,
  F64 = 3,
  Ptr = 4,
}

export type StackValue =
  | { kind: ValueKind.I32; v: number }
  | { kind: ValueKind.I64; v: bigint }
  | { kind: ValueKind.F32; v: number }
  | { kind: ValueKind.F64; v: number }
  | { kind: ValueKind.Ptr; v: number };

export function i32(v: number): StackValue {
  return { kind: ValueKind.I32, v: v | 0 };
}

export function i64(v: bigint): StackValue {
  return { kind: ValueKind.I64, v: BigInt.asIntN(64, v) };
}

export function f32(v: number): StackValue {
  const buf = new Float32Array(1);
  buf[0] = v;
  return { kind: ValueKind.F32, v: buf[0] };
}

export function f64(v: number): StackValue {
  return { kind: ValueKind.F64, v };
}

export function ptr(v: number): StackValue {
  return { kind: ValueKind.Ptr, v: v >>> 0 };
}

export function asI32(v: StackValue): number {
  if (v.kind === ValueKind.I32 || v.kind === ValueKind.Ptr) return v.v | 0;
  throw new TypeError(`Expected i32/ptr, got kind=${v.kind}`);
}

export function asI64(v: StackValue): bigint {
  if (v.kind === ValueKind.I64) return v.v;
  throw new TypeError(`Expected i64, got kind=${v.kind}`);
}

export function asF32(v: StackValue): number {
  if (v.kind === ValueKind.F32) return v.v;
  throw new TypeError(`Expected f32, got kind=${v.kind}`);
}

export function asF64(v: StackValue): number {
  if (v.kind === ValueKind.F64) return v.v;
  throw new TypeError(`Expected f64, got kind=${v.kind}`);
}

export function asPtr(v: StackValue): number {
  if (v.kind === ValueKind.Ptr || v.kind === ValueKind.I32) return v.v >>> 0;
  throw new TypeError(`Expected ptr, got kind=${v.kind}`);
}

export const enum PageFlags {
  Present  = 1 << 0,
  Read     = 1 << 1,
  Write    = 1 << 2,
  Exec     = 1 << 3,
  User     = 1 << 4,
  Shared   = 1 << 5,
}

export const PAGE_SIZE = 0x1000; // 4 KiB

export interface HorizonFault {
  vector: number;
  address?: number;
  message: string;
}

export function fault(vector: number, message: string, address?: number): HorizonFault {
  return { vector, address, message };
}
