import type { PackageManager, RepoContext } from "./types.js";

/** Top-level files only (no directory separator). */
export function topLevel(ctx: RepoContext): string[] {
  return ctx.files.filter((f) => !f.includes("/"));
}

/** First top-level file whose name matches (case-insensitive). */
export function findTopLevel(ctx: RepoContext, pattern: RegExp): string | undefined {
  return topLevel(ctx).find((f) => pattern.test(f));
}

export function hasFile(ctx: RepoContext, rel: string): boolean {
  return ctx.files.includes(rel);
}

export function script(ctx: RepoContext, name: string): string | undefined {
  const value = ctx.packageJson?.scripts?.[name];
  if (value === undefined || value.trim() === "") return undefined;
  // `npm init` writes a placeholder test script that always fails.
  if (name === "test" && /no test specified/.test(value)) return undefined;
  return value;
}

/** The command a human (or agent) types to run a package.json script. */
export function runCommand(pm: PackageManager, name: string): string {
  if (name === "test" || name === "start") return `${pm} ${name}`;
  return pm === "npm" ? `npm run ${name}` : `${pm} ${name}`;
}

export function installCommand(ctx: RepoContext): string {
  switch (ctx.packageManager) {
    case "pnpm":
      return "pnpm install --frozen-lockfile";
    case "yarn":
      return "yarn install --frozen-lockfile";
    case "bun":
      return "bun install";
    case "npm":
      return hasFile(ctx, "package-lock.json") ? "npm ci" : "npm install";
  }
}

export const AGENT_DOC_FILES = [
  "AGENTS.md",
  "CLAUDE.md",
  "GEMINI.md",
  ".github/copilot-instructions.md",
  ".cursorrules",
  "llms.txt",
] as const;

export function agentDocs(ctx: RepoContext): string[] {
  return AGENT_DOC_FILES.filter((f) => hasFile(ctx, f));
}

/** README plus every agent instruction file, concatenated — "the docs an agent will read". */
export function docsText(ctx: RepoContext): string {
  const readme = findTopLevel(ctx, /^readme(\.md|\.rst|\.txt)?$/i);
  return [readme, ...agentDocs(ctx)]
    .filter((f): f is string => f !== undefined)
    .map((f) => ctx.read(f) ?? "")
    .join("\n");
}
