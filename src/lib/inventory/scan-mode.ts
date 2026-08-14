import { annotateFullInventory, scanOfficialInventory } from "./official-discovery";
import { scanInventory } from "./scanner";
import type { InventorySnapshot, ProgressCallback, ScanMode } from "./types";

export class InvalidScanModeError extends Error {
  constructor(value: string) {
    super(`지원하지 않는 scan mode입니다: ${value}`);
    this.name = "InvalidScanModeError";
  }
}

export function parseScanMode(value: string | null): ScanMode {
  if (value === null) return "official";
  if (value === "official" || value === "full") return value;
  throw new InvalidScanModeError(value);
}

export interface InventoryModeScannerDependencies {
  scanOfficial?: (onProgress?: ProgressCallback) => Promise<InventorySnapshot>;
  scanFull?: (onProgress?: ProgressCallback) => Promise<InventorySnapshot>;
}

export function createInventoryModeScanner(
  dependencies: InventoryModeScannerDependencies = {},
): (mode: ScanMode, onProgress?: ProgressCallback) => Promise<InventorySnapshot> {
  const scanOfficial = dependencies.scanOfficial ?? ((onProgress?: ProgressCallback) => scanOfficialInventory({ onProgress }));
  const scanFull =
    dependencies.scanFull ?? (async (onProgress?: ProgressCallback) => annotateFullInventory(await scanInventory({ onProgress })));

  return (mode, onProgress) => (mode === "official" ? scanOfficial(onProgress) : scanFull(onProgress));
}

export const scanInventoryForMode = createInventoryModeScanner();
