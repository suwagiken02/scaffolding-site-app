import type { ExternalCompany } from "../types/externalCompany";
import { persistLocalStorageKeyToServer } from "./persistStorageApi";

const KEY = "external-companies-v1";

function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `extco-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** URL 用に英数字のみ残し小文字化 */
export function normalizeCompanyKey(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function normalizePin4(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\D/g, "").slice(0, 4);
}

function normalizeRow(x: unknown): ExternalCompany | null {
  if (typeof x !== "object" || x === null) return null;
  const o = x as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : "";
  const companyName = typeof o.companyName === "string" ? o.companyName.trim() : "";
  const companyKey = normalizeCompanyKey(
    typeof o.companyKey === "string" ? o.companyKey : ""
  );
  if (!id || !companyName || !companyKey) return null;
  return {
    id,
    companyName,
    companyKey,
    pin: normalizePin4(o.pin),
  };
}

function readRaw(): unknown {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function save(list: ExternalCompany[]): void {
  localStorage.setItem(KEY, JSON.stringify(list));
  persistLocalStorageKeyToServer(KEY);
}

export function loadExternalCompanies(): ExternalCompany[] {
  const raw = readRaw();
  if (!Array.isArray(raw)) return [];
  const out: ExternalCompany[] = [];
  for (const x of raw) {
    const row = normalizeRow(x);
    if (row) out.push(row);
  }
  return out;
}

export function getExternalCompanyByKey(key: string): ExternalCompany | null {
  const k = normalizeCompanyKey(key);
  if (!k) return null;
  return loadExternalCompanies().find((r) => r.companyKey === k) ?? null;
}

export function addExternalCompany(input: {
  companyName: string;
  companyKey: string;
  pin: string;
}): ExternalCompany | null {
  const companyName = input.companyName.trim();
  const companyKey = normalizeCompanyKey(input.companyKey);
  const pin = normalizePin4(input.pin);
  if (!companyName || !companyKey) return null;
  if (!/^[a-z0-9]+$/.test(companyKey)) return null;
  const list = loadExternalCompanies();
  if (list.some((r) => r.companyKey === companyKey)) return null;
  const row: ExternalCompany = {
    id: newId(),
    companyName,
    companyKey,
    pin,
  };
  list.push(row);
  save(list);
  return row;
}

export function updateExternalCompany(next: ExternalCompany): void {
  const companyKey = normalizeCompanyKey(next.companyKey);
  const companyName = next.companyName.trim();
  const pin = normalizePin4(next.pin);
  if (!next.id || !companyName || !companyKey) return;
  if (!/^[a-z0-9]+$/.test(companyKey)) return;
  const list = loadExternalCompanies();
  const idx = list.findIndex((r) => r.id === next.id);
  if (idx < 0) return;
  if (list.some((r, i) => i !== idx && r.companyKey === companyKey)) return;
  list[idx] = { id: next.id, companyName, companyKey, pin };
  save(list);
}

export function removeExternalCompany(id: string): void {
  save(loadExternalCompanies().filter((r) => r.id !== id));
}

export function pinMatches(company: ExternalCompany, pinInput: string): boolean {
  return normalizePin4(pinInput) === normalizePin4(company.pin) && company.pin.length === 4;
}
