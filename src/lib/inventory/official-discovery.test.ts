import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  annotateFullInventory,
  discoverOfficialRoots,
  scanOfficialInventory,
} from "./official-discovery";
import { scanInventory } from "./scanner";

const fixtures: string[] = [];

async function temporaryHome(): Promise<string> {
  const home = await mkdtemp(path.join(os.tmpdir(), "skill-official-"));
  fixtures.push(home);
  return home;
}

async function writeSkill(root: string, name: string): Promise<string> {
  const directory = path.join(root, name);
  await mkdir(directory, { recursive: true });
  const filePath = path.join(directory, "SKILL.md");
  await writeFile(filePath, `---\nname: ${name}\ndescription: ${name} skill\n---\n`);
  return filePath;
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => rm(fixture, { recursive: true, force: true })));
});

describe("discoverOfficialRoots", () => {
  it("finds documented global and home-wide project roots while pruning dependencies and sessions", async () => {
    const home = await temporaryHome();
    const globalClaude = path.join(home, ".claude", "skills");
    const projectShared = path.join(home, "dev", "one", ".agents", "skills");
    const projectFactory = path.join(home, "work", "two", ".factory", "skills");
    const hermesProfile = path.join(home, ".hermes", "profiles", "research", "skills");
    const openClawWorkspace = path.join(home, "dev", "claw");
    const openClawSkills = path.join(openClawWorkspace, "skills");
    const excludedDependency = path.join(
      home,
      "dev",
      "one",
      "node_modules",
      "package",
      ".agents",
      "skills",
    );
    const excludedSession = path.join(
      home,
      ".claude",
      "projects",
      "encoded-project",
      ".agents",
      "skills",
    );
    const unmarkedPlainSkills = path.join(home, "Downloads", "random", "skills");
    const excludedCodexTemp = path.join(home, ".codex", ".tmp", "plugin", ".agents", "skills");
    const excludedOmxBackup = path.join(
      home,
      ".omx",
      "backups",
      "snapshot",
      ".codex",
      "skills",
    );
    const excludedPluginCache = path.join(
      home,
      ".zcode",
      "cli",
      "plugins",
      "cache",
      "package",
      ".agents",
      "skills",
    );

    await Promise.all([
      writeSkill(globalClaude, "global-claude"),
      writeSkill(projectShared, "project-shared"),
      writeSkill(projectFactory, "project-factory"),
      writeSkill(hermesProfile, "profile-skill"),
      writeSkill(openClawSkills, "workspace-skill"),
      writeSkill(excludedDependency, "dependency-noise"),
      writeSkill(excludedSession, "session-noise"),
      writeSkill(unmarkedPlainSkills, "plain-noise"),
      writeSkill(excludedCodexTemp, "codex-temp-noise"),
      writeSkill(excludedOmxBackup, "backup-noise"),
      writeSkill(excludedPluginCache, "plugin-cache-noise"),
      mkdir(path.join(openClawWorkspace, ".git"), { recursive: true }),
    ]);

    const discovery = await discoverOfficialRoots({
      home,
      environment: {},
      concurrency: 3,
      maxDirectories: 10_000,
    });
    const existing = discovery.roots.filter(({ exists }) => exists).map(({ path: rootPath }) => rootPath);

    expect(existing).toEqual(
      expect.arrayContaining([
        globalClaude,
        projectShared,
        projectFactory,
        hermesProfile,
      ]),
    );
    expect(existing).not.toEqual(
      expect.arrayContaining([
        openClawSkills,
        excludedDependency,
        excludedSession,
        unmarkedPlainSkills,
        excludedCodexTemp,
        excludedOmxBackup,
        excludedPluginCache,
      ]),
    );
    expect(
      discovery.roots.find(({ path: rootPath }) => rootPath === path.join(home, ".qwen", "skills")),
    ).toMatchObject({
      exists: false,
      owner: { id: "qwen", name: "Qwen Code", type: "agent" },
    });
    expect(discovery.errors.count).toBe(0);
  });

  it("stops at a bounded directory budget with a sanitized warning", async () => {
    const home = await temporaryHome();
    await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        mkdir(path.join(home, `project-${index}`, "nested"), { recursive: true }),
      ),
    );

    const discovery = await discoverOfficialRoots({
      home,
      environment: {},
      concurrency: 2,
      maxDirectories: 3,
    });

    expect(discovery.errors.count).toBeGreaterThan(0);
    expect(discovery.errors.samples).toContainEqual(
      expect.objectContaining({
        code: "OFFICIAL_DISCOVERY_LIMIT",
        message: "공식 프로젝트 경로 검색 한도에 도달했습니다.",
      }),
    );
  });
});

