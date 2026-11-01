#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# ONE-BUTTON RACING — Windows racer.exe 빌드 + 공모전 제약 검증
#
# macOS / Linux 에서는 MinGW-w64로 크로스컴파일, Windows(MSYS2 UCRT64)에서는 네이티브 빌드.
# CI도 이 스크립트를 그대로 실행한다.
#
#   scripts/build.sh            # raylib 준비 → libraylib.a → racer.exe → 검증
#   scripts/build.sh game       # 게임만 다시 빌드 (+검증). 평소 개발용
#   scripts/build.sh lint       # -Wall -Wextra -Werror 정적 검사만
#   scripts/build.sh verify     # 이미 있는 build/racer.exe 검증만
# ---------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RAYLIB_VERSION="5.5"
RAYLIB_DIR="$ROOT/third_party/raylib-$RAYLIB_VERSION"
OUT_DIR="$ROOT/build"
EXE="$OUT_DIR/racer.exe"
SIZE_LIMIT=1474560   # 1.44MB 플로피 = 공모전 실격 기준

# --- 툴체인 결정 -----------------------------------------------------------
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*)
    NATIVE_WINDOWS=1; CC=gcc; AR=ar; OBJDUMP=objdump ;;
  *)
    NATIVE_WINDOWS=0
    CC=x86_64-w64-mingw32-gcc; AR=x86_64-w64-mingw32-ar; OBJDUMP=x86_64-w64-mingw32-objdump
    command -v "$CC" >/dev/null || {
      echo "!! $CC 가 없음. macOS: brew install mingw-w64 / Ubuntu: sudo apt install mingw-w64" >&2
      exit 1
    } ;;
esac

file_size() { stat -c%s "$1" 2>/dev/null || stat -f%z "$1"; }

# --- 1) raylib 소스 확보 ---------------------------------------------------
fetch_raylib() {
  [ -d "$RAYLIB_DIR" ] && return
  echo "==> raylib $RAYLIB_VERSION 다운로드"
  mkdir -p "$ROOT/third_party"
  curl -fsSL "https://github.com/raysan5/raylib/archive/refs/tags/$RAYLIB_VERSION.tar.gz" \
    | tar xz -C "$ROOT/third_party"
}

# --- 2) 미사용 모듈 제거 (exe 216KB 절감) ----------------------------------
# 주의: raylib은 #if defined()로 검사하므로 "0"이 아니라 반드시 주석 처리해야 꺼진다.
# SUPPORT_CLIPBOARD_IMAGE를 같이 꺼야 PNG/JPG 로더가 되살아나지 않는다.
strip_config() {
  echo "==> config.h 정리 (3D 모듈·파일 로더 제거)"
  local cfg="$RAYLIB_DIR/src/config.h"
  [ -f "$cfg.orig" ] || cp "$cfg" "$cfg.orig"
  cp "$cfg.orig" "$cfg"
  for f in SUPPORT_MODULE_RMODELS \
           SUPPORT_FILEFORMAT_PNG SUPPORT_FILEFORMAT_GIF SUPPORT_FILEFORMAT_QOI SUPPORT_FILEFORMAT_DDS \
           SUPPORT_FILEFORMAT_WAV SUPPORT_FILEFORMAT_OGG SUPPORT_FILEFORMAT_MP3 \
           SUPPORT_FILEFORMAT_QOA SUPPORT_FILEFORMAT_XM SUPPORT_FILEFORMAT_MOD \
           SUPPORT_FILEFORMAT_TTF SUPPORT_FILEFORMAT_FNT \
           SUPPORT_CLIPBOARD_IMAGE; do
    sed -E "s@^#define[[:space:]]+${f}([[:space:]]|$)@//&@" "$cfg" > "$cfg.tmp" && mv "$cfg.tmp" "$cfg"
    if grep -qE "^#define[[:space:]]+${f}([[:space:]]|$)" "$cfg"; then
      echo "    !! $f 가 꺼지지 않음" >&2; exit 1
    fi
  done
  # 게임이 실제로 쓰는 모듈 — 끄면 소리/글자가 사라진다
  for k in SUPPORT_MODULE_RSHAPES SUPPORT_MODULE_RTEXTURES SUPPORT_MODULE_RTEXT \
           SUPPORT_MODULE_RAUDIO SUPPORT_DEFAULT_FONT; do
    grep -qE "^#define[[:space:]]+${k}([[:space:]]|$)" "$cfg" \
      || { echo "    !! 필수 모듈 $k 가 꺼져 있음" >&2; exit 1; }
  done
}

