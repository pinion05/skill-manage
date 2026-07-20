import { spawnSync } from "node:child_process";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
import { describe, expect, it } from "vitest";

function runCli(args: string[]) {
  return spawnSync(process.execPath, ["bin/skill-manage.mjs", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
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
    expect(result.stdout.trim()).toBe("0.1.0");
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
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
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
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
