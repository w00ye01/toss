# w00ye01 / toss

[![agentready](https://github.com/w00ye01/toss/actions/workflows/agentready.yml/badge.svg)](https://github.com/w00ye01/toss/actions/workflows/agentready.yml)
[![onebutton-racing](https://github.com/w00ye01/toss/actions/workflows/onebutton-racing.yml/badge.svg)](https://github.com/w00ye01/toss/actions/workflows/onebutton-racing.yml)

나우열 (호서대학교 컴퓨터공학부) — 토스 Platform Engineer 인턴십 지원용 포트폴리오입니다.

두 프로젝트 모두 **"사람이든 AI 에이전트든, 코드를 바꿨을 때 스스로 검증할 수 있는 개발환경"**에 초점을 맞췄습니다.

| 프로젝트 | 한 줄 소개 | 기술 |
| --- | --- | --- |
| [**agentready**](agentready/) | 저장소가 AI 코딩 에이전트가 일하기 좋은 상태인지 점검하고, 에이전트용 스펙(AGENTS.md)을 만들어 주는 CLI | TypeScript, Node.js, Vitest, GitHub Actions |
| [**onebutton-racing**](onebutton-racing/) | 1.44MB 게임 개발공모전 출품작. 실행파일 하나가 플로피 디스크 한 장 안에 들어가야 하는 원버튼 레이싱 게임 | C99, raylib, MinGW-w64 크로스컴파일 |

## agentready

에이전트는 저장소에 적힌 대로만 움직입니다. 테스트 명령이 문서에 없으면 테스트를 안 돌리고, CI가 없으면 망가진 코드도 통과합니다.
agentready는 이런 빈틈 10가지(README, 에이전트 지침, 문서화된 명령, 테스트, CI, 린트, 타입, lockfile 등)를 점수로 보여주고,
`agentready init`으로 실제 동작하는 명령어가 들어간 AGENTS.md 초안을 만듭니다.

- 런타임 의존성 0, TypeScript strict 최대 설정, 테스트 67개
- 여러 저장소 한 번에 점검, `--json` 출력, `--min-score`로 CI 게이트
- 모노레포 인식: 패키지 안에 CI가 없으면 git 루트의 워크플로 중 그 패키지를 다루는 것만 찾음
- CI: Ubuntu / Windows / macOS × Node 20 / 22

## onebutton-racing

`SPACE` 하나로 조향하는 무한 레이싱 게임입니다. 리소스 파일 없이 전부 코드로 생성합니다.
공모전 실격 기준이 **exe 1,474,560바이트 이하**라서, 용량을 관리하는 게 핵심 과제였습니다.

- 콘 게이트 난이도 시스템을 넣으면서 한도까지 155KB밖에 안 남았는데, raylib의 미사용 모듈(3D, 파일 로더)을 빌드 단계에서 잘라내 **216KB를 줄였습니다**
- Apple Silicon 맥에서 MinGW-w64로 Windows exe를 크로스컴파일
- `scripts/build.sh` 하나로 raylib 준비부터 exe 빌드, 검증까지 끝남. 로컬과 CI가 같은 스크립트를 사용
- CI가 커밋마다 **용량 한도 · GUI 서브시스템 · 시스템 DLL만 참조 · 경고 0**을 확인하고, 하나라도 깨지면 실패

## 두 프로젝트의 연결

agentready의 CI는 이 저장소의 모든 프로젝트를 자기 자신으로 점검합니다
([dogfood job](.github/workflows/agentready.yml)). 이 과정에서 실제로 도구와 게임 둘 다 고쳤습니다.

| | 처음 점수 | 지금 | 바꾼 것 |
| --- | --: | --: | --- |
| agentready | 40 | 100 | README, AGENTS.md, CI, LICENSE 추가 |
| onebutton-racing | 38 | 81 | AGENTS.md(용량 제약 규칙 명시), README 정리 |

게임을 점검하다가 agentready 쪽 문제도 찾았습니다. C 프로젝트의 `-Werror` 빌드를 린트로 인정하지 않았고,
Makefile이 없는 C 프로젝트에도 `make`를 제안했고, 모노레포 루트의 CI를 찾지 못했습니다. 셋 다 고치고 테스트를 추가했습니다.
onebutton-racing에 남은 감점 항목은 **자동화된 게임 로직 테스트**이고, 다음 작업입니다.

## AI와의 협업

두 프로젝트 모두 Claude Code와 함께 개발했고, 그 과정을 숨기지 않고 남겨뒀습니다.
코드 작성은 AI에게 맡기되, **무엇을 만들지 정하고 결과가 맞는지 판단하는 일**은 제가 했습니다.

**onebutton-racing**

| 제가 한 것 | AI(Claude Code)가 한 것 |
| --- | --- |
| 원버튼 조작 방식과 게임 방향 결정 | 결정한 방향대로 구현 |
| 직접 플레이하면서 난이도가 어디서 어긋나는지 찾고 조정 지시 | 지시에 맞춰 수치·로직 수정 |
| 시뮬레이션 결과로 콘 게이트 간격·구멍 크기 확정 | 시뮬레이션 코드 작성, Windows 크로스컴파일, 용량 최적화 |
| 플레이가 단조롭다고 판단해서 시간대별 배경, 콘 게이트 장애물, 니어미스 콤보 추가를 기획 | 추가 기능 구현 |
| 버전마다 실제로 플레이해보고 다음 수정 방향 결정 (v4 → v9) | |

**agentready**

토스 JD를 보고 "에이전트가 일하기 좋은 저장소"라는 주제를 잡았고, 설계와 구현은 Claude Code가 했습니다.
제 게임 저장소를 이 도구로 점검하면서 도구 쪽 버그 3개를 찾아 고쳤습니다([두 프로젝트의 연결](#두-프로젝트의-연결)).
앞으로의 기능 추가는 제가 직접 이슈 → PR → CI 흐름으로 진행할 계획입니다.

**기록**

- AI가 함께 작성한 커밋에는 `Co-Authored-By`가 붙어 있습니다
- onebutton-racing의 요청과 결과, 막혔던 부분은 [docs/DEVLOG.md](onebutton-racing/docs/DEVLOG.md)에 그대로 있습니다
- 각 프로젝트의 `AGENTS.md`는 에이전트가 이 저장소에서 지켜야 할 규칙입니다

## 구조

```
.github/workflows/
├── agentready.yml          # agentready lint·typecheck·test·build + 저장소 전체 셀프 점검
└── onebutton-racing.yml    # racer.exe 크로스빌드 + 공모전 제약 검증 + Release 첨부
agentready/                 # TypeScript CLI
onebutton-racing/           # C 게임
```
