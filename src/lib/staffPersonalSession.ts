const PREFIX = "staffPersonalAuthed_";
/** プッシュ通知の FCM トークン紐付け用（値はスタッフ名。個人ページ PIN 成功時に sessionStorage へ保存） */
const FCM_STAFF_NAME_KEY = "scaffolding-fcm-staff-name";

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

export function setFcmStaffContext(staffName: string): void {
  try {
    const v = staffName.trim();
    if (!v) return;
    sessionStorage.setItem(FCM_STAFF_NAME_KEY, v);
    try {
      localStorage.removeItem("scaffolding-fcm-staff-id");
      localStorage.removeItem(FCM_STAFF_NAME_KEY);
    } catch {
      // ignore
    }
  } catch {
    // ignore
  }
}

/** PIN終了時など、サーバーへ送るスタッフ名紐付けを消す */
export function clearFcmStaffContext(): void {
  try {
    sessionStorage.removeItem(FCM_STAFF_NAME_KEY);
    localStorage.removeItem("scaffolding-fcm-staff-id");
    localStorage.removeItem(FCM_STAFF_NAME_KEY);
  } catch {
    // ignore
  }
}

/** サーバー登録用のスタッフ名（マスターの氏名と一致させる） */
export function getFcmStaffContext(): string | null {
  try {
    const fromSession = sessionStorage.getItem(FCM_STAFF_NAME_KEY)?.trim();
    if (fromSession) return fromSession;
    return null;
  } catch {
    return null;
  }
}
