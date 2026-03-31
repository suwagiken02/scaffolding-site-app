export type AttendanceRecord = {
  /** YYYY-MM-DD */
  dateKey: string;
  /** 集合時間（HH:MM）。保存時は meetingTime（互換: scheduledTime） */
  meetingTime: string | null;
  /** 出勤打刻（ISO 8601）。保存時は inAt（互換: checkInTime） */
  inAt: string | null;
  /** ISO 8601 */
  outAt: string | null;
};

/** personName -> dateKey -> record */
export type AttendanceStore = Record<string, Record<string, AttendanceRecord>>;

