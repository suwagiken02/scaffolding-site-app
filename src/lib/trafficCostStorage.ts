import type { TrafficCostSetting } from "../types/trafficCostSetting";

const KEY = "scaffolding-traffic-cost-settings-v1";

function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `tc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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

function isRow(x: unknown): x is TrafficCostSetting {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.municipality === "string" &&
    typeof o.gasYen === "number" &&
    Number.isFinite(o.gasYen) &&
    typeof o.etcYen === "number" &&
    Number.isFinite(o.etcYen)
  );
}

export function loadTrafficCostSettings(): TrafficCostSetting[] {
  const raw = readRaw();
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isRow)
    .map((r) => ({
      ...r,
      municipality: r.municipality.trim(),
      gasYen: Math.max(0, Math.round(r.gasYen)),
      etcYen: Math.max(0, Math.round(r.etcYen)),
    }))
    .filter((r) => r.municipality.length > 0);
}

function save(list: TrafficCostSetting[]): void {
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent("trafficCostSettingsSaved"));
}

export function addTrafficCostSetting(input: Omit<TrafficCostSetting, "id">): void {
  const list = loadTrafficCostSettings();
  list.push({ id: newId(), ...input });
  save(list);
}

export function updateTrafficCostSetting(next: TrafficCostSetting): void {
  const list = loadTrafficCostSettings();
  const i = list.findIndex((x) => x.id === next.id);
  if (i < 0) return;
  list[i] = next;
  save(list);
}

export function removeTrafficCostSetting(id: string): void {
  const list = loadTrafficCostSettings().filter((x) => x.id !== id);
  save(list);
}

export type ResolvedTrafficCost = {
  setting: TrafficCostSetting;
  totalYen: number;
};

/** 住所（市区町村想定）から最適な交通費設定を解決する（部分一致・最長一致優先） */
export function resolveTrafficCostByAddress(
  address: string,
  settings: TrafficCostSetting[]
): ResolvedTrafficCost | null {
  const a = address.trim();
  if (!a) return null;
  const candidates = settings
    .map((s) => ({ s, key: s.municipality.trim() }))
    .filter((x) => x.key && a.includes(x.key))
    .sort((x, y) => y.key.length - x.key.length);
  const hit = candidates[0]?.s;
  if (!hit) return null;
  return { setting: hit, totalYen: hit.gasYen + hit.etcYen };
}

