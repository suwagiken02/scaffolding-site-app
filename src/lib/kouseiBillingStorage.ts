/** サーバー kousei-billing-v2.json と同一構造 */

export type KouseiBillingStatus = "sent" | "confirmed";

export type KouseiBillingRow = {
  siteId: string;
  siteName: string;
  clientName: string;
  workKind: string;
  dateKey: string;
  peopleCount: number;
  /** 契約金額（手動） */
  contractAmount: number | null;
  /** 請70%（契約×70%、null 時は自動） */
  amount70: number | null;
  /** 架金額60%（請70%×60%、null 時は自動） */
  amount60: number | null;
  /** 払金額40%（請70%×40%、null 時は自動） */
  amount40: number | null;
  /** 月支払額（手動のみ） */
  monthlyPayment: number | null;
  memo: string;
  checked: boolean;
};

/** 旧 `amount` フィールドのみの行を新形式へ */
export function migrateKouseiBillingRow(
  row: KouseiBillingRow & { amount?: number | null }
): KouseiBillingRow {
  const legacy = row.amount;
  const contractAmount =
    row.contractAmount !== null && row.contractAmount !== undefined
      ? row.contractAmount
      : legacy !== null && legacy !== undefined
        ? typeof legacy === "number"
          ? legacy
          : Number(legacy)
        : null;
  const ca =
    contractAmount !== null && Number.isFinite(Number(contractAmount))
      ? Math.round(Number(contractAmount))
      : null;
  return {
    siteId: row.siteId,
    siteName: row.siteName,
    clientName: row.clientName,
    workKind: row.workKind,
    dateKey: row.dateKey,
    peopleCount: row.peopleCount,
    contractAmount: ca,
    amount70: row.amount70 ?? null,
    amount60: row.amount60 ?? null,
    amount40: row.amount40 ?? null,
    monthlyPayment: row.monthlyPayment ?? null,
    memo: typeof row.memo === "string" ? row.memo : "",
    checked: row.checked === true,
  };
}

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
  return data.records.map((rec) => ({
    ...rec,
    rows: rec.rows.map((r) => migrateKouseiBillingRow(r as KouseiBillingRow & { amount?: number | null })),
  }));
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
  const rec = data.record;
  return {
    ...rec,
    rows: rec.rows.map((r) =>
      migrateKouseiBillingRow(r as KouseiBillingRow & { amount?: number | null })
    ),
  };
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
  const rec = data.record;
  return {
    ...rec,
    rows: rec.rows.map((r) =>
      migrateKouseiBillingRow(r as KouseiBillingRow & { amount?: number | null })
    ),
  };
}
