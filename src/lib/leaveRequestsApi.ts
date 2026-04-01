import type { LeaveRequest, LeaveRequestKind } from "../types/leaveRequest";

function apiBase(): string {
  return (import.meta.env.VITE_EMAIL_API_URL ?? "").replace(/\/$/, "");
}

function apiUrl(path: string): string {
  const b = apiBase();
  return b ? `${b}${path}` : path;
}

export async function fetchLeaveRequests(): Promise<LeaveRequest[]> {
  const res = await fetch(apiUrl("/api/leave-requests"), { method: "GET" });
  const data = (await res.json()) as { ok?: boolean; list?: LeaveRequest[]; error?: string };
  if (!res.ok || !data.ok || !Array.isArray(data.list)) {
    throw new Error(data.error ?? "休暇申請の取得に失敗しました");
  }
  return data.list;
}

export async function createLeaveRequest(body: {
  staffId: string;
  staffName: string;
  kind: LeaveRequestKind;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
}): Promise<LeaveRequest> {
  const res = await fetch(apiUrl("/api/leave-requests"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { ok?: boolean; request?: LeaveRequest; error?: string };
  if (!res.ok || !data.ok || !data.request) {
    throw new Error(data.error ?? "休暇申請の送信に失敗しました");
  }
  return data.request;
}

export async function decideLeaveRequest(
  id: string,
  action: "approve" | "reject"
): Promise<LeaveRequest> {
  const res = await fetch(apiUrl(`/api/leave-requests/${encodeURIComponent(id)}/decide`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  const data = (await res.json()) as { ok?: boolean; request?: LeaveRequest; error?: string };
  if (!res.ok || !data.ok || !data.request) {
    throw new Error(data.error ?? "処理に失敗しました");
  }
  return data.request;
}
