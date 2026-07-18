import { describe, expect, it } from "vitest";
import {
  classifyPath,
  findSkillsRoot,
  inferAgentLabel,
  inferConfigRoot,
} from "./classify";

const home = "/Users/me";

describe("classifyPath", () => {
  it.each([
    ["/Users/me/.codex/skills/foo/SKILL.md", "user/global-config"],
    ["/Applications/Codex.app/Contents/x/skills/foo/SKILL.md", "app-bundled"],
    ["/Users/me/.codex/plugins/cache/x/skills/foo/SKILL.md", "plugin/cache/vendor"],
    ["/Users/me/.omx/backups/setup/x/.codex/skills/foo/SKILL.md", "backup/temp/fixture"],
    ["/Users/me/.nvm/versions/node/v24/lib/node_modules/pkg/skills/foo/SKILL.md", "installed-package/source-dependency"],
    ["/Users/me/dev/app/.claude/skills/foo/SKILL.md", "project/source-local"],
    ["/Users/me/Library/Application Support/autoclaw/runtime/skills/foo/SKILL.md", "app-runtime"],
    ["/opt/tools/skills/foo/SKILL.md", "other"],
  ] as const)("classifies %s", (path, kind) => {
    expect(classifyPath(path, home)).toBe(kind);
  });
});

describe("inferConfigRoot", () => {
  it.each([
    ["/Users/me/.codex/skills/foo/SKILL.md", "/Users/me/.codex"],
    ["/Users/me/.pi/agent/skills/foo/SKILL.md", "/Users/me/.pi/agent"],
    ["/Users/me/.pi/caveman/skills/foo/SKILL.md", "/Users/me/.pi/caveman"],
    ["/Users/me/.config/opencode/skills/foo/SKILL.md", "/Users/me/.config/opencode"],
    ["/Users/me/.codeium/windsurf/skills/foo/SKILL.md", "/Users/me/.codeium/windsurf"],
    ["/Applications/Codex.app/Contents/x/skills/foo/SKILL.md", "/Applications/Codex.app"],
    ["/Users/me/dev/app/.claude/skills/foo/SKILL.md", "/Users/me/dev/app/.claude"],
    ["/opt/tools/skills/foo/SKILL.md", "/opt/tools"],
  ] as const)("infers root for %s", (path, root) => {
    expect(inferConfigRoot(path, home)).toBe(root);
  });
});

describe("findSkillsRoot", () => {
  it("uses the nearest skills directory", () => {
    expect(findSkillsRoot("/repo/skills/outer/examples/skills/inner/SKILL.md")).toBe(
      "/repo/skills/outer/examples/skills",
    );
  });

  it("falls back to the skill parent directory", () => {
    expect(findSkillsRoot("/repo/custom/foo/SKILL.md")).toBe("/repo/custom");
  });
});

describe("inferAgentLabel", () => {
  it.each([
    ["/Users/me/.codex", "OpenAI Codex"],
    ["/Users/me/.pi/agent", "Pi"],
    ["/Applications/Visual Studio Code.app", "VS Code"],
    ["/Users/me/dev/app/.claude", "Claude Code"],
    ["/opt/tools", "tools"],
  ])("labels %s", (root, label) => {
    expect(inferAgentLabel(root, home)).toBe(label);
  });
});
