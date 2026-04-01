import type { SitePhoto } from "../types/sitePhoto";
import type { WorkKind } from "../types/workKind";
import { listDateKeysForSiteWork } from "./siteDailyLaborStorage";
import {
  listPhotoDateKeysForSiteWork,
  loadPhotosForSiteWorkDate,
} from "./sitePhotoStorage";

export type ProcessSummarySlot = {
  photo: SitePhoto;
  workKind: WorkKind;
  dateKey: string;
};

/** 作業記録の日付キー（写真・人工のいずれかがある日）、古い順 */
function recordDateKeysAsc(siteId: string, workKind: WorkKind): string[] {
  const pk = listPhotoDateKeysForSiteWork(siteId, workKind);
  const dks = listDateKeysForSiteWork(siteId, workKind, pk);
  return [...new Set(dks)].sort((a, b) => a.localeCompare(b));
}

function firstEntryPhoto(photos: SitePhoto[]): SitePhoto | null {
  const list = photos
    .filter((p) => p.category === "入場時")
    .sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
  return list[0] ?? null;
}

function firstEndPhoto(photos: SitePhoto[]): SitePhoto | null {
  const list = photos
    .filter((p) => p.category === "終了時")
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  return list[0] ?? null;
}

/**
 * 工程6点サマリー用に最大6枚を選ぶ（該当がなければスキップして次のルールへ）
 */
export function pickProcessSummaryPhotos(siteId: string): ProcessSummarySlot[] {
  const slots: ProcessSummarySlot[] = [];
  const kumi = recordDateKeysAsc(siteId, "組み");
  const nK = kumi.length;

  if (nK > 0) {
    const dk0 = kumi[0];
    const p1 = firstEntryPhoto(
      loadPhotosForSiteWorkDate(siteId, "組み", dk0)
    );
    if (p1) slots.push({ photo: p1, workKind: "組み", dateKey: dk0 });
  }

  if (nK > 0) {
    const idx2 = Math.max(0, Math.ceil(nK / 3) - 1);
    const dk2 = kumi[idx2];
    const p2 = firstEndPhoto(
      loadPhotosForSiteWorkDate(siteId, "組み", dk2)
    );
    if (p2) slots.push({ photo: p2, workKind: "組み", dateKey: dk2 });
  }

  if (nK > 0) {
    const dk3 = kumi[nK - 1];
    const p3 = firstEndPhoto(
      loadPhotosForSiteWorkDate(siteId, "組み", dk3)
    );
    if (p3) slots.push({ photo: p3, workKind: "組み", dateKey: dk3 });
  }

  const harai = recordDateKeysAsc(siteId, "払い");
  const nH = harai.length;

  if (nH > 0) {
    const dk4 = harai[0];
    const p4 = firstEntryPhoto(
      loadPhotosForSiteWorkDate(siteId, "払い", dk4)
    );
    if (p4) slots.push({ photo: p4, workKind: "払い", dateKey: dk4 });
  }

  if (nH > 0) {
    const idx5 = Math.min(nH - 1, Math.max(0, nH - Math.ceil(nH / 3)));
    const dk5 = harai[idx5];
    const p5 = firstEntryPhoto(
      loadPhotosForSiteWorkDate(siteId, "払い", dk5)
    );
    if (p5) slots.push({ photo: p5, workKind: "払い", dateKey: dk5 });
  }

  if (nH > 0) {
    const dk6 = harai[nH - 1];
    const p6 = firstEndPhoto(
      loadPhotosForSiteWorkDate(siteId, "払い", dk6)
    );
    if (p6) slots.push({ photo: p6, workKind: "払い", dateKey: dk6 });
  }

  return slots;
}
