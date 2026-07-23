import { describe, expect, it } from "vitest";
import type { SkillRecord } from "../inventory/types";
import { applySkillQuery, type DashboardQuery } from "./filter";

function skill(overrides: Partial<SkillRecord> = {}): SkillRecord {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    name: "alpha",
    description: "Primary browser skill",
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
    inode: 2,
    sourceSightings: [],
    contentsTokens: 0,
    descriptionTokens: 0,
    ...overrides,
  };
}

const baseQuery: DashboardQuery = {
  search: "",
  kinds: [],
  roots: [],
  sort: "name",
  direction: "asc",
};

describe("applySkillQuery", () => {
  it("searches name, description, agent, and absolute path case-insensitively", () => {
    const records = [
      skill({ name: "Alpha" }),
      skill({ name: "beta", description: "Spreadsheet helper", agent: "Gemini" }),
      skill({ name: "gamma", path: "/opt/UNIQUE/location/SKILL.md" }),
    ];

    expect(applySkillQuery(records, { ...baseQuery, search: "spreadsheet" }).map((x) => x.name)).toEqual([
      "beta",
    ]);
    expect(applySkillQuery(records, { ...baseQuery, search: "GEMINI" }).map((x) => x.name)).toEqual([
      "beta",
    ]);
    expect(applySkillQuery(records, { ...baseQuery, search: " unique " }).map((x) => x.name)).toEqual([
      "gamma",
    ]);
  });

  it("combines kind and root filters", () => {
    const records = [
      skill({ name: "alpha", configRoot: "/a", kind: "user/global-config" }),
      skill({ name: "beta", configRoot: "/a", kind: "app-bundled" }),
      skill({ name: "docs", configRoot: "/b", kind: "user/global-config" }),
    ];

    expect(
      applySkillQuery(records, {
        ...baseQuery,
        kinds: ["user/global-config"],
        roots: ["/a"],
      }).map((x) => x.name),
    ).toEqual(["alpha"]);
  });

  it("sorts without mutating the source array", () => {
    const records = [
      skill({ name: "zeta", path: "/b", modifiedAt: "2025-01-01T00:00:00.000Z" }),
      skill({ name: "Alpha", path: "/a", modifiedAt: "2026-01-01T00:00:00.000Z" }),
    ];
    const originalOrder = records.map((record) => record.name);

    expect(applySkillQuery(records, baseQuery).map((record) => record.name)).toEqual(["Alpha", "zeta"]);
    expect(
      applySkillQuery(records, { ...baseQuery, sort: "modified", direction: "desc" }).map(
        (record) => record.name,
      ),
    ).toEqual(["Alpha", "zeta"]);
    expect(records.map((record) => record.name)).toEqual(originalOrder);
  });
});
