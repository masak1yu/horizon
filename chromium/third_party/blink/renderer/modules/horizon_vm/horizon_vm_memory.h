// third_party/blink/renderer/modules/horizon_vm/horizon_vm_memory.h

#pragma once

#include "third_party/blink/renderer/platform/bindings/script_wrappable.h"
#include "third_party/blink/renderer/platform/heap/garbage_collected.h"
#include "third_party/horizon_vm/src/cpp/include/horizon_vm/memory.h"
#include <memory>

namespace blink {

class HorizonVMMemoryDescriptor;
class ScriptState;
class DOMArrayBuffer;

class HorizonVMMemory final : public ScriptWrappable {
  DEFINE_WRAPPERTYPEINFO();

 public:
  // IDL constructor: new HorizonVMMemory({ initial: N, maximum: M })
  static HorizonVMMemory* Create(const HorizonVMMemoryDescriptor* descriptor,
                                  ExceptionState& exception_state);

  // Internal constructor: called by HorizonVMInstance on instantiation.
  static HorizonVMMemory* CreateFromExisting(
      std::shared_ptr<horizon::Memory> mem);

  ~HorizonVMMemory() override = default;

  // IDL: unsigned long grow(unsigned long delta)
  // Returns previous page count, or -1 (as uint32 max) on failure.
  uint32_t grow(uint32_t delta, ExceptionState& exception_state);

  // IDL: readonly attribute ArrayBuffer buffer
  DOMArrayBuffer* buffer() const;

  // Internal access for HorizonVMInstance.
  horizon::Memory& GetMemory() { return *memory_; }
  const horizon::Memory& GetMemory() const { return *memory_; }

  void Trace(Visitor* visitor) const override;

 private:
  explicit HorizonVMMemory(std::shared_ptr<horizon::Memory> memory,
                            uint32_t max_pages);

  std::shared_ptr<horizon::Memory> memory_;
  uint32_t current_pages_;
  uint32_t max_pages_;

  // Backing ArrayBuffer that wraps memory_->physical data.
  // Recreated on grow().
  mutable Member<DOMArrayBuffer> buffer_;
};

}  // namespace blink
