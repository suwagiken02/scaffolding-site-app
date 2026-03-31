import type { Site } from "../types/site";
import type { PhotoCategory, SitePhoto } from "../types/sitePhoto";
import { PHOTO_CATEGORIES } from "../types/sitePhoto";
import type { WorkKind } from "../types/workKind";
import { WORK_KINDS } from "../types/workKind";
import { isoToLocalDateKey } from "./dateUtils";
import { persistLocalStorageKeyToServer } from "./persistStorageApi";

const KEY_V1 = "scaffolding-site-photos-v1";
const KEY_V2 = "scaffolding-site-photos-v2";

/** 旧バージョン（英語キー）からの移行用 */
const LEGACY_CATEGORY: Record<string, PhotoCategory> = {
  entry: "入場時",
  break1: "休憩①",
  break2: "休憩②",
  break3: "休憩③",
  end: "終了時",
};

/** siteId -> workKind -> dateKey -> photos */
export type SitePhotoStoreV2 = Record<
  string,
  Record<WorkKind, Record<string, SitePhoto[]>>
>;

type PhotoMapV1 = Record<string, SitePhoto[]>;

function emptySiteBucket(): Record<WorkKind, Record<string, SitePhoto[]>> {
  return { 組み: {}, 払い: {}, その他: {} };
}

function readRawV1(): unknown {
  try {
    const raw = localStorage.getItem(KEY_V1);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isPhotoCategory(x: unknown): x is PhotoCategory {
  return (
    typeof x === "string" &&
    (PHOTO_CATEGORIES as readonly string[]).includes(x)
  );
}

function migrateToPhotoCategory(raw: string | undefined): PhotoCategory {
  if (raw === undefined) return "入場時";
  if (isPhotoCategory(raw)) return raw;
  if (LEGACY_CATEGORY[raw]) return LEGACY_CATEGORY[raw];
  return "入場時";
}

type StoredSitePhoto = {
  id: string;
  dataUrl: string;
  uploadedAt: string;
  fileName: string;
  category?: string;
};

function isSitePhoto(x: unknown): x is StoredSitePhoto {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  const base =
    typeof o.id === "string" &&
    typeof o.dataUrl === "string" &&
    o.dataUrl.startsWith("data:") &&
    typeof o.uploadedAt === "string" &&
    typeof o.fileName === "string";
  if (!base) return false;
  if (o.category === undefined) return true;
  return typeof o.category === "string";
}

function normalizePhoto(raw: StoredSitePhoto): SitePhoto {
  const category = migrateToPhotoCategory(raw.category);
  return {
    id: raw.id,
    dataUrl: raw.dataUrl,
    uploadedAt: raw.uploadedAt,
    fileName: raw.fileName,
    category,
  };
}

function isPhotoMapV1(x: unknown): x is PhotoMapV1 {
  if (typeof x !== "object" || x === null || Array.isArray(x)) return false;
  return true;
}

function migrateV1ToV2(data: unknown): SitePhotoStoreV2 {
  const out: SitePhotoStoreV2 = {};
  if (!isPhotoMapV1(data)) return out;
  for (const [siteId, list] of Object.entries(data)) {
    if (!Array.isArray(list)) continue;
    const bucket = emptySiteBucket();
    for (const item of list) {
      if (!isSitePhoto(item)) continue;
      const p = normalizePhoto(item);
      const dk = isoToLocalDateKey(p.uploadedAt);
      if (!dk) continue;
      if (!bucket["組み"][dk]) bucket["組み"][dk] = [];
      bucket["組み"][dk].push(p);
    }
    if (
      Object.keys(bucket["組み"]).length > 0 ||
      Object.keys(bucket["払い"]).length > 0 ||
      Object.keys(bucket["その他"]).length > 0
    ) {
      out[siteId] = bucket;
    }
  }
  return out;
}

function parseSiteBucket(raw: unknown): Record<WorkKind, Record<string, SitePhoto[]>> {
  const out = emptySiteBucket();
  if (typeof raw !== "object" || raw === null) return out;
  const o = raw as Record<string, unknown>;
  for (const w of WORK_KINDS) {
    const dates = o[w];
    if (typeof dates !== "object" || dates === null) continue;
    for (const [dk, list] of Object.entries(dates)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dk) || !Array.isArray(list)) continue;
      const photos = list.filter(isSitePhoto).map((x) => normalizePhoto(x));
      if (photos.length > 0) out[w][dk] = photos;
    }
  }
  return out;
}

function parseStoreV2(raw: string): SitePhotoStoreV2 {
  try {
    const p = JSON.parse(raw);
    if (typeof p !== "object" || p === null || Array.isArray(p)) return {};
    const out: SitePhotoStoreV2 = {};
    for (const [siteId, siteVal] of Object.entries(p)) {
      out[siteId] = parseSiteBucket(siteVal);
    }
    return out;
  } catch {
    return {};
  }
}

function readStore(): SitePhotoStoreV2 {
  const v2raw = localStorage.getItem(KEY_V2);
  if (v2raw) {
    return parseStoreV2(v2raw);
  }
  const v1 = readRawV1();
  if (v1 !== null) {
    const migrated = migrateV1ToV2(v1);
    localStorage.setItem(KEY_V2, JSON.stringify(migrated));
    localStorage.removeItem(KEY_V1);
    return migrated;
  }
  return {};
}

