function apiBase(): string {
  const fromEnv = import.meta.env.VITE_EMAIL_API_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (import.meta.env.PROD && typeof window !== "undefined") {
    return window.location.origin;
  }
  return "http://localhost:3001";
}

/** FCM トークンをサーバーに保存（Render の fcm-tokens.json） */
export async function postFcmTokenToServer(
  staffId: string,
  token: string
): Promise<void> {
  const url = `${apiBase()}/api/fcm-tokens`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ staffId, token }),
  });
  if (!res.ok) {
    let err = "トークンの登録に失敗しました。";
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) err = j.error;
    } catch {
      // ignore
    }
    throw new Error(err);
  }
}

/** 外部ポータルから新規現場が登録されたとき（事務員向け FCM） */
export async function notifyExternalSiteRegisteredFcm(
  companyName: string,
  siteName: string
): Promise<void> {
  const url = `${apiBase()}/api/fcm-notify/external-site`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyName, siteName }),
    });
    if (!res.ok) {
      console.warn("[FCM] external-site notify failed:", res.status);
    }
  } catch (e) {
    console.warn("[FCM] external-site notify:", e);
  }
}
