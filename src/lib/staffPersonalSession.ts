const PREFIX = "staffPersonalAuthed_";
/** プッシュ通知の FCM トークン紐付け用（個人ページ PIN 認証成功時に保存） */
const FCM_STAFF_ID_KEY = "scaffolding-fcm-staff-id";

export function staffPersonalSessionKey(id: string): string {
  return `${PREFIX}${id}`;
}

export function isStaffPersonalAuthed(id: string): boolean {
  try {
    return sessionStorage.getItem(staffPersonalSessionKey(id)) === "1";
  } catch {
    return false;
  }
}

export function setStaffPersonalAuthed(id: string): void {
  try {
    sessionStorage.setItem(staffPersonalSessionKey(id), "1");
  } catch {
    // ignore
  }
}

export function clearStaffPersonalAuthed(id: string): void {
  try {
    sessionStorage.removeItem(staffPersonalSessionKey(id));
  } catch {
    // ignore
  }
}

export function setFcmStaffContext(staffId: string): void {
  try {
    const v = staffId.trim();
    if (!v) return;
    localStorage.setItem(FCM_STAFF_ID_KEY, v);
  } catch {
    // ignore
  }
}

export function getFcmStaffContext(): string | null {
  try {
    const v = localStorage.getItem(FCM_STAFF_ID_KEY);
    return v?.trim() || null;
  } catch {
    return null;
  }
}
