import type { PayslipRecord, PayslipUploadResultItem } from "../types/payslip";

function apiBase(): string {
  return (import.meta.env.VITE_EMAIL_API_URL ?? "").replace(/\/$/, "");
}

function apiUrl(path: string): string {
  const b = apiBase();
  return b ? `${b}${path}` : path;
}

export async function fetchPayslips(): Promise<PayslipRecord[]> {
  const res = await fetch(apiUrl("/api/payslips"), { method: "GET" });
  const data = (await res.json()) as { ok?: boolean; list?: PayslipRecord[]; error?: string };
  if (!res.ok || !data.ok || !Array.isArray(data.list)) {
    throw new Error(data.error ?? "給与明細一覧の取得に失敗しました");
  }
  return data.list;
}

export async function fetchPayslipsForStaff(staffId: string): Promise<PayslipRecord[]> {
  const res = await fetch(
    apiUrl(`/api/payslips/staff/${encodeURIComponent(staffId)}`),
    { method: "GET" }
  );
  const data = (await res.json()) as { ok?: boolean; list?: PayslipRecord[]; error?: string };
  if (!res.ok || !data.ok || !Array.isArray(data.list)) {
    throw new Error(data.error ?? "給与明細の取得に失敗しました");
  }
  return data.list;
}

export async function uploadPayslips(files: File[]): Promise<PayslipUploadResultItem[]> {
  const fd = new FormData();
  for (const f of files) {
    fd.append("files", f);
  }
  const res = await fetch(apiUrl("/api/payslips/upload"), {
    method: "POST",
    body: fd,
  });
  const data = (await res.json()) as {
    ok?: boolean;
    results?: PayslipUploadResultItem[];
    error?: string;
  };
  if (!res.ok || !data.ok || !Array.isArray(data.results)) {
    throw new Error(data.error ?? "アップロードに失敗しました");
  }
  return data.results;
}

export async function deletePayslip(id: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/payslips/${encodeURIComponent(id)}`), {
    method: "DELETE",
  });
  const data = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? "削除に失敗しました");
  }
}
