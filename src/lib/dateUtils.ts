/** ローカル日付を YYYY-MM-DD で返す */
export function formatLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** ISO 文字列をローカル日付キーに変換 */
export function isoToLocalDateKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return formatLocalDateKey(d);
}

export function todayLocalDateKey(): string {
  return formatLocalDateKey(new Date());
}

/** 明日の日付キー（ローカル） */
export function tomorrowLocalDateKey(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return formatLocalDateKey(d);
}
