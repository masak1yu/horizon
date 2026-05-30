// Minimal smoke test for the C++ VM implementation.
// Build: clang++ -std=c++17 -Iinclude src/memory.cc src/cpu.cc src/loader.cc src/main_test.cc -o hz_test
#include "horizon_vm/cpu.h"
#include "horizon_vm/memory.h"
#include "horizon_vm/opcodes.h"
#include "horizon_vm/types.h"
#include <cassert>
#include <cstdio>
#include <cstring>
#include <vector>

using namespace horizon;

static Memory* g_mem = nullptr;

// Build a tiny bytecode program and load it into memory.
static uint32_t LoadProgram(Memory& mem, const std::vector<uint8_t>& code,
                             uint32_t virt_base = 0x01000000) {
  uint32_t n_pages = (static_cast<uint32_t>(code.size()) + kPageSize - 1) / kPageSize + 1;
  uint32_t phys    = mem.AllocPages(n_pages, 0);
  for (uint32_t p = 0; p < n_pages; ++p)
    mem.MapPage(virt_base + p * kPageSize, phys + p * kPageSize,
                PAGE_PRESENT | PAGE_READ | PAGE_EXEC | PAGE_USER);
  mem.WriteBytesPhys(phys, code.data(), code.size());
  return virt_base;
}

static CPU MakeVM(Memory& mem, const std::vector<uint8_t>& code) {
  uint32_t entry = LoadProgram(mem, code);
  CPU cpu(mem, [](uint16_t, CPU&){}, [](uint16_t, CPU&){});
  cpu.pc   = entry;
  cpu.ring = Ring::User;
  return cpu;
}

static void TestAdd() {
  Memory mem(64 * kPageSize);
  // PUSH.I32 3, PUSH.I32 4, I32.ADD, RET.VAL
  std::vector<uint8_t> code = {
    static_cast<uint8_t>(Opcode::PUSH_I32), 3, 0, 0, 0,
    static_cast<uint8_t>(Opcode::PUSH_I32), 4, 0, 0, 0,
    static_cast<uint8_t>(Opcode::I32_ADD),
    static_cast<uint8_t>(Opcode::RET_VAL),
  };
  auto cpu = MakeVM(mem, code);
  cpu.Run(100);
  assert(cpu.is_halted());
  assert(!cpu.operand_stack().empty());
  assert(cpu.operand_stack().back().as_i32() == 7);
  std::puts("PASS: 3 + 4 = 7");
}

static void TestNeg() {
  Memory mem(64 * kPageSize);
  std::vector<uint8_t> code = {
    static_cast<uint8_t>(Opcode::PUSH_I32), 42, 0, 0, 0,
    static_cast<uint8_t>(Opcode::I32_NEG),
    static_cast<uint8_t>(Opcode::RET_VAL),
  };
  auto cpu = MakeVM(mem, code);
  cpu.Run(100);
  assert(cpu.operand_stack().back().as_i32() == -42);
  std::puts("PASS: NEG(42) = -42");
}

