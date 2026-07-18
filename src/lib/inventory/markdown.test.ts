import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { SkillRecord } from "./types";
import { InvalidSkillFileError, readSkillContent } from "./markdown";

const fixtures: string[] = [];

async function fixtureRecord(contents: string, fileName = "SKILL.md"): Promise<SkillRecord> {
  const root = path.join(os.tmpdir(), `skill-content-${crypto.randomUUID()}`);
  fixtures.push(root);
  await mkdir(root, { recursive: true });
  const filePath = path.join(root, fileName);
  await writeFile(filePath, contents);
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

  it("rejects files outside the accepted skill filenames", async () => {
    const record = await fixtureRecord("secret", "notes.md");
    await expect(readSkillContent(record)).rejects.toBeInstanceOf(InvalidSkillFileError);
  });

  it("rejects skill files larger than one MiB", async () => {
    const record = await fixtureRecord("x".repeat(1024 * 1024 + 1));
    await expect(readSkillContent(record)).rejects.toThrow("1 MiB");
  });
});