describe("annotateFullInventory", () => {
  it("keeps full-scan records while marking only paths matched by the official registry", async () => {
    const home = await temporaryHome();
    const officialRoot = path.join(home, "dev", "app", ".claude", "skills");
    const unrelatedRoot = path.join(home, "archive", "skills");
    await Promise.all([
      writeSkill(officialRoot, "official-in-full"),
      writeSkill(unrelatedRoot, "unrelated-in-full"),
    ]);

    const full = await scanInventory({ roots: [home], home });
    const annotated = await annotateFullInventory(full, { home, environment: {} });

    expect(annotated.scanMode).toBe("full");
    expect(annotated.skills).toHaveLength(2);
    expect(
      annotated.skills.find(({ name }) => name === "official-in-full")?.sourceSightings[0]?.owner,
    ).toEqual({ id: "claude-code", name: "Claude Code", type: "agent" });
    expect(
      annotated.skills.find(({ name }) => name === "unrelated-in-full")?.sourceSightings,
    ).toEqual([]);
    expect(annotated.officialSources.shared.name).toBe("공유 디렉터리");
    expect(annotated.officialSources.agents.map(({ id }) => id)).not.toEqual(
      expect.arrayContaining(["zed", "sakana-fugu"]),
    );
  });
});

describe("scanOfficialInventory", () => {
  it("assigns namespace owners without dropping compatibility-only project roots", async () => {
    const home = await temporaryHome();
    await Promise.all([
      writeSkill(path.join(home, "dev", "app", ".agents", "skills"), "shared-owner"),
      writeSkill(path.join(home, "dev", "app", ".claude", "skills"), "claude-owner"),
      writeSkill(path.join(home, "dev", "app", ".codex", "skills"), "codex-owner"),
    ]);

    const snapshot = await scanOfficialInventory({
      home,
      environment: {},
      concurrency: 2,
      discoveryMaxDirectories: 10_000,
    });
    const ownerOf = (name: string) =>
      snapshot.skills.find((skill) => skill.name === name)?.sourceSightings[0]?.owner;

    expect(snapshot.skills).toHaveLength(3);
    expect(ownerOf("shared-owner")).toEqual({
      id: "shared",
      name: "공유 디렉터리",
      type: "shared",
    });
    expect(ownerOf("claude-owner")).toEqual({
      id: "claude-code",
      name: "Claude Code",
      type: "agent",
    });
    expect(ownerOf("codex-owner")).toEqual({
      id: "codex",
      name: "Codex CLI",
      type: "agent",
    });
  });

  it("scans one physical root and file while preserving every official root and skill alias", async () => {
    const home = await temporaryHome();
    const sharedRoot = path.join(home, "shared-store");
    const physicalSkill = path.join(home, "physical-skill");
    const agentsRoot = path.join(home, ".agents");
    const cursorRoot = path.join(home, ".cursor");
    await Promise.all([
      mkdir(sharedRoot, { recursive: true }),
      mkdir(physicalSkill, { recursive: true }),
      mkdir(agentsRoot, { recursive: true }),
      mkdir(cursorRoot, { recursive: true }),
    ]);
    await writeFile(
      path.join(physicalSkill, "SKILL.md"),
      "---\nname: shared\ndescription: one physical skill\n---\n",
    );
    await Promise.all([
      symlink(sharedRoot, path.join(agentsRoot, "skills")),
      symlink(sharedRoot, path.join(cursorRoot, "skills")),
      symlink(physicalSkill, path.join(sharedRoot, "shared-a")),
      symlink(physicalSkill, path.join(sharedRoot, "shared-b")),
    ]);

    const snapshot = await scanOfficialInventory({
      home,
      environment: {},
      concurrency: 3,
      discoveryMaxDirectories: 10_000,
    });

    expect(snapshot.scanMode).toBe("official");
    expect(snapshot.searchRoots).toEqual([await realpath(sharedRoot)]);
    expect(snapshot.skills).toHaveLength(1);
    expect(snapshot.skills[0]).toMatchObject({ name: "shared" });
    expect(snapshot.skills[0]!.sourceSightings.map(({ path: skillPath }) => skillPath)).toEqual(
      expect.arrayContaining([
        path.join(home, ".agents", "skills", "shared-a", "SKILL.md"),
        path.join(home, ".agents", "skills", "shared-b", "SKILL.md"),
        path.join(home, ".cursor", "skills", "shared-a", "SKILL.md"),
        path.join(home, ".cursor", "skills", "shared-b", "SKILL.md"),
      ]),
    );
    const canonicalSharedRoot = await realpath(sharedRoot);
    const aliasedRoots = snapshot.officialSources.roots.filter(
      ({ canonicalPath }) => canonicalPath === canonicalSharedRoot,
    );
    expect(aliasedRoots).toHaveLength(2);
    expect(aliasedRoots.map(({ owner }) => owner.id).sort()).toEqual(["cursor", "shared"]);
    expect(aliasedRoots.every(({ skillCount }) => skillCount === 1)).toBe(true);
    expect(snapshot.skills[0]!.sourceSightings.map(({ owner }) => owner.id)).toEqual(
      expect.arrayContaining(["shared", "cursor"]),
    );
  });
});
