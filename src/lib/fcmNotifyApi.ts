import type { WorkKind } from "../types/workKind";

function apiBase(): string {
  const fromEnv = import.meta.env.VITE_EMAIL_API_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (import.meta.env.PROD && typeof window !== "undefined") {
    return window.location.origin;
  }
  return "http://localhost:3001";
}

async function postNotify(
  path: string,
  body: Record<string, unknown>
): Promise<void> {
  try {
    const res = await fetch(`${apiBase()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn("[FCM notify]", path, res.status);
    }
  } catch (e) {
    console.warn("[FCM notify]", path, e);
  }
}

/** 作業開始打刻後 — 全スタッフへ */
export function notifyWorkStartFcm(
  siteName: string,
  workKind: WorkKind
): void {
  void postNotify("/api/fcm-notify/work-start", { siteName, workKind });
}

/** 作業終了打刻後 — 全スタッフへ */
export function notifyWorkEndFcm(siteName: string, workKind: WorkKind): void {
  void postNotify("/api/fcm-notify/work-end", { siteName, workKind });
}

/** 出退勤打刻完了 — 本人へ（personName はスタッフマスター名と一致させる） */
export function notifyAttendancePunchFcm(
  staffName: string,
  punchKind: "in" | "out",
  timeIso: string
): void {
  void postNotify("/api/fcm-notify/attendance", {
    staffName,
    punchKind,
    timeIso,
  });
}
