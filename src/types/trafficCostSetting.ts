export type TrafficCostSetting = {
  id: string;
  /** 市区町村名（例：伊那市） */
  municipality: string;
  /** ガソリン代（円） */
  gasYen: number;
  /** ETC料金（円） */
  etcYen: number;
};

