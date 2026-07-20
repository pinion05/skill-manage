import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createValidatedPack } from "../scripts/package-pack.mjs";

async function pathExists(path: string) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

describe("package pack stage", () => {
  it("packs into an owned temporary destination and removes it when validation fails", async () => {
    const parent = await mkdtemp(join(tmpdir(), "skill-manage-pack-test-"));
    const destination = join(parent, "pack-output");
    const runPack = vi.fn(async (_command: string, args: string[]) => {
      expect(args).toEqual(["pack", "--json", "--pack-destination", destination]);
      await mkdir(destination, { recursive: true });
      await writeFile(join(destination, "unexpected-1.0.0.tgz"), "generated tarball");
      return {
        stdout: JSON.stringify([{ name: "unexpected", version: "1.0.0", filename: "unexpected-1.0.0.tgz", files: [] }]),
        stderr: "",
      };
    });

    try {
      await expect(createValidatedPack("/fake/package", {
        makeTemp: async () => destination,
        runPack,
      })).rejects.toThrow("Unexpected packed package: unexpected@1.0.0");
      expect(runPack).toHaveBeenCalledOnce();
      expect(await pathExists(destination)).toBe(false);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
});
