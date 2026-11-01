import { basename } from "node:path";
import type { RepoContext } from "./types.js";
import { installCommand, runCommand, script } from "./util.js";

const DIR_PURPOSE: Record<string, string> = {
  src: "Source code",
  lib: "Library source",
  app: "Application code",
  packages: "Workspace packages (monorepo)",
  test: "Tests",
  tests: "Tests",
  __tests__: "Tests",
  docs: "Documentation",
  scripts: "Development / release scripts",
  examples: "Usage examples",
  assets: "Static assets",
  public: "Static files served as-is",
  ".github": "CI workflows and GitHub config",
};

interface CommandRow {
  purpose: string;
  command: string;
}

function commands(ctx: RepoContext): CommandRow[] {
  const rows: CommandRow[] = [];
  switch (ctx.ecosystem) {
    case "node": {
      rows.push({ purpose: "Install", command: installCommand(ctx) });
      const known: [string, string][] = [
        ["build", "Build"],
        ["dev", "Run in dev mode"],
        ["test", "Test"],
        ["lint", "Lint"],
        ["typecheck", "Type-check"],
        ["format", "Format"],
      ];
      for (const [name, purpose] of known) {
        if (script(ctx, name) !== undefined) {
          rows.push({ purpose, command: runCommand(ctx.packageManager, name) });
        }
      }
      break;
    }
    case "python":
      rows.push({
        purpose: "Install",
        command: ctx.files.includes("uv.lock") ? "uv sync" : "pip install -e .",
      });
      rows.push({ purpose: "Test", command: "pytest" });
      break;
    case "c":
      rows.push({ purpose: "Build", command: ctx.files.includes("CMakeLists.txt") ? "cmake -B build && cmake --build build" : "make" });
      break;
    case "unknown":
      break;
  }
  return rows;
}

function layout(ctx: RepoContext): string[] {
  const dirs = new Set<string>();
  for (const f of ctx.files) {
    const slash = f.indexOf("/");
    if (slash > 0) dirs.add(f.slice(0, slash));
  }
  return [...dirs]
    .sort()
    .map((d) => `- \`${d}/\`${DIR_PURPOSE[d] ? ` — ${DIR_PURPOSE[d]}` : ""}`);
}

/** Builds a first-draft AGENTS.md from what can be inferred about the repository. */
export function generateAgentsMd(ctx: RepoContext): string {
  const name = ctx.packageJson?.name ?? basename(ctx.root);
  const description = ctx.packageJson?.description;
  const rows = commands(ctx);
  const verify = rows.filter((r) => ["Test", "Lint", "Type-check", "Build"].includes(r.purpose));
  const dirs = layout(ctx);

  const out: string[] = [
    "# AGENTS.md",
    "",
    "<!-- Drafted by agentready. Review and edit: anything an agent reads here, it will follow. -->",
    "",
    `Instructions for AI coding agents working on **${name}**.`,
    "",
    "## Project",
    "",
  ];
  if (description) out.push(description, "");
  out.push(`- Ecosystem: ${ctx.ecosystem}`);
  if (ctx.ecosystem === "node") out.push(`- Package manager: ${ctx.packageManager}`);
  out.push("");

  out.push("## Commands", "");
  if (rows.length > 0) {
    out.push("| Purpose | Command |", "| --- | --- |");
    for (const r of rows) out.push(`| ${r.purpose} | \`${r.command}\` |`);
  } else {
    out.push("_TODO: list the commands to install, build and test this project._");
  }
  out.push("");

  if (dirs.length > 0) {
    out.push("## Layout", "", ...dirs, "");
  }

  out.push(
    "## Rules",
    "",
    "- Keep changes small and focused on the task; do not reformat unrelated code.",
    "- Follow the existing code style and the linter configuration.",
    "- Add or update tests for every behaviour change.",
    "- Never commit secrets, credentials or generated build output.",
    "- Ask before adding a new dependency.",
    "",
    "## Definition of done",
    "",
  );
  if (verify.length > 0) {
    out.push("Before finishing, all of these must pass:", "", "```sh", ...verify.map((r) => r.command), "```");
  } else {
    out.push("_TODO: list the commands that must pass before a change is complete._");
  }
  out.push("");
  return out.join("\n");
}
