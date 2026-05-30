# Horizon VM — Chromium Integration Guide

This directory contains files that must be copied into the Chromium source tree.
The Horizon VM C++ core (`third_party/horizon_vm/`) is platform-independent;
the Blink module (`third_party/blink/renderer/modules/horizon_vm/`) wraps it
in the web platform API.

## Phase 1: Coexistence with V8 (target for initial integration)

Horizon VM runs **alongside** V8. JavaScript continues to use V8.
`.hzbc` files are handled by Horizon VM, exposed via the `HorizonVM` namespace.

## Directory Layout (in Chromium source tree)

```
chromium/
  third_party/
    horizon_vm/                          ← C++ VM core (platform-independent)
      README.chromium
      BUILD.gn
      src/cpp/                           ← from horizon repo: src/cpp/
  third_party/blink/renderer/modules/
    horizon_vm/                          ← Blink Web API bindings
      BUILD.gn
      horizon_vm.idl
      horizon_vm.h / .cc                 ← HorizonVM namespace (compile/validate)
      horizon_vm_module.h / .cc          ← HorizonVMModule interface
      horizon_vm_instance.h / .cc        ← HorizonVMInstance interface
      horizon_vm_memory.h / .cc          ← HorizonVMMemory interface
```

## Step-by-Step Integration

### 1. Copy the C++ core

```bash
# From the horizon project root:
cp -r src/cpp chromium/third_party/horizon_vm/src/cpp
cp chromium/third_party/horizon_vm/BUILD.gn \
   /path/to/chromium/third_party/horizon_vm/BUILD.gn
cp chromium/third_party/horizon_vm/README.chromium \
   /path/to/chromium/third_party/horizon_vm/README.chromium
```

### 2. Copy the Blink module

```bash
cp -r chromium/third_party/blink/renderer/modules/horizon_vm \
      /path/to/chromium/third_party/blink/renderer/modules/
```

### 3. Register the Blink module

Edit `third_party/blink/renderer/modules/BUILD.gn`, add:

```gn
if (blink_runtime_feature_default("HorizonVM")) {
  deps += [ "//third_party/blink/renderer/modules/horizon_vm" ]
}
```

### 4. Add the runtime feature flag

Edit `third_party/blink/renderer/platform/runtime_enabled_features.json5`:

```json5
{
  name: "HorizonVM",
  status: "experimental",
},
```

### 5. Register the namespace and IDL

Edit `third_party/blink/renderer/modules/modules_initializer.cc`,
add the `HorizonVM` namespace registration.

In `third_party/blink/renderer/modules/BUILD.gn` (idl_files list):

```gn
"horizon_vm/horizon_vm.idl",
"horizon_vm/horizon_vm_module.idl",
"horizon_vm/horizon_vm_instance.idl",
"horizon_vm/horizon_vm_memory.idl",
```

### 6. Add MIME type handler

Edit `net/base/mime_util.cc` to map `application/horizon-bytecode` to `.hzbc`.

Edit `third_party/blink/renderer/core/loader/` to handle the new MIME type
(similar to how `application/wasm` routes to the WASM pipeline).

### 7. Enable the feature flag for development

In `out/Default/args.gn`:

```gn
blink_enable_generated_code_formatting = false
enable_horizon_vm = true
```

Or launch Chrome with:

```
--enable-blink-features=HorizonVM
```

## Build

```bash
cd /path/to/chromium
gn gen out/Default
ninja -C out/Default chrome
```

## Testing

Run the Web Platform Tests:

```bash
python3 tools/run_tests.py web_platform_tests \
    third_party/blink/web_tests/external/wpt/horizon-vm/
```

## Architecture

```
Browser Process
  HorizonHypervisor (singleton per profile)
    │ manages partitions, physical memory allocation
    │
Renderer Process
  Blink::HorizonVMInstance  ← JS-facing object
    │ wraps
    └─ horizon::CPU  ← C++ VM execution
         │ reads/writes
         └─ horizon::Memory  ← virtual address space

  Async I/O:
    horizon::CPU → [BLOCKED] → Chromium TaskRunner → resume
```

## Long-Term: V8 Replacement (Phase 2)

To eventually replace V8:
1. Compile the JavaScript engine (e.g., a JS-to-HorizonVM compiler) to `.hzbc`
2. Register it as the default script handler in Blink for `text/javascript`
3. Route all script execution through Horizon VM
4. Remove V8 dependency

This requires a full JavaScript compiler targeting Horizon VM bytecode,
which is a separate project from the VM itself.
