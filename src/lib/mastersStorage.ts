import type { MasterItem } from "../types/masterItem";
import { persistLocalStorageKeyToServer } from "./persistStorageApi";

function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function readList(key: string): MasterItem[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const p = JSON.parse(raw);
    if (!Array.isArray(p)) return [];
    return p.filter(
      (x): x is MasterItem =>
        typeof x === "object" &&
        x !== null &&
        typeof (x as MasterItem).id === "string" &&
        typeof (x as MasterItem).name === "string"
    );
  } catch {
    return [];
  }
}

function writeList(key: string, list: MasterItem[]): void {
  localStorage.setItem(key, JSON.stringify(list));
  persistLocalStorageKeyToServer(key);
}

const KEY_CLIENT = "master-motouke-v1";
const KEY_FOREMAN = "master-foreman-v1";
const KEY_KOGATA = "master-kogata-v1";
const KEY_VEHICLE = "master-vehicle-v1";
const KEY_SALES = "master-sales-v1";
const KEY_SITE_TYPE = "master-site-type-v1";
const KEY_ATTENDANCE_STAFF = "attendance-staff-v1";

const DEFAULT_SITE_TYPES = ["新築", "改修", "塗装", "解体", "設備", "土木"];

/** 既存マスターにも不足時のみ追記（会社・資材置き場） */
const EXTRA_SITE_TYPE_NAMES = ["会社", "資材置き場"];

function ensureSiteTypeDefaults(): void {
  const list = readList(KEY_SITE_TYPE);
  if (list.length > 0) return;
  writeList(
    KEY_SITE_TYPE,
    DEFAULT_SITE_TYPES.map((name) => ({ id: newId(), name }))
  );
}

function ensureSiteTypeKouseiExtras(): void {
  ensureSiteTypeDefaults();
  const list = readList(KEY_SITE_TYPE);
  const names = new Set(list.map((x) => x.name.trim()));
  let changed = false;
  for (const name of EXTRA_SITE_TYPE_NAMES) {
    if (names.has(name)) continue;
    list.push({ id: newId(), name });
    names.add(name);
    changed = true;
  }
  if (changed) writeList(KEY_SITE_TYPE, list);
}

export function loadClientMasters(): MasterItem[] {
  return readList(KEY_CLIENT);
}
export function addClientMaster(name: string): MasterItem {
  const list = readList(KEY_CLIENT);
  const item: MasterItem = { id: newId(), name: name.trim() };
  if (!item.name) return item;
  list.push(item);
  writeList(KEY_CLIENT, list);
  return item;
}
export function removeClientMaster(id: string): void {
  writeList(
    KEY_CLIENT,
    readList(KEY_CLIENT).filter((x) => x.id !== id)
  );
}

export function loadForemanMasters(): MasterItem[] {
  return readList(KEY_FOREMAN);
}
export function addForemanMaster(name: string): MasterItem {
  const list = readList(KEY_FOREMAN);
  const item: MasterItem = { id: newId(), name: name.trim() };
  if (!item.name) return item;
  list.push(item);
  writeList(KEY_FOREMAN, list);
  return item;
}
export function removeForemanMaster(id: string): void {
  writeList(
    KEY_FOREMAN,
    readList(KEY_FOREMAN).filter((x) => x.id !== id)
  );
}

export function loadKogataMasters(): MasterItem[] {
  return readList(KEY_KOGATA);
}
export function addKogataMaster(name: string): MasterItem {
  const list = readList(KEY_KOGATA);
  const item: MasterItem = { id: newId(), name: name.trim() };
  if (!item.name) return item;
  list.push(item);
  writeList(KEY_KOGATA, list);
  return item;
}
export function removeKogataMaster(id: string): void {
  writeList(
    KEY_KOGATA,
    readList(KEY_KOGATA).filter((x) => x.id !== id)
  );
}

export function loadAttendanceStaffMasters(): MasterItem[] {
  return readList(KEY_ATTENDANCE_STAFF);
}
export function addAttendanceStaffMaster(name: string): MasterItem {
  const list = readList(KEY_ATTENDANCE_STAFF);
  const item: MasterItem = { id: newId(), name: name.trim() };
  if (!item.name) return item;
  list.push(item);
  writeList(KEY_ATTENDANCE_STAFF, list);
  return item;
}
export function removeAttendanceStaffMaster(id: string): void {
  writeList(
    KEY_ATTENDANCE_STAFF,
    readList(KEY_ATTENDANCE_STAFF).filter((x) => x.id !== id)
  );
}

export function loadVehicleMasters(): MasterItem[] {
  return readList(KEY_VEHICLE);
}
export function addVehicleMaster(name: string): MasterItem {
  const list = readList(KEY_VEHICLE);
  const item: MasterItem = { id: newId(), name: name.trim() };
  if (!item.name) return item;
  list.push(item);
  writeList(KEY_VEHICLE, list);
  return item;
}
export function removeVehicleMaster(id: string): void {
  writeList(
    KEY_VEHICLE,
    readList(KEY_VEHICLE).filter((x) => x.id !== id)
  );
}

export function loadSalesMasters(): MasterItem[] {
  return readList(KEY_SALES);
}
export function addSalesMaster(name: string): MasterItem {
  const list = readList(KEY_SALES);
  const item: MasterItem = { id: newId(), name: name.trim() };
  if (!item.name) return item;
  list.push(item);
  writeList(KEY_SALES, list);
  return item;
}
export function removeSalesMaster(id: string): void {
  writeList(
    KEY_SALES,
    readList(KEY_SALES).filter((x) => x.id !== id)
  );
}

export function loadSiteTypeMasters(): MasterItem[] {
  ensureSiteTypeDefaults();
  ensureSiteTypeKouseiExtras();
  return readList(KEY_SITE_TYPE);
}
export function addSiteTypeMaster(name: string): MasterItem {
  loadSiteTypeMasters();
  const list = readList(KEY_SITE_TYPE);
  const item: MasterItem = { id: newId(), name: name.trim() };
  if (!item.name) return item;
  list.push(item);
  writeList(KEY_SITE_TYPE, list);
  return item;
}
export function removeSiteTypeMaster(id: string): void {
  writeList(
    KEY_SITE_TYPE,
    readList(KEY_SITE_TYPE).filter((x) => x.id !== id)
  );
}
