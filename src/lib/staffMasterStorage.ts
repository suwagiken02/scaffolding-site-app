import {
  staffCanReceiveAdminNotify,
  STAFF_TECH_RATING_OPTIONS,
  type StaffBirthdayLeaveUsage,
  type StaffEmergencyContact,
  type StaffInsuranceProfile,
  type StaffJobRole,
  type StaffMaster,
  type StaffPaidLeaveUsage,
  type StaffTechRating,
} from "../types/staffMaster";
import { persistLocalStorageKeyToServer } from "./persistStorageApi";

const KEY = "master-staff-v1";

function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `staff-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** 旧データの roles 配列 */
type LegacyStaffRole = "職長" | "子方" | "その他";

function normalizeLegacyRoles(input: unknown): LegacyStaffRole[] {
  if (!Array.isArray(input)) return [];
  const out: LegacyStaffRole[] = [];
  for (const r of input) {
    if (r === "職長" || r === "子方" || r === "その他") out.push(r);
  }
  return [...new Set(out)];
}

/**
 * 単一 role または旧 roles[]・attendanceEnabled から StaffJobRole を決定。
 * - 既存「職長」「子方」はそのまま
 * - 「その他」→「内勤」
 * - attendanceEnabled は参照しない
 */
function migrateToJobRole(o: Record<string, unknown>): StaffJobRole {
  const r = o.role;
  if (
    r === "職長" ||
    r === "子方" ||
    r === "内勤" ||
    r === "協力業者" ||
    r === "役員"
  ) {
    return r;
  }
  const legacy = normalizeLegacyRoles(o.roles);
  if (legacy.includes("職長")) return "職長";
  if (legacy.includes("子方")) return "子方";
  if (legacy.includes("その他")) return "内勤";
  return "内勤";
}

function normalizePin4(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\D/g, "").slice(0, 4);
}

function normalizePersonalCode6(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\D/g, "").slice(0, 6);
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

function normalizePaidLeaveUsages(x: unknown): StaffPaidLeaveUsage[] {
  if (!Array.isArray(x)) return [];
  const out: StaffPaidLeaveUsage[] = [];
  for (const r of x) {
    if (typeof r !== "object" || r === null) continue;
    const o = r as Record<string, unknown>;
    const dateKey = typeof o.dateKey === "string" ? o.dateKey.trim() : "";
    const days = typeof o.days === "number" && Number.isFinite(o.days) ? o.days : 0;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || days <= 0) continue;
    out.push({ dateKey, days });
  }
  return out;
}

function normalizeTechRating(raw: unknown): StaffTechRating | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim();
  if (!t) return undefined;
  return (STAFF_TECH_RATING_OPTIONS as readonly string[]).includes(t)
    ? (t as StaffTechRating)
    : undefined;
}

/** 0〜50。無効・未設定は undefined */
function normalizeInnerScore(raw: unknown): number | undefined {
  if (raw === null || raw === undefined) return undefined;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return undefined;
  const c = Math.round(n);
  if (c < 0) return 0;
  if (c > 50) return 50;
  return c;
}

function normalizeBirthdayLeaveUsages(x: unknown): StaffBirthdayLeaveUsage[] {
  if (!Array.isArray(x)) return [];
  const out: StaffBirthdayLeaveUsage[] = [];
  for (const r of x) {
    if (typeof r !== "object" || r === null) continue;
    const o = r as Record<string, unknown>;
    const dateKey = typeof o.dateKey === "string" ? o.dateKey.trim() : "";
    const days = typeof o.days === "number" && Number.isFinite(o.days) ? o.days : 1;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || days <= 0) continue;
    out.push({ dateKey, days });
  }
  return out;
}

function normalizeRow(x: unknown): StaffMaster | null {
  if (typeof x !== "object" || x === null) return null;
  const o = x as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : "";
  const name = typeof o.name === "string" ? o.name.trim() : "";
  if (!id || !name) return null;
  const email = typeof o.email === "string" ? o.email.trim() : "";
  const role = migrateToJobRole(o);
  const canAdmin = staffCanReceiveAdminNotify(role);
  const isAdmin = canAdmin && o.isAdmin === true;
  const fcmTok =
    isAdmin &&
    typeof o.fcmToken === "string" &&
    o.fcmToken.trim().length > 0
      ? o.fcmToken.trim()
      : undefined;
  const techRating = normalizeTechRating(o.techRating);
  const innerScoreCurrent = normalizeInnerScore(o.innerScoreCurrent);
  const innerScorePrev = normalizeInnerScore(o.innerScorePrev);
  return {
    id,
    name,
    email,
    role,
    ...(isAdmin ? { isAdmin: true } : {}),
    ...(fcmTok ? { fcmToken: fcmTok } : {}),
    personalPin: normalizePin4(o.personalPin),
    personalCode: normalizePersonalCode6(o.personalCode),
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
    paidLeaveUsages: normalizePaidLeaveUsages(o.paidLeaveUsages),
    birthdayLeaveUsages: normalizeBirthdayLeaveUsages(o.birthdayLeaveUsages),
    ...(techRating !== undefined ? { techRating } : {}),
    ...(innerScoreCurrent !== undefined ? { innerScoreCurrent } : {}),
    ...(innerScorePrev !== undefined ? { innerScorePrev } : {}),
  };
}

function normalizeStaffMasterComplete(input: StaffMaster): StaffMaster {
  const raw = input as unknown as Record<string, unknown>;
  const roleResolved = migrateToJobRole({ ...raw, role: input.role });
  const canAdmin = staffCanReceiveAdminNotify(roleResolved);
  const isAdmin = canAdmin && input.isAdmin === true;
  const fcmTok =
    isAdmin &&
    typeof input.fcmToken === "string" &&
    input.fcmToken.trim().length > 0
      ? input.fcmToken.trim()
      : undefined;
  const techRating = normalizeTechRating(input.techRating);
  const innerScoreCurrent = normalizeInnerScore(input.innerScoreCurrent);
  const innerScorePrev = normalizeInnerScore(input.innerScorePrev);
  return {
    id: input.id.trim(),
    name: input.name.trim(),
    email: typeof input.email === "string" ? input.email.trim() : "",
    role: roleResolved,
    ...(isAdmin ? { isAdmin: true } : {}),
    ...(fcmTok ? { fcmToken: fcmTok } : {}),
    personalPin: normalizePin4(input.personalPin),
    personalCode: normalizePersonalCode6(input.personalCode),
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
    paidLeaveUsages: normalizePaidLeaveUsages(input.paidLeaveUsages),
    birthdayLeaveUsages: normalizeBirthdayLeaveUsages(input.birthdayLeaveUsages),
    ...(techRating !== undefined ? { techRating } : {}),
    ...(innerScoreCurrent !== undefined ? { innerScoreCurrent } : {}),
    ...(innerScorePrev !== undefined ? { innerScorePrev } : {}),
  };
}

function defaultStaffFields(): Omit<StaffMaster, "id" | "name" | "role"> {
  return {
    isAdmin: false,
    personalPin: "",
    personalCode: "",
    email: "",
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
    paidLeaveUsages: [],
    birthdayLeaveUsages: [],
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
    role: migrateToJobRole({ role: input.role }),
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
