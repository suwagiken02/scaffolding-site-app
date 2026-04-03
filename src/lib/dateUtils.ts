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

/** 昨日の日付キー（ローカル） */
export function yesterdayLocalDateKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return formatLocalDateKey(d);
}

/**
 * 今週（月曜〜日曜、ローカル）の各日の日付キー。先頭が月曜、末尾が日曜。
 */
export function thisWeekLocalDateKeys(): readonly string[] {
  const d = new Date();
  const day = d.getDay(); // 0=日 … 6=土
  const daysFromMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(d);
  monday.setDate(d.getDate() - daysFromMonday);
  const keys: string[] = [];
  for (let i = 0; i < 7; i++) {
    const x = new Date(monday);
    x.setDate(monday.getDate() + i);
    keys.push(formatLocalDateKey(x));
  }
  return keys;
}
