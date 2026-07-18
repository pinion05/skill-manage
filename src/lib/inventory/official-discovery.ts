import { createHash } from "node:crypto";
import { lstat, opendir, realpath, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  matchOfficialRoot,
  resolveOfficialRegistry,
  type OfficialRootMatch,
  type ResolvedOfficialRegistry,
} from "./official-sources";
import { scanInventory } from "./scanner";
import type {
  InventoryRoot,
  InventorySnapshot,
  InventoryStats,
  OfficialSourceRoot,
  ScanError,
  SkillLink,
  SkillRecord,
  SkillSourceSighting,
} from "./types";

type Environment = Readonly<Record<string, string | undefined>>;

export interface OfficialDiscoveryOptions {
  home?: string;
  environment?: Environment;
  concurrency?: number;
  maxDirectories?: number;
  maxErrorSamples?: number;
}

export interface OfficialScanOptions extends Omit<OfficialDiscoveryOptions, "maxDirectories"> {
  discoveryMaxDirectories?: number;
  maxLinkTargetDirectories?: number;
}

export interface OfficialRootDiscovery {
  registry: ResolvedOfficialRegistry;
  roots: OfficialSourceRoot[];
  errors: {
    count: number;
    samples: ScanError[];
  };
}

const DEFAULT_DISCOVERY_CONCURRENCY = 12;
const DEFAULT_MAX_DIRECTORIES = 250_000;
const DEFAULT_MAX_ERROR_SAMPLES = 100;
const WORKSPACE_MARKERS = new Set([".git", "package.json", "pyproject.toml", "Cargo.toml", "go.mod"]);
const PRUNED_DIRECTORY_NAMES = new Set([
  ".git",
  "node_modules",
  ".venv",
  "venv",
  "vendor",
  "dist",
  "build",
  "target",
  ".next",
  ".astro",
  ".cache",
  ".Trash",
  "vendor_imports",
]);

const SAFE_ERROR_MESSAGES: Record<string, string> = {
  EACCES: "접근 권한이 없습니다.",
  EPERM: "운영체제가 접근을 허용하지 않았습니다.",
  ENOENT: "검색 중 경로가 사라졌습니다.",
  ENOTDIR: "검색 중 디렉터리 구조가 바뀌었습니다.",
  ELOOP: "심볼릭 링크 순환을 감지했습니다.",
  OFFICIAL_DISCOVERY_LIMIT: "공식 프로젝트 경로 검색 한도에 도달했습니다.",
  NOT_DIRECTORY: "공식 Skill root가 디렉터리가 아닙니다.",
};

