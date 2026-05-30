// third_party/blink/renderer/modules/horizon_vm/horizon_vm.cc

#include "third_party/blink/renderer/modules/horizon_vm/horizon_vm.h"

#include "base/task/thread_pool.h"
#include "third_party/blink/renderer/bindings/core/v8/script_promise_resolver.h"
#include "third_party/blink/renderer/bindings/core/v8/v8_buffer_source.h"
#include "third_party/blink/renderer/core/fetch/response.h"
#include "third_party/blink/renderer/modules/horizon_vm/horizon_vm_module.h"
#include "third_party/blink/renderer/platform/bindings/exception_state.h"
#include "third_party/blink/renderer/platform/bindings/script_state.h"
#include "third_party/horizon_vm/src/cpp/include/horizon_vm/loader.h"

namespace blink {

namespace {

// Parse and validate a .hzbc buffer, returning a Module or nullptr on error.
std::optional<horizon::Module> ParseBytecode(const uint8_t* data, size_t size,
                                               std::string& out_error) {
  try {
    return horizon::ParseModule(data, size);
  } catch (const std::exception& e) {
    out_error = e.what();
    return std::nullopt;
  }
}

// Extracts a flat byte span from a V8BufferSource (ArrayBuffer or TypedArray).
std::pair<const uint8_t*, size_t> ExtractBytes(const V8BufferSource* source) {
  if (source->IsArrayBuffer()) {
    auto* buf = source->GetAsArrayBuffer();
    return {static_cast<const uint8_t*>(buf->Data()), buf->ByteLength()};
  }
  auto* view = source->GetAsArrayBufferView();
  return {static_cast<const uint8_t*>(view->BaseAddress()),
          view->byteLength()};
}

}  // namespace

// static
ScriptPromise<HorizonVMModule> HorizonVM::compile(
    ScriptState* script_state,
    const V8BufferSource* bytes,
    ExceptionState& exception_state) {
  auto [data, size] = ExtractBytes(bytes);
  std::string error;
  auto maybe_module = ParseBytecode(data, size, error);

  if (!maybe_module) {
    exception_state.ThrowTypeError(String::FromUTF8(error));
    return ScriptPromise<HorizonVMModule>::RejectWithDOMException(
        script_state,
        MakeGarbageCollected<DOMException>(DOMExceptionCode::kDataError,
                                           String::FromUTF8(error)));
  }

  auto* module = HorizonVMModule::Create(std::move(*maybe_module));
  return ScriptPromise<HorizonVMModule>::FromValue(
      script_state,
      WrapPersistent(module));
}

// static
ScriptPromise<HorizonVMModule> HorizonVM::compileStreaming(
    ScriptState* script_state,
    ScriptPromise<Response> source,
    ExceptionState& /*exception_state*/) {
  // Resolve the Response promise, fetch the body as ArrayBuffer,
  // then parse synchronously (streaming decode can be added later).
  auto* resolver =
      MakeGarbageCollected<ScriptPromiseResolver<HorizonVMModule>>(
          script_state);
  auto promise = resolver->Promise();

  source.Then(
      script_state,
      WTF::BindOnce(
          [](ScriptPromiseResolver<HorizonVMModule>* resolver,
             ScriptState* script_state, Response* response) {
            // response->arrayBuffer() returns Promise<ArrayBuffer>
            response->arrayBuffer(script_state)
                .Then(script_state,
                      WTF::BindOnce(
                          [](ScriptPromiseResolver<HorizonVMModule>* resolver,
                             ScriptState* script_state,
                             DOMArrayBuffer* buf) {
                            const uint8_t* data =
                                static_cast<const uint8_t*>(buf->Data());
                            size_t size = buf->ByteLength();
                            std::string err;
                            auto maybe = ParseBytecode(data, size, err);
                            if (!maybe) {
                              resolver->Reject(
                                  V8ThrowException::CreateTypeError(
                                      script_state->GetIsolate(),
                                      String::FromUTF8(err)));
                              return;
                            }
                            resolver->Resolve(
                                HorizonVMModule::Create(std::move(*maybe)));
                          },
                          WrapPersistent(resolver),
                          WrapPersistent(script_state)));
          },
          WrapPersistent(resolver),
          WrapPersistent(script_state)));

  return promise;
}

// static
ScriptPromise<IDLBoolean> HorizonVM::validate(
    ScriptState* script_state,
    const V8BufferSource* bytes,
    ExceptionState& /*exception_state*/) {
  auto [data, size] = ExtractBytes(bytes);
  std::string err;
  bool valid = ParseBytecode(data, size, err).has_value();
  return ScriptPromise<IDLBoolean>::FromValue(script_state,
                                               v8::Boolean::New(
                                                   script_state->GetIsolate(),
                                                   valid));
}

}  // namespace blink
