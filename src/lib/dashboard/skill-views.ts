import type { OfficialSourceOwner, SkillRecord } from "../inventory/types";

export interface SkillViewAlias {
  path: string;
  owner: OfficialSourceOwner;
}

export interface AgentSkillEntry {
  skill: SkillRecord;
  aliases: SkillViewAlias[];
}

export interface AgentSkillGroup {
  owner: OfficialSourceOwner;
  skills: AgentSkillEntry[];
}

export interface AgentSkillProjection {
  groups: AgentSkillGroup[];
  skillCount: number;
}

export interface ProjectSkillEntry {
  skill: SkillRecord;
  owners: OfficialSourceOwner[];
  aliases: SkillViewAlias[];
}

export interface ProjectSkillGroup {
  directory: string;
  ownerCount: number;
  skills: ProjectSkillEntry[];
}

export interface ProjectSkillProjection {
  groups: ProjectSkillGroup[];
  skillCount: number;
}

const PROJECT_MARKERS = new Set([
  ".agent", ".agents", ".claude", ".cline", ".clinerules", ".codex", ".copilot",
  ".crush", ".cursor", ".factory", ".gemini", ".github", ".goose", ".grok",
  ".jcode", ".kilo", ".kimi-code", ".kiro", ".mimocode", ".mux", ".opencode",
  ".pi", ".qwen", ".roo", ".warp", ".zcode",
]);

const SHARED_OWNER: OfficialSourceOwner = {
  id: "shared",
  name: "공유 디렉터리",
  type: "shared",
};

