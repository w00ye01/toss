#!/usr/bin/env node
import { run } from "./main.js";

process.exitCode = run(process.argv.slice(2), {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  cwd: process.cwd(),
  color: process.stdout.isTTY && process.env.NO_COLOR === undefined,
});