function stableId(value: string): string {
  return createHash("sha256").update(path.normalize(value)).digest("hex").slice(0, 16);
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function isWithin(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function sourceRoot(
  rootPath: string,
  match: OfficialRootMatch,
  exists = false,
): OfficialSourceRoot {
  return {
    id: stableId(`${match.scope}:${rootPath}`),
    path: path.resolve(rootPath),
    scope: match.scope,
    kinds: [...match.kinds],
    agents: [...match.agents],
    exists,
    skillCount: 0,
  };
}

function mergeRoot(target: OfficialSourceRoot, match: OfficialRootMatch): void {
  target.kinds = unique([...target.kinds, ...match.kinds]);
  target.agents = unique([...target.agents, ...match.agents]);
}

function errorDetails(error: unknown, errorPath: string): ScanError {
  const candidate = error as NodeJS.ErrnoException;
  const code = candidate.code ?? "UNKNOWN";
  return {
    path: errorPath,
    code,
    message: SAFE_ERROR_MESSAGES[code] ?? "공식 Skill 경로를 읽지 못했습니다.",
  };
}

function sessionAndCacheRoots(home: string, environment: Environment): string[] {
  const claudeHome = path.resolve(environment.CLAUDE_CONFIG_DIR || path.join(home, ".claude"));
  const codexHome = path.resolve(environment.CODEX_HOME || path.join(home, ".codex"));
  const hermesHome = path.resolve(environment.HERMES_HOME || path.join(home, ".hermes"));
  const piHome = path.resolve(environment.PI_CODING_AGENT_DIR || path.join(home, ".pi", "agent"));
  return [
    path.join(claudeHome, "projects"),
    path.join(codexHome, "sessions"),
    path.join(hermesHome, "sessions"),
    path.join(piHome, "sessions"),
    path.join(home, ".qwen", "tmp"),
    path.join(home, ".local", "share", "opencode"),
    path.join(home, ".codex", ".tmp"),
    path.join(home, ".codex", "vendor_imports"),
    path.join(home, ".omx", "backups"),
    path.join(home, ".zcode", "cli", "plugins", "cache"),
    path.join(home, ".zcode", "cli", "plugins", "marketplaces"),
    path.join(home, ".vscode", "extensions"),
    path.join(home, "Library", "Application Support"),
    path.join(home, "Library", "Caches"),
    path.join(home, ".npm", "_cacache"),
    path.join(home, ".bun", "install", "cache"),
  ].map((rootPath) => path.resolve(rootPath));
}

function shouldPrune(
  candidatePath: string,
  name: string,
  excludedRoots: string[],
): boolean {
  if (PRUNED_DIRECTORY_NAMES.has(name)) return true;
  return excludedRoots.some((excludedRoot) => isWithin(excludedRoot, candidatePath));
}

async function mapWithConcurrency<T>(
  values: T[],
  concurrency: number,
  operation: (value: T) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      await operation(values[index]!);
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, values.length || 1)) }, () => worker()),
  );
}

