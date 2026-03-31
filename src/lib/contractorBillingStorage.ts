import { persistLocalStorageKeyToServer } from "./persistStorageApi";

export type ContractorBillingKey = {
  contractorName: string;
  siteId: string;
  workKind: string;
  dateKey: string; // YYYY-MM-DD
};

export type ContractorBillingRow = ContractorBillingKey & {
  amountYen: number | null;
  updatedAt: string;
};

const KEY = "contractor-billing-v1";

type Store = Record<string, ContractorBillingRow>;

function toStoreKey(k: ContractorBillingKey): string {
  return `${k.contractorName}__${k.siteId}__${k.workKind}__${k.dateKey}`;
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

export function loadContractorBillingAmount(
  k: ContractorBillingKey
): number | null {
  const store = readStore();
  const row = store[toStoreKey(k)];
  if (!row) return null;
  const n = row.amountYen;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
}

export function saveContractorBillingAmount(
  k: ContractorBillingKey,
  amountYen: number | null
): void {
  const store = readStore();
  const key = toStoreKey(k);
  store[key] = {
    ...k,
    amountYen: amountYen === null ? null : Math.round(amountYen),
    updatedAt: new Date().toISOString(),
  };
  writeStore(store);
}

