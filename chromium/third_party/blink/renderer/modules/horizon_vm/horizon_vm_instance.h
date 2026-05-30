// third_party/blink/renderer/modules/horizon_vm/horizon_vm_instance.h
//
// HorizonVMInstance owns one running VM (CPU + Memory) and bridges
// its synchronous execution loop into Blink's async task model.
//
// Execution model:
//   JavaScript calls instance.run() → returns a Promise.
//   The VM runs in a Blink WorkerThread (off the main thread).
//   HYPERCALL/SYSCALL handlers that need browser I/O post tasks
//   back to the main thread and suspend the VM thread until resolved.
//   On HALT or top-level RET, the Promise resolves.
//   On VM fault, the Promise rejects.

#pragma once

#include "base/memory/scoped_refptr.h"
#include "base/task/single_thread_task_runner.h"
#include "third_party/blink/renderer/bindings/core/v8/script_promise.h"
#include "third_party/blink/renderer/bindings/core/v8/script_promise_resolver.h"
#include "third_party/blink/renderer/core/dom/events/event_target.h"
#include "third_party/blink/renderer/modules/horizon_vm/horizon_vm_memory.h"
#include "third_party/blink/renderer/platform/bindings/script_wrappable.h"
#include "third_party/blink/renderer/platform/heap/garbage_collected.h"
#include "third_party/horizon_vm/src/cpp/include/horizon_vm/cpu.h"
#include "third_party/horizon_vm/src/cpp/include/horizon_vm/loader.h"
#include <memory>

namespace blink {

class HorizonVMModule;
class ScriptState;

class HorizonVMInstance final : public EventTarget {
  DEFINE_WRAPPERTYPEINFO();

 public:
  static HorizonVMInstance* Create(ScriptState* script_state,
                                    const HorizonVMModule& module,
                                    ExceptionState& exception_state);

  ~HorizonVMInstance() override;

  // IDL: Promise<undefined> run()
  ScriptPromise<IDLUndefined> run(ScriptState* script_state,
                                   ExceptionState& exception_state);

  // IDL: readonly attribute HorizonVMMemory memory
  HorizonVMMemory* memory() const { return memory_; }

  // IDL: readonly attribute unsigned short ring
  uint16_t ring() const;

  // IDL: attribute EventHandler onhalt
  DEFINE_ATTRIBUTE_EVENT_LISTENER(halt, kHalt)

  // IDL: attribute EventHandler onfault
  DEFINE_ATTRIBUTE_EVENT_LISTENER(fault, kFault)

  // EventTarget overrides
  const AtomicString& InterfaceName() const override;
  ExecutionContext* GetExecutionContext() const override;

  void Trace(Visitor* visitor) const override;

 private:
  HorizonVMInstance(ExecutionContext* context,
                     std::shared_ptr<horizon::Memory> mem,
                     horizon::LoadedModule loaded);

  // Called on the VM worker thread.
  void RunOnWorkerThread(ScriptPromiseResolver<IDLUndefined>* resolver);

  // Hypercall dispatcher (called from the VM thread).
  void OnHypercall(uint16_t num, horizon::CPU& cpu);

  // Syscall dispatcher (called from the VM thread).
  void OnSyscall(uint16_t num, horizon::CPU& cpu);

  // Writes text to the JS console / fires output event.
  void HandleStdout(horizon::CPU& cpu, bool is_err);

  Member<HorizonVMMemory>    memory_;
  Member<ExecutionContext>   execution_context_;

  std::shared_ptr<horizon::Memory>  raw_memory_;
  std::unique_ptr<horizon::CPU>     cpu_;
  horizon::LoadedModule             loaded_;

  // Task runner for the main thread (for posting resolved I/O results).
  scoped_refptr<base::SingleThreadTaskRunner> main_task_runner_;

  enum class State { kCreated, kRunning, kHalted };
  State state_ = State::kCreated;
};

}  // namespace blink
