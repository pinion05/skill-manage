import { unlink } from "node:fs/promises";
import { readSkillContent } from "./markdown";
import { scanInventoryForMode } from "./scan-mode";
import type { InventorySnapshot, ProgressCallback, ScanMode, SkillContent, SkillRecord } from "./types";

export class SkillNotFoundError extends Error {
  constructor(id: string) {
    super(`현재 인벤토리에서 skill ID를 찾을 수 없습니다: ${id}`);
    this.name = "SkillNotFoundError";
  }
}

export interface InventoryStoreDependencies {
  scan?: (mode: ScanMode) => Promise<InventorySnapshot>;
  loadContent?: (record: SkillRecord) => Promise<SkillContent>;
  removeFile?: (path: string) => Promise<void>;
}

export interface DeletedSkill {
  id: string;
  name: string;
  path: string;
}

export interface InventoryStore {
  getInventory: (mode?: ScanMode, onProgress?: ProgressCallback) => Promise<InventorySnapshot>;
  refreshInventory: (mode?: ScanMode, onProgress?: ProgressCallback) => Promise<InventorySnapshot>;
  getSkillContent: (id: string, mode?: ScanMode) => Promise<SkillContent>;
  deleteSkill: (id: string, mode?: ScanMode) => Promise<DeletedSkill>;
}

export function createInventoryStore(
  dependencies: InventoryStoreDependencies = {},
): InventoryStore {
  const scan = dependencies.scan ?? scanInventoryForMode;
  const loadContent = dependencies.loadContent ?? readSkillContent;
  const removeFile = dependencies.removeFile ?? ((filePath) => unlink(filePath));
  const snapshots = new Map<ScanMode, InventorySnapshot>();
  const inFlight = new Map<ScanMode, Promise<InventorySnapshot>>();

  const runScan = (mode: ScanMode, force: boolean, onProgress?: ProgressCallback): Promise<InventorySnapshot> => {
    const pending = inFlight.get(mode);
    if (pending) return pending;
    const cached = snapshots.get(mode);
    if (!force && cached) return Promise.resolve(cached);

    const request = scan(mode, onProgress)
      .then((nextSnapshot) => {
        snapshots.set(mode, nextSnapshot);
        return nextSnapshot;
      })
      .finally(() => {
        if (inFlight.get(mode) === request) inFlight.delete(mode);
      });
    inFlight.set(mode, request);
    return request;
  };

  return {
    getInventory: (mode = "official", onProgress) => runScan(mode, false, onProgress),
    refreshInventory: (mode = "official", onProgress) => runScan(mode, true, onProgress),
    getSkillContent: async (id: string, mode = "official") => {
      const current = await runScan(mode, false);
      const record = current.skills.find((skill) => skill.id === id);
      if (!record) throw new SkillNotFoundError(id);
      return loadContent(record);
    },
    deleteSkill: async (id: string, mode = "official") => {
      const current = await runScan(mode, false);
      const record = current.skills.find((skill) => skill.id === id);
      if (!record) throw new SkillNotFoundError(id);
      // Only allow deleting a real skill.md file from the inventory — the path
      // is the scanner's canonical path, so it cannot escape the scanned roots.
      await removeFile(record.path);
      // Drop the deleted record from the cached snapshot so the UI reflects it
      // immediately without waiting for a rescan.
      const remaining = current.skills.filter((skill) => skill.id !== id);
      snapshots.set(mode, { ...current, skills: remaining });
      return { id: record.id, name: record.name, path: record.path };
    },
  };
}

export const inventoryStore = createInventoryStore();
