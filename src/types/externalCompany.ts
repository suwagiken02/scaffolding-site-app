export type ExternalCompany = {
  id: string;
  /** 表示名 */
  companyName: string;
  /** URL 用（英数字のみ・小文字で保存） */
  companyKey: string;
  /** 4 桁 */
  pin: string;
};
