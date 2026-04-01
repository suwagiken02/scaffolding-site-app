import type { Site } from "../types/site";
import {
  siteHasAnyWorkStartPressed,
  siteHasHaraiWorkEnded,
} from "./siteDailyLaborStorage";
import { siteHasAnyWorkRecordRows } from "./siteWorkRecordKeys";

export type SiteDisplayStatus = "組立前" | "設置中" | "解体中" | "終了";

/**
 * 現場一覧・外部ポータル共通の表示ステータス。
 * 撤去完了 → 終了／払いで作業終了打刻 → 解体中／いずれかで作業開始打刻 → 設置中／記録なし → 組立前。
 * 作業記録はあるが開始打刻のみ未の場合は組立前。
 */
export function computeSiteDisplayStatus(site: Site): SiteDisplayStatus {
  if (site.scaffoldingRemovalCompletedAt?.trim()) return "終了";
  if (siteHasHaraiWorkEnded(site.id)) return "解体中";
  if (siteHasAnyWorkStartPressed(site.id)) return "設置中";
  if (!siteHasAnyWorkRecordRows(site.id)) return "組立前";
  return "組立前";
}
