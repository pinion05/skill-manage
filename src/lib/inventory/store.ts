import { readSkillContent } from "./markdown";
import { scanInventoryForMode } from "./scan-mode";
import type { InventorySnapshot, ScanMode, SkillContent, SkillRecord } from "./types";

export class SkillNotFoundError extends Error {
  constructor(id: string) {
    super(`현재 인벤토리에서 skill ID를 찾을 수 없습니다: ${id}`);
    this.name = "SkillNotFoundError";
  }
}

export interface InventoryStoreDependencies {
  scan?: (mode: ScanMode) => Promise<InventorySnapshot>;
  loadContent?: (record: SkillRecord) => Promise<SkillContent>;
}

export interface InventoryStore {
  getInventory: (mode?: ScanMode) => Promise<InventorySnapshot>;
  refreshInventory: (mode?: ScanMode) => Promise<InventorySnapshot>;
  getSkillContent: (id: string, mode?: ScanMode) => Promise<SkillContent>;
}

export function createInventoryStore(
  dependencies: InventoryStoreDependencies = {},
): InventoryStore {
  const scan = dependencies.scan ?? scanInventoryForMode;
  const loadContent = dependencies.loadContent ?? readSkillContent;
  const snapshots = new Map<ScanMode, InventorySnapshot>();
  const inFlight = new Map<ScanMode, Promise<InventorySnapshot>>();

  const runScan = (mode: ScanMode, force: boolean): Promise<InventorySnapshot> => {
    const pending = inFlight.get(mode);
    if (pending) return pending;
    const cached = snapshots.get(mode);
    if (!force && cached) return Promise.resolve(cached);

    const request = scan(mode)
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
    getInventory: (mode = "official") => runScan(mode, false),
    refreshInventory: (mode = "official") => runScan(mode, true),
    getSkillContent: async (id: string, mode = "official") => {
      const current = await runScan(mode, false);
      const record = current.skills.find((skill) => skill.id === id);
      if (!record) throw new SkillNotFoundError(id);
      return loadContent(record);
    },
  };
}

export const inventoryStore = createInventoryStore();
