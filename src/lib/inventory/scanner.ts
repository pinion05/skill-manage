import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, lstat, open, opendir, readlink, realpath, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import matter from "gray-matter";
import { encode } from "gpt-tokenizer";
import { classifyPath, findSkillsRoot, inferAgentLabel, inferConfigRoot } from "./classify";
import type {
  InventoryRoot,
  InventorySnapshot,
  ScanError,
  SkillLink,
  SkillRecord,
} from "./types";

/** Estimate GPT-style token count for a string (cl100k_base, offline). */
function countTokens(text: string): number {
  if (!text) return 0;
  try {
    return encode(text).length;
  } catch {
    return 0;
  }
}

export interface ScanOptions {
  roots: string[];
  home: string;
  concurrency: number;
  maxErrorSamples: number;
  maxLinkTargetDirectories: number;
  maxDirectories: number;
  followDirectoryLinks: boolean;
}

const SKILL_FILE = "skill.md";
const SKILLS_DOCUMENT = "skills.md";
const MAX_FRONTMATTER_BYTES = 1024 * 1024;
const MAX_LINK_TARGET_DIRECTORIES = 10_000;
const MAX_SCAN_DIRECTORIES = 500_000;

export function defaultScanOptions(home = os.homedir()): ScanOptions {
  return {
    roots: [home, "/Applications", "/Library", "/usr/local", "/opt/homebrew"],
    home,
    concurrency: 12,
    maxErrorSamples: 100,
    maxLinkTargetDirectories: MAX_LINK_TARGET_DIRECTORIES,
    maxDirectories: MAX_SCAN_DIRECTORIES,
    followDirectoryLinks: false,
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

const SAFE_ERROR_MESSAGES: Record<string, string> = {
  EACCES: "접근 권한이 없습니다.",
  EPERM: "운영체제가 접근을 허용하지 않았습니다.",
  ENOENT: "검색 중 경로가 사라졌습니다.",
  ENOTDIR: "검색 중 디렉터리 구조가 바뀌었습니다.",
  ELOOP: "심볼릭 링크 순환을 감지했습니다.",
  FILE_TOO_LARGE: "1 MiB를 초과해 frontmatter 읽기를 생략했습니다.",
  FRONTMATTER_PARSE: "frontmatter를 해석하지 못해 디렉터리 이름을 사용했습니다.",
  LINK_SCAN_LIMIT: "링크 대상 검색 한도에 도달했습니다.",
  SCAN_LIMIT: "파일시스템 검색 디렉터리 한도에 도달했습니다.",
  NOT_REGULAR_FILE: "검색 중 skill 경로가 일반 파일이 아닌 항목으로 바뀌었습니다.",
};

function codedError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(SAFE_ERROR_MESSAGES[code] ?? "파일시스템 오류"), { code });
}

function errorDetails(error: unknown, errorPath: string): ScanError {
  const candidate = error as NodeJS.ErrnoException;
  const code = candidate.code ?? "UNKNOWN";
  return {
    path: errorPath,
    code,
    message: SAFE_ERROR_MESSAGES[code] ?? "파일시스템 항목을 읽지 못했습니다.",
  };
}

async function directoryHasDirectSkill(directoryPath: string): Promise<boolean> {
  try {
    const directory = await opendir(directoryPath);
    for await (const entry of directory) {
      if (entry.isFile() && entry.name.toLowerCase() === SKILL_FILE) return true;
    }
  } catch {
    // Link health inspection records relevant filesystem failures separately.
  }
  return false;
}

