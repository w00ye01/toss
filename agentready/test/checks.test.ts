import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { agentInstructions, commandsDocumented, readme } from "../src/checks/docs.js";
import { gitignore, license, lockfile } from "../src/checks/hygiene.js";
import { ci, lint, tests, typecheck } from "../src/checks/quality.js";
import { createContext } from "../src/context.js";
import type { Check } from "../src/types.js";
import { AGENTS, GOOD_README, fixture } from "./helpers.js";

const statusOf = (check: Check, files: Record<string, string>) => check.run(createContext(fixture(files))).status;

describe("readme", () => {
  it("fails when missing", () => {
    expect(statusOf(readme, {})).toBe("fail");
  });
  it("warns when install or usage is missing", () => {
    expect(statusOf(readme, { "README.md": `# x\n\n## Usage\n${"text ".repeat(80)}` })).toBe("warn");
  });
  it("accepts Korean headings and lowercase file names", () => {
    expect(statusOf(readme, { "readme.md": `# x\n## 설치\n## 사용법\n${"내용 ".repeat(120)}` })).toBe("pass");
  });
  it("treats Build/Run headings as setup/usage", () => {
    expect(statusOf(readme, { "README.md": `# x\n## 빌드\n## 실행\n${"내용 ".repeat(120)}` })).toBe("pass");
  });
  it("passes a complete README", () => {
    expect(statusOf(readme, { "README.md": GOOD_README })).toBe("pass");
  });
});

describe("agent-instructions", () => {
  it("fails without any agent doc", () => {
    expect(statusOf(agentInstructions, {})).toBe("fail");
  });
  it("warns on a stub", () => {
    expect(statusOf(agentInstructions, { "CLAUDE.md": "# todo" })).toBe("warn");
  });
  it("accepts any known agent doc location", () => {
    expect(statusOf(agentInstructions, { ".github/copilot-instructions.md": AGENTS })).toBe("pass");
  });
});

describe("commands-documented", () => {
  const pkg = JSON.stringify({ scripts: { test: "vitest", lint: "eslint ." } });
  it("skips non-Node projects", () => {
    expect(statusOf(commandsDocumented, { "pyproject.toml": "" })).toBe("skip");
  });
  it("fails when no script is mentioned", () => {
    expect(statusOf(commandsDocumented, { "package.json": pkg, "README.md": "nothing" })).toBe("fail");
  });
  it("warns when some scripts are mentioned", () => {
    expect(statusOf(commandsDocumented, { "package.json": pkg, "README.md": "run npm test" })).toBe("warn");
  });
  it("uses the detected package manager", () => {
    const files = { "package.json": pkg, "pnpm-lock.yaml": "", "AGENTS.md": "pnpm test && pnpm lint" };
    expect(statusOf(commandsDocumented, files)).toBe("pass");
  });
});

describe("tests", () => {
  it("ignores the npm init placeholder script", () => {
    const pkg = JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } });
    expect(statusOf(tests, { "package.json": pkg })).toBe("fail");
  });
  it("warns when test files exist but there is no command", () => {
    expect(statusOf(tests, { "package.json": "{}", "src/a.test.ts": "" })).toBe("warn");
  });
  it("passes a pytest project", () => {
    expect(statusOf(tests, { "pyproject.toml": "[tool.pytest.ini_options]", "tests/test_a.py": "" })).toBe("pass");
  });
  it("passes a C project with a make test target", () => {
    expect(statusOf(tests, { Makefile: "all:\n\tcc main.c\ntest:\n\t./run", "tests/sim.c": "" })).toBe("pass");
  });
});

describe("ci", () => {
  it("fails without CI", () => {
    expect(statusOf(ci, {})).toBe("fail");
  });
  it("warns when CI does not run tests", () => {
    expect(statusOf(ci, { ".github/workflows/deploy.yml": "steps:\n  - run: npm run build" })).toBe("warn");
  });
  it("passes when a workflow runs tests", () => {
    expect(statusOf(ci, { ".github/workflows/ci.yaml": "run: pytest -q" })).toBe("pass");
  });

  describe("monorepo package", () => {
    const pkgCi = (workflow: string) => {
      const root = fixture({
        ".git/HEAD": "ref: refs/heads/main",
        ".github/workflows/ci.yml": workflow,
        "packages/cli/package.json": "{}",
      });
      return ci.run(createContext(join(root, "packages/cli")));
    };

    it("finds CI at the git root when it targets this package", () => {
      const outcome = pkgCi("defaults:\n  run:\n    working-directory: packages/cli\nsteps:\n  - run: npm test");
      expect(outcome.status).toBe("pass");
      expect(outcome.detail).toContain("../../.github/workflows/ci.yml");
    });

    it("ignores root CI that only builds a sibling package", () => {
      expect(pkgCi("working-directory: packages/web\nrun: npm test").status).toBe("fail");
    });
  });
});

describe("lint", () => {
  it("detects flat ESLint config", () => {
    expect(statusOf(lint, { "package.json": "{}", "eslint.config.js": "" })).toBe("pass");
  });
  it("detects ruff inside pyproject.toml", () => {
    expect(statusOf(lint, { "pyproject.toml": "[tool.ruff]\nline-length = 100" })).toBe("pass");
  });
  it("fails without configuration", () => {
    expect(statusOf(lint, { "package.json": "{}" })).toBe("fail");
  });
  it("accepts -Werror in a C build script", () => {
    expect(statusOf(lint, { "main.c": "", "scripts/build.sh": "gcc -Wall -Werror main.c" })).toBe("pass");
    expect(statusOf(lint, { "main.c": "", "scripts/build.sh": "gcc -Wall main.c" })).toBe("fail");
  });
});

describe("typecheck", () => {
  it("passes strict TypeScript", () => {
    expect(statusOf(typecheck, { "package.json": "{}", "tsconfig.json": '{"compilerOptions":{"strict": true}}' })).toBe("pass");
  });
  it("warns on non-strict TypeScript", () => {
    expect(statusOf(typecheck, { "package.json": "{}", "tsconfig.json": "{}" })).toBe("warn");
  });
  it("skips C projects", () => {
    expect(statusOf(typecheck, { Makefile: "" })).toBe("skip");
  });
});

describe("hygiene", () => {
  it("lockfile: fails for Node without a lockfile, skips for C", () => {
    expect(statusOf(lockfile, { "package.json": "{}" })).toBe("fail");
    expect(statusOf(lockfile, { Makefile: "" })).toBe("skip");
  });
  it("license and gitignore", () => {
    expect(statusOf(license, { "LICENSE.md": "MIT" })).toBe("pass");
    expect(statusOf(license, {})).toBe("fail");
    expect(statusOf(gitignore, { ".gitignore": "" })).toBe("pass");
  });
});
