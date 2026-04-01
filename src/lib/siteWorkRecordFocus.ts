import type { WorkKind } from "../types/workKind";

export const FOCUS_SITE_WORK_RECORD = "focusSiteWorkRecord";

export type FocusSiteWorkRecordDetail = {
  siteId: string;
  dateKey: string;
  workKind: WorkKind;
};

/** 作業記録アコーディオン行のスクロール先 id */
export function siteWorkRecordElementId(
  dateKey: string,
  workKind: WorkKind
): string {
  return `site-work-record-${dateKey}__${workKind}`;
}
