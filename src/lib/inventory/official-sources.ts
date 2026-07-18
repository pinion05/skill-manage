import path from "node:path";
import type {
  OfficialAgentSource,
  OfficialSourceKind,
  OfficialSourceScope,
} from "./types";

type Environment = Readonly<Record<string, string | undefined>>;

interface RegistryContext {
  home: string;
  environment: Environment;
}

interface FixedGlobalRootDefinition {
  type: "fixed";
  displayPath: string;
  kind: OfficialSourceKind;
  scope: "user" | "admin";
  resolve: (context: RegistryContext) => string[];
}

interface PatternRootDefinition {
  type: "pattern";
  displayPath: string;
  pattern: string;
  kind: OfficialSourceKind;
  scope: "user" | "project";
  workspaceMarker?: boolean;
  discoverable?: boolean;
}

type GlobalRootDefinition = FixedGlobalRootDefinition | PatternRootDefinition;
type ProjectRootDefinition = PatternRootDefinition & { scope: "project" };

export interface OfficialAgentDefinition {
  id: string;
  name: string;
  documentationUrl: string;
  globalRoots: GlobalRootDefinition[];
  projectRoots: ProjectRootDefinition[];
}

export interface ResolvedOfficialRootCandidate {
  path: string;
  scope: OfficialSourceScope;
  kinds: OfficialSourceKind[];
  agents: string[];
}

export interface ResolvedOfficialPattern {
  displayPath: string;
  pattern: string;
  scope: "user" | "project";
  kinds: OfficialSourceKind[];
  agents: string[];
  workspaceMarker: boolean;
}

export interface ResolvedOfficialRegistry {
  home: string;
  agents: OfficialAgentSource[];
  globalRoots: ResolvedOfficialRootCandidate[];
  globalPatterns: ResolvedOfficialPattern[];
  projectPatterns: ResolvedOfficialPattern[];
}

export interface OfficialRootMatch {
  scope: "user" | "project" | "admin";
  kinds: OfficialSourceKind[];
  agents: string[];
}

const KIND_ORDER: OfficialSourceKind[] = ["native", "shared", "compatibility"];

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function sortKinds(kinds: Iterable<OfficialSourceKind>): OfficialSourceKind[] {
  const values = new Set(kinds);
  return KIND_ORDER.filter((kind) => values.has(kind));
}

function resolveHome(home: string, relativePath: string): string {
  return path.resolve(home, relativePath);
}

function fixedHome(relativePath: string, kind: OfficialSourceKind): FixedGlobalRootDefinition {
  return {
    type: "fixed",
    displayPath: `~/${relativePath}`,
    kind,
    scope: "user",
    resolve: ({ home }) => [resolveHome(home, relativePath)],
  };
}

function envHome(
  variable: string,
  fallbackRelativePath: string,
  suffix: string,
  kind: OfficialSourceKind,
): FixedGlobalRootDefinition {
  return {
    type: "fixed",
    displayPath: `$${variable}/${suffix} (기본 ~/${fallbackRelativePath}/${suffix})`,
    kind,
    scope: "user",
    resolve: ({ home, environment }) => [
      path.resolve(environment[variable] || resolveHome(home, fallbackRelativePath), suffix),
    ],
  };
}

function envOnly(variable: string, kind: OfficialSourceKind): FixedGlobalRootDefinition {
  return {
    type: "fixed",
    displayPath: `$${variable}`,
    kind,
    scope: "user",
    resolve: ({ environment }) => (environment[variable] ? [path.resolve(environment[variable])] : []),
  };
}

function xdgRoot(relativePath: string, kind: OfficialSourceKind): FixedGlobalRootDefinition {
  return {
    type: "fixed",
    displayPath: `$XDG_CONFIG_HOME/${relativePath} (기본 ~/.config/${relativePath})`,
    kind,
    scope: "user",
    resolve: ({ home, environment }) => [
      path.resolve(environment.XDG_CONFIG_HOME || resolveHome(home, ".config"), relativePath),
    ],
  };
}

function absoluteRoot(rootPath: string, kind: OfficialSourceKind): FixedGlobalRootDefinition {
  return {
    type: "fixed",
    displayPath: rootPath,
    kind,
    scope: "admin",
    resolve: () => [path.resolve(rootPath)],
  };
}

