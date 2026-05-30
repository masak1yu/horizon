# Horizon VM — Virtual Filesystem

**Version**: 0.1.0

## 1. Overview

The Horizon VM provides a **Virtual Filesystem (VFS)** layer that presents a unified, POSIX-like file abstraction to kernel and user code. The VFS is not part of the VM core — it is accessed via syscalls in Ring 1, which in turn may use hypercalls to reach storage backends.

The reference storage backend in browser environments is **IndexedDB**.

## 2. Path Model

- Paths are UTF-8 encoded, null-terminated strings
- Separator: `/`
- Root: `/`
- No drive letters; single unified namespace per partition
- `.` and `..` are resolved by the VFS layer
- Maximum path length: 4096 bytes

## 3. File Descriptor

Files are accessed via **file descriptors** (fds), which are non-negative `i32` values. The VM kernel allocates fds per process.

Standard descriptors:

| FD | Name | Purpose |
|----|------|---------|
| 0 | `stdin` | Standard input |
| 1 | `stdout` | Standard output |
| 2 | `stderr` | Standard error |

## 4. Syscall Interface

All VFS operations are accessed through the `SYSCALL` instruction from Ring 2. Arguments are passed on the operand stack (rightmost argument pushed last, so it is on top at call time). Return values are pushed onto the stack after `SYSRET`.

### `SYSCALL SYS_OPEN` — Open a file

Stack before: `(path_ptr flags mode --)`
Stack after: `(fd)` where `fd < 0` on error

Flags (bitfield, `i32`):

| Bit | Name | Description |
|-----|------|-------------|
| 0 | `O_RDONLY` | Open for reading |
| 1 | `O_WRONLY` | Open for writing |
| 2 | `O_RDWR` | Open for read+write |
| 3 | `O_CREAT` | Create if not exists |
| 4 | `O_TRUNC` | Truncate on open |
| 5 | `O_APPEND` | Append mode |
| 6 | `O_EXCL` | Fail if exists (with `O_CREAT`) |
| 7 | `O_DIRECTORY` | Fail if not a directory |

### `SYSCALL SYS_CLOSE` — Close a file descriptor

Stack before: `(fd --)`
Stack after: `(result)` (`0` = success, `< 0` = error)

### `SYSCALL SYS_READ` — Read from fd

Stack before: `(fd buf_ptr len --)`
Stack after: `(bytes_read)` (`< 0` = error)

### `SYSCALL SYS_WRITE` — Write to fd

Stack before: `(fd buf_ptr len --)`
Stack after: `(bytes_written)` (`< 0` = error)

### `SYSCALL SYS_SEEK` — Seek within fd

Stack before: `(fd offset whence --)`
Stack after: `(new_offset)` (`< 0` = error)

`whence`: `0` = `SEEK_SET`, `1` = `SEEK_CUR`, `2` = `SEEK_END`

### `SYSCALL SYS_STAT` — File metadata

Stack before: `(path_ptr stat_buf_ptr --)`
Stack after: `(result)` (`0` = success)

`stat_buf` layout (64 bytes):

| Offset | Type | Field |
|--------|------|-------|
| 0 | `i32` | `mode` (type + permissions) |
| 4 | `i32` | `uid` |
| 8 | `i32` | `gid` |
| 12 | `i32` | `nlink` |
| 16 | `i64` | `size` (bytes) |
| 24 | `i64` | `atime` (ns since epoch) |
| 32 | `i64` | `mtime` |
| 40 | `i64` | `ctime` |
| 48 | `i64` | `ino` (inode number) |
| 56 | `i64` | `dev` (device id) |

### `SYSCALL SYS_MKDIR` — Create directory

Stack before: `(path_ptr mode --)`
Stack after: `(result)`

### `SYSCALL SYS_UNLINK` — Remove file

Stack before: `(path_ptr --)`
Stack after: `(result)`

### `SYSCALL SYS_RMDIR` — Remove directory

Stack before: `(path_ptr --)`
Stack after: `(result)`

### `SYSCALL SYS_RENAME` — Rename / move

Stack before: `(old_path_ptr new_path_ptr --)`
Stack after: `(result)`

### `SYSCALL SYS_READDIR` — Read directory entries

Stack before: `(fd buf_ptr len --)`
Stack after: `(result)` (number of entries read, or `< 0` on error)

Each directory entry in `buf` (variable size, first field is entry size):

| Offset | Type | Field |
|--------|------|-------|
| 0 | `u16` | `entry_size` (total bytes including name) |
| 2 | `i32` | `ino` |
| 6 | `u8` | `type` (`4` = dir, `8` = regular, `10` = symlink) |
| 7 | `u8[name_len]` | `name` (null-terminated) |

## 5. Error Codes

| Code | Name | Description |
|------|------|-------------|
| `-1` | `EPERM` | Operation not permitted |
| `-2` | `ENOENT` | No such file or directory |
| `-9` | `EBADF` | Bad file descriptor |
| `-12` | `ENOMEM` | Out of memory |
| `-13` | `EACCES` | Permission denied |
| `-17` | `EEXIST` | File exists |
| `-20` | `ENOTDIR` | Not a directory |
| `-21` | `EISDIR` | Is a directory |
| `-22` | `EINVAL` | Invalid argument |
| `-28` | `ENOSPC` | No space left on device |
| `-38` | `ENOSYS` | Syscall not implemented |

## 6. Storage Backend

The VFS kernel driver communicates with the backing store via `HYPERCALL HCALL_STORAGE_*` calls. In the browser reference implementation, the hypervisor maps these to IndexedDB operations. The interface is asynchronous at the hypervisor level but presented synchronously to the kernel via a blocked-partition model (the partition is suspended until the I/O completes, while the browser event loop continues).
