import type { SkillRecord } from "../inventory/types";

export interface DuplicateSkillGroup {
  key: string;
  name: string;
  installs: SkillRecord[];
}

const collator = new Intl.Collator(["ko", "en"], {
  numeric: true,
  sensitivity: "base",
});

function compareText(left: string, right: string): number {
  const comparison = collator.compare(left, right);
  if (comparison !== 0) return comparison;
  return left < right ? -1 : left > right ? 1 : 0;
}

export function normalizeSkillName(name: string): string {
  return name.normalize("NFKC").trim().toLocaleLowerCase();
}

export function groupDuplicateSkills(records: SkillRecord[]): DuplicateSkillGroup[] {
  const grouped = new Map<string, SkillRecord[]>();
  for (const record of records) {
    if (record.recordType !== "skill") continue;
    const key = normalizeSkillName(record.name);
    if (!key) continue;
    const installs = grouped.get(key);
    if (installs) installs.push(record);
    else grouped.set(key, [record]);
  }

  return [...grouped.entries()]
    .filter(([, installs]) => installs.length > 1)
    .map(([key, recordsForName]) => ({
      key,
      name: recordsForName[0]!.name.trim() || key,
      installs: recordsForName.toSorted((left, right) => compareText(left.path, right.path)),
    }))
    .toSorted((left, right) => compareText(left.key, right.key));
}
