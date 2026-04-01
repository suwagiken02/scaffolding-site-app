import type { Site } from "../types/site";
import { todayLocalDateKey } from "./dateUtils";
import {
  getLatestLaborDateKeyAcrossKinds,
  siteHasHaraiWorkEnded,
} from "./siteDailyLaborStorage";

/** 最終作業日からこの日数以上空いていれば警告対象になりうる */
export const REMOVAL_FOLLOW_UP_IDLE_DAYS = 30;

function wholeCalendarDaysBetween(fromKey: string, toKey: string): number {
  const [y1, m1, d1] = fromKey.split("-").map(Number);
  const [y2, m2, d2] = toKey.split("-").map(Number);
  if (
    !y1 ||
    !m1 ||
    !d1 ||
    !y2 ||
    !m2 ||
    !d2 ||
    fromKey.length < 10 ||
    toKey.length < 10
  ) {
    return -Infinity;
  }
  const t0 = Date.UTC(y1, m1 - 1, d1);
  const t1 = Date.UTC(y2, m2 - 1, d2);
  return Math.floor((t1 - t0) / 86400000);
}

/**
 * 一覧の「要確認」警告の対象か。
 * 払いで作業終了打刻あり・撤去完了未登録・最終作業から30日以上・無視フラグなし をすべて満たすとき true。
 */
export function siteNeedsRemovalFollowUpWarning(site: Site): boolean {
  if (site.ignoreSiteListWarning) return false;
  if (site.scaffoldingRemovalCompletedAt?.trim()) return false;
  if (!siteHasHaraiWorkEnded(site.id)) return false;
  const lastLabor = getLatestLaborDateKeyAcrossKinds(site.id);
  if (!lastLabor) return false;
  const today = todayLocalDateKey();
  return wholeCalendarDaysBetween(lastLabor, today) >= REMOVAL_FOLLOW_UP_IDLE_DAYS;
}
