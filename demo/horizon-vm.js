// src/assembler/assembler.ts
function tokenize(src) {
  const tokens = [];
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const stripped = line.replace(/;.*$/, "").trim();
    if (!stripped) continue;
    const parts = stripped.split(/\s+/);
    for (const part of parts) {
      if (part.endsWith(":")) {
        tokens.push({ kind: "label", value: part.slice(0, -1), line: lineNum });
      } else if (part.startsWith("@")) {
        tokens.push({ kind: "labelref", value: part.slice(1), line: lineNum });
      } else if (/^-?\d+\.\d+$/.test(part)) {
        tokens.push({ kind: "float", value: part, line: lineNum });
      } else if (/^-?\d+$/.test(part) || /^0x[0-9a-fA-F]+$/.test(part)) {
        tokens.push({ kind: "int", value: part, line: lineNum });
      } else {
        tokens.push({ kind: "mnemonic", value: part.toUpperCase(), line: lineNum });
      }
    }
  }
  return tokens;
}
function writeI32LE(buf, v) {
  const n = v | 0;
  buf.push(n & 255, n >> 8 & 255, n >> 16 & 255, n >> 24 & 255);
}
function writeI64LE(buf, v) {
  const lo = Number(v & 0xFFFFFFFFn);
  const hi = Number(v >> 32n & 0xFFFFFFFFn);
  writeI32LE(buf, lo);
  writeI32LE(buf, hi);
}
function writeF32LE(buf, v) {
  const fa = new Float32Array([v]);
  const ia = new Int32Array(fa.buffer);
  writeI32LE(buf, ia[0]);
}
function writeF64LE(buf, v) {
  const fa = new Float64Array([v]);
  const ia = new Int32Array(fa.buffer);
  writeI32LE(buf, ia[0]);
  writeI32LE(buf, ia[1]);
}
function writeU16LE(buf, v) {
  buf.push(v & 255, v >> 8 & 255);
}
function parseInt_(s) {
  if (s.startsWith("0x") || s.startsWith("0X")) return parseInt(s, 16);
  return parseInt(s, 10);
}
function assemble(src) {
  const tokens = tokenize(src);
  const labels = /* @__PURE__ */ new Map();
  const buf = [];
  const patches = [];
  let ti = 0;
  function nextToken() {
    if (ti >= tokens.length) throw new Error("Unexpected end of input");
    return tokens[ti++];
  }
  function expectInt() {
    const t = nextToken();
    if (t.kind !== "int") throw new Error(`Line ${t.line}: expected integer, got ${t.kind} "${t.value}"`);
    return parseInt_(t.value);
  }
  function expectFloat() {
    const t = nextToken();
    if (t.kind !== "float" && t.kind !== "int") throw new Error(`Line ${t.line}: expected float`);
    return parseFloat(t.value);
  }
  function expectLabelRef() {
    const t = nextToken();
    if (t.kind === "labelref") return t.value;
    if (t.kind === "int") return t.value;
    throw new Error(`Line ${t.line}: expected @label, got "${t.value}"`);
  }
  while (ti < tokens.length) {
    const tok = tokens[ti++];
    if (tok.kind === "label") {
      labels.set(tok.value, buf.length);
      continue;
    }
    if (tok.kind !== "mnemonic") {
      throw new Error(`Line ${tok.line}: unexpected token "${tok.value}"`);
    }
    const instrStart = buf.length;
    switch (tok.value) {
      case "NOP":
        buf.push(0 /* NOP */);
        break;
      case "HALT":
        buf.push(1 /* HALT */);
        break;
      case "BRK":
        buf.push(2 /* BRK */);
        break;
      case "PUSH.I32":
        buf.push(16 /* PUSH_I32 */);
        writeI32LE(buf, expectInt());
        break;
      case "PUSH.I64":
        buf.push(17 /* PUSH_I64 */);
        writeI64LE(buf, BigInt(expectInt()));
        break;
      case "PUSH.F32":
        buf.push(18 /* PUSH_F32 */);
        writeF32LE(buf, expectFloat());
        break;
      case "PUSH.F64":
        buf.push(19 /* PUSH_F64 */);
        writeF64LE(buf, expectFloat());
        break;
      case "POP":
        buf.push(20 /* POP */);
        break;
      case "DUP":
        buf.push(21 /* DUP */);
        break;
      case "SWAP":
        buf.push(22 /* SWAP */);
        break;
      case "OVER":
        buf.push(23 /* OVER */);
        break;
      case "I32.ADD":
        buf.push(32 /* I32_ADD */);
        break;
      case "I32.SUB":
        buf.push(33 /* I32_SUB */);
        break;
      case "I32.MUL":
        buf.push(34 /* I32_MUL */);
        break;
      case "I32.DIV_S":
        buf.push(35 /* I32_DIV_S */);
        break;
      case "I32.DIV_U":
        buf.push(36 /* I32_DIV_U */);
        break;
      case "I32.REM_S":
        buf.push(37 /* I32_REM_S */);
        break;
      case "I32.REM_U":
        buf.push(38 /* I32_REM_U */);
        break;
      case "I32.NEG":
        buf.push(39 /* I32_NEG */);
        break;
      case "I64.ADD":
        buf.push(40 /* I64_ADD */);
        break;
      case "I64.SUB":
        buf.push(41 /* I64_SUB */);
        break;
      case "I64.MUL":
        buf.push(42 /* I64_MUL */);
        break;
      case "I64.DIV_S":
        buf.push(43 /* I64_DIV_S */);
        break;
      case "I64.DIV_U":
        buf.push(44 /* I64_DIV_U */);
        break;
      case "I64.REM_S":
        buf.push(45 /* I64_REM_S */);
        break;
      case "I64.REM_U":
        buf.push(46 /* I64_REM_U */);
        break;
      case "I64.NEG":
        buf.push(47 /* I64_NEG */);
        break;
      case "F32.ADD":
        buf.push(48 /* F32_ADD */);
        break;
      case "F32.SUB":
        buf.push(49 /* F32_SUB */);
        break;
      case "F32.MUL":
        buf.push(50 /* F32_MUL */);
        break;
      case "F32.DIV":
        buf.push(51 /* F32_DIV */);
        break;
      case "F64.ADD":
        buf.push(52 /* F64_ADD */);
        break;
      case "F64.SUB":
        buf.push(53 /* F64_SUB */);
        break;
      case "F64.MUL":
        buf.push(54 /* F64_MUL */);
        break;
      case "F64.DIV":
        buf.push(55 /* F64_DIV */);
        break;
      case "I32.AND":
        buf.push(64 /* I32_AND */);
        break;
      case "I32.OR":
        buf.push(65 /* I32_OR */);
        break;
      case "I32.XOR":
        buf.push(66 /* I32_XOR */);
        break;
      case "I32.NOT":
        buf.push(67 /* I32_NOT */);
        break;
      case "I32.SHL":
        buf.push(68 /* I32_SHL */);
        break;
      case "I32.SHR_S":
        buf.push(69 /* I32_SHR_S */);
        break;
      case "I32.SHR_U":
        buf.push(70 /* I32_SHR_U */);
        break;
      case "I64.AND":
        buf.push(71 /* I64_AND */);
        break;
      case "I64.OR":
        buf.push(72 /* I64_OR */);
        break;
      case "I64.XOR":
        buf.push(73 /* I64_XOR */);
        break;
      case "I64.NOT":
        buf.push(74 /* I64_NOT */);
        break;
      case "I64.SHL":
        buf.push(75 /* I64_SHL */);
        break;
      case "I64.SHR_S":
        buf.push(76 /* I64_SHR_S */);
        break;
      case "I64.SHR_U":
        buf.push(77 /* I64_SHR_U */);
        break;
      case "I32.EQ":
        buf.push(80 /* I32_EQ */);
        break;
      case "I32.NE":
        buf.push(81 /* I32_NE */);
        break;
      case "I32.LT_S":
        buf.push(82 /* I32_LT_S */);
        break;
      case "I32.LT_U":
        buf.push(83 /* I32_LT_U */);
        break;
      case "I32.LE_S":
        buf.push(84 /* I32_LE_S */);
        break;
      case "I32.LE_U":
        buf.push(85 /* I32_LE_U */);
        break;
      case "I32.GT_S":
        buf.push(86 /* I32_GT_S */);
        break;
      case "I32.GT_U":
        buf.push(87 /* I32_GT_U */);
        break;
      case "I32.GE_S":
        buf.push(88 /* I32_GE_S */);
        break;
      case "I32.GE_U":
        buf.push(89 /* I32_GE_U */);
        break;
      case "I64.EQ":
        buf.push(90 /* I64_EQ */);
        break;
      case "I64.NE":
        buf.push(91 /* I64_NE */);
        break;
      case "I64.LT_S":
        buf.push(92 /* I64_LT_S */);
        break;
      case "I64.LT_U":
        buf.push(93 /* I64_LT_U */);
        break;
      case "I64.LE_S":
        buf.push(94 /* I64_LE_S */);
        break;
      case "I64.LE_U":
        buf.push(95 /* I64_LE_U */);
        break;
      case "F32.EQ":
        buf.push(96 /* F32_EQ */);
        break;
      case "F32.LT":
        buf.push(97 /* F32_LT */);
        break;
      case "F32.LE":
        buf.push(98 /* F32_LE */);
        break;
      case "F64.EQ":
        buf.push(99 /* F64_EQ */);
        break;
      case "F64.LT":
        buf.push(100 /* F64_LT */);
        break;
      case "F64.LE":
        buf.push(101 /* F64_LE */);
        break;
      case "LOAD.I8S":
        buf.push(112 /* LOAD_I8S */);
        writeI32LE(buf, expectInt());
        break;
      case "LOAD.I8U":
        buf.push(113 /* LOAD_I8U */);
        writeI32LE(buf, expectInt());
        break;
      case "LOAD.I16S":
        buf.push(114 /* LOAD_I16S */);
        writeI32LE(buf, expectInt());
        break;
      case "LOAD.I16U":
        buf.push(115 /* LOAD_I16U */);
        writeI32LE(buf, expectInt());
        break;
      case "LOAD.I32":
        buf.push(116 /* LOAD_I32 */);
        writeI32LE(buf, expectInt());
        break;
      case "LOAD.I64":
        buf.push(117 /* LOAD_I64 */);
        writeI32LE(buf, expectInt());
        break;
      case "LOAD.F32":
        buf.push(118 /* LOAD_F32 */);
        writeI32LE(buf, expectInt());
        break;
      case "LOAD.F64":
        buf.push(119 /* LOAD_F64 */);
        writeI32LE(buf, expectInt());
        break;
      case "STORE.I8":
        buf.push(120 /* STORE_I8 */);
        writeI32LE(buf, expectInt());
        break;
      case "STORE.I16":
        buf.push(121 /* STORE_I16 */);
        writeI32LE(buf, expectInt());
        break;
      case "STORE.I32":
        buf.push(122 /* STORE_I32 */);
        writeI32LE(buf, expectInt());
        break;
      case "STORE.I64":
        buf.push(123 /* STORE_I64 */);
        writeI32LE(buf, expectInt());
        break;
      case "STORE.F32":
        buf.push(124 /* STORE_F32 */);
        writeI32LE(buf, expectInt());
        break;
      case "STORE.F64":
        buf.push(125 /* STORE_F64 */);
        writeI32LE(buf, expectInt());
        break;
      case "JMP": {
        buf.push(128 /* JMP */);
        const ref = expectLabelRef();
        if (/^-?\d+$/.test(ref)) {
          writeI32LE(buf, parseInt_(ref));
        } else {
          patches.push({ bufOffset: buf.length, labelName: ref, instrStart });
          writeI32LE(buf, 0);
        }
        break;
      }
      case "JZ": {
        buf.push(129 /* JZ */);
        const ref = expectLabelRef();
        patches.push({ bufOffset: buf.length, labelName: ref, instrStart });
        writeI32LE(buf, 0);
        break;
      }
      case "JNZ": {
        buf.push(130 /* JNZ */);
        const ref = expectLabelRef();
        patches.push({ bufOffset: buf.length, labelName: ref, instrStart });
        writeI32LE(buf, 0);
        break;
      }
      case "CALL": {
        buf.push(131 /* CALL */);
        const ref = expectLabelRef();
        const nArgs = parseInt_(tokens[ti]?.kind === "int" ? tokens[ti++].value : "0");
        buf.push(nArgs & 255);
        patches.push({ bufOffset: buf.length, labelName: ref, instrStart });
        writeI32LE(buf, 0);
        break;
      }
      case "CALL.IND": {
        buf.push(132 /* CALL_IND */);
        const nArgs = parseInt_(tokens[ti]?.kind === "int" ? tokens[ti++].value : "0");
        buf.push(nArgs & 255);
        break;
      }
      case "RET":
        buf.push(133 /* RET */);
        break;
      case "RET.VAL":
        buf.push(134 /* RET_VAL */);
        break;
      case "ENTER":
        buf.push(144 /* ENTER */);
        writeU16LE(buf, expectInt());
        break;
      case "LEAVE":
        buf.push(145 /* LEAVE */);
        break;
      case "LOCAL.GET":
        buf.push(146 /* LOCAL_GET */);
        writeU16LE(buf, expectInt());
        break;
      case "LOCAL.SET":
        buf.push(147 /* LOCAL_SET */);
        writeU16LE(buf, expectInt());
        break;
      case "ARG.GET":
        buf.push(148 /* ARG_GET */);
        writeU16LE(buf, expectInt());
        break;
      case "I32.EXTEND_S":
        buf.push(160 /* I32_EXTEND_S */);
        break;
      case "I32.EXTEND_U":
        buf.push(161 /* I32_EXTEND_U */);
        break;
      case "I64.WRAP":
        buf.push(162 /* I64_WRAP */);
        break;
      case "F32.DEMOTE":
        buf.push(163 /* F32_DEMOTE */);
        break;
      case "F64.PROMOTE":
        buf.push(164 /* F64_PROMOTE */);
        break;
      case "I32.TRUNC_F32_S":
        buf.push(165 /* I32_TRUNC_F32_S */);
        break;
      case "I32.TRUNC_F32_U":
        buf.push(166 /* I32_TRUNC_F32_U */);
        break;
      case "I32.TRUNC_F64_S":
        buf.push(167 /* I32_TRUNC_F64_S */);
        break;
      case "I32.TRUNC_F64_U":
        buf.push(168 /* I32_TRUNC_F64_U */);
        break;
      case "I64.TRUNC_F32_S":
        buf.push(169 /* I64_TRUNC_F32_S */);
        break;
      case "I64.TRUNC_F32_U":
        buf.push(170 /* I64_TRUNC_F32_U */);
        break;
      case "I64.TRUNC_F64_S":
        buf.push(171 /* I64_TRUNC_F64_S */);
        break;
      case "I64.TRUNC_F64_U":
        buf.push(172 /* I64_TRUNC_F64_U */);
        break;
      case "F32.CONVERT_I32_S":
        buf.push(173 /* F32_CONVERT_I32_S */);
        break;
      case "F32.CONVERT_I32_U":
        buf.push(174 /* F32_CONVERT_I32_U */);
        break;
      case "F32.CONVERT_I64_S":
        buf.push(175 /* F32_CONVERT_I64_S */);
        break;
      case "F32.CONVERT_I64_U":
        buf.push(176 /* F32_CONVERT_I64_U */);
        break;
      case "F64.CONVERT_I32_S":
        buf.push(177 /* F64_CONVERT_I32_S */);
        break;
      case "F64.CONVERT_I32_U":
        buf.push(178 /* F64_CONVERT_I32_U */);
        break;
      case "F64.CONVERT_I64_S":
        buf.push(179 /* F64_CONVERT_I64_S */);
        break;
      case "F64.CONVERT_I64_U":
        buf.push(180 /* F64_CONVERT_I64_U */);
        break;
      case "SYSCALL":
        buf.push(192 /* SYSCALL */);
        writeU16LE(buf, expectInt());
        break;
      case "SYSRET":
        buf.push(193 /* SYSRET */);
        break;
      case "HYPERCALL":
        buf.push(194 /* HYPERCALL */);
        writeU16LE(buf, expectInt());
        break;
      case "HYPERET":
        buf.push(195 /* HYPERET */);
        break;
      case "INT":
        buf.push(196 /* INT */);
        buf.push(expectInt() & 255);
        break;
      case "IRET":
        buf.push(197 /* IRET */);
        break;
      case "CLI":
        buf.push(198 /* CLI */);
        break;
      case "STI":
        buf.push(199 /* STI */);
        break;
      case "RING.GET":
        buf.push(200 /* RING_GET */);
        break;
      case "PAGE.MAP":
        buf.push(201 /* PAGE_MAP */);
        break;
      case "PAGE.UNMAP":
        buf.push(202 /* PAGE_UNMAP */);
        break;
      case "PTBR.SET":
        buf.push(203 /* PTBR_SET */);
        break;
      case "PTBR.GET":
        buf.push(204 /* PTBR_GET */);
        break;
      case "IVT.SET":
        buf.push(205 /* IVT_SET */);
        break;
      default:
        throw new Error(`Line ${tok.line}: unknown mnemonic "${tok.value}"`);
    }
  }
  const codeArr = new Uint8Array(buf);
  const patch32 = new DataView(codeArr.buffer);
  for (const p of patches) {
    const targetAddr = labels.get(p.labelName);
    if (targetAddr === void 0) {
      throw new Error(`Undefined label: "${p.labelName}"`);
    }
    const relOffset = targetAddr - (p.bufOffset + 4);
    patch32.setInt32(p.bufOffset, relOffset, true);
  }
  return { code: codeArr, labels };
}

