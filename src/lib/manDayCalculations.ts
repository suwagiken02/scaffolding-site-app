import type { SiteDailyLaborRecord } from "../types/siteDailyLabor";

/** 入場〜終了の実時間（時間単位、負にならない） */
export function hoursBetweenIso(startIso: string | null, endIso: string): number {
  if (!startIso) return 0;
  const a = new Date(startIso).getTime();
  const b = new Date(endIso).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, (b - a) / (1000 * 60 * 60));
}

/** 自社人工 = 時間差 × 人員数 ÷ 8 */
export function companyManDays(
  entryIso: string | null,
  endIso: string,
  workerCount: number
): number {
  const h = hoursBetweenIso(entryIso, endIso);
  const w = Number.isFinite(workerCount) && workerCount > 0 ? workerCount : 0;
  return (h * w) / 8;
}

/** 同日の HH:mm 同士の差（時間）。終了が開始以下なら 0 */
export function hoursBetweenHHmmSameDay(
  startHHmm: string,
  endHHmm: string
): number {
  const sm = parseHHmmToMinutes(startHHmm);
  const em = parseHHmmToMinutes(endHHmm);
  if (sm === null || em === null) return 0;
  return Math.max(0, (em - sm) / 60);
}

function parseHHmmToMinutes(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (
    !Number.isInteger(h) ||
    h < 0 ||
    h > 23 ||
    !Number.isInteger(min) ||
    (min !== 0 && min !== 30)
  ) {
    return null;
  }
  return h * 60 + min;
}

/** 手伝い人工 = 手伝い人数 × 手伝い時間(時間) ÷ 8 */
export function helpTeamManDays(
  helpHeadCount: number,
  startHHmm: string,
  endHHmm: string
): number {
  const h = hoursBetweenHHmmSameDay(startHHmm, endHHmm);
  const n = Number.isFinite(helpHeadCount) && helpHeadCount > 0 ? helpHeadCount : 0;
  return (n * h) / 8;
}

export function roundManDayOneDecimal(n: number): number {
  return Math.round(n * 10) / 10;
}

export function formatManDayOneDecimal(n: number): string {
  return roundManDayOneDecimal(n).toFixed(1);
}

/** 作業セッション：0〜3時間未満 → 0.5人工/人、3時間以上 → 1人工/人（時間は非負） */
export function sessionManDaysPerPersonFromHours(hours: number): number {
  if (!Number.isFinite(hours) || hours < 0) return 0.5;
  return hours >= 3 ? 1 : 0.5;
}

/** 登録人数（社員＝職長＋子方、請負＝人数） */
export function registeredMemberCountForLabor(l: SiteDailyLaborRecord): number {
  if (l.employmentKind === "請負") {
    const n = l.contractorPeopleCount;
    return typeof n === "number" && Number.isFinite(n) && n > 0
      ? Math.round(n)
      : 0;
  }
  return l.memberForemanNames.length + l.memberKogataNames.length;
}

export function workSessionTotalManDaysFromRecord(
  startIso: string | null,
  endIso: string,
  labor: SiteDailyLaborRecord
): { hours: number; perPerson: number; total: number } {
  const hours = hoursBetweenIso(startIso, endIso);
  const perPerson = sessionManDaysPerPersonFromHours(hours);
  const n = registeredMemberCountForLabor(labor);
  const total = roundManDayOneDecimal(perPerson * n);
  return { hours, perPerson, total };
}
