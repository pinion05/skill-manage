#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdtemp, rm, unlink } from "node:fs/promises";
import {
  childOutcome,
  formatOutcome,
  runCaptured,
  terminateProcessTree,
} from "./smoke-cleanup.mjs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const HOST = "127.0.0.1";
const START_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 100;
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const expectedTarball = join(packageRoot, "skill-manage-0.1.0.tgz");

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function chooseFreePort() {
  const server = createServer();
  server.unref();
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen({ host: HOST, port: 0, exclusive: true }, resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Could not determine a free loopback port");
  }
  await new Promise((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose());
  });
  return address.port;
}

function parsePackJson(stdout) {
  for (let index = stdout.lastIndexOf("["); index >= 0; index = stdout.lastIndexOf("[", index - 1)) {
    try {
      const value = JSON.parse(stdout.slice(index).trim());
      if (Array.isArray(value)) return value;
    } catch {
      // Lifecycle output can precede the final npm pack JSON document.
    }
  }
  throw new Error(`Could not find the npm pack JSON document in output:\n${stdout}`);
}

function inspectPack(packJson) {
  if (!Array.isArray(packJson) || packJson.length !== 1) {
    throw new Error("npm pack --json did not describe exactly one package");
  }
  const pack = packJson[0];
  if (pack.name !== "skill-manage" || pack.version !== "0.1.0") {
    throw new Error(`Unexpected packed package: ${pack.name}@${pack.version}`);
  }
  if (pack.filename !== "skill-manage-0.1.0.tgz") {
    throw new Error(`Unexpected tarball filename: ${pack.filename}`);
  }
  if (!Array.isArray(pack.files) || pack.files.length === 0) {
    throw new Error("npm pack --json returned no package files");
  }

  const entries = pack.files.map(({ path }) => `package/${path.replace(/^package\//, "")}`);
  const entrySet = new Set(entries);
  const required = [
    "package/bin/skill-manage.mjs",
    "package/dist/server/entry.mjs",
    "package/README.md",
    "package/LICENSE",
    "package/package.json",
  ];
  for (const path of required) {
    if (!entrySet.has(path)) throw new Error(`Required package entry is missing: ${path}`);
  }
  if (!entries.some((path) => path.startsWith("package/dist/client/") && !path.endsWith("/"))) {
    throw new Error("Required package client assets are missing");
  }

  const forbidden = entries.filter((path) => {
    const lower = path.toLowerCase();
    return lower.startsWith("package/src/")
      || lower.startsWith("package/docs/")
      || lower.startsWith("package/scripts/")
      || /(^|\/)\.env(?:\.|$)/.test(lower)
      || /(^|\/)(__tests__|tests?)(\/|$)/.test(lower)
      || /\.(test|spec)\.[^/]+$/.test(lower);
  });
  if (forbidden.length > 0) {
    throw new Error(`Forbidden package entries found:\n${forbidden.join("\n")}`);
  }
  if (new Set(entries).size !== entries.length) {
    throw new Error("npm pack --json returned duplicate package entries");
  }

  return { pack, entries };
}

async function waitForRoot(url, outcome) {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const remaining = deadline - Date.now();
    const probe = fetch(url, {
      signal: AbortSignal.timeout(Math.max(1, Math.min(1_000, remaining))),
    }).then(async (response) => {
      await response.body?.cancel();
      return response.status === 200;
    }).catch(() => false);
    const result = await Promise.race([
      probe.then((ready) => ({ ready })),
      outcome.then((processResult) => ({ processResult })),
    ]);
    if ("processResult" in result) {
      throw new Error(`Packed CLI exited before readiness (${formatOutcome(result.processResult)})`);
    }
    if (result.ready) return;

    const pause = await Promise.race([
      delay(Math.min(POLL_INTERVAL_MS, Math.max(0, deadline - Date.now()))).then(() => null),
      outcome,
    ]);
    if (pause !== null) {
      throw new Error(`Packed CLI exited before readiness (${formatOutcome(pause)})`);
    }
  }
  throw new Error(`Timed out waiting for packed CLI at ${url}`);
}

async function fetchWithTimeout(url) {
  return fetch(url, { signal: AbortSignal.timeout(5_000) });
}

let tempCwd;
let tarballPath = expectedTarball;
let cli;
let cliOutcome;
let completed = false;

try {
  tempCwd = await mkdtemp(join(tmpdir(), "skill-manage-package-smoke-"));
  await unlink(expectedTarball).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });

  const { stdout } = await runCaptured("npm", ["pack", "--json"], { cwd: packageRoot });
  const { pack, entries } = inspectPack(parsePackJson(stdout));
  tarballPath = resolve(packageRoot, pack.filename);

  const port = await chooseFreePort();
  const url = `http://${HOST}:${port}`;
  const env = { ...process.env, npm_config_update_notifier: "false" };
  delete env.NODE_OPTIONS;
  delete env.NODE_PATH;
  const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
  const tarballSpec = pathToFileURL(tarballPath).href;
  cli = spawn(npxCommand, ["--yes", tarballSpec, "--no-open", "--port", String(port)], {
    cwd: tempCwd,
    env,
    detached: process.platform !== "win32",
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  cliOutcome = childOutcome(cli);
  cli.stdout.pipe(process.stdout);
  cli.stderr.pipe(process.stderr);

  await waitForRoot(url, cliOutcome);
  const rootResponse = await fetchWithTimeout(`${url}/`);
  await rootResponse.body?.cancel();
  if (rootResponse.status !== 200) {
    throw new Error(`Packed root returned HTTP ${rootResponse.status}`);
  }

  const apiResponse = await fetchWithTimeout(`${url}/api/inventory?mode=official`);
  if (apiResponse.status !== 200) {
    await apiResponse.body?.cancel();
    throw new Error(`Packed official inventory API returned HTTP ${apiResponse.status}`);
  }
  const inventory = await apiResponse.json();
  if (inventory.scanMode !== "official") {
    throw new Error(`Packed official inventory API returned scanMode=${inventory.scanMode}`);
  }

  const shutdown = await terminateProcessTree(cli, cliOutcome, { requireGraceful: true });
  cli = undefined;
  completed = true;
  console.log(`Package smoke passed: ${pack.filename}`);
  console.log(`Package contents: ${entries.length} files, ${pack.size} packed bytes, ${pack.unpackedSize} unpacked bytes`);
  console.log(`HTTP evidence: GET / = 200; GET /api/inventory?mode=official = 200, scanMode=official`);
  console.log(`Process cleanup: complete (${formatOutcome(shutdown)})`);
} finally {
  const cleanupErrors = [];
  if (cli) {
    try {
      await terminateProcessTree(cli, cliOutcome, { requireGraceful: false });
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  for (const candidate of new Set([tarballPath, expectedTarball])) {
    try {
      await unlink(candidate);
    } catch (error) {
      if (error.code !== "ENOENT") cleanupErrors.push(error);
    }
  }
  if (tempCwd) {
    try {
      await rm(tempCwd, { recursive: true, force: true });
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, completed
      ? "Package smoke passed but cleanup failed"
      : "Package smoke failed and cleanup also failed");
  }
}
