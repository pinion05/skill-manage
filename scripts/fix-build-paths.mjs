/**
 * Astro Node standalone adapter가 빌드 시 dist/server/entry.mjs에
 * 빌드 머신의 절대경로(file:///home/runner/work/...)를 하드코딩한다.
 * 이 경로는 다른 OS(Windows)에서 fileURLToPath로 변환하면
 * ERR_INVALID_FILE_URL_PATH 크래시가 발생한다.
 *
 * 이 스크립트는 entry.mjs의 하드코딩된 절대 file URL을
 * import.meta.url 기반 동적 경로로 교체한다.
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const entryPath = join(here, "..", "dist", "server", "entry.mjs");

const source = await readFile(entryPath, "utf8");

// 패턴: var client = "file:///.../dist/client/";
//       var server = "file:///.../dist/server/";
const clientPattern = /var client = "file:\/\/[^"]*\/dist\/client\/"/;
const serverPattern = /var server = "file:\/\/[^"]*\/dist\/server\/"/;

const clientMatch = source.match(clientPattern);
const serverMatch = source.match(serverPattern);

if (!clientMatch || !serverMatch) {
  // 이미 패치된 경우 (idempotent) — 성공 종료
  if (source.includes('new URL("../client/", import.meta.url)') &&
      source.includes('new URL(".", import.meta.url)')) {
    console.log("[fix-build-paths] 이미 패치된 상태입니다. 건너뜁니다.");
    process.exit(0);
  }
  // ponytail: 패턴 미스매치는 빌드 산출물 손상 → 조용히 넘기면 Windows 크래시 재발
  console.error("[fix-build-paths] entry.mjs에서 빌드 경로를 찾지 못했습니다. 빌드 산출물이 손상되었을 수 있습니다.");
  process.exit(1);
}

const patched = source
  .replace(clientPattern, 'var client = new URL("../client/", import.meta.url).href')
  .replace(serverPattern, 'var server = new URL(".", import.meta.url).href');

await writeFile(entryPath, patched, "utf8");
console.log("[fix-build-paths] 빌드 경로를 import.meta.url 기반으로 교체했습니다.");
