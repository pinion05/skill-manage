import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  classifyPath,
  findSkillsRoot,
  inferAgentLabel,
  inferConfigRoot,
} from "./classify";

const home = "/Users/me";

// classify.ts runs path.normalize/resolve internally, which rewrites POSIX
// literals into platform separators (e.g. "\Users\me\.codex" on Windows).
// Expectations therefore mirror whatever the running platform produces —
// except for Windows-drive-letter cases, which are platform-invariant.

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
    ["/Users/me/.codex/skills/foo/SKILL.md", ["Users", "me", ".codex"]],
    ["/Users/me/.pi/agent/skills/foo/SKILL.md", ["Users", "me", ".pi", "agent"]],
    ["/Users/me/.pi/caveman/skills/foo/SKILL.md", ["Users", "me", ".pi", "caveman"]],
    ["/Users/me/.config/opencode/skills/foo/SKILL.md", ["Users", "me", ".config", "opencode"]],
    ["/Users/me/.codeium/windsurf/skills/foo/SKILL.md", ["Users", "me", ".codeium", "windsurf"]],
    ["/Users/me/dev/app/.claude/skills/foo/SKILL.md", ["Users", "me", "dev", "app", ".claude"]],
  ] as const)("infers root for %s", (filePath, expectedParts) => {
    expect(inferConfigRoot(filePath, home)).toBe(path.join(path.sep, ...expectedParts));
  });

  // macOS app-bundle and /opt inferences rely on POSIX-only marker branches.
  it.skipIf(process.platform === "win32")("infers macOS/Linux roots", () => {
    expect(inferConfigRoot("/Applications/Codex.app/Contents/x/skills/foo/SKILL.md", home)).toBe(
      "/Applications/Codex.app",
    );
    expect(inferConfigRoot("/opt/tools/skills/foo/SKILL.md", home)).toBe("/opt/tools");
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
  ])(`labels %s`, (root, label) => {
    expect(inferAgentLabel(root, home)).toBe(label);
  });

  it("labels Windows backslash paths", () => {
    expect(inferAgentLabel("C:\\Users\\me\\.codex", home)).toBe("OpenAI Codex");
    expect(inferAgentLabel("C:\\Users\\me\\.hermes", home)).toBe("Hermes runtime");
    expect(inferAgentLabel("C:\\Users\\me\\.claude", home)).toBe("Claude Code");
  });
});
