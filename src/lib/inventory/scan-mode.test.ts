import { describe, expect, it, vi } from "vitest";
import type { InventorySnapshot } from "./types";
import {
  createInventoryModeScanner,
  InvalidScanModeError,
  parseScanMode,
} from "./scan-mode";

function snapshot(scanMode: "official" | "full"): InventorySnapshot {
  return {
    scanMode,
    officialSources: {
      shared: { id: "shared", name: "공유 디렉터리", globalPaths: [], projectPaths: [] },
      agents: [],
      roots: [],
    },
    generatedAt: new Date(0).toISOString(),
    durationMs: 0,
    searchRoots: [],
    skills: [],
    links: [],
    roots: [],
    errors: { count: 0, samples: [] },
    stats: {
      matchedFiles: 0,
      skillDefinitions: 0,
      documents: 0,
      uniqueNames: 0,
      configRoots: 0,
      healthyLinks: 0,
      brokenLinks: 0,
      errorCount: 0,
    },
  };
}

describe("parseScanMode", () => {
  it("defaults an omitted mode to official and accepts only the two explicit modes", () => {
    expect(parseScanMode(null)).toBe("official");
    expect(parseScanMode("official")).toBe("official");
    expect(parseScanMode("full")).toBe("full");
    expect(() => parseScanMode("")).toThrow(InvalidScanModeError);
    expect(() => parseScanMode("FULL")).toThrow(InvalidScanModeError);
    expect(() => parseScanMode("filesystem")).toThrow(InvalidScanModeError);
  });
});

describe("createInventoryModeScanner", () => {
  it("dispatches official and full scans without mixing their pipelines", async () => {
    const officialResult = snapshot("official");
    const fullResult = snapshot("full");
    const scanOfficial = vi.fn(async () => officialResult);
    const scanFull = vi.fn(async () => fullResult);
    const scan = createInventoryModeScanner({ scanOfficial, scanFull });

    await expect(scan("official")).resolves.toBe(officialResult);
    await expect(scan("full")).resolves.toBe(fullResult);
    expect(scanOfficial).toHaveBeenCalledTimes(1);
    expect(scanFull).toHaveBeenCalledTimes(1);
  });
});
