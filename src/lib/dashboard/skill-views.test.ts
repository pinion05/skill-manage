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
});

describe("inferProjectDirectory", () => {
  it("derives marker and plain workspace project directories", () => {
    expect(inferProjectDirectory("/Users/me/dev/app/.agents/skills")).toBe("/Users/me/dev/app");
    expect(inferProjectDirectory("/Users/me/dev/app/.roo/skills-debug")).toBe("/Users/me/dev/app");
    expect(inferProjectDirectory("/Users/me/workspace/skills")).toBe("/Users/me/workspace");
    expect(inferProjectDirectory("relative/.claude/skills")).toBeUndefined();
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
});
