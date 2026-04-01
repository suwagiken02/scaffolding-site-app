import type { StaffBirthdayLeaveUsage, StaffPaidLeaveUsage } from "../types/staffMaster";
import { formatLocalDateKey } from "./dateUtils";

export type { StaffBirthdayLeaveUsage, StaffPaidLeaveUsage };

function parseYmd(s: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return { y, m: mo, d };
}

function ymdToDate(parts: { y: number; m: number; d: number }): Date {
  return new Date(parts.y, parts.m - 1, parts.d, 12, 0, 0);
}

function dateToYmd(d: Date): string {
  return formatLocalDateKey(d);
}

function addMonths(hire: Date, months: number): Date {
  const x = new Date(hire.getFullYear(), hire.getMonth(), hire.getDate(), 12, 0, 0);
  x.setMonth(x.getMonth() + months);
  return x;
}

function addYears(d: Date, years: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
  x.setFullYear(x.getFullYear() + years);
  return x;
}

/** 入社日基準の有給付与スケジュール（将来分も含む） */
export function buildPaidGrantSchedule(hireDate: string): { grantKey: string; days: number }[] {
  const p = parseYmd(hireDate);
  if (!p) return [];
  const hire = ymdToDate(p);
  const out: { grantKey: string; days: number }[] = [];

  const fixed: [number, number][] = [
    [6, 10],
    [18, 11],
    [30, 12],
    [42, 14],
    [54, 16],
    [66, 18],
  ];
  for (const [mo, days] of fixed) {
    out.push({ grantKey: dateToYmd(addMonths(hire, mo)), days });
  }
  let m = 78;
  for (let i = 0; i < 64; i++) {
    out.push({ grantKey: dateToYmd(addMonths(hire, m)), days: 20 });
    m += 12;
  }
  return out;
}

export type PaidLeaveBucketState = {
  grantKey: string;
  grantDays: number;
  expireKey: string;
  remainingDays: number;
};

type InternalBucket = {
  grantKey: string;
  grantDays: number;
  expireKey: string;
  remaining: number;
};

function simulateBuckets(
  bucketsIn: InternalBucket[],
  sortedUsages: StaffPaidLeaveUsage[],
  asOfKey: string
): InternalBucket[] {
  const buckets = bucketsIn.map((b) => ({ ...b, remaining: b.grantDays }));

  function expireBucketsBefore(usageKey: string) {
    for (const b of buckets) {
      if (b.expireKey < usageKey) b.remaining = 0;
    }
  }

  for (const u of sortedUsages) {
    if (u.dateKey > asOfKey) continue;
    expireBucketsBefore(u.dateKey);
    let need = u.days;
    for (const b of buckets) {
      if (need <= 0) break;
      if (b.grantKey > u.dateKey) continue;
      if (b.expireKey < u.dateKey) continue;
      if (b.remaining <= 0) continue;
      const take = Math.min(b.remaining, need);
      b.remaining -= take;
      need -= take;
    }
  }

  expireBucketsBefore(asOfKey);
  for (const b of buckets) {
    if (b.expireKey < asOfKey) b.remaining = 0;
  }

  return buckets;
}

/**
 * 付与から2年で時効。古い付与から先に消費（FIFO）。
 */
export function computePaidLeaveBuckets(
  hireDate: string,
  usages: StaffPaidLeaveUsage[],
  asOf: Date = new Date()
): {
  hireValid: boolean;
  buckets: PaidLeaveBucketState[];
  totalUsed: number;
  remainingTotal: number;
  sortedUsages: StaffPaidLeaveUsage[];
} {
  const asOfKey = formatLocalDateKey(asOf);
  const p = parseYmd(hireDate);
  if (!p) {
    return {
      hireValid: false,
      buckets: [],
      totalUsed: 0,
      remainingTotal: 0,
      sortedUsages: [],
    };
  }

  const schedule = buildPaidGrantSchedule(hireDate);
  const sortedUsages = [...usages]
    .filter((u) => u.days > 0 && parseYmd(u.dateKey))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));

  const internal: InternalBucket[] = [];
  for (const g of schedule) {
    if (g.grantKey > asOfKey) break;
    const gp = parseYmd(g.grantKey);
    if (!gp) continue;
    const gDate = ymdToDate(gp);
    const expireKey = dateToYmd(addYears(gDate, 2));
    internal.push({
      grantKey: g.grantKey,
      grantDays: g.days,
      expireKey,
      remaining: g.days,
    });
  }

  internal.sort((a, b) => a.grantKey.localeCompare(b.grantKey));
  const after = simulateBuckets(internal, sortedUsages, asOfKey);

  const totalUsed = sortedUsages
    .filter((u) => u.dateKey <= asOfKey)
    .reduce((s, u) => s + u.days, 0);

  const remainingTotal = after.reduce((s, b) => s + b.remaining, 0);

  return {
    hireValid: true,
    buckets: after.map((b) => ({
      grantKey: b.grantKey,
      grantDays: b.grantDays,
      expireKey: b.expireKey,
      remainingDays: b.remaining,
    })),
    totalUsed,
    remainingTotal,
    sortedUsages,
  };
}

