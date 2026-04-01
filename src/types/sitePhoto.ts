export const PHOTO_CATEGORIES = [
  "入場時",
  "休憩①",
  "休憩②",
  "休憩③",
  "終了時",
  "記録",
] as const;

export type PhotoCategory = (typeof PHOTO_CATEGORIES)[number];

export const PHOTO_CATEGORY_LABELS: Record<PhotoCategory, string> = {
  入場時: "入場時",
  "休憩①": "休憩①",
  "休憩②": "休憩②",
  "休憩③": "休憩③",
  終了時: "終了時",
  記録: "記録",
};

/** 日報・一覧での並び順 */
export const PHOTO_CATEGORY_ORDER: readonly PhotoCategory[] = [
  "入場時",
  "休憩①",
  "休憩②",
  "休憩③",
  "終了時",
  "記録",
] as const;

export type SitePhoto = {
  id: string;
  /** 公開URL（Cloudflare R2 等）。あれば表示に優先使用 */
  url?: string;
  /** 従来の data:image/...;base64,...（ローカル保存・移行データ） */
  dataUrl?: string;
  /** アップロード日時（ISO 8601） */
  uploadedAt: string;
  /** 元のファイル名（表示用） */
  fileName: string;
  /** 撮影・登録の種別 */
  category: PhotoCategory;
};

/** img の src 用（url 優先、なければ dataUrl） */
export function sitePhotoDisplaySrc(p: SitePhoto): string {
  const u = p.url?.trim();
  if (u && /^https?:\/\//i.test(u)) return u;
  const d = p.dataUrl?.trim();
  if (d) return d;
  return "";
}