function globalPattern(pattern: string, kind: OfficialSourceKind): PatternRootDefinition {
  return {
    type: "pattern",
    displayPath: `~/${pattern}`,
    pattern,
    kind,
    scope: "user",
  };
}

function projectRoot(
  pattern: string,
  kind: OfficialSourceKind,
  workspaceMarker = false,
  discoverable = true,
): ProjectRootDefinition {
  return {
    type: "pattern",
    displayPath: `**/${pattern}`,
    pattern,
    kind,
    scope: "project",
    workspaceMarker,
    discoverable,
  };
}

const sharedUser = () => fixedHome(".agents/skills", "shared");
const sharedProject = () => projectRoot(".agents/skills", "shared");
const claudeUserCompatibility = () => fixedHome(".claude/skills", "compatibility");
const claudeProjectCompatibility = () => projectRoot(".claude/skills", "compatibility");

export const OFFICIAL_AGENT_DEFINITIONS: OfficialAgentDefinition[] = [
  {
    id: "opencode",
    name: "OpenCode",
    documentationUrl: "https://opencode.ai/docs/skills/",
    globalRoots: [
      fixedHome(".config/opencode/skills", "native"),
      claudeUserCompatibility(),
      sharedUser(),
    ],
    projectRoots: [
      projectRoot(".opencode/skills", "native"),
      claudeProjectCompatibility(),
      sharedProject(),
    ],
  },
  {
    id: "claude-code",
    name: "Claude Code",
    documentationUrl: "https://code.claude.com/docs/en/skills",
    globalRoots: [envHome("CLAUDE_CONFIG_DIR", ".claude", "skills", "native")],
    projectRoots: [projectRoot(".claude/skills", "native")],
  },
  {
    id: "codex",
    name: "Codex CLI",
    documentationUrl: "https://developers.openai.com/codex/skills",
    globalRoots: [
      sharedUser(),
      envHome("CODEX_HOME", ".codex", "skills", "native"),
      absoluteRoot("/etc/codex/skills", "native"),
    ],
    projectRoots: [sharedProject()],
  },
  {
    id: "sakana-fugu",
    name: "Sakana Fugu",
    documentationUrl: "https://github.com/SakanaAI/fugu/blob/main/docs/commands_details.md",
    globalRoots: [
      fixedHome(".agents/skills", "compatibility"),
      envHome("CODEX_HOME", ".codex", "skills", "compatibility"),
      absoluteRoot("/etc/codex/skills", "compatibility"),
    ],
    projectRoots: [projectRoot(".agents/skills", "compatibility")],
  },
  {
    id: "hermes",
    name: "Hermes Agent",
    documentationUrl: "https://hermes-agent.nousresearch.com/docs/user-guide/features/skills",
    globalRoots: [
      envHome("HERMES_HOME", ".hermes", "skills", "native"),
      globalPattern(".hermes/profiles/*/skills", "native"),
    ],
    projectRoots: [],
  },
  {
    id: "gemini-cli",
    name: "Gemini CLI",
    documentationUrl: "https://geminicli.com/docs/cli/skills/",
    globalRoots: [fixedHome(".gemini/skills", "native"), sharedUser()],
    projectRoots: [projectRoot(".gemini/skills", "native"), sharedProject()],
  },
  {
    id: "antigravity",
    name: "Antigravity",
    documentationUrl: "https://antigravity.google/docs/skills",
    globalRoots: [fixedHome(".gemini/antigravity/skills", "native")],
    projectRoots: [projectRoot(".agent/skills", "native")],
  },
  {
    id: "pi",
    name: "Pi",
    documentationUrl:
      "https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/skills.md",
    globalRoots: [envHome("PI_CODING_AGENT_DIR", ".pi/agent", "skills", "native"), sharedUser()],
    projectRoots: [projectRoot(".pi/skills", "native"), sharedProject()],
  },
  {
    id: "qwen",
    name: "Qwen Code",
    documentationUrl: "https://qwenlm.github.io/qwen-code-docs/en/users/features/skills/",
    globalRoots: [fixedHome(".qwen/skills", "native")],
    projectRoots: [projectRoot(".qwen/skills", "native")],
  },
  {
    id: "cursor",
    name: "Cursor",
    documentationUrl: "https://cursor.com/docs/skills",
    globalRoots: [
      fixedHome(".cursor/skills", "native"),
      sharedUser(),
      claudeUserCompatibility(),
      fixedHome(".codex/skills", "compatibility"),
    ],
    projectRoots: [
      projectRoot(".cursor/skills", "native"),
      sharedProject(),
      claudeProjectCompatibility(),
      projectRoot(".codex/skills", "compatibility"),
    ],
  },
  {
    id: "roo",
    name: "Roo Code",
    documentationUrl: "https://docs.roocode.com/features/skills",
    globalRoots: [
      fixedHome(".roo/skills", "native"),
      globalPattern(".roo/skills-*", "native"),
      sharedUser(),
      globalPattern(".agents/skills-*", "shared"),
    ],
    projectRoots: [
      projectRoot(".roo/skills", "native"),
      projectRoot(".roo/skills-*", "native"),
      sharedProject(),
      projectRoot(".agents/skills-*", "shared"),
    ],
  },
  {
    id: "kilo",
    name: "Kilo Code",
    documentationUrl: "https://kilo.ai/docs/customize/skills",
    globalRoots: [fixedHome(".kilo/skills", "native")],
    projectRoots: [
      projectRoot(".kilo/skills", "native"),
      sharedProject(),
      claudeProjectCompatibility(),
    ],
  },
  {
    id: "zed",
    name: "Zed",
    documentationUrl: "https://zed.dev/docs/ai/skills",
    globalRoots: [sharedUser()],
    projectRoots: [sharedProject()],
  },
  {
    id: "kiro",
    name: "Kiro",
    documentationUrl: "https://kiro.dev/docs/skills/",
    globalRoots: [fixedHome(".kiro/skills", "native")],
    projectRoots: [projectRoot(".kiro/skills", "native")],
  },
  {
    id: "cline",
    name: "Cline",
    documentationUrl: "https://docs.cline.bot/customization/skills",
    globalRoots: [fixedHome(".cline/skills", "native")],
    projectRoots: [
      projectRoot(".cline/skills", "native"),
      projectRoot(".clinerules/skills", "compatibility"),
      claudeProjectCompatibility(),
    ],
  },
  {
    id: "openclaw",
    name: "OpenClaw",
    documentationUrl: "https://docs.openclaw.ai/tools/skills",
    globalRoots: [sharedUser(), fixedHome(".openclaw/skills", "native")],
    projectRoots: [projectRoot("skills", "native", true, false), sharedProject()],
  },
  {
    id: "github-copilot-cli",
    name: "GitHub Copilot CLI",
    documentationUrl:
      "https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills",
    globalRoots: [fixedHome(".copilot/skills", "native"), sharedUser()],
    projectRoots: [
      projectRoot(".github/skills", "native"),
      claudeProjectCompatibility(),
      sharedProject(),
    ],
  },
  {
    id: "amp",
    name: "Amp",
    documentationUrl: "https://ampcode.com/manual/agent-skills.md",
    globalRoots: [
      fixedHome(".config/agents/skills", "shared"),
      sharedUser(),
      fixedHome(".config/amp/skills", "native"),
      claudeUserCompatibility(),
    ],
    projectRoots: [sharedProject(), claudeProjectCompatibility()],
  },
  {
    id: "factory-droid",
    name: "Factory Droid",
    documentationUrl: "https://docs.factory.ai/cli/configuration/skills",
    globalRoots: [fixedHome(".factory/skills", "native")],
    projectRoots: [projectRoot(".factory/skills", "native"), projectRoot(".agent/skills", "compatibility")],
  },
  {
    id: "kimi",
    name: "Kimi Code",
    documentationUrl: "https://www.kimi.com/code/docs/en/kimi-code-cli/customization/skills.html",
    globalRoots: [envHome("KIMI_CODE_HOME", ".kimi-code", "skills", "native"), sharedUser()],
    projectRoots: [projectRoot(".kimi-code/skills", "native"), sharedProject()],
  },
  {
    id: "mux",
    name: "Mux",
    documentationUrl: "https://mux.coder.com/agents/agent-skills",
    globalRoots: [fixedHome(".mux/skills", "native"), sharedUser(), claudeUserCompatibility()],
    projectRoots: [projectRoot(".mux/skills", "native"), sharedProject(), claudeProjectCompatibility()],
  },
  {
    id: "crush",
    name: "Crush",
    documentationUrl:
      "https://github.com/charmbracelet/crush/commit/0e3d47273fe9a8bc749a6e928b8e7d9f102c1956",
    globalRoots: [
      envOnly("CRUSH_SKILLS_DIR", "native"),
      xdgRoot("agents/skills", "shared"),
      xdgRoot("crush/skills", "native"),
    ],
    projectRoots: [
      sharedProject(),
      projectRoot(".crush/skills", "native"),
      claudeProjectCompatibility(),
      projectRoot(".cursor/skills", "compatibility"),
    ],
  },
  {
    id: "goose",
    name: "Goose",
    documentationUrl: "https://github.com/block/goose/pull/6139",
    globalRoots: [fixedHome(".config/agent/skills", "shared"), fixedHome(".goose/config/skills", "native")],
    projectRoots: [sharedProject(), claudeProjectCompatibility(), projectRoot(".goose/skills", "native")],
  },
  {
    id: "warp",
    name: "Warp",
    documentationUrl: "https://docs.warp.dev/agent-platform/capabilities/skills/",
    globalRoots: [
      sharedUser(),
      fixedHome(".warp/skills", "native"),
      claudeUserCompatibility(),
      fixedHome(".codex/skills", "compatibility"),
      fixedHome(".cursor/skills", "compatibility"),
      fixedHome(".gemini/skills", "compatibility"),
      fixedHome(".copilot/skills", "compatibility"),
      fixedHome(".factory/skills", "compatibility"),
      fixedHome(".github/skills", "compatibility"),
      fixedHome(".opencode/skills", "compatibility"),
    ],
    projectRoots: [
      sharedProject(),
      projectRoot(".warp/skills", "native"),
      claudeProjectCompatibility(),
      projectRoot(".codex/skills", "compatibility"),
      projectRoot(".cursor/skills", "compatibility"),
      projectRoot(".gemini/skills", "compatibility"),
      projectRoot(".copilot/skills", "compatibility"),
      projectRoot(".factory/skills", "compatibility"),
      projectRoot(".github/skills", "compatibility"),
      projectRoot(".opencode/skills", "compatibility"),
    ],
  },
  {
    id: "grok-build",
    name: "Grok Build",
    documentationUrl: "https://docs.x.ai/build/features/skills-plugins-marketplaces",
    globalRoots: [fixedHome(".grok/skills", "native"), sharedUser()],
    projectRoots: [projectRoot(".grok/skills", "native")],
  },
  {
    id: "jcode",
    name: "Jcode",
    documentationUrl: "https://github.com/1jehuang/jcode/commit/5d482cac1256673e257baf7b154b6d1d2e3ee43e",
    globalRoots: [fixedHome(".jcode/skills", "native"), claudeUserCompatibility(), sharedUser()],
    projectRoots: [projectRoot(".jcode/skills", "native"), claudeProjectCompatibility(), sharedProject()],
  },
  {
    id: "mimo-code",
    name: "MiMo Code",
    documentationUrl: "https://mimo.xiaomi.com/mimocode/skills",
    globalRoots: [
      fixedHome(".config/mimocode/skills", "native"),
      claudeUserCompatibility(),
      sharedUser(),
      fixedHome(".codex/skills", "compatibility"),
      fixedHome(".opencode/skills", "compatibility"),
    ],
    projectRoots: [
      projectRoot(".mimocode/skills", "native"),
      projectRoot(".mimocode/skill", "native"),
      claudeProjectCompatibility(),
      sharedProject(),
      projectRoot(".codex/skills", "compatibility"),
      projectRoot(".opencode/skills", "compatibility"),
    ],
  },
  {
    id: "zcode",
    name: "ZCode",
    documentationUrl: "https://zcode.z.ai/en/docs/skill",
    globalRoots: [fixedHome(".zcode/skills", "native")],
    projectRoots: [],
  },
];

