# agentready

[![CI](https://github.com/w00ye01/agentready/actions/workflows/ci.yml/badge.svg)](https://github.com/w00ye01/agentready/actions/workflows/ci.yml)
![node](https://img.shields.io/badge/node-%3E%3D20-339933)
![deps](https://img.shields.io/badge/runtime%20deps-0-blue)
![license](https://img.shields.io/badge/license-MIT-lightgrey)

**AI 코딩 에이전트가 이 저장소에서 일하기 좋은 상태인지 점검하고, 에이전트용 스펙(AGENTS.md)을 만들어 주는 CLI.**

Claude Code, Codex, Cursor 같은 에이전트는 사람처럼 눈치로 알아듣지 못합니다. 대신 저장소에 적힌 대로
움직입니다. 그래서 테스트 명령어가 문서에 없으면 테스트를 안 돌리고, CI가 없으면 망가진 코드도 그대로
통과합니다. 린트가 없으면 스타일도 제각각이 됩니다.

`agentready`는 에이전트가 **스스로 자기 작업을 검증할 수 있는 저장소인지** 10가지 기준으로 점수를 매기고,
비어 있는 부분은 바로 채울 수 있도록 `AGENTS.md` 초안을 만들어 줍니다.

```text
$ npx @w00ye01/agentready
. (node)

  ✖ README                  No README found.
                            → Add a README.md with what the project does, how to install it and how to use it.
  ✖ Agent instructions      No AGENTS.md / CLAUDE.md / copilot-instructions.md found.
                            → Run `agentready init` to generate an AGENTS.md spec, then review it.
  ✖ Commands documented     Not mentioned in README/agent docs: `npm run build`, `npm test`, `npm run lint`.
                            → Agents follow docs literally — list the exact commands to verify a change.
  ✔ Tests                   5 test file(s), run with `vitest run`.
  ✖ Continuous integration  No CI configuration found.
                            → Add .github/workflows/ci.yml that runs lint, typecheck and tests on every PR.
  ✔ Linter / formatter      Configured via eslint.config.js.
  ✔ Static types            tsconfig.json has strict mode on.
  ✔ Pinned dependencies     package-lock.json is committed.
  ✖ License                 No LICENSE file.
  ✖ .gitignore              No .gitignore.

  Score  40/100  ████████░░░░░░░░░░░░
```

↑ 이 저장소를 처음 만들었을 때 자기 자신을 점검한 결과입니다. `agentready init`으로 AGENTS.md를 만들고 나머지를
채운 지금은 **100/100**이고, CI가 매 커밋마다 이 점수를 확인합니다([dogfood job](.github/workflows/ci.yml)).

## 설치

Node.js 20 이상이 필요합니다. 런타임 의존성은 없습니다.

```sh
# 설치 없이 바로 실행
npx @w00ye01/agentready

# 또는 전역 설치 (명령어는 agentready)
npm install -g @w00ye01/agentready
```

소스에서 직접 빌드하려면:

```sh
git clone https://github.com/w00ye01/agentready.git
cd agentready
npm ci
npm run build
node dist/cli.js --help
```

## 사용법

### 저장소 점검

```sh
agentready                 # 현재 디렉터리
agentready ../my-app       # 다른 경로
agentready check . --json  # 기계가 읽을 수 있는 JSON 출력
```

### 여러 저장소 한 번에 점검

경로를 여러 개 넘기면 각 리포트 뒤에 요약표가 붙습니다. 팀이나 조직의 저장소들을 한 번에 훑어볼 때 씁니다.

```text
$ agentready api web legacy-batch
...
Repository    Score  Failing
api             100  -
web              70  agent-instructions, ci
legacy-batch     11  readme, agent-instructions, tests, ci, lint, license, gitignore
Average          60
```

### CI 게이트로 쓰기

`--min-score`보다 낮은 저장소가 하나라도 있으면 종료 코드 `1`로 끝납니다.

```yaml
# .github/workflows/agentready.yml
- run: npx @w00ye01/agentready . --min-score 80
```

| 종료 코드 | 의미 |
| --- | --- |
| `0` | 정상 |
| `1` | `--min-score` 미달 |
| `2` | 잘못된 인자, 존재하지 않는 경로 등 |

### AGENTS.md 초안 만들기

```sh
agentready init            # ./AGENTS.md 생성 (이미 있으면 거부)
agentready init --stdout   # 파일을 쓰지 않고 미리보기
agentready init --force    # 덮어쓰기
```

`package.json` 스크립트, lockfile 종류(npm/pnpm/yarn/bun), 디렉터리 구조를 읽어서 **실제로 동작하는 명령어**로
Commands, Layout, Definition of done 섹션을 채웁니다. 추측할 수 없는 부분은 지어내지 않고 `TODO`로 남깁니다.
이 저장소의 [AGENTS.md](AGENTS.md)도 이 명령어로 만든 초안을 다듬은 것입니다.

### 라이브러리로 쓰기

```ts
import { audit, createContext, defaultChecks, type Check } from "@w00ye01/agentready";

const hasChangelog: Check = {
  id: "changelog",
  title: "Changelog",
  weight: 5,
  run: (ctx) =>
    ctx.files.includes("CHANGELOG.md")
      ? { status: "pass", detail: "CHANGELOG.md found." }
      : { status: "fail", detail: "No CHANGELOG.md.", hint: "Keep a changelog." },
};

const report = audit(createContext("."), [...defaultChecks, hasChangelog]);
console.log(report.score);
```

## 점검 항목

| ID | 가중치 | 통과 기준 | 에이전트에게 왜 중요한가 |
| --- | --: | --- | --- |
| `readme` | 15 | README에 설치·사용 섹션이 있음 (한/영 헤딩 모두 인식) | 프로젝트 목적과 사용법을 파악하는 첫 문서 |
| `agent-instructions` | 15 | `AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md` 등 | 규칙과 금지사항을 명시적으로 전달 |
| `commands-documented` | 8 | build/test/lint 스크립트가 문서에 **정확한 명령어**로 적혀 있음 | 에이전트는 문서에 적힌 명령만 실행함 |
| `tests` | 15 | 테스트 파일과 단일 테스트 명령이 둘 다 있음 | 변경이 뭘 망가뜨렸는지 스스로 확인 |
| `ci` | 15 | CI 설정이 있고 테스트를 실행함 | 로컬 검증을 건너뛰어도 마지막에 걸러냄 |
| `lint` | 10 | ESLint/Biome/Ruff/clang-format 등 | 빠르고 객관적인 피드백 |
| `typecheck` | 10 | TS `strict`, mypy/pyright | 실행 전에 실수를 잡음 |
| `lockfile` | 5 | lockfile 커밋 | 에이전트와 CI가 같은 버전으로 설치 |
| `license` | 4 | LICENSE 파일 | 사용 조건 명시 |
| `gitignore` | 3 | `.gitignore` | 빌드 산출물을 읽거나 커밋하지 않게 |

점수는 pass = 가중치 전부, warn = 절반, fail = 0점으로 계산합니다. 해당 생태계에 맞지 않는 항목(예: C 프로젝트의
lockfile)은 `skip` 처리되고 분모에서 빠지기 때문에, 언어가 달라도 점수를 공정하게 비교할 수 있습니다.

지원 생태계: **Node.js / TypeScript**, **Python**, **C / C++** (Makefile, CMake). 나머지는 공통 항목만 점검합니다.

## 설계

```
src/
├── cli.ts        # 실행 진입점. process를 run()에 연결만 함
├── main.ts       # 인자 파싱, 명령 분기. 부수효과는 IO 객체로만
├── context.ts    # 저장소를 한 번 스캔해서 읽기 전용 RepoContext 생성
├── checks/       # 규칙 하나 = Check 객체 하나 (docs / quality / hygiene)
├── audit.ts      # 체크 실행 + 점수 계산
├── generate.ts   # AGENTS.md 생성기
└── report.ts     # 사람이 읽는 출력
```

- **체크는 순수 함수**입니다. 파일 시스템에 직접 접근하지 않고 `RepoContext`만 읽기 때문에, 테스트에서 임시
  fixture 저장소를 만들어 바로 검증할 수 있습니다. 체크 하나가 예외를 던져도 전체 리포트는 깨지지 않고 그 항목만 `fail`로 표시됩니다.
- **스캔은 한 번만** 합니다. `node_modules`, `dist`, `.venv` 같은 디렉터리는 건너뛰고, 깊이와 파일 수에 상한을
  둬서 큰 모노레포에서도 빠르게 끝납니다.
- **CLI는 얇게** 만들었습니다. `run(argv, io)`가 종료 코드를 반환하는 순수한 형태라서, 프로세스를 띄우지 않고도
  종료 코드, 표준출력, 파일 쓰기를 전부 테스트할 수 있습니다.
- **타입을 엄격하게** 씁니다. `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`를 켜고,
  `typescript-eslint`의 `strictTypeChecked` 규칙을 적용합니다.
- **런타임 의존성 0**. 인자 파싱도 `node:util`의 `parseArgs`로 처리합니다.

## 개발

```sh
npm ci
npm test            # Vitest
npm run lint        # ESLint (strictTypeChecked)
npm run typecheck   # tsc --noEmit
npm run build       # dist/ 로 컴파일
```

CI는 Ubuntu, Windows, macOS × Node 20, 22 매트릭스로 lint → typecheck → test → build를 돌리고, 마지막에 빌드한
CLI로 이 저장소 자체를 `--min-score 90` 기준으로 점검합니다.

새 점검 항목을 추가하는 방법은 [AGENTS.md](AGENTS.md#adding-a-check)에 있습니다.

## 라이선스

[MIT](LICENSE)