static void TestJZ() {
  Memory mem(64 * kPageSize);
  // PUSH.I32 0, JZ +5 (skip PUSH.I32 1), PUSH.I32 42, RET.VAL
  // JZ offset is relative to end of JZ instruction (after 4-byte immediate)
  // skip: PUSH.I32 99, RET.VAL
  //   PUSH.I32 0      [5 bytes]
  //   JZ skip         [5 bytes: opcode + 4-byte offset]
  //   PUSH.I32 1      [5 bytes]  ← skipped
  //   RET.VAL         [1 byte]   ← skipped (unreachable)
  //   PUSH.I32 99     [5 bytes]
  //   RET.VAL         [1 byte]
  // JZ offset from (pc after JZ) to skip label:
  //   JZ at offset 5, its immediate at offset 6, PC after JZ = 10
  //   skip label at offset 15 (after PUSH.I32 0 [5] + JZ [5] + PUSH.I32 1 [5])
  //   relative = 15 - 10 = 5
  std::vector<uint8_t> code = {
    static_cast<uint8_t>(Opcode::PUSH_I32),  0, 0, 0, 0,   // [0..4]
    static_cast<uint8_t>(Opcode::JZ),         5, 0, 0, 0,   // [5..9]: offset=5 → skip to 10+5=15
    static_cast<uint8_t>(Opcode::PUSH_I32),   1, 0, 0, 0,   // [10..14] skipped
    static_cast<uint8_t>(Opcode::RET_VAL),                   // [15] skipped... wait
  };
  // Actually let me re-layout:
  // [0..4]  PUSH.I32 0
  // [5..9]  JZ offset=5 (skip 5 bytes ahead from PC=10 → jump to 15)
  // [10..14] PUSH.I32 1     ← skipped
  // [15]    RET.VAL         ← skipped (unreachable from JZ path)
  // But if JZ jumps to 15 which is RET.VAL... we'd return with stack empty.
  // Let me fix: add PUSH.I32 99 at 15.
  (void)code;
  code = {
    static_cast<uint8_t>(Opcode::PUSH_I32),  0, 0, 0, 0,   // 0
    static_cast<uint8_t>(Opcode::JZ),         5, 0, 0, 0,   // 5  → jump to 10+5=15
    static_cast<uint8_t>(Opcode::PUSH_I32),   1, 0, 0, 0,   // 10 skipped
    static_cast<uint8_t>(Opcode::RET_VAL),                   // 15 skipped
    static_cast<uint8_t>(Opcode::PUSH_I32),  99, 0, 0, 0,   // wait, 15 should be PUSH_I32 99
    static_cast<uint8_t>(Opcode::RET_VAL),
  };
  // layout:
  // 0-4:  PUSH.I32 0
  // 5-9:  JZ 5  (jumps to PC=10+5=15)
  // 10-14: PUSH.I32 1
  // 15:   RET.VAL    ← this is wrong, 15 should be PUSH_I32 99
  // Let me just use a simpler layout:
  code = {
    // 0: PUSH.I32 0
    static_cast<uint8_t>(Opcode::PUSH_I32), 0, 0, 0, 0,
    // 5: JZ offset=5 → jumps to 10+5=15
    static_cast<uint8_t>(Opcode::JZ), 5, 0, 0, 0,
    // 10: PUSH.I32 1 (not taken)
    static_cast<uint8_t>(Opcode::PUSH_I32), 1, 0, 0, 0,
    // 15: PUSH.I32 99 (taken by JZ)
    static_cast<uint8_t>(Opcode::PUSH_I32), 99, 0, 0, 0,
    // 20: RET.VAL
    static_cast<uint8_t>(Opcode::RET_VAL),
  };
  auto cpu = MakeVM(mem, code);
  cpu.Run(100);
  // JZ took the branch: skipped PUSH.I32 1 at 10, jumped to 15 (PUSH.I32 99), then RET.VAL
  // Stack: [99]
  assert(cpu.operand_stack().back().as_i32() == 99);
  std::puts("PASS: JZ branches correctly");
}

static void TestCall() {
  Memory mem(64 * kPageSize);
  // main: CALL @double 0, RET.VAL
  // double: PUSH.I32 21, PUSH.I32 2, I32.MUL, RET.VAL
  //
  // Layout:
  // 0: CALL n=0 offset=?  [0: opcode, 1: n_args=0, 2-5: offset i32]
  // 6: RET.VAL            [6]
  // 7: PUSH.I32 21        [7-11]
  // 12: PUSH.I32 2        [12-16]
  // 17: I32.MUL           [17]
  // 18: RET.VAL           [18]
  //
  // CALL is at offset 0, its immediate is at 2, PC after CALL = 6
  // Target (@double) = 7
  // relative offset = 7 - 6 = 1
  std::vector<uint8_t> code = {
    static_cast<uint8_t>(Opcode::CALL), 0, 1, 0, 0, 0,  // CALL n=0 offset=1
    static_cast<uint8_t>(Opcode::RET_VAL),               // 6
    static_cast<uint8_t>(Opcode::PUSH_I32), 21, 0, 0, 0, // 7
    static_cast<uint8_t>(Opcode::PUSH_I32),  2, 0, 0, 0, // 12
    static_cast<uint8_t>(Opcode::I32_MUL),               // 17
    static_cast<uint8_t>(Opcode::RET_VAL),               // 18
  };
  auto cpu = MakeVM(mem, code);
  cpu.Run(200);
  assert(cpu.operand_stack().back().as_i32() == 42);
  std::puts("PASS: CALL returns 42");
}

int main() {
  std::puts("=== Horizon VM C++ Smoke Tests ===");
  TestAdd();
  TestNeg();
  TestJZ();
  TestCall();
  std::puts("=== All tests passed ===");
  return 0;
}
