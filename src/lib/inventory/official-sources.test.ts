import path from "node:path";
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
  it("expands documented environment-aware global roots without rewriting shared roots", () => {
    const registry = resolveOfficialRegistry("/Users/me", {
      CLAUDE_CONFIG_DIR: "/tmp/claude-home",
      CODEX_HOME: "/tmp/codex-home",
      HERMES_HOME: "/tmp/hermes-home",
      PI_CODING_AGENT_DIR: "/tmp/pi-home",
      KIMI_CODE_HOME: "/tmp/kimi-home",
      CRUSH_SKILLS_DIR: "/tmp/crush-skills",
      XDG_CONFIG_HOME: "/tmp/xdg",
    });

    expect(agent(registry, "claude-code").globalPaths).toContain("/tmp/claude-home/skills");
    expect(agent(registry, "codex").globalPaths).toEqual(
      expect.arrayContaining([
        "/Users/me/.agents/skills",
        "/tmp/codex-home/skills",
        "/etc/codex/skills",
      ]),
    );
    expect(agent(registry, "hermes").globalPaths).toContain("/tmp/hermes-home/skills");
    expect(agent(registry, "pi").globalPaths).toEqual(
      expect.arrayContaining(["/tmp/pi-home/skills", "/Users/me/.agents/skills"]),
    );
    expect(agent(registry, "kimi").globalPaths).toContain("/tmp/kimi-home/skills");
    expect(agent(registry, "crush").globalPaths).toEqual(
      expect.arrayContaining([
        "/tmp/crush-skills",
        "/tmp/xdg/agents/skills",
        "/tmp/xdg/crush/skills",
      ]),
    );
  });

  it("keeps exact first-party scope and omits unverified products and aliases", () => {
    const registry = resolveOfficialRegistry("/Users/me", {});
    const ids = registry.agents.map(({ id }) => id);

    expect(ids).toEqual([
      "opencode",
      "claude-code",
      "codex",
      "sakana-fugu",
      "hermes",
      "gemini-cli",
      "antigravity",
      "pi",
      "qwen",
      "cursor",
      "roo",
      "kilo",
      "zed",
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
    expect(agent(registry, "qwen").globalPaths).toEqual(["/Users/me/.qwen/skills"]);
    expect(agent(registry, "qwen").projectPaths).toEqual(["**/.qwen/skills"]);
    expect(agent(registry, "zcode").projectPaths).toEqual([]);
  });

  it("aggregates shared and compatibility relations without inventing runtime precedence", () => {
    const home = "/Users/me";
    const registry = resolveOfficialRegistry(home, {});
    const shared = registry.globalRoots.find(({ path: rootPath }) =>
      rootPath === path.join(home, ".agents", "skills"),
    );

    expect(shared?.agents).toEqual(expect.arrayContaining(["Codex CLI", "Gemini CLI", "Pi", "Zed"]));
    expect(shared?.kinds).toContain("shared");

    const claudeProject = matchOfficialRoot("/Users/me/dev/app/.claude/skills", registry, {
      workspaceMarker: false,
    });
    expect(claudeProject?.scope).toBe("project");
    expect(claudeProject?.agents).toEqual(
      expect.arrayContaining(["Claude Code", "Cursor", "OpenCode", "GitHub Copilot CLI"]),
    );
    expect(claudeProject?.kinds).toEqual(expect.arrayContaining(["native", "compatibility"]));

    const qwenShared = matchOfficialRoot("/Users/me/dev/app/.agents/skills", registry, {
      workspaceMarker: false,
    });
    expect(qwenShared?.agents).not.toContain("Qwen Code");
  });

  it("does not classify project-like suffixes outside the selected home", () => {
    const registry = resolveOfficialRegistry("/Users/me", {});

    expect(
      matchOfficialRoot("/tmp/external/.claude/skills", registry, {
        workspaceMarker: false,
      }),
    ).toBeUndefined();
  });

  it("matches dynamic documented roots without guessing which plain skills folder is an OpenClaw workspace", () => {
    const registry = resolveOfficialRegistry("/Users/me", {});

    expect(
      matchOfficialRoot("/Users/me/.hermes/profiles/research/skills", registry, {
        workspaceMarker: false,
      }),
    ).toMatchObject({ scope: "user", agents: ["Hermes Agent"] });
    expect(
      matchOfficialRoot("/Users/me/dev/app/.roo/skills-debug", registry, {
        workspaceMarker: false,
      }),
    ).toMatchObject({ scope: "project", agents: ["Roo Code"] });
    expect(
      matchOfficialRoot("/Users/me/dev/openclaw-workspace/skills", registry, {
        workspaceMarker: true,
      }),
    ).toBeUndefined();
    expect(agent(registry, "openclaw").projectPaths).toContain("**/skills");
    expect(
      matchOfficialRoot("/Users/me/Downloads/random/skills", registry, {
        workspaceMarker: false,
      }),
    ).toBeUndefined();
  });
});
