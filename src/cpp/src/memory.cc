#include "horizon_vm/memory.h"
#include "horizon_vm/opcodes.h"
#include <cstring>

namespace horizon {

namespace {

template <typename T>
T ReadLE(const uint8_t* p) {
  T v;
  std::memcpy(&v, p, sizeof(T));
  return v;
}

template <typename T>
void WriteLE(uint8_t* p, T v) {
  std::memcpy(p, &v, sizeof(T));
}

}  // namespace

Memory::Memory(size_t total_bytes) : physical_(total_bytes, 0) {}

void Memory::RaiseFault(uint8_t vector, std::string msg, uint32_t addr) {
  if (!has_fault_) {
    has_fault_     = true;
    pending_fault_ = HorizonFault(vector, std::move(msg), addr);
  }
}

uint32_t Memory::AllocPages(uint32_t count, uint8_t /*flags*/) {
  uint32_t offset = alloc_ptr_;
  uint32_t size   = count * kPageSize;
  if (static_cast<size_t>(offset) + size > physical_.size())
    __builtin_trap();  // physical memory exhausted — unrecoverable configuration error
  alloc_ptr_ += size;
  return offset;
}

void Memory::MapPage(uint32_t virt_addr, uint32_t phys_offset, uint8_t flags) {
  uint32_t page_num = virt_addr >> 12;
  page_table_[page_num] = {phys_offset, flags};
}

void Memory::UnmapPage(uint32_t virt_addr) {
  page_table_.erase(virt_addr >> 12);
}

uint32_t Memory::Resolve(uint32_t virt_addr, uint8_t access_flags, Ring ring) {
  uint32_t page_num = virt_addr >> 12;
  uint32_t offset   = virt_addr & 0xFFF;

  auto it = page_table_.find(page_num);
  if (it == page_table_.end() || !(it->second.flags & PAGE_PRESENT)) {
    RaiseFault(static_cast<uint8_t>(InterruptVector::PageFault),
               "Page not mapped: 0x" + std::to_string(virt_addr), virt_addr);
    return 0;
  }
  const auto& entry = it->second;
  if (ring == Ring::User && !(entry.flags & PAGE_USER)) {
    RaiseFault(static_cast<uint8_t>(InterruptVector::GPF),
               "Ring 2 access to kernel page", virt_addr);
    return 0;
  }
  if ((access_flags & PAGE_WRITE) && !(entry.flags & PAGE_WRITE)) {
    RaiseFault(static_cast<uint8_t>(InterruptVector::GPF),
               "Write to read-only page", virt_addr);
    return 0;
  }
  if ((access_flags & PAGE_EXEC) && !(entry.flags & PAGE_EXEC)) {
    RaiseFault(static_cast<uint8_t>(InterruptVector::GPF),
               "Execute on non-exec page", virt_addr);
    return 0;
  }
  return entry.phys_offset + offset;
}

uint8_t Memory::Read8(uint32_t virt, Ring ring) {
  return physical_[Resolve(virt, PAGE_READ, ring)];
}

uint16_t Memory::Read16(uint32_t virt, Ring ring) {
  return ReadLE<uint16_t>(&physical_[Resolve(virt, PAGE_READ, ring)]);
}

int32_t Memory::Read32(uint32_t virt, Ring ring) {
  return ReadLE<int32_t>(&physical_[Resolve(virt, PAGE_READ, ring)]);
}

int64_t Memory::Read64(uint32_t virt, Ring ring) {
  return ReadLE<int64_t>(&physical_[Resolve(virt, PAGE_READ, ring)]);
}

float Memory::ReadF32(uint32_t virt, Ring ring) {
  return ReadLE<float>(&physical_[Resolve(virt, PAGE_READ, ring)]);
}

double Memory::ReadF64(uint32_t virt, Ring ring) {
  return ReadLE<double>(&physical_[Resolve(virt, PAGE_READ, ring)]);
}

void Memory::Write8(uint32_t virt, uint8_t val, Ring ring) {
  physical_[Resolve(virt, PAGE_WRITE, ring)] = val;
}

void Memory::Write16(uint32_t virt, uint16_t val, Ring ring) {
  WriteLE<uint16_t>(&physical_[Resolve(virt, PAGE_WRITE, ring)], val);
}

void Memory::Write32(uint32_t virt, int32_t val, Ring ring) {
  WriteLE<int32_t>(&physical_[Resolve(virt, PAGE_WRITE, ring)], val);
}

void Memory::Write64(uint32_t virt, int64_t val, Ring ring) {
  WriteLE<int64_t>(&physical_[Resolve(virt, PAGE_WRITE, ring)], val);
}

void Memory::WriteF32(uint32_t virt, float val, Ring ring) {
  WriteLE<float>(&physical_[Resolve(virt, PAGE_WRITE, ring)], val);
}

void Memory::WriteF64(uint32_t virt, double val, Ring ring) {
  WriteLE<double>(&physical_[Resolve(virt, PAGE_WRITE, ring)], val);
}

void Memory::WriteBytesPhys(uint32_t phys_offset, const uint8_t* data, size_t len) {
  std::memcpy(&physical_[phys_offset], data, len);
}

const uint8_t* Memory::ReadBytesPhys(uint32_t phys_offset, size_t /*len*/) const {
  return &physical_[phys_offset];
}

}  // namespace horizon
