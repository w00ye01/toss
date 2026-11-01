import { describe, expect, it } from "vitest";
import { audit, score } from "../src/audit.js";
import { createContext } from "../src/context.js";
import { generateAgentsMd } from "../src/generate.js";
import type { Check, CheckResult } from "../src/types.js";
import { fixture, healthyNodeRepo } from "./helpers.js";

const result = (status: CheckResult["status"], weight: number): CheckResult => ({
  id: "x",
  title: "x",
  detail: "",
  status,
  weight,
});

describe("score", () => {
  it("gives full, half and no credit", () => {
    expect(score([result("pass", 50), result("warn", 50)])).toBe(75);
    expect(score([result("fail", 10), result("pass", 30)])).toBe(75);
  });
  it("excludes skipped checks from the denominator", () => {
    expect(score([result("pass", 10), result("skip", 90)])).toBe(100);
  });
  it("is 0 when everything is skipped", () => {
    expect(score([result("skip", 10)])).toBe(0);
  });
});

describe("audit", () => {
  it("scores a healthy repository 100", () => {
    const report = audit(createContext(healthyNodeRepo()));
    expect(report.results.filter((r) => r.status !== "pass")).toEqual([]);
    expect(report.score).toBe(100);
  });

  it("scores an empty repository low", () => {
    expect(audit(createContext(fixture({ "notes.txt": "" }))).score).toBeLessThan(20);
  });

  it("turns a crashing check into a failure instead of throwing", () => {
    const broken: Check = {
      id: "broken",
      title: "Broken",
      weight: 1,
      run: () => {
        throw new Error("boom");
      },
    };
    const [r] = audit(createContext(fixture({})), [broken]).results;
    expect(r?.status).toBe("fail");
    expect(r?.detail).toContain("boom");
  });
});

describe("generateAgentsMd", () => {
  it("lists real commands and layout for a Node repo", () => {
    const md = generateAgentsMd(createContext(healthyNodeRepo()));
    expect(md).toContain("**demo**");
    expect(md).toContain("| Install | `npm ci` |");
    expect(md).toContain("| Test | `npm test` |");
    expect(md).toContain("| Lint | `npm run lint` |");
    expect(md).toContain("- `src/` — Source code");
    expect(md).toMatch(/```sh\nnpm run build\nnpm test\nnpm run lint\n```/);
  });

  it("leaves TODOs when nothing can be inferred", () => {
    const md = generateAgentsMd(createContext(fixture({ "notes.txt": "" })));
    expect(md).toContain("_TODO: list the commands");
  });

  it("makes an audited repo pass the agent-instructions check", () => {
    const root = fixture({ "package.json": JSON.stringify({ scripts: { test: "vitest" } }) });
    const ctx = createContext(root);
    const withDoc = createContext(fixture({ "package.json": JSON.stringify({ scripts: { test: "vitest" } }), "AGENTS.md": generateAgentsMd(ctx) }));
    const status = (id: string) => audit(withDoc).results.find((r) => r.id === id)?.status;
    expect(status("agent-instructions")).toBe("pass");
    expect(status("commands-documented")).toBe("pass");
  });
});
