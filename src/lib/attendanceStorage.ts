import type { AttendanceRecord, AttendanceStore } from "../types/attendance";
import { persistLocalStorageKeyToServer } from "./persistStorageApi";

const KEY = "scaffolding-attendance-v1";

function readRaw(): unknown {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeRaw(store: AttendanceStore): void {
  localStorage.setItem(KEY, JSON.stringify(store));
  persistLocalStorageKeyToServer(KEY);
  window.dispatchEvent(new CustomEvent("attendanceSaved"));
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isIsoOrNull(x: unknown): x is string | null {
  return x === null || typeof x === "string";
}

function isStringOrNull(x: unknown): x is string | null {
  return x === null || typeof x === "string";
}

function normalizeRecord(dateKey: string, x: unknown): AttendanceRecord {
  if (typeof x !== "object" || x === null) {
    return { dateKey, meetingTime: null, inAt: null, outAt: null };
  }
  const o = x as Record<string, unknown>;
  const inAtPrimary = isIsoOrNull(o.inAt) ? o.inAt : null;
  const inAtAlias = isIsoOrNull(o.checkInTime) ? o.checkInTime : null;
  const inAt = inAtPrimary ?? inAtAlias;
  const outAt = isIsoOrNull(o.outAt) ? o.outAt : null;
  const meetingTimeRaw = isStringOrNull(o.meetingTime) ? o.meetingTime : null;
  const scheduledRaw = isStringOrNull(o.scheduledTime) ? o.scheduledTime : null;
  const meetingMerged =
    (typeof meetingTimeRaw === "string" && meetingTimeRaw.trim()) ||
    (typeof scheduledRaw === "string" && scheduledRaw.trim()) ||
    "";
  const meetingTime = meetingMerged ? meetingMerged.trim() : null;
  return { dateKey, meetingTime, inAt, outAt };
}

export function loadAttendanceStore(): AttendanceStore {
  const raw = readRaw();
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: AttendanceStore = {};
  for (const [person, datesRaw] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof datesRaw !== "object" || datesRaw === null || Array.isArray(datesRaw)) continue;
    const byDate: Record<string, AttendanceRecord> = {};
    for (const [dk, recRaw] of Object.entries(datesRaw as Record<string, unknown>)) {
      if (typeof dk !== "string") continue;
      byDate[dk] = normalizeRecord(dk, recRaw);
    }
    out[person] = byDate;
  }
  return out;
}

export function loadAttendanceForPersonDate(
  personName: string,
  dateKey: string
): AttendanceRecord {
  const store = loadAttendanceStore();
  const p = store[personName] ?? {};
  return p[dateKey] ?? { dateKey, meetingTime: null, inAt: null, outAt: null };
}

export type PunchKind = "in" | "out" | "already_done";

export function nextPunchKind(record: AttendanceRecord): PunchKind {
  if (!record.inAt) return "in";
  if (!record.outAt) return "out";
  return "already_done";
}

export function saveAttendanceForPersonDate(
  personName: string,
  record: AttendanceRecord
): void {
  const store = loadAttendanceStore();
  const prev = store[personName] ?? {};
  store[personName] = { ...prev, [record.dateKey]: record };
  writeRaw(store);
}

export function deleteAttendanceForPersonDate(personName: string, dateKey: string): void {
  const store = loadAttendanceStore();
  const prev = store[personName];
  if (!prev || !prev[dateKey]) return;
  const nextPerson: Record<string, AttendanceRecord> = { ...prev };
  delete nextPerson[dateKey];
  if (Object.keys(nextPerson).length === 0) {
    const nextStore: AttendanceStore = { ...store };
    delete nextStore[personName];
    writeRaw(nextStore);
  } else {
    store[personName] = nextPerson;
    writeRaw(store);
  }
}

/** ローカル日付（dateKey）＋ HH:MM から ISO 文字列を生成 */
export function localIsoFromDateKeyHHmm(dateKey: string, hhmm: string): string | null {
  const totalMin = parseHHmmToMinutes(hhmm.trim());
  if (totalMin === null) return null;
  const parts = dateKey.split("-").map(Number);
  if (parts.length !== 3) return null;
  const [y, mo, d] = parts;
  if (!y || !mo || !d) return null;
  const dt = new Date(y, mo - 1, d, Math.floor(totalMin / 60), totalMin % 60, 0, 0);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

export function hhmmFromLocalIso(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function normalizeHHmmOrNull(raw: string): string | null {
  const t = raw.trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23) return null;
  if (mm < 0 || mm > 59) return null;
  return `${pad2(hh)}:${pad2(mm)}`;
}

export type UpdateAttendanceHHmmResult =
  | { ok: true }
  | { ok: false; error: string };

/** 稼働管理などから打刻を HH:MM で上書きする */
export function updateAttendanceFromHHmmFields(
  personName: string,
  dateKey: string,
  fields: { inHHmm: string; outHHmm: string; meetingHHmm: string }
): UpdateAttendanceHHmmResult {
  const inTrim = fields.inHHmm.trim();
  const outTrim = fields.outHHmm.trim();
  const meetTrim = fields.meetingHHmm.trim();

  let inAt: string | null = null;
  if (inTrim) {
    const iso = localIsoFromDateKeyHHmm(dateKey, inTrim);
    if (!iso) return { ok: false, error: "出勤時間の形式が正しくありません（HH:MM）。" };
    inAt = iso;
  }

  let outAt: string | null = null;
  if (outTrim) {
    const iso = localIsoFromDateKeyHHmm(dateKey, outTrim);
    if (!iso) return { ok: false, error: "退勤時間の形式が正しくありません（HH:MM）。" };
    outAt = iso;
  }

  let meetingTime: string | null = null;
  if (meetTrim) {
    const n = normalizeHHmmOrNull(meetTrim);
    if (!n) return { ok: false, error: "集合時間の形式が正しくありません（HH:MM）。" };
    meetingTime = n;
  }

  if (inAt && outAt) {
    const inMs = Date.parse(inAt);
    const outMs = Date.parse(outAt);
    if (Number.isFinite(inMs) && Number.isFinite(outMs) && outMs < inMs) {
      return { ok: false, error: "退勤は出勤より後の時刻にしてください。" };
    }
  }

  if (!inAt && !outAt && !meetingTime) {
    deleteAttendanceForPersonDate(personName, dateKey);
    return { ok: true };
  }

  const record: AttendanceRecord = { dateKey, meetingTime, inAt, outAt };
  saveAttendanceForPersonDate(personName, record);
  return { ok: true };
}

export function punchAttendance(
  personName: string,
  dateKey: string,
  nowIso: string,
  meetingTime: string | null
): { kind: PunchKind; record: AttendanceRecord } {
  const current = loadAttendanceForPersonDate(personName, dateKey);
  const kind = nextPunchKind(current);
  if (kind === "in") {
    const next: AttendanceRecord = { ...current, meetingTime, inAt: nowIso };
    saveAttendanceForPersonDate(personName, next);
    return { kind, record: next };
  }
  if (kind === "out") {
    const next: AttendanceRecord = {
      ...current,
      meetingTime: meetingTime ?? current.meetingTime ?? null,
      outAt: nowIso,
    };
    saveAttendanceForPersonDate(personName, next);
    return { kind, record: next };
  }
  return { kind, record: current };
}

export function parseHHmmToMinutes(hhmm: string | null): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23) return null;
  if (mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

export function isoToLocalMinutes(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.getHours() * 60 + d.getMinutes();
}

/** 集合時間が未設定でなければ、出勤打刻が集合時間より後なら遅刻 */
export function isCheckInLate(record: AttendanceRecord): boolean {
  const meetingMin = parseHHmmToMinutes(record.meetingTime);
  const inMin = isoToLocalMinutes(record.inAt);
  return meetingMin !== null && inMin !== null && inMin > meetingMin;
}

export function listAttendanceInMonth(
  personName: string,
  year: number,
  month1to12: number
): AttendanceRecord[] {
  const prefix = `${year}-${String(month1to12).padStart(2, "0")}`;
  const store = loadAttendanceStore();
  const byDate = store[personName] ?? {};
  const list = Object.values(byDate).filter((r) => r.dateKey.slice(0, 7) === prefix);
  return list.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

export function formatTimeJa(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ja-JP", { timeStyle: "short" }).format(d);
}

export function workMinutes(record: AttendanceRecord): number | null {
  if (!record.inAt || !record.outAt) return null;
  const inMs = Date.parse(record.inAt);
  const outMs = Date.parse(record.outAt);
  if (!Number.isFinite(inMs) || !Number.isFinite(outMs) || outMs < inMs) return null;
  return Math.round((outMs - inMs) / 60000);
}

export function formatDurationHm(minutes: number | null): string {
  if (minutes === null) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}時間${m}分`;
}