function compareText(left: string, right: string): number {
  const comparison = left.localeCompare(right, "ko", { numeric: true, sensitivity: "base" });
  if (comparison !== 0) return comparison;
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareSkills(left: SkillRecord, right: SkillRecord): number {
  const leftName = left.name.normalize("NFKC").trim().toLocaleLowerCase();
  const rightName = right.name.normalize("NFKC").trim().toLocaleLowerCase();
  return (
    compareText(leftName, rightName) ||
    compareText(left.path, right.path) ||
    compareText(left.id, right.id)
  );
}

function compareOwners(left: OfficialSourceOwner, right: OfficialSourceOwner): number {
  return compareText(left.name, right.name) || compareText(left.id, right.id);
}

function fallbackOwner(agent: string): OfficialSourceOwner {
  const name = agent.normalize("NFKC").trim();
  if (name === "Shared agent skills" || name === "공유 디렉터리") return SHARED_OWNER;
  return {
    id: `fallback:${name.toLocaleLowerCase()}`,
    name,
    type: "agent",
  };
}

function physicalKey(record: SkillRecord): string {
  return `${record.device}:${record.inode}`;
}

function sortAliases(aliases: SkillViewAlias[]): SkillViewAlias[] {
  return aliases.toSorted(
    (left, right) => compareOwners(left.owner, right.owner) || compareText(left.path, right.path),
  );
}

export function inferProjectDirectory(
  skillsRoot: string,
  configRoot?: string,
): string | undefined {
  for (const candidate of [skillsRoot, configRoot]) {
    if (!candidate?.startsWith("/")) continue;
    const parts = candidate.replace(/\/+$/, "").split("/");
    const markerIndex = parts.findLastIndex((part) => PROJECT_MARKERS.has(part));
    if (markerIndex > 1) return parts.slice(0, markerIndex).join("/");
    if (parts.at(-1) === "skills" && parts.length > 2) return parts.slice(0, -1).join("/");
  }

  const normalizedConfigRoot = configRoot?.replace(/\/+$/, "");
  if (!normalizedConfigRoot?.startsWith("/")) return undefined;
  const separatorIndex = normalizedConfigRoot.lastIndexOf("/");
  if (separatorIndex <= 0) return undefined;
  const parent = normalizedConfigRoot.slice(0, separatorIndex);
  return parent === "/" ? undefined : parent;
}

export function createAgentSkillProjection(records: SkillRecord[]): AgentSkillProjection {
  const entries = new Map<string, AgentSkillEntry>();
  const owners = new Map<string, OfficialSourceOwner>();
  const physicalSkills = new Set<string>();
  const aliasKeysByEntry = new Map<string, Set<string>>();

  for (const record of records) {
    if (record.recordType !== "skill") continue;
    const memberships = record.sourceSightings.length > 0
      ? record.sourceSightings
          .filter(({ scope }) => scope !== "project")
          .map(({ owner, path }) => ({ owner, path }))
      : record.kind === "project/source-local"
        ? []
        : [{ owner: fallbackOwner(record.agent), path: record.path }];

    for (const { owner, path } of memberships) {
      const identity = physicalKey(record);
      const entryKey = `${owner.id}\0${identity}`;
      let entry = entries.get(entryKey);
      if (!entry) {
        entry = { skill: record, aliases: [] };
        entries.set(entryKey, entry);
        aliasKeysByEntry.set(entryKey, new Set());
      }
      owners.set(owner.id, owner);
      physicalSkills.add(identity);

      const aliasKey = `${owner.id}\0${path}`;
      const aliasKeys = aliasKeysByEntry.get(entryKey)!;
      if (!aliasKeys.has(aliasKey)) {
        aliasKeys.add(aliasKey);
        entry.aliases.push({ owner, path });
      }
    }
  }

  const groups = [...owners.values()].map((owner) => ({
    owner,
    skills: [...entries.entries()]
      .filter(([key]) => key.startsWith(`${owner.id}\0`))
      .map(([, entry]) => ({ ...entry, aliases: sortAliases(entry.aliases) }))
      .toSorted((left, right) => compareSkills(left.skill, right.skill)),
  }));

  groups.sort((left, right) => {
    if (left.owner.id === "shared") return right.owner.id === "shared" ? 0 : -1;
    if (right.owner.id === "shared") return 1;
    return compareOwners(left.owner, right.owner);
  });

  return { groups, skillCount: physicalSkills.size };
}

export function createProjectSkillProjection(records: SkillRecord[]): ProjectSkillProjection {
  const entries = new Map<string, ProjectSkillEntry>();
  const aliasKeysByEntry = new Map<string, Set<string>>();
  const ownerIdsByEntry = new Map<string, Set<string>>();

  for (const record of records) {
    if (record.recordType !== "skill") continue;
    const memberships = record.sourceSightings.length > 0
      ? record.sourceSightings
          .filter(({ scope }) => scope === "project")
          .map(({ rootPath, path, owner }) => ({
            directory: inferProjectDirectory(rootPath),
            path,
            owner,
          }))
      : record.kind === "project/source-local"
        ? [{
            directory: inferProjectDirectory(record.skillsRoot, record.configRoot),
            path: record.path,
            owner: fallbackOwner(record.agent),
          }]
        : [];

    for (const membership of memberships) {
      if (!membership.directory) continue;
      const entryKey = `${membership.directory}\0${physicalKey(record)}`;
      let entry = entries.get(entryKey);
      if (!entry) {
        entry = { skill: record, owners: [], aliases: [] };
        entries.set(entryKey, entry);
        aliasKeysByEntry.set(entryKey, new Set());
        ownerIdsByEntry.set(entryKey, new Set());
      }

      const ownerIds = ownerIdsByEntry.get(entryKey)!;
      if (!ownerIds.has(membership.owner.id)) {
        ownerIds.add(membership.owner.id);
        entry.owners.push(membership.owner);
      }

      const aliasKey = `${membership.owner.id}\0${membership.path}`;
      const aliasKeys = aliasKeysByEntry.get(entryKey)!;
      if (!aliasKeys.has(aliasKey)) {
        aliasKeys.add(aliasKey);
        entry.aliases.push({ owner: membership.owner, path: membership.path });
      }
    }
  }

  const grouped = new Map<string, ProjectSkillEntry[]>();
  for (const [key, entry] of entries) {
    const directory = key.slice(0, key.indexOf("\0"));
    const skills = grouped.get(directory);
    const sortedEntry = {
      ...entry,
      owners: entry.owners.toSorted(compareOwners),
      aliases: sortAliases(entry.aliases),
    };
    if (skills) skills.push(sortedEntry);
    else grouped.set(directory, [sortedEntry]);
  }

  const groups = [...grouped.entries()]
    .map(([directory, skills]) => ({
      directory,
      ownerCount: new Set(skills.flatMap(({ owners }) => owners.map(({ id }) => id))).size,
      skills: skills.toSorted((left, right) => compareSkills(left.skill, right.skill)),
    }))
    .toSorted((left, right) => compareText(left.directory, right.directory));

  return { groups, skillCount: entries.size };
}
