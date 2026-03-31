import type { ContractorMaster } from "../types/contractorMaster";

const KEY = "master-contractor-v1";

function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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

function normalize(x: unknown): ContractorMaster | null {
  if (typeof x !== "object" || x === null) return null;
  const o = x as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : "";
  const name = typeof o.name === "string" ? o.name : "";
  const viewPin = typeof o.viewPin === "string" ? o.viewPin : "";
  const email = typeof o.email === "string" ? o.email : "";
  if (!id || !name) return null;
  return { id, name, viewPin, email };
}

function readList(): ContractorMaster[] {
  const p = readRaw();
  if (!Array.isArray(p)) return [];
  return p.map(normalize).filter((x): x is ContractorMaster => Boolean(x));
}

function writeList(list: ContractorMaster[]): void {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function loadContractorMasters(): ContractorMaster[] {
  return readList();
}

export function addContractorMaster(name: string, viewPin: string): ContractorMaster {
  const n = name.trim();
  const item: ContractorMaster = {
    id: newId(),
    name: n,
    viewPin: viewPin.trim(),
    email: "",
  };
  if (!item.name) return item;
  const list = readList();
  list.push(item);
  writeList(list);
  return item;
}

export function updateContractorMaster(next: ContractorMaster): void {
  const list = readList();
  const normalized: ContractorMaster = {
    id: next.id,
    name: next.name.trim(),
    viewPin: next.viewPin.trim(),
    email: next.email.trim(),
  };
  writeList(list.map((r) => (r.id === normalized.id ? normalized : r)));
}

export function removeContractorMaster(id: string): void {
  writeList(readList().filter((x) => x.id !== id));
}

