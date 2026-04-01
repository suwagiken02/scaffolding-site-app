import type { AttendanceRecord, AttendanceStore } from "../types/attendance";

function apiBase(): string {
  return (import.meta.env.VITE_EMAIL_API_URL ?? "").replace(/\/$/, "");
}

function apiUrl(path: string): string {
  const b = apiBase();
  return b ? `${b}${path}` : path;
}

function isIsoOrNull(x: unknown): x is string | null {
  return x === null || typeof x === "string";
}

function isStringOrNull(x: unknown): x is string | null {
  return x === null || typeof x === "string";
}

export function normalizeAttendanceRecord(dateKey: string, x: unknown): AttendanceRecord {
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

export function normalizeAttendanceStore(raw: unknown): AttendanceStore {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: AttendanceStore = {};
  for (const [person, datesRaw] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof datesRaw !== "object" || datesRaw === null || Array.isArray(datesRaw)) {
      continue;
    }
    const byDate: Record<string, AttendanceRecord> = {};
    for (const [dk, recRaw] of Object.entries(datesRaw as Record<string, unknown>)) {
      if (typeof dk !== "string") continue;
      byDate[dk] = normalizeAttendanceRecord(dk, recRaw);
    }
    out[person] = byDate;
  }
  return out;
}

export async function fetchAttendanceStoreFromApi(): Promise<AttendanceStore> {
  const res = await fetch(apiUrl("/api/attendance"), { method: "GET" });
  if (!res.ok) {
    throw new Error(`打刻データの取得に失敗しました（${res.status}）`);
  }
  const data = (await res.json()) as { ok?: boolean; store?: unknown };
  if (!data.ok) {
    throw new Error("打刻データの取得に失敗しました。");
  }
  return normalizeAttendanceStore(data.store);
}

export async function postAttendanceUpsert(
  personName: string,
  record: AttendanceRecord
): Promise<void> {
  const res = await fetch(apiUrl("/api/attendance"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ personName, record }),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? `打刻の保存に失敗しました（${res.status}）`);
  }
}

export async function postAttendanceDelete(
  personName: string,
  dateKey: string
): Promise<void> {
  const res = await fetch(apiUrl("/api/attendance"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "delete", personName, dateKey }),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? `打刻の削除に失敗しました（${res.status}）`);
  }
}
