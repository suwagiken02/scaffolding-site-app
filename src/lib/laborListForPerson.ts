import { loadSites } from "./siteStorage";
import {
  buildActivityRowsForPerson,
  filterRowsByMonth,
} from "./workerActivity";

export type LaborListRow =
  | { kind: "holiday"; dateKey: string }
  | {
      kind: "work";
      dateKey: string;
      siteId: string;
      siteName: string;
      work: string;
    };

function dateKey(y: number, m1: number, d: number): string {
  return `${y}-${String(m1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function daysInMonthDateKeys(y: number, m1: number): string[] {
  const last = new Date(y, m1, 0).getDate();
  const out: string[] = [];
  for (let d = 1; d <= last; d++) out.push(dateKey(y, m1, d));
  return out;
}

/**
 * 稼働管理「一覧」タブと同じ行構成（日付・現場・作業内容・打刻列は別途結合）
 */
export function buildLaborListRowsForPerson(
  personName: string,
  year: number,
  month: number,
  jaCollator: Intl.Collator
): LaborListRow[] {
  if (!personName) return [];
  const sites = loadSites();
  const allRows = buildActivityRowsForPerson(sites, personName);
  const rowsInMonth = filterRowsByMonth(allRows, year, month);
  const byDate = new Map<
    string,
    { siteId: string; siteName: string; roles: Set<string> }[]
  >();
  for (const r of rowsInMonth) {
    const list = byDate.get(r.dateKey) ?? [];
    const existing = list.find((x) => x.siteId === r.siteId);
    if (existing) existing.roles.add(r.role);
    else list.push({ siteId: r.siteId, siteName: r.siteName, roles: new Set([r.role]) });
    byDate.set(r.dateKey, list);
  }
  const days = daysInMonthDateKeys(year, month).sort((a, b) => b.localeCompare(a));
  return days.flatMap((dk) => {
    const items = byDate.get(dk);
    if (!items || items.length === 0) {
      return [{ kind: "holiday" as const, dateKey: dk }];
    }
    return items
      .slice()
      .sort((a, b) => jaCollator.compare(a.siteName, b.siteName))
      .map((it) => ({
        kind: "work" as const,
        dateKey: dk,
        siteId: it.siteId,
        siteName: it.siteName,
        work: [...it.roles].join("・"),
      }));
  });
}
