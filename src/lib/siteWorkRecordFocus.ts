import type { WorkKind } from "../types/workKind";

export const FOCUS_SITE_WORK_RECORD = "focusSiteWorkRecord";

export type FocusSiteWorkRecordDetail = {
  siteId: string;
  dateKey: string;
  workKind: WorkKind;
};

/**
 * 作業記録アコーディオン行のスクロール先 id。
 * 日付・作業種別（全角）や、データ不整合で混入しうる引用符などをそのまま id に含めると、
 * 一部環境で DOM/CSS まわりの不具合や同一レンダー内の兄弟（写真アップロード欄）まで描画失敗の原因になるため、
 * ASCII のみの安定したトークンにエンコードする。
 */
export function siteWorkRecordElementId(
  dateKey: string,
  workKind: WorkKind
): string {
  const raw = `${dateKey}\0${workKind}`;
  const bytes = new TextEncoder().encode(raw);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  const b64 = btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `site-work-record-${b64}`;
}