export async function discoverOfficialRoots(
  options: OfficialDiscoveryOptions = {},
): Promise<OfficialRootDiscovery> {
  const home = path.resolve(options.home ?? os.homedir());
  const environment = options.environment ?? process.env;
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_DISCOVERY_CONCURRENCY);
  const maxDirectories = Math.max(1, options.maxDirectories ?? DEFAULT_MAX_DIRECTORIES);
  const maxErrorSamples = Math.max(0, options.maxErrorSamples ?? DEFAULT_MAX_ERROR_SAMPLES);
  const registry = resolveOfficialRegistry(home, environment);
  const roots = new Map<string, OfficialSourceRoot>();
  const errorSamples: ScanError[] = [];
  let errorCount = 0;
  let limitRecorded = false;

  const recordError = (error: unknown, errorPath: string): void => {
    errorCount += 1;
    if (errorSamples.length < maxErrorSamples) errorSamples.push(errorDetails(error, errorPath));
  };
  const recordLimit = (): void => {
    if (limitRecorded) return;
    limitRecorded = true;
    recordError(
      Object.assign(new Error(SAFE_ERROR_MESSAGES.OFFICIAL_DISCOVERY_LIMIT), {
        code: "OFFICIAL_DISCOVERY_LIMIT",
      }),
      home,
    );
  };
  const addRoot = (rootPath: string, match: OfficialRootMatch): OfficialSourceRoot => {
    const normalizedPath = path.resolve(rootPath);
    const key = `${match.scope}:${normalizedPath}`;
    const existing = roots.get(key);
    if (existing) {
      mergeRoot(existing, match);
      return existing;
    }
    const created = sourceRoot(normalizedPath, match);
    roots.set(key, created);
    return created;
  };

  for (const candidate of registry.globalRoots) {
    addRoot(candidate.path, candidate);
  }

  const excludedRoots = sessionAndCacheRoots(home, environment);
  const queue = [home];
  let pending = 1;
  let discoveredDirectories = 1;
  const waiters: Array<() => void> = [];
  const wake = (): void => waiters.shift()?.();
  const wakeAll = (): void => {
    while (waiters.length > 0) wake();
  };
  const enqueue = (directoryPath: string): void => {
    if (discoveredDirectories >= maxDirectories) {
      recordLimit();
      return;
    }
    discoveredDirectories += 1;
    pending += 1;
    queue.push(directoryPath);
    wake();
  };
  const take = async (): Promise<string | undefined> => {
    while (queue.length === 0) {
      if (pending === 0) return undefined;
      await new Promise<void>((resolve) => waiters.push(resolve));
    }
    return queue.shift();
  };

  const processDirectory = async (directoryPath: string): Promise<void> => {
    try {
      const directory = await opendir(directoryPath);
      const entries = [];
      for await (const entry of directory) entries.push(entry);
      const entryNames = new Set(entries.map(({ name }) => name));
      const workspaceMarker = [...WORKSPACE_MARKERS].some((marker) => entryNames.has(marker));

      for (const entry of entries) {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
        const entryPath = path.join(directoryPath, entry.name);
        if (shouldPrune(entryPath, entry.name, excludedRoots)) continue;

        const match = matchOfficialRoot(entryPath, registry, { workspaceMarker });
        if (match) {
          addRoot(entryPath, match);
          continue;
        }
        if (entry.isDirectory()) enqueue(entryPath);
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") recordError(error, directoryPath);
    } finally {
      pending -= 1;
      if (pending === 0) wakeAll();
    }
  };

  const worker = async (): Promise<void> => {
    while (true) {
      const directoryPath = await take();
      if (!directoryPath) return;
      await processDirectory(directoryPath);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const rootList = [...roots.values()];
  await mapWithConcurrency(rootList, concurrency, async (root) => {
    try {
      const lexicalStat = await lstat(root.path);
      if (!lexicalStat.isDirectory() && !lexicalStat.isSymbolicLink()) {
        recordError(Object.assign(new Error("Not a directory"), { code: "NOT_DIRECTORY" }), root.path);
        return;
      }
      const canonicalPath = await realpath(root.path);
      const canonicalStat = await stat(canonicalPath);
      if (!canonicalStat.isDirectory()) {
        recordError(Object.assign(new Error("Not a directory"), { code: "NOT_DIRECTORY" }), root.path);
        return;
      }
      root.exists = true;
      root.canonicalPath = canonicalPath;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") recordError(error, root.path);
    }
  });

  rootList.sort((left, right) => left.path.localeCompare(right.path));
  return {
    registry,
    roots: rootList,
    errors: { count: errorCount, samples: errorSamples },
  };
}

function sightingKey(sighting: SkillSourceSighting): string {
  return `${sighting.scope}:${sighting.rootPath}:${sighting.path}:${sighting.agents.join("\0")}:${sighting.kinds.join("\0")}`;
}

function dedupeSightings(sightings: SkillSourceSighting[]): SkillSourceSighting[] {
  const seen = new Set<string>();
  return sightings.filter((sighting) => {
    const key = sightingKey(sighting);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function rootSightingsForPath(
  filePath: string,
  roots: OfficialSourceRoot[],
): SkillSourceSighting[] {
  const sightings: SkillSourceSighting[] = [];
  for (const root of roots) {
    if (!root.exists || !root.canonicalPath || !isWithin(root.canonicalPath, filePath)) continue;
    const relative = path.relative(root.canonicalPath, filePath);
    sightings.push({
      rootPath: root.path,
      path: path.join(root.path, relative),
      scope: root.scope,
      kinds: [...root.kinds],
      agents: [...root.agents],
    });
  }
  return sightings;
}

async function fileAliasPaths(record: SkillRecord, links: SkillLink[]): Promise<string[]> {
  const aliases = [record.path];
  try {
    const physicalPath = await realpath(record.path);
    for (const link of links) {
      if (link.status !== "healthy" || !isWithin(link.target, physicalPath)) continue;
      aliases.push(path.join(link.path, path.relative(link.target, physicalPath)));
    }
  } catch {
    // The opened-handle identity remains authoritative; alias metadata may race away.
  }
  return unique(aliases);
}

function createRootSummary(skills: SkillRecord[], links: SkillLink[]): InventoryRoot[] {
  const summaries = new Map<string, InventoryRoot>();
  const ensure = (configRoot: string, agent: string): InventoryRoot => {
    const existing = summaries.get(configRoot);
    if (existing) return existing;
    const created: InventoryRoot = {
      configRoot,
      agent,
      skillCount: 0,
      documentCount: 0,
      healthyLinks: 0,
      brokenLinks: 0,
    };
    summaries.set(configRoot, created);
    return created;
  };
  for (const skill of skills) {
    const summary = ensure(skill.configRoot, skill.agent);
    if (skill.recordType === "skill") summary.skillCount += 1;
    else summary.documentCount += 1;
  }
  for (const link of links) {
    const summary = ensure(link.configRoot, link.agent);
    if (link.status === "healthy") summary.healthyLinks += 1;
    else summary.brokenLinks += 1;
  }
  return [...summaries.values()].sort((left, right) => {
    const leftTotal = left.skillCount + left.documentCount + left.healthyLinks + left.brokenLinks;
    const rightTotal = right.skillCount + right.documentCount + right.healthyLinks + right.brokenLinks;
    return rightTotal - leftTotal || left.configRoot.localeCompare(right.configRoot);
  });
}

function createStats(
  skills: SkillRecord[],
  links: SkillLink[],
  roots: InventoryRoot[],
  errorCount: number,
): InventoryStats {
  const skillDefinitions = skills.filter(({ recordType }) => recordType === "skill").length;
  return {
    matchedFiles: skills.length,
    skillDefinitions,
    documents: skills.length - skillDefinitions,
    uniqueNames: new Set(skills.map(({ name }) => name.toLocaleLowerCase())).size,
    configRoots: roots.length,
    healthyLinks: links.filter(({ status }) => status === "healthy").length,
    brokenLinks: links.filter(({ status }) => status === "broken").length,
    errorCount,
  };
}

async function dedupeOfficialSkills(
  records: SkillRecord[],
  links: SkillLink[],
  roots: OfficialSourceRoot[],
): Promise<SkillRecord[]> {
  const deduped = new Map<string, SkillRecord>();
  for (const record of records) {
    const aliases = await fileAliasPaths(record, links);
    const sightings = dedupeSightings(aliases.flatMap((aliasPath) => rootSightingsForPath(aliasPath, roots)));
    const identity = `${record.device}:${record.inode}`;
    const existing = deduped.get(identity);
    if (existing) {
      existing.sourceSightings = dedupeSightings([...existing.sourceSightings, ...sightings]);
      continue;
    }
    const primary = sightings[0];
    deduped.set(identity, {
      ...record,
      skillsRoot: primary?.rootPath ?? record.skillsRoot,
      configRoot: primary ? path.dirname(primary.rootPath) : record.configRoot,
      agent: primary
        ? primary.agents.length === 1
          ? primary.agents[0]!
          : "Shared official skills"
        : record.agent,
      kind: primary?.scope === "project" ? "project/source-local" : record.kind,
      sourceSightings: sightings,
    });
  }
  return [...deduped.values()].sort((left, right) => left.path.localeCompare(right.path));
}

function setOfficialRootCounts(roots: OfficialSourceRoot[], skills: SkillRecord[]): void {
  for (const root of roots) {
    root.skillCount = skills.filter((skill) =>
      skill.sourceSightings.some((sighting) => sighting.rootPath === root.path),
    ).length;
  }
}

export async function scanOfficialInventory(
  options: OfficialScanOptions = {},
): Promise<InventorySnapshot> {
  const startedAt = performance.now();
  const home = path.resolve(options.home ?? os.homedir());
  const discovery = await discoverOfficialRoots({
    home,
    environment: options.environment,
    concurrency: options.concurrency,
    maxDirectories: options.discoveryMaxDirectories,
    maxErrorSamples: options.maxErrorSamples,
  });
  const searchRoots = unique(
    discovery.roots.flatMap((root) => (root.exists && root.canonicalPath ? [root.canonicalPath] : [])),
  );
  const base = await scanInventory({
    roots: searchRoots,
    home,
    concurrency: options.concurrency ?? DEFAULT_DISCOVERY_CONCURRENCY,
    maxErrorSamples: options.maxErrorSamples ?? DEFAULT_MAX_ERROR_SAMPLES,
    maxLinkTargetDirectories: options.maxLinkTargetDirectories ?? 10_000,
    followDirectoryLinks: true,
  });
  const skills = await dedupeOfficialSkills(base.skills, base.links, discovery.roots);
  setOfficialRootCounts(discovery.roots, skills);
  const roots = createRootSummary(skills, base.links);
  const errorCount = base.errors.count + discovery.errors.count;
  const maxErrorSamples = options.maxErrorSamples ?? DEFAULT_MAX_ERROR_SAMPLES;
  const errorSamples = [...discovery.errors.samples, ...base.errors.samples].slice(0, maxErrorSamples);

  return {
    ...base,
    scanMode: "official",
    officialSources: { agents: discovery.registry.agents, roots: discovery.roots },
    generatedAt: new Date().toISOString(),
    durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    searchRoots,
    skills,
    roots,
    errors: { count: errorCount, samples: errorSamples },
    stats: createStats(skills, base.links, roots, errorCount),
  };
}

async function workspaceMarkerForRoot(rootPath: string): Promise<boolean> {
  const parent = path.dirname(rootPath);
  try {
    const directory = await opendir(parent);
    for await (const entry of directory) {
      if (WORKSPACE_MARKERS.has(entry.name)) return true;
    }
  } catch {
    // A missing marker is safe: generic workspace/skills is not classified as official.
  }
  return false;
}

export async function annotateFullInventory(
  snapshot: InventorySnapshot,
  options: Pick<OfficialDiscoveryOptions, "home" | "environment" | "concurrency" | "maxErrorSamples"> = {},
): Promise<InventorySnapshot> {
  const home = path.resolve(options.home ?? os.homedir());
  const environment = options.environment ?? process.env;
  const registry = resolveOfficialRegistry(home, environment);
  const roots = new Map<string, OfficialSourceRoot>();

  for (const candidate of registry.globalRoots) {
    roots.set(`${candidate.scope}:${candidate.path}`, sourceRoot(candidate.path, candidate));
  }

  const skills: SkillRecord[] = [];
  for (const record of snapshot.skills) {
    const workspaceMarker = await workspaceMarkerForRoot(record.skillsRoot);
    const match = matchOfficialRoot(record.skillsRoot, registry, { workspaceMarker });
    if (!match) {
      skills.push({ ...record, sourceSightings: [] });
      continue;
    }
    const key = `${match.scope}:${path.resolve(record.skillsRoot)}`;
    const root = roots.get(key) ?? sourceRoot(record.skillsRoot, match, true);
    root.exists = true;
    root.canonicalPath = await realpath(record.skillsRoot).catch(() => path.resolve(record.skillsRoot));
    mergeRoot(root, match);
    roots.set(key, root);
    skills.push({
      ...record,
      sourceSightings: [
        {
          rootPath: root.path,
          path: record.path,
          scope: root.scope,
          kinds: [...root.kinds],
          agents: [...root.agents],
        },
      ],
    });
  }

  const rootList = [...roots.values()];
  await mapWithConcurrency(
    rootList.filter(({ exists }) => !exists),
    options.concurrency ?? DEFAULT_DISCOVERY_CONCURRENCY,
    async (root) => {
      try {
        const canonicalPath = await realpath(root.path);
        const rootStat = await stat(canonicalPath);
        if (rootStat.isDirectory()) {
          root.exists = true;
          root.canonicalPath = canonicalPath;
        }
      } catch {
        // Missing global roots remain visible as documented but not installed.
      }
    },
  );
  setOfficialRootCounts(rootList, skills);
  rootList.sort((left, right) => left.path.localeCompare(right.path));

  return {
    ...snapshot,
    scanMode: "full",
    skills,
    officialSources: { agents: registry.agents, roots: rootList },
  };
}
