function apiBase(): string {
  const fromEnv = import.meta.env.VITE_EMAIL_API_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (import.meta.env.PROD && typeof window !== "undefined") {
    return window.location.origin;
  }
  return "http://localhost:3001";
}

export async function uploadSiteDocumentToR2(
  file: File,
  meta: { siteId: string }
): Promise<{ url: string; key: string }> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("siteId", meta.siteId);

  const url = `${apiBase()}/api/site-documents/upload`;
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", body: fd });
  } catch (e) {
    console.error("[documentUploadApi] fetch failed:", e);
    throw new Error(
      `書類アップロードAPIに接続できませんでした（${url}）。サーバーが起動しているか確認してください。`
    );
  }

  let data: { ok?: boolean; error?: string; url?: string; key?: string } = {};
  try {
    data = await res.json();
  } catch {
    // ignore
  }

  if (
    !res.ok ||
    !data.ok ||
    typeof data.url !== "string" ||
    !data.url.trim() ||
    typeof data.key !== "string" ||
    !data.key.trim()
  ) {
    throw new Error(data.error ?? "書類のアップロードに失敗しました。");
  }

  return { url: data.url.trim(), key: data.key.trim() };
}

export async function deleteSiteDocumentFromR2(
  siteId: string,
  r2Key: string
): Promise<void> {
  const url = `${apiBase()}/api/site-documents/delete`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId, key: r2Key }),
    });
  } catch (e) {
    console.error("[documentUploadApi] delete fetch failed:", e);
    throw new Error("書類削除APIに接続できませんでした。");
  }

  let data: { ok?: boolean; error?: string } = {};
  try {
    data = await res.json();
  } catch {
    // ignore
  }

  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? "書類の削除に失敗しました。");
  }
}
