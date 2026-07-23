import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
import { readFileSync } from "node:fs";
import type { Readable } from "node:stream";
import { describe, expect, it } from "vitest";

const PACKAGE_VERSION = (JSON.parse(readFileSync(resolve("package.json"), "utf8")) as { version: string }).version;

type CliChild = ChildProcess & { stdout: Readable; stderr: Readable };

function runCli(args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) {
  return spawnSync(process.execPath, ["bin/skill-manage.mjs", ...args], {
    cwd: options.cwd ?? process.cwd(),
    env: options.env,
    encoding: "utf8",
  });
}

async function chooseFreePort() {
  const server = createServer();
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Expected a TCP server address");
  }
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => (error ? rejectClose(error) : resolveClose()));
  });
  return address.port;
}

async function createFakePackage(serverSource?: string) {
  const directory = await mkdtemp(join(tmpdir(), "skill-manage-cli-"));
  await mkdir(join(directory, "bin"), { recursive: true });
  await copyFile(resolve("bin/skill-manage.mjs"), join(directory, "bin/skill-manage.mjs"));
  await writeFile(join(directory, "package.json"), JSON.stringify({
    name: "skill-manage-test",
    version: "0.1.0",
    type: "module",
  }));
  if (serverSource !== undefined) {
    await mkdir(join(directory, "dist/server"), { recursive: true });
    await writeFile(join(directory, "dist/server/entry.mjs"), serverSource);
  }
  return directory;
}

function observe(child: CliChild) {
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => { stdout += chunk; });
  child.stderr.on("data", (chunk: string) => { stderr += chunk; });
  const outcome = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolveOutcome, rejectOutcome) => {
    child.once("error", rejectOutcome);
    child.once("exit", (code, signal) => resolveOutcome({ code, signal }));
  });
  return {
    outcome,
    stdout: () => stdout,
    stderr: () => stderr,
  };
}

async function waitUntil(condition: () => boolean, timeoutMs: number, message: string) {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error(message);
    await new Promise<void>((resolveImmediate) => setImmediate(resolveImmediate));
  }
}

async function withDeadline<T>(promise: Promise<T>, timeoutMs: number) {
  let timer: NodeJS.Timeout | undefined;
  return await Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error("subprocess deadline exceeded")), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

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

async function cleanupProcessGroup(child: CliChild) {
  if (child.pid === undefined || process.platform === "win32") {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    return;
  }
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
  await waitUntil(
    () => !processGroupExists(child.pid!),
    2_000,
    `process group ${child.pid} survived test cleanup`,
  );
}

