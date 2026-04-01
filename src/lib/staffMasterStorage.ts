import type {
  StaffEmergencyContact,
  StaffInsuranceProfile,
  StaffMaster,
  StaffRole,
} from "../types/staffMaster";
import { persistLocalStorageKeyToServer } from "./persistStorageApi";

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
  return [...new Set(out)];
}

function normalizePin4(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\D/g, "").slice(0, 4);
}

function defaultEmergency(): StaffEmergencyContact {
  return { name: "", relationship: "", phone: "" };
}

function defaultInsurance(): StaffInsuranceProfile {
  return { health: "", pension: "", employment: "" };
}

function normalizeEmergency(x: unknown): StaffEmergencyContact {
  if (typeof x !== "object" || x === null) return defaultEmergency();
  const o = x as Record<string, unknown>;
  return {
    name: typeof o.name === "string" ? o.name.trim() : "",
    relationship: typeof o.relationship === "string" ? o.relationship.trim() : "",
    phone: typeof o.phone === "string" ? o.phone.trim() : "",
  };
}

function normalizeInsurance(x: unknown): StaffInsuranceProfile {
  if (typeof x !== "object" || x === null) return defaultInsurance();
  const o = x as Record<string, unknown>;
  return {
    health: typeof o.health === "string" ? o.health.trim() : "",
    pension: typeof o.pension === "string" ? o.pension.trim() : "",
    employment: typeof o.employment === "string" ? o.employment.trim() : "",
  };
}

function normalizeQualifications(x: unknown): string[] {
  if (!Array.isArray(x)) return [];
  const out: string[] = [];
  for (const q of x) {
    if (typeof q === "string" && q.trim()) out.push(q.trim());
  }
  return out;
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
  return {
    id,
    name,
    roles,
    attendanceEnabled,
    personalPin: normalizePin4(o.personalPin),
    birthDate: typeof o.birthDate === "string" ? o.birthDate.trim() : "",
    address: typeof o.address === "string" ? o.address.trim() : "",
    jobType: typeof o.jobType === "string" ? o.jobType.trim() : "",
    position: typeof o.position === "string" ? o.position.trim() : "",
    hireDate: typeof o.hireDate === "string" ? o.hireDate.trim() : "",
    emergencyContact: normalizeEmergency(o.emergencyContact),
    insurance: normalizeInsurance(o.insurance),
    kentaiBook: typeof o.kentaiBook === "boolean" ? o.kentaiBook : false,
    chutaiBook: typeof o.chutaiBook === "boolean" ? o.chutaiBook : false,
    qualifications: normalizeQualifications(o.qualifications),
  };
}

function normalizeStaffMasterComplete(input: StaffMaster): StaffMaster {
  return {
    id: input.id.trim(),
    name: input.name.trim(),
    roles: normalizeRoles(input.roles),
    attendanceEnabled: Boolean(input.attendanceEnabled),
    personalPin: normalizePin4(input.personalPin),
    birthDate: input.birthDate.trim(),
    address: input.address.trim(),
    jobType: input.jobType.trim(),
    position: input.position.trim(),
    hireDate: input.hireDate.trim(),
    emergencyContact: normalizeEmergency(input.emergencyContact),
    insurance: normalizeInsurance(input.insurance),
    kentaiBook: Boolean(input.kentaiBook),
    chutaiBook: Boolean(input.chutaiBook),
    qualifications: normalizeQualifications(input.qualifications),
  };
}

function defaultStaffFields(): Omit<StaffMaster, "id" | "name" | "roles" | "attendanceEnabled"> {
  return {
    personalPin: "",
    birthDate: "",
    address: "",
    jobType: "",
    position: "",
    hireDate: "",
    emergencyContact: defaultEmergency(),
    insurance: defaultInsurance(),
    kentaiBook: false,
    chutaiBook: false,
    qualifications: [],
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

function save(list: StaffMaster[]): void {
  localStorage.setItem(KEY, JSON.stringify(list));
  persistLocalStorageKeyToServer(KEY);
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

export function getStaffMasterById(id: string): StaffMaster | null {
  const list = loadStaffMasters();
  return list.find((r) => r.id === id) ?? null;
}

export function addStaffMaster(input: Omit<StaffMaster, "id">): StaffMaster {
  const name = input.name.trim();
  const id = newId();
  const merged: StaffMaster = {
    ...defaultStaffFields(),
    ...input,
    id,
    name,
    roles: normalizeRoles(input.roles),
    attendanceEnabled: Boolean(input.attendanceEnabled),
  };
  const next = normalizeStaffMasterComplete(merged);
  if (!next.name) return next;
  const list = loadStaffMasters();
  list.push(next);
  save(list);
  return next;
}

export function updateStaffMaster(next: StaffMaster): void {
  const normalized = normalizeStaffMasterComplete(next);
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
