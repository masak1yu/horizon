#pragma once
#include "memory.h"
#include "opcodes.h"
#include <cstdint>
#include <vector>

namespace horizon {

constexpr uint32_t kMagic = 0x43425A48u;  // "HZBC" little-endian

enum class SectionType : uint32_t {
  Code    = 0x01,
  Data    = 0x02,
  ROData  = 0x03,
  BSS     = 0x04,
  Imports = 0x05,
  Exports = 0x06,
  Debug   = 0x07,
  Meta    = 0x08,
};

enum ModuleFlags : uint32_t {
  MODULE_EXECUTABLE = 1 << 0,
  MODULE_LIBRARY    = 1 << 1,
  MODULE_KERNEL     = 1 << 2,
  MODULE_HYPERVISOR = 1 << 3,
};

struct SectionEntry {
  SectionType type;
  uint32_t    flags;
  uint32_t    offset;
  uint32_t    size;
  uint32_t    align;
};

struct Module {
  uint16_t                 version_major;
  uint16_t                 version_minor;
  uint32_t                 flags;
  uint32_t                 entry_point;
  Ring                     min_ring;
  std::vector<SectionEntry> sections;
  std::vector<uint8_t>     raw;  // owned copy of bytecode
};

struct LoadedModule {
  uint32_t code_virt_base;
  uint32_t data_virt_base;
  uint32_t rodata_virt_base;
  uint32_t entry_virt_addr;
};

// Parse a .hzbc buffer into a Module descriptor.
// Throws std::runtime_error on invalid format.
Module ParseModule(const uint8_t* data, size_t size);

// Load a parsed module into a Memory instance.
// virt_base: where to place the module in virtual address space.
// Throws std::runtime_error on ring/permission error.
LoadedModule LoadModule(const Module& module,
                        Memory& mem,
                        uint32_t virt_base,
                        Ring current_ring);

}  // namespace horizon
