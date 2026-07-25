import { constants } from "node:fs";
import { open } from "node:fs/promises";
import process from "node:process";
import matter from "gray-matter";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import type { SkillContent, SkillRecord } from "./types";

const MAX_SKILL_FILE_BYTES = 1024 * 1024;
const ACCEPTED_FILE_NAMES = new Set(["skill.md", "skills.md"]);

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const markdownRenderer = new marked.Renderer();
markdownRenderer.html = ({ text }) => `<code class="raw-html">${escapeHtml(text)}</code>`;
markdownRenderer.image = ({ text }) => `<span>[이미지: ${escapeHtml(text || "설명 없음")}]</span>`;

export class InvalidSkillFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSkillFileError";
  }
}

export async function readSkillContent(record: SkillRecord): Promise<SkillContent> {
  if (!ACCEPTED_FILE_NAMES.has(record.fileName.toLowerCase())) {
    throw new InvalidSkillFileError("허용된 SKILL.md 파일이 아닙니다.");
  }

  let handle: Awaited<ReturnType<typeof open>>;
  try {
    // O_NOFOLLOW is not supported on Windows.
    const openFlags = process.platform === "win32"
      ? constants.O_RDONLY | constants.O_NONBLOCK
      : constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;
    handle = await open(record.path, openFlags);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ELOOP" || code === "EMLINK") {
      throw new InvalidSkillFileError("재검색 후 파일 경로가 심볼릭 링크로 바뀌었습니다.");
    }
    throw error;
  }

  try {
    const fileStat = await handle.stat();
    if (!fileStat.isFile()) {
      throw new InvalidSkillFileError("skill 경로가 일반 파일이 아닙니다.");
    }
    // Identity check: rely on dev/ino when meaningful. On Windows (ino === 0)
    // the inode is non-discriminating, so additionally compare size to reduce
    // the chance of accepting a replaced file at the same path.
    const identityChanged = fileStat.dev !== record.device
      || fileStat.ino !== record.inode
      || (record.inode === 0 && fileStat.size !== record.size);
    if (identityChanged) {
      throw new InvalidSkillFileError("재검색 후 파일 경로의 identity가 바뀌었습니다.");
    }
    if (fileStat.size > MAX_SKILL_FILE_BYTES) {
      throw new InvalidSkillFileError("skill 파일은 1 MiB보다 클 수 없습니다.");
    }

    const buffer = Buffer.alloc(MAX_SKILL_FILE_BYTES + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > MAX_SKILL_FILE_BYTES) {
      throw new InvalidSkillFileError("skill 파일은 1 MiB보다 클 수 없습니다.");
    }
    const markdown = buffer.subarray(0, bytesRead).toString("utf8");
    let renderableMarkdown = markdown;
    try {
      renderableMarkdown = matter(markdown).content;
    } catch {
      // Invalid frontmatter remains visible instead of making the read-only viewer fail.
    }
    const unsafeHtml = await marked.parse(renderableMarkdown, {
      gfm: true,
      renderer: markdownRenderer,
    });
    const html = sanitizeHtml(unsafeHtml, {
      allowedTags: sanitizeHtml.defaults.allowedTags,
      allowedAttributes: {
        a: ["href", "title", "target", "rel"],
        code: ["class"],
      },
      allowedSchemes: ["http", "https", "mailto"],
      transformTags: {
        a: (_tagName, attributes) => ({
          tagName: "a",
          attribs: { ...attributes, target: "_blank", rel: "noreferrer noopener" },
        }),
      },
    });

    return { id: record.id, path: record.path, markdown, html };
  } finally {
    await handle.close();
  }
}
