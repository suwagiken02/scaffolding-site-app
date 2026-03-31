import type { AttendanceRecord, AttendanceStore } from "../types/attendance";

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
  window.dispatchEvent(new CustomEvent("attendanceSaved"));
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
  const inAt = isIsoOrNull(o.inAt) ? o.inAt : null;
  const outAt = isIsoOrNull(o.outAt) ? o.outAt : null;
  const meetingTimeRaw = isStringOrNull(o.meetingTime) ? o.meetingTime : null;
  const meetingTime =
    typeof meetingTimeRaw === "string" && meetingTimeRaw.trim()
      ? meetingTimeRaw.trim()
      : null;
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

