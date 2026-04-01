import type { MasterItem } from "../types/masterItem";
import { normalizeCompanyKey } from "./externalCompaniesStorage";
import { persistLocalStorageKeyToServer } from "./persistStorageApi";

export type ExternalCompanyMastersData = {
  clients: MasterItem[];
  sales: MasterItem[];
};

function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `em-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** localStorage のキー（サーバー同期時も同じキー名） */
export function externalCompanyMastersStorageKey(companyKey: string): string {
  return `external-master-${normalizeCompanyKey(companyKey)}`;
}

function normalizeRows(value: unknown): MasterItem[] {
  if (!Array.isArray(value)) return [];
  const out: MasterItem[] = [];
  for (const x of value) {
    if (typeof x !== "object" || x === null) continue;
    const o = x as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id.trim() : "";
    const name = typeof o.name === "string" ? o.name.trim() : "";
    if (!id || !name) continue;
    out.push({ id, name });
  }
  return out;
}

function readRaw(companyKey: string): ExternalCompanyMastersData {
  const key = externalCompanyMastersStorageKey(companyKey);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { clients: [], sales: [] };
    const p = JSON.parse(raw) as unknown;
    if (typeof p !== "object" || p === null || Array.isArray(p)) {
      return { clients: [], sales: [] };
    }
    const o = p as Record<string, unknown>;
    return {
      clients: normalizeRows(o.clients),
      sales: normalizeRows(o.sales),
    };
  } catch {
    return { clients: [], sales: [] };
  }
}

function write(companyKey: string, data: ExternalCompanyMastersData): void {
  const key = externalCompanyMastersStorageKey(companyKey);
  localStorage.setItem(
    key,
    JSON.stringify({
      clients: data.clients,
      sales: data.sales,
    })
  );
  persistLocalStorageKeyToServer(key);
}

export function loadExternalCompanyMasters(
  companyKey: string
): ExternalCompanyMastersData {
  return readRaw(companyKey);
}

export function saveExternalCompanyMasters(
  companyKey: string,
  data: ExternalCompanyMastersData
): void {
  write(companyKey, {
    clients: data.clients.map((x) => ({ id: x.id, name: x.name.trim() })).filter((x) => x.name),
    sales: data.sales.map((x) => ({ id: x.id, name: x.name.trim() })).filter((x) => x.name),
  });
}

export function addExternalClientMaster(
  companyKey: string,
  name: string
): MasterItem | null {
  const n = name.trim();
  if (!n) return null;
  const data = readRaw(companyKey);
  const item: MasterItem = { id: newId(), name: n };
  data.clients.push(item);
  write(companyKey, data);
  return item;
}

export function removeExternalClientMaster(
  companyKey: string,
  id: string
): void {
  const data = readRaw(companyKey);
  data.clients = data.clients.filter((x) => x.id !== id);
  write(companyKey, data);
}

export function addExternalSalesMaster(
  companyKey: string,
  name: string
): MasterItem | null {
  const n = name.trim();
  if (!n) return null;
  const data = readRaw(companyKey);
  const item: MasterItem = { id: newId(), name: n };
  data.sales.push(item);
  write(companyKey, data);
  return item;
}

export function removeExternalSalesMaster(
  companyKey: string,
  id: string
): void {
  const data = readRaw(companyKey);
  data.sales = data.sales.filter((x) => x.id !== id);
  write(companyKey, data);
}