// src/vm/types.ts
var ValueKind = /* @__PURE__ */ ((ValueKind3) => {
  ValueKind3[ValueKind3["I32"] = 0] = "I32";
  ValueKind3[ValueKind3["I64"] = 1] = "I64";
  ValueKind3[ValueKind3["F32"] = 2] = "F32";
  ValueKind3[ValueKind3["F64"] = 3] = "F64";
  ValueKind3[ValueKind3["Ptr"] = 4] = "Ptr";
  return ValueKind3;
})(ValueKind || {});
function i32(v) {
  return { kind: 0 /* I32 */, v: v | 0 };
}
function i64(v) {
  return { kind: 1 /* I64 */, v: BigInt.asIntN(64, v) };
}
function f32(v) {
  const buf = new Float32Array(1);
  buf[0] = v;
  return { kind: 2 /* F32 */, v: buf[0] };
}
function f64(v) {
  return { kind: 3 /* F64 */, v };
}
function ptr(v) {
  return { kind: 4 /* Ptr */, v: v >>> 0 };
}
function asI32(v) {
  if (v.kind === 0 /* I32 */ || v.kind === 4 /* Ptr */) return v.v | 0;
  throw new TypeError(`Expected i32/ptr, got kind=${v.kind}`);
}
function asI64(v) {
  if (v.kind === 1 /* I64 */) return v.v;
  throw new TypeError(`Expected i64, got kind=${v.kind}`);
}
function asF32(v) {
  if (v.kind === 2 /* F32 */) return v.v;
  throw new TypeError(`Expected f32, got kind=${v.kind}`);
}
function asF64(v) {
  if (v.kind === 3 /* F64 */) return v.v;
  throw new TypeError(`Expected f64, got kind=${v.kind}`);
}
function asPtr(v) {
  if (v.kind === 4 /* Ptr */ || v.kind === 0 /* I32 */) return v.v >>> 0;
  throw new TypeError(`Expected ptr, got kind=${v.kind}`);
}
var PAGE_SIZE = 4096;
function fault(vector, message, address) {
  return { vector, address, message };
}

