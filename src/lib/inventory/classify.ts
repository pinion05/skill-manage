import path from "node:path";
import type { SkillKind } from "./types";

const PROJECT_MARKERS = new Set([
  ".agent",
  ".agents",
  ".claude",
  ".cline",
  ".codebuddy",
  ".codex",
  ".commandcode",
  ".continue",
  ".crush",
  ".cursor",
  ".factory",
  ".gemini",
  ".github",
  ".goose",
  ".kilocode",
  ".kiro",
  ".mcpjam",
  ".mux",
  ".neovate",
  ".opencode",
  ".openhands",
  ".pi",
  ".qoder",
  ".qwen",
  ".roo",
  ".trae",
  ".windsurf",
  ".zencoder",
]);

function normalized(value: string): string {
  return path.normalize(value);
}

function hasSegment(value: string, fragment: string): boolean {
  return value.includes(path.normalize(fragment));
}

export function classifyPath(filePath: string, home: string): SkillKind {
  const value = normalized(filePath);
  const normalizedHome = normalized(home);

  if (
    hasSegment(value, `${path.sep}.omx${path.sep}backups${path.sep}`) ||
    hasSegment(value, `${path.sep}.codex${path.sep}.tmp${path.sep}`) ||
    hasSegment(value, `${path.sep}test${path.sep}fixtures${path.sep}`) ||
    hasSegment(value, `${path.sep}Downloads${path.sep}`)
  ) {
    return "backup/temp/fixture";
  }

  if (
    hasSegment(value, `${path.sep}plugins${path.sep}cache${path.sep}`) ||
    hasSegment(value, `${path.sep}plugins${path.sep}marketplaces${path.sep}`) ||
    hasSegment(value, `${path.sep}vendor_imports${path.sep}`)
  ) {
    return "plugin/cache/vendor";
  }

  if (value.startsWith(`${path.sep}Applications${path.sep}`) && value.includes(".app")) {
    return "app-bundled";
  }

  if (
    hasSegment(value, `${path.sep}node_modules${path.sep}`) ||
    hasSegment(value, `${path.sep}.nvm${path.sep}`) ||
    hasSegment(value, `${path.sep}.npm${path.sep}_npx${path.sep}`) ||
    hasSegment(value, `${path.sep}.bun${path.sep}install${path.sep}`)
  ) {
    return "installed-package/source-dependency";
  }

  if (value.startsWith(`${normalizedHome}${path.sep}.`)) {
    return "user/global-config";
  }

  const relative = path.relative(normalizedHome, value);
  const parts = relative.split(path.sep);
  if (
    parts.includes("dev") ||
    parts.includes("projects") ||
    parts.some((part, index) => index > 0 && PROJECT_MARKERS.has(part))
  ) {
    return "project/source-local";
  }

  if (hasSegment(value, `${path.sep}Library${path.sep}Application Support${path.sep}`)) {
    return "app-runtime";
  }

  return "other";
}

export function findSkillsRoot(filePath: string): string {
  const value = normalized(filePath);
  const parts = value.split(path.sep);
  let skillsIndex = -1;
  for (let index = 0; index < parts.length - 1; index += 1) {
    if (parts[index]?.toLowerCase() === "skills") skillsIndex = index;
  }
  if (skillsIndex >= 0) {
    return parts.slice(0, skillsIndex + 1).join(path.sep) || path.sep;
  }
  return path.dirname(path.dirname(value));
}

function rootThroughMarker(value: string): string | undefined {
  const parts = value.split(path.sep);
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    if (PROJECT_MARKERS.has(parts[index] ?? "")) {
      return parts.slice(0, index + 1).join(path.sep) || path.sep;
    }
  }
  return undefined;
}

export function inferConfigRoot(filePath: string, home: string): string {
  const value = normalized(filePath);
  const normalizedHome = normalized(home);

  const appMatch = value.match(/^(\/Applications\/[^/]+\.app)(?:\/|$)/);
  if (appMatch?.[1]) return appMatch[1];

  if (value.startsWith(`${normalizedHome}${path.sep}`)) {
    const relativeParts = path.relative(normalizedHome, value).split(path.sep);
    const [first, second] = relativeParts;
    if (first?.startsWith(".")) {
      if (first === ".pi" && (second === "agent" || second === "caveman")) {
        return path.join(normalizedHome, first, second);
      }
      if (first === ".config" && second) return path.join(normalizedHome, first, second);
      if (first === ".codeium" && second) return path.join(normalizedHome, first, second);
      if (first === ".gjc" && second === "agent") return path.join(normalizedHome, first, second);
      if (first === ".gemini" && second === "antigravity") {
        return path.join(normalizedHome, first, second);
      }
      return path.join(normalizedHome, first);
    }

    if (first === "Library" && second === "Application Support" && relativeParts[2]) {
      return path.join(normalizedHome, first, second, relativeParts[2]);
    }
  }

  const projectRoot = rootThroughMarker(value);
  if (projectRoot) return projectRoot;

  return path.dirname(findSkillsRoot(value));
}

const LABELS: Array<[RegExp, string]> = [
  [/[\\/]\.codex(?:[\\/]|$)/, "OpenAI Codex"],
  [/[\\/]\.claude(?:[\\/]|$)/, "Claude Code"],
  [/[\\/]\.pi(?:[\\/]|$)/, "Pi"],
  [/[\\/]\.hermes(?:[\\/]|$)/, "Hermes runtime"],
  [/[\\/]\.config[\\/]opencode(?:[\\/]|$)|[\\/]\.opencode(?:[\\/]|$)/, "OpenCode"],
  [/[\\/]\.qwen(?:[\\/]|$)/, "Qwen Code"],
  [/[\\/]\.gemini(?:[\\/]|$)/, "Gemini"],
  [/[\\/]\.zcode(?:[\\/]|$)/, "ZCode"],
  [/[\\/]\.gjc(?:[\\/]|$)/, "Gajae Code"],
  [/[\\/]\.code(?:[\\/]|$)/, "Just Every Code"],
  [/[\\/]\.browseros(?:[\\/]|$)/, "BrowserOS"],
  [/[\\/]\.openclaw-autoclaw(?:[\\/]|$)/, "OpenClaw / AutoClaw"],
  [/[\\/]\.agents(?:[\\/]|$)/, "Shared agent skills"],
];

export function inferAgentLabel(configRoot: string, home: string): string {
  const value = normalized(configRoot);
  if (value.endsWith(`${path.sep}Visual Studio Code.app`)) return "VS Code";
  const appName = path.basename(value).replace(/\.app$/i, "");
  if (value.startsWith(`${path.sep}Applications${path.sep}`)) return appName;
  for (const [pattern, label] of LABELS) {
    if (pattern.test(value)) return label;
  }
  const relative = path.relative(normalized(home), value);
  const leaf = path.basename(relative || value).replace(/^\./, "");
  return leaf || "Other";
}
