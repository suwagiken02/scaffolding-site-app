import { loadSites } from "./siteStorage";
import type { ActivityRole, ActivityRow } from "./workerActivity";
import {
  buildActivityRowsForPerson,
  filterRowsByMonth,
} from "./workerActivity";

export type LaborListRow =
  | { kind: "holiday"; dateKey: string }
  | {
      kind: "work";
      dateKey: string;
      /** 同日複数現場は「・」区切り（作業開始打刻ベース） */
      siteNamesLabel: string;
      /** 職長・子方など */
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

function roleSortKey(role: ActivityRole): number {
  return role === "職長" ? 0 : 1;
}

/**
 * 稼働管理「一覧」・個人ページ勤怠：日付ごとに1行。
 * 現場名は作業開始打刻があり、その日そのメンバーが参加している現場を「・」で結合。
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
  const byDate = new Map<string, ActivityRow[]>();
  for (const r of rowsInMonth) {
    const list = byDate.get(r.dateKey) ?? [];
    list.push(r);
    byDate.set(r.dateKey, list);
  }
  const days = daysInMonthDateKeys(year, month).sort((a, b) =>
    b.localeCompare(a)
  );
  return days.map((dk) => {
    const rows = byDate.get(dk);
    if (!rows || rows.length === 0) {
      return { kind: "holiday" as const, dateKey: dk };
    }
    const siteById = new Map<string, string>();
    const roles = new Set<ActivityRole>();
    for (const r of rows) {
      siteById.set(r.siteId, r.siteName);
      roles.add(r.role);
    }
    const siteNamesLabel = [...siteById.values()]
      .sort((a, b) => jaCollator.compare(a, b))
      .join("・");
    const work = [...roles]
      .sort((a, b) => roleSortKey(a) - roleSortKey(b))
      .join("・");
    return {
      kind: "work" as const,
      dateKey: dk,
      siteNamesLabel,
      work,
    };
  });
}