describe("skill-manage CLI", () => {
  it("prints help without requiring a production build", () => {
    const result = runCli(["--help"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Usage: npx skill-manage [options]");
    expect(result.stdout).toContain("--port <number>");
    expect(result.stdout).toContain("--no-open");
  });

  it("prints the package version", () => {
    const result = runCli(["--version"]);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(PACKAGE_VERSION);
  });

  it("runs through an npm-style executable symlink", async () => {
    const directory = await mkdtemp(join(tmpdir(), "skill-manage-bin-"));
    const executable = join(directory, "skill-manage");
    await symlink(resolve("bin/skill-manage.mjs"), executable);

    try {
      const result = spawnSync(process.execPath, [executable, "--help"], { encoding: "utf8" });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Usage: npx skill-manage [options]");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("uses the approved no-shell Windows browser command", () => {
    const script = [
      'import { browserCommand } from "./bin/skill-manage.mjs";',
      'console.log(JSON.stringify(browserCommand("http://127.0.0.1:4321", "win32")));',
    ].join("\n");
    const result = spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([
      "cmd.exe",
      ["/d", "/s", "/c", "start", "", "http://127.0.0.1:4321"],
    ]);
  });

  it.each([
    [["--unknown"], "Unknown option: --unknown"],
    [["--port"], "--port requires a value"],
    [["--port", "0"], "Port must be an integer from 1 to 65535"],
    [["--port", "12.5"], "Port must be an integer from 1 to 65535"],
  ])("rejects invalid arguments", (args, message) => {
    const result = runCli(args);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain(message);
  });

  it("rejects an occupied explicit port before requiring a production build", async () => {
    const server = createServer();
    await new Promise<void>((resolveListen, rejectListen) => {
      server.once("error", rejectListen);
      server.listen(0, "127.0.0.1", resolveListen);
    });

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected a TCP server address");
      }

      const result = runCli(["--no-open", "--port", String(address.port)]);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain(`Port ${address.port} is already in use.`);
    } finally {
      await new Promise<void>((resolveClose, rejectClose) => {
        server.close((error) => (error ? rejectClose(error) : resolveClose()));
      });
    }
  });

  it("reports a missing dist entry from an isolated package", async () => {
    const directory = await createFakePackage();
    try {
      const port = await chooseFreePort();
      const result = runCli(["--no-open", "--port", String(port)], { cwd: directory });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Skill Atlas production build is missing (dist/server/entry.mjs).");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("returns an early nonzero server exit", async () => {
    const directory = await createFakePackage("process.exit(23);\n");
    try {
      const port = await chooseFreePort();
      const result = runCli(["--no-open", "--port", String(port)], { cwd: directory });
      expect(result.status).toBe(23);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === "win32")(
    "keeps running when the PATH-controlled browser command fails",
    async () => {
      const directory = await createFakePackage([
        'import { createServer } from "node:http";',
        "const server = createServer((_request, response) => { response.writeHead(200); response.end('ok'); });",
        "server.listen(Number(process.env.PORT), process.env.HOST);",
      ].join("\n"));
      const commandDirectory = join(directory, "empty-path");
      await mkdir(commandDirectory);
      const port = await chooseFreePort();
      const child = spawn(process.execPath, ["bin/skill-manage.mjs", "--port", String(port)], {
        cwd: directory,
        env: { ...process.env, PATH: commandDirectory },
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const observed = observe(child);

      try {
        const url = `http://127.0.0.1:${port}`;
        await waitUntil(
          () => observed.stderr().includes(`Open this URL manually: ${url}`),
          3_000,
          `browser failure was not reported; stdout=${observed.stdout()} stderr=${observed.stderr()}`,
        );
        expect(observed.stdout()).toContain(`Skill Atlas is running at ${url}`);
        expect(child.exitCode).toBeNull();
        child.kill("SIGINT");
        await expect(withDeadline(observed.outcome, 2_000)).resolves.toEqual({ code: 130, signal: null });
      } finally {
        try {
          await cleanupProcessGroup(child);
        } finally {
          await rm(directory, { recursive: true, force: true });
        }
      }
    },
  );

  it.each(["SIGINT", "SIGTERM"] as const)(
    "guards repeated %s until an unresponsive server is force-killed",
    { timeout: 8_000 },
    async (signal) => {
      if (process.platform === "win32") return;
      const directory = await createFakePackage([
        `process.on("${signal}", () => console.log("IGNORED_${signal}"));`,
        "console.log('UNRESPONSIVE_SERVER_READY');",
        "setInterval(() => {}, 1_000);",
      ].join("\n"));
      const port = await chooseFreePort();
      const child = spawn(process.execPath, ["bin/skill-manage.mjs", "--no-open", "--port", String(port)], {
        cwd: directory,
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const observed = observe(child);

      try {
        await waitUntil(
          () => observed.stdout().includes("UNRESPONSIVE_SERVER_READY"),
          2_000,
          `server did not start; stdout=${observed.stdout()} stderr=${observed.stderr()}`,
        );
        child.kill(signal);
        await waitUntil(
          () => observed.stdout().includes(`IGNORED_${signal}`) || child.exitCode !== null || child.signalCode !== null,
          2_000,
          `server did not receive ${signal}; stdout=${observed.stdout()} stderr=${observed.stderr()}`,
        );
        expect(observed.stdout()).toContain(`IGNORED_${signal}`);
        child.kill(signal);

        await expect(withDeadline(observed.outcome, 5_000)).resolves.toEqual({ code: 137, signal: null });
        await waitUntil(
          () => !processGroupExists(child.pid!),
          2_000,
          `process group ${child.pid} remained after forced shutdown`,
        );
      } finally {
        try {
          await cleanupProcessGroup(child);
        } finally {
          await rm(directory, { recursive: true, force: true });
        }
      }
    },
  );
});