function addRelation<T extends { kinds: OfficialSourceKind[]; agents: string[] }>(
  target: T,
  kind: OfficialSourceKind,
  agentName: string,
): void {
  target.kinds = sortKinds([...target.kinds, kind]);
  target.agents = unique([...target.agents, agentName]);
}

function normalizedParts(value: string): string[] {
  return value.split(/[\\/]+/).filter(Boolean);
}

function segmentMatches(value: string, pattern: string): boolean {
  if (pattern === "*") return value.length > 0;
  if (pattern.endsWith("*")) return value.startsWith(pattern.slice(0, -1));
  return value === pattern;
}

function patternMatches(parts: string[], pattern: string, exact: boolean): boolean {
  const patternParts = normalizedParts(pattern);
  if (exact && parts.length !== patternParts.length) return false;
  if (!exact && parts.length <= patternParts.length) return false;
  const offset = parts.length - patternParts.length;
  return patternParts.every((segment, index) => segmentMatches(parts[offset + index] ?? "", segment));
}

export function resolveOfficialRegistry(
  home: string,
  environment: Environment = process.env,
): ResolvedOfficialRegistry {
  const context = { home: path.resolve(home), environment };
  const globalRoots = new Map<string, ResolvedOfficialRootCandidate>();
  const globalPatterns = new Map<string, ResolvedOfficialPattern>();
  const projectPatterns = new Map<string, ResolvedOfficialPattern>();

  const agents = OFFICIAL_AGENT_DEFINITIONS.map<OfficialAgentSource>((definition) => {
    const globalPaths: string[] = [];
    for (const root of definition.globalRoots) {
      if (root.type === "fixed") {
        for (const resolvedPath of root.resolve(context)) {
          const normalizedPath = path.resolve(resolvedPath);
          globalPaths.push(normalizedPath);
          const key = `${root.scope}:${normalizedPath}`;
          const existing = globalRoots.get(key) ?? {
            path: normalizedPath,
            scope: root.scope,
            kinds: [],
            agents: [],
          };
          addRelation(existing, root.kind, definition.name);
          globalRoots.set(key, existing);
        }
      } else {
        globalPaths.push(root.displayPath);
        const key = `${root.scope}:${root.pattern}`;
        const existing = globalPatterns.get(key) ?? {
          displayPath: root.displayPath,
          pattern: root.pattern,
          scope: root.scope,
          kinds: [],
          agents: [],
          workspaceMarker: false,
        };
        addRelation(existing, root.kind, definition.name);
        globalPatterns.set(key, existing);
      }
    }

    const projectPaths: string[] = [];
    for (const root of definition.projectRoots) {
      projectPaths.push(root.displayPath);
      if (root.discoverable === false) continue;
      const key = `${root.pattern}:${root.workspaceMarker === true}`;
      const existing = projectPatterns.get(key) ?? {
        displayPath: root.displayPath,
        pattern: root.pattern,
        scope: "project",
        kinds: [],
        agents: [],
        workspaceMarker: root.workspaceMarker === true,
      };
      addRelation(existing, root.kind, definition.name);
      projectPatterns.set(key, existing);
    }

    return {
      id: definition.id,
      name: definition.name,
      documentationUrl: definition.documentationUrl,
      globalPaths: unique(globalPaths),
      projectPaths: unique(projectPaths),
    };
  });

  return {
    home: context.home,
    agents,
    globalRoots: [...globalRoots.values()],
    globalPatterns: [...globalPatterns.values()],
    projectPatterns: [...projectPatterns.values()],
  };
}

