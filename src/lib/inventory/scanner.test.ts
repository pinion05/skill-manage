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

    expect(snapshot.scanMode).toBe("full");
    expect(snapshot.officialSources).toEqual({ agents: [], roots: [] });
    expect(snapshot.skills).toHaveLength(3);
    expect(snapshot.skills.every((skill) => skill.sourceSightings.length === 0)).toBe(true);
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
    expect(alpha?.device).toEqual(expect.any(Number));
    expect(alpha?.inode).toEqual(expect.any(Number));

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

  it("follows skill-directory links only when enabled and stops directory cycles", async () => {
    const root = await makeFixture();
    const linkRoot = path.join(root, "opt-in", "skills");
    const target = path.join(root, "linked-target");
    await Promise.all([mkdir(linkRoot, { recursive: true }), mkdir(target, { recursive: true })]);
    await writeFile(path.join(target, "SKILL.md"), "---\nname: linked\n---\n");
    await symlink(target, path.join(linkRoot, "linked"));
    await symlink(linkRoot, path.join(target, "cycle"));

    const defaultSnapshot = await scanInventory({ roots: [linkRoot], home: root });
    expect(defaultSnapshot.skills).toHaveLength(0);

    const followedSnapshot = await scanInventory({
      roots: [linkRoot],
      home: root,
      followDirectoryLinks: true,
    });
    expect(followedSnapshot.skills.map(({ name }) => name)).toEqual(["linked"]);
    expect(followedSnapshot.links).toHaveLength(2);
  });

  it("does not expand a linked collection that lacks a direct SKILL.md", async () => {
    const root = await makeFixture();
    const linkRoot = path.join(root, "collection-links", "skills");
    const collection = path.join(root, "large-collection");
    await Promise.all([
      mkdir(linkRoot, { recursive: true }),
      mkdir(path.join(collection, "nested-skill"), { recursive: true }),
    ]);
    await writeFile(
      path.join(collection, "nested-skill", "SKILL.md"),
      "---\nname: nested-through-collection\n---\n",
    );
    await symlink(collection, path.join(linkRoot, "collection"));

    const snapshot = await scanInventory({
      roots: [linkRoot],
      home: root,
      followDirectoryLinks: true,
    });

    expect(snapshot.skills).toHaveLength(0);
    expect(snapshot.links).toContainEqual(
      expect.objectContaining({ status: "healthy", containsSkill: true }),
    );
  });

  it("bounds frontmatter reads and sanitizes parser errors", async () => {
    const root = await makeFixture();
    const hugeDirectory = path.join(root, ".codex", "skills", "huge");
    const invalidDirectory = path.join(root, ".codex", "skills", "invalid");
    await Promise.all([
      mkdir(hugeDirectory, { recursive: true }),
      mkdir(invalidDirectory, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(path.join(hugeDirectory, "SKILL.md"), "x".repeat(1024 * 1024 + 1)),
      writeFile(
        path.join(invalidDirectory, "SKILL.md"),
        "---\nname: invalid\ndescription: [PRIVATE-SOURCE-SNIPPET\n---\n",
      ),
    ]);

    const snapshot = await scanInventory({ roots: [root], home: root });

    expect(snapshot.skills.some((skill) => skill.name === "huge")).toBe(true);
    expect(snapshot.errors.samples.some((error) => error.code === "FILE_TOO_LARGE")).toBe(true);
    expect(snapshot.errors.samples.some((error) => error.code === "FRONTMATTER_PARSE")).toBe(true);
    expect(snapshot.errors.samples.every((error) => !error.message.includes("PRIVATE-SOURCE-SNIPPET"))).toBe(
      true,
    );
  });

  it("detects skills below deeply nested healthy link targets", async () => {
    const root = await makeFixture();
    const deepTarget = path.join(root, "deep", "one", "two", "three", "four", "five", "skill");
    const deepLink = path.join(root, "links", "skills", "deep-link");
    await mkdir(deepTarget, { recursive: true });
    await writeFile(path.join(deepTarget, "SKILL.md"), "---\nname: deep\n---\n");
    await symlink(path.join(root, "deep"), deepLink);

    const snapshot = await scanInventory({ roots: [root], home: root });

    expect(snapshot.links.find((link) => link.path === deepLink)).toMatchObject({
      status: "healthy",
      containsSkill: true,
    });
  });

  it("bounds initial search roots before starting workers", async () => {
    const root = await makeFixture();
    const roots = await Promise.all(
      Array.from({ length: 4 }, async (_, index) => {
        const scanRoot = path.join(root, `initial-${index}`);
        await mkdir(scanRoot, { recursive: true });
        await writeFile(
          path.join(scanRoot, "SKILL.md"),
          `---\nname: initial-skill-${index}\n---\n`,
        );
        return scanRoot;
      }),
    );

    const snapshot = await scanInventory({ roots, home: root, maxDirectories: 2 });

    expect(snapshot.searchRoots).toHaveLength(2);
    expect(snapshot.skills).toHaveLength(2);
    expect(snapshot.errors.samples).toContainEqual(
      expect.objectContaining({ code: "SCAN_LIMIT", path: roots[2] }),
    );
  });

  it("bounds the main traversal queue before expanding a broad root", async () => {
    const root = await makeFixture();
    const broadRoot = path.join(root, "broad-root");
    await mkdir(broadRoot, { recursive: true });
    await Promise.all(
      Array.from({ length: 8 }, async (_, index) => {
        const skillDirectory = path.join(broadRoot, `child-${index}`);
        await mkdir(skillDirectory, { recursive: true });
        await writeFile(path.join(skillDirectory, "SKILL.md"), `---\nname: child-${index}\n---\n`);
      }),
    );

    const snapshot = await scanInventory({
      roots: [broadRoot],
      home: root,
      maxDirectories: 3,
    });

    expect(snapshot.errors.samples).toContainEqual(
      expect.objectContaining({ code: "SCAN_LIMIT" }),
    );
    expect(snapshot.skills.length).toBeLessThan(8);
  });

  it("bounds wide link-target queues when directories are discovered", async () => {
    const root = await makeFixture();
    const wideTarget = path.join(root, "wide");
    const wideLink = path.join(root, "links", "skills", "wide-link");
    await mkdir(wideTarget, { recursive: true });
    await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        mkdir(path.join(wideTarget, `child-${index}`), { recursive: true }),
      ),
    );
    await symlink(wideTarget, wideLink);

    const snapshot = await scanInventory({
      roots: [root],
      home: root,
      maxLinkTargetDirectories: 3,
    });

    expect(snapshot.errors.samples.some((error) => error.code === "LINK_SCAN_LIMIT")).toBe(true);
    expect(snapshot.links.find((link) => link.path === wideLink)?.containsSkill).toBe(false);
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
