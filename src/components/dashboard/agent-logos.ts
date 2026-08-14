/**
 * Maps agent source IDs and agent name fragments to logo image URLs.
 * Logos are bundled at build time by Vite.
 */

// Eagerly import all logos from the assets directory.
const logoModules = import.meta.glob("/src/assets/agent-logos/*", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

/** Lowercased filename (without extension) → resolved URL. */
const logoIndex: Record<string, string> = {};
for (const [filePath, url] of Object.entries(logoModules)) {
  const fileName = filePath.split("/").pop() ?? "";
  const stem = fileName.replace(/\.[^.]+$/, "").toLowerCase();
  logoIndex[stem] = url;
}

/** Try to find a logo by candidate name stems (checked in order). */
function findLogo(candidates: string[]): string | undefined {
  for (const candidate of candidates) {
    const key = candidate.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (logoIndex[key]) return logoIndex[key];
  }
  return undefined;
}

/**
 * Resolve the logo URL for a given agent.
 * Accepts the official source owner ID, agent display name, or both.
 */
export function resolveAgentLogo(ownerId: string, agentName: string): string | undefined {
  return findLogo([
    ownerId,
    ownerId.replace(/-/g, ""),
    ownerId.replace(/-/g, ""),
    agentName,
    agentName.replace(/\s+/g, ""),
    agentName.replace(/\s+/g, "-"),
    // Common fuzzy fallbacks
    ...deriveAliases(ownerId, agentName),
  ]);
}

/** Generate fuzzy alias candidates from owner ID and agent name. */
function deriveAliases(ownerId: string, agentName: string): string[] {
  const aliases: string[] = [];
  const name = agentName.toLowerCase();

  // "Claude Code" → "claude"
  if (name.includes("claude")) aliases.push("claude", "claudy");
  // "Codex CLI" → "codex"
  if (name.includes("codex")) aliases.push("codex");
  // "Hermes runtime" → "hermesagent", "hermes-agent-logo-png-svg"
  if (name.includes("hermes")) aliases.push("hermesagent", "hermes-agent-logo-png-svg");
  // "GitHub Copilot" → "copilot"
  if (name.includes("copilot")) aliases.push("copilot");
  // "OpenCode" → "opencode"
  if (name.includes("opencode")) aliases.push("opencode", "opencodeRview", "OpenCodeReview".toLowerCase());
  // "Cursor" → "cursor"
  if (name.includes("cursor")) aliases.push("cursor");
  // "Gemini CLI" → "gemini"
  if (name.includes("gemini")) aliases.push("gemini");
  // "Qwen Code" → "qwen"
  if (name.includes("qwen")) aliases.push("qwen");
  // "Kilo Code" → "kilo"
  if (name.includes("kilo")) aliases.push("kilo", "kilocode", "kiloCLI".toLowerCase());
  // "Roo Code" → "roo"
  if (name.includes("roo")) aliases.push("roocode");
  // "OpenClaw" → "openclaw"
  if (name.includes("openclaw")) aliases.push("openclaw");
  // "Antigravity" → "antigravity"
  if (name.includes("antigravity")) aliases.push("antigravity", "antigravityCLI".toLowerCase());
  // "Goose" → "goose"
  if (name.includes("goose")) aliases.push("goose");
  // "Warp" → "warp"
  if (name.includes("warp")) aliases.push("warp");
  // "Grok Build" → "grok"
  if (name.includes("grok")) aliases.push("grokbuild");
  // "Jcode" → "jcode"
  if (name.includes("jcode")) aliases.push("jcode");
  // "MiMo Code" → "mimo"
  if (name.includes("mimo")) aliases.push("mimocode");
  // "Mux" → "mux"
  if (name.includes("mux")) aliases.push("mux");
  // "Crush" → "crush"
  if (name.includes("crush")) aliases.push("crush");
  // "Amp" → "amp"
  if (name.includes("amp")) aliases.push("amp");
  // "Factory Droid" → "droid"
  if (name.includes("droid") || name.includes("factory")) aliases.push("droid");
  // "Kimi Code" → "kimi"
  if (name.includes("kimi")) aliases.push("kimi");
  // "Zed" → "zedagent"
  if (name.includes("zed")) aliases.push("zedagent");
  // "Kiro" → "kiro"
  if (name.includes("kiro")) aliases.push("kiro");
  // "Cline" → "cline"
  if (name.includes("cline")) aliases.push("cline");
  // "Sakana Fugu" → "sakanafugu"
  if (name.includes("sakana") || name.includes("fugu")) aliases.push("sakanafugu");
  // "Pi" → "pi"
  if (name === "pi" || ownerId === "pi") aliases.push("pi");
  // Shared
  if (ownerId === "shared" || name.includes("공유")) aliases.push("hermesagent");

  return aliases;
}
