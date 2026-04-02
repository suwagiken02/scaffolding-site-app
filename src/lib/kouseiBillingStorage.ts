/** サーバー kousei-billing-v2.json と同一構造 */

export type KouseiBillingStatus = "sent" | "confirmed";

export type KouseiBillingRow = {
  siteId: string;
  siteName: string;
  clientName: string;
  workKind: string;
  dateKey: string;
  peopleCount: number;
  amount: number | null;
  memo: string;
  checked: boolean;
};

export type KouseiBillingRecord = {
  id: string;
  month: string;
  sentAt: string;
  dateRangeEnd: string;
  rows: KouseiBillingRow[];
  status: KouseiBillingStatus;
};

function apiBase(): string {
  return (import.meta.env.VITE_EMAIL_API_URL ?? "").replace(/\/$/, "");
}

function apiUrl(path: string): string {
  const b = apiBase();
  return b ? `${b}${path}` : path;
}

export function kouseiBillingRowKey(r: Pick<KouseiBillingRow, "siteId" | "workKind" | "dateKey">): string {
  return `${r.siteId}__${r.workKind}__${r.dateKey}`;
}

export async function fetchKouseiBillingRecords(): Promise<KouseiBillingRecord[]> {
  const res = await fetch(apiUrl("/api/kousei-billing"), { method: "GET" });
  const data = (await res.json()) as {
    ok?: boolean;
    records?: KouseiBillingRecord[];
    error?: string;
  };
  if (!res.ok || !data.ok || !Array.isArray(data.records)) {
    throw new Error(data.error ?? "請求データの取得に失敗しました");
  }
  return data.records;
}

export async function postKouseiBillingSend(body: {
  month: string;
  dateRangeEnd: string;
  rows: KouseiBillingRow[];
  adminPin: string;
}): Promise<KouseiBillingRecord> {
  const res = await fetch(apiUrl("/api/kousei-billing"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as {
    ok?: boolean;
    record?: KouseiBillingRecord;
    error?: string;
  };
  if (!res.ok || !data.ok || !data.record) {
    throw new Error(data.error ?? "確定送信に失敗しました");
  }
  return data.record;
}

export async function putKouseiBillingUpdate(
  id: string,
  body: {
    rows: KouseiBillingRow[];
    status?: KouseiBillingStatus;
  }
): Promise<KouseiBillingRecord> {
  const res = await fetch(
    apiUrl(`/api/kousei-billing/${encodeURIComponent(id)}`),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  const data = (await res.json()) as {
    ok?: boolean;
    record?: KouseiBillingRecord;
    error?: string;
  };
  if (!res.ok || !data.ok || !data.record) {
    throw new Error(data.error ?? "更新に失敗しました");
  }
  return data.record;
}
