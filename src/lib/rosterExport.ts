import * as XLSX from "xlsx";
import { ageFromBirthDate } from "./ageFromBirthDate";
import type { StaffEmergencyContact, StaffMaster } from "../types/staffMaster";

export function formatDateJpYmd(dateKey: string): string {
  const t = dateKey.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return t || "—";
  const [y, m, d] = t.split("-").map(Number);
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "long" }).format(
    new Date(y, m - 1, d)
  );
}

export function formatTodayJa(d: Date): string {
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "long" }).format(d);
}

export function bookLabel(on: boolean): string {
  return on ? "有" : "無";
}

export function emergencyText(e: StaffEmergencyContact): string {
  const parts = [e.name, e.relationship, e.phone].filter((x) => x.trim());
  return parts.length ? parts.join(" / ") : "—";
}

export function qualificationsText(q: string[]): string {
  if (!q.length) return "—";
  return q.filter((x) => x.trim()).join("、");
}

export type RosterRow = {
  name: string;
  birth: string;
  age: string;
  address: string;
  jobType: string;
  position: string;
  hireDate: string;
  health: string;
  pension: string;
  employment: string;
  kentai: string;
  chutai: string;
  qualifications: string;
  emergency: string;
};

export function rosterRowFromStaff(s: StaffMaster): RosterRow {
  const age = s.birthDate.trim() ? ageFromBirthDate(s.birthDate) : null;
  return {
    name: s.name.trim() || "—",
    birth: s.birthDate.trim() ? formatDateJpYmd(s.birthDate) : "—",
    age: age !== null ? String(age) : "—",
    address: s.address.trim() || "—",
    jobType: s.jobType.trim() || "—",
    position: s.position.trim() || "—",
    hireDate: s.hireDate.trim() ? formatDateJpYmd(s.hireDate) : "—",
    health: s.insurance.health.trim() || "—",
    pension: s.insurance.pension.trim() || "—",
    employment: s.insurance.employment.trim() || "—",
    kentai: bookLabel(s.kentaiBook),
    chutai: bookLabel(s.chutaiBook),
    qualifications: qualificationsText(s.qualifications),
    emergency: emergencyText(s.emergencyContact),
  };
}

const HEADERS = [
  "氏名",
  "生年月日",
  "年齢",
  "住所",
  "職種",
  "役職",
  "雇入年月日",
  "健康保険",
  "年金保険",
  "雇用保険",
  "建退共手帳",
  "中退共手帳",
  "資格・免許",
  "緊急連絡先",
] as const;

export function downloadRosterXlsx(
  staff: StaffMaster[],
  companyName: string,
  createdAt: Date
): void {
  const ymd = `${createdAt.getFullYear()}${String(createdAt.getMonth() + 1).padStart(2, "0")}${String(createdAt.getDate()).padStart(2, "0")}`;
  const todayLabel = formatTodayJa(createdAt);
  const cn = companyName.trim() || "—";

  const titleRow = ["作業員名簿（全建統一様式第5号）"];
  const metaRow = [`作成日: ${todayLabel}　　自社名: ${cn}`];
  const blank: string[] = [];
  const headerRow = [...HEADERS];

  const dataRows = staff.map((s) => {
    const r = rosterRowFromStaff(s);
    return [
      r.name,
      r.birth,
      r.age,
      r.address,
      r.jobType,
      r.position,
      r.hireDate,
      r.health,
      r.pension,
      r.employment,
      r.kentai,
      r.chutai,
      r.qualifications,
      r.emergency,
    ];
  });

  const aoa = [titleRow, metaRow, blank, headerRow, ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 13 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 13 } },
  ];
  ws["!cols"] = HEADERS.map(() => ({ wch: 14 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "作業員名簿");
  XLSX.writeFile(wb, `作業員名簿_${ymd}.xlsx`);
}
