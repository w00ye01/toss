import type { Check } from "../types.js";
import { agentDocs, docsText, findTopLevel, runCommand, script } from "../util.js";

const SETUP_HEADING = /^#{1,3}\s*.*(install|setup|build|getting started|quick ?start|설치|빌드|시작)/im;
const USAGE_HEADING = /^#{1,3}\s*.*(usage|example|how to|run|play|사용|예시|실행|플레이)/im;

export const readme: Check = {
  id: "readme",
  title: "README",
  weight: 15,
  run(ctx) {
    const file = findTopLevel(ctx, /^readme(\.md|\.rst|\.txt)?$/i);
    if (file === undefined) {
      return {
        status: "fail",
        detail: "No README found.",
        hint: "Add a README.md with what the project does, how to install it and how to use it.",
      };
    }
    const text = ctx.read(file) ?? "";
    const missing = [
      SETUP_HEADING.test(text) ? undefined : "install/setup",
      USAGE_HEADING.test(text) ? undefined : "usage",
    ].filter((s): s is string => s !== undefined);

    if (missing.length === 0 && text.length >= 300) {
      return { status: "pass", detail: `${file} covers install and usage.` };
    }
    return {
      status: "warn",
      detail:
        missing.length > 0
          ? `${file} has no ${missing.join(" or ")} section.`
          : `${file} is very short (${text.length} chars).`,
      hint: "Add '## Install' and '## Usage' sections with copy-pasteable commands.",
    };
  },
};

export const agentInstructions: Check = {
  id: "agent-instructions",
  title: "Agent instructions",
  weight: 15,
  run(ctx) {
    const found = agentDocs(ctx);
    if (found.length === 0) {
      return {
        status: "fail",
        detail: "No AGENTS.md / CLAUDE.md / copilot-instructions.md found.",
        hint: "Run `agentready init` to generate an AGENTS.md spec, then review it.",
      };
    }
    const thin = found.every((f) => (ctx.read(f) ?? "").trim().length < 200);
    if (thin) {
      return {
        status: "warn",
        detail: `${found.join(", ")} exists but is nearly empty.`,
        hint: "Describe commands, layout and rules an agent must follow.",
      };
    }
    return { status: "pass", detail: `Found ${found.join(", ")}.` };
  },
};

export const commandsDocumented: Check = {
  id: "commands-documented",
  title: "Commands documented",
  weight: 8,
  run(ctx) {
    if (ctx.ecosystem !== "node") {
      return { status: "skip", detail: "Only checked for Node projects." };
    }
    const names = ["build", "test", "lint", "typecheck"].filter((n) => script(ctx, n) !== undefined);
    if (names.length === 0) {
      return { status: "skip", detail: "No build/test/lint scripts to document." };
    }
    const docs = docsText(ctx);
    const undocumented = names.filter((n) => {
      const cmd = runCommand(ctx.packageManager, n);
      return !docs.includes(cmd) && !docs.includes(`run ${n}`);
    });
    if (undocumented.length === 0) {
      return { status: "pass", detail: `Docs mention ${names.join(", ")}.` };
    }
    const cmds = undocumented.map((n) => `\`${runCommand(ctx.packageManager, n)}\``).join(", ");
    return {
      status: undocumented.length === names.length ? "fail" : "warn",
      detail: `Not mentioned in README/agent docs: ${cmds}.`,
      hint: "Agents follow docs literally — list the exact commands to verify a change.",
    };
  },
};
