import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCaptured } from "./smoke-cleanup.mjs";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const { name: packageName, version: packageVersion } = JSON.parse(
  await readFile(join(packageRoot, "package.json"), "utf8"),
);

export function parsePackJson(stdout) {
  for (let index = stdout.lastIndexOf("["); index >= 0; index = stdout.lastIndexOf("[", index - 1)) {
    try {
      const value = JSON.parse(stdout.slice(index).trim());
      if (Array.isArray(value)) return value;
    } catch {
      // Lifecycle output can precede the final npm pack JSON document.
    }
  }
  throw new Error(`Could not find the npm pack JSON document in output:\n${stdout}`);
}

export function inspectPack(packJson) {
  if (!Array.isArray(packJson) || packJson.length !== 1) {
    throw new Error("npm pack --json did not describe exactly one package");
  }
  const pack = packJson[0];
  if (pack.name !== packageName || pack.version !== packageVersion) {
    throw new Error(`Unexpected packed package: ${pack.name}@${pack.version}`);
  }
  if (pack.filename !== `${packageName}-${packageVersion}.tgz`) {
    throw new Error(`Unexpected tarball filename: ${pack.filename}`);
  }
  if (!Array.isArray(pack.files) || pack.files.length === 0) {
    throw new Error("npm pack --json returned no package files");
  }

  const entries = pack.files.map(({ path }) => `package/${path.replace(/^package\//, "")}`);
  const entrySet = new Set(entries);
  const required = [
    "package/bin/skill-manage.mjs",
    "package/dist/server/entry.mjs",
    "package/README.md",
    "package/LICENSE",
    "package/package.json",
  ];
  for (const path of required) {
    if (!entrySet.has(path)) throw new Error(`Required package entry is missing: ${path}`);
  }
  if (!entries.some((path) => path.startsWith("package/dist/client/") && !path.endsWith("/"))) {
    throw new Error("Required package client assets are missing");
  }

  const forbidden = entries.filter((path) => {
    const lower = path.toLowerCase();
    return lower.startsWith("package/src/")
      || lower.startsWith("package/docs/")
      || lower.startsWith("package/scripts/")
      || /(^|\/)\.env(?:\.|$)/.test(lower)
      || /(^|\/)(__tests__|tests?)(\/|$)/.test(lower)
      || /\.(test|spec)\.[^/]+$/.test(lower);
  });
  if (forbidden.length > 0) {
    throw new Error(`Forbidden package entries found:\n${forbidden.join("\n")}`);
  }
  if (new Set(entries).size !== entries.length) {
    throw new Error("npm pack --json returned duplicate package entries");
  }

  return { pack, entries };
}

export async function createValidatedPack(packageRoot, options = {}) {
  const {
    makeTemp = () => mkdtemp(join(tmpdir(), "skill-manage-package-pack-")),
    runPack = runCaptured,
  } = options;
  const directory = await makeTemp();

  try {
    const { stdout } = await runPack("npm", [
      "pack",
      "--json",
      "--pack-destination",
      directory,
    ], { cwd: packageRoot });
    const { pack, entries } = inspectPack(parsePackJson(stdout));
    return {
      directory,
      tarballPath: resolve(directory, pack.filename),
      pack,
      entries,
    };
  } catch (error) {
    try {
      await rm(directory, { recursive: true, force: true });
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Package validation and pack-directory cleanup failed");
    }
    throw error;
  }
}
