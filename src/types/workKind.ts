export const WORK_KINDS = ["組み", "払い", "その他"] as const;

export type WorkKind = (typeof WORK_KINDS)[number];

export function isWorkKind(s: string): s is WorkKind {
  return (WORK_KINDS as readonly string[]).includes(s);
}
