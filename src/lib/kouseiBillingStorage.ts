import type { KouseiRow } from "./kouseiListStorage";

export type KouseiBillingStatus = "sent" | "approved";

/** サーバー `/var/data/kousei-billing-v1.json` と同一構造の1レコード */
export type KouseiBillingRecord = {
  id: string;
  month: string;
  sentAt: string;
  rows: KouseiRow[];
  status: KouseiBillingStatus;
  amounts: Record<string, number>;
  approvedAt?: string;
};

function apiBase(): string {
  return (import.meta.env.VITE_EMAIL_API_URL ?? "").replace(/\/$/, "");
}

function apiUrl(path: string): string {
  const b = apiBase();
  return b ? `${b}${path}` : path;
}

export function kouseiBillingRowKey(r: KouseiRow): string {
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

export async function postKouseiBillingSend(
  month: string,
  rows: KouseiRow[],
  adminPin: string
): Promise<KouseiBillingRecord> {
  const res = await fetch(apiUrl("/api/kousei-billing"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ month, rows, adminPin }),
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
    amounts: Record<string, number>;
    approve?: boolean;
    pin: string;
  }
): Promise<KouseiBillingRecord> {
  const res = await fetch(
    apiUrl(`/api/kousei-billing/${encodeURIComponent(id)}`),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amounts: body.amounts,
        approve: body.approve === true,
        pin: body.pin,
      }),
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
