import { Opcode } from '../vm/opcodes.js';

type Token = { kind: 'mnemonic' | 'label' | 'labelref' | 'int' | 'float' | 'comment'; value: string; line: number };

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const stripped = line.replace(/;.*$/, '').trim();
    if (!stripped) continue;

    const parts = stripped.split(/\s+/);
    for (const part of parts) {
      if (part.endsWith(':')) {
        tokens.push({ kind: 'label', value: part.slice(0, -1), line: lineNum });
      } else if (part.startsWith('@')) {
        tokens.push({ kind: 'labelref', value: part.slice(1), line: lineNum });
      } else if (/^-?\d+\.\d+$/.test(part)) {
        tokens.push({ kind: 'float', value: part, line: lineNum });
      } else if (/^-?\d+$/.test(part) || /^0x[0-9a-fA-F]+$/.test(part)) {
        tokens.push({ kind: 'int', value: part, line: lineNum });
      } else {
        tokens.push({ kind: 'mnemonic', value: part.toUpperCase(), line: lineNum });
      }
    }
  }
  return tokens;
}

function writeI32LE(buf: number[], v: number): void {
  const n = v | 0;
  buf.push(n & 0xFF, (n >> 8) & 0xFF, (n >> 16) & 0xFF, (n >> 24) & 0xFF);
}

function writeI64LE(buf: number[], v: bigint): void {
  const lo = Number(v & 0xFFFFFFFFn);
  const hi = Number((v >> 32n) & 0xFFFFFFFFn);
  writeI32LE(buf, lo);
  writeI32LE(buf, hi);
}

function writeF32LE(buf: number[], v: number): void {
  const fa = new Float32Array([v]);
  const ia = new Int32Array(fa.buffer);
  writeI32LE(buf, ia[0]);
}

function writeF64LE(buf: number[], v: number): void {
  const fa = new Float64Array([v]);
  const ia = new Int32Array(fa.buffer);
  writeI32LE(buf, ia[0]);
  writeI32LE(buf, ia[1]);
}

function writeU16LE(buf: number[], v: number): void {
  buf.push(v & 0xFF, (v >> 8) & 0xFF);
}

function parseInt_(s: string): number {
  if (s.startsWith('0x') || s.startsWith('0X')) return parseInt(s, 16);
  return parseInt(s, 10);
}

export interface AssemblyResult {
  code: Uint8Array;
  labels: Map<string, number>;
}

