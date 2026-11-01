# Windows 빌드 기록 (ONE-BUTTON RACING)

macOS(M4 Pro, ARM)에서 MinGW-w64 크로스컴파일로 독립 실행 Windows `.exe`를 생성한 과정.

## 결과물 (v9 기준)
- `racer.exe` — **1,104,896 바이트 (약 1.05MB)**. 제한 1,474,560(1.44MB) 대비 **369,664 바이트 여유**.
- `racer_submission.zip` — 제출용, `racer.exe` 하나만 포함 (346,908 바이트).
- PE32+ / x86-64 / Windows GUI 서브시스템(콘솔창 없음) / 완전 정적 링크.

### 버전별 크기 추이
| 버전 | exe 바이트 | 비고 |
|---|---|---|
| v4 | 1,195,520 | 최초 Windows 빌드 |
| v6 | 1,198,080 | 스피드 이펙트/타격감 |
| v8 | 1,318,912 | 콘 게이트 난이도 |
| v8+ | 1,102,336 | **raylib 미사용 모듈 제거 (−216,576)** |
| v9 | 1,104,896 | 니어미스/콤보 + 시간대 전환 + 무한 트랙 |

## 1. 크로스컴파일러
```bash
brew install mingw-w64
which x86_64-w64-mingw32-gcc   # /opt/homebrew/bin/x86_64-w64-mingw32-gcc (GCC 16.1.0)
```

## 2. raylib 5.5 소스 준비
```bash
cd ~/Desktop/game
curl -L https://github.com/raysan5/raylib/archive/refs/tags/5.5.tar.gz -o raylib.tar.gz
tar xzf raylib.tar.gz
```

## 3. 미사용 모듈 제거 (config.h 편집) — 용량 216KB 절감
게임은 2D 도형 + 기본폰트 + 절차생성 오디오만 사용한다. 파일 로더는 전부 불필요.

`raylib-5.5/src/config.h`에서 아래를 **주석 처리**:
- `SUPPORT_MODULE_RMODELS` (3D 전체)
- 이미지 로더: `SUPPORT_FILEFORMAT_PNG / GIF / QOI / DDS`
- 오디오 로더: `SUPPORT_FILEFORMAT_WAV / OGG / MP3 / QOA / XM / MOD`
- 폰트 로더: `SUPPORT_FILEFORMAT_TTF / FNT`
- `SUPPORT_CLIPBOARD_IMAGE`

> ### 함정 1 — `0`으로 두면 안 된다
> raylib은 `#if defined(SUPPORT_XXX)`로 검사한다. `#define SUPPORT_XXX 0`도 "정의됨 = 켜짐"으로
> 취급되므로 **반드시 주석 처리**해야 실제로 꺼진다. (raylib 자체 관례와 동일)
>
> ### 함정 2 — `SUPPORT_CLIPBOARD_IMAGE`를 같이 꺼야 한다
> 이게 켜져 있으면 하단 블록이 BMP/PNG/JPG와 stb_image를 **도로 켜버린다**.
> 이걸 안 끄면 이미지 로더 제거 효과가 사라진다.
>
> ### 함정 3 — `-DEXTERNAL_CONFIG_FLAGS`를 넣으면 안 된다
> raylib 5.5의 소스는 `#if !defined(EXTERNAL_CONFIG_FLAGS)` → `#include "config.h"` 구조다.
> 즉 config.h는 **기본으로 포함**되며, 이 플래그를 주면 오히려 config.h를 **무시**한다.
> (모든 플래그를 `-D`로 직접 넘길 때만 쓰는 옵션)

유지해야 하는 것(끄면 소리/글자가 사라짐): `SUPPORT_MODULE_RSHAPES`, `RTEXTURES`, `RTEXT`,
`RAUDIO`, `SUPPORT_DEFAULT_FONT`.

## 4. raylib 정적 라이브러리 빌드
함수/데이터 섹션 분리로 링커가 미사용 코드를 떼어내게 함(`-ffunction-sections -fdata-sections`).
```bash
cd ~/Desktop/game/raylib-5.5/src
make clean
make -j4 PLATFORM=PLATFORM_DESKTOP RAYLIB_LIBTYPE=STATIC \
  OS=Windows_NT \
  CC=x86_64-w64-mingw32-gcc \
  AR=x86_64-w64-mingw32-ar \
  CFLAGS="-ffunction-sections -fdata-sections -Os -std=c99 -Wno-missing-braces -D_DEFAULT_SOURCE -DPLATFORM_DESKTOP -D_GLFW_WIN32 -I. -Iexternal/glfw/include -Iexternal/glfw/deps/mingw"
# 결과: raylib-5.5/src/libraylib.a
```
- `rglfw.c`에서 `'_GLFW_WIN32' redefined` 경고 1건은 무해(빌드 시스템도 내부 정의). 수정 불필요.

## 5. 게임 정적 링크
```bash
cd ~/Desktop/game
x86_64-w64-mingw32-gcc onebutton_racer.c -o racer.exe -Os \
  -ffunction-sections -fdata-sections -Wl,--gc-sections \
  -I raylib-5.5/src -L raylib-5.5/src \
  -lraylib -lopengl32 -lgdi32 -lwinmm \
  -static -static-libgcc -mwindows -s
```
- `-lole32` 등 추가 라이브러리는 필요 없었음.
- `-mwindows`: 콘솔창 없이 실행. `-static -static-libgcc`: 런타임 내장. `-s`: 심볼 제거.
- **게임 소스만 고칠 때는 5번만 다시 실행하면 된다** (라이브러리 재빌드 불필요).

## 6. 검증
```bash
stat -f%z racer.exe                                          # 1104896  (< 1474560, OK)
x86_64-w64-mingw32-objdump -f racer.exe | grep "file format" # pei-x86-64
x86_64-w64-mingw32-objdump -p racer.exe | grep -i "^Subsystem"  # 2 (Windows GUI) = 콘솔창 없음
x86_64-w64-mingw32-objdump -p racer.exe | grep "DLL Name"
# GDI32 / KERNEL32 / SHELL32 / USER32 / WINMM  +  api-ms-win-crt-*  (전부 시스템 DLL)
# libgcc_s / libwinpthread / libstdc++ 없음 → 정적 링크 성공
```
- `api-ms-win-crt-*.dll`은 **Universal CRT(UCRT)** 로 Windows 10/11에 기본 내장. 별도 배포 불필요.
- OpenGL은 GLFW가 런타임에 `opengl32.dll`을 동적 로드하므로 임포트 목록에 안 보이지만 정상.
- **실제 Windows 실행 테스트는 미실시** (이 맥에 wine 없음, ARM에서 PE 직접 실행 불가).
  대신 맥 빌드로 스모크 테스트 완료: 창/OpenGL/기본폰트(224 글리프)/오디오 디바이스 정상 초기화,
  `-Wall -Wextra` 경고 0.

## 7. 제출 zip
```bash
cd ~/Desktop/game
rm -f racer_submission.zip
zip -j racer_submission.zip racer.exe
unzip -l racer_submission.zip   # racer.exe 1개만
unzip -t racer_submission.zip   # 무결성
```

## 맥 로컬 테스트 빌드(참고, 그대로 유지)
```bash
cc onebutton_racer.c -o racer -Os -I/opt/homebrew/include -L/opt/homebrew/lib \
  -lraylib -framework Cocoa -framework IOKit -framework OpenGL \
  -framework CoreAudio -framework AudioToolbox -framework CoreFoundation
```
