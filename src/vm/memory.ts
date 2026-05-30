import { PageFlags, PAGE_SIZE, fault } from './types.js';
import { InterruptVector, Ring } from './opcodes.js';

export interface PageTableEntry {
  physOffset: number; // byte offset into the physical buffer
  flags: number;      // PageFlags bitmask
}

export class Memory {
  private readonly physical: ArrayBuffer;
  private readonly view: DataView;
  private readonly pageTable: Map<number, PageTableEntry> = new Map();
  private allocPtr = 0;

  constructor(totalBytes: number) {
    this.physical = new ArrayBuffer(totalBytes);
    this.view = new DataView(this.physical);
  }

  allocPages(count: number, flags: number): number {
    const physOffset = this.allocPtr;
    const size = count * PAGE_SIZE;
    if (physOffset + size > this.physical.byteLength) {
      throw fault(InterruptVector.GPF, 'Out of physical memory');
    }
    this.allocPtr += size;
    return physOffset;
  }

  mapPage(virtAddr: number, physOffset: number, flags: number): void {
    const pageNum = (virtAddr >>> 0) >>> 12;
    this.pageTable.set(pageNum, { physOffset, flags });
  }

  unmapPage(virtAddr: number): void {
    const pageNum = (virtAddr >>> 0) >>> 12;
    this.pageTable.delete(pageNum);
  }

  private resolve(virtAddr: number, accessFlags: number, ring: Ring): number {
    const vAddr = virtAddr >>> 0;
    const pageNum = vAddr >>> 12;
    const offset = vAddr & 0xFFF;
    const entry = this.pageTable.get(pageNum);

    if (!entry || !(entry.flags & PageFlags.Present)) {
      throw fault(InterruptVector.PageFault, `Page not mapped: 0x${vAddr.toString(16)}`, vAddr);
    }
    if (ring === Ring.User && !(entry.flags & PageFlags.User)) {
      throw fault(InterruptVector.GPF, `Ring 2 access to kernel page: 0x${vAddr.toString(16)}`, vAddr);
    }
    if ((accessFlags & PageFlags.Write) && !(entry.flags & PageFlags.Write)) {
      throw fault(InterruptVector.GPF, `Write to read-only page: 0x${vAddr.toString(16)}`, vAddr);
    }
    if ((accessFlags & PageFlags.Exec) && !(entry.flags & PageFlags.Exec)) {
      throw fault(InterruptVector.GPF, `Execute on non-exec page: 0x${vAddr.toString(16)}`, vAddr);
    }
    return entry.physOffset + offset;
  }

  read8(virt: number, ring: Ring): number {
    const phys = this.resolve(virt, PageFlags.Read, ring);
    return this.view.getUint8(phys);
  }

  read16(virt: number, ring: Ring): number {
    const phys = this.resolve(virt, PageFlags.Read, ring);
    return this.view.getUint16(phys, true);
  }

  read32(virt: number, ring: Ring): number {
    const phys = this.resolve(virt, PageFlags.Read, ring);
    return this.view.getInt32(phys, true);
  }

  read64(virt: number, ring: Ring): bigint {
    const phys = this.resolve(virt, PageFlags.Read, ring);
    return this.view.getBigInt64(phys, true);
  }

  readF32(virt: number, ring: Ring): number {
    const phys = this.resolve(virt, PageFlags.Read, ring);
    return this.view.getFloat32(phys, true);
  }

  readF64(virt: number, ring: Ring): number {
    const phys = this.resolve(virt, PageFlags.Read, ring);
    return this.view.getFloat64(phys, true);
  }

  write8(virt: number, value: number, ring: Ring): void {
    const phys = this.resolve(virt, PageFlags.Write, ring);
    this.view.setUint8(phys, value);
  }

  write16(virt: number, value: number, ring: Ring): void {
    const phys = this.resolve(virt, PageFlags.Write, ring);
    this.view.setUint16(phys, value, true);
  }

  write32(virt: number, value: number, ring: Ring): void {
    const phys = this.resolve(virt, PageFlags.Write, ring);
    this.view.setInt32(phys, value, true);
  }

  write64(virt: number, value: bigint, ring: Ring): void {
    const phys = this.resolve(virt, PageFlags.Write, ring);
    this.view.setBigInt64(phys, value, true);
  }

  writeF32(virt: number, value: number, ring: Ring): void {
    const phys = this.resolve(virt, PageFlags.Write, ring);
    this.view.setFloat32(phys, value, true);
  }

  writeF64(virt: number, value: number, ring: Ring): void {
    const phys = this.resolve(virt, PageFlags.Write, ring);
    this.view.setFloat64(phys, value, true);
  }

  readBytesPhys(physOffset: number, length: number): Uint8Array {
    return new Uint8Array(this.physical, physOffset, length);
  }

  writeBytesPhys(physOffset: number, data: Uint8Array): void {
    new Uint8Array(this.physical, physOffset, data.length).set(data);
  }

  getPhysSize(): number {
    return this.physical.byteLength;
  }
}
