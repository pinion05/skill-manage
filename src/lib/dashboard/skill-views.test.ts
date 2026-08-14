import path from "node:path";
import { describe, expect, it } from "vitest";
import type {
  OfficialSourceScope,
  SkillRecord,
  SkillSourceSighting,
} from "../inventory/types";
import {
  createAgentSkillProjection,
  createProjectSkillProjection,
  inferProjectDirectory,
} from "./skill-views";

function sighting(
  scope: OfficialSourceScope,
  ownerId: string,
  ownerName: string,
  rootPath: string,
  ownerType: "agent" | "shared" = ownerId === "shared" ? "shared" : "agent",
): SkillSourceSighting {
  return {
    rootPath,
    path: `${rootPath}/alpha`,
    scope,
    owner: { id: ownerId, name: ownerName, type: ownerType },
  };
}

function skill(overrides: Partial<SkillRecord> = {}): SkillRecord {
  return {
    id: "alpha",
    name: "alpha",
    description: "",
    path: "/Users/me/.codex/skills/alpha/SKILL.md",
    fileName: "SKILL.md",
    recordType: "skill",
    skillsRoot: "/Users/me/.codex/skills",
    configRoot: "/Users/me/.codex",
    agent: "OpenAI Codex",
    kind: "user/global-config",
    modifiedAt: "2026-01-01T00:00:00.000Z",
    size: 100,
    device: 1,
    inode: 1,
    sourceSightings: [],
    contentsTokens: 0,
    descriptionTokens: 0,
    ...overrides,
  };
}

describe("createAgentSkillProjection", () => {
  it("keeps global memberships, excludes project-only records and documents", () => {
    const globalAndProject = skill({
      id: "mixed",
      sourceSightings: [
        sighting("user", "claude-code", "Claude Code", "/Users/me/.claude/skills"),
        sighting("project", "cursor", "Cursor", "/Users/me/dev/app/.cursor/skills"),
      ],
    });
    const projectOnly = skill({
      id: "project-only",
      inode: 2,
      kind: "project/source-local",
      sourceSightings: [
        sighting("project", "claude-code", "Claude Code", "/Users/me/dev/app/.claude/skills"),
      ],
    });
    const document = skill({ id: "doc", inode: 3, recordType: "document", fileName: "skills.md" });

    const result = createAgentSkillProjection([globalAndProject, projectOnly, document]);

    expect(result.skillCount).toBe(1);
    expect(result.groups.flatMap(({ skills }) => skills.map(({ skill }) => skill.id))).toEqual(["mixed"]);
  });

  it("puts shared first and dedupes aliases within one owner", () => {
    const result = createAgentSkillProjection([
      skill({
        sourceSightings: [
          sighting("user", "shared", "공유 디렉터리", "/Users/me/.agents/skills", "shared"),
          sighting("admin", "shared", "공유 디렉터리", "/Users/me/.config/agents/skills", "shared"),
        ],
      }),
    ]);

    expect(result.groups[0]?.owner.id).toBe("shared");
    expect(result.groups[0]?.skills[0]?.aliases).toHaveLength(2);
  });

  it("counts one physical Skill across owners and full-mode aliases", () => {
    const first = skill({
      id: "first-path",
      sourceSightings: [
        sighting("user", "claude-code", "Claude Code", "/Users/me/.claude/skills"),
        sighting("admin", "shared", "공유 디렉터리", "/Users/me/.agents/skills", "shared"),
      ],
    });
    const second = skill({
      ...first,
      id: "second-path",
      path: "/Users/me/.local/skills/alpha/SKILL.md",
      sourceSightings: [],
      agent: "Local Agent",
    });

    const result = createAgentSkillProjection([first, second]);

    expect(result.skillCount).toBe(1);
    expect(result.groups.map(({ owner }) => owner.name)).toEqual([
      "공유 디렉터리",
      "Claude Code",
      "Local Agent",
    ]);
  });
});

