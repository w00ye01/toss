import type { Check } from "../types.js";
import { findTopLevel, hasFile } from "../util.js";

const LOCKFILES = {
  node: ["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb", "bun.lock"],
  python: ["uv.lock", "poetry.lock", "Pipfile.lock", "pdm.lock", "requirements.txt"],
} as const;

export const lockfile: Check = {
  id: "lockfile",
  title: "Pinned dependencies",
  weight: 5,
  run(ctx) {
    if (ctx.ecosystem !== "node" && ctx.ecosystem !== "python") {
      return { status: "skip", detail: `Not applicable to ${ctx.ecosystem} projects.` };
    }
    const found = LOCKFILES[ctx.ecosystem].find((f) => hasFile(ctx, f));
    return found !== undefined
      ? { status: "pass", detail: `${found} is committed.` }
      : {
          status: "fail",
          detail: "No lockfile committed.",
          hint: "Commit the lockfile so agents and CI install exactly the same versions.",
        };
  },
};

export const license: Check = {
  id: "license",
  title: "License",
  weight: 4,
  run(ctx) {
    const file = findTopLevel(ctx, /^(license|licence|copying)(\.md|\.txt)?$/i);
    return file !== undefined
      ? { status: "pass", detail: `${file} found.` }
      : { status: "fail", detail: "No LICENSE file.", hint: "State how others may use the code." };
  },
};

export const gitignore: Check = {
  id: "gitignore",
  title: ".gitignore",
  weight: 3,
  run(ctx) {
    return hasFile(ctx, ".gitignore")
      ? { status: "pass", detail: ".gitignore found." }
      : {
          status: "fail",
          detail: "No .gitignore.",
          hint: "Ignore build output and dependencies so agents don't read or commit them.",
        };
  },
};
