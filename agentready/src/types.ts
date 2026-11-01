export type Ecosystem = "node" | "python" | "c" | "unknown";

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

export interface PackageJson {
  name?: string;
  description?: string;
  scripts?: Record<string, string>;
}

/** Read-only snapshot of a repository that every check runs against. */
export interface RepoContext {
  /** Absolute path of the repository root. */
  readonly root: string;
  /** Relative POSIX paths of every scanned file (depth-limited, ignores vendored dirs). */
  readonly files: readonly string[];
  /**
   * CI config that lives above `root` in the enclosing git repository (monorepo packages),
   * as paths relative to `root` — e.g. `../.github/workflows/ci.yml`. Only files that
   * mention this package's directory are included.
   */
  readonly workspaceCiFiles: readonly string[];
  readonly ecosystem: Ecosystem;
  readonly packageJson: PackageJson | undefined;
  readonly packageManager: PackageManager;
  /** Returns file contents, or undefined if the file is missing or unreadable. */
  read(relativePath: string): string | undefined;
}

export type Status = "pass" | "warn" | "fail" | "skip";

export interface CheckOutcome {
  status: Status;
  detail: string;
  hint?: string;
}

export interface Check {
  readonly id: string;
  readonly title: string;
  /** Relative importance. Weights of non-skipped checks are normalised to 100. */
  readonly weight: number;
  run(ctx: RepoContext): CheckOutcome;
}

export interface CheckResult extends CheckOutcome {
  id: string;
  title: string;
  weight: number;
}

export interface Report {
  root: string;
  ecosystem: Ecosystem;
  /** 0–100. pass = full weight, warn = half, fail = zero, skip = excluded. */
  score: number;
  results: CheckResult[];
}
