export type SkillKind =
  | "user/global-config"
  | "app-bundled"
  | "app-runtime"
  | "plugin/cache/vendor"
  | "installed-package/source-dependency"
  | "project/source-local"
  | "backup/temp/fixture"
  | "other";

export type SkillRecordType = "skill" | "document";
export type LinkStatus = "healthy" | "broken";
export type ScanMode = "official" | "full";
export type OfficialSourceScope = "user" | "project" | "admin";
export interface OfficialSourceOwner {
  id: string;
  name: string;
  type: "agent" | "shared";
}

export interface OfficialSharedSource {
  id: "shared";
  name: "공유 디렉터리";
  globalPaths: string[];
  projectPaths: string[];
}

export interface SkillSourceSighting {
  rootPath: string;
  path: string;
  scope: OfficialSourceScope;
  owner: OfficialSourceOwner;
}

export interface OfficialAgentSource {
  id: string;
  name: string;
  documentationUrl: string;
  globalPaths: string[];
  projectPaths: string[];
}

export interface OfficialSourceRoot {
  id: string;
  path: string;
  canonicalPath?: string;
  scope: OfficialSourceScope;
  owner: OfficialSourceOwner;
  exists: boolean;
  skillCount: number;
}

export interface OfficialSourceSummary {
  shared: OfficialSharedSource;
  agents: OfficialAgentSource[];
  roots: OfficialSourceRoot[];
}

export interface SkillRecord {
  id: string;
  name: string;
  description: string;
  path: string;
  fileName: string;
  recordType: SkillRecordType;
  skillsRoot: string;
  configRoot: string;
  agent: string;
  kind: SkillKind;
  modifiedAt: string;
  size: number;
  device: number;
  inode: number;
  sourceSightings: SkillSourceSighting[];
}

export interface SkillLink {
  id: string;
  path: string;
  target: string;
  configRoot: string;
  agent: string;
  status: LinkStatus;
  containsSkill: boolean;
}

export interface ScanError {
  path: string;
  code: string;
  message: string;
}

export interface InventoryRoot {
  configRoot: string;
  agent: string;
  skillCount: number;
  documentCount: number;
  healthyLinks: number;
  brokenLinks: number;
}

export interface InventoryStats {
  matchedFiles: number;
  skillDefinitions: number;
  documents: number;
  uniqueNames: number;
  configRoots: number;
  healthyLinks: number;
  brokenLinks: number;
  errorCount: number;
}

export interface InventorySnapshot {
  scanMode: ScanMode;
  officialSources: OfficialSourceSummary;
  generatedAt: string;
  durationMs: number;
  searchRoots: string[];
  skills: SkillRecord[];
  links: SkillLink[];
  roots: InventoryRoot[];
  errors: {
    count: number;
    samples: ScanError[];
  };
  stats: InventoryStats;
}

export interface SkillContent {
  id: string;
  path: string;
  markdown: string;
  html: string;
}
