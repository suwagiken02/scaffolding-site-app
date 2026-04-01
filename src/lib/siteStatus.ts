import type { Site } from "../types/site";
import {
  siteHaraiWorkSessionInProgress,
  siteKumiHasAnyWorkEndPressed,
  siteKumiWorkSessionInProgress,
} from "./siteDailyLaborStorage";
import { siteHasHaraiWorkRecordRows } from "./siteWorkRecordKeys";

export type SiteDisplayStatus =
  | "入場前"
  | "組立中"
  | "設置中"
  | "解体中"
  | "撤去済";

/**
 * 現場一覧・外部ポータル共通の表示ステータス。
 * 1 撤去済 → 2 解体中（払い開始済・未終了）→ 3 設置中（組み終了あり・払い記録なし）
 * → 4 組立中（組み開始済・未終了）→ 5 入場前。
 */
export function computeSiteDisplayStatus(site: Site): SiteDisplayStatus {
  if (site.scaffoldingRemovalCompletedAt?.trim()) return "撤去済";
  if (siteHaraiWorkSessionInProgress(site.id)) return "解体中";
  if (
    siteKumiHasAnyWorkEndPressed(site.id) &&
    !siteHasHaraiWorkRecordRows(site.id)
  ) {
    return "設置中";
  }
  if (siteKumiWorkSessionInProgress(site.id)) return "組立中";
  return "入場前";
}
