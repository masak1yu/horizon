#pragma once
#include "opcodes.h"
#include "types.h"
#include <cstddef>
#include <memory>
#include <unordered_map>
#include <vector>

namespace horizon {

struct PageTableEntry {
  uint32_t phys_offset;
  uint8_t  flags;
};

class Memory {
 public:
  explicit Memory(size_t total_bytes);
  ~Memory() = default;

  Memory(const Memory&) = delete;
  Memory& operator=(const Memory&) = delete;

  uint32_t AllocPages(uint32_t count, uint8_t flags);
  void MapPage(uint32_t virt_addr, uint32_t phys_offset, uint8_t flags);
  void UnmapPage(uint32_t virt_addr);

  uint8_t  Read8(uint32_t virt, Ring ring);
  uint16_t Read16(uint32_t virt, Ring ring);
  int32_t  Read32(uint32_t virt, Ring ring);
  int64_t  Read64(uint32_t virt, Ring ring);
  float    ReadF32(uint32_t virt, Ring ring);
  double   ReadF64(uint32_t virt, Ring ring);

  void Write8(uint32_t virt, uint8_t val, Ring ring);
  void Write16(uint32_t virt, uint16_t val, Ring ring);
  void Write32(uint32_t virt, int32_t val, Ring ring);
  void Write64(uint32_t virt, int64_t val, Ring ring);
  void WriteF32(uint32_t virt, float val, Ring ring);
  void WriteF64(uint32_t virt, double val, Ring ring);

  // Direct physical access (for loader)
  void WriteBytesPhys(uint32_t phys_offset, const uint8_t* data, size_t len);
  const uint8_t* ReadBytesPhys(uint32_t phys_offset, size_t len) const;

  size_t total_bytes() const { return physical_.size(); }

  bool has_fault() const { return has_fault_; }
  const HorizonFault& last_fault() const { return pending_fault_; }
  HorizonFault take_fault() {
    has_fault_ = false;
    return pending_fault_;
  }

 private:
  void RaiseFault(uint8_t vector, std::string msg, uint32_t addr = 0);
  uint32_t Resolve(uint32_t virt_addr, uint8_t access_flags, Ring ring);

  std::vector<uint8_t> physical_;
  std::unordered_map<uint32_t, PageTableEntry> page_table_;  // key = page number
  uint32_t alloc_ptr_ = 0;
  bool         has_fault_     = false;
  HorizonFault pending_fault_;
};

}  // namespace horizon
