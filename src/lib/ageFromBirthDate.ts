/** 生年月日 YYYY-MM-DD から満年齢（参考表示） */
export function ageFromBirthDate(birthDate: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  const today = new Date();
  let age = today.getFullYear() - y;
  const tm = today.getMonth() + 1;
  const td = today.getDate();
  if (mo > tm || (mo === tm && d > td)) age -= 1;
  return age;
}
