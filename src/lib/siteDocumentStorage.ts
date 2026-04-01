import type { SiteDocument } from "../types/siteDocument";
import { persistLocalStorageKeyToServer } from "./persistStorageApi";

const KEY = "scaffolding-site-documents-v1";

/** siteId -> documents */
type Store = Record<string, SiteDocument[]>;

function readStore(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as unknown;
    if (typeof p !== "object" || p === null || Array.isArray(p)) return {};
    return p as Store;
  } catch {
    return {};
  }
}

function isDoc(x: unknown): x is SiteDocument {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.fileName === "string" &&
    typeof o.uploadedAt === "string" &&
    typeof o.url === "string" &&
    typeof o.r2Key === "string" &&
    /^https?:\/\//i.test(o.url.trim()) &&
    o.r2Key.startsWith("sites/")
  );
}

function normalizeDoc(x: SiteDocument): SiteDocument {
  return {
    id: x.id,
    fileName: x.fileName.trim() || "書類",
    uploadedAt: x.uploadedAt,
    url: x.url.trim(),
    r2Key: x.r2Key.trim(),
  };
}

function writeStore(store: Store): void {
  localStorage.setItem(KEY, JSON.stringify(store));
  persistLocalStorageKeyToServer(KEY);
}

export function loadDocumentsForSite(siteId: string): SiteDocument[] {
  const store = readStore();
  const list = store[siteId];
  if (!Array.isArray(list)) return [];
  return list.filter(isDoc).map(normalizeDoc);
}

export function saveDocumentsForSite(siteId: string, docs: SiteDocument[]): void {
  const store = readStore();
  store[siteId] = docs.filter(isDoc).map(normalizeDoc);
  writeStore(store);
}

export function removeAllDocumentsForSite(siteId: string): void {
  const store = readStore();
  if (!(siteId in store)) return;
  delete store[siteId];
  writeStore(store);
}
