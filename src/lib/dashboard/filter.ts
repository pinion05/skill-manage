import type { SkillKind, SkillRecord } from "../inventory/types";

export interface DashboardQuery {
  search: string;
  kinds: SkillKind[];
  roots: string[];
  sort: "name" | "path" | "modified";
  direction: "asc" | "desc";
}

const collator = new Intl.Collator(["ko", "en"], {
  numeric: true,
  sensitivity: "base",
});

export function applySkillQuery(records: SkillRecord[], query: DashboardQuery): SkillRecord[] {
  const search = query.search.trim().toLocaleLowerCase();
  const kinds = new Set(query.kinds);
  const roots = new Set(query.roots);

  const filtered = records.filter((record) => {
    if (kinds.size > 0 && !kinds.has(record.kind)) return false;
    if (roots.size > 0 && !roots.has(record.configRoot)) return false;
    if (!search) return true;

    const haystack = [
      record.name,
      record.description,
      record.path,
      record.configRoot,
      record.agent,
    ]
      .join("\n")
      .toLocaleLowerCase();
    return haystack.includes(search);
  });

  const direction = query.direction === "desc" ? -1 : 1;
  return filtered.toSorted((left, right) => {
    let comparison = 0;
    if (query.sort === "modified") {
      comparison = new Date(left.modifiedAt).getTime() - new Date(right.modifiedAt).getTime();
    } else if (query.sort === "path") {
      comparison = collator.compare(left.path, right.path);
    } else {
      comparison = collator.compare(left.name, right.name) || collator.compare(left.path, right.path);
    }
    return comparison * direction;
  });
}
