export type AttendanceRecord = {
  /** YYYY-MM-DD */
  dateKey: string;
  /** 集合時間（HH:MM） */
  meetingTime: string | null;
  /** ISO 8601 */
  inAt: string | null;
  /** ISO 8601 */
  outAt: string | null;
};

/** personName -> dateKey -> record */
export type AttendanceStore = Record<string, Record<string, AttendanceRecord>>;

