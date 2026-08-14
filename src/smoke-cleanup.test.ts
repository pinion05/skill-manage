import { spawn, type ChildProcess } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  terminateProcessTree,
  type SpawnProcess,
} from "../scripts/smoke-cleanup.mjs";

function processGroupExists(pid: number) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ESRCH") return false;
    if (code === "EPERM") return true;
    throw error;
  }
}

async function waitUntil(condition: () => boolean, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error("condition deadline exceeded");
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

async function deadline<T>(promise: Promise<T>, timeoutMs = 1_000) {
  let timer: NodeJS.Timeout | undefined;
  const expired = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("test deadline exceeded")), timeoutMs);
  });
  return await Promise.race([promise, expired]).finally(() => clearTimeout(timer));
}

describe("smoke process cleanup", () => {
  it.skipIf(process.platform === "win32")(
    "cleans an exited leader's POSIX process group and rejects its non-graceful outcome",
    async () => {
      const leader = spawn(process.execPath, [
        "--input-type=module",
        "--eval",
        [
          'import { spawn } from "node:child_process";',
          "const descendant = spawn(process.execPath, [\"--input-type=module\", \"--eval\", \"process.on('SIGINT', () => process.exit(0)); process.send('ready'); setInterval(() => {}, 1000)\"], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });",
          "descendant.once('message', () => { descendant.disconnect(); process.exit(7); });",
        ].join("\n"),
      ], {
        detached: true,
        stdio: "ignore",
      });
      const outcome = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
        leader.once("exit", (code, signal) => resolve({ code, signal }));
      });

      try {
        await waitUntil(() => leader.exitCode !== null, 1_000);
        expect(processGroupExists(leader.pid!)).toBe(true);

        await expect(deadline(terminateProcessTree(leader, outcome, {
          platform: "linux",
          requireGraceful: true,
          stopTimeoutMs: 500,
          pollIntervalMs: 5,
        }))).rejects.toThrow("did not exit cleanly (exit code 7)");
        expect(processGroupExists(leader.pid!)).toBe(false);
      } finally {
        try {
          process.kill(-leader.pid!, "SIGKILL");
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
        }
      }
    },
  );

  it("bounds a hanging Windows taskkill command", async () => {
    const commands: ChildProcess[] = [];
    const spawnProcess: SpawnProcess = (_command, _args, options) => {
      const command = spawn(process.execPath, ["--input-type=module", "--eval", "setInterval(() => {}, 1000)"], options);
      commands.push(command);
      return command;
    };
    const child = { pid: 12345, exitCode: null, signalCode: null };
    const outcome = new Promise<never>(() => {});

    await expect(deadline(terminateProcessTree(child, outcome, {
      platform: "win32",
      requireGraceful: true,
      stopTimeoutMs: 20,
      spawnProcess,
    }))).rejects.toThrow("taskkill timed out after 20ms");
    expect(commands).toHaveLength(1);
    await waitUntil(() => commands[0].exitCode !== null || commands[0].signalCode !== null, 1_000);
  });

  it("rejects a non-success Windows child outcome when graceful cleanup is required", async () => {
    // The real process exits immediately, but on Windows spawning taskkill
    // (even a no-op) can exceed a 100ms budget. Use a fake spawnProcess that
    // exits instantly so the test exercises the outcome check, not process
    // spawn timing.
    const spawnProcess: SpawnProcess = () => (
      spawn(process.execPath, ["--input-type=module", "--eval", "process.exit(0)"], { stdio: "ignore" })
    );
    const child = { pid: 12345, exitCode: null, signalCode: null };
    const outcome = Promise.resolve({ code: 9, signal: null });

    await expect(deadline(terminateProcessTree(child, outcome, {
      platform: "win32",
      requireGraceful: true,
      stopTimeoutMs: 5_000,
      spawnProcess,
    }))).rejects.toThrow("did not exit cleanly (exit code 9)");
  });
});
