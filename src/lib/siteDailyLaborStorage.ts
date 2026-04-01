import type { SiteDailyLaborRecord } from "../types/siteDailyLabor";
import type { WorkKind } from "../types/workKind";
import { WORK_KINDS } from "../types/workKind";
import { persistLocalStorageKeyToServer } from "./persistStorageApi";
import { getWorkEndIso, getWorkStartIso } from "./workSessionTimes";

const KEY_V1 = "scaffolding-site-daily-labor-v1";
const KEY_V2 = "scaffolding-site-daily-labor-v2";

/** siteId -> workKind -> dateKey -> record */
type StoreV2 = Record<
  string,
  Partial<Record<WorkKind, Record<string, SiteDailyLaborRecord>>>
>;

type StoreV1 = Record<string, Record<string, SiteDailyLaborRecord>>;

function readRawV1(): unknown {
  try {
    const raw = localStorage.getItem(KEY_V1);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeRecord(x: unknown): SiteDailyLaborRecord | null {
  if (typeof x !== "object" || x === null) return null;
  const o = x as Record<string, unknown>;

  const createdAt =
    typeof o.createdAt === "string" ? o.createdAt : "";

  const dateKey = typeof o.dateKey === "string" ? o.dateKey : null;
  if (!dateKey) return null;

  const finalManDays =
    o.finalManDays === null
      ? null
      : typeof o.finalManDays === "number" && Number.isFinite(o.finalManDays)
        ? o.finalManDays
        : null;

  const vehicleCount =
    typeof o.vehicleCount === "number" &&
    Number.isFinite(o.vehicleCount) &&
    o.vehicleCount >= 0
      ? o.vehicleCount
      : 0;

  const memberForemanNames = Array.isArray(o.memberForemanNames)
    ? o.memberForemanNames.filter(
        (n): n is string => typeof n === "string" && n.trim().length > 0
      )
    : [];

  const memberKogataNames = Array.isArray(o.memberKogataNames)
    ? o.memberKogataNames.filter(
        (n): n is string => typeof n === "string" && n.trim().length > 0
      )
    : [];

  const hadHelpTeam = typeof o.hadHelpTeam === "boolean" ? o.hadHelpTeam : false;

  const helpMemberNames = Array.isArray(o.helpMemberNames)
    ? o.helpMemberNames.filter(
        (n): n is string => typeof n === "string" && n.trim().length > 0
      )
    : [];

  const helpStartTime =
    o.helpStartTime === null
      ? null
      : typeof o.helpStartTime === "string"
        ? o.helpStartTime
        : null;

  const helpEndTime =
    o.helpEndTime === null
      ? null
      : typeof o.helpEndTime === "string"
        ? o.helpEndTime
        : null;

  const joyoWorkStartIso =
    o.joyoWorkStartIso === null || o.joyoWorkStartIso === undefined
      ? null
      : typeof o.joyoWorkStartIso === "string"
        ? o.joyoWorkStartIso
        : null;

  const joyoWorkEndIso =
    o.joyoWorkEndIso === null || o.joyoWorkEndIso === undefined
      ? null
      : typeof o.joyoWorkEndIso === "string"
        ? o.joyoWorkEndIso
        : null;

  const joyoManDaysPerPerson =
    o.joyoManDaysPerPerson === null || o.joyoManDaysPerPerson === undefined
      ? null
      : typeof o.joyoManDaysPerPerson === "number" &&
          Number.isFinite(o.joyoManDaysPerPerson)
        ? o.joyoManDaysPerPerson
        : null;

  let workStartIso =
    o.workStartIso === null || o.workStartIso === undefined
      ? null
      : typeof o.workStartIso === "string"
        ? o.workStartIso
        : null;
  let workEndIso =
    o.workEndIso === null || o.workEndIso === undefined
      ? null
      : typeof o.workEndIso === "string"
        ? o.workEndIso
        : null;
  let workManDaysPerPerson =
    o.workManDaysPerPerson === null || o.workManDaysPerPerson === undefined
      ? null
      : typeof o.workManDaysPerPerson === "number" &&
          Number.isFinite(o.workManDaysPerPerson)
        ? o.workManDaysPerPerson
        : null;

  if (!workStartIso && joyoWorkStartIso) workStartIso = joyoWorkStartIso;
  if (!workEndIso && joyoWorkEndIso) workEndIso = joyoWorkEndIso;
  if (workManDaysPerPerson == null && joyoManDaysPerPerson != null) {
    workManDaysPerPerson = joyoManDaysPerPerson;
  }

  const employmentKind =
    o.employmentKind === "請負" || o.employmentKind === "社員"
      ? o.employmentKind
      : undefined;

  const contractorCompanyName =
    typeof o.contractorCompanyName === "string" ? o.contractorCompanyName : "";

  const contractorPeopleCount =
    typeof o.contractorPeopleCount === "number" &&
    Number.isFinite(o.contractorPeopleCount) &&
    o.contractorPeopleCount >= 0
      ? Math.round(o.contractorPeopleCount)
      : 0;

  return {
    createdAt,
    dateKey,
    finalManDays,
    employmentKind,
    contractorCompanyName,
    contractorPeopleCount,
    vehicleCount,
    memberForemanNames,
    memberKogataNames,
    hadHelpTeam,
    helpMemberNames,
    helpStartTime,
    helpEndTime,
    workStartIso,
    workEndIso,
    workManDaysPerPerson,
    joyoWorkStartIso,
    joyoWorkEndIso,
    joyoManDaysPerPerson,
  };
}

function parseStoreV2(raw: string): StoreV2 {
  try {
    const p = JSON.parse(raw);
    if (typeof p !== "object" || p === null || Array.isArray(p)) return {};
    const out: StoreV2 = {};
    for (const [siteId, siteVal] of Object.entries(p)) {
      if (typeof siteVal !== "object" || siteVal === null) continue;
      const byKind: Partial<Record<WorkKind, Record<string, SiteDailyLaborRecord>>> =
        {};
      for (const w of WORK_KINDS) {
        const dates = (siteVal as Record<string, unknown>)[w];
        if (typeof dates !== "object" || dates === null) continue;
        const m: Record<string, SiteDailyLaborRecord> = {};
        for (const [dk, v] of Object.entries(dates)) {
          const norm = normalizeRecord(v);
          if (norm && norm.dateKey === dk) m[dk] = norm;
        }
        if (Object.keys(m).length > 0) byKind[w] = m;
      }
      if (Object.keys(byKind).length > 0) out[siteId] = byKind;
    }
    return out;
  } catch {
    return {};
  }
}

function migrateV1ToV2(v1: StoreV1): StoreV2 {
  const out: StoreV2 = {};
  for (const [siteId, dates] of Object.entries(v1)) {
    if (typeof dates !== "object" || dates === null) continue;
    const kumi: Record<string, SiteDailyLaborRecord> = {};
    for (const [dk, v] of Object.entries(dates)) {
      const norm = normalizeRecord(v);
      if (norm && norm.dateKey === dk) kumi[dk] = norm;
    }
    if (Object.keys(kumi).length > 0) {
      out[siteId] = { 組み: kumi };
    }
  }
  return out;
}

function readStore(): StoreV2 {
  const v2raw = localStorage.getItem(KEY_V2);
  if (v2raw) {
    return parseStoreV2(v2raw);
  }
  const v1raw = readRawV1();
  if (v1raw !== null && typeof v1raw === "object" && !Array.isArray(v1raw)) {
    const migrated = migrateV1ToV2(v1raw as StoreV1);
    localStorage.setItem(KEY_V2, JSON.stringify(migrated));
    localStorage.removeItem(KEY_V1);
    return migrated;
  }
  return {};
}

function writeStore(store: StoreV2): void {
  localStorage.setItem(KEY_V2, JSON.stringify(store));
  persistLocalStorageKeyToServer(KEY_V2);
}

function dispatchSaved(siteId: string) {
  window.dispatchEvent(
    new CustomEvent("siteDailyLaborSaved", { detail: { siteId } })
  );
}

export function loadDailyLaborMap(
  siteId: string,
  workKind: WorkKind
): Record<string, SiteDailyLaborRecord> {
  const all = readStore();
  return { ...(all[siteId]?.[workKind] ?? {}) };
}

/** いずれかの作業種別で指定日に作業記録があるか */
export function siteHasLaborRecordOnDate(
  siteId: string,
  dateKey: string
): boolean {
  return WORK_KINDS.some((k) => Boolean(loadDailyLaborMap(siteId, k)[dateKey]));
}

export function listDailyLaborRecords(
  siteId: string,
  workKind: WorkKind
): SiteDailyLaborRecord[] {
  return Object.values(loadDailyLaborMap(siteId, workKind)).sort((a, b) =>
    b.dateKey.localeCompare(a.dateKey)
  );
}

/** 作業種別・日付の両方にデータがある日付一覧（降順） */
export function listDateKeysForSiteWork(
  siteId: string,
  workKind: WorkKind,
  photoDateKeys: string[]
): string[] {
  const laborKeys = Object.keys(loadDailyLaborMap(siteId, workKind));
  const set = new Set<string>([...photoDateKeys, ...laborKeys]);
  return [...set].sort((a, b) => b.localeCompare(a));
}

export function saveDailyLaborRecord(
  siteId: string,
  workKind: WorkKind,
  record: SiteDailyLaborRecord
): void {
  const all = readStore();
  const prev = all[siteId] ?? {};
  const kindMap = { ...(prev[workKind] ?? {}) };
  kindMap[record.dateKey] = record;
  all[siteId] = { ...prev, [workKind]: kindMap };
  writeStore(all);
  dispatchSaved(siteId);
}

export function removeDailyLaborRecord(
  siteId: string,
  workKind: WorkKind,
  dateKey: string
): void {
  const all = readStore();
  const prev = all[siteId];
  if (!prev) return;
  const kindMap = prev[workKind];
  if (!kindMap || !(dateKey in kindMap)) return;
  const nextKind = { ...kindMap };
  delete nextKind[dateKey];
  const nextSite: Partial<Record<WorkKind, Record<string, SiteDailyLaborRecord>>> =
    { ...prev };
  if (Object.keys(nextKind).length === 0) {
    delete nextSite[workKind];
  } else {
    nextSite[workKind] = nextKind;
  }
  if (Object.keys(nextSite).length === 0) {
    delete all[siteId];
  } else {
    all[siteId] = nextSite;
  }
  writeStore(all);
  dispatchSaved(siteId);
}

export function removeAllDailyLaborForSite(siteId: string): void {
  const all = readStore();
  if (!(siteId in all)) return;
  delete all[siteId];
  writeStore(all);
  dispatchSaved(siteId);
}

export type SiteLaborSummary = {
  /** 架け人工（組み） */
  kake: number;
  harai: number;
  sonota: number;
  /** 常用作業の合計 */
  joyo: number;
  total: number;
};

/** 全作業種別の日付キーのうち最も新しいもの（作業記録が無ければ null） */
/** いずれかの作業種別で終了打刻まで済んでいるか（地図ピン等） */
export function siteWorkSessionEndedOnDate(
  siteId: string,
  dateKey: string
): boolean {
  for (const k of WORK_KINDS) {
    const r = loadDailyLaborMap(siteId, k)[dateKey];
    if (getWorkEndIso(r)) return true;
  }
  return false;
}

/** いずれかの作業種別で開始済み・未終了か */
export function siteWorkSessionInProgressOnDate(
  siteId: string,
  dateKey: string
): boolean {
  for (const k of WORK_KINDS) {
    const r = loadDailyLaborMap(siteId, k)[dateKey];
    if (getWorkStartIso(r) && !getWorkEndIso(r)) return true;
  }
  return false;
}

/** いずれかの日で作業開始打刻があるか */
export function siteHasAnyWorkStartPressed(siteId: string): boolean {
  for (const k of WORK_KINDS) {
    for (const r of Object.values(loadDailyLaborMap(siteId, k))) {
      if (getWorkStartIso(r)) return true;
    }
  }
  return false;
}

/** 払いで作業終了打刻が一度でもあるか（「解体中」用） */
export function siteHasHaraiWorkEnded(siteId: string): boolean {
  for (const r of Object.values(loadDailyLaborMap(siteId, "払い"))) {
    if (getWorkEndIso(r)) return true;
  }
  return false;
}

/** 払いでいずれかの日が作業開始済み・未終了か（現場ステータス「解体中」用） */
export function siteHaraiWorkSessionInProgress(siteId: string): boolean {
  for (const r of Object.values(loadDailyLaborMap(siteId, "払い"))) {
    if (getWorkStartIso(r) && !getWorkEndIso(r)) return true;
  }
  return false;
}

/** 組みでいずれかの日が作業開始済み・未終了か（現場ステータス「組立中」用） */
export function siteKumiWorkSessionInProgress(siteId: string): boolean {
  for (const r of Object.values(loadDailyLaborMap(siteId, "組み"))) {
    if (getWorkStartIso(r) && !getWorkEndIso(r)) return true;
  }
  return false;
}

/** 組みで作業終了打刻が一度でもあるか（現場ステータス「設置中」用） */
export function siteKumiHasAnyWorkEndPressed(siteId: string): boolean {
  for (const r of Object.values(loadDailyLaborMap(siteId, "組み"))) {
    if (getWorkEndIso(r)) return true;
  }
  return false;
}

export function getLatestLaborDateKeyAcrossKinds(siteId: string): string | null {
  let best = "";
  for (const k of WORK_KINDS) {
    const map = loadDailyLaborMap(siteId, k);
    for (const dk of Object.keys(map)) {
      if (dk.localeCompare(best) > 0) best = dk;
    }
  }
  return best || null;
}

export function getSiteLaborSummary(siteId: string): SiteLaborSummary {
  const all = readStore();
  const site = all[siteId];
  let kake = 0;
  let harai = 0;
  let sonota = 0;
  let joyo = 0;
  if (site) {
    for (const r of Object.values(site["組み"] ?? {})) {
      if (typeof r.finalManDays === "number") kake += r.finalManDays;
    }
    for (const r of Object.values(site["払い"] ?? {})) {
      if (typeof r.finalManDays === "number") harai += r.finalManDays;
    }
    for (const r of Object.values(site["その他"] ?? {})) {
      if (typeof r.finalManDays === "number") sonota += r.finalManDays;
    }
    for (const r of Object.values(site["常用作業"] ?? {})) {
      if (typeof r.finalManDays === "number") joyo += r.finalManDays;
    }
  }
  const round1 = (n: number) => Math.round(n * 10) / 10;
  kake = round1(kake);
  harai = round1(harai);
  sonota = round1(sonota);
  joyo = round1(joyo);
  return {
    kake,
    harai,
    sonota,
    joyo,
    total: round1(kake + harai + sonota + joyo),
  };
}
