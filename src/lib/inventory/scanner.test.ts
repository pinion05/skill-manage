import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultScanOptions, scanInventory } from "./scanner";

const fixtures: string[] = [];

async function makeFixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "skill-atlas-"));
  fixtures.push(root);

  const alpha = path.join(root, ".codex", "skills", "alpha");
  const fallback = path.join(root, "project", ".claude", "skills", "no-frontmatter");
  const docs = path.join(root, "project", "docs");
  const ignored = path.join(root, ".git", "skills", "ignored");
  const links = path.join(root, "links", "skills");

  await Promise.all([
    mkdir(alpha, { recursive: true }),
    mkdir(fallback, { recursive: true }),
    mkdir(docs, { recursive: true }),
    mkdir(ignored, { recursive: true }),
    mkdir(links, { recursive: true }),
  ]);

  await Promise.all([
    writeFile(
      path.join(alpha, "SKILL.md"),
      "---\nname: alpha\ndescription: Alpha skill\n---\n\n# Alpha\n",
    ),
    writeFile(path.join(fallback, "SKILL.md"), "# No frontmatter\n"),
    writeFile(path.join(docs, "skills.md"), "# Skill documentation\n"),
    writeFile(path.join(ignored, "SKILL.md"), "---\nname: ignored\n---\n"),
  ]);

  await symlink(alpha, path.join(links, "alpha-link"));
  await symlink(path.join(root, "missing-target"), path.join(links, "missing"));

  return root;
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => rm(fixture, { recursive: true, force: true })));
});

describe("defaultScanOptions", () => {
  it("uses portable roots derived from the current home", () => {
    const options = defaultScanOptions("/Users/example");
    expect(options.roots).toEqual([
      "/Users/example",
      "/Applications",
      "/Library",
      "/usr/local",
      "/opt/homebrew",
    ]);
    expect(options.home).toBe("/Users/example");
  });
});

describe("scanInventory", () => {
  it("finds skill definitions and separates skills.md documents", async () => {
    const root = await makeFixture();
    const snapshot = await scanInventory({ roots: [root], home: root });

    expect(snapshot.skills).toHaveLength(3);
    expect(snapshot.stats.skillDefinitions).toBe(2);
    expect(snapshot.stats.documents).toBe(1);
    expect(snapshot.stats.matchedFiles).toBe(3);
    expect(snapshot.skills.some((skill) => skill.name === "ignored")).toBe(false);

    const alpha = snapshot.skills.find((skill) => skill.name === "alpha");
    expect(alpha).toMatchObject({
      description: "Alpha skill",
      recordType: "skill",
      agent: "OpenAI Codex",
      kind: "user/global-config",
    });
    expect(alpha?.id).toMatch(/^[a-f0-9]{16}$/);

    const fallback = snapshot.skills.find((skill) => skill.name === "no-frontmatter");
    expect(fallback?.description).toBe("");
    expect(fallback?.recordType).toBe("skill");

    const document = snapshot.skills.find((skill) => skill.recordType === "document");
    expect(document?.name).toBe("docs");
  });

  it("records healthy and broken links without following them", async () => {
    const root = await makeFixture();
    const snapshot = await scanInventory({ roots: [root], home: root });

    expect(snapshot.links).toHaveLength(2);
    expect(snapshot.links.find((link) => link.status === "healthy")).toMatchObject({
      containsSkill: true,
    });
    expect(snapshot.links.find((link) => link.status === "broken")).toMatchObject({
      containsSkill: false,
    });
    expect(snapshot.stats.healthyLinks).toBe(1);
    expect(snapshot.stats.brokenLinks).toBe(1);
    expect(snapshot.skills.filter((skill) => skill.name === "alpha")).toHaveLength(1);
  });

  it("returns deterministic path ordering and root aggregates", async () => {
    const root = await makeFixture();
    const snapshot = await scanInventory({ roots: [root], home: root });
    const paths = snapshot.skills.map((skill) => skill.path);

    expect(paths).toEqual([...paths].sort((a, b) => a.localeCompare(b)));
    expect(snapshot.roots.some((entry) => entry.agent === "OpenAI Codex")).toBe(true);
    expect(snapshot.stats.configRoots).toBe(snapshot.roots.length);
    expect(snapshot.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(snapshot.durationMs).toBeGreaterThanOrEqual(0);
  });
});
