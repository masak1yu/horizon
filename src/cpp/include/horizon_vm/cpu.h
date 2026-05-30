#pragma once
#include "memory.h"
#include "opcodes.h"
#include "types.h"
#include <functional>
#include <vector>

namespace horizon {

struct CallFrame {
  uint32_t ret_pc;
  Ring     ret_ring;
  uint32_t fp;    // operand stack depth at call site (after args)
  uint32_t base;  // operand stack depth before args (for cleanup)
};

class CPU {
 public:
  using HypercallHandler = std::function<void(uint16_t num, CPU& cpu)>;
  using SyscallHandler   = std::function<void(uint16_t num, CPU& cpu)>;

  CPU(Memory& mem,
      HypercallHandler on_hypercall,
      SyscallHandler   on_syscall);

  // Execute one instruction. Returns false when halted.
  bool Step();

  // Run until halted or max_steps reached.
  void Run(uint64_t max_steps = UINT64_MAX);

  bool is_halted() const { return halted_; }

  void Push(Value v);
  Value Pop();
  Value Peek() const;

  const std::vector<Value>& operand_stack() const { return operand_stack_; }

  uint32_t pc   = 0;
  Ring     ring = Ring::User;
  bool     interrupts_enabled = true;

 private:
  void RequireRing(Ring min_ring, const char* op) const;

  uint8_t  ReadPcByte();
  uint16_t ReadPcU16();
  uint32_t ReadPcU32();
  int32_t  ReadPcI32();
  int64_t  ReadPcI64();
  float    ReadPcF32();
  double   ReadPcF64();

  Memory&          mem_;
  HypercallHandler on_hypercall_;
  SyscallHandler   on_syscall_;

  std::vector<Value>              operand_stack_;
  std::vector<CallFrame>          call_stack_;
  std::vector<std::vector<Value>> locals_;

  uint32_t fp_    = 0;
  uint32_t ivt_   = 0;
  uint32_t ptbr_  = 0;
  bool     halted_ = false;
};

}  // namespace horizon
