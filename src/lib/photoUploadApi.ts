function photoUploadApiBase(): string {
  const fromEnv = import.meta.env.VITE_EMAIL_API_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (import.meta.env.PROD && typeof window !== "undefined") {
    return window.location.origin;
  }
  return "http://localhost:3001";
}

export async function uploadSitePhotoToR2(
  file: File,
  meta: { siteId: string; workKind: string; dateKey: string }
): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("siteId", meta.siteId);
  fd.append("workKind", meta.workKind);
  fd.append("dateKey", meta.dateKey);

  const url = `${photoUploadApiBase()}/api/photos/upload`;
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", body: fd });
  } catch (e) {
    console.error("[photoUploadApi] fetch failed:", e);
    throw new Error(
      `写真アップロードAPIに接続できませんでした（${url}）。サーバーが起動しているか確認してください。`
    );
  }

  let data: { ok?: boolean; error?: string; url?: string } = {};
  try {
    data = await res.json();
  } catch {
    // ignore
  }

  if (!res.ok || !data.ok || typeof data.url !== "string" || !data.url.trim()) {
    throw new Error(data.error ?? "写真のアップロードに失敗しました。");
  }

  return data.url.trim();
}
