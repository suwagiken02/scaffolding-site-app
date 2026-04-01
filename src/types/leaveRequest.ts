export type LeaveRequestKind = "paid" | "birthday";

export type LeaveRequestStatus = "pending" | "approved" | "rejected";

export type LeaveRequest = {
  id: string;
  staffId: string;
  staffName: string;
  kind: LeaveRequestKind;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: LeaveRequestStatus;
  createdAt: string;
  decidedAt: string | null;
};
