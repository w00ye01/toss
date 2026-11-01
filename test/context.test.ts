import { describe, expect, it } from "vitest";
import { createContext, detectEcosystem, detectPackageManager, scanFiles } from "../src/context.js";
import { fixture } from "./helpers.js";

describe("scanFiles", () => {
  it("lists files as sorted relative POSIX paths", () => {
    const root = fixture({ "b.txt": "", "a/c.txt": "", "a/b/d.txt": "" });
    expect(scanFiles(root)).toEqual(["a/b/d.txt", "a/c.txt", "b.txt"]);
  });

  it("skips vendored and generated directories", () => {
    const root = fixture({ "node_modules/x/index.js": "", "dist/out.js": "", ".git/HEAD": "", "src/a.ts": "" });
    expect(scanFiles(root)).toEqual(["src/a.ts"]);
  });

  it("respects maxDepth and maxFiles", () => {
    const root = fixture({ "a/b/c/deep.txt": "", "top.txt": "", "x.txt": "" });
    expect(scanFiles(root, { maxDepth: 1 })).toEqual(["top.txt", "x.txt"]);
    expect(scanFiles(root, { maxFiles: 1 })).toHaveLength(1);
  });
});

describe("detectEcosystem", () => {
  it.each([
    [["package.json"], "node"],
    [["pyproject.toml"], "python"],
    [["requirements.txt"], "python"],
    [["Makefile", "main.c"], "c"],
    [["src/game.c"], "c"],
    [["scripts/run.py"], "python"],
    [["notes.txt"], "unknown"],
  ] as const)("%j → %s", (files, expected) => {
    expect(detectEcosystem(files)).toBe(expected);
  });

  it("prefers package.json when several manifests exist", () => {
    expect(detectEcosystem(["pyproject.toml", "package.json"])).toBe("node");
  });
});

describe("detectPackageManager", () => {
  it.each([
    [["pnpm-lock.yaml"], "pnpm"],
    [["yarn.lock"], "yarn"],
    [["bun.lock"], "bun"],
    [["package-lock.json"], "npm"],
    [[], "npm"],
  ] as const)("%j → %s", (files, expected) => {
    expect(detectPackageManager(files)).toBe(expected);
  });
});

describe("createContext", () => {
  it("parses package.json and reads files lazily", () => {
    const root = fixture({ "package.json": '{"name":"demo"}', "README.md": "hi" });
    const ctx = createContext(root);
    expect(ctx.packageJson?.name).toBe("demo");
    expect(ctx.read("README.md")).toBe("hi");
    expect(ctx.read("missing.md")).toBeUndefined();
  });

  it("tolerates a malformed package.json", () => {
    const ctx = createContext(fixture({ "package.json": "{ not json" }));
    expect(ctx.ecosystem).toBe("node");
    expect(ctx.packageJson).toBeUndefined();
  });

  it("throws on a path that is not a directory", () => {
    expect(() => createContext("/definitely/not/here")).toThrow(/Not a directory/);
  });
});
