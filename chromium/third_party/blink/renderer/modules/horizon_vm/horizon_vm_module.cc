// third_party/blink/renderer/modules/horizon_vm/horizon_vm_module.cc

#include "third_party/blink/renderer/modules/horizon_vm/horizon_vm_module.h"

#include "third_party/blink/renderer/bindings/core/v8/script_promise_resolver.h"
#include "third_party/blink/renderer/modules/horizon_vm/horizon_vm_instance.h"
#include "third_party/blink/renderer/platform/bindings/exception_state.h"

namespace blink {

// static
HorizonVMModule* HorizonVMModule::Create(horizon::Module module) {
  return MakeGarbageCollected<HorizonVMModule>(std::move(module));
}

HorizonVMModule::HorizonVMModule(horizon::Module module)
    : module_(std::move(module)) {
  // Extract module name from .meta section if present.
  // For now, name is empty until .meta section parsing is implemented.
  name_ = g_empty_string;
}

ScriptPromise<HorizonVMInstance> HorizonVMModule::instantiate(
    ScriptState* script_state,
    HorizonVMImports* /*imports*/,
    ExceptionState& exception_state) {
  auto* instance = HorizonVMInstance::Create(script_state, *this,
                                               exception_state);
  if (!instance)
    return ScriptPromise<HorizonVMInstance>::Reject(script_state,
                                                     exception_state);

  return ScriptPromise<HorizonVMInstance>::FromValue(
      script_state, WrapPersistent(instance));
}

void HorizonVMModule::Trace(Visitor* visitor) const {
  ScriptWrappable::Trace(visitor);
}

}  // namespace blink
