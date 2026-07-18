import { describe, expect, it } from "vitest";
import {
  matchOfficialRoot,
  resolveOfficialRegistry,
  type ResolvedOfficialRegistry,
} from "./official-sources";

function agent(registry: ResolvedOfficialRegistry, id: string) {
  const source = registry.agents.find((candidate) => candidate.id === id);
  if (!source) throw new Error(`Missing official source: ${id}`);
  return source;
}

describe("resolveOfficialRegistry", () => {
  it("expands environment-aware owned roots without assigning shared paths to agents", () => {
    const registry = resolveOfficialRegistry("/Users/me", {
      CLAUDE_CONFIG_DIR: "/tmp/claude-home",
      CODEX_HOME: "/tmp/codex-home",
      HERMES_HOME: "/tmp/hermes-home",
      PI_CODING_AGENT_DIR: "/tmp/pi-home",
      KIMI_CODE_HOME: "/tmp/kimi-home",
      CRUSH_SKILLS_DIR: "/tmp/crush-skills",
      XDG_CONFIG_HOME: "/tmp/xdg",
    });

    expect(agent(registry, "claude-code").globalPaths).toEqual(["/tmp/claude-home/skills"]);
    expect(agent(registry, "codex").globalPaths).toEqual([
      "/tmp/codex-home/skills",
      "/etc/codex/skills",
    ]);
    expect(agent(registry, "hermes").globalPaths).toEqual(
      expect.arrayContaining(["/tmp/hermes-home/skills", "~/.hermes/profiles/*/skills"]),
    );
    expect(agent(registry, "pi").globalPaths).toEqual(["/tmp/pi-home/skills"]);
    expect(agent(registry, "kimi").globalPaths).toEqual(["/tmp/kimi-home/skills"]);
    expect(agent(registry, "crush").globalPaths).toEqual(
      expect.arrayContaining(["/tmp/crush-skills", "/tmp/xdg/crush/skills"]),
    );
    expect(registry.shared.globalPaths).toEqual(
      expect.arrayContaining([
        "/Users/me/.agents/skills",
        "/tmp/xdg/agents/skills",
        "/Users/me/.config/agent/skills",
      ]),
    );
  });

  it("lists only agents with owned paths and omits unsupported or consumer-only clients", () => {
    const registry = resolveOfficialRegistry("/Users/me", {});
    const ids = registry.agents.map(({ id }) => id);

    expect(ids).toEqual([
      "opencode",
      "claude-code",
      "codex",
      "hermes",
      "gemini-cli",
      "antigravity",
      "pi",
      "qwen",
      "cursor",
      "roo",
      "kilo",
      "kiro",
      "cline",
      "openclaw",
      "github-copilot-cli",
      "amp",
      "factory-droid",
      "kimi",
      "mux",
      "crush",
      "goose",
      "warp",
      "grok-build",
      "jcode",
      "mimo-code",
      "zcode",
    ]);
    expect(ids).not.toEqual(
      expect.arrayContaining([
        "zed",
        "sakana-fugu",
        "codebuddy",
        "workbuddy",
        "devin",
        "junie",
        "trae",
        "codebuff",
        "command-code",
        "synthetic",
      ]),
    );
    expect(agent(registry, "cursor").globalPaths).toEqual(["/Users/me/.cursor/skills"]);
    expect(agent(registry, "cursor").projectPaths).toEqual(["**/.cursor/skills"]);
    expect(agent(registry, "qwen").globalPaths).toEqual(["/Users/me/.qwen/skills"]);
    expect(agent(registry, "zcode").projectPaths).toEqual([]);
  });

  it("keeps scan consumers internally while assigning one canonical owner", () => {
    const registry = resolveOfficialRegistry("/Users/me", {});
    const sharedGlobal = registry.globalRoots.find(
      ({ path: rootPath }) => rootPath === "/Users/me/.agents/skills",
    );

    expect(sharedGlobal?.agents).toEqual(
      expect.arrayContaining(["Codex CLI", "Gemini CLI", "Pi", "Zed"]),
    );
    expect(sharedGlobal?.owner).toEqual({
      id: "shared",
      name: "공유 디렉터리",
      type: "shared",
    });

    const claudeProject = matchOfficialRoot("/Users/me/dev/app/.claude/skills", registry, {
      workspaceMarker: false,
    });
    expect(claudeProject?.agents).toEqual(
      expect.arrayContaining(["Claude Code", "Cursor", "OpenCode", "GitHub Copilot CLI"]),
    );
    expect(claudeProject?.owner).toEqual({
      id: "claude-code",
      name: "Claude Code",
      type: "agent",
    });

    expect(
      matchOfficialRoot("/Users/me/dev/app/.agents/skills", registry, {
        workspaceMarker: false,
      })?.owner,
    ).toEqual({ id: "shared", name: "공유 디렉터리", type: "shared" });
    expect(
      matchOfficialRoot("/Users/me/dev/app/.codex/skills", registry, {
        workspaceMarker: false,
      })?.owner,
    ).toEqual({ id: "codex", name: "Codex CLI", type: "agent" });
  });

  it("does not classify project-like suffixes outside the selected home", () => {
    const registry = resolveOfficialRegistry("/Users/me", {});

    expect(
      matchOfficialRoot("/tmp/external/.claude/skills", registry, {
        workspaceMarker: false,
      }),
    ).toBeUndefined();
  });

  it("assigns dynamic roots to their namespace owner without guessing plain workspaces", () => {
    const registry = resolveOfficialRegistry("/Users/me", {});

    expect(
      matchOfficialRoot("/Users/me/.hermes/profiles/research/skills", registry, {
        workspaceMarker: false,
      }),
    ).toMatchObject({ owner: { id: "hermes", name: "Hermes Agent", type: "agent" } });
    expect(
      matchOfficialRoot("/Users/me/dev/app/.roo/skills-debug", registry, {
        workspaceMarker: false,
      }),
    ).toMatchObject({ owner: { id: "roo", name: "Roo Code", type: "agent" } });
    expect(
      matchOfficialRoot("/Users/me/dev/app/.agents/skills-debug", registry, {
        workspaceMarker: false,
      }),
    ).toMatchObject({ owner: { id: "roo", name: "Roo Code", type: "agent" } });
    expect(
      matchOfficialRoot("/Users/me/dev/openclaw-workspace/skills", registry, {
        workspaceMarker: true,
      }),
    ).toBeUndefined();
    expect(agent(registry, "openclaw").projectPaths).toContain("**/skills");
  });
});
