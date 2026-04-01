export type StaffRole = "職長" | "子方" | "その他";

export type StaffPaidLeaveUsage = { dateKey: string; days: number };
export type StaffBirthdayLeaveUsage = { dateKey: string; days: number };

export type StaffEmergencyContact = {
  name: string;
  relationship: string;
  phone: string;
};

export type StaffInsuranceProfile = {
  health: string;
  pension: string;
  employment: string;
};

export type StaffMaster = {
  id: string;
  /** 表示名 */
  name: string;
  /** 役割（複数可） */
  roles: StaffRole[];
  /** 打刻ページに表示するか */
  attendanceEnabled: boolean;
  /** 個人ページ用 4 桁 PIN（事務員がマスターで設定） */
  personalPin: string;
  /** 生年月日 YYYY-MM-DD */
  birthDate: string;
  /** 現住所 */
  address: string;
  /** 職種 */
  jobType: string;
  /** 役職（職長・作業員など） */
  position: string;
  /** 雇入年月日 YYYY-MM-DD */
  hireDate: string;
  emergencyContact: StaffEmergencyContact;
  insurance: StaffInsuranceProfile;
  /** 建退共手帳 */
  kentaiBook: boolean;
  /** 中退共手帳 */
  chutaiBook: boolean;
  /** 資格・免許（複数） */
  qualifications: string[];
  /** 有給の使用記録 */
  paidLeaveUsages: StaffPaidLeaveUsage[];
  /** 誕生日休暇の使用記録 */
  birthdayLeaveUsages: StaffBirthdayLeaveUsage[];
};
