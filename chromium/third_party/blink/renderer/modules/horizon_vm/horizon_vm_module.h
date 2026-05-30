// third_party/blink/renderer/modules/horizon_vm/horizon_vm_module.h
// Blink wrapper for a compiled Horizon VM bytecode module.

#pragma once

#include "third_party/blink/renderer/bindings/core/v8/script_promise.h"
#include "third_party/blink/renderer/core/dom/dom_exception.h"
#include "third_party/blink/renderer/platform/bindings/script_wrappable.h"
#include "third_party/blink/renderer/platform/heap/garbage_collected.h"
#include "third_party/blink/renderer/platform/wtf/text/wtf_string.h"
#include "third_party/horizon_vm/src/cpp/include/horizon_vm/loader.h"
#include <memory>

namespace blink {

class HorizonVMImports;
class HorizonVMInstance;
class ScriptState;

class HorizonVMModule final : public ScriptWrappable {
  DEFINE_WRAPPERTYPEINFO();

 public:
  static HorizonVMModule* Create(horizon::Module module);

  explicit HorizonVMModule(horizon::Module module);
  ~HorizonVMModule() override = default;

  // IDL: readonly attribute unsigned short minRing
  uint16_t minRing() const {
    return static_cast<uint16_t>(module_.min_ring);
  }

  // IDL: readonly attribute DOMString name
  String name() const { return name_; }

  // IDL: Promise<HorizonVMInstance> instantiate(optional HorizonVMImports)
  ScriptPromise<HorizonVMInstance> instantiate(
      ScriptState* script_state,
      HorizonVMImports* imports,
      ExceptionState& exception_state);

  const horizon::Module& GetModule() const { return module_; }

  void Trace(Visitor* visitor) const override;

 private:
  horizon::Module module_;
  String          name_;
};

}  // namespace blink
