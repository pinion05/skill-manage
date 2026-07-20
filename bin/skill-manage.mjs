#!/usr/bin/env node

import { spawn } from "node:child_process";
import { access, readFile, realpath } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HOST = "127.0.0.1";
const FIRST_PORT = 4321;
const LAST_PORT = 4420;
const READINESS_TIMEOUT_MS = 20_000;
const FORCE_KILL_TIMEOUT_MS = 3_000;
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

const helpText = `Usage: npx skill-manage [options]

Start Skill Atlas on this machine.

Options:
  --port <number>  Use an explicit localhost port (1-65535)
  --no-open        Do not open the browser automatically
  -h, --help       Show this help
  -v, --version    Show the version`;

class CliUsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "CliUsageError";
    this.exitCode = 2;
  }
}

function parsePort(value) {
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) {
    throw new CliUsageError("Port must be an integer from 1 to 65535");
  }
  return Number(value);
}

export function parseArgs(args = process.argv.slice(2)) {
  const options = { port: undefined, open: true, help: false, version: false };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "-h" || argument === "--help") {
      options.help = true;
    } else if (argument === "-v" || argument === "--version") {
      options.version = true;
    } else if (argument === "--no-open") {
      options.open = false;
    } else if (argument === "--port") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("-")) {
        throw new CliUsageError("--port requires a value");
      }
      options.port = parsePort(value);
      index += 1;
    } else if (argument.startsWith("--port=")) {
      const value = argument.slice("--port=".length);
      if (value === "") {
        throw new CliUsageError("--port requires a value");
      }
      options.port = parsePort(value);
    } else if (argument.startsWith("-")) {
      throw new CliUsageError(`Unknown option: ${argument}`);
    } else {
      throw new CliUsageError(`Unexpected argument: ${argument}`);
    }
  }

  return options;
}

function isPortAvailable(port) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", (error) => {
      if (error.code === "EADDRINUSE" || error.code === "EACCES") {
        resolve(false);
      } else {
        reject(error);
      }
    });
    server.listen({ host: HOST, port, exclusive: true }, () => {
      server.close((error) => (error ? reject(error) : resolve(true)));
    });
  });
}

export async function findAvailablePort(start = FIRST_PORT, end = LAST_PORT) {
  for (let port = start; port <= end; port += 1) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found from ${start} to ${end}.`);
}

function childOutcome(child) {
  return new Promise((resolve) => {
    child.once("error", (error) => resolve({ error }));
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitUntilReady(url, outcome) {
  const deadline = Date.now() + READINESS_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const remaining = deadline - Date.now();
    const probe = fetch(url, {
      signal: AbortSignal.timeout(Math.max(1, Math.min(1_000, remaining))),
    })
      .then(() => ({ ready: true }))
      .catch(() => ({ ready: false }));
    const result = await Promise.race([
      probe,
      outcome.then((child) => ({ child })),
    ]);

    if ("child" in result) {
      return { child: result.child };
    }
    if (result.ready) {
      return { ready: true };
    }

    const pause = await Promise.race([
      delay(Math.min(100, Math.max(0, deadline - Date.now()))).then(() => null),
      outcome,
    ]);
    if (pause !== null) {
      return { child: pause };
    }
  }
  return { timeout: true };
}

export function browserCommand(url, platform = process.platform) {
  if (platform === "darwin") {
    return ["open", [url]];
  }
  if (platform === "win32") {
    return ["cmd.exe", ["/d", "/s", "/c", "start", "", url]];
  }
  return ["xdg-open", [url]];
}

function openBrowser(url) {
  const [command, args] = browserCommand(url);
  const browser = spawn(command, args, { stdio: "ignore", shell: false });
  let reported = false;
  const reportFailure = () => {
    if (!reported) {
      reported = true;
      console.error(`Open this URL manually: ${url}`);
    }
  };
  browser.once("error", reportFailure);
  browser.once("exit", (code) => {
    if (code !== 0) reportFailure();
  });
  browser.unref();
}

function exitCodeFor(outcome) {
  if (outcome.error) {
    console.error(`Failed to start Skill Atlas: ${outcome.error.message}`);
    return 1;
  }
  if (outcome.code !== null) {
    return outcome.code;
  }
  return outcome.signal === "SIGINT" ? 130 : 143;
}

async function stopChild(child, outcome, signal = "SIGTERM") {
  if (child.exitCode !== null || child.signalCode !== null) return outcome;
  child.kill(signal);
  const result = await Promise.race([outcome, delay(FORCE_KILL_TIMEOUT_MS)]);
  if (result === undefined) {
    child.kill("SIGKILL");
    return outcome;
  }
  return result;
}

export async function main(args = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(args);
  } catch (error) {
    if (error instanceof CliUsageError) {
      console.error(error.message);
      return error.exitCode;
    }
    throw error;
  }

  if (options.help) {
    console.log(helpText);
    return 0;
  }

  if (options.version) {
    const packageJson = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
    console.log(packageJson.version);
    return 0;
  }

  let port;
  if (options.port !== undefined) {
    if (!(await isPortAvailable(options.port))) {
      console.error(`Port ${options.port} is already in use.`);
      return 2;
    }
    port = options.port;
  } else {
    try {
      port = await findAvailablePort();
    } catch (error) {
      console.error(error.message);
      return 1;
    }
  }

  const serverEntry = join(packageRoot, "dist/server/entry.mjs");
  try {
    await access(serverEntry);
  } catch {
    console.error("Skill Atlas production build is missing (dist/server/entry.mjs).");
    return 1;
  }

  const child = spawn(process.execPath, [serverEntry], {
    cwd: packageRoot,
    env: { ...process.env, HOST, PORT: String(port) },
    stdio: "inherit",
    shell: false,
  });
  const outcome = childOutcome(child);
  let shutdownSignal;
  let forceKillTimer;

  const forwardSignal = (signal) => {
    if (shutdownSignal) return;
    shutdownSignal = signal;
    child.kill(signal);
    forceKillTimer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }, FORCE_KILL_TIMEOUT_MS);
  };
  const onSigint = () => forwardSignal("SIGINT");
  const onSigterm = () => forwardSignal("SIGTERM");
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);

  try {
    const url = `http://${HOST}:${port}`;
    const readiness = await waitUntilReady(url, outcome);
    if (readiness.child) {
      return exitCodeFor(readiness.child);
    }
    if (readiness.timeout) {
      console.error(`Timed out waiting for Skill Atlas at ${url}.`);
      const stopped = await stopChild(child, outcome);
      return shutdownSignal ? exitCodeFor(stopped) : 1;
    }

    console.log(`Skill Atlas is running at ${url}`);
    console.log("Press Ctrl+C to stop.");
    if (options.open) openBrowser(url);

    return exitCodeFor(await outcome);
  } finally {
    if (forceKillTimer) clearTimeout(forceKillTimer);
    process.removeListener("SIGINT", onSigint);
    process.removeListener("SIGTERM", onSigterm);
  }
}

async function isExecutableEntry() {
  if (!process.argv[1]) return false;
  try {
    const [modulePath, executablePath] = await Promise.all([
      realpath(fileURLToPath(import.meta.url)),
      realpath(process.argv[1]),
    ]);
    return modulePath === executablePath;
  } catch {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  }
}

if (await isExecutableEntry()) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    },
  );
}
