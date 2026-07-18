import { annotateFullInventory, scanOfficialInventory } from "./official-discovery";
import { scanInventory } from "./scanner";
import type { InventorySnapshot, ScanMode } from "./types";

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
  scanOfficial?: () => Promise<InventorySnapshot>;
  scanFull?: () => Promise<InventorySnapshot>;
}

export function createInventoryModeScanner(
  dependencies: InventoryModeScannerDependencies = {},
): (mode: ScanMode) => Promise<InventorySnapshot> {
  const scanOfficial = dependencies.scanOfficial ?? (() => scanOfficialInventory());
  const scanFull =
    dependencies.scanFull ?? (async () => annotateFullInventory(await scanInventory()));

  return (mode) => (mode === "official" ? scanOfficial() : scanFull());
}

export const scanInventoryForMode = createInventoryModeScanner();
