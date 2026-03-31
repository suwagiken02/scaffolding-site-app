import type { StaffMaster, StaffRole } from "../types/staffMaster";

const KEY = "master-staff-v1";

function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `staff-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeRoles(input: unknown): StaffRole[] {
  if (!Array.isArray(input)) return [];
  const out: StaffRole[] = [];
  for (const r of input) {
    if (r === "職長" || r === "子方" || r === "その他") out.push(r);
  }
  // uniq, stable
  return [...new Set(out)];
}

function normalizeRow(x: unknown): StaffMaster | null {
  if (typeof x !== "object" || x === null) return null;
  const o = x as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : "";
  const name = typeof o.name === "string" ? o.name.trim() : "";
  if (!id || !name) return null;
  const roles = normalizeRoles(o.roles);
  const attendanceEnabled =
    typeof o.attendanceEnabled === "boolean" ? o.attendanceEnabled : false;
  return { id, name, roles, attendanceEnabled };
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

function save(list: StaffMaster[]): void {
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent("staffMasterSaved"));
}

export function loadStaffMasters(): StaffMaster[] {
  const raw = readRaw();
  if (!Array.isArray(raw)) return [];
  const out: StaffMaster[] = [];
  for (const x of raw) {
    const row = normalizeRow(x);
    if (row) out.push(row);
  }
  return out;
}

export function addStaffMaster(input: Omit<StaffMaster, "id">): StaffMaster {
  const name = input.name.trim();
  const next: StaffMaster = {
    id: newId(),
    name,
    roles: normalizeRoles(input.roles),
    attendanceEnabled: Boolean(input.attendanceEnabled),
  };
  if (!next.name) return next;
  const list = loadStaffMasters();
  list.push(next);
  save(list);
  return next;
}

export function updateStaffMaster(next: StaffMaster): void {
  const normalized: StaffMaster = {
    id: next.id,
    name: next.name.trim(),
    roles: normalizeRoles(next.roles),
    attendanceEnabled: Boolean(next.attendanceEnabled),
  };
  if (!normalized.id || !normalized.name) return;
  const list = loadStaffMasters().map((r) => (r.id === normalized.id ? normalized : r));
  save(list);
}

export function removeStaffMaster(id: string): void {
  save(loadStaffMasters().filter((r) => r.id !== id));
}

export function staffHasRole(staff: StaffMaster, role: StaffRole): boolean {
  return staff.roles.includes(role);
}

