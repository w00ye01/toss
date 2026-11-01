import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EXIT, run } from "../src/main.js";
import type { Report } from "../src/types.js";
import { fixture, healthyNodeRepo } from "./helpers.js";

function cli(args: string[], cwd = process.cwd()) {
  let stdout = "";
  let stderr = "";
  const code = run(args, {
    stdout: (t) => (stdout += t),
    stderr: (t) => (stderr += t),
    cwd,
    color: false,
  });
  return { code, stdout, stderr };
}

describe("cli", () => {
  it("prints help and version", () => {
    expect(cli(["--help"]).stdout).toContain("Usage");
    expect(cli(["-v"]).stdout).toMatch(/^\d+\.\d+\.\d+\n$/);
  });

  it("checks the current directory by default", () => {
    const root = healthyNodeRepo();
    const { code, stdout } = cli([], root);
    expect(code).toBe(EXIT.ok);
    expect(stdout).toContain("Score 100/100");
  });

  it("emits JSON", () => {
    const { stdout } = cli(["check", healthyNodeRepo(), "--json"]);
    const report = JSON.parse(stdout) as Report;
    expect(report.score).toBe(100);
    expect(report.results).toHaveLength(10);
  });

  it("prints a summary for several repositories", () => {
    const { stdout } = cli([healthyNodeRepo(), fixture({ "a.txt": "" })]);
    expect(stdout).toContain("Repository");
    expect(stdout).toContain("Average");
  });

  it("fails CI below --min-score", () => {
    const empty = fixture({ "a.txt": "" });
    expect(cli([empty, "--min-score", "50"]).code).toBe(EXIT.belowThreshold);
    expect(cli([healthyNodeRepo(), "--min-score", "90"]).code).toBe(EXIT.ok);
  });

  it("rejects bad input with a usage error", () => {
    expect(cli(["--min-score", "abc"]).code).toBe(EXIT.usage);
    expect(cli(["--nope"]).code).toBe(EXIT.usage);
    expect(cli(["/no/such/dir"]).stderr).toContain("Not a directory");
  });

  it("init writes AGENTS.md and refuses to overwrite without --force", () => {
    const root = fixture({ "package.json": '{"name":"demo","scripts":{"test":"vitest"}}' });
    expect(cli(["init", root]).code).toBe(EXIT.ok);
    expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toContain("npm test");
    expect(cli(["init", root]).code).toBe(EXIT.usage);
    expect(cli(["init", root, "--force"]).code).toBe(EXIT.ok);
  });

  it("init --stdout previews without writing", () => {
    const root = fixture({ "package.json": "{}" });
    const { stdout } = cli(["init", root, "--stdout"]);
    expect(stdout).toContain("# AGENTS.md");
    expect(existsSync(join(root, "AGENTS.md"))).toBe(false);
  });
});
