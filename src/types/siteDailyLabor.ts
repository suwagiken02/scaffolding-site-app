/** 日付（YYYY-MM-DD）単位で現場に紐づく人工・手伝い班情報 */
export type SiteDailyLaborRecord = {
  /** 作業記録の作成日時（ISO 8601） */
  createdAt: string;
  dateKey: string;
  /** 最終人工（終了時写真の確認後に確定。開始直後は null） */
  finalManDays: number | null;

  /** 社員 or 請負 */
  employmentKind?: "社員" | "請負";
  /** 請負のときの会社名（社員のときは空文字のことがあります） */
  contractorCompanyName?: string;
  /** 請負のときの人数 */
  contractorPeopleCount?: number;

  /** 車両台数（作業開始時に入力） */
  vehicleCount: number;

  /** 参加メンバー（職長側） */
  memberForemanNames: string[];

  /** 参加メンバー（子方側） */
  memberKogataNames: string[];

  hadHelpTeam: boolean;
  helpMemberNames: string[];
  /** HH:mm（24時間表記）、手伝いなしのときは null */
  helpStartTime: string | null;
  helpEndTime: string | null;
};