// src/vm/cpu.ts
var CPU = class {
  constructor(mem, onHypercall, onSyscall) {
    this.mem = mem;
    this.onHypercall = onHypercall;
    this.onSyscall = onSyscall;
  }
  mem;
  onHypercall;
  onSyscall;
  pc = 0;
  ring = 2 /* User */;
  interruptsEnabled = true;
  operandStack = [];
  callStack = [];
  locals = [];
  fp = 0;
  ivt = 0;
  ptbr = 0;
  halted = false;
  push(v) {
    this.operandStack.push(v);
  }
  pop() {
    const v = this.operandStack.pop();
    if (v === void 0) throw fault(12 /* StackFault */, "Operand stack underflow");
    return v;
  }
  peek() {
    const v = this.operandStack[this.operandStack.length - 1];
    if (v === void 0) throw fault(12 /* StackFault */, "Operand stack empty");
    return v;
  }
  requireRing(minRing, op) {
    if (this.ring > minRing) {
      throw fault(13 /* GPF */, `${op} requires Ring ${minRing}, current ring is ${this.ring}`);
    }
  }
  readPcByte() {
    const b = this.mem.read8(this.pc, this.ring);
    this.pc = this.pc + 1 >>> 0;
    return b;
  }
  readPcI32() {
    const v = this.mem.read32(this.pc, this.ring);
    this.pc = this.pc + 4 >>> 0;
    return v;
  }
  readPcU16() {
    const v = this.mem.read16(this.pc, this.ring);
    this.pc = this.pc + 2 >>> 0;
    return v;
  }
  readPcU32() {
    return this.readPcI32() >>> 0;
  }
  readPcI64() {
    const v = this.mem.read64(this.pc, this.ring);
    this.pc = this.pc + 8 >>> 0;
    return v;
  }
  readPcF32() {
    const v = this.mem.readF32(this.pc, this.ring);
    this.pc = this.pc + 4 >>> 0;
    return v;
  }
  readPcF64() {
    const v = this.mem.readF64(this.pc, this.ring);
    this.pc = this.pc + 8 >>> 0;
    return v;
  }
  step() {
    if (this.halted) return false;
    const opcode = this.readPcByte();
    switch (opcode) {
      // ── Control ──────────────────────────────────────────────
      case 0 /* NOP */:
        break;
      case 1 /* HALT */:
        this.requireRing(0 /* Hypervisor */, "HALT");
        this.halted = true;
        return false;
      case 2 /* BRK */:
        break;
      // Debugger hook; implementation may intercept
      // ── Stack manipulation ────────────────────────────────────
      case 16 /* PUSH_I32 */:
        this.push(i32(this.readPcI32()));
        break;
      case 17 /* PUSH_I64 */:
        this.push(i64(this.readPcI64()));
        break;
      case 18 /* PUSH_F32 */:
        this.push(f32(this.readPcF32()));
        break;
      case 19 /* PUSH_F64 */:
        this.push(f64(this.readPcF64()));
        break;
      case 20 /* POP */:
        this.pop();
        break;
      case 21 /* DUP */: {
        const v = this.peek();
        this.push({ ...v });
        break;
      }
      case 22 /* SWAP */: {
        const b = this.pop();
        const a = this.pop();
        this.push(b);
        this.push(a);
        break;
      }
      case 23 /* OVER */: {
        const b = this.pop();
        const a = this.peek();
        this.push(b);
        this.push({ ...a });
        break;
      }
      // ── i32 arithmetic ────────────────────────────────────────
      case 32 /* I32_ADD */: {
        const b = asI32(this.pop()), a = asI32(this.pop());
        this.push(i32(a + b));
        break;
      }
      case 33 /* I32_SUB */: {
        const b = asI32(this.pop()), a = asI32(this.pop());
        this.push(i32(a - b));
        break;
      }
      case 34 /* I32_MUL */: {
        const b = asI32(this.pop()), a = asI32(this.pop());
        this.push(i32(Math.imul(a, b)));
        break;
      }
      case 35 /* I32_DIV_S */: {
        const b = asI32(this.pop()), a = asI32(this.pop());
        if (b === 0) throw fault(0 /* DivideByZero */, "I32.DIV_S by zero");
        this.push(i32(a / b | 0));
        break;
      }
      case 36 /* I32_DIV_U */: {
        const b = asI32(this.pop()) >>> 0, a = asI32(this.pop()) >>> 0;
        if (b === 0) throw fault(0 /* DivideByZero */, "I32.DIV_U by zero");
        this.push(i32(a / b >>> 0));
        break;
      }
      case 37 /* I32_REM_S */: {
        const b = asI32(this.pop()), a = asI32(this.pop());
        if (b === 0) throw fault(0 /* DivideByZero */, "I32.REM_S by zero");
        this.push(i32(a % b));
        break;
      }
      case 38 /* I32_REM_U */: {
        const b = asI32(this.pop()) >>> 0, a = asI32(this.pop()) >>> 0;
        if (b === 0) throw fault(0 /* DivideByZero */, "I32.REM_U by zero");
        this.push(i32(a % b));
        break;
      }
      case 39 /* I32_NEG */: {
        this.push(i32(-asI32(this.pop())));
        break;
      }
      // ── i64 arithmetic ────────────────────────────────────────
      case 40 /* I64_ADD */: {
        const b = asI64(this.pop()), a = asI64(this.pop());
        this.push(i64(a + b));
        break;
      }
      case 41 /* I64_SUB */: {
        const b = asI64(this.pop()), a = asI64(this.pop());
        this.push(i64(a - b));
        break;
      }
      case 42 /* I64_MUL */: {
        const b = asI64(this.pop()), a = asI64(this.pop());
        this.push(i64(a * b));
        break;
      }
      case 43 /* I64_DIV_S */: {
        const b = asI64(this.pop()), a = asI64(this.pop());
        if (b === 0n) throw fault(0 /* DivideByZero */, "I64.DIV_S by zero");
        this.push(i64(a / b));
        break;
      }
      case 44 /* I64_DIV_U */: {
        const b = BigInt.asUintN(64, asI64(this.pop())), a = BigInt.asUintN(64, asI64(this.pop()));
        if (b === 0n) throw fault(0 /* DivideByZero */, "I64.DIV_U by zero");
        this.push(i64(BigInt.asIntN(64, a / b)));
        break;
      }
      case 45 /* I64_REM_S */: {
        const b = asI64(this.pop()), a = asI64(this.pop());
        if (b === 0n) throw fault(0 /* DivideByZero */, "I64.REM_S by zero");
        this.push(i64(a % b));
        break;
      }
      case 46 /* I64_REM_U */: {
        const b = BigInt.asUintN(64, asI64(this.pop())), a = BigInt.asUintN(64, asI64(this.pop()));
        if (b === 0n) throw fault(0 /* DivideByZero */, "I64.REM_U by zero");
        this.push(i64(BigInt.asIntN(64, a % b)));
        break;
      }
      case 47 /* I64_NEG */: {
        this.push(i64(-asI64(this.pop())));
        break;
      }
      // ── float arithmetic ──────────────────────────────────────
      case 48 /* F32_ADD */: {
        const b = asF32(this.pop()), a = asF32(this.pop());
        this.push(f32(a + b));
        break;
      }
      case 49 /* F32_SUB */: {
        const b = asF32(this.pop()), a = asF32(this.pop());
        this.push(f32(a - b));
        break;
      }
      case 50 /* F32_MUL */: {
        const b = asF32(this.pop()), a = asF32(this.pop());
        this.push(f32(a * b));
        break;
      }
      case 51 /* F32_DIV */: {
        const b = asF32(this.pop()), a = asF32(this.pop());
        this.push(f32(a / b));
        break;
      }
      case 52 /* F64_ADD */: {
        const b = asF64(this.pop()), a = asF64(this.pop());
        this.push(f64(a + b));
        break;
      }
      case 53 /* F64_SUB */: {
        const b = asF64(this.pop()), a = asF64(this.pop());
        this.push(f64(a - b));
        break;
      }
      case 54 /* F64_MUL */: {
        const b = asF64(this.pop()), a = asF64(this.pop());
        this.push(f64(a * b));
        break;
      }
      case 55 /* F64_DIV */: {
        const b = asF64(this.pop()), a = asF64(this.pop());
        this.push(f64(a / b));
        break;
      }
      // ── i32 bitwise ───────────────────────────────────────────
      case 64 /* I32_AND */: {
        const b = asI32(this.pop()), a = asI32(this.pop());
        this.push(i32(a & b));
        break;
      }
      case 65 /* I32_OR */: {
        const b = asI32(this.pop()), a = asI32(this.pop());
        this.push(i32(a | b));
        break;
      }
      case 66 /* I32_XOR */: {
        const b = asI32(this.pop()), a = asI32(this.pop());
        this.push(i32(a ^ b));
        break;
      }
      case 67 /* I32_NOT */: {
        this.push(i32(~asI32(this.pop())));
        break;
      }
      case 68 /* I32_SHL */: {
        const n = asI32(this.pop()) & 31, a = asI32(this.pop());
        this.push(i32(a << n));
        break;
      }
      case 69 /* I32_SHR_S */: {
        const n = asI32(this.pop()) & 31, a = asI32(this.pop());
        this.push(i32(a >> n));
        break;
      }
      case 70 /* I32_SHR_U */: {
        const n = asI32(this.pop()) & 31, a = asI32(this.pop());
        this.push(i32(a >>> n));
        break;
      }
      // ── i64 bitwise ───────────────────────────────────────────
      case 71 /* I64_AND */: {
        const b = asI64(this.pop()), a = asI64(this.pop());
        this.push(i64(a & b));
        break;
      }
      case 72 /* I64_OR */: {
        const b = asI64(this.pop()), a = asI64(this.pop());
        this.push(i64(a | b));
        break;
      }
      case 73 /* I64_XOR */: {
        const b = asI64(this.pop()), a = asI64(this.pop());
        this.push(i64(a ^ b));
        break;
      }
      case 74 /* I64_NOT */: {
        this.push(i64(~asI64(this.pop())));
        break;
      }
      case 75 /* I64_SHL */: {
        const n = asI64(this.pop()) & 63n, a = asI64(this.pop());
        this.push(i64(a << n));
        break;
      }
      case 76 /* I64_SHR_S */: {
        const n = asI64(this.pop()) & 63n, a = asI64(this.pop());
        this.push(i64(a >> n));
        break;
      }
      case 77 /* I64_SHR_U */: {
        const n = asI64(this.pop()) & 63n, a = BigInt.asUintN(64, asI64(this.pop()));
        this.push(i64(BigInt.asIntN(64, a >> n)));
        break;
      }
      // ── i32 comparison ────────────────────────────────────────
      case 80 /* I32_EQ */: {
        const b = asI32(this.pop()), a = asI32(this.pop());
        this.push(i32(a === b ? 1 : 0));
        break;
      }
      case 81 /* I32_NE */: {
        const b = asI32(this.pop()), a = asI32(this.pop());
        this.push(i32(a !== b ? 1 : 0));
        break;
      }
      case 82 /* I32_LT_S */: {
        const b = asI32(this.pop()), a = asI32(this.pop());
        this.push(i32(a < b ? 1 : 0));
        break;
      }
      case 83 /* I32_LT_U */: {
        const b = asI32(this.pop()) >>> 0, a = asI32(this.pop()) >>> 0;
        this.push(i32(a < b ? 1 : 0));
        break;
      }
      case 84 /* I32_LE_S */: {
        const b = asI32(this.pop()), a = asI32(this.pop());
        this.push(i32(a <= b ? 1 : 0));
        break;
      }
      case 85 /* I32_LE_U */: {
        const b = asI32(this.pop()) >>> 0, a = asI32(this.pop()) >>> 0;
        this.push(i32(a <= b ? 1 : 0));
        break;
      }
      case 86 /* I32_GT_S */: {
        const b = asI32(this.pop()), a = asI32(this.pop());
        this.push(i32(a > b ? 1 : 0));
        break;
      }
      case 87 /* I32_GT_U */: {
        const b = asI32(this.pop()) >>> 0, a = asI32(this.pop()) >>> 0;
        this.push(i32(a > b ? 1 : 0));
        break;
      }
      case 88 /* I32_GE_S */: {
        const b = asI32(this.pop()), a = asI32(this.pop());
        this.push(i32(a >= b ? 1 : 0));
        break;
      }
      case 89 /* I32_GE_U */: {
        const b = asI32(this.pop()) >>> 0, a = asI32(this.pop()) >>> 0;
        this.push(i32(a >= b ? 1 : 0));
        break;
      }
      // ── i64 comparison ────────────────────────────────────────
      case 90 /* I64_EQ */: {
        const b = asI64(this.pop()), a = asI64(this.pop());
        this.push(i32(a === b ? 1 : 0));
        break;
      }
      case 91 /* I64_NE */: {
        const b = asI64(this.pop()), a = asI64(this.pop());
        this.push(i32(a !== b ? 1 : 0));
        break;
      }
      case 92 /* I64_LT_S */: {
        const b = asI64(this.pop()), a = asI64(this.pop());
        this.push(i32(a < b ? 1 : 0));
        break;
      }
      case 93 /* I64_LT_U */: {
        const b = BigInt.asUintN(64, asI64(this.pop())), a = BigInt.asUintN(64, asI64(this.pop()));
        this.push(i32(a < b ? 1 : 0));
        break;
      }
      case 94 /* I64_LE_S */: {
        const b = asI64(this.pop()), a = asI64(this.pop());
        this.push(i32(a <= b ? 1 : 0));
        break;
      }
      case 95 /* I64_LE_U */: {
        const b = BigInt.asUintN(64, asI64(this.pop())), a = BigInt.asUintN(64, asI64(this.pop()));
        this.push(i32(a <= b ? 1 : 0));
        break;
      }
      // ── float comparison ──────────────────────────────────────
      case 96 /* F32_EQ */: {
        const b = asF32(this.pop()), a = asF32(this.pop());
        this.push(i32(a === b ? 1 : 0));
        break;
      }
      case 97 /* F32_LT */: {
        const b = asF32(this.pop()), a = asF32(this.pop());
        this.push(i32(a < b ? 1 : 0));
        break;
      }
      case 98 /* F32_LE */: {
        const b = asF32(this.pop()), a = asF32(this.pop());
        this.push(i32(a <= b ? 1 : 0));
        break;
      }
      case 99 /* F64_EQ */: {
        const b = asF64(this.pop()), a = asF64(this.pop());
        this.push(i32(a === b ? 1 : 0));
        break;
      }
      case 100 /* F64_LT */: {
        const b = asF64(this.pop()), a = asF64(this.pop());
        this.push(i32(a < b ? 1 : 0));
        break;
      }
      case 101 /* F64_LE */: {
        const b = asF64(this.pop()), a = asF64(this.pop());
        this.push(i32(a <= b ? 1 : 0));
        break;
      }
      // ── Memory ────────────────────────────────────────────────
      case 112 /* LOAD_I8S */: {
        const off = this.readPcU32(), addr = asPtr(this.pop());
        this.push(i32(this.mem.read8(addr + off, this.ring) << 24 >> 24));
        break;
      }
      case 113 /* LOAD_I8U */: {
        const off = this.readPcU32(), addr = asPtr(this.pop());
        this.push(i32(this.mem.read8(addr + off, this.ring)));
        break;
      }
      case 114 /* LOAD_I16S */: {
        const off = this.readPcU32(), addr = asPtr(this.pop());
        this.push(i32(this.mem.read16(addr + off, this.ring) << 16 >> 16));
        break;
      }
      case 115 /* LOAD_I16U */: {
        const off = this.readPcU32(), addr = asPtr(this.pop());
        this.push(i32(this.mem.read16(addr + off, this.ring)));
        break;
      }
      case 116 /* LOAD_I32 */: {
        const off = this.readPcU32(), addr = asPtr(this.pop());
        this.push(i32(this.mem.read32(addr + off, this.ring)));
        break;
      }
      case 117 /* LOAD_I64 */: {
        const off = this.readPcU32(), addr = asPtr(this.pop());
        this.push(i64(this.mem.read64(addr + off, this.ring)));
        break;
      }
      case 118 /* LOAD_F32 */: {
        const off = this.readPcU32(), addr = asPtr(this.pop());
        this.push(f32(this.mem.readF32(addr + off, this.ring)));
        break;
      }
      case 119 /* LOAD_F64 */: {
        const off = this.readPcU32(), addr = asPtr(this.pop());
        this.push(f64(this.mem.readF64(addr + off, this.ring)));
        break;
      }
      case 120 /* STORE_I8 */: {
        const off = this.readPcU32(), val = asI32(this.pop()), addr = asPtr(this.pop());
        this.mem.write8(addr + off, val, this.ring);
        break;
      }
      case 121 /* STORE_I16 */: {
        const off = this.readPcU32(), val = asI32(this.pop()), addr = asPtr(this.pop());
        this.mem.write16(addr + off, val, this.ring);
        break;
      }
      case 122 /* STORE_I32 */: {
        const off = this.readPcU32(), val = asI32(this.pop()), addr = asPtr(this.pop());
        this.mem.write32(addr + off, val, this.ring);
        break;
      }
      case 123 /* STORE_I64 */: {
        const off = this.readPcU32(), val = asI64(this.pop()), addr = asPtr(this.pop());
        this.mem.write64(addr + off, val, this.ring);
        break;
      }
      case 124 /* STORE_F32 */: {
        const off = this.readPcU32(), val = asF32(this.pop()), addr = asPtr(this.pop());
        this.mem.writeF32(addr + off, val, this.ring);
        break;
      }
      case 125 /* STORE_F64 */: {
        const off = this.readPcU32(), val = asF64(this.pop()), addr = asPtr(this.pop());
        this.mem.writeF64(addr + off, val, this.ring);
        break;
      }
      // ── Control flow ──────────────────────────────────────────
      case 128 /* JMP */: {
        const off = this.readPcI32();
        this.pc = this.pc + off >>> 0;
        break;
      }
      case 129 /* JZ */: {
        const off = this.readPcI32();
        if (asI32(this.pop()) === 0) this.pc = this.pc + off >>> 0;
        break;
      }
      case 130 /* JNZ */: {
        const off = this.readPcI32();
        if (asI32(this.pop()) !== 0) this.pc = this.pc + off >>> 0;
        break;
      }
      case 131 /* CALL */: {
        const nArgs = this.readPcByte();
        const off = this.readPcI32();
        const retPc = this.pc;
        const newFp = this.operandStack.length;
        const base = newFp - nArgs;
        this.callStack.push({ retPc, retRing: this.ring, fp: this.fp, base });
        this.locals.push([]);
        this.fp = newFp;
        this.pc = retPc + off >>> 0;
        break;
      }
      case 132 /* CALL_IND */: {
        const nArgs = this.readPcByte();
        const addr = asPtr(this.pop());
        const newFp = this.operandStack.length;
        const base = newFp - nArgs;
        this.callStack.push({ retPc: this.pc, retRing: this.ring, fp: this.fp, base });
        this.locals.push([]);
        this.fp = newFp;
        this.pc = addr;
        break;
      }
      case 133 /* RET */: {
        const frame = this.callStack.pop();
        if (!frame) {
          this.halted = true;
          return false;
        }
        this.locals.pop();
        this.operandStack.length = frame.base;
        this.pc = frame.retPc;
        this.ring = frame.retRing;
        this.fp = frame.fp;
        break;
      }
      case 134 /* RET_VAL */: {
        const retVal = this.pop();
        const frame = this.callStack.pop();
        if (!frame) {
          this.push(retVal);
          this.halted = true;
          return false;
        }
        this.locals.pop();
        this.operandStack.length = frame.base;
        this.pc = frame.retPc;
        this.ring = frame.retRing;
        this.fp = frame.fp;
        this.push(retVal);
        break;
      }
      // ── Call frame ────────────────────────────────────────────
      case 144 /* ENTER */: {
        const n = this.readPcU16();
        const localFrame = new Array(n).fill(i32(0));
        this.locals.push(localFrame);
        break;
      }
      case 145 /* LEAVE */: {
        this.locals.pop();
        break;
      }
      case 146 /* LOCAL_GET */: {
        const idx = this.readPcU16();
        const frame = this.locals[this.locals.length - 1];
        if (!frame || idx >= frame.length) throw fault(13 /* GPF */, `LOCAL.GET out of bounds: ${idx}`);
        this.push({ ...frame[idx] });
        break;
      }
      case 147 /* LOCAL_SET */: {
        const idx = this.readPcU16();
        const frame = this.locals[this.locals.length - 1];
        if (!frame || idx >= frame.length) throw fault(13 /* GPF */, `LOCAL.SET out of bounds: ${idx}`);
        frame[idx] = this.pop();
        break;
      }
      case 148 /* ARG_GET */: {
        const idx = this.readPcU16();
        const stackIdx = this.fp - 1 - idx;
        const v = this.operandStack[stackIdx];
        if (v === void 0) throw fault(13 /* GPF */, `ARG.GET out of bounds: ${idx}`);
        this.push({ ...v });
        break;
      }
      // ── Type conversion ───────────────────────────────────────
      case 160 /* I32_EXTEND_S */: {
        this.push(i64(BigInt(asI32(this.pop()))));
        break;
      }
      case 161 /* I32_EXTEND_U */: {
        this.push(i64(BigInt(asI32(this.pop()) >>> 0)));
        break;
      }
      case 162 /* I64_WRAP */: {
        this.push(i32(Number(asI64(this.pop()) & 0xFFFFFFFFn)));
        break;
      }
      case 163 /* F32_DEMOTE */: {
        this.push(f32(asF64(this.pop())));
        break;
      }
      case 164 /* F64_PROMOTE */: {
        this.push(f64(asF32(this.pop())));
        break;
      }
      case 165 /* I32_TRUNC_F32_S */: {
        this.push(i32(Math.trunc(asF32(this.pop()))));
        break;
      }
      case 166 /* I32_TRUNC_F32_U */: {
        this.push(i32(Math.trunc(asF32(this.pop())) >>> 0));
        break;
      }
      case 167 /* I32_TRUNC_F64_S */: {
        this.push(i32(Math.trunc(asF64(this.pop()))));
        break;
      }
      case 168 /* I32_TRUNC_F64_U */: {
        this.push(i32(Math.trunc(asF64(this.pop())) >>> 0));
        break;
      }
      case 169 /* I64_TRUNC_F32_S */: {
        this.push(i64(BigInt(Math.trunc(asF32(this.pop())))));
        break;
      }
      case 170 /* I64_TRUNC_F32_U */: {
        this.push(i64(BigInt.asIntN(64, BigInt(Math.trunc(asF32(this.pop()))) & 0xFFFFFFFFFFFFFFFFn)));
        break;
      }
      case 171 /* I64_TRUNC_F64_S */: {
        this.push(i64(BigInt(Math.trunc(asF64(this.pop())))));
        break;
      }
      case 172 /* I64_TRUNC_F64_U */: {
        this.push(i64(BigInt.asIntN(64, BigInt(Math.trunc(asF64(this.pop()))) & 0xFFFFFFFFFFFFFFFFn)));
        break;
      }
      case 173 /* F32_CONVERT_I32_S */: {
        this.push(f32(asI32(this.pop())));
        break;
      }
      case 174 /* F32_CONVERT_I32_U */: {
        this.push(f32(asI32(this.pop()) >>> 0));
        break;
      }
      case 175 /* F32_CONVERT_I64_S */: {
        this.push(f32(Number(asI64(this.pop()))));
        break;
      }
      case 176 /* F32_CONVERT_I64_U */: {
        this.push(f32(Number(BigInt.asUintN(64, asI64(this.pop())))));
        break;
      }
      case 177 /* F64_CONVERT_I32_S */: {
        this.push(f64(asI32(this.pop())));
        break;
      }
      case 178 /* F64_CONVERT_I32_U */: {
        this.push(f64(asI32(this.pop()) >>> 0));
        break;
      }
      case 179 /* F64_CONVERT_I64_S */: {
        this.push(f64(Number(asI64(this.pop()))));
        break;
      }
      case 180 /* F64_CONVERT_I64_U */: {
        this.push(f64(Number(BigInt.asUintN(64, asI64(this.pop())))));
        break;
      }
      // ── Privilege ─────────────────────────────────────────────
      case 192 /* SYSCALL */: {
        const num = this.readPcU16();
        this.callStack.push({ retPc: this.pc, retRing: this.ring, fp: this.fp, base: this.fp });
        this.locals.push([]);
        this.ring = 1 /* Kernel */;
        this.onSyscall(num, this);
        break;
      }
      case 193 /* SYSRET */: {
        const frame = this.callStack.pop();
        if (!frame) throw fault(12 /* StackFault */, "SYSRET with empty call stack");
        this.locals.pop();
        this.pc = frame.retPc;
        this.ring = 2 /* User */;
        this.fp = frame.fp;
        break;
      }
      case 194 /* HYPERCALL */: {
        const num = this.readPcU16();
        this.requireRing(1 /* Kernel */, "HYPERCALL");
        this.callStack.push({ retPc: this.pc, retRing: this.ring, fp: this.fp, base: this.fp });
        this.locals.push([]);
        this.ring = 0 /* Hypervisor */;
        this.onHypercall(num, this);
        break;
      }
      case 195 /* HYPERET */: {
        const frame = this.callStack.pop();
        if (!frame) throw fault(12 /* StackFault */, "HYPERET with empty call stack");
        this.locals.pop();
        this.pc = frame.retPc;
        this.ring = frame.retRing;
        this.fp = frame.fp;
        break;
      }
      case 200 /* RING_GET */: {
        this.push(i32(this.ring));
        break;
      }
      case 198 /* CLI */: {
        this.requireRing(1 /* Kernel */, "CLI");
        this.interruptsEnabled = false;
        break;
      }
      case 199 /* STI */: {
        this.requireRing(1 /* Kernel */, "STI");
        this.interruptsEnabled = true;
        break;
      }
      case 201 /* PAGE_MAP */: {
        this.requireRing(0 /* Hypervisor */, "PAGE.MAP");
        const flags = asI32(this.pop());
        const virt = asPtr(this.pop());
        const phys = asPtr(this.pop());
        this.mem.mapPage(virt, phys, flags);
        break;
      }
      case 202 /* PAGE_UNMAP */: {
        this.requireRing(0 /* Hypervisor */, "PAGE.UNMAP");
        this.mem.unmapPage(asPtr(this.pop()));
        break;
      }
      case 203 /* PTBR_SET */: {
        this.requireRing(0 /* Hypervisor */, "PTBR.SET");
        this.ptbr = asPtr(this.pop());
        break;
      }
      case 204 /* PTBR_GET */: {
        this.requireRing(0 /* Hypervisor */, "PTBR.GET");
        this.push(ptr(this.ptbr));
        break;
      }
      case 205 /* IVT_SET */: {
        this.requireRing(0 /* Hypervisor */, "IVT.SET");
        this.ivt = asPtr(this.pop());
        break;
      }
      case 196 /* INT */: {
        const vec = this.readPcByte();
        const handlerAddr = this.mem.read32(this.ivt + vec * 4, 0 /* Hypervisor */);
        this.callStack.push({ retPc: this.pc, retRing: this.ring, fp: this.fp, base: this.fp });
        this.locals.push([]);
        this.pc = handlerAddr >>> 0;
        break;
      }
      case 197 /* IRET */: {
        const frame = this.callStack.pop();
        if (!frame) throw fault(12 /* StackFault */, "IRET with empty call stack");
        this.locals.pop();
        this.pc = frame.retPc;
        this.ring = frame.retRing;
        this.fp = frame.fp;
        break;
      }
      default:
        throw fault(13 /* GPF */, `Unknown opcode: 0x${opcode.toString(16).padStart(2, "0")}`);
    }
    return true;
  }
  run(maxSteps = Infinity) {
    let steps = 0;
    while (!this.halted && steps < maxSteps) {
      this.step();
      steps++;
    }
  }
  isHalted() {
    return this.halted;
  }
  getStackSnapshot() {
    return [...this.operandStack];
  }
};

