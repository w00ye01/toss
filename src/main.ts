import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { audit } from "./audit.js";
import { createContext } from "./context.js";
import { generateAgentsMd } from "./generate.js";
import { formatReport, formatSummary } from "./report.js";

export interface IO {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  cwd: string;
  color: boolean;
}

export const EXIT = { ok: 0, belowThreshold: 1, usage: 2 } as const;

const HELP = `agentready — is this repository ready for AI coding agents?

Usage
  agentready [check] [paths...]   Audit one or more repositories (default: .)
  agentready init [path]          Draft an AGENTS.md for a repository

Options (check)
  --json              Print machine-readable JSON
  --min-score <n>     Exit with code 1 if any repository scores below n (for CI)
  --no-color          Disable colors (also respects NO_COLOR)

Options (init)
  --stdout            Print the draft instead of writing AGENTS.md
  --force             Overwrite an existing AGENTS.md

  -h, --help          Show this help
  -v, --version       Show version
`;

function version(): string {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
  return pkg.version;
}

export function run(argv: readonly string[], io: IO): number {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        json: { type: "boolean", default: false },
        "min-score": { type: "string" },
        "no-color": { type: "boolean", default: false },
        stdout: { type: "boolean", default: false },
        force: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
        version: { type: "boolean", short: "v", default: false },
      },
    });
  } catch (error) {
    io.stderr(`${error instanceof Error ? error.message : String(error)}\n\n${HELP}`);
    return EXIT.usage;
  }

  const { values, positionals } = parsed;
  if (values.help) {
    io.stdout(HELP);
    return EXIT.ok;
  }
  if (values.version) {
    io.stdout(`${version()}\n`);
    return EXIT.ok;
  }

  const [first, ...rest] = positionals;
  const command = first === "init" || first === "check" ? first : "check";
  const paths = first === "init" || first === "check" ? rest : positionals;
  const style = { color: io.color && !values["no-color"] };

  try {
    if (command === "init") {
      if (paths.length > 1) {
        io.stderr("init takes a single path.\n");
        return EXIT.usage;
      }
      const ctx = createContext(resolve(io.cwd, paths[0] ?? "."));
      const draft = generateAgentsMd(ctx);
      if (values.stdout) {
        io.stdout(draft);
        return EXIT.ok;
      }
      const target = join(ctx.root, "AGENTS.md");
      if (existsSync(target) && !values.force) {
        io.stderr(`${target} already exists. Use --force to overwrite or --stdout to preview.\n`);
        return EXIT.usage;
      }
      writeFileSync(target, draft);
      io.stdout(`Wrote ${target}\nReview it before committing — agents will follow it literally.\n`);
      return EXIT.ok;
    }

    let minScore: number | undefined;
    if (values["min-score"] !== undefined) {
      minScore = Number(values["min-score"]);
      if (!Number.isInteger(minScore) || minScore < 0 || minScore > 100) {
        io.stderr("--min-score must be an integer between 0 and 100.\n");
        return EXIT.usage;
      }
    }

    const targets = paths.length > 0 ? paths : ["."];
    const reports = targets.map((p) => audit(createContext(resolve(io.cwd, p))));

    if (values.json) {
      io.stdout(`${JSON.stringify(reports.length === 1 ? reports[0] : reports, null, 2)}\n`);
    } else {
      for (const r of reports) io.stdout(`${formatReport(r, style, io.cwd)}\n`);
      if (reports.length > 1) io.stdout(formatSummary(reports, style, io.cwd));
    }

    if (minScore !== undefined) {
      const below = reports.filter((r) => r.score < minScore);
      if (below.length > 0) {
        io.stderr(`${below.length} repositor${below.length === 1 ? "y" : "ies"} scored below ${minScore}.\n`);
        return EXIT.belowThreshold;
      }
    }
    return EXIT.ok;
  } catch (error) {
    io.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return EXIT.usage;
  }
}
