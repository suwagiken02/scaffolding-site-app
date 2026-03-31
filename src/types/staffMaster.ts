export type StaffRole = "職長" | "子方" | "その他";

export type StaffMaster = {
  id: string;
  /** 表示名 */
  name: string;
  /** 役割（複数可） */
  roles: StaffRole[];
  /** 打刻ページに表示するか */
  attendanceEnabled: boolean;
};

