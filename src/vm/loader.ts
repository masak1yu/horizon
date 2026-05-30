import { Memory } from './memory.js';
import { PageFlags, PAGE_SIZE } from './types.js';
import { Ring } from './opcodes.js';

export const MAGIC = 0x43425A48; // "HZBC" little-endian

export const enum SectionType {
  Code    = 0x01,
  Data    = 0x02,
  ROData  = 0x03,
  BSS     = 0x04,
  Imports = 0x05,
  Exports = 0x06,
  Debug   = 0x07,
  Meta    = 0x08,
}

export const enum ModuleFlags {
  Executable  = 1 << 0,
  Library     = 1 << 1,
  Kernel      = 1 << 2,
  Hypervisor  = 1 << 3,
}

export interface SectionEntry {
  type: SectionType;
  flags: number;
  offset: number;
  size: number;
  align: number;
}

export interface Module {
  versionMajor: number;
  versionMinor: number;
  flags: ModuleFlags;
  entryPoint: number;
  minRing: Ring;
  sections: SectionEntry[];
  data: DataView;
}

export function parseModule(buffer: ArrayBuffer): Module {
  const view = new DataView(buffer);

  if (view.getUint32(0, true) !== MAGIC) {
    throw new Error('Invalid magic: not a .hzbc file');
  }

  const versionMajor = view.getUint16(4, true);
  const versionMinor = view.getUint16(6, true);
  const flags = view.getUint32(8, true) as ModuleFlags;
  const entryPoint = view.getUint32(12, true);
  const minRing = view.getUint16(16, true) as Ring;
  const numSections = view.getUint16(18, true);

  const sections: SectionEntry[] = [];
  const sectionTableStart = 32;

  for (let i = 0; i < numSections; i++) {
    const base = sectionTableStart + i * 20;
    sections.push({
      type:   view.getUint32(base + 0,  true) as SectionType,
      flags:  view.getUint32(base + 4,  true),
      offset: view.getUint32(base + 8,  true),
      size:   view.getUint32(base + 12, true),
      align:  view.getUint32(base + 16, true),
    });
  }

  return { versionMajor, versionMinor, flags, entryPoint, minRing, sections, data: view };
}

export interface LoadedModule {
  codeVirtBase: number;
  dataVirtBase: number;
  rodataVirtBase: number;
  entryVirtAddr: number;
}

export function loadModule(
  module: Module,
  mem: Memory,
  virtBase: number,
  currentRing: Ring,
): LoadedModule {
  if (module.minRing < currentRing) {
    throw new Error(`Module requires Ring ${module.minRing}, currently at Ring ${currentRing}`);
  }

  const isExec  = (module.flags & ModuleFlags.Executable) !== 0;
  const isKernel = (module.flags & ModuleFlags.Kernel) !== 0;
  const isHypervisor = (module.flags & ModuleFlags.Hypervisor) !== 0;

  const baseFlags = isHypervisor
    ? (PageFlags.Present | PageFlags.Read)
    : isKernel
    ? (PageFlags.Present | PageFlags.Read | PageFlags.User)
    : (PageFlags.Present | PageFlags.Read | PageFlags.User);

  let codeVirtBase = 0;
  let dataVirtBase = 0;
  let rodataVirtBase = 0;
  let cursor = virtBase;

  for (const section of module.sections) {
    const alignedCursor = (cursor + section.align - 1) & ~(section.align - 1);
    cursor = alignedCursor;

    const numPages = Math.ceil(section.size / PAGE_SIZE);
    const physOffset = mem.allocPages(numPages, 0);

    let pageFlags = baseFlags;
    if (section.flags & 0x02) pageFlags |= PageFlags.Write;
    if (section.flags & 0x04) pageFlags |= PageFlags.Exec;

    for (let p = 0; p < numPages; p++) {
      mem.mapPage(cursor + p * PAGE_SIZE, physOffset + p * PAGE_SIZE, pageFlags);
    }

    if (section.type !== SectionType.BSS && section.size > 0) {
      const srcBytes = new Uint8Array(module.data.buffer, section.offset, section.size);
      mem.writeBytesPhys(physOffset, srcBytes);
    }

    switch (section.type) {
      case SectionType.Code:   codeVirtBase   = cursor; break;
      case SectionType.Data:   dataVirtBase   = cursor; break;
      case SectionType.ROData: rodataVirtBase = cursor; break;
    }

    cursor += numPages * PAGE_SIZE;
  }

  const entryVirtAddr = module.entryPoint === 0xFFFFFFFF
    ? 0xFFFFFFFF
    : codeVirtBase + module.entryPoint;

  return { codeVirtBase, dataVirtBase, rodataVirtBase, entryVirtAddr };
}

export function buildModule(
  code: Uint8Array,
  data?: Uint8Array,
  rodata?: Uint8Array,
  flags: ModuleFlags = ModuleFlags.Executable,
  entryPoint = 0,
  minRing: Ring = Ring.User,
): ArrayBuffer {
  const sections: Array<{ type: SectionType; flags: number; data: Uint8Array }> = [];
  sections.push({ type: SectionType.Code, flags: 0x01 | 0x04, data: code });
  if (data)   sections.push({ type: SectionType.Data,   flags: 0x01 | 0x02, data });
  if (rodata) sections.push({ type: SectionType.ROData, flags: 0x01,        data: rodata });

  const sectionTableSize = sections.length * 20;
  const headerSize = 32 + sectionTableSize;

  let totalDataSize = 0;
  for (const s of sections) totalDataSize += s.data.byteLength;

  const buf = new ArrayBuffer(headerSize + totalDataSize);
  const view = new DataView(buf);
  const u8 = new Uint8Array(buf);

  view.setUint32(0, MAGIC, true);
  view.setUint16(4, 0, true); // major
  view.setUint16(6, 1, true); // minor
  view.setUint32(8, flags, true);
  view.setUint32(12, entryPoint, true);
  view.setUint16(16, minRing, true);
  view.setUint16(18, sections.length, true);
  // code_size at 20
  view.setUint32(20, code.byteLength, true);
  // reserved 24-31 = 0

  let dataOffset = headerSize;
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    const base = 32 + i * 20;
    view.setUint32(base + 0,  s.type, true);
    view.setUint32(base + 4,  s.flags, true);
    view.setUint32(base + 8,  dataOffset, true);
    view.setUint32(base + 12, s.data.byteLength, true);
    view.setUint32(base + 16, 1, true); // align = 1
    u8.set(s.data, dataOffset);
    dataOffset += s.data.byteLength;
  }

  return buf;
}
