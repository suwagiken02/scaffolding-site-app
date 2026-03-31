const STORAGE_KEY = "site-notification-targets-v1";

type Store = Record<string, string[]>;

function readStore(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw);
    if (typeof p !== "object" || p === null || Array.isArray(p)) return {};
    return p as Store;
  } catch {
    return {};
  }
}

function writeStore(map: Store): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function getSelectedRecipientIds(siteId: string): string[] {
  const map = readStore();
  const list = map[siteId];
  return Array.isArray(list) ? list.filter((x) => typeof x === "string") : [];
}

export function setSelectedRecipientIds(siteId: string, ids: string[]): void {
  const map = readStore();
  const unique = [...new Set(ids)];
  if (unique.length === 0) {
    delete map[siteId];
  } else {
    map[siteId] = unique;
  }
  writeStore(map);
}

/** マスターに存在するIDだけ残す */
export function pruneSiteSelection(siteId: string, validIds: Set<string>): void {
  const current = getSelectedRecipientIds(siteId);
  const next = current.filter((id) => validIds.has(id));
  setSelectedRecipientIds(siteId, next);
}

/** 現場削除時：その現場の通知先チェック状態を消す */
export function removeSiteRecipientSelection(siteId: string): void {
  const map = readStore();
  if (!(siteId in map)) return;
  delete map[siteId];
  writeStore(map);
}
