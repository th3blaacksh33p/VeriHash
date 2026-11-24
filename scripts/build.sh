#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
NATIVE_DIR="$ROOT_DIR/src/native"
SERVER_SRC="$NATIVE_DIR/server.c"
MONGOOSE_SRC="$NATIVE_DIR/mongoose.c"
ASSETS_HEADER="$NATIVE_DIR/embedded_assets.h"
OUT_DIR="$ROOT_DIR/dist-native"
TARGET="native"
SKIP_VITE=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --target)
      TARGET="${2:-}"
      shift 2
      ;;
    --out)
      OUT_DIR="${2:-}"
      shift 2
      ;;
    --skip-vite)
      SKIP_VITE=1
      shift
      ;;
    -h|--help)
      cat <<EOF
Usage: $0 [options]

Builds VeriHash web assets with Vite, minifies and packs dist/ into
src/native/embedded_assets.h, and compiles src/native/server.c + mongoose.c
into a standalone cross-platform binary.

Options:
  --target <name>   native (default), linux-amd64, linux-arm64,
                    windows-amd64, macos-amd64, macos-arm64, or all
  --out <dir>       Output directory (default: dist-native)
  --skip-vite       Skip Vite build and pack existing dist/
  -h, --help        Show this help message
EOF
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

echo "==> [1/4] Building and minifying web assets with Vite..."
if [ "$SKIP_VITE" -eq 0 ]; then
  (cd "$ROOT_DIR" && npm run build)
else
  echo "Skipping Vite build (--skip-vite); using existing dist/."
fi

echo "==> [2/4] Post-minifying dist/ and generating C-embedded header..."
node "$ROOT_DIR/scripts/pack-c-assets.mjs"

if [ ! -f "$ASSETS_HEADER" ]; then
  echo "Error: Failed to generate $ASSETS_HEADER" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

pick_native_cc() {
  for candidate in "${CC:-}" cc gcc clang; do
    if [ -n "$candidate" ] && command -v "$candidate" >/dev/null 2>&1; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

CFLAGS_COMMON=(-O2 -Wall -Wextra -Wno-unused-parameter -I"$NATIVE_DIR" -DVERIHASH_EMBEDDED_ASSETS=1 -DMG_ENABLE_LOG=1)
CFLAGS_SERVER=(-std=c99 -O2 -Wall -Wextra -I"$NATIVE_DIR" -DVERIHASH_EMBEDDED_ASSETS=1 -DMG_ENABLE_LOG=1)
CFLAGS_MONGOOSE=(-std=gnu99 -O2 -D_DEFAULT_SOURCE -I"$NATIVE_DIR" -DMG_ENABLE_LOG=1)

build_native() {
  CC_BIN="$(pick_native_cc)" || {
    echo "Error: No C compiler found (tried CC, cc, gcc, clang)." >&2
    exit 1
  }
  local uname_s
  uname_s="$(uname -s 2>/dev/null || echo unknown)"
  echo "==> [3/4] Compiling C backend ($CC_BIN, host=$uname_s)..."

  "$CC_BIN" "${CFLAGS_SERVER[@]}" -c "$SERVER_SRC" -o "$OUT_DIR/server.o"
  "$CC_BIN" "${CFLAGS_MONGOOSE[@]}" -c "$MONGOOSE_SRC" -o "$OUT_DIR/mongoose.o"

  case "$uname_s" in
    MINGW*|MSYS*|CYGWIN*)
      local out_bin="$OUT_DIR/verihash.exe"
      "$CC_BIN" -s "$OUT_DIR/server.o" "$OUT_DIR/mongoose.o" -o "$out_bin" -lws2_32
      rm -f "$OUT_DIR/server.o" "$OUT_DIR/mongoose.o"
      echo "==> [4/4] Built standalone binary: $out_bin ($(du -h "$out_bin" | cut -f1))"
      ;;
    Darwin)
      local out_bin="$OUT_DIR/verihash"
      "$CC_BIN" "$OUT_DIR/server.o" "$OUT_DIR/mongoose.o" -o "$out_bin"
      rm -f "$OUT_DIR/server.o" "$OUT_DIR/mongoose.o"
      if command -v strip >/dev/null 2>&1; then
        strip -x "$out_bin" 2>/dev/null || true
      fi
      echo "==> [4/4] Built standalone binary: $out_bin ($(du -h "$out_bin" | cut -f1))"
      ;;
    *)
      local out_bin="$OUT_DIR/verihash"
      "$CC_BIN" -s "$OUT_DIR/server.o" "$OUT_DIR/mongoose.o" -o "$out_bin"
      rm -f "$OUT_DIR/server.o" "$OUT_DIR/mongoose.o"
      echo "==> [4/4] Built standalone binary: $out_bin ($(du -h "$out_bin" | cut -f1))"
      ;;
  esac
}

build_with_zig() {
  local zig_triple="$1"
  local out_bin="$2"
  shift 2
  echo "==> [3/4] Cross-compiling C backend with zig cc ($zig_triple)..."
  zig cc -target "$zig_triple" "${CFLAGS_COMMON[@]}" -s "$SERVER_SRC" "$MONGOOSE_SRC" -o "$out_bin" "$@"
  echo "==> [4/4] Built standalone binary: $out_bin ($(du -h "$out_bin" | cut -f1))"
}

build_target() {
  case "$1" in
    native)
      build_native
      ;;
    linux-amd64)
      command -v zig >/dev/null 2>&1 || { echo "Error: 'zig' is required to cross-compile linux-amd64." >&2; exit 1; }
      build_with_zig "x86_64-linux-musl" "$OUT_DIR/verihash-linux-amd64"
      ;;
    linux-arm64)
      command -v zig >/dev/null 2>&1 || { echo "Error: 'zig' is required to cross-compile linux-arm64." >&2; exit 1; }
      build_with_zig "aarch64-linux-musl" "$OUT_DIR/verihash-linux-arm64"
      ;;
    windows-amd64)
      if command -v zig >/dev/null 2>&1; then
        build_with_zig "x86_64-windows-gnu" "$OUT_DIR/verihash-windows-amd64.exe" -lws2_32
      elif command -v x86_64-w64-mingw32-gcc >/dev/null 2>&1; then
        echo "==> [3/4] Cross-compiling C backend with mingw-w64..."
        x86_64-w64-mingw32-gcc "${CFLAGS_COMMON[@]}" -s "$SERVER_SRC" "$MONGOOSE_SRC" -o "$OUT_DIR/verihash-windows-amd64.exe" -lws2_32
        echo "==> [4/4] Built standalone binary: $OUT_DIR/verihash-windows-amd64.exe"
      else
        echo "Error: Install 'zig' or 'mingw-w64' to cross-compile Windows binaries." >&2
        exit 1
      fi
      ;;
    macos-amd64)
      command -v zig >/dev/null 2>&1 || { echo "Error: 'zig' is required to cross-compile macos-amd64." >&2; exit 1; }
      build_with_zig "x86_64-macos" "$OUT_DIR/verihash-macos-amd64"
      ;;
    macos-arm64)
      command -v zig >/dev/null 2>&1 || { echo "Error: 'zig' is required to cross-compile macos-arm64." >&2; exit 1; }
      build_with_zig "aarch64-macos" "$OUT_DIR/verihash-macos-arm64"
      ;;
    all)
      for t in linux-amd64 linux-arm64 windows-amd64 macos-amd64 macos-arm64; do
        build_target "$t"
      done
      ;;
    *)
      echo "Unknown target: $1" >&2
      exit 1
      ;;
  esac
}

build_target "$TARGET"
