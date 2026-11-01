# AGENTS.md

Instructions for AI coding agents working on **onebutton-racing**.
First drafted with `agentready init`, then reviewed by hand.

## Project

A one-button endless racing game in C99 + raylib 5.5, built for a contest whose hard rule is:
**the Windows executable must be ≤ 1,474,560 bytes (one floppy disk) or the entry is disqualified.**

- Ecosystem: C (single file `src/onebutton_racer.c`)
- Target: Windows x86-64, built by MinGW-w64 cross-compilation from macOS/Linux
- Zero resource files — graphics, audio and track are all generated in code

## Commands

| Purpose | Command |
| --- | --- |
| Full build (fetch raylib, strip modules, build, verify) | `scripts/build.sh` |
| Rebuild the game only | `scripts/build.sh game` |
| Lint (`-Wall -Wextra -Werror`) | `scripts/build.sh lint` |
| Verify an existing `build/racer.exe` | `scripts/build.sh verify` |

## Layout

- `src/` — the whole game (one C file)
- `scripts/build.sh` — the only build entry point; CI runs it unchanged
- `docs/BUILD_NOTES.md` — why each build flag and raylib config change exists
- `docs/DEVLOG.md` — development log
- `.vscode/` — editor IntelliSense config

## Rules

- **Never** add asset files (images, sounds, fonts). Generate them in code.
- **Never** re-enable raylib modules removed in `strip_config` (3D, file loaders, clipboard image).
  Disable options by commenting them out — `#define X 0` does *not* disable them.
- Do not add `-DEXTERNAL_CONFIG_FLAGS`; it makes raylib ignore `config.h`.
- Keep the build fully static: no new DLL dependencies beyond system DLLs.
- Keep `-Wall -Wextra -Werror` clean.
- Gameplay stays one-button: `SPACE` is the only input.
- Note the new `racer.exe` size in the commit message when a change affects it.

## Definition of done

Before finishing, all of these must pass:

```sh
scripts/build.sh lint
scripts/build.sh
```

`scripts/build.sh` fails if the exe exceeds the size limit, is not a GUI-subsystem binary, or imports
a non-system DLL.
