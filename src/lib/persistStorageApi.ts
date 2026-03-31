const API_BASE = (import.meta.env.VITE_EMAIL_API_URL ?? "").replace(/\/$/, "");

function base(): string {
  // When FE is served by same Express, VITE_EMAIL_API_URL can be empty.
  return API_BASE || "";
}

export async function hydrateLocalStorageFromServer(): Promise<void> {
  try {
    const res = await fetch(`${base()}/api/storage/bulk`, { method: "GET" });
    if (!res.ok) return;
    const data = (await res.json()) as Record<string, string>;
    if (!data || typeof data !== "object") return;
    const keys = Object.keys(data);
    // If server has no data yet, seed it from current localStorage.
    if (keys.length === 0) {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        persistLocalStorageKeyToServer(k);
      }
      return;
    }
    for (const [k, v] of Object.entries(data)) {
      if (typeof k !== "string" || typeof v !== "string") continue;
      localStorage.setItem(k, v);
    }
  } catch {
    // ignore (offline / server not running)
  }
}

export function persistLocalStorageKeyToServer(key: string): void {
  if (!import.meta.env.PROD) return;
  try {
    const v = localStorage.getItem(key);
    // persist null as empty string (so server file exists)
    void fetch(`${base()}/api/storage/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: v ?? "" }),
    });
  } catch {
    // ignore
  }
}

