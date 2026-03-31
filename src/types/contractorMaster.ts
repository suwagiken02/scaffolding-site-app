export type ContractorMaster = {
  id: string;
  name: string;
  /** 閲覧用PIN（例: 4桁） */
  viewPin: string;
  /** 請負会社への通知先メール */
  email: string;
};

