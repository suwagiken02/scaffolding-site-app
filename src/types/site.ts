export type CompanyKind = "自社" | "KOUSEI";

export type Site = {
  id: string;
  /** 1. 現場名 */
  name: string;
  /** 現場コード（任意） */
  siteCode?: string;
  /** 2. 元請け様（表示用の確定文字列） */
  clientName: string;
  /** 3. 住所（表示用。市町村までなど） */
  address: string;
  /** Google マップの共有URL（地図ピン用。未入力ならピンなし） */
  googleMapUrl: string;
  /** 4. 開始日 YYYY-MM-DD */
  startDate: string;
  /** 入場日（YYYY-MM-DD、複数可） */
  entranceDateKeys: string[];
  /** 5. 担当営業名 */
  salesName: string;
  /** 6. 職長名 */
  foremanName: string;
  /** 7. 子方名（複数） */
  kogataNames: string[];
  /** 8. 人員数 */
  workerCount: number;
  /** 9. 車両（表示用文字列の配列） */
  vehicleLabels: string[];
  /** 10. 現場種別 */
  siteTypeName: string;
  /** 11. 自社 or KOUSEI */
  companyKind: CompanyKind;
  createdAt: string;
  /** 足場撤去完了を記録した日時（ISO 8601）。未完了のときは未設定 */
  scaffoldingRemovalCompletedAt?: string;
  /** 一覧の「要確認」警告を表示しない（編集画面で設定） */
  ignoreSiteListWarning?: boolean;
};

/** 旧形式（移行用） */
export type LegacySiteV1 = {
  id: string;
  name: string;
  address: string;
  startDate: string;
  teamName: string;
  foremanName: string;
  workerCount: number;
  createdAt: string;
};