// src/vm/memory.ts
var Memory = class {
  physical;
  view;
  pageTable = /* @__PURE__ */ new Map();
  allocPtr = 0;
  constructor(totalBytes) {
    this.physical = new ArrayBuffer(totalBytes);
    this.view = new DataView(this.physical);
  }
  allocPages(count, flags) {
    const physOffset = this.allocPtr;
    const size = count * PAGE_SIZE;
    if (physOffset + size > this.physical.byteLength) {
      throw fault(13 /* GPF */, "Out of physical memory");
    }
    this.allocPtr += size;
    return physOffset;
  }
  mapPage(virtAddr, physOffset, flags) {
    const pageNum = virtAddr >>> 0 >>> 12;
    this.pageTable.set(pageNum, { physOffset, flags });
  }
  unmapPage(virtAddr) {
    const pageNum = virtAddr >>> 0 >>> 12;
    this.pageTable.delete(pageNum);
  }
  resolve(virtAddr, accessFlags, ring) {
    const vAddr = virtAddr >>> 0;
    const pageNum = vAddr >>> 12;
    const offset = vAddr & 4095;
    const entry = this.pageTable.get(pageNum);
    if (!entry || !(entry.flags & 1 /* Present */)) {
      throw fault(14 /* PageFault */, `Page not mapped: 0x${vAddr.toString(16)}`, vAddr);
    }
    if (ring === 2 /* User */ && !(entry.flags & 16 /* User */)) {
      throw fault(13 /* GPF */, `Ring 2 access to kernel page: 0x${vAddr.toString(16)}`, vAddr);
    }
    if (accessFlags & 4 /* Write */ && !(entry.flags & 4 /* Write */)) {
      throw fault(13 /* GPF */, `Write to read-only page: 0x${vAddr.toString(16)}`, vAddr);
    }
    if (accessFlags & 8 /* Exec */ && !(entry.flags & 8 /* Exec */)) {
      throw fault(13 /* GPF */, `Execute on non-exec page: 0x${vAddr.toString(16)}`, vAddr);
    }
    return entry.physOffset + offset;
  }
  read8(virt, ring) {
    const phys = this.resolve(virt, 2 /* Read */, ring);
    return this.view.getUint8(phys);
  }
  read16(virt, ring) {
    const phys = this.resolve(virt, 2 /* Read */, ring);
    return this.view.getUint16(phys, true);
  }
  read32(virt, ring) {
    const phys = this.resolve(virt, 2 /* Read */, ring);
    return this.view.getInt32(phys, true);
  }
  read64(virt, ring) {
    const phys = this.resolve(virt, 2 /* Read */, ring);
    return this.view.getBigInt64(phys, true);
  }
  readF32(virt, ring) {
    const phys = this.resolve(virt, 2 /* Read */, ring);
    return this.view.getFloat32(phys, true);
  }
  readF64(virt, ring) {
    const phys = this.resolve(virt, 2 /* Read */, ring);
    return this.view.getFloat64(phys, true);
  }
  write8(virt, value, ring) {
    const phys = this.resolve(virt, 4 /* Write */, ring);
    this.view.setUint8(phys, value);
  }
  write16(virt, value, ring) {
    const phys = this.resolve(virt, 4 /* Write */, ring);
    this.view.setUint16(phys, value, true);
  }
  write32(virt, value, ring) {
    const phys = this.resolve(virt, 4 /* Write */, ring);
    this.view.setInt32(phys, value, true);
  }
  write64(virt, value, ring) {
    const phys = this.resolve(virt, 4 /* Write */, ring);
    this.view.setBigInt64(phys, value, true);
  }
  writeF32(virt, value, ring) {
    const phys = this.resolve(virt, 4 /* Write */, ring);
    this.view.setFloat32(phys, value, true);
  }
  writeF64(virt, value, ring) {
    const phys = this.resolve(virt, 4 /* Write */, ring);
    this.view.setFloat64(phys, value, true);
  }
  readBytesPhys(physOffset, length) {
    return new Uint8Array(this.physical, physOffset, length);
  }
  writeBytesPhys(physOffset, data) {
    new Uint8Array(this.physical, physOffset, data.length).set(data);
  }
  getPhysSize() {
    return this.physical.byteLength;
  }
};

// src/vm/runner.ts
function runAssembly(src, maxSteps = 1e6) {
  const { code } = assemble(src);
  const memPages = Math.ceil(code.length / PAGE_SIZE) + 8;
  const mem = new Memory(memPages * PAGE_SIZE);
  const codeStart = 16777216;
  const physOffset = mem.allocPages(Math.ceil(code.length / PAGE_SIZE) + 1, 0);
  const pageCount = Math.ceil(code.length / PAGE_SIZE) + 1;
  for (let p = 0; p < pageCount; p++) {
    mem.mapPage(
      codeStart + p * PAGE_SIZE,
      physOffset + p * PAGE_SIZE,
      1 /* Present */ | 2 /* Read */ | 8 /* Exec */ | 16 /* User */
    );
  }
  mem.writeBytesPhys(physOffset, code);
  const cpu = new CPU(mem, () => {
  }, () => {
  });
  cpu.pc = codeStart;
  cpu.ring = 2 /* User */;
  let steps = 0;
  while (!cpu.isHalted() && steps < maxSteps) {
    cpu.step();
    steps++;
  }
  return { stack: cpu.getStackSnapshot(), steps, halted: cpu.isHalted() };
}
export {
  ValueKind,
  assemble,
  runAssembly
};
