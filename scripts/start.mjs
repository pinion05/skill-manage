#!/usr/bin/env node
// Cross-platform `npm start` for the local Skill Atlas production build.
// Replaces the old Unix-only `HOST=127.0.0.1 node ./dist/server/entry.mjs`,
// which fails on Windows cmd/PowerShell.
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const entry = join(here, "..", "dist", "server", "entry.mjs");

const child = spawn(process.execPath, [entry], {
  env: { ...process.env, HOST: process.env.HOST ?? "127.0.0.1" },
  stdio: "inherit",
});
child.once("error", (error) => {
  console.error(`Failed to start Skill Atlas: ${error.message}`);
  process.exitCode = 1;
});
child.once("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 0;
});
