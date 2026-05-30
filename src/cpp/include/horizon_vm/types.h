#pragma once
#include <cstdint>
#include <cstring>
#include <stdexcept>
#include <string>

namespace horizon {

enum class ValueKind : uint8_t {
  I32 = 0,
  I64 = 1,
  F32 = 2,
  F64 = 3,
  Ptr = 4,
};

struct Value {
  ValueKind kind;
  union {
    int32_t  i32;
    int64_t  i64;
    float    f32;
    double   f64;
    uint32_t ptr;
  };

  static Value from_i32(int32_t v)  { Value x; x.kind = ValueKind::I32; x.i32 = v; return x; }
  static Value from_i64(int64_t v)  { Value x; x.kind = ValueKind::I64; x.i64 = v; return x; }
  static Value from_f32(float v)    { Value x; x.kind = ValueKind::F32; x.f32 = v; return x; }
  static Value from_f64(double v)   { Value x; x.kind = ValueKind::F64; x.f64 = v; return x; }
  static Value from_ptr(uint32_t v) { Value x; x.kind = ValueKind::Ptr; x.ptr = v; return x; }

  int32_t  as_i32() const;
  int64_t  as_i64() const;
  float    as_f32() const;
  double   as_f64() const;
  uint32_t as_ptr() const;
};

inline int32_t Value::as_i32() const {
  if (kind != ValueKind::I32 && kind != ValueKind::Ptr)
    throw std::runtime_error("Value: expected i32/ptr");
  return i32;
}

inline int64_t Value::as_i64() const {
  if (kind != ValueKind::I64)
    throw std::runtime_error("Value: expected i64");
  return i64;
}

inline float Value::as_f32() const {
  if (kind != ValueKind::F32)
    throw std::runtime_error("Value: expected f32");
  return f32;
}

inline double Value::as_f64() const {
  if (kind != ValueKind::F64)
    throw std::runtime_error("Value: expected f64");
  return f64;
}

inline uint32_t Value::as_ptr() const {
  if (kind != ValueKind::Ptr && kind != ValueKind::I32)
    throw std::runtime_error("Value: expected ptr");
  return ptr;
}

// Page protection flags
enum PageFlags : uint8_t {
  PAGE_PRESENT = 1 << 0,
  PAGE_READ    = 1 << 1,
  PAGE_WRITE   = 1 << 2,
  PAGE_EXEC    = 1 << 3,
  PAGE_USER    = 1 << 4,
  PAGE_SHARED  = 1 << 5,
};

constexpr uint32_t kPageSize = 0x1000;  // 4 KiB

struct HorizonFault : std::exception {
  uint8_t  vector;
  uint32_t address;
  std::string message;

  HorizonFault(uint8_t v, std::string msg, uint32_t addr = 0)
      : vector(v), address(addr), message(std::move(msg)) {}

  const char* what() const noexcept override { return message.c_str(); }
};

}  // namespace horizon
