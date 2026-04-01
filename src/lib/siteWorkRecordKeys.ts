import type { WorkKind } from "../types/workKind";
import { WORK_KINDS } from "../types/workKind";
import { listDateKeysForSiteWork } from "./siteDailyLaborStorage";
import { listPhotoDateKeysForSiteWork } from "./sitePhotoStorage";

/**
 * 作業記録一覧（SiteWorkRecordList）と同じ日付集合。
 * 人工または写真のいずれかがある日を含む。
 */
export function dateKeysForSiteWorkKind(
  siteId: string,
  workKind: WorkKind
): string[] {
  const pk = listPhotoDateKeysForSiteWork(siteId, workKind);
  return listDateKeysForSiteWork(siteId, workKind, pk);
}

/** いずれかの作業種別で「作業記録」行が1件以上あるか */
export function siteHasAnyWorkRecordRows(siteId: string): boolean {
  return WORK_KINDS.some((k) => dateKeysForSiteWorkKind(siteId, k).length > 0);
}

/** 払いの作業記録が1件以上あるか（現場ステータス「設置中」判定用） */
export function siteHasHaraiWorkRecordRows(siteId: string): boolean {
  return dateKeysForSiteWorkKind(siteId, "払い").length > 0;
}
