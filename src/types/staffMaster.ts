/** スタッフの役割（1人1種類） */
export type StaffJobRole =
  | "職長"
  | "子方"
  | "内勤"
  | "協力業者"
  | "役員";

export const STAFF_JOB_ROLE_OPTIONS: StaffJobRole[] = [
  "職長",
  "子方",
  "内勤",
  "協力業者",
  "役員",
];

/** 打刻ページに表示するのは職長・子方・内勤のみ */
export function staffIsAttendanceEligible(role: StaffJobRole): boolean {
  return role === "職長" || role === "子方" || role === "内勤";
}

/** 有給1日あたりの労働時間（時間）。内勤のみ5時間、それ以外8時間 */
export function staffPaidLeaveHoursPerDay(role: StaffJobRole): number {
  return role === "内勤" ? 5 : 8;
}

/** 作業開始モーダル「職長」欄に出す */
export function staffMatchesForemanPicker(role: StaffJobRole): boolean {
  return role === "職長" || role === "協力業者" || role === "役員";
}

/** 作業開始モーダル「子方」欄に出す */
export function staffMatchesKogataPicker(role: StaffJobRole): boolean {
  return (
    role === "職長" ||
    role === "子方" ||
    role === "協力業者" ||
    role === "役員"
  );
}

/** 管理者向けプッシュ（休暇申請・外部現場登録等）の設定を出せる役割 */
export function staffCanReceiveAdminNotify(role: StaffJobRole): boolean {
  return role === "役員" || role === "内勤";
}

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
  /** 通知用メールアドレス（休暇申請の承認・否認など） */
  email: string;
  /** 役割（5種のいずれか1つ） */
  role: StaffJobRole;
  /** 役員・内勤のみ：管理者向けプッシュ通知を受け取る */
  isAdmin?: boolean;
  /** 管理者向け FCM（この端末で登録したトークン）。isAdmin 時のみ有効 */
  fcmToken?: string;
  /** 個人ページ用 4 桁 PIN（事務員がマスターで設定） */
  personalPin: string;
  /** 給与明細PDFの紐付け用 6 桁（数字のみ、事務員がマスターで設定） */
  personalCode: string;
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
