export type CompanyProfile = {
  companyName: string;
  /** data URL (image/png or image/jpeg) */
  logoDataUrl: string;
  /** 事務員の通知先メールアドレス */
  adminEmail: string;
  /** KOUSEI 専用ページのPIN */
  kouseiPin: string;
};

const KEY = "company-profile-v1";

const EMPTY: CompanyProfile = {
  companyName: "",
  logoDataUrl: "",
  adminEmail: "",
  kouseiPin: "",
};

export function loadCompanyProfile(): CompanyProfile {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const p = JSON.parse(raw) as Partial<CompanyProfile> | null;
    if (!p || typeof p !== "object") return EMPTY;
    return {
      companyName: typeof p.companyName === "string" ? p.companyName : "",
      logoDataUrl: typeof p.logoDataUrl === "string" ? p.logoDataUrl : "",
      adminEmail: typeof p.adminEmail === "string" ? p.adminEmail : "",
      kouseiPin: typeof p.kouseiPin === "string" ? p.kouseiPin : "",
    };
  } catch {
    return EMPTY;
  }
}

export function saveCompanyProfile(next: CompanyProfile): void {
  localStorage.setItem(
    KEY,
    JSON.stringify({
      companyName: next.companyName ?? "",
      logoDataUrl: next.logoDataUrl ?? "",
      adminEmail: next.adminEmail ?? "",
      kouseiPin: next.kouseiPin ?? "",
    })
  );
}

