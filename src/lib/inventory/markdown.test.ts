import { execFile } from "node:child_process";
import { mkdir, rename, rm, stat, symlink, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { SkillRecord } from "./types";
import { InvalidSkillFileError, readSkillContent } from "./markdown";

const fixtures: string[] = [];
const execFileAsync = promisify(execFile);

async function fixtureRecord(contents: string, fileName = "SKILL.md"): Promise<SkillRecord> {
  const root = path.join(os.tmpdir(), `skill-content-${crypto.randomUUID()}`);
  fixtures.push(root);
  const skillDirectory = path.join(root, "entry");
  await mkdir(skillDirectory, { recursive: true });
  const filePath = path.join(skillDirectory, fileName);
  await writeFile(filePath, contents);
  const fileStat = await stat(filePath);
  return {
    id: "content-id",
    name: "content",
    description: "",
    path: filePath,
    fileName,
    recordType: fileName.toLowerCase() === "skill.md" ? "skill" : "document",
    skillsRoot: root,
    configRoot: root,
    agent: "tmp",
    kind: "other",
    modifiedAt: new Date(0).toISOString(),
    size: Buffer.byteLength(contents),
    device: fileStat.dev,
    inode: fileStat.ino,
  };
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => rm(fixture, { recursive: true, force: true })));
});

describe("readSkillContent", () => {
  it("renders markdown while removing unsafe HTML and URL schemes", async () => {
    const record = await fixtureRecord(
      "# Heading\n\n<script>alert('x')</script>\n\n[bad](javascript:alert('x'))\n\n**safe**",
    );

    const result = await readSkillContent(record);

    expect(result.markdown).toContain("# Heading");
    expect(result.html).toContain("<h1>Heading</h1>");
    expect(result.html).toContain("<strong>safe</strong>");
    expect(result.html).not.toContain("<script");
    expect(result.html).not.toContain("javascript:");
  });

  it("renders the body without repeating YAML frontmatter", async () => {
    const record = await fixtureRecord(
      "---\nname: alpha\ndescription: Alpha description\n---\n\n# Body heading\n",
    );

    const result = await readSkillContent(record);

    expect(result.markdown).toContain("name: alpha");
    expect(result.html).toContain("<h1>Body heading</h1>");
    expect(result.html).not.toContain("name: alpha");
    expect(result.html).not.toContain("Alpha description");
  });

  it("renders raw HTML and Markdown images as inert text", async () => {
    const record = await fixtureRecord(
      '<p class="raw">raw html</p>\n\n![tracking pixel](http://127.0.0.1:9999/private)\n',
    );

    const result = await readSkillContent(record);

    expect(result.html).not.toContain('<p class="raw">');
    expect(result.html).not.toContain("<img");
    expect(result.html).not.toContain("127.0.0.1:9999");
    expect(result.html).toContain("raw html");
    expect(result.html).toContain("tracking pixel");
  });

  it("rejects a cached skill path replaced by a symlink", async () => {
    const record = await fixtureRecord("# Original\n");
    const secretPath = path.join(path.dirname(record.path), "secret.txt");
    await writeFile(secretPath, "TOP SECRET");
    await rm(record.path);
    await symlink(secretPath, record.path);

    await expect(readSkillContent(record)).rejects.toBeInstanceOf(InvalidSkillFileError);
  });

  it("rejects a cached path whose parent directory becomes a symlink", async () => {
    const record = await fixtureRecord("# Original\n");
    const originalDirectory = path.dirname(record.path);
    const archivedDirectory = `${originalDirectory}-archived`;
    const replacementDirectory = `${originalDirectory}-replacement`;
    await rename(originalDirectory, archivedDirectory);
    await mkdir(replacementDirectory, { recursive: true });
    await writeFile(path.join(replacementDirectory, "SKILL.md"), "# DIFFERENT SECRET\n");
    await symlink(replacementDirectory, originalDirectory);

    await expect(readSkillContent(record)).rejects.toBeInstanceOf(InvalidSkillFileError);
  });

  it("rejects a FIFO replacement without waiting for a writer", async () => {
    const record = await fixtureRecord("# Original\n");
    await rm(record.path);
    await execFileAsync("/usr/bin/mkfifo", [record.path]);

    const startedAt = performance.now();
    const delayedWriter = setTimeout(() => {
      void writeFile(record.path, "unblock").catch(() => undefined);
    }, 250);
    try {
      await expect(readSkillContent(record)).rejects.toBeInstanceOf(InvalidSkillFileError);
    } finally {
      clearTimeout(delayedWriter);
    }
    expect(performance.now() - startedAt).toBeLessThan(150);
  });

  it("rejects files outside the accepted skill filenames", async () => {
    const record = await fixtureRecord("secret", "notes.md");
    await expect(readSkillContent(record)).rejects.toBeInstanceOf(InvalidSkillFileError);
  });

  it("rejects skill files larger than one MiB", async () => {
    const record = await fixtureRecord("x".repeat(1024 * 1024 + 1));
    await expect(readSkillContent(record)).rejects.toThrow("1 MiB");
  });
});
