import { useMemo } from "react";
import { getSiteLaborSummary } from "../lib/siteDailyLaborStorage";
import styles from "./LaborSummaryBar.module.css";

type Props = {
  siteId: string;
  /** 親でストレージ更新時にインクリメントして再計算 */
  revision: number;
};

function fmt(n: number): string {
  return (Math.round(n * 10) / 10).toFixed(1);
}

export function LaborSummaryBar({ siteId, revision }: Props) {
  const s = useMemo(
    () => getSiteLaborSummary(siteId),
    [siteId, revision]
  );

  return (
    <div className={styles.wrap} aria-label="人工サマリー">
      <div className={styles.item}>
        <span className={styles.label}>架け人工</span>
        <span className={styles.value}>{fmt(s.kake)} 人工</span>
        <span className={styles.sub}>（組みの合計）</span>
      </div>
      <div className={styles.item}>
        <span className={styles.label}>払い人工</span>
        <span className={styles.value}>{fmt(s.harai)} 人工</span>
      </div>
      <div className={styles.item}>
        <span className={styles.label}>その他人工</span>
        <span className={styles.value}>{fmt(s.sonota)} 人工</span>
      </div>
      <div className={`${styles.item} ${styles.total}`}>
        <span className={styles.label}>総人工</span>
        <span className={styles.value}>{fmt(s.total)} 人工</span>
      </div>
    </div>
  );
}
