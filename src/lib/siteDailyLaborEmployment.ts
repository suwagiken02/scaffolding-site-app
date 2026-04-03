import type { SiteDailyLaborRecord } from "../types/siteDailyLabor";

/** 請負として扱う（employmentKind または会社名で判定） */
export function laborIsContractor(labor: SiteDailyLaborRecord): boolean {
  if (labor.employmentKind === "請負") return true;
  return Boolean((labor.contractorCompanyName ?? "").trim());
}
