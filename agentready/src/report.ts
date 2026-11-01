import { relative } from "node:path";
import type { Report, Status } from "./types.js";

export interface Style {
  color: boolean;
}

const CODES = { red: 31, green: 32, yellow: 33, gray: 90, bold: 1 } as const;

function paint(style: Style, code: keyof typeof CODES, text: string): string {
  return style.color ? `\u001b[${CODES[code]}m${text}\u001b[0m` : text;
}

const ICON: Record<Status, string> = { pass: "✔", warn: "▲", fail: "✖", skip: "–" };
const TONE: Record<Status, keyof typeof CODES> = { pass: "green", warn: "yellow", fail: "red", skip: "gray" };

function bar(score: number, width = 20): string {
  const filled = Math.round((score / 100) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function scoreTone(score: number): keyof typeof CODES {
  if (score >= 80) return "green";
  if (score >= 50) return "yellow";
  return "red";
}

function displayPath(root: string, cwd: string): string {
  const rel = relative(cwd, root);
  // Different drive on Windows → relative() returns an absolute path; show it as is.
  return rel === "" ? "." : rel;
}

export function formatReport(report: Report, style: Style, cwd = process.cwd()): string {
  const titleWidth = Math.max(...report.results.map((r) => r.title.length));
  const lines = [
    `${paint(style, "bold", displayPath(report.root, cwd))} ${paint(style, "gray", `(${report.ecosystem})`)}`,
    "",
  ];
  for (const r of report.results) {
    const icon = paint(style, TONE[r.status], ICON[r.status]);
    const detailTone = r.status === "pass" ? "gray" : TONE[r.status];
    lines.push(`  ${icon} ${r.title.padEnd(titleWidth)}  ${paint(style, detailTone, r.detail)}`);
    if (r.hint && (r.status === "fail" || r.status === "warn")) {
      lines.push(`    ${" ".repeat(titleWidth)}  ${paint(style, "gray", `→ ${r.hint}`)}`);
    }
  }
  const tone = scoreTone(report.score);
  lines.push("", `  Score ${paint(style, tone, `${String(report.score).padStart(3)}/100`)}  ${paint(style, tone, bar(report.score))}`, "");
  return lines.join("\n");
}

export function formatSummary(reports: readonly Report[], style: Style, cwd = process.cwd()): string {
  const names = reports.map((r) => displayPath(r.root, cwd));
  const width = Math.max(10, ...names.map((n) => n.length));
  const lines = [paint(style, "bold", `${"Repository".padEnd(width)}  Score  Failing`)];
  reports.forEach((r, i) => {
    const failing = r.results.filter((c) => c.status === "fail").map((c) => c.id);
    lines.push(
      `${(names[i] ?? "").padEnd(width)}  ${paint(style, scoreTone(r.score), String(r.score).padStart(5))}  ${failing.join(", ") || "-"}`,
    );
  });
  const avg = Math.round(reports.reduce((sum, r) => sum + r.score, 0) / reports.length);
  lines.push(`${"Average".padEnd(width)}  ${paint(style, scoreTone(avg), String(avg).padStart(5))}`, "");
  return lines.join("\n");
}
