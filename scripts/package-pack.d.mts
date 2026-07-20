export interface PackFile {
  path: string;
  size?: number;
}

export interface PackRecord {
  name: string;
  version: string;
  filename: string;
  files: PackFile[];
  size: number;
  unpackedSize: number;
}

export interface CapturedResult {
  stdout: string;
  stderr: string;
}

export interface CreateValidatedPackOptions {
  makeTemp?: () => Promise<string>;
  runPack?: (
    command: string,
    args: string[],
    options: { cwd: string },
  ) => Promise<CapturedResult>;
}

export function parsePackJson(stdout: string): unknown;
export function inspectPack(packJson: unknown): { pack: PackRecord; entries: string[] };
export function createValidatedPack(
  packageRoot: string,
  options?: CreateValidatedPackOptions,
): Promise<{
  directory: string;
  tarballPath: string;
  pack: PackRecord;
  entries: string[];
}>;
