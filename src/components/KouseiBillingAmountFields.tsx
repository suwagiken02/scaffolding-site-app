import type { RefObject } from "react";
import type { KouseiBillingRow } from "../lib/kouseiBillingStorage";
import {
  effectiveAmount40,
  effectiveAmount60,
  effectiveAmount70,
  parseOptionalYenInput,
  yenFieldDisplay,
} from "../lib/kouseiBillingDerived";
import styles from "../pages/ContractorAdminPage.module.css";

export type KouseiAmountPatch = Partial<
  Pick<
    KouseiBillingRow,
    | "contractAmount"
    | "amount70"
    | "amount60"
    | "amount40"
    | "monthlyPayment"
  >
>;

export function KouseiBillingAmountFields({
  row,
  onPatch,
  contractInputRef,
  compact,
}: {
  row: KouseiBillingRow;
  onPatch: (p: KouseiAmountPatch) => void;
  contractInputRef?: RefObject<HTMLInputElement | null>;
  /** 1行に詰めて表示（請求確認テーブル用） */
  compact?: boolean;
}) {
  const e70 = effectiveAmount70(row);
  const e60 = effectiveAmount60(row);
  const e40 = effectiveAmount40(row);
  const d70 = yenFieldDisplay(row.amount70, e70);
  const d60 = yenFieldDisplay(row.amount60, e60);
  const d40 = yenFieldDisplay(row.amount40, e40);

  const gridClass = compact
    ? styles.kouseiBillingFormGridCompact
    : styles.kouseiBillingFormGrid;

  return (
    <div className={gridClass}>
      <label className={styles.field}>
        <span className={styles.label}>契約金額（円）</span>
        <span className={styles.kouseiBillingHint}>手動入力</span>
        <input
          ref={contractInputRef}
          className={styles.amountInput}
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          value={row.contractAmount === null ? "" : String(row.contractAmount)}
          onChange={(e) =>
            onPatch({ contractAmount: parseOptionalYenInput(e.target.value) })
          }
        />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>請70%（円）</span>
        <span className={styles.kouseiBillingHint}>契約×70%（空欄で自動）</span>
        <input
          className={styles.amountInput}
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          value={d70.value}
          placeholder={d70.placeholder}
          onChange={(e) =>
            onPatch({ amount70: parseOptionalYenInput(e.target.value) })
          }
        />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>架金額60%（円）</span>
        <span className={styles.kouseiBillingHint}>請70%×60%（空欄で自動）</span>
        <input
          className={styles.amountInput}
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          value={d60.value}
          placeholder={d60.placeholder}
          onChange={(e) =>
            onPatch({ amount60: parseOptionalYenInput(e.target.value) })
          }
        />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>払金額40%（円）</span>
        <span className={styles.kouseiBillingHint}>請70%×40%（空欄で自動）</span>
        <input
          className={styles.amountInput}
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          value={d40.value}
          placeholder={d40.placeholder}
          onChange={(e) =>
            onPatch({ amount40: parseOptionalYenInput(e.target.value) })
          }
        />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>月支払額（円）</span>
        <span className={styles.kouseiBillingHint}>手動入力のみ</span>
        <input
          className={styles.amountInput}
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          value={row.monthlyPayment === null ? "" : String(row.monthlyPayment)}
          onChange={(e) =>
            onPatch({ monthlyPayment: parseOptionalYenInput(e.target.value) })
          }
        />
      </label>
    </div>
  );
}