async function targetContainsSkill(
  target: string,
  maxDirectories: number,
  onError: (error: unknown, errorPath: string) => void,
): Promise<boolean> {
  try {
    const targetStat = await stat(target);
    if (targetStat.isFile()) return path.basename(target).toLowerCase() === SKILL_FILE;
    if (!targetStat.isDirectory()) return false;
  } catch (error) {
    onError(error, target);
    return false;
  }

  const queue = [target];
  let discovered = 1;
  while (queue.length > 0) {
    const directoryPath = queue.shift();
    if (!directoryPath) break;
    try {
      const directory = await opendir(directoryPath);
      for await (const entry of directory) {
        if (entry.isFile() && entry.name.toLowerCase() === SKILL_FILE) return true;
        if (entry.isDirectory() && !shouldExclude(directoryPath, entry.name)) {
          if (discovered >= maxDirectories) {
            onError(codedError("LINK_SCAN_LIMIT"), target);
            return false;
          }
          discovered += 1;
          queue.push(path.join(directoryPath, entry.name));
        }
      }
    } catch (error) {
      onError(error, directoryPath);
    }
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
  const availableSearchRoots = await existingDirectories(options.roots);
  const directoryBudget = Math.max(1, Math.floor(options.maxDirectories));
  const searchRoots = availableSearchRoots.slice(0, directoryBudget);
  const omittedSearchRoot = availableSearchRoots[searchRoots.length];
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
  const recordIssue = (code: string, errorPath: string): void => {
    recordError(codedError(code), errorPath);
  };
  if (omittedSearchRoot) recordIssue("SCAN_LIMIT", omittedSearchRoot);

  const inspectSkill = async (filePath: string, fileName: string): Promise<void> => {
    try {
      const handle = await open(
        filePath,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      try {
        const fileStat = await handle.stat();
        if (!fileStat.isFile()) {
          recordIssue("NOT_REGULAR_FILE", filePath);
          return;
        }
        let name = path.basename(path.dirname(filePath));
        let description = "";
        let contentsTokens = 0;
        let descriptionTokens = 0;
        if (fileStat.size > MAX_FRONTMATTER_BYTES) {
          recordIssue("FILE_TOO_LARGE", filePath);
        } else {
          const buffer = Buffer.alloc(fileStat.size);
          const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
          const source = buffer.subarray(0, bytesRead).toString("utf8");
          try {
            const parsed = matter(source);
            if (typeof parsed.data.name === "string" && parsed.data.name.trim()) {
              name = parsed.data.name.trim();
            }
            if (typeof parsed.data.description === "string") {
              description = parsed.data.description.trim();
            }
            contentsTokens = countTokens(parsed.content);
            descriptionTokens = countTokens(description);
          } catch {
            recordIssue("FRONTMATTER_PARSE", filePath);
          }
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
          device: fileStat.dev,
          inode: fileStat.ino,
          sourceSightings: [],
          contentsTokens,
          descriptionTokens,
        });
      } finally {
        await handle.close();
      }
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
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "EACCES" || code === "EPERM") recordError(error, resolvedTarget);
        status = "broken";
      }
      const onTargetError = (error: unknown, errorPath: string): void => {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "EACCES" || code === "EPERM" || code === "LINK_SCAN_LIMIT") {
          recordError(error, errorPath);
        }
      };
      const configRoot = inferConfigRoot(linkPath, options.home);
      links.push({
        id: stableId(linkPath),
        path: linkPath,
        target,
        configRoot,
        agent: inferAgentLabel(configRoot, options.home),
        status,
        containsSkill:
          status === "healthy"
            ? await targetContainsSkill(target, options.maxLinkTargetDirectories, onTargetError)
            : false,
      });
    } catch (error) {
      recordError(error, linkPath);
    }
  };

  const queue = [...searchRoots];
  const visitedDirectories = new Set<string>();
  let discoveredDirectories = queue.length;
  let scanLimitRecorded = false;
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
    if (discoveredDirectories >= directoryBudget) {
      if (!scanLimitRecorded) {
        scanLimitRecorded = true;
        recordIssue("SCAN_LIMIT", directory);
      }
      return;
    }
    discoveredDirectories += 1;
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
      const directoryStat = await stat(directoryPath);
      if (!directoryStat.isDirectory()) return;
      const directoryIdentity = `${directoryStat.dev}:${directoryStat.ino}`;
      if (visitedDirectories.has(directoryIdentity)) return;
      visitedDirectories.add(directoryIdentity);

      const directory = await opendir(directoryPath);
      for await (const entry of directory) {
        const entryPath = path.join(directoryPath, entry.name);
        if (entry.isSymbolicLink()) {
          if (isSkillLink(entryPath) || options.followDirectoryLinks) {
            await inspectLink(entryPath);
            if (options.followDirectoryLinks) {
              try {
                const targetStat = await stat(entryPath);
                if (targetStat.isDirectory() && (await directoryHasDirectSkill(entryPath))) {
                  enqueue(entryPath);
                }
              } catch {
                // inspectLink already records relevant link state without exposing raw errors.
              }
            }
          }
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
    scanMode: "full",
    officialSources: {
      shared: { id: "shared", name: "공유 디렉터리", globalPaths: [], projectPaths: [] },
      agents: [],
      roots: [],
    },
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
