import type { SiteDailyLaborRecord } from "../types/siteDailyLabor";

/** 旧 joyo* フィールドを含めて作業開始時刻を取得 */
export function getWorkStartIso(
  r: SiteDailyLaborRecord | undefined
): string | null {
  if (!r) return null;
  const w = r.workStartIso ?? r.joyoWorkStartIso;
  return typeof w === "string" && w.length > 0 ? w : null;
}

/** 旧 joyo* フィールドを含めて作業終了時刻を取得 */
export function getWorkEndIso(
  r: SiteDailyLaborRecord | undefined
): string | null {
  if (!r) return null;
  const w = r.workEndIso ?? r.joyoWorkEndIso;
  return typeof w === "string" && w.length > 0 ? w : null;
}
