import { createHash } from "node:crypto";
import { access, lstat, opendir, readFile, readlink, realpath, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import matter from "gray-matter";
import { classifyPath, findSkillsRoot, inferAgentLabel, inferConfigRoot } from "./classify";
import type {
  InventoryRoot,
  InventorySnapshot,
  ScanError,
  SkillLink,
  SkillRecord,
} from "./types";

export interface ScanOptions {
  roots: string[];
  home: string;
  concurrency: number;
  maxErrorSamples: number;
}

const SKILL_FILE = "skill.md";
const SKILLS_DOCUMENT = "skills.md";

export function defaultScanOptions(home = os.homedir()): ScanOptions {
  return {
    roots: [home, "/Applications", "/Library", "/usr/local", "/opt/homebrew"],
    home,
    concurrency: 12,
    maxErrorSamples: 100,
  };
}

function stableId(value: string): string {
  return createHash("sha256").update(path.normalize(value)).digest("hex").slice(0, 16);
}

function isCandidateFile(name: string): boolean {
  const lower = name.toLowerCase();
  return lower === SKILL_FILE || lower === SKILLS_DOCUMENT;
}

function isSkillLink(linkPath: string): boolean {
  const parts = path.normalize(linkPath).split(path.sep).map((part) => part.toLowerCase());
  return parts.includes("skills");
}

function shouldExclude(directoryPath: string, name: string): boolean {
  if ([".git", ".cache", ".Trash"].includes(name)) return true;
  const candidate = path.join(directoryPath, name);
  const segments = path.normalize(candidate).split(path.sep);
  const joined = segments.join("/");
  return (
    joined.includes("/Library/Caches/") ||
    joined.endsWith("/Library/Caches") ||
    joined.includes("/.npm/_cacache/") ||
    joined.endsWith("/.npm/_cacache") ||
    joined.includes("/.bun/install/cache/") ||
    joined.endsWith("/.bun/install/cache")
  );
}

function errorDetails(error: unknown, errorPath: string): ScanError {
  const candidate = error as NodeJS.ErrnoException;
  return {
    path: errorPath,
    code: candidate.code ?? "UNKNOWN",
    message: candidate.message ?? String(error),
  };
}

async function targetContainsSkill(target: string, depth = 0): Promise<boolean> {
  try {
    const targetStat = await stat(target);
    if (targetStat.isFile()) return path.basename(target).toLowerCase() === SKILL_FILE;
    if (!targetStat.isDirectory() || depth > 3) return false;

    const directory = await opendir(target);
    const childDirectories: string[] = [];
    for await (const entry of directory) {
      if (entry.isFile() && entry.name.toLowerCase() === SKILL_FILE) return true;
      if (entry.isDirectory() && depth < 3 && !shouldExclude(target, entry.name)) {
        childDirectories.push(path.join(target, entry.name));
      }
    }
    for (const child of childDirectories) {
      if (await targetContainsSkill(child, depth + 1)) return true;
    }
  } catch {
    return false;
  }
  return false;
}

async function existingDirectories(roots: string[]): Promise<string[]> {
  const existing: string[] = [];
  for (const root of [...new Set(roots.map((item) => path.resolve(item)))]) {
    try {
      await access(root);
      const rootStat = await lstat(root);
      if (rootStat.isDirectory()) existing.push(root);
    } catch {
      // Default roots are optional and may not exist on every machine.
    }
  }
  return existing;
}

function createRootSummary(skills: SkillRecord[], links: SkillLink[]): InventoryRoot[] {
  const roots = new Map<string, InventoryRoot>();
  const ensure = (configRoot: string, agent: string): InventoryRoot => {
    const current = roots.get(configRoot);
    if (current) return current;
    const created: InventoryRoot = {
      configRoot,
      agent,
      skillCount: 0,
      documentCount: 0,
      healthyLinks: 0,
      brokenLinks: 0,
    };
    roots.set(configRoot, created);
    return created;
  };

  for (const skill of skills) {
    const root = ensure(skill.configRoot, skill.agent);
    if (skill.recordType === "skill") root.skillCount += 1;
    else root.documentCount += 1;
  }
  for (const link of links) {
    const root = ensure(link.configRoot, link.agent);
    if (link.status === "healthy") root.healthyLinks += 1;
    else root.brokenLinks += 1;
  }

  return [...roots.values()].sort((a, b) => {
    const totalA = a.skillCount + a.documentCount + a.healthyLinks + a.brokenLinks;
    const totalB = b.skillCount + b.documentCount + b.healthyLinks + b.brokenLinks;
    return totalB - totalA || a.configRoot.localeCompare(b.configRoot);
  });
}

export async function scanInventory(overrides: Partial<ScanOptions> = {}): Promise<InventorySnapshot> {
  const defaults = defaultScanOptions(overrides.home);
  const options: ScanOptions = { ...defaults, ...overrides };
  const startedAt = performance.now();
  const searchRoots = await existingDirectories(options.roots);
  const skills: SkillRecord[] = [];
  const links: SkillLink[] = [];
  const errorSamples: ScanError[] = [];
  let errorCount = 0;

  const recordError = (error: unknown, errorPath: string): void => {
    errorCount += 1;
    if (errorSamples.length < options.maxErrorSamples) {
      errorSamples.push(errorDetails(error, errorPath));
    }
  };

  const inspectSkill = async (filePath: string, fileName: string): Promise<void> => {
    try {
      const [source, fileStat] = await Promise.all([readFile(filePath, "utf8"), stat(filePath)]);
      let name = path.basename(path.dirname(filePath));
      let description = "";
      try {
        const parsed = matter(source);
        if (typeof parsed.data.name === "string" && parsed.data.name.trim()) {
          name = parsed.data.name.trim();
        }
        if (typeof parsed.data.description === "string") {
          description = parsed.data.description.trim();
        }
      } catch (error) {
        recordError(error, filePath);
      }

      const configRoot = inferConfigRoot(filePath, options.home);
      skills.push({
        id: stableId(filePath),
        name,
        description,
        path: filePath,
        fileName,
        recordType: fileName.toLowerCase() === SKILL_FILE ? "skill" : "document",
        skillsRoot: findSkillsRoot(filePath),
        configRoot,
        agent: inferAgentLabel(configRoot, options.home),
        kind: classifyPath(filePath, options.home),
        modifiedAt: fileStat.mtime.toISOString(),
        size: fileStat.size,
      });
    } catch (error) {
      recordError(error, filePath);
    }
  };

  const inspectLink = async (linkPath: string): Promise<void> => {
    try {
      const rawTarget = await readlink(linkPath);
      const resolvedTarget = path.resolve(path.dirname(linkPath), rawTarget);
      let target = resolvedTarget;
      let status: SkillLink["status"] = "broken";
      try {
        target = await realpath(resolvedTarget);
        await stat(target);
        status = "healthy";
      } catch {
        status = "broken";
      }
      const configRoot = inferConfigRoot(linkPath, options.home);
      links.push({
        id: stableId(linkPath),
        path: linkPath,
        target,
        configRoot,
        agent: inferAgentLabel(configRoot, options.home),
        status,
        containsSkill: status === "healthy" ? await targetContainsSkill(target) : false,
      });
    } catch (error) {
      recordError(error, linkPath);
    }
  };

  const queue = [...searchRoots];
  let pending = queue.length;
  const waiters: Array<() => void> = [];
  const wake = (): void => {
    const waiter = waiters.shift();
    waiter?.();
  };
  const wakeAll = (): void => {
    while (waiters.length) wake();
  };
  const enqueue = (directory: string): void => {
    queue.push(directory);
    pending += 1;
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
      for await (const entry of directory) {
        const entryPath = path.join(directoryPath, entry.name);
        if (entry.isSymbolicLink()) {
          if (isSkillLink(entryPath)) await inspectLink(entryPath);
          continue;
        }
        if (entry.isDirectory()) {
          if (!shouldExclude(directoryPath, entry.name)) enqueue(entryPath);
          continue;
        }
        if (entry.isFile() && isCandidateFile(entry.name)) {
          await inspectSkill(entryPath, entry.name);
        }
      }
    } catch (error) {
      recordError(error, directoryPath);
    } finally {
      pending -= 1;
      if (pending === 0) wakeAll();
    }
  };

  const worker = async (): Promise<void> => {
    while (true) {
      const directory = await take();
      if (!directory) return;
      await processDirectory(directory);
    }
  };

  if (pending > 0) {
    await Promise.all(
      Array.from({ length: Math.max(1, Math.min(options.concurrency, pending)) }, () => worker()),
    );
  }

  skills.sort((a, b) => a.path.localeCompare(b.path));
  links.sort((a, b) => a.path.localeCompare(b.path));
  const roots = createRootSummary(skills, links);
  const skillDefinitions = skills.filter((skill) => skill.recordType === "skill").length;
  const documents = skills.length - skillDefinitions;

  return {
    generatedAt: new Date().toISOString(),
    durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    searchRoots,
    skills,
    links,
    roots,
    errors: { count: errorCount, samples: errorSamples },
    stats: {
      matchedFiles: skills.length,
      skillDefinitions,
      documents,
      uniqueNames: new Set(skills.map((skill) => skill.name.toLocaleLowerCase())).size,
      configRoots: roots.length,
      healthyLinks: links.filter((link) => link.status === "healthy").length,
      brokenLinks: links.filter((link) => link.status === "broken").length,
      errorCount,
    },
  };
}
