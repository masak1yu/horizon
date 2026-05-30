#include "horizon_vm/loader.h"
#include <cstring>

namespace horizon {

namespace {

template <typename T>
T ReadLE(const uint8_t* p) {
  T v;
  std::memcpy(&v, p, sizeof(T));
  return v;
}

}  // namespace

std::optional<Module> ParseModule(const uint8_t* data, size_t size,
                                   std::string* error) {
  auto fail = [error](const char* msg) -> std::optional<Module> {
    if (error) *error = msg;
    return std::nullopt;
  };

  if (size < 32)
    return fail("ParseModule: file too small");

  uint32_t magic = ReadLE<uint32_t>(data + 0);
  if (magic != kMagic)
    return fail("ParseModule: invalid magic (not a .hzbc file)");

  Module m;
  m.version_major = ReadLE<uint16_t>(data + 4);
  m.version_minor = ReadLE<uint16_t>(data + 6);
  m.flags         = ReadLE<uint32_t>(data + 8);
  m.entry_point   = ReadLE<uint32_t>(data + 12);
  m.min_ring      = static_cast<Ring>(ReadLE<uint16_t>(data + 16));
  uint16_t n_sections = ReadLE<uint16_t>(data + 18);

  size_t section_table_end = 32 + static_cast<size_t>(n_sections) * 20;
  if (size < section_table_end)
    return fail("ParseModule: truncated section table");

  for (uint16_t i = 0; i < n_sections; ++i) {
    const uint8_t* base = data + 32 + i * 20;
    SectionEntry s;
    s.type   = static_cast<SectionType>(ReadLE<uint32_t>(base + 0));
    s.flags  = ReadLE<uint32_t>(base + 4);
    s.offset = ReadLE<uint32_t>(base + 8);
    s.size   = ReadLE<uint32_t>(base + 12);
    s.align  = ReadLE<uint32_t>(base + 16);
    m.sections.push_back(s);
  }

  m.raw.assign(data, data + size);
  return m;
}

std::optional<LoadedModule> LoadModule(const Module& module, Memory& mem,
                                        uint32_t virt_base, Ring current_ring,
                                        std::string* error) {
  if (module.min_ring < current_ring) {
    if (error) *error = "LoadModule: insufficient ring level";
    return std::nullopt;
  }

  const bool is_kernel     = (module.flags & MODULE_KERNEL) != 0;
  const bool is_hypervisor = (module.flags & MODULE_HYPERVISOR) != 0;

  uint8_t base_page_flags = PAGE_PRESENT | PAGE_READ;
  if (!is_hypervisor) base_page_flags |= PAGE_USER;
  if (!is_kernel && !is_hypervisor) base_page_flags |= PAGE_USER;

  uint32_t code_base   = 0;
  uint32_t data_base   = 0;
  uint32_t rodata_base = 0;
  uint32_t cursor      = virt_base;

  for (const auto& section : module.sections) {
    uint32_t align = section.align > 0 ? section.align : 1;
    cursor = (cursor + align - 1) & ~(align - 1);

    uint32_t n_pages = (section.size + kPageSize - 1) / kPageSize;
    if (n_pages == 0) n_pages = 1;

    uint32_t phys_offset = mem.AllocPages(n_pages, 0);

    uint8_t page_flags = base_page_flags;
    if (section.flags & 0x02) page_flags |= PAGE_WRITE;
    if (section.flags & 0x04) page_flags |= PAGE_EXEC;

    for (uint32_t p = 0; p < n_pages; ++p)
      mem.MapPage(cursor + p * kPageSize, phys_offset + p * kPageSize, page_flags);

    if (section.type != SectionType::BSS && section.size > 0) {
      const uint8_t* src = module.raw.data() + section.offset;
      mem.WriteBytesPhys(phys_offset, src, section.size);
    }

    switch (section.type) {
      case SectionType::Code:   code_base   = cursor; break;
      case SectionType::Data:   data_base   = cursor; break;
      case SectionType::ROData: rodata_base = cursor; break;
      default: break;
    }

    cursor += n_pages * kPageSize;
  }

  uint32_t entry = (module.entry_point == 0xFFFFFFFFu)
      ? 0xFFFFFFFFu
      : code_base + module.entry_point;

  return LoadedModule{code_base, data_base, rodata_base, entry};
}

}  // namespace horizon
