import { spawnSync } from "node:child_process";
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
