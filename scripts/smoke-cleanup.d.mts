import type { ChildProcess, SpawnOptions } from "node:child_process";

export interface ProcessOutcome {
  error?: Error;
  code?: number | null;
  signal?: NodeJS.Signals | null;
}

export interface ProcessHandle {
  pid?: number;
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
}

export type SpawnProcess = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
) => ChildProcess;

export interface RunCapturedOptions extends SpawnOptions {
  timeoutMs?: number;
  spawnProcess?: SpawnProcess;
}

export interface TerminateOptions {
  requireGraceful: boolean;
  platform?: NodeJS.Platform;
  stopTimeoutMs?: number;
  pollIntervalMs?: number;
  killProcess?: typeof process.kill;
  spawnProcess?: SpawnProcess;
}

export function childOutcome(child: ChildProcess): Promise<ProcessOutcome>;
export function formatOutcome(outcome: ProcessOutcome): string;
export function runCaptured(
  command: string,
  args: readonly string[],
  options?: RunCapturedOptions,
): Promise<{ stdout: string; stderr: string }>;
export function terminateProcessTree(
  child: ProcessHandle | undefined,
  outcome: Promise<ProcessOutcome>,
  options: TerminateOptions,
): Promise<ProcessOutcome>;
