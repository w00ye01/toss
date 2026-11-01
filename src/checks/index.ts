import type { Check } from "../types.js";
import { agentInstructions, commandsDocumented, readme } from "./docs.js";
import { gitignore, license, lockfile } from "./hygiene.js";
import { ci, lint, tests, typecheck } from "./quality.js";

/** Every built-in check, in report order. */
export const defaultChecks: readonly Check[] = [
  readme,
  agentInstructions,
  commandsDocumented,
  tests,
  ci,
  lint,
  typecheck,
  lockfile,
  license,
  gitignore,
];