function mergeMatches(matches: Array<ResolvedOfficialRootCandidate | ResolvedOfficialPattern>): OfficialRootMatch | undefined {
  if (matches.length === 0) return undefined;
  const scope = matches.some((match) => match.scope === "admin")
    ? "admin"
    : matches.some((match) => match.scope === "user")
      ? "user"
      : "project";
  return {
    scope,
    kinds: sortKinds(matches.flatMap(({ kinds }) => kinds)),
    agents: unique(matches.flatMap(({ agents }) => agents)),
  };
}

export function matchOfficialRoot(
  rootPath: string,
  registry: ResolvedOfficialRegistry,
  options: { workspaceMarker: boolean },
): OfficialRootMatch | undefined {
  const normalizedRoot = path.resolve(rootPath);
  const fixedMatches = registry.globalRoots.filter(({ path: candidatePath }) => candidatePath === normalizedRoot);
  if (fixedMatches.length > 0) return mergeMatches(fixedMatches);

  const relative = path.relative(registry.home, normalizedRoot);
  const relativeParts = normalizedParts(relative);

  if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
    const dynamicGlobalMatches = registry.globalPatterns.filter(({ pattern }) =>
      patternMatches(relativeParts, pattern, true),
    );
    if (dynamicGlobalMatches.length > 0) return mergeMatches(dynamicGlobalMatches);
  }

  const projectMatches = registry.projectPatterns.filter(
    ({ pattern, workspaceMarker }) =>
      (!workspaceMarker || options.workspaceMarker) && patternMatches(relativeParts, pattern, false),
  );
  return mergeMatches(projectMatches);
}