export function assemble(src: string): AssemblyResult {
  const tokens = tokenize(src);
  const labels = new Map<string, number>();
  const buf: number[] = [];

  // Patch records: { bufOffset, labelName } for forward references
  const patches: Array<{ bufOffset: number; labelName: string; instrStart: number }> = [];

  let ti = 0;

  function nextToken(): Token {
    if (ti >= tokens.length) throw new Error('Unexpected end of input');
    return tokens[ti++];
  }

  function expectInt(): number {
    const t = nextToken();
    if (t.kind !== 'int') throw new Error(`Line ${t.line}: expected integer, got ${t.kind} "${t.value}"`);
    return parseInt_(t.value);
  }

  function expectFloat(): number {
    const t = nextToken();
    if (t.kind !== 'float' && t.kind !== 'int') throw new Error(`Line ${t.line}: expected float`);
    return parseFloat(t.value);
  }

  function expectLabelRef(): string {
    const t = nextToken();
    if (t.kind === 'labelref') return t.value;
    if (t.kind === 'int') return t.value; // allow numeric literals too
    throw new Error(`Line ${t.line}: expected @label, got "${t.value}"`);
  }

  while (ti < tokens.length) {
    const tok = tokens[ti++];

    if (tok.kind === 'label') {
      labels.set(tok.value, buf.length);
      continue;
    }

    if (tok.kind !== 'mnemonic') {
      throw new Error(`Line ${tok.line}: unexpected token "${tok.value}"`);
    }

    const instrStart = buf.length;

    switch (tok.value) {
      case 'NOP':    buf.push(Opcode.NOP); break;
      case 'HALT':   buf.push(Opcode.HALT); break;
      case 'BRK':    buf.push(Opcode.BRK); break;

      case 'PUSH.I32': buf.push(Opcode.PUSH_I32); writeI32LE(buf, expectInt()); break;
      case 'PUSH.I64': buf.push(Opcode.PUSH_I64); writeI64LE(buf, BigInt(expectInt())); break;
      case 'PUSH.F32': buf.push(Opcode.PUSH_F32); writeF32LE(buf, expectFloat()); break;
      case 'PUSH.F64': buf.push(Opcode.PUSH_F64); writeF64LE(buf, expectFloat()); break;
      case 'POP':    buf.push(Opcode.POP); break;
      case 'DUP':    buf.push(Opcode.DUP); break;
      case 'SWAP':   buf.push(Opcode.SWAP); break;
      case 'OVER':   buf.push(Opcode.OVER); break;

      case 'I32.ADD':   buf.push(Opcode.I32_ADD); break;
      case 'I32.SUB':   buf.push(Opcode.I32_SUB); break;
      case 'I32.MUL':   buf.push(Opcode.I32_MUL); break;
      case 'I32.DIV_S': buf.push(Opcode.I32_DIV_S); break;
      case 'I32.DIV_U': buf.push(Opcode.I32_DIV_U); break;
      case 'I32.REM_S': buf.push(Opcode.I32_REM_S); break;
      case 'I32.REM_U': buf.push(Opcode.I32_REM_U); break;
      case 'I32.NEG':   buf.push(Opcode.I32_NEG); break;

      case 'I64.ADD':   buf.push(Opcode.I64_ADD); break;
      case 'I64.SUB':   buf.push(Opcode.I64_SUB); break;
      case 'I64.MUL':   buf.push(Opcode.I64_MUL); break;
      case 'I64.DIV_S': buf.push(Opcode.I64_DIV_S); break;
      case 'I64.DIV_U': buf.push(Opcode.I64_DIV_U); break;
      case 'I64.REM_S': buf.push(Opcode.I64_REM_S); break;
      case 'I64.REM_U': buf.push(Opcode.I64_REM_U); break;
      case 'I64.NEG':   buf.push(Opcode.I64_NEG); break;

      case 'F32.ADD': buf.push(Opcode.F32_ADD); break;
      case 'F32.SUB': buf.push(Opcode.F32_SUB); break;
      case 'F32.MUL': buf.push(Opcode.F32_MUL); break;
      case 'F32.DIV': buf.push(Opcode.F32_DIV); break;
      case 'F64.ADD': buf.push(Opcode.F64_ADD); break;
      case 'F64.SUB': buf.push(Opcode.F64_SUB); break;
      case 'F64.MUL': buf.push(Opcode.F64_MUL); break;
      case 'F64.DIV': buf.push(Opcode.F64_DIV); break;

      case 'I32.AND':   buf.push(Opcode.I32_AND); break;
      case 'I32.OR':    buf.push(Opcode.I32_OR); break;
      case 'I32.XOR':   buf.push(Opcode.I32_XOR); break;
      case 'I32.NOT':   buf.push(Opcode.I32_NOT); break;
      case 'I32.SHL':   buf.push(Opcode.I32_SHL); break;
      case 'I32.SHR_S': buf.push(Opcode.I32_SHR_S); break;
      case 'I32.SHR_U': buf.push(Opcode.I32_SHR_U); break;
      case 'I64.AND':   buf.push(Opcode.I64_AND); break;
      case 'I64.OR':    buf.push(Opcode.I64_OR); break;
      case 'I64.XOR':   buf.push(Opcode.I64_XOR); break;
      case 'I64.NOT':   buf.push(Opcode.I64_NOT); break;
      case 'I64.SHL':   buf.push(Opcode.I64_SHL); break;
      case 'I64.SHR_S': buf.push(Opcode.I64_SHR_S); break;
      case 'I64.SHR_U': buf.push(Opcode.I64_SHR_U); break;

      case 'I32.EQ':   buf.push(Opcode.I32_EQ); break;
      case 'I32.NE':   buf.push(Opcode.I32_NE); break;
      case 'I32.LT_S': buf.push(Opcode.I32_LT_S); break;
      case 'I32.LT_U': buf.push(Opcode.I32_LT_U); break;
      case 'I32.LE_S': buf.push(Opcode.I32_LE_S); break;
      case 'I32.LE_U': buf.push(Opcode.I32_LE_U); break;
      case 'I32.GT_S': buf.push(Opcode.I32_GT_S); break;
      case 'I32.GT_U': buf.push(Opcode.I32_GT_U); break;
      case 'I32.GE_S': buf.push(Opcode.I32_GE_S); break;
      case 'I32.GE_U': buf.push(Opcode.I32_GE_U); break;
      case 'I64.EQ':   buf.push(Opcode.I64_EQ); break;
      case 'I64.NE':   buf.push(Opcode.I64_NE); break;
      case 'I64.LT_S': buf.push(Opcode.I64_LT_S); break;
      case 'I64.LT_U': buf.push(Opcode.I64_LT_U); break;
      case 'I64.LE_S': buf.push(Opcode.I64_LE_S); break;
      case 'I64.LE_U': buf.push(Opcode.I64_LE_U); break;
      case 'F32.EQ':   buf.push(Opcode.F32_EQ); break;
      case 'F32.LT':   buf.push(Opcode.F32_LT); break;
      case 'F32.LE':   buf.push(Opcode.F32_LE); break;
      case 'F64.EQ':   buf.push(Opcode.F64_EQ); break;
      case 'F64.LT':   buf.push(Opcode.F64_LT); break;
      case 'F64.LE':   buf.push(Opcode.F64_LE); break;

      case 'LOAD.I8S':  buf.push(Opcode.LOAD_I8S);  writeI32LE(buf, expectInt()); break;
      case 'LOAD.I8U':  buf.push(Opcode.LOAD_I8U);  writeI32LE(buf, expectInt()); break;
      case 'LOAD.I16S': buf.push(Opcode.LOAD_I16S); writeI32LE(buf, expectInt()); break;
      case 'LOAD.I16U': buf.push(Opcode.LOAD_I16U); writeI32LE(buf, expectInt()); break;
      case 'LOAD.I32':  buf.push(Opcode.LOAD_I32);  writeI32LE(buf, expectInt()); break;
      case 'LOAD.I64':  buf.push(Opcode.LOAD_I64);  writeI32LE(buf, expectInt()); break;
      case 'LOAD.F32':  buf.push(Opcode.LOAD_F32);  writeI32LE(buf, expectInt()); break;
      case 'LOAD.F64':  buf.push(Opcode.LOAD_F64);  writeI32LE(buf, expectInt()); break;
      case 'STORE.I8':  buf.push(Opcode.STORE_I8);  writeI32LE(buf, expectInt()); break;
      case 'STORE.I16': buf.push(Opcode.STORE_I16); writeI32LE(buf, expectInt()); break;
      case 'STORE.I32': buf.push(Opcode.STORE_I32); writeI32LE(buf, expectInt()); break;
      case 'STORE.I64': buf.push(Opcode.STORE_I64); writeI32LE(buf, expectInt()); break;
      case 'STORE.F32': buf.push(Opcode.STORE_F32); writeI32LE(buf, expectInt()); break;
      case 'STORE.F64': buf.push(Opcode.STORE_F64); writeI32LE(buf, expectInt()); break;

      case 'JMP': {
        buf.push(Opcode.JMP);
        const ref = expectLabelRef();
        if (/^-?\d+$/.test(ref)) {
          writeI32LE(buf, parseInt_(ref));
        } else {
          patches.push({ bufOffset: buf.length, labelName: ref, instrStart });
          writeI32LE(buf, 0);
        }
        break;
      }
      case 'JZ': {
        buf.push(Opcode.JZ);
        const ref = expectLabelRef();
        patches.push({ bufOffset: buf.length, labelName: ref, instrStart });
        writeI32LE(buf, 0);
        break;
      }
      case 'JNZ': {
        buf.push(Opcode.JNZ);
        const ref = expectLabelRef();
        patches.push({ bufOffset: buf.length, labelName: ref, instrStart });
        writeI32LE(buf, 0);
        break;
      }
      case 'CALL': {
        buf.push(Opcode.CALL);
        const ref = expectLabelRef();
        patches.push({ bufOffset: buf.length, labelName: ref, instrStart });
        writeI32LE(buf, 0);
        break;
      }
      case 'CALL.IND': buf.push(Opcode.CALL_IND); break;
      case 'RET':      buf.push(Opcode.RET); break;
      case 'RET.VAL':  buf.push(Opcode.RET_VAL); break;

      case 'ENTER': buf.push(Opcode.ENTER); writeU16LE(buf, expectInt()); break;
      case 'LEAVE': buf.push(Opcode.LEAVE); break;
      case 'LOCAL.GET': buf.push(Opcode.LOCAL_GET); writeU16LE(buf, expectInt()); break;
      case 'LOCAL.SET': buf.push(Opcode.LOCAL_SET); writeU16LE(buf, expectInt()); break;
      case 'ARG.GET':   buf.push(Opcode.ARG_GET);   writeU16LE(buf, expectInt()); break;

      case 'I32.EXTEND_S':    buf.push(Opcode.I32_EXTEND_S); break;
      case 'I32.EXTEND_U':    buf.push(Opcode.I32_EXTEND_U); break;
      case 'I64.WRAP':        buf.push(Opcode.I64_WRAP); break;
      case 'F32.DEMOTE':      buf.push(Opcode.F32_DEMOTE); break;
      case 'F64.PROMOTE':     buf.push(Opcode.F64_PROMOTE); break;
      case 'I32.TRUNC_F32_S': buf.push(Opcode.I32_TRUNC_F32_S); break;
      case 'I32.TRUNC_F32_U': buf.push(Opcode.I32_TRUNC_F32_U); break;
      case 'I32.TRUNC_F64_S': buf.push(Opcode.I32_TRUNC_F64_S); break;
      case 'I32.TRUNC_F64_U': buf.push(Opcode.I32_TRUNC_F64_U); break;
      case 'I64.TRUNC_F32_S': buf.push(Opcode.I64_TRUNC_F32_S); break;
      case 'I64.TRUNC_F32_U': buf.push(Opcode.I64_TRUNC_F32_U); break;
      case 'I64.TRUNC_F64_S': buf.push(Opcode.I64_TRUNC_F64_S); break;
      case 'I64.TRUNC_F64_U': buf.push(Opcode.I64_TRUNC_F64_U); break;
      case 'F32.CONVERT_I32_S': buf.push(Opcode.F32_CONVERT_I32_S); break;
      case 'F32.CONVERT_I32_U': buf.push(Opcode.F32_CONVERT_I32_U); break;
      case 'F32.CONVERT_I64_S': buf.push(Opcode.F32_CONVERT_I64_S); break;
      case 'F32.CONVERT_I64_U': buf.push(Opcode.F32_CONVERT_I64_U); break;
      case 'F64.CONVERT_I32_S': buf.push(Opcode.F64_CONVERT_I32_S); break;
      case 'F64.CONVERT_I32_U': buf.push(Opcode.F64_CONVERT_I32_U); break;
      case 'F64.CONVERT_I64_S': buf.push(Opcode.F64_CONVERT_I64_S); break;
      case 'F64.CONVERT_I64_U': buf.push(Opcode.F64_CONVERT_I64_U); break;

      case 'SYSCALL':   buf.push(Opcode.SYSCALL);   writeU16LE(buf, expectInt()); break;
      case 'SYSRET':    buf.push(Opcode.SYSRET); break;
      case 'HYPERCALL': buf.push(Opcode.HYPERCALL); writeU16LE(buf, expectInt()); break;
      case 'HYPERET':   buf.push(Opcode.HYPERET); break;
      case 'INT':       buf.push(Opcode.INT); buf.push(expectInt() & 0xFF); break;
      case 'IRET':      buf.push(Opcode.IRET); break;
      case 'CLI':       buf.push(Opcode.CLI); break;
      case 'STI':       buf.push(Opcode.STI); break;
      case 'RING.GET':  buf.push(Opcode.RING_GET); break;
      case 'PAGE.MAP':  buf.push(Opcode.PAGE_MAP); break;
      case 'PAGE.UNMAP': buf.push(Opcode.PAGE_UNMAP); break;
      case 'PTBR.SET':  buf.push(Opcode.PTBR_SET); break;
      case 'PTBR.GET':  buf.push(Opcode.PTBR_GET); break;
      case 'IVT.SET':   buf.push(Opcode.IVT_SET); break;

      default:
        throw new Error(`Line ${tok.line}: unknown mnemonic "${tok.value}"`);
    }
  }

  // Apply label patches
  const codeArr = new Uint8Array(buf);
  const patch32 = new DataView(codeArr.buffer);

  for (const p of patches) {
    const targetAddr = labels.get(p.labelName);
    if (targetAddr === undefined) {
      throw new Error(`Undefined label: "${p.labelName}"`);
    }
    // Offset is relative to end of instruction (p.bufOffset + 4)
    const relOffset = targetAddr - (p.bufOffset + 4);
    patch32.setInt32(p.bufOffset, relOffset, true);
  }

  return { code: codeArr, labels };
}
