# ONE-BUTTON RACING

[![Build](https://github.com/w00ye01/onebutton-racing/actions/workflows/build.yml/badge.svg)](https://github.com/w00ye01/onebutton-racing/actions/workflows/build.yml)
![size](https://img.shields.io/badge/racer.exe-%E2%89%A4%201.44MB-success)
![lang](https://img.shields.io/badge/C99-raylib%205.5-blue)

**버튼 하나로 하는 무한 레이싱 게임.** 1.44MB 게임 개발공모전(2P GAME ARCADE) 출품작입니다.

C 파일 하나에 리소스 파일은 0개입니다. 도로, 차, 소리, 배경 팔레트까지 전부 코드로 절차 생성하고,
Windows 실행파일 하나가 **플로피 디스크 한 장(1,474,560바이트)** 안에 들어가야 합니다.

> 스크린샷/GIF 자리 — `docs/screenshot.gif`를 추가하면 여기에 표시됩니다.

## 게임

| | |
| --- | --- |
| **조작** | `SPACE` 하나. 누르고 있으면 오른쪽, 떼면 왼쪽으로 조향 |
| **목표** | 코스를 벗어나거나 콘 게이트에 부딪히지 않고 최대한 멀리 가기 |
| **점수** | 1m = 1점. 게이트 구멍 가장자리를 스치면 **니어미스 보너스**, 연속이면 **콤보 배수** |
| **난이도** | 450m부터 콘 게이트 등장. 갈수록 간격이 촘촘해지고 구멍이 좁아짐 |
| **연출** | 주행거리에 따라 낮 → 노을 → 밤 → 새벽 팔레트 순환, 스피드 라인·카메라 흔들림·크래시 플래시 |
| **트랙** | 세그먼트 배열을 순환 인덱싱해서 끝없이 이어짐 |

안전하게 가운데로 통과하면 콤보가 끊기기 때문에, 게이트마다 "멀리 가기"와 "붙여서 점수 따기" 중 하나를
골라야 합니다. 원버튼 게임에서 선택지를 만드는 게 설계 목표였습니다.

## 다운로드

[Releases](https://github.com/w00ye01/onebutton-racing/releases)에서 `racer.exe`를 받아 실행하면 됩니다.
설치는 필요 없습니다. 서명이 없는 exe라 SmartScreen 경고가 뜨면 **추가 정보 → 실행**을 누르세요.

최신 커밋으로 빌드한 exe는 [Actions](https://github.com/w00ye01/onebutton-racing/actions) 실행 결과의
`racer-windows` 아티팩트에서도 받을 수 있습니다.

## 1.44MB에 맞춘 방법

raylib를 그대로 정적 링크하면 3D 모듈과 각종 파일 로더까지 같이 들어갑니다. 이 게임은 2D 도형, 기본 폰트,
절차 생성 오디오만 쓰기 때문에, 안 쓰는 부분을 빌드 단계에서 잘라냈습니다.

| 버전 | exe 크기 | 변경 |
| --- | --: | --- |
| v4 | 1,195,520 | 최초 Windows 빌드 |
| v6 | 1,198,080 | 스피드 이펙트, 타격감 |
| v8 | 1,318,912 | 콘 게이트 난이도 시스템 — 한도까지 155KB 남음 |
| v8+ | 1,102,336 | **raylib 미사용 모듈 제거 (−216,576)** |
| v9 | 1,104,896 | 니어미스·콤보, 시간대 팔레트, 무한 트랙 |

<sub>위 수치는 macOS + MinGW GCC 16(UCRT) 기준입니다. CI(Ubuntu MinGW GCC 13)에서는 약 1.17MB로 나오고, 둘 다 한도 안입니다.</sub>

1. **`config.h`에서 모듈 제거**: 3D(`RMODELS`), 이미지·오디오·폰트 파일 로더를 전부 껐습니다.
2. **섹션 단위 링크**: `-ffunction-sections -fdata-sections -Wl,--gc-sections`로 안 쓰는 함수를 링커가 떼어내게 했습니다.
3. **완전 정적 링크**: `-static -static-libgcc -s`로 런타임 DLL 없이 exe 파일 하나로 실행되게 했습니다.

이 과정에서 걸렸던 함정 세 가지:

- **`#define X 0`으로는 안 꺼집니다.** raylib는 `#if defined(X)`로 검사하기 때문에 반드시 주석 처리해야 합니다.
- **`SUPPORT_CLIPBOARD_IMAGE`도 같이 꺼야 합니다.** 이게 켜져 있으면 PNG/JPG 로더가 다시 켜져서 용량이 줄지 않습니다.
- **`-DEXTERNAL_CONFIG_FLAGS`를 넣으면 안 됩니다.** 넣으면 `config.h` 자체를 무시합니다.

자세한 기록은 [docs/BUILD_NOTES.md](docs/BUILD_NOTES.md)에 있습니다.

## 빌드

명령 하나로 raylib 다운로드 → 모듈 제거 → 정적 라이브러리 빌드 → exe 빌드 → 검증까지 끝납니다.

```sh
# macOS
brew install mingw-w64
scripts/build.sh

# Ubuntu
sudo apt install mingw-w64
scripts/build.sh

# Windows (MSYS2 UCRT64 터미널)
pacman -S mingw-w64-ucrt-x86_64-gcc make
scripts/build.sh
```

결과물은 `build/racer.exe`에 생깁니다. 게임 코드만 고쳤을 때는 `scripts/build.sh game`으로 raylib 재빌드 없이 다시 빌드할 수 있습니다.

맥에서 바로 플레이해보려면 (Homebrew raylib 사용):

```sh
brew install raylib
cc src/onebutton_racer.c -o racer -Os -I/opt/homebrew/include -L/opt/homebrew/lib -lraylib \
  -framework Cocoa -framework IOKit -framework OpenGL -framework CoreAudio \
  -framework AudioToolbox -framework CoreFoundation
./racer
```

## 자동 검증 (CI)

[`build.yml`](.github/workflows/build.yml)이 커밋할 때마다 공모전 제출 조건을 자동으로 확인합니다.
하나라도 깨지면 빌드가 실패합니다.

| 검사 | 기준 |
| --- | --- |
| 정적 검사 | `-Wall -Wextra -Werror` 경고 0 |
| 용량 | `racer.exe` ≤ 1,474,560 bytes |
| 서브시스템 | Windows GUI (콘솔창 안 뜸) |
| 의존성 | 시스템 DLL만 참조 (`libgcc_s`, `libwinpthread` 등이 있으면 실패) |

검사를 통과한 exe는 아티팩트로 올라가고, `v*` 태그를 푸시하면 Release에 자동으로 첨부됩니다.

## 구조

```
src/onebutton_racer.c   게임 전체 (C99, 단일 파일)
scripts/build.sh        크로스컴파일 + 용량/의존성 검증 (로컬과 CI가 같은 스크립트 사용)
docs/BUILD_NOTES.md     Windows 빌드와 용량 최적화 기록
docs/DEVLOG.md          개발 과정 전체 기록
```

## 개발 과정

macOS(Apple Silicon)에서만 개발하면서 Windows용 exe를 만들어야 했기 때문에, 처음부터 크로스컴파일 기반으로
작업했습니다. 이 과정은 Claude Code와 함께 진행했고, 요청과 결과는 [docs/DEVLOG.md](docs/DEVLOG.md)에 그대로 남겨뒀습니다.

## 라이선스

게임 코드는 [MIT](LICENSE)입니다. [raylib](https://github.com/raysan5/raylib)는 zlib/libpng 라이선스이며, 빌드할 때 내려받기만 하고 저장소에는 포함하지 않습니다.
