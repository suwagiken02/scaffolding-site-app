import { removeSite } from "./siteStorage";
import { removeAllPhotosForSite } from "./sitePhotoStorage";
import { removeAllDocumentsForSite } from "./siteDocumentStorage";
import { removeSiteRecipientSelection } from "./siteNotificationRecipientStorage";
import { removeAllDailyLaborForSite } from "./siteDailyLaborStorage";

/** 現場情報・写真・書類・通知先設定・日別人工を localStorage からまとめて削除する */
export function purgeSiteData(siteId: string): void {
  removeSite(siteId);
  removeAllPhotosForSite(siteId);
  removeAllDocumentsForSite(siteId);
  removeSiteRecipientSelection(siteId);
  removeAllDailyLaborForSite(siteId);
}
