import { defaultChecks } from "./checks/index.js";
import type { Check, CheckResult, RepoContext, Report, Status } from "./types.js";

const CREDIT: Record<Exclude<Status, "skip">, number> = { pass: 1, warn: 0.5, fail: 0 };

export function score(results: readonly CheckResult[]): number {
  let earned = 0;
  let possible = 0;
  for (const r of results) {
    if (r.status === "skip") continue;
    earned += r.weight * CREDIT[r.status];
    possible += r.weight;
  }
  return possible === 0 ? 0 : Math.round((earned / possible) * 100);
}

export function audit(ctx: RepoContext, checks: readonly Check[] = defaultChecks): Report {
  const results = checks.map((check): CheckResult => {
    let outcome;
    try {
      outcome = check.run(ctx);
    } catch (error) {
      // A buggy check must not take down the whole report.
      outcome = { status: "fail" as const, detail: `Check crashed: ${String(error)}` };
    }
    return { id: check.id, title: check.title, weight: check.weight, ...outcome };
  });
  return { root: ctx.root, ecosystem: ctx.ecosystem, score: score(results), results };
}
