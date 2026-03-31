import type { Site } from "../types/site";
import { WORK_KINDS } from "../types/workKind";
import {
  loadPhotosForSiteWorkDate,
  listPhotoDateKeysForSiteWork,
} from "./sitePhotoStorage";
import { loadDailyLaborMap } from "./siteDailyLaborStorage";

export type ActivityRole = "職長" | "子方";

export type ActivityRow = {
  dateKey: string;
  siteId: string;
  siteName: string;
  role: ActivityRole;
};

/** 現場の全作業種別をまたぎ、「入場時」写真がある日付（重複なし・昇順） */
export function getSiteDatesWithEntryPhoto(siteId: string): string[] {
  const set = new Set<string>();
  for (const w of WORK_KINDS) {
    for (const dk of listPhotoDateKeysForSiteWork(siteId, w)) {
      const photos = loadPhotosForSiteWorkDate(siteId, w, dk);
      if (photos.some((p) => p.category === "入場時")) set.add(dk);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

function namesEqual(a: string, b: string): boolean {
  return a.trim() === b.trim();
}

/**
 * 対象者名が現場の職長・子方として登録され、入場時写真がある日の一覧（役割ごとに行を分ける）
 */
export function buildActivityRowsForPerson(
  sites: Site[],
  personName: string
): ActivityRow[] {
  const norm = personName.trim();
  if (!norm) return [];
  const rows: ActivityRow[] = [];
  for (const site of sites) {
    const entryDates = getSiteDatesWithEntryPhoto(site.id);
    if (entryDates.length === 0) continue;
    for (const dk of entryDates) {
      let hasAnyLaborForDate = false;
      let hasAnyMemberData = false;
      let isForeman = false;
      let isKogata = false;

      for (const w of WORK_KINDS) {
        const labor = loadDailyLaborMap(site.id, w)[dk];
        if (!labor) continue;
        hasAnyLaborForDate = true;

        if (
          labor.memberForemanNames.length > 0 ||
          labor.memberKogataNames.length > 0
        ) {
          hasAnyMemberData = true;
        }

        if (labor.memberForemanNames.some((n) => namesEqual(n, norm))) {
          isForeman = true;
        }
        if (labor.memberKogataNames.some((n) => namesEqual(n, norm))) {
          isKogata = true;
        }
      }

      // 旧データ：参加メンバーが未登録のままでも、現場の職長/子方名でフォールバック
      if (!hasAnyLaborForDate || !hasAnyMemberData) {
        isForeman = namesEqual(site.foremanName, norm);
        isKogata = site.kogataNames.some((k) => namesEqual(k, norm));
      }

      if (isForeman) {
        rows.push({ dateKey: dk, siteId: site.id, siteName: site.name, role: "職長" });
      }
      if (isKogata) {
        rows.push({ dateKey: dk, siteId: site.id, siteName: site.name, role: "子方" });
      }
    }
  }
  const collator = new Intl.Collator("ja");
  return rows.sort((a, b) => {
    const d = a.dateKey.localeCompare(b.dateKey);
    if (d !== 0) return d;
    const s = collator.compare(a.siteName, b.siteName);
    if (s !== 0) return s;
    return a.role.localeCompare(b.role);
  });
}

export function monthPrefix(year: number, month1to12: number): string {
  const m = String(month1to12).padStart(2, "0");
  return `${year}-${m}`;
}

export function filterRowsByMonth(
  rows: ActivityRow[],
  year: number,
  month1to12: number
): ActivityRow[] {
  const prefix = monthPrefix(year, month1to12);
  return rows.filter((r) => r.dateKey.slice(0, 7) === prefix);
}

export type ActivitySummary = {
  foremanDistinctDays: number;
  kogataDistinctDays: number;
  totalDistinctDays: number;
};

export function summarizeMonth(rowsInMonth: ActivityRow[]): ActivitySummary {
  const foremanDates = new Set<string>();
  const kogataDates = new Set<string>();
  const allDates = new Set<string>();
  for (const r of rowsInMonth) {
    allDates.add(r.dateKey);
    if (r.role === "職長") foremanDates.add(r.dateKey);
    else kogataDates.add(r.dateKey);
  }
  return {
    foremanDistinctDays: foremanDates.size,
    kogataDistinctDays: kogataDates.size,
    totalDistinctDays: allDates.size,
  };
}