export function nextPaidGrantInfo(
  hireDate: string,
  asOf: Date = new Date()
): { nextGrantKey: string; nextDays: number } | null {
  const asOfKey = formatLocalDateKey(asOf);
  const schedule = buildPaidGrantSchedule(hireDate);
  const next = schedule.find((g) => g.grantKey > asOfKey);
  if (!next) return null;
  return { nextGrantKey: next.grantKey, nextDays: next.days };
}

/** 誕生日が属する月に年1日付与（入社日以降の各年） */
export function countBirthdayGrants(
  birthDate: string,
  hireDate: string,
  asOf: Date = new Date()
): number {
  const b = parseYmd(birthDate);
  const h = parseYmd(hireDate);
  if (!b || !h) return 0;
  const asOfKey = formatLocalDateKey(asOf);
  let count = 0;
  const startY = h.y;
  const endParts = parseYmd(asOfKey);
  const endY = endParts?.y ?? h.y;
  for (let y = startY; y <= endY; y++) {
    const grantKey = `${y}-${String(b.m).padStart(2, "0")}-${String(b.d).padStart(2, "0")}`;
    const gp = parseYmd(grantKey);
    if (!gp) continue;
    const gDate = ymdToDate(gp);
    const hire = ymdToDate(h);
    if (gDate < hire) continue;
    if (grantKey > asOfKey) continue;
    count += 1;
  }
  return count;
}

export function birthdayLeaveRemaining(
  birthDate: string,
  hireDate: string,
  usages: StaffBirthdayLeaveUsage[],
  asOf: Date = new Date()
): number {
  const granted = countBirthdayGrants(birthDate, hireDate, asOf);
  const asOfKey = formatLocalDateKey(asOf);
  const used = usages
    .filter((u) => u.dateKey <= asOfKey)
    .reduce((s, u) => s + Math.max(0, u.days), 0);
  return Math.max(0, granted - used);
}

export type PaidLeaveHistoryRow = {
  kind: "grant" | "usage";
  dateKey: string;
  grantDays?: number;
  usageDays?: number;
  expireKey?: string;
  balanceAfter: number;
};

/** 付与・使用を時系列にし、各イベント直後の有給残日数 */
export function buildPaidLeaveHistory(
  hireDate: string,
  usages: StaffPaidLeaveUsage[],
  asOf: Date = new Date()
): PaidLeaveHistoryRow[] {
  const asOfKey = formatLocalDateKey(asOf);
  if (!parseYmd(hireDate)) return [];

  const schedule = buildPaidGrantSchedule(hireDate).filter((g) => g.grantKey <= asOfKey);
  const usageSorted = [...usages]
    .filter((u) => u.days > 0 && u.dateKey <= asOfKey)
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));

  type Ev =
    | { kind: "grant"; dateKey: string; days: number; expireKey: string }
    | { kind: "usage"; dateKey: string; days: number };

  const evs: Ev[] = [];
  for (const g of schedule) {
    const gp = parseYmd(g.grantKey);
    if (!gp) continue;
    evs.push({
      kind: "grant",
      dateKey: g.grantKey,
      days: g.days,
      expireKey: dateToYmd(addYears(ymdToDate(gp), 2)),
    });
  }
  for (const u of usageSorted) {
    evs.push({ kind: "usage", dateKey: u.dateKey, days: u.days });
  }
  evs.sort((a, b) => {
    const c = a.dateKey.localeCompare(b.dateKey);
    if (c !== 0) return c;
    return a.kind === "grant" ? -1 : 1;
  });

  const result: PaidLeaveHistoryRow[] = [];
  let applied: StaffPaidLeaveUsage[] = [];

  for (const ev of evs) {
    if (ev.kind === "grant") {
      const d = parseYmd(ev.dateKey);
      const at = d ? new Date(d.y, d.m - 1, d.d, 23, 59, 59) : asOf;
      const bal = computePaidLeaveBuckets(hireDate, applied, at).remainingTotal;
      result.push({
        kind: "grant",
        dateKey: ev.dateKey,
        grantDays: ev.days,
        expireKey: ev.expireKey,
        balanceAfter: bal,
      });
    } else {
      applied = [...applied, { dateKey: ev.dateKey, days: ev.days }];
      const bal = computePaidLeaveBuckets(hireDate, applied, asOf).remainingTotal;
      result.push({
        kind: "usage",
        dateKey: ev.dateKey,
        usageDays: ev.days,
        balanceAfter: bal,
      });
    }
  }

  return result;
}
