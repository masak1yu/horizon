// third_party/blink/renderer/modules/horizon_vm/horizon_vm.h
// Implementation of the HorizonVM namespace (HorizonVM.compile(), etc.)

#pragma once

#include "third_party/blink/renderer/bindings/core/v8/script_promise.h"
#include "third_party/blink/renderer/platform/bindings/script_wrappable.h"
#include "third_party/blink/renderer/platform/heap/garbage_collected.h"

namespace blink {

class HorizonVMModule;
class ScriptState;
class V8BufferSource;
class Response;

// Static namespace — not constructible.
class HorizonVM final {
  STATIC_ONLY(HorizonVM);

 public:
  // HorizonVM.compile(bytes) → Promise<HorizonVMModule>
  static ScriptPromise<HorizonVMModule> compile(
      ScriptState* script_state,
      const V8BufferSource* bytes,
      ExceptionState& exception_state);

  // HorizonVM.compileStreaming(responsePromise) → Promise<HorizonVMModule>
  static ScriptPromise<HorizonVMModule> compileStreaming(
      ScriptState* script_state,
      ScriptPromise<Response> source,
      ExceptionState& exception_state);

  // HorizonVM.validate(bytes) → Promise<bool>
  static ScriptPromise<IDLBoolean> validate(
      ScriptState* script_state,
      const V8BufferSource* bytes,
      ExceptionState& exception_state);
};

}  // namespace blink
