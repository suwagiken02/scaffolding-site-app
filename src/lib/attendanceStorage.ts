import type { AttendanceRecord, AttendanceStore } from "../types/attendance";
import {
  fetchAttendanceStoreFromApi,
  postAttendanceDelete,
  postAttendanceUpsert,
} from "./attendanceApi";
import { notifyAttendancePunchFcm } from "./fcmNotifyApi";

function dispatchSaved() {
  window.dispatchEvent(new CustomEvent("attendanceSaved"));
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** サーバーから全件取得（打刻データの唯一の取得元） */
export async function loadAttendanceStore(): Promise<AttendanceStore> {
  return fetchAttendanceStoreFromApi();
}

export function getAttendanceRecord(
  store: AttendanceStore,
  personName: string,
  dateKey: string
): AttendanceRecord {
  const p = store[personName] ?? {};
  return p[dateKey] ?? { dateKey, meetingTime: null, inAt: null, outAt: null };
}

export type PunchKind = "in" | "out" | "already_done";

export function nextPunchKind(record: AttendanceRecord): PunchKind {
  if (!record.inAt) return "in";
  if (!record.outAt) return "out";
  return "already_done";
}

export async function saveAttendanceForPersonDate(
  personName: string,
  record: AttendanceRecord
): Promise<void> {
  await postAttendanceUpsert(personName, record);
  dispatchSaved();
}

export async function deleteAttendanceForPersonDate(
  personName: string,
  dateKey: string
): Promise<void> {
  await postAttendanceDelete(personName, dateKey);
  dispatchSaved();
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
export async function updateAttendanceFromHHmmFields(
  personName: string,
  dateKey: string,
  fields: { inHHmm: string; outHHmm: string; meetingHHmm: string }
): Promise<UpdateAttendanceHHmmResult> {
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

  try {
    if (!inAt && !outAt && !meetingTime) {
      await deleteAttendanceForPersonDate(personName, dateKey);
      return { ok: true };
    }

    const record: AttendanceRecord = { dateKey, meetingTime, inAt, outAt };
    await saveAttendanceForPersonDate(personName, record);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "保存に失敗しました。";
    return { ok: false, error: msg };
  }
}

export async function punchAttendance(
  personName: string,
  dateKey: string,
  nowIso: string,
  meetingTime: string | null
): Promise<{ kind: PunchKind; record: AttendanceRecord }> {
  const store = await loadAttendanceStore();
  const current = getAttendanceRecord(store, personName, dateKey);
  const kind = nextPunchKind(current);
  if (kind === "in") {
    const next: AttendanceRecord = { ...current, meetingTime, inAt: nowIso };
    await saveAttendanceForPersonDate(personName, next);
    notifyAttendancePunchFcm(personName, "in", nowIso);
    return { kind, record: next };
  }
  if (kind === "out") {
    const next: AttendanceRecord = {
      ...current,
      meetingTime: meetingTime ?? current.meetingTime ?? null,
      outAt: nowIso,
    };
    await saveAttendanceForPersonDate(personName, next);
    notifyAttendancePunchFcm(personName, "out", nowIso);
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
  store: AttendanceStore,
  personName: string,
  year: number,
  month1to12: number
): AttendanceRecord[] {
  const prefix = `${year}-${String(month1to12).padStart(2, "0")}`;
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
