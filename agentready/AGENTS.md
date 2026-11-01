# AGENTS.md

Instructions for AI coding agents working on **agentready**.
First drafted with `agentready init`, then reviewed and extended by hand.

## Project

A zero-dependency TypeScript CLI that audits a repository for AI-agent readiness and drafts an
AGENTS.md for it.

- Ecosystem: node (>= 20), ESM only
- Package manager: npm
- Runtime dependencies: **none** — use only `node:` built-ins in `src/`

## Commands

| Purpose | Command |
| --- | --- |
| Install | `npm ci` |
| Build | `npm run build` |
| Test | `npm test` |
| Lint | `npm run lint` |
| Type-check | `npm run typecheck` |

## Layout

- `src/cli.ts` — executable entry point; only wires `process` into `run()`
- `src/main.ts` — argument parsing and commands; side effects go through the `IO` object
- `src/context.ts` — scans a repository once into a read-only `RepoContext`
- `src/checks/` — one exported `Check` per rule, registered in `checks/index.ts`
- `src/audit.ts` — runs checks and computes the score
- `src/generate.ts` — AGENTS.md generator
- `src/report.ts` — human-readable output
- `test/` — Vitest tests; `test/helpers.ts` builds throwaway fixture repos
- `.github/workflows/` — CI

## Adding a check

1. Export a `Check` from the matching file in `src/checks/` (`docs`, `quality` or `hygiene`).
2. Register it in `src/checks/index.ts`. Keep weights summing to 100.
3. A check must be pure: read only through `ctx`, never touch the file system directly, never throw
   on missing files. Return `skip` when the rule does not apply to the ecosystem.
4. Every `fail`/`warn` needs a `hint` that tells the user exactly what to do.
5. Add pass / warn / fail cases to `test/checks.test.ts`, and update the checks table in README.md.

## Rules

- Keep changes small and focused on the task; do not reformat unrelated code.
- `strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` stay on. No `any`, no `!`.
- Add or update tests for every behaviour change.
- Exit codes are public API: `0` ok, `1` below `--min-score`, `2` usage error. Don't change them.
- Never commit secrets, credentials or `dist/`.
- Ask before adding a new dependency.

## Definition of done

Before finishing, all of these must pass:

```sh
npm run build
npm test
npm run lint
npm run typecheck
```