function writeStore(store: SitePhotoStoreV2): void {
  localStorage.setItem(KEY_V2, JSON.stringify(store));
  persistLocalStorageKeyToServer(KEY_V2);
}

function ensureSite(
  store: SitePhotoStoreV2,
  siteId: string
): Record<WorkKind, Record<string, SitePhoto[]>> {
  if (!store[siteId]) store[siteId] = emptySiteBucket();
  return store[siteId];
}

export function loadPhotosForSiteWorkDate(
  siteId: string,
  workKind: WorkKind,
  dateKey: string
): SitePhoto[] {
  const store = readStore();
  const site = store[siteId];
  if (!site) return [];
  const list = site[workKind]?.[dateKey];
  return Array.isArray(list) ? list.map(normalizePhoto) : [];
}

export function savePhotosForSiteWorkDate(
  siteId: string,
  workKind: WorkKind,
  dateKey: string,
  photos: SitePhoto[]
): void {
  const store = readStore();
  const site = ensureSite(store, siteId);
  if (photos.length === 0) {
    delete site[workKind][dateKey];
    const emptySite =
      WORK_KINDS.every(
        (w) => Object.keys(site[w] ?? {}).length === 0
      );
    if (emptySite) delete store[siteId];
  } else {
    site[workKind][dateKey] = photos;
  }
  writeStore(store);
  window.dispatchEvent(
    new CustomEvent("siteWorkPhotosChanged", { detail: { siteId } })
  );
}

/** 作業種別ごとに写真がある日付キー（新しい順は呼び出し側でソート） */
export function listPhotoDateKeysForSiteWork(
  siteId: string,
  workKind: WorkKind
): string[] {
  const store = readStore();
  const site = store[siteId];
  if (!site) return [];
  const dates = site[workKind];
  return Object.keys(dates ?? {});
}

/** 指定日に全作業種別をまたいで「入場時」写真があるか */
export function siteHasEntryPhotoOnDate(
  siteId: string,
  dateKey: string
): boolean {
  for (const w of WORK_KINDS) {
    const photos = loadPhotosForSiteWorkDate(siteId, w, dateKey);
    if (photos.some((p) => p.category === "入場時")) return true;
  }
  return false;
}

/** 指定日に全作業種別をまたいで「終了時」写真があるか */
export function siteHasEndPhotoOnDate(
  siteId: string,
  dateKey: string
): boolean {
  for (const w of WORK_KINDS) {
    const photos = loadPhotosForSiteWorkDate(siteId, w, dateKey);
    if (photos.some((p) => p.category === "終了時")) return true;
  }
  return false;
}

/** 本日の作業マップ用：終了時あり→終了、入場のみ→作業中、どちらもなし→未着手 */
export type TodayMapPinKind = "not_started" | "in_progress" | "finished";

export function getTodayMapPinKind(
  siteId: string,
  todayKey: string
): TodayMapPinKind {
  if (siteHasEndPhotoOnDate(siteId, todayKey)) return "finished";
  if (siteHasEntryPhotoOnDate(siteId, todayKey)) return "in_progress";
  return "not_started";
}

/** 作業種別のいずれかの日に写真が1枚以上あるか */
export function siteHasAnyPhotoInWorkKind(
  siteId: string,
  workKind: WorkKind
): boolean {
  for (const dk of listPhotoDateKeysForSiteWork(siteId, workKind)) {
    const photos = loadPhotosForSiteWorkDate(siteId, workKind, dk);
    if (photos.length > 0) return true;
  }
  return false;
}

/** 作業種別のいずれかの日に「終了時」があるか */
export function siteHasEndPhotoInWorkKind(
  siteId: string,
  workKind: WorkKind
): boolean {
  for (const dk of listPhotoDateKeysForSiteWork(siteId, workKind)) {
    const photos = loadPhotosForSiteWorkDate(siteId, workKind, dk);
    if (photos.some((p) => p.category === "終了時")) return true;
  }
  return false;
}

/** 足場設置中マップ：組みに写真があり、足場撤去完了が未登録 */
export function siteMatchesScaffoldingInstallMap(site: Site): boolean {
  if (site.scaffoldingRemovalCompletedAt?.trim()) return false;
  return siteHasAnyPhotoInWorkKind(site.id, "組み");
}

export function removeAllPhotosForSite(siteId: string): void {
  const store = readStore();
  if (!(siteId in store)) return;
  delete store[siteId];
  writeStore(store);
  window.dispatchEvent(
    new CustomEvent("siteWorkPhotosChanged", { detail: { siteId } })
  );
}

/** いずれかの作業種別・日で「終了時」写真があるか（地図ピン色） */
export function siteHasEndPhoto(siteId: string): boolean {
  const store = readStore();
  const site = store[siteId];
  if (!site) return false;
  for (const w of WORK_KINDS) {
    for (const list of Object.values(site[w] ?? {})) {
      if (!Array.isArray(list)) continue;
      for (const p of list) {
        if (!isSitePhoto(p)) continue;
        if (normalizePhoto(p).category === "終了時") return true;
      }
    }
  }
  return false;
}