describe("createProjectSkillProjection", () => {
  it("merges project owners and aliases into one physical Skill entry", () => {
    const result = createProjectSkillProjection([
      skill({
        sourceSightings: [
          sighting("project", "claude-code", "Claude Code", "/Users/me/dev/app/.claude/skills"),
          sighting("project", "cursor", "Cursor", "/Users/me/dev/app/.cursor/skills"),
        ],
      }),
    ]);

    expect(result.skillCount).toBe(1);
    expect(result.groups[0]?.directory).toBe("/Users/me/dev/app");
    expect(result.groups[0]?.skills).toHaveLength(1);
    expect(result.groups[0]?.skills[0]?.owners.map(({ name }) => name)).toEqual(["Claude Code", "Cursor"]);
  });

  it("keeps one physical Skill once in each distinct project", () => {
    const result = createProjectSkillProjection([
      skill({
        sourceSightings: [
          sighting("project", "claude-code", "Claude Code", "/Users/me/dev/alpha/.claude/skills"),
          sighting("project", "claude-code", "Claude Code", "/Users/me/dev/beta/.claude/skills"),
        ],
      }),
    ]);

    expect(result.skillCount).toBe(2);
    expect(result.groups.map(({ directory }) => directory)).toEqual([
      "/Users/me/dev/alpha",
      "/Users/me/dev/beta",
    ]);
    expect(result.groups.every(({ skills }) => skills.length === 1)).toBe(true);
  });
});

describe("inferProjectDirectory", () => {
  it("derives marker and plain workspace project directories", () => {
    expect(inferProjectDirectory("/Users/me/dev/app/.agents/skills")).toBe("/Users/me/dev/app");
    expect(inferProjectDirectory("/Users/me/dev/app/.roo/skills-debug")).toBe("/Users/me/dev/app");
    expect(inferProjectDirectory("/Users/me/workspace/skills")).toBe("/Users/me/workspace");
    expect(inferProjectDirectory("relative/.claude/skills")).toBeUndefined();
  });

  it("derives project directories from Windows absolute paths", () => {
    expect(inferProjectDirectory("C:\\Users\\me\\dev\\app\\.agents\\skills")).toBe("C:/Users/me/dev/app");
    expect(inferProjectDirectory("C:\\Users\\me\\workspace\\skills")).toBe("C:/Users/me/workspace");
    // Drive-letter parents (C:) are bounded like the POSIX "/" root:
    // inferProjectDirectory("/custom/root", "/agent") is undefined too.
    expect(inferProjectDirectory("C:\\custom\\root", "C:\\agent")).toBeUndefined();
    expect(inferProjectDirectory("C:\\custom\\root", "C:")).toBeUndefined();
    // POSIX behavior must be unchanged: forward-slash separators, "/"-rooted.
    expect(inferProjectDirectory("/Users/me/dev/app/.claude/skills")).toBe("/Users/me/dev/app");
    expect(inferProjectDirectory("/custom/root", "/")).toBeUndefined();
  });

  it("uses full-mode fallback without mixing project records into agents", () => {
    const project = skill({
      id: "fallback-project",
      kind: "project/source-local",
      skillsRoot: "/Users/me/dev/app/.claude/skills",
      configRoot: "/Users/me/dev/app/.claude",
      sourceSightings: [],
    });
    expect(createAgentSkillProjection([project]).skillCount).toBe(0);
    expect(createProjectSkillProjection([project]).groups[0]?.directory).toBe("/Users/me/dev/app");
  });

  it("falls back to a bounded config-root parent for markerless projects", () => {
    expect(
      inferProjectDirectory(
        "/Users/me/dev/app/custom-skill-root",
        "/Users/me/dev/app/tool-config",
      ),
    ).toBe("/Users/me/dev/app");
    expect(inferProjectDirectory("/custom/root", "/")).toBeUndefined();
    expect(inferProjectDirectory("/custom/root", "/agent")).toBeUndefined();
    expect(inferProjectDirectory("", "")).toBeUndefined();

    const project = skill({
      id: "markerless-project",
      kind: "project/source-local",
      skillsRoot: "/Users/me/dev/app/custom-skill-root",
      configRoot: "/Users/me/dev/app/tool-config",
      sourceSightings: [],
    });
    expect(createProjectSkillProjection([project]).groups[0]?.directory).toBe("/Users/me/dev/app");
  });
});
