import { readFile, stat } from "node:fs/promises";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import type { SkillContent, SkillRecord } from "./types";

const MAX_SKILL_FILE_BYTES = 1024 * 1024;
const ACCEPTED_FILE_NAMES = new Set(["skill.md", "skills.md"]);

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

  const fileStat = await stat(record.path);
  if (!fileStat.isFile()) {
    throw new InvalidSkillFileError("skill 경로가 일반 파일이 아닙니다.");
  }
  if (fileStat.size > MAX_SKILL_FILE_BYTES) {
    throw new InvalidSkillFileError("skill 파일은 1 MiB보다 클 수 없습니다.");
  }

  const markdown = await readFile(record.path, "utf8");
  const unsafeHtml = await marked.parse(markdown, { gfm: true });
  const html = sanitizeHtml(unsafeHtml, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      img: ["src", "alt", "title"],
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
}
