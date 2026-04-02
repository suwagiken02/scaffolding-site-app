export type CompanyKind = "自社" | "KOUSEI";

/** 現場メモ（複数可） */
export type SiteMemo = {
  id: string;
  text: string;
};

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
  /** 開始日 YYYY-MM-DD（入場日があるときは最古の入場日と同期。保存時に自動設定） */
  startDate: string;
  /** 入場日（YYYY-MM-DD、複数可） */
  entranceDateKeys: string[];
  /** 5. 担当営業名 */
  salesName: string;
  /** 6. 職長名 */
  foremanName: string;
  /** 7. 子方名（複数） */
  kogataNames: string[];
  /** 車両（表示用文字列の配列） */
  vehicleLabels: string[];
  /** 現場種別 */
  siteTypeName: string;
  /** 自社 or KOUSEI */
  companyKind: CompanyKind;
  /** 現場メモ */
  siteMemos: SiteMemo[];
  createdAt: string;
  /** 足場撤去完了を記録した日時（ISO 8601）。未完了のときは未設定 */
  scaffoldingRemovalCompletedAt?: string;
  /** 一覧の「要確認」警告を表示しない（編集画面で設定） */
  ignoreSiteListWarning?: boolean;
  /** 外部会社登録で未確認のとき true（諏訪技建側で確認後に false） */
  externalUnconfirmed?: boolean;
  /** 外部登録元の URL キー（英数字・小文字想定） */
  externalCompanyKey?: string;
  /** 外部登録元の会社表示名 */
  externalCompanyName?: string;
  /** 一覧ステータスの手動上書き。未設定時は自動判定 */
  manualDisplayStatus?:
    | "入場前"
    | "組立中"
    | "設置中"
    | "解体中"
    | "撤去済";
  /** true のとき、マップの各タブに常にピン表示（GoogleマップURL必須） */
  alwaysShowOnMap?: boolean;
};

/** 旧形式（移行用） */
export type LegacySiteV1 = {
  id: string;
  name: string;
  address: string;
  startDate: string;
  teamName: string;
  foremanName: string;
  createdAt: string;
};
