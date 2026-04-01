export type PayslipRecord = {
  id: string;
  staffId: string;
  staffName: string;
  personalCode: string;
  fileName: string;
  dateKeyYyyymmdd: string;
  yearMonth: string;
  url: string;
  r2Key: string;
  uploadedAt: string;
};

export type PayslipUploadResultItem = {
  originalName: string;
  ok: boolean;
  error?: string;
  url?: string;
  id?: string;
};
