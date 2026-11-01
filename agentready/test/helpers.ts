import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach } from "vitest";

const created: string[] = [];

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Creates a throwaway repository from a map of relative path → file contents. */
export function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "agentready-"));
  created.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const path = join(root, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  return root;
}

export const GOOD_README = `# demo

A small demo project used to exercise every check. It has enough prose to look like a real README,
which matters because the README check flags files that are too short to be useful to anyone.
It also explains what the project is for, who should use it and what problem it solves for them.

## Install

\`\`\`sh
npm ci
\`\`\`

## Usage

Run \`npm run build\`, then \`npm test\` and \`npm run lint\`.
`;

export const AGENTS = `# AGENTS.md

Rules for agents. Run npm test and npm run lint before finishing. Keep changes small, follow the
existing style, and never commit secrets. This file is intentionally long enough to count as real.
`;

/** A Node repository that should pass every check. */
export function healthyNodeRepo(): string {
  return fixture({
    "package.json": JSON.stringify({
      name: "demo",
      scripts: { build: "tsc", test: "vitest run", lint: "eslint ." },
    }),
    "package-lock.json": "{}",
    "tsconfig.json": '{ "compilerOptions": { "strict": true } }',
    "eslint.config.js": "export default [];",
    "README.md": GOOD_README,
    "AGENTS.md": AGENTS,
    LICENSE: "MIT",
    ".gitignore": "node_modules\n",
    ".github/workflows/ci.yml": "jobs:\n  test:\n    steps:\n      - run: npm test\n",
    "src/index.ts": "export const x = 1;",
    "test/index.test.ts": "it('works', () => {});",
  });
}
