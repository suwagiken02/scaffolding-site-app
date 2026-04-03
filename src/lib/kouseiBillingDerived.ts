import type { KouseiBillingRow } from "./kouseiBillingStorage";

export function roundYen(n: number): number {
  return Math.round(n);
}

/** 請70%: 手動値がなければ契約×70% */
export function effectiveAmount70(r: KouseiBillingRow): number | null {
  const c = r.contractAmount;
  if (c === null || !Number.isFinite(c)) return null;
  if (r.amount70 !== null && Number.isFinite(r.amount70)) return roundYen(r.amount70);
  return roundYen(c * 0.7);
}

/** 架金額60%: 手動値がなければ 請70%×60% */
export function effectiveAmount60(r: KouseiBillingRow): number | null {
  const e70 = effectiveAmount70(r);
  if (e70 === null) return null;
  if (r.amount60 !== null && Number.isFinite(r.amount60)) return roundYen(r.amount60);
  return roundYen(e70 * 0.6);
}

/** 払金額40%: 手動値がなければ 請70%×40% */
export function effectiveAmount40(r: KouseiBillingRow): number | null {
  const e70 = effectiveAmount70(r);
  if (e70 === null) return null;
  if (r.amount40 !== null && Number.isFinite(r.amount40)) return roundYen(r.amount40);
  return roundYen(e70 * 0.4);
}

export function formatYenOrDash(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${roundYen(n).toLocaleString()}円`;
}

export function parseOptionalYenInput(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? roundYen(n) : null;
}

/** 表示用: 手動値があればそれ、なければ自動計算をプレースホルダに */
export function yenFieldDisplay(
  stored: number | null,
  auto: number | null
): { value: string; placeholder: string } {
  if (stored !== null && Number.isFinite(stored)) {
    return { value: String(roundYen(stored)), placeholder: "" };
  }
  if (auto !== null && Number.isFinite(auto)) {
    return { value: "", placeholder: String(roundYen(auto)) };
  }
  return { value: "", placeholder: "" };
}
