import { describe, expect, it } from "vitest";
import type { SkillRecord } from "../inventory/types";
import { groupDuplicateSkills, normalizeSkillName } from "./duplicate-skills";

function skill(overrides: Partial<SkillRecord> = {}): SkillRecord {
  return {
    id: overrides.id ?? crypto.randomUUID(),
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

describe("groupDuplicateSkills", () => {
  it("groups normalized SKILL.md names and excludes documents and singletons", () => {
    const records = [
      skill({ id: "a", name: " Alpha ", path: "/z/SKILL.md" }),
      skill({ id: "b", name: "ＡLPHA", path: "/a/SKILL.md" }),
      skill({ id: "doc", name: "alpha", recordType: "document", fileName: "skills.md" }),
      skill({ id: "single", name: "beta", path: "/b/SKILL.md" }),
    ];

    expect(normalizeSkillName(" Ａlpha ")).toBe("alpha");
    expect(groupDuplicateSkills(records)).toEqual([
      {
        key: "alpha",
        name: "Alpha",
        installs: [records[1], records[0]],
      },
    ]);
  });

  it("uses code-point tie-breakers when base and numeric collation considers values equal", () => {
    const records = [
      skill({ id: "accent-2", name: "résumé", path: "/accent/2/SKILL.md" }),
      skill({ id: "accent-1", name: "RÉSUMÉ", path: "/accent/1/SKILL.md" }),
      skill({ id: "plain-2", name: "resume", path: "/plain/2/SKILL.md" }),
      skill({ id: "plain-02", name: "RESUME", path: "/plain/02/SKILL.md" }),
    ];

    const groups = groupDuplicateSkills(records);

    expect(groups.map((group) => group.key)).toEqual(["resume", "résumé"]);
    expect(groups[0]!.installs.map((record) => record.id)).toEqual(["plain-02", "plain-2"]);
  });

  it("sorts groups by name and does not mutate input order", () => {
    const records = [
      skill({ id: "z2", name: "zeta", path: "/z/2/SKILL.md" }),
      skill({ id: "a2", name: "alpha", path: "/a/2/SKILL.md" }),
      skill({ id: "z1", name: "ZETA", path: "/z/1/SKILL.md" }),
      skill({ id: "a1", name: "Alpha", path: "/a/1/SKILL.md" }),
    ];
    const originalIds = records.map((record) => record.id);

    const groups = groupDuplicateSkills(records);

    expect(groups.map((group) => group.key)).toEqual(["alpha", "zeta"]);
    expect(groups[0]!.installs.map((record) => record.id)).toEqual(["a1", "a2"]);
    expect(records.map((record) => record.id)).toEqual(originalIds);
  });
});
