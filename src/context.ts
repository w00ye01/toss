import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Ecosystem, PackageJson, PackageManager, RepoContext } from "./types.js";

const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
  ".next",
  ".venv",
  "venv",
  "__pycache__",
  "target",
  ".turbo",
  ".cache",
]);

export interface ScanOptions {
  /** How many directory levels below the root to scan. */
  maxDepth?: number;
  /** Hard cap on scanned files, so huge monorepos stay fast. */
  maxFiles?: number;
}

export function scanFiles(root: string, options: ScanOptions = {}): string[] {
  const maxDepth = options.maxDepth ?? 4;
  const maxFiles = options.maxFiles ?? 10_000;
  const files: string[] = [];

  const walk = (dir: string, prefix: string, depth: number): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (files.length >= maxFiles) return;
      const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name) && depth < maxDepth) {
          walk(join(dir, entry.name), rel, depth + 1);
        }
      } else if (entry.isFile()) {
        files.push(rel);
      }
    }
  };

  walk(root, "", 0);
  return files;
}

export function detectEcosystem(files: readonly string[]): Ecosystem {
  const top = new Set(files.filter((f) => !f.includes("/")));
  if (top.has("package.json")) return "node";
  if (["pyproject.toml", "setup.py", "setup.cfg", "requirements.txt"].some((f) => top.has(f))) {
    return "python";
  }
  if (["Makefile", "CMakeLists.txt", "meson.build"].some((f) => top.has(f))) return "c";
  if (files.some((f) => /\.(c|h)$/.test(f))) return "c";
  if (files.some((f) => f.endsWith(".py"))) return "python";
  return "unknown";
}

export function detectPackageManager(files: readonly string[]): PackageManager {
  const top = new Set(files.filter((f) => !f.includes("/")));
  if (top.has("pnpm-lock.yaml")) return "pnpm";
  if (top.has("yarn.lock")) return "yarn";
  if (top.has("bun.lockb") || top.has("bun.lock")) return "bun";
  return "npm";
}

function parsePackageJson(raw: string | undefined): PackageJson | undefined {
  if (raw === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function createContext(path: string, options?: ScanOptions): RepoContext {
  const root = resolve(path);
  if (!statSync(root, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`Not a directory: ${root}`);
  }

  const files = scanFiles(root, options);
  const cache = new Map<string, string | undefined>();
  const read = (rel: string): string | undefined => {
    if (!cache.has(rel)) {
      try {
        cache.set(rel, readFileSync(join(root, rel), "utf8"));
      } catch {
        cache.set(rel, undefined);
      }
    }
    return cache.get(rel);
  };

  return {
    root,
    files,
    ecosystem: detectEcosystem(files),
    packageJson: parsePackageJson(read("package.json")),
    packageManager: detectPackageManager(files),
    read,
  };
}
