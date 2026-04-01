/** 現場に紐づく書類（R2 メタデータを localStorage に保持） */
export type SiteDocument = {
  id: string;
  /** 表示用（元のファイル名） */
  fileName: string;
  uploadedAt: string;
  /** 公開 URL（R2） */
  url: string;
  /** R2 オブジェクトキー（削除用） */
  r2Key: string;
};
