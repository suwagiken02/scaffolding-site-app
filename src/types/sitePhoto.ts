export const PHOTO_CATEGORIES = [
  "入場時",
  "休憩①",
  "休憩②",
  "休憩③",
  "終了時",
] as const;

export type PhotoCategory = (typeof PHOTO_CATEGORIES)[number];

export const PHOTO_CATEGORY_LABELS: Record<PhotoCategory, string> = {
  入場時: "入場時",
  "休憩①": "休憩①",
  "休憩②": "休憩②",
  "休憩③": "休憩③",
  終了時: "終了時",
};

/** 日報・一覧での並び順 */
export const PHOTO_CATEGORY_ORDER: readonly PhotoCategory[] = [
  "入場時",
  "休憩①",
  "休憩②",
  "休憩③",
  "終了時",
] as const;

export type SitePhoto = {
  id: string;
  /** data:image/...;base64,... */
  dataUrl: string;
  /** アップロード日時（ISO 8601） */
  uploadedAt: string;
  /** 元のファイル名（表示用） */
  fileName: string;
  /** 撮影・登録の種別 */
  category: PhotoCategory;
};
