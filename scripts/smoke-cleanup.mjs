import { spawn } from "node:child_process";

const DEFAULT_STOP_TIMEOUT_MS = 5_000;
const DEFAULT_POLL_INTERVAL_MS = 50;

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

export function childOutcome(child) {
  return new Promise((resolveOutcome) => {
    child.once("error", (error) => resolveOutcome({ error }));
    child.once("exit", (code, signal) => resolveOutcome({ code, signal }));
  });
}

export function formatOutcome(outcome) {
  if (outcome.error) return outcome.error.message;
  if (outcome.signal) return `signal ${outcome.signal}`;
  return `exit code ${outcome.code}`;
}

export async function runCaptured(command, args, options = {}) {
  const {
    timeoutMs,
    spawnProcess = spawn,
    ...spawnOptions
  } = options;
  const child = spawnProcess(command, args, {
    ...spawnOptions,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });

  let timeout;
  const timedOut = Symbol("timed out");
  const result = await Promise.race([
    childOutcome(child),
    ...(timeoutMs === undefined ? [] : [new Promise((resolveTimeout) => {
      timeout = setTimeout(() => resolveTimeout(timedOut), timeoutMs);
    })]),
  ]).finally(() => clearTimeout(timeout));

  if (result === timedOut) {
    child.kill("SIGKILL");
    throw new Error(`${command} timed out after ${timeoutMs}ms`);
  }
  if (result.error || result.code !== 0) {
    throw new Error([
      `${command} ${args.join(" ")} failed (${formatOutcome(result)})`,
      stdout.trim(),
      stderr.trim(),
    ].filter(Boolean).join("\n"));
  }
  return { stdout, stderr };
}

function processGroupExists(pid, killProcess) {
  try {
    killProcess(-pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    throw error;
  }
}

async function waitForCondition(condition, timeoutMs, pollIntervalMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!condition()) return true;
    await delay(Math.min(pollIntervalMs, Math.max(0, deadline - Date.now())));
  }
  return !condition();
}

async function waitForOutcome(outcome, timeoutMs) {
  const timedOut = Symbol("timed out");
  let timeout;
  const result = await Promise.race([
    outcome,
    new Promise((resolveTimeout) => {
      timeout = setTimeout(() => resolveTimeout(timedOut), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timeout));
  return result === timedOut ? null : result;
}

function assertGraceful(result, requireGraceful, platform) {
  if (!requireGraceful) return;
  const expected = !result.error
    && (result.signal === "SIGINT"
      || result.signal === "SIGTERM"
      || result.code === 0
      || result.code === 130
      // taskkill /f uses the expected TerminateProcess status 1.
      || (platform === "win32" && result.code === 1));
  if (!expected) {
    throw new Error(`Packed CLI did not exit cleanly (${formatOutcome(result)})`);
  }
}

export async function terminateProcessTree(child, outcome, options) {
  const {
    requireGraceful,
    platform = process.platform,
    stopTimeoutMs = DEFAULT_STOP_TIMEOUT_MS,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    killProcess = process.kill.bind(process),
    spawnProcess = spawn,
  } = options;

  if (!child || child.pid === undefined) return outcome;

  if (platform === "win32") {
    if (child.exitCode === null && child.signalCode === null) {
      await runCaptured("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        windowsHide: true,
        timeoutMs: stopTimeoutMs,
        spawnProcess,
      });
    }
    const result = await waitForOutcome(outcome, stopTimeoutMs);
    if (result === null) throw new Error("Timed out waiting for the Windows process tree to stop");
    assertGraceful(result, requireGraceful, platform);
    return result;
  }

  if (processGroupExists(child.pid, killProcess)) {
    try {
      killProcess(-child.pid, "SIGINT");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }

  const result = await waitForOutcome(outcome, stopTimeoutMs);
  const groupStopped = await waitForCondition(
    () => processGroupExists(child.pid, killProcess),
    result === null ? 0 : stopTimeoutMs,
    pollIntervalMs,
  );
  if (result !== null && groupStopped) {
    assertGraceful(result, requireGraceful, platform);
    return result;
  }

  try {
    killProcess(-child.pid, "SIGKILL");
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
  await waitForOutcome(outcome, stopTimeoutMs);
  await waitForCondition(
    () => processGroupExists(child.pid, killProcess),
    stopTimeoutMs,
    pollIntervalMs,
  );
  throw new Error("Packed CLI process group required forced termination");
}