# --- 3) raylib 정적 라이브러리 ---------------------------------------------
build_raylib() {
  echo "==> libraylib.a 빌드 ($CC)"
  local cross=()
  [ "$NATIVE_WINDOWS" = 1 ] || cross=(OS=Windows_NT "CC=$CC" "AR=$AR")
  ( cd "$RAYLIB_DIR/src"
    make clean >/dev/null 2>&1 || true
    make -j"$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 4)" \
      PLATFORM=PLATFORM_DESKTOP RAYLIB_LIBTYPE=STATIC "${cross[@]}" \
      CFLAGS="-ffunction-sections -fdata-sections -Os -std=c99 -Wno-missing-braces -D_DEFAULT_SOURCE -DPLATFORM_DESKTOP -D_GLFW_WIN32 -I. -Iexternal/glfw/include -Iexternal/glfw/deps/mingw" \
      >/dev/null )
}

# --- 4) 게임 정적 링크 -----------------------------------------------------
build_game() {
  [ -f "$RAYLIB_DIR/src/libraylib.a" ] || { echo "!! libraylib.a 없음. 먼저 scripts/build.sh 실행" >&2; exit 1; }
  echo "==> racer.exe 빌드"
  mkdir -p "$OUT_DIR"
  "$CC" "$ROOT/src/onebutton_racer.c" -o "$EXE" -Os \
    -ffunction-sections -fdata-sections -Wl,--gc-sections \
    -I "$RAYLIB_DIR/src" -L "$RAYLIB_DIR/src" \
    -lraylib -lopengl32 -lgdi32 -lwinmm \
    -static -static-libgcc -mwindows -s
}

# --- 경고 0 유지 ------------------------------------------------------------
lint() {
  fetch_raylib
  echo "==> 정적 검사 (-Wall -Wextra -Werror)"
  "$CC" -fsyntax-only -std=c99 -Wall -Wextra -Werror -I "$RAYLIB_DIR/src" "$ROOT/src/onebutton_racer.c"
  echo "    OK  경고 0"
}

# --- 5) 공모전 제약 검증 ----------------------------------------------------
verify() {
  [ -f "$EXE" ] || { echo "!! $EXE 없음" >&2; exit 1; }
  echo "==> 검증"
  local size; size=$(file_size "$EXE")
  if [ "$size" -gt "$SIZE_LIMIT" ]; then
    echo "    !! 용량 초과: $size > $SIZE_LIMIT" >&2; exit 1
  fi
  echo "    OK  크기 $size bytes (한도 $SIZE_LIMIT, 여유 $((SIZE_LIMIT - size)))"

  local headers; headers=$("$OBJDUMP" -p "$EXE")
  grep -q "^Subsystem[[:space:]]*0*2[[:space:]]" <<<"$headers" \
    || { echo "    !! Windows GUI 서브시스템이 아님 (콘솔창이 뜸)" >&2; exit 1; }
  echo "    OK  GUI 서브시스템 (콘솔창 없음)"

  # 시스템 DLL만 참조해야 '파일 하나로 실행'이 보장된다
  local dlls bad
  dlls=$(grep "DLL Name" <<<"$headers" | awk '{print $3}' | sort -u)
  bad=$(grep -viE '^(kernel32|user32|gdi32|shell32|winmm|opengl32|advapi32|ole32|msvcrt|api-ms-win-crt-.*)\.dll$' <<<"$dlls" || true)
  if [ -n "$bad" ]; then
    echo "    !! 비시스템 DLL 의존: $bad" >&2; exit 1
  fi
  echo "    OK  시스템 DLL만 참조: $(tr '\n' ' ' <<<"$dlls")"

  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    {
      echo "### racer.exe"
      echo "| 항목 | 값 |"
      echo "| --- | --- |"
      echo "| 크기 | $size / $SIZE_LIMIT bytes (여유 $((SIZE_LIMIT - size))) |"
      echo "| 서브시스템 | Windows GUI |"
      echo "| DLL | $(tr '\n' ' ' <<<"$dlls") |"
    } >> "$GITHUB_STEP_SUMMARY"
  fi
}

case "${1:-all}" in
  all)    fetch_raylib; strip_config; build_raylib; build_game; verify ;;
  game)   build_game; verify ;;
  lint)   lint ;;
  verify) verify ;;
  *)      echo "usage: $0 [all|game|lint|verify]" >&2; exit 2 ;;
esac
