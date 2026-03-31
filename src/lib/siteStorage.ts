import type { Site } from "../types/site";
import { persistLocalStorageKeyToServer } from "./persistStorageApi";

const STORAGE_KEY = "scaffolding-sites-v1";

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 入場日リストを正規化（重複除去・昇順ソート） */
export function normalizeEntranceDateKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of value) {
    if (typeof x !== "string") continue;
    const t = x.trim();
    if (!DATE_KEY_RE.test(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

/** 入場日が1件以上あれば最古の YYYY-MM-DD、なければ空文字 */
export function startDateFromEntranceDateKeys(keys: unknown): string {
  const normalized = normalizeEntranceDateKeys(keys);
  return normalized.length > 0 ? normalized[0] : "";
}

function isOptionalString(v: unknown): boolean {
  return v === undefined || v === null || typeof v === "string";
}

function readRaw(): unknown {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/** 新形式の判定（キー欠落や null を許容。厳格すぎると migrate 側で entranceDateKeys が消える） */
function isNewSite(o: Record<string, unknown>): boolean {
  return (
    typeof o.id === "string" &&
    typeof o.name === "string" &&
    isOptionalString(o.clientName) &&
    (o.kogataNames === undefined || Array.isArray(o.kogataNames)) &&
    (o.vehicleLabels === undefined || Array.isArray(o.vehicleLabels)) &&
    isOptionalString(o.salesName) &&
    isOptionalString(o.siteTypeName) &&
    (o.companyKind === "自社" || o.companyKind === "KOUSEI")
  );
}

function migrateLegacyRow(o: Record<string, unknown>): Site | null {
  if (
    typeof o.id !== "string" ||
    typeof o.name !== "string" ||
    typeof o.address !== "string" ||
    typeof o.foremanName !== "string" ||
    typeof o.workerCount !== "number" ||
    typeof o.createdAt !== "string"
  ) {
    return null;
  }
  const team =
    typeof o.teamName === "string" && o.teamName.trim()
      ? [o.teamName.trim()]
      : [];
  const entranceDateKeys = normalizeEntranceDateKeys(o.entranceDateKeys);
  const startDateRaw = typeof o.startDate === "string" ? o.startDate : "";
  const startDate =
    entranceDateKeys.length > 0
      ? entranceDateKeys[0]
      : startDateRaw;
  return {
    id: o.id,
    name: o.name,
    siteCode: typeof o.siteCode === "string" && o.siteCode.trim() ? o.siteCode.trim() : "",
    clientName: typeof o.clientName === "string" ? o.clientName : "",
    address: o.address,
    googleMapUrl: typeof o.googleMapUrl === "string" ? o.googleMapUrl.trim() : "",
    startDate,
    salesName: typeof o.salesName === "string" ? o.salesName : "",
    foremanName: o.foremanName,
    kogataNames: team,
    workerCount: o.workerCount,
    vehicleLabels: Array.isArray(o.vehicleLabels)
      ? o.vehicleLabels.filter((n): n is string => typeof n === "string")
      : [],
    siteTypeName: typeof o.siteTypeName === "string" ? o.siteTypeName : "",
    companyKind:
      o.companyKind === "自社" || o.companyKind === "KOUSEI"
        ? o.companyKind
        : "自社",
    createdAt: o.createdAt,
    scaffoldingRemovalCompletedAt:
      typeof o.scaffoldingRemovalCompletedAt === "string" &&
      o.scaffoldingRemovalCompletedAt.trim()
        ? o.scaffoldingRemovalCompletedAt.trim()
        : undefined,
    entranceDateKeys,
  };
}

function normalizeSite(x: unknown): Site | null {
  if (typeof x !== "object" || x === null) return null;
  const o = x as Record<string, unknown>;
  if (isNewSite(o)) {
    const kogata = Array.isArray(o.kogataNames)
      ? o.kogataNames.filter((n): n is string => typeof n === "string")
      : [];
    const vehicles = Array.isArray(o.vehicleLabels)
      ? o.vehicleLabels.filter((n): n is string => typeof n === "string")
      : [];
    const workerCount =
      typeof o.workerCount === "number" && Number.isFinite(o.workerCount)
        ? Math.round(o.workerCount)
        : 0;
    const completedRaw = o.scaffoldingRemovalCompletedAt;
    const scaffoldingRemovalCompletedAt =
      typeof completedRaw === "string" && completedRaw.trim()
        ? completedRaw.trim()
        : undefined;
    const siteCode =
      typeof o.siteCode === "string" && o.siteCode.trim() ? o.siteCode.trim() : "";
    const ignoreSiteListWarning = o.ignoreSiteListWarning === true;
    const entranceDateKeys = normalizeEntranceDateKeys(o.entranceDateKeys);
    const startDate = startDateFromEntranceDateKeys(entranceDateKeys);
    return {
      id: o.id as string,
      name: o.name as string,
      siteCode,
      clientName: typeof o.clientName === "string" ? o.clientName : "",
      address: typeof o.address === "string" ? o.address : "",
      googleMapUrl:
        typeof o.googleMapUrl === "string" ? o.googleMapUrl.trim() : "",
      startDate,
      entranceDateKeys,
      salesName: typeof o.salesName === "string" ? o.salesName : "",
      foremanName: typeof o.foremanName === "string" ? o.foremanName : "",
      kogataNames: kogata,
      workerCount,
      vehicleLabels: vehicles,
      siteTypeName: typeof o.siteTypeName === "string" ? o.siteTypeName : "",
      companyKind: o.companyKind as Site["companyKind"],
      createdAt: o.createdAt as string,
      scaffoldingRemovalCompletedAt,
      ...(ignoreSiteListWarning ? { ignoreSiteListWarning: true } : {}),
    };
  }
  return migrateLegacyRow(o);
}

export function loadSites(): Site[] {
  const data = readRaw();
  if (!Array.isArray(data)) return [];
  return data.map(normalizeSite).filter((s): s is Site => s !== null);
}

export function saveSites(sites: Site[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sites));
  persistLocalStorageKeyToServer(STORAGE_KEY);
}

export function getSiteById(id: string): Site | undefined {
  return loadSites().find((s) => s.id === id);
}

export function addSite(site: Site): void {
  const sites = loadSites();
  sites.unshift(site);
  saveSites(sites);
}

export function updateSite(site: Site): void {
  const sites = loadSites();
  const i = sites.findIndex((s) => s.id === site.id);
  if (i >= 0) {
    sites[i] = site;
    saveSites(sites);
    window.dispatchEvent(
      new CustomEvent("siteDataSaved", { detail: { siteId: site.id } })
    );
  }
}

export function removeSite(id: string): void {
  const sites = loadSites().filter((s) => s.id !== id);
  saveSites(sites);
}
