import type { Check, RepoContext } from "../types.js";
import { findTopLevel, hasFile, script } from "../util.js";

const TEST_FILE = /(^|\/)(tests?|__tests__|spec)\/|\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)test_[^/]+\.py$|_test\.(py|go|c)$/;

function testCommand(ctx: RepoContext): string | undefined {
  switch (ctx.ecosystem) {
    case "node":
      return script(ctx, "test");
    case "python": {
      const pyproject = ctx.read("pyproject.toml") ?? "";
      if (pyproject.includes("[tool.pytest") || hasFile(ctx, "pytest.ini") || hasFile(ctx, "tox.ini")) {
        return "pytest";
      }
      return undefined;
    }
    case "c": {
      const makefile = ctx.read("Makefile") ?? "";
      if (/^(test|check)\s*:/m.test(makefile)) return "make test";
      const cmake = ctx.read("CMakeLists.txt") ?? "";
      return /enable_testing|add_test/.test(cmake) ? "ctest" : undefined;
    }
    case "unknown":
      return undefined;
  }
}

export const tests: Check = {
  id: "tests",
  title: "Tests",
  weight: 15,
  run(ctx) {
    const testFiles = ctx.files.filter((f) => TEST_FILE.test(f));
    const command = testCommand(ctx);
    if (testFiles.length > 0 && command !== undefined) {
      return { status: "pass", detail: `${testFiles.length} test file(s), run with \`${command}\`.` };
    }
    if (testFiles.length > 0) {
      return {
        status: "warn",
        detail: `${testFiles.length} test file(s) but no single test command.`,
        hint: "Expose one command (e.g. a `test` script) so agents can verify their changes.",
      };
    }
    if (command !== undefined) {
      return {
        status: "warn",
        detail: `Test command \`${command}\` exists but no test files were found.`,
        hint: "Add tests that cover the core behaviour.",
      };
    }
    return {
      status: "fail",
      detail: "No tests found.",
      hint: "Without tests an agent cannot tell whether its change broke anything.",
    };
  },
};

export const ci: Check = {
  id: "ci",
  title: "Continuous integration",
  weight: 15,
  run(ctx) {
    const workflows = ctx.files.filter(
      (f) =>
        /^\.github\/workflows\/[^/]+\.ya?ml$/.test(f) ||
        f === ".gitlab-ci.yml" ||
        f === ".circleci/config.yml" ||
        f === "azure-pipelines.yml",
    );
    if (workflows.length === 0) {
      return {
        status: "fail",
        detail: "No CI configuration found.",
        hint: "Add .github/workflows/ci.yml that runs lint, typecheck and tests on every PR.",
      };
    }
    const runsTests = workflows.some((f) => /\btest\b|pytest|ctest|vitest|jest/.test(ctx.read(f) ?? ""));
    if (!runsTests) {
      return {
        status: "warn",
        detail: `${workflows.join(", ")} found, but it does not appear to run tests.`,
        hint: "Make CI run the same test command documented for agents.",
      };
    }
    return { status: "pass", detail: `${workflows.join(", ")} runs tests.` };
  },
};

const LINT_CONFIGS: Record<RepoContext["ecosystem"], RegExp> = {
  node: /^(\.?eslint(rc)?(\.config)?\.[cm]?(js|ts|json|ya?ml)|\.eslintrc|biome\.jsonc?|\.oxlintrc\.json|deno\.jsonc?)$/,
  python: /^(ruff\.toml|\.ruff\.toml|\.flake8|\.pylintrc|pylintrc)$/,
  c: /^(\.clang-format|\.clang-tidy)$/,
  unknown: /^\.editorconfig$/,
};

export const lint: Check = {
  id: "lint",
  title: "Linter / formatter",
  weight: 10,
  run(ctx) {
    const config = findTopLevel(ctx, LINT_CONFIGS[ctx.ecosystem]);
    const pyproject = ctx.read("pyproject.toml") ?? "";
    const inPyproject = ctx.ecosystem === "python" && /\[tool\.(ruff|black|pylint|flake8)/.test(pyproject);
    const lintScript = script(ctx, "lint");

    if (config !== undefined || inPyproject || lintScript !== undefined) {
      const where = config ?? (inPyproject ? "pyproject.toml" : "`lint` script");
      return { status: "pass", detail: `Configured via ${where}.` };
    }
    return {
      status: "fail",
      detail: "No linter or formatter configuration found.",
      hint: "A linter gives agents fast, objective feedback on style and common bugs.",
    };
  },
};

export const typecheck: Check = {
  id: "typecheck",
  title: "Static types",
  weight: 10,
  run(ctx) {
    if (ctx.ecosystem === "node") {
      const tsconfig = ctx.read("tsconfig.json");
      if (tsconfig === undefined) {
        return {
          status: "warn",
          detail: "Plain JavaScript project (no tsconfig.json).",
          hint: "TypeScript (or JSDoc + `checkJs`) lets agents catch mistakes before running code.",
        };
      }
      if (/"strict"\s*:\s*true/.test(tsconfig)) {
        return { status: "pass", detail: "tsconfig.json has strict mode on." };
      }
      return {
        status: "warn",
        detail: "tsconfig.json exists but strict mode is off.",
        hint: 'Set "strict": true so type errors are reported instead of silently widened to any.',
      };
    }
    if (ctx.ecosystem === "python") {
      const pyproject = ctx.read("pyproject.toml") ?? "";
      const configured =
        hasFile(ctx, "mypy.ini") || hasFile(ctx, "pyrightconfig.json") || /\[tool\.(mypy|pyright)/.test(pyproject);
      return configured
        ? { status: "pass", detail: "mypy/pyright is configured." }
        : {
            status: "warn",
            detail: "No mypy or pyright configuration.",
            hint: "Add type hints and run mypy or pyright in CI.",
          };
    }
    return { status: "skip", detail: `Not applicable to ${ctx.ecosystem} projects.` };
  },
};
