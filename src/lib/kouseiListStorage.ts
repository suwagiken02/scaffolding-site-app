export type KouseiRow = {
  siteCode: string;
  dateKey: string; // YYYY-MM-DD
  siteId: string;
  siteName: string;
  clientName: string;
  workKind: string;
  peopleCount: number;
};

export type KouseiMonthList = {
  month: string; // YYYY-MM
  confirmed: boolean;
  excludedRowKeys: string[];
  confirmedRows: KouseiRow[];
  updatedAt: string;
};

const KEY = "kousei-list-v1";

type Store = Record<string, KouseiMonthList>;

function storeKey(month: string): string {
  return month;
}

function readStore(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const p = JSON.parse(raw);
    if (typeof p !== "object" || p === null || Array.isArray(p)) return {};
    return p as Store;
  } catch {
    return {};
  }
}

function writeStore(store: Store): void {
  localStorage.setItem(KEY, JSON.stringify(store));
}

export function loadKouseiMonthList(month: string): KouseiMonthList {
  const s = readStore();
  const v = s[storeKey(month)];
  if (!v) {
    return {
      month,
      confirmed: false,
      excludedRowKeys: [],
      confirmedRows: [],
      updatedAt: "",
    };
  }
  return {
    month: typeof v.month === "string" ? v.month : month,
    confirmed: typeof v.confirmed === "boolean" ? v.confirmed : false,
    excludedRowKeys: Array.isArray(v.excludedRowKeys)
      ? v.excludedRowKeys.filter((x): x is string => typeof x === "string")
      : [],
    confirmedRows: Array.isArray(v.confirmedRows)
      ? v.confirmedRows
          .map((x) => {
            if (typeof x !== "object" || x === null) return null;
            const o = x as Record<string, unknown>;
            const dateKey = typeof o.dateKey === "string" ? o.dateKey : "";
            const siteId = typeof o.siteId === "string" ? o.siteId : "";
            const siteName = typeof o.siteName === "string" ? o.siteName : "";
            const workKind = typeof o.workKind === "string" ? o.workKind : "";
            const peopleCount =
              typeof o.peopleCount === "number" && Number.isFinite(o.peopleCount)
                ? o.peopleCount
                : NaN;
            if (!dateKey || !siteId || !siteName || !workKind) return null;
            if (!Number.isFinite(peopleCount)) return null;
            // backward compatible: old snapshots may not have these fields
            const siteCode = typeof o.siteCode === "string" ? o.siteCode : "";
            const clientName =
              typeof o.clientName === "string" ? o.clientName : "";
            const row: KouseiRow = {
              siteCode,
              dateKey,
              siteId,
              siteName,
              clientName,
              workKind,
              peopleCount,
            };
            return row;
          })
          .filter((x): x is KouseiRow => Boolean(x))
      : [],
    updatedAt: typeof v.updatedAt === "string" ? v.updatedAt : "",
  };
}

export function saveKouseiMonthList(next: KouseiMonthList): void {
  const s = readStore();
  s[storeKey(next.month)] = { ...next, updatedAt: new Date().toISOString() };
  writeStore(s);
}

export function listKouseiConfirmedMonths(): string[] {
  const s = readStore();
  return Object.values(s)
    .filter((x) => x && typeof x === "object" && (x as KouseiMonthList).confirmed)
    .map((x) => (x as KouseiMonthList).month)
    .filter((m): m is string => typeof m === "string" && /^\d{4}-\d{2}$/.test(m))
    .sort((a, b) => b.localeCompare(a));
}

