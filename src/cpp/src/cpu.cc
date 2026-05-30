#include "horizon_vm/cpu.h"
#include <cassert>
#include <cmath>

namespace horizon {

CPU::CPU(Memory& mem, HypercallHandler on_hypercall, SyscallHandler on_syscall)
    : mem_(mem),
      on_hypercall_(std::move(on_hypercall)),
      on_syscall_(std::move(on_syscall)) {}

void CPU::RaiseFault(uint8_t vector, std::string msg, uint32_t addr) {
  if (!has_fault_) {
    has_fault_     = true;
    pending_fault_ = HorizonFault(vector, std::move(msg), addr);
  }
  halted_ = true;
}

void CPU::Push(Value v) {
  operand_stack_.push_back(v);
}

Value CPU::Pop() {
  if (operand_stack_.empty()) {
    RaiseFault(static_cast<uint8_t>(InterruptVector::StackFault),
               "Operand stack underflow");
    return Value::from_i32(0);
  }
  Value v = operand_stack_.back();
  operand_stack_.pop_back();
  return v;
}

Value CPU::Peek() {
  if (operand_stack_.empty()) {
    RaiseFault(static_cast<uint8_t>(InterruptVector::StackFault),
               "Operand stack empty");
    return Value::from_i32(0);
  }
  return operand_stack_.back();
}

void CPU::RequireRing(Ring min_ring, const char* op) {
  if (ring > min_ring) {
    RaiseFault(static_cast<uint8_t>(InterruptVector::GPF),
               std::string(op) + " requires Ring " +
               std::to_string(static_cast<int>(min_ring)));
  }
}

uint8_t CPU::ReadPcByte() {
  uint8_t b = mem_.Read8(pc, ring);
  pc++;
  return b;
}

uint16_t CPU::ReadPcU16() {
  uint16_t v = static_cast<uint16_t>(mem_.Read16(pc, ring));
  pc += 2;
  return v;
}

uint32_t CPU::ReadPcU32() {
  return static_cast<uint32_t>(ReadPcI32());
}

int32_t CPU::ReadPcI32() {
  int32_t v = mem_.Read32(pc, ring);
  pc += 4;
  return v;
}

int64_t CPU::ReadPcI64() {
  int64_t v = mem_.Read64(pc, ring);
  pc += 8;
  return v;
}

float CPU::ReadPcF32() {
  float v = mem_.ReadF32(pc, ring);
  pc += 4;
  return v;
}

double CPU::ReadPcF64() {
  double v = mem_.ReadF64(pc, ring);
  pc += 8;
  return v;
}

bool CPU::Step() {
  if (halted_) return false;

  auto op = static_cast<Opcode>(ReadPcByte());

  switch (op) {

  // ── Control ────────────────────────────────────────────────────────
  case Opcode::NOP: break;

  case Opcode::HALT:
    RequireRing(Ring::Hypervisor, "HALT");
    halted_ = true;
    return false;

  case Opcode::BRK: break;  // debugger hook

  // ── Stack ──────────────────────────────────────────────────────────
  case Opcode::PUSH_I32: Push(Value::from_i32(ReadPcI32())); break;
  case Opcode::PUSH_I64: Push(Value::from_i64(ReadPcI64())); break;
  case Opcode::PUSH_F32: Push(Value::from_f32(ReadPcF32())); break;
  case Opcode::PUSH_F64: Push(Value::from_f64(ReadPcF64())); break;
  case Opcode::POP:  Pop(); break;
  case Opcode::DUP:  { Value v = Peek(); Push(v); break; }
  case Opcode::SWAP: { Value b = Pop(), a = Pop(); Push(b); Push(a); break; }
  case Opcode::OVER: { Value b = Pop(), a = Peek(); Push(b); Push(a); break; }

  // ── i32 arithmetic ─────────────────────────────────────────────────
  case Opcode::I32_ADD: { int32_t b = Pop().as_i32(), a = Pop().as_i32(); Push(Value::from_i32(a + b)); break; }
  case Opcode::I32_SUB: { int32_t b = Pop().as_i32(), a = Pop().as_i32(); Push(Value::from_i32(a - b)); break; }
  case Opcode::I32_MUL: { int32_t b = Pop().as_i32(), a = Pop().as_i32(); Push(Value::from_i32(a * b)); break; }
  case Opcode::I32_DIV_S: {
    int32_t b = Pop().as_i32(), a = Pop().as_i32();
    if (b == 0) { RaiseFault(static_cast<uint8_t>(InterruptVector::DivideByZero), "I32.DIV_S by zero"); break; }
    Push(Value::from_i32(a / b)); break;
  }
  case Opcode::I32_DIV_U: {
    uint32_t b = static_cast<uint32_t>(Pop().as_i32());
    uint32_t a = static_cast<uint32_t>(Pop().as_i32());
    if (b == 0) { RaiseFault(static_cast<uint8_t>(InterruptVector::DivideByZero), "I32.DIV_U by zero"); break; }
    Push(Value::from_i32(static_cast<int32_t>(a / b))); break;
  }
  case Opcode::I32_REM_S: {
    int32_t b = Pop().as_i32(), a = Pop().as_i32();
    if (b == 0) { RaiseFault(static_cast<uint8_t>(InterruptVector::DivideByZero), "I32.REM_S by zero"); break; }
    Push(Value::from_i32(a % b)); break;
  }
  case Opcode::I32_REM_U: {
    uint32_t b = static_cast<uint32_t>(Pop().as_i32());
    uint32_t a = static_cast<uint32_t>(Pop().as_i32());
    if (b == 0) { RaiseFault(static_cast<uint8_t>(InterruptVector::DivideByZero), "I32.REM_U by zero"); break; }
    Push(Value::from_i32(static_cast<int32_t>(a % b))); break;
  }
  case Opcode::I32_NEG: { Push(Value::from_i32(-Pop().as_i32())); break; }

  // ── i64 arithmetic ─────────────────────────────────────────────────
  case Opcode::I64_ADD: { int64_t b = Pop().as_i64(), a = Pop().as_i64(); Push(Value::from_i64(a + b)); break; }
  case Opcode::I64_SUB: { int64_t b = Pop().as_i64(), a = Pop().as_i64(); Push(Value::from_i64(a - b)); break; }
  case Opcode::I64_MUL: { int64_t b = Pop().as_i64(), a = Pop().as_i64(); Push(Value::from_i64(a * b)); break; }
  case Opcode::I64_DIV_S: {
    int64_t b = Pop().as_i64(), a = Pop().as_i64();
    if (b == 0) { RaiseFault(static_cast<uint8_t>(InterruptVector::DivideByZero), "I64.DIV_S by zero"); break; }
    Push(Value::from_i64(a / b)); break;
  }
  case Opcode::I64_DIV_U: {
    uint64_t b = static_cast<uint64_t>(Pop().as_i64());
    uint64_t a = static_cast<uint64_t>(Pop().as_i64());
    if (b == 0) { RaiseFault(static_cast<uint8_t>(InterruptVector::DivideByZero), "I64.DIV_U by zero"); break; }
    Push(Value::from_i64(static_cast<int64_t>(a / b))); break;
  }
  case Opcode::I64_REM_S: {
    int64_t b = Pop().as_i64(), a = Pop().as_i64();
    if (b == 0) { RaiseFault(static_cast<uint8_t>(InterruptVector::DivideByZero), "I64.REM_S by zero"); break; }
    Push(Value::from_i64(a % b)); break;
  }
  case Opcode::I64_REM_U: {
    uint64_t b = static_cast<uint64_t>(Pop().as_i64());
    uint64_t a = static_cast<uint64_t>(Pop().as_i64());
    if (b == 0) { RaiseFault(static_cast<uint8_t>(InterruptVector::DivideByZero), "I64.REM_U by zero"); break; }
    Push(Value::from_i64(static_cast<int64_t>(a % b))); break;
  }
  case Opcode::I64_NEG: { Push(Value::from_i64(-Pop().as_i64())); break; }

  // ── float arithmetic ───────────────────────────────────────────────
  case Opcode::F32_ADD: { float b = Pop().as_f32(), a = Pop().as_f32(); Push(Value::from_f32(a + b)); break; }
  case Opcode::F32_SUB: { float b = Pop().as_f32(), a = Pop().as_f32(); Push(Value::from_f32(a - b)); break; }
  case Opcode::F32_MUL: { float b = Pop().as_f32(), a = Pop().as_f32(); Push(Value::from_f32(a * b)); break; }
  case Opcode::F32_DIV: { float b = Pop().as_f32(), a = Pop().as_f32(); Push(Value::from_f32(a / b)); break; }
  case Opcode::F64_ADD: { double b = Pop().as_f64(), a = Pop().as_f64(); Push(Value::from_f64(a + b)); break; }
  case Opcode::F64_SUB: { double b = Pop().as_f64(), a = Pop().as_f64(); Push(Value::from_f64(a - b)); break; }
  case Opcode::F64_MUL: { double b = Pop().as_f64(), a = Pop().as_f64(); Push(Value::from_f64(a * b)); break; }
  case Opcode::F64_DIV: { double b = Pop().as_f64(), a = Pop().as_f64(); Push(Value::from_f64(a / b)); break; }

  // ── i32 bitwise ────────────────────────────────────────────────────
  case Opcode::I32_AND:   { int32_t b = Pop().as_i32(), a = Pop().as_i32(); Push(Value::from_i32(a & b)); break; }
  case Opcode::I32_OR:    { int32_t b = Pop().as_i32(), a = Pop().as_i32(); Push(Value::from_i32(a | b)); break; }
  case Opcode::I32_XOR:   { int32_t b = Pop().as_i32(), a = Pop().as_i32(); Push(Value::from_i32(a ^ b)); break; }
  case Opcode::I32_NOT:   { Push(Value::from_i32(~Pop().as_i32())); break; }
  case Opcode::I32_SHL:   { int32_t n = Pop().as_i32() & 31, a = Pop().as_i32(); Push(Value::from_i32(a << n)); break; }
  case Opcode::I32_SHR_S: { int32_t n = Pop().as_i32() & 31, a = Pop().as_i32(); Push(Value::from_i32(a >> n)); break; }
  case Opcode::I32_SHR_U: { int32_t n = Pop().as_i32() & 31; uint32_t a = static_cast<uint32_t>(Pop().as_i32()); Push(Value::from_i32(static_cast<int32_t>(a >> n))); break; }

  // ── i64 bitwise ────────────────────────────────────────────────────
  case Opcode::I64_AND:   { int64_t b = Pop().as_i64(), a = Pop().as_i64(); Push(Value::from_i64(a & b)); break; }
  case Opcode::I64_OR:    { int64_t b = Pop().as_i64(), a = Pop().as_i64(); Push(Value::from_i64(a | b)); break; }
  case Opcode::I64_XOR:   { int64_t b = Pop().as_i64(), a = Pop().as_i64(); Push(Value::from_i64(a ^ b)); break; }
  case Opcode::I64_NOT:   { Push(Value::from_i64(~Pop().as_i64())); break; }
  case Opcode::I64_SHL:   { int64_t n = Pop().as_i64() & 63, a = Pop().as_i64(); Push(Value::from_i64(a << n)); break; }
  case Opcode::I64_SHR_S: { int64_t n = Pop().as_i64() & 63, a = Pop().as_i64(); Push(Value::from_i64(a >> n)); break; }
  case Opcode::I64_SHR_U: { int64_t n = Pop().as_i64() & 63; uint64_t a = static_cast<uint64_t>(Pop().as_i64()); Push(Value::from_i64(static_cast<int64_t>(a >> n))); break; }

  // ── i32 comparison ─────────────────────────────────────────────────
  case Opcode::I32_EQ:   { int32_t b = Pop().as_i32(), a = Pop().as_i32(); Push(Value::from_i32(a == b ? 1 : 0)); break; }
  case Opcode::I32_NE:   { int32_t b = Pop().as_i32(), a = Pop().as_i32(); Push(Value::from_i32(a != b ? 1 : 0)); break; }
  case Opcode::I32_LT_S: { int32_t b = Pop().as_i32(), a = Pop().as_i32(); Push(Value::from_i32(a <  b ? 1 : 0)); break; }
  case Opcode::I32_LT_U: { uint32_t b = static_cast<uint32_t>(Pop().as_i32()), a = static_cast<uint32_t>(Pop().as_i32()); Push(Value::from_i32(a <  b ? 1 : 0)); break; }
  case Opcode::I32_LE_S: { int32_t b = Pop().as_i32(), a = Pop().as_i32(); Push(Value::from_i32(a <= b ? 1 : 0)); break; }
  case Opcode::I32_LE_U: { uint32_t b = static_cast<uint32_t>(Pop().as_i32()), a = static_cast<uint32_t>(Pop().as_i32()); Push(Value::from_i32(a <= b ? 1 : 0)); break; }
  case Opcode::I32_GT_S: { int32_t b = Pop().as_i32(), a = Pop().as_i32(); Push(Value::from_i32(a >  b ? 1 : 0)); break; }
  case Opcode::I32_GT_U: { uint32_t b = static_cast<uint32_t>(Pop().as_i32()), a = static_cast<uint32_t>(Pop().as_i32()); Push(Value::from_i32(a >  b ? 1 : 0)); break; }
  case Opcode::I32_GE_S: { int32_t b = Pop().as_i32(), a = Pop().as_i32(); Push(Value::from_i32(a >= b ? 1 : 0)); break; }
  case Opcode::I32_GE_U: { uint32_t b = static_cast<uint32_t>(Pop().as_i32()), a = static_cast<uint32_t>(Pop().as_i32()); Push(Value::from_i32(a >= b ? 1 : 0)); break; }

  // ── i64 comparison ─────────────────────────────────────────────────
  case Opcode::I64_EQ:   { int64_t b = Pop().as_i64(), a = Pop().as_i64(); Push(Value::from_i32(a == b ? 1 : 0)); break; }
  case Opcode::I64_NE:   { int64_t b = Pop().as_i64(), a = Pop().as_i64(); Push(Value::from_i32(a != b ? 1 : 0)); break; }
  case Opcode::I64_LT_S: { int64_t b = Pop().as_i64(), a = Pop().as_i64(); Push(Value::from_i32(a <  b ? 1 : 0)); break; }
  case Opcode::I64_LT_U: { uint64_t b = static_cast<uint64_t>(Pop().as_i64()), a = static_cast<uint64_t>(Pop().as_i64()); Push(Value::from_i32(a < b ? 1 : 0)); break; }
  case Opcode::I64_LE_S: { int64_t b = Pop().as_i64(), a = Pop().as_i64(); Push(Value::from_i32(a <= b ? 1 : 0)); break; }
  case Opcode::I64_LE_U: { uint64_t b = static_cast<uint64_t>(Pop().as_i64()), a = static_cast<uint64_t>(Pop().as_i64()); Push(Value::from_i32(a <= b ? 1 : 0)); break; }

  // ── float comparison ───────────────────────────────────────────────
  case Opcode::F32_EQ: { float b = Pop().as_f32(), a = Pop().as_f32(); Push(Value::from_i32(a == b ? 1 : 0)); break; }
  case Opcode::F32_LT: { float b = Pop().as_f32(), a = Pop().as_f32(); Push(Value::from_i32(a <  b ? 1 : 0)); break; }
  case Opcode::F32_LE: { float b = Pop().as_f32(), a = Pop().as_f32(); Push(Value::from_i32(a <= b ? 1 : 0)); break; }
  case Opcode::F64_EQ: { double b = Pop().as_f64(), a = Pop().as_f64(); Push(Value::from_i32(a == b ? 1 : 0)); break; }
  case Opcode::F64_LT: { double b = Pop().as_f64(), a = Pop().as_f64(); Push(Value::from_i32(a <  b ? 1 : 0)); break; }
  case Opcode::F64_LE: { double b = Pop().as_f64(), a = Pop().as_f64(); Push(Value::from_i32(a <= b ? 1 : 0)); break; }

  // ── Memory ─────────────────────────────────────────────────────────
  case Opcode::LOAD_I8S:  { uint32_t off = ReadPcU32(), addr = Pop().as_ptr(); Push(Value::from_i32(static_cast<int8_t>(mem_.Read8(addr + off, ring)))); break; }
  case Opcode::LOAD_I8U:  { uint32_t off = ReadPcU32(), addr = Pop().as_ptr(); Push(Value::from_i32(mem_.Read8(addr + off, ring))); break; }
  case Opcode::LOAD_I16S: { uint32_t off = ReadPcU32(), addr = Pop().as_ptr(); Push(Value::from_i32(static_cast<int16_t>(mem_.Read16(addr + off, ring)))); break; }
  case Opcode::LOAD_I16U: { uint32_t off = ReadPcU32(), addr = Pop().as_ptr(); Push(Value::from_i32(mem_.Read16(addr + off, ring))); break; }
  case Opcode::LOAD_I32:  { uint32_t off = ReadPcU32(), addr = Pop().as_ptr(); Push(Value::from_i32(mem_.Read32(addr + off, ring))); break; }
  case Opcode::LOAD_I64:  { uint32_t off = ReadPcU32(), addr = Pop().as_ptr(); Push(Value::from_i64(mem_.Read64(addr + off, ring))); break; }
  case Opcode::LOAD_F32:  { uint32_t off = ReadPcU32(), addr = Pop().as_ptr(); Push(Value::from_f32(mem_.ReadF32(addr + off, ring))); break; }
  case Opcode::LOAD_F64:  { uint32_t off = ReadPcU32(), addr = Pop().as_ptr(); Push(Value::from_f64(mem_.ReadF64(addr + off, ring))); break; }
  case Opcode::STORE_I8:  { uint32_t off = ReadPcU32(); int32_t val = Pop().as_i32(); uint32_t addr = Pop().as_ptr(); mem_.Write8(addr + off, static_cast<uint8_t>(val), ring); break; }
  case Opcode::STORE_I16: { uint32_t off = ReadPcU32(); int32_t val = Pop().as_i32(); uint32_t addr = Pop().as_ptr(); mem_.Write16(addr + off, static_cast<uint16_t>(val), ring); break; }
  case Opcode::STORE_I32: { uint32_t off = ReadPcU32(); int32_t val = Pop().as_i32(); uint32_t addr = Pop().as_ptr(); mem_.Write32(addr + off, val, ring); break; }
  case Opcode::STORE_I64: { uint32_t off = ReadPcU32(); int64_t val = Pop().as_i64(); uint32_t addr = Pop().as_ptr(); mem_.Write64(addr + off, val, ring); break; }
  case Opcode::STORE_F32: { uint32_t off = ReadPcU32(); float val = Pop().as_f32(); uint32_t addr = Pop().as_ptr(); mem_.WriteF32(addr + off, val, ring); break; }
  case Opcode::STORE_F64: { uint32_t off = ReadPcU32(); double val = Pop().as_f64(); uint32_t addr = Pop().as_ptr(); mem_.WriteF64(addr + off, val, ring); break; }

  // ── Control flow ───────────────────────────────────────────────────
  case Opcode::JMP: { int32_t off = ReadPcI32(); pc = static_cast<uint32_t>(static_cast<int64_t>(pc) + off); break; }
  case Opcode::JZ:  { int32_t off = ReadPcI32(); if (Pop().as_i32() == 0) pc = static_cast<uint32_t>(static_cast<int64_t>(pc) + off); break; }
  case Opcode::JNZ: { int32_t off = ReadPcI32(); if (Pop().as_i32() != 0) pc = static_cast<uint32_t>(static_cast<int64_t>(pc) + off); break; }

  case Opcode::CALL: {
    uint8_t  n_args = ReadPcByte();
    int32_t  off    = ReadPcI32();
    uint32_t ret_pc = pc;
    uint32_t new_fp = static_cast<uint32_t>(operand_stack_.size());
    uint32_t base   = new_fp >= n_args ? new_fp - n_args : 0;
    call_stack_.push_back({ret_pc, ring, fp_, base});
    locals_.emplace_back();
    fp_ = new_fp;
    pc  = static_cast<uint32_t>(static_cast<int64_t>(ret_pc) + off);
    break;
  }
  case Opcode::CALL_IND: {
    uint8_t  n_args = ReadPcByte();
    uint32_t addr   = Pop().as_ptr();
    uint32_t new_fp = static_cast<uint32_t>(operand_stack_.size());
    uint32_t base   = new_fp >= n_args ? new_fp - n_args : 0;
    call_stack_.push_back({pc, ring, fp_, base});
    locals_.emplace_back();
    fp_ = new_fp;
    pc  = addr;
    break;
  }
  case Opcode::RET: {
    if (call_stack_.empty()) { halted_ = true; return false; }
    CallFrame frame = call_stack_.back(); call_stack_.pop_back();
    locals_.pop_back();
    operand_stack_.resize(frame.base);
    pc   = frame.ret_pc;
    ring = frame.ret_ring;
    fp_  = frame.fp;
    break;
  }
  case Opcode::RET_VAL: {
    Value ret_val = Pop();
    if (call_stack_.empty()) { Push(ret_val); halted_ = true; return false; }
    CallFrame frame = call_stack_.back(); call_stack_.pop_back();
    locals_.pop_back();
    operand_stack_.resize(frame.base);
    pc   = frame.ret_pc;
    ring = frame.ret_ring;
    fp_  = frame.fp;
    Push(ret_val);
    break;
  }

  // ── Frame ──────────────────────────────────────────────────────────
  case Opcode::ENTER: {
    uint16_t n = ReadPcU16();
    locals_.emplace_back(n, Value::from_i32(0));
    break;
  }
  case Opcode::LEAVE: {
    if (!locals_.empty()) locals_.pop_back();
    break;
  }
  case Opcode::LOCAL_GET: {
    uint16_t idx = ReadPcU16();
    auto& frame = locals_.back();
    if (idx >= frame.size()) {
      RaiseFault(static_cast<uint8_t>(InterruptVector::GPF), "LOCAL.GET out of bounds");
      break;
    }
    Push(frame[idx]);
    break;
  }
  case Opcode::LOCAL_SET: {
    uint16_t idx = ReadPcU16();
    auto& frame = locals_.back();
    if (idx >= frame.size()) {
      RaiseFault(static_cast<uint8_t>(InterruptVector::GPF), "LOCAL.SET out of bounds");
      break;
    }
    frame[idx] = Pop();
    break;
  }
  case Opcode::ARG_GET: {
    uint16_t idx = ReadPcU16();
    int stack_idx = static_cast<int>(fp_) - 1 - idx;
    if (stack_idx < 0 || static_cast<size_t>(stack_idx) >= operand_stack_.size()) {
      RaiseFault(static_cast<uint8_t>(InterruptVector::GPF), "ARG.GET out of bounds");
      break;
    }
    Push(operand_stack_[stack_idx]);
    break;
  }

  // ── Type conversion ────────────────────────────────────────────────
  case Opcode::I32_EXTEND_S: { Push(Value::from_i64(static_cast<int64_t>(Pop().as_i32()))); break; }
  case Opcode::I32_EXTEND_U: { Push(Value::from_i64(static_cast<int64_t>(static_cast<uint32_t>(Pop().as_i32())))); break; }
  case Opcode::I64_WRAP:     { Push(Value::from_i32(static_cast<int32_t>(Pop().as_i64()))); break; }
  case Opcode::F32_DEMOTE:   { Push(Value::from_f32(static_cast<float>(Pop().as_f64()))); break; }
  case Opcode::F64_PROMOTE:  { Push(Value::from_f64(static_cast<double>(Pop().as_f32()))); break; }
  case Opcode::I32_TRUNC_F32_S: { Push(Value::from_i32(static_cast<int32_t>(std::trunc(Pop().as_f32())))); break; }
  case Opcode::I32_TRUNC_F32_U: { Push(Value::from_i32(static_cast<int32_t>(static_cast<uint32_t>(std::trunc(Pop().as_f32()))))); break; }
  case Opcode::I32_TRUNC_F64_S: { Push(Value::from_i32(static_cast<int32_t>(std::trunc(Pop().as_f64())))); break; }
  case Opcode::I32_TRUNC_F64_U: { Push(Value::from_i32(static_cast<int32_t>(static_cast<uint32_t>(std::trunc(Pop().as_f64()))))); break; }
  case Opcode::I64_TRUNC_F32_S: { Push(Value::from_i64(static_cast<int64_t>(std::trunc(Pop().as_f32())))); break; }
  case Opcode::I64_TRUNC_F32_U: { Push(Value::from_i64(static_cast<int64_t>(static_cast<uint64_t>(std::trunc(Pop().as_f32()))))); break; }
  case Opcode::I64_TRUNC_F64_S: { Push(Value::from_i64(static_cast<int64_t>(std::trunc(Pop().as_f64())))); break; }
  case Opcode::I64_TRUNC_F64_U: { Push(Value::from_i64(static_cast<int64_t>(static_cast<uint64_t>(std::trunc(Pop().as_f64()))))); break; }
  case Opcode::F32_CONVERT_I32_S: { Push(Value::from_f32(static_cast<float>(Pop().as_i32()))); break; }
  case Opcode::F32_CONVERT_I32_U: { Push(Value::from_f32(static_cast<float>(static_cast<uint32_t>(Pop().as_i32())))); break; }
  case Opcode::F32_CONVERT_I64_S: { Push(Value::from_f32(static_cast<float>(Pop().as_i64()))); break; }
  case Opcode::F32_CONVERT_I64_U: { Push(Value::from_f32(static_cast<float>(static_cast<uint64_t>(Pop().as_i64())))); break; }
  case Opcode::F64_CONVERT_I32_S: { Push(Value::from_f64(static_cast<double>(Pop().as_i32()))); break; }
  case Opcode::F64_CONVERT_I32_U: { Push(Value::from_f64(static_cast<double>(static_cast<uint32_t>(Pop().as_i32())))); break; }
  case Opcode::F64_CONVERT_I64_S: { Push(Value::from_f64(static_cast<double>(Pop().as_i64()))); break; }
  case Opcode::F64_CONVERT_I64_U: { Push(Value::from_f64(static_cast<double>(static_cast<uint64_t>(Pop().as_i64())))); break; }

  // ── Privilege ──────────────────────────────────────────────────────
  case Opcode::SYSCALL: {
    uint16_t num = ReadPcU16();
    uint32_t cur_fp = static_cast<uint32_t>(operand_stack_.size());
    call_stack_.push_back({pc, ring, fp_, cur_fp});
    locals_.emplace_back();
    ring = Ring::Kernel;
    on_syscall_(num, *this);
    break;
  }
  case Opcode::SYSRET: {
    if (call_stack_.empty()) {
      RaiseFault(static_cast<uint8_t>(InterruptVector::StackFault), "SYSRET with empty call stack");
      break;
    }
    CallFrame frame = call_stack_.back(); call_stack_.pop_back();
    locals_.pop_back();
    pc   = frame.ret_pc;
    ring = Ring::User;
    fp_  = frame.fp;
    break;
  }
  case Opcode::HYPERCALL: {
    RequireRing(Ring::Kernel, "HYPERCALL");
    if (has_fault_) break;
    uint16_t num = ReadPcU16();
    uint32_t cur_fp = static_cast<uint32_t>(operand_stack_.size());
    call_stack_.push_back({pc, ring, fp_, cur_fp});
    locals_.emplace_back();
    ring = Ring::Hypervisor;
    on_hypercall_(num, *this);
    break;
  }
  case Opcode::HYPERET: {
    if (call_stack_.empty()) {
      RaiseFault(static_cast<uint8_t>(InterruptVector::StackFault), "HYPERET with empty call stack");
      break;
    }
    CallFrame frame = call_stack_.back(); call_stack_.pop_back();
    locals_.pop_back();
    pc   = frame.ret_pc;
    ring = frame.ret_ring;
    fp_  = frame.fp;
    break;
  }
  case Opcode::RING_GET: { Push(Value::from_i32(static_cast<int32_t>(ring))); break; }
  case Opcode::CLI: { RequireRing(Ring::Kernel, "CLI"); if (!has_fault_) interrupts_enabled = false; break; }
  case Opcode::STI: { RequireRing(Ring::Kernel, "STI"); if (!has_fault_) interrupts_enabled = true;  break; }
  case Opcode::PAGE_MAP: {
    RequireRing(Ring::Hypervisor, "PAGE.MAP");
    if (has_fault_) break;
    int32_t  flags = Pop().as_i32();
    uint32_t virt  = Pop().as_ptr();
    uint32_t phys  = Pop().as_ptr();
    mem_.MapPage(virt, phys, static_cast<uint8_t>(flags));
    break;
  }
  case Opcode::PAGE_UNMAP: {
    RequireRing(Ring::Hypervisor, "PAGE.UNMAP");
    if (has_fault_) break;
    mem_.UnmapPage(Pop().as_ptr());
    break;
  }
  case Opcode::PTBR_SET: { RequireRing(Ring::Hypervisor, "PTBR.SET"); if (!has_fault_) ptbr_ = Pop().as_ptr(); break; }
  case Opcode::PTBR_GET: { RequireRing(Ring::Hypervisor, "PTBR.GET"); if (!has_fault_) Push(Value::from_ptr(ptbr_)); break; }
  case Opcode::IVT_SET:  { RequireRing(Ring::Hypervisor, "IVT.SET");  if (!has_fault_) ivt_  = Pop().as_ptr(); break; }
  case Opcode::INT: {
    uint8_t  vec         = ReadPcByte();
    uint32_t handler_addr = static_cast<uint32_t>(mem_.Read32(ivt_ + vec * 4, Ring::Hypervisor));
    uint32_t cur_fp = static_cast<uint32_t>(operand_stack_.size());
    call_stack_.push_back({pc, ring, fp_, cur_fp});
    locals_.emplace_back();
    pc = handler_addr;
    break;
  }
  case Opcode::IRET: {
    if (call_stack_.empty()) {
      RaiseFault(static_cast<uint8_t>(InterruptVector::StackFault), "IRET with empty call stack");
      break;
    }
    CallFrame frame = call_stack_.back(); call_stack_.pop_back();
    locals_.pop_back();
    pc   = frame.ret_pc;
    ring = frame.ret_ring;
    fp_  = frame.fp;
    break;
  }

  default:
    RaiseFault(static_cast<uint8_t>(InterruptVector::GPF),
               "Unknown opcode: 0x" + std::to_string(static_cast<uint8_t>(op)));
    break;
  }

  if (!has_fault_ && mem_.has_fault()) {
    HorizonFault mf = mem_.take_fault();
    RaiseFault(mf.vector, std::move(mf.message), mf.address);
  }

  return !has_fault_;
}

void CPU::Run(uint64_t max_steps) {
  for (uint64_t i = 0; i < max_steps && !halted_; ++i)
    Step();
}

}  // namespace horizon
