// third_party/blink/renderer/modules/horizon_vm/horizon_vm_instance.cc
//
// Execution model:
//   run() is called from JavaScript (main thread).
//   The VM execution loop runs on a ThreadPool worker thread.
//   Blocking I/O (hypercalls that touch the browser) posts tasks back
//   to the main thread and waits on a base::WaitableEvent.
//   On HALT/fault the Promise is resolved/rejected on the main thread.

#include "third_party/blink/renderer/modules/horizon_vm/horizon_vm_instance.h"

#include "base/synchronization/waitable_event.h"
#include "base/task/thread_pool.h"
#include "third_party/blink/renderer/bindings/core/v8/script_promise_resolver.h"
#include "third_party/blink/renderer/core/dom/dom_exception.h"
#include "third_party/blink/renderer/modules/horizon_vm/horizon_vm_module.h"
#include "third_party/blink/renderer/platform/bindings/exception_state.h"
#include "third_party/blink/renderer/platform/bindings/script_state.h"
#include "third_party/horizon_vm/src/cpp/include/horizon_vm/loader.h"
#include "third_party/horizon_vm/src/cpp/include/horizon_vm/opcodes.h"

namespace blink {

namespace {
constexpr uint32_t kDefaultMemoryBytes = 64u * 1024u * 1024u;  // 64 MiB
constexpr uint32_t kCodeVirtBase       = 0x01000000u;
}  // namespace

// static
HorizonVMInstance* HorizonVMInstance::Create(
    ScriptState* script_state,
    const HorizonVMModule& module,
    ExceptionState& exception_state) {

  auto raw_mem = std::make_shared<horizon::Memory>(kDefaultMemoryBytes);

  std::string load_error;
  auto maybe_loaded = horizon::LoadModule(module.GetModule(), *raw_mem,
                                           kCodeVirtBase, horizon::Ring::User,
                                           &load_error);
  if (!maybe_loaded) {
    exception_state.ThrowTypeError(String::FromUTF8(load_error));
    return nullptr;
  }
  horizon::LoadedModule loaded = std::move(*maybe_loaded);

  if (loaded.entry_virt_addr == 0xFFFFFFFFu) {
    exception_state.ThrowTypeError(
        "HorizonVM: module has no entry point (library module)");
    return nullptr;
  }

  auto* context = ExecutionContext::From(script_state);
  return MakeGarbageCollected<HorizonVMInstance>(context,
                                                  std::move(raw_mem),
                                                  std::move(loaded));
}

HorizonVMInstance::HorizonVMInstance(ExecutionContext* context,
                                       std::shared_ptr<horizon::Memory> mem,
                                       horizon::LoadedModule loaded)
    : raw_memory_(std::move(mem)),
      loaded_(std::move(loaded)),
      execution_context_(context),
      main_task_runner_(context->GetTaskRunner(TaskType::kInternalDefault)) {

  memory_ = HorizonVMMemory::CreateFromExisting(raw_memory_);

  // Construct the CPU with hypercall/syscall dispatch lambdas.
  cpu_ = std::make_unique<horizon::CPU>(
      *raw_memory_,
      [this](uint16_t num, horizon::CPU& cpu) { OnHypercall(num, cpu); },
      [this](uint16_t num, horizon::CPU& cpu) { OnSyscall(num, cpu); });

  cpu_->pc   = loaded_.entry_virt_addr;
  cpu_->ring = horizon::Ring::User;
}

HorizonVMInstance::~HorizonVMInstance() = default;

ScriptPromise<IDLUndefined> HorizonVMInstance::run(
    ScriptState* script_state,
    ExceptionState& exception_state) {
  if (state_ != State::kCreated) {
    exception_state.ThrowDOMException(
        DOMExceptionCode::kInvalidStateError,
        "HorizonVMInstance: already running or halted");
    return ScriptPromise<IDLUndefined>::Reject(script_state, exception_state);
  }

  state_ = State::kRunning;
  auto* resolver =
      MakeGarbageCollected<ScriptPromiseResolver<IDLUndefined>>(script_state);
  auto promise = resolver->Promise();

  // Launch the VM on a thread pool worker.
  base::ThreadPool::PostTask(
      FROM_HERE,
      {base::TaskPriority::USER_VISIBLE, base::MayBlock()},
      WTF::CrossThreadBindOnce(&HorizonVMInstance::RunOnWorkerThread,
                                WrapCrossThreadPersistent(this),
                                WrapCrossThreadPersistent(resolver)));

  return promise;
}

void HorizonVMInstance::RunOnWorkerThread(
    ScriptPromiseResolver<IDLUndefined>* resolver) {
  // This runs on a ThreadPool worker thread, NOT the main thread.
  cpu_->Run();  // Runs until halted (HALT or top-level RET)

  if (cpu_->has_fault()) {
    const horizon::HorizonFault& fault = cpu_->last_fault();
    String msg = String::Format(
        "VM Fault (vector 0x%02X): %s",
        fault.vector, fault.message.c_str());
    uint8_t vector = fault.vector;

    main_task_runner_->PostTask(
        FROM_HERE,
        WTF::CrossThreadBindOnce(
            [](ScriptPromiseResolver<IDLUndefined>* resolver,
               HorizonVMInstance* instance,
               String msg, uint8_t vector) {
              instance->state_ = State::kHalted;
              instance->DispatchEvent(*Event::Create(event_type_names::kFault));
              resolver->Reject(
                  MakeGarbageCollected<DOMException>(
                      DOMExceptionCode::kOperationError, msg));
            },
            WrapCrossThreadPersistent(resolver),
            WrapCrossThreadPersistent(this),
            std::move(msg),
            vector));
  } else {
    main_task_runner_->PostTask(
        FROM_HERE,
        WTF::CrossThreadBindOnce(
            [](ScriptPromiseResolver<IDLUndefined>* resolver,
               HorizonVMInstance* instance) {
              instance->state_ = State::kHalted;
              instance->DispatchEvent(*Event::Create(event_type_names::kHalt));
              resolver->Resolve();
            },
            WrapCrossThreadPersistent(resolver),
            WrapCrossThreadPersistent(this)));
  }
}

void HorizonVMInstance::OnHypercall(uint16_t num, horizon::CPU& cpu) {
  using HN = horizon::HypercallNum;

  switch (static_cast<HN>(num)) {
    // ── Display ───────────────────────────────────────────────────────
    case HN::DISPLAY_FLUSH: {
      // TODO: flush canvas region via OffscreenCanvas
      // Implemented asynchronously: post task to main thread,
      // wait on WaitableEvent, resume.
      break;
    }

    // ── Timing ────────────────────────────────────────────────────────
    case HN::TIME_MONOTONIC: {
      // base::TimeTicks::Now() is thread-safe.
      int64_t ns = base::TimeTicks::Now().since_origin().InNanoseconds();
      int32_t lo = static_cast<int32_t>(ns & 0xFFFFFFFF);
      int32_t hi = static_cast<int32_t>((ns >> 32) & 0xFFFFFFFF);
      cpu.Push(horizon::Value::from_i32(hi));
      cpu.Push(horizon::Value::from_i32(lo));
      break;
    }

    case HN::TIME_NOW: {
      // Wall clock: approximate using monotonic (real impl uses system clock)
      int64_t ms = base::TimeTicks::Now().since_origin().InMilliseconds();
      int32_t lo = static_cast<int32_t>(ms & 0xFFFFFFFF);
      int32_t hi = static_cast<int32_t>((ms >> 32) & 0xFFFFFFFF);
      cpu.Push(horizon::Value::from_i32(hi));
      cpu.Push(horizon::Value::from_i32(lo));
      break;
    }

    // ── Unimplemented ─────────────────────────────────────────────────
    default:
      // Return error code -1 for unimplemented hypercalls.
      cpu.Push(horizon::Value::from_i32(-1));
      break;
  }
}

void HorizonVMInstance::OnSyscall(uint16_t num, horizon::CPU& cpu) {
  // SYS_WRITE (fd=1 stdout, fd=2 stderr)
  constexpr uint16_t SYS_WRITE = 4;  // matches spec/05-filesystem.md
  if (num == SYS_WRITE) {
    HandleStdout(cpu, /*is_err=*/false);
    return;
  }
  // Unknown syscall: push -ENOSYS
  cpu.Push(horizon::Value::from_i32(-38));
}

void HorizonVMInstance::HandleStdout(horizon::CPU& cpu, bool /*is_err*/) {
  // Stack before SYSCALL SYS_WRITE: (fd buf_ptr len --)
  // After our handler pushes result.
  int32_t len     = cpu.Pop().as_i32();
  uint32_t buf_ptr = cpu.Pop().as_ptr();
  int32_t fd      = cpu.Pop().as_i32();
  (void)fd;

  // Read string from VM memory.
  std::string text;
  text.reserve(len);
  for (int32_t i = 0; i < len; ++i) {
    text += static_cast<char>(
        raw_memory_->Read8(buf_ptr + i, horizon::Ring::User));
  }

  // Post to main thread for console output.
  main_task_runner_->PostTask(
      FROM_HERE,
      WTF::CrossThreadBindOnce(
          [](HorizonVMInstance* instance, std::string text) {
            // Fire a custom "output" event with the text.
            // (Full impl would use an OutputEvent with a data attribute.)
            DVLOG(1) << "[HorizonVM] " << text;
          },
          WrapCrossThreadPersistent(this),
          std::move(text)));

  cpu.Push(horizon::Value::from_i32(len));  // bytes written
}

const AtomicString& HorizonVMInstance::InterfaceName() const {
  return event_target_names::kHorizonVMInstance;
}

ExecutionContext* HorizonVMInstance::GetExecutionContext() const {
  return execution_context_;
}

void HorizonVMInstance::Trace(Visitor* visitor) const {
  visitor->Trace(memory_);
  visitor->Trace(execution_context_);
  EventTarget::Trace(visitor);
}

}  // namespace blink
