import type { SkillKind, SkillRecord, SkillRecordType } from "../inventory/types";

export interface DashboardQuery {
  search: string;
  kinds: SkillKind[];
  roots: string[];
  recordTypes: SkillRecordType[];
  sort: "name" | "path" | "modified";
  direction: "asc" | "desc";
}

export interface PageResult<T> {
  items: T[];
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
}

const collator = new Intl.Collator(["ko", "en"], {
  numeric: true,
  sensitivity: "base",
});

export function applySkillQuery(records: SkillRecord[], query: DashboardQuery): SkillRecord[] {
  const search = query.search.trim().toLocaleLowerCase();
  const kinds = new Set(query.kinds);
  const roots = new Set(query.roots);
  const recordTypes = new Set(query.recordTypes);

  const filtered = records.filter((record) => {
    if (kinds.size > 0 && !kinds.has(record.kind)) return false;
    if (roots.size > 0 && !roots.has(record.configRoot)) return false;
    if (recordTypes.size > 0 && !recordTypes.has(record.recordType)) return false;
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

export function paginate<T>(records: T[], requestedPage: number, requestedPageSize: number): PageResult<T> {
  const pageSize = Math.max(1, Math.floor(requestedPageSize) || 1);
  const pageCount = Math.max(1, Math.ceil(records.length / pageSize));
  const page = Math.min(pageCount, Math.max(1, Math.floor(requestedPage) || 1));
  const start = (page - 1) * pageSize;

  return {
    items: records.slice(start, start + pageSize),
    page,
    pageCount,
    pageSize,
    total: records.length,
  };
}
