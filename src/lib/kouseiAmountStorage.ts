import { persistLocalStorageKeyToServer } from "./persistStorageApi";

export type KouseiAmountKey = {
  month: string; // YYYY-MM
  rowKey: string;
};

const KEY = "kousei-amount-v1";

type Store = Record<string, { amountYen: number; updatedAt: string }>;

function storeKey(k: KouseiAmountKey): string {
  return `${k.month}__${k.rowKey}`;
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
  persistLocalStorageKeyToServer(KEY);
}

export function loadKouseiAmount(k: KouseiAmountKey): number | null {
  const s = readStore();
  const v = s[storeKey(k)];
  if (!v) return null;
  const n = (v as { amountYen?: unknown }).amountYen;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
}

export function saveKouseiAmount(k: KouseiAmountKey, amountYen: number): void {
  const s = readStore();
  s[storeKey(k)] = { amountYen: Math.round(amountYen), updatedAt: new Date().toISOString() };
  writeStore(s);
}

