import { useMemo } from "react";
import type { SiteDailyLaborRecord } from "../types/siteDailyLabor";
import {
  loadDailyLaborMap,
  saveDailyLaborRecord,
} from "../lib/siteDailyLaborStorage";
import { joyoTotalManDaysFromRecord } from "../lib/manDayCalculations";
import styles from "./SiteJoyoWorkSection.module.css";

type Props = {
  siteId: string;
  /** ストレージ更新で再読込 */
  revision: number;
  /** 本日の日付キー（YYYY-MM-DD） */
  todayDateKey: string;
  onStorageChange?: () => void;
};

function formatAt(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat("ja-JP", {
      dateStyle: "short",
      timeStyle: "medium",
    }).format(d);
  } catch {
    return iso;
  }
}

export function SiteJoyoWorkSection({
  siteId,
  revision,
  todayDateKey,
  onStorageChange,
}: Props) {
  const labor = useMemo(
    () => loadDailyLaborMap(siteId, "常用作業")[todayDateKey],
    [siteId, todayDateKey, revision]
  );

  function persist(next: SiteDailyLaborRecord) {
    saveDailyLaborRecord(siteId, "常用作業", next);
    onStorageChange?.();
  }

  function onStart() {
    if (!labor) return;
    if (labor.joyoWorkStartIso) return;
    persist({
      ...labor,
      joyoWorkStartIso: new Date().toISOString(),
    });
  }

  function onEnd() {
    if (!labor?.joyoWorkStartIso || labor.joyoWorkEndIso) return;
    const endIso = new Date().toISOString();
    const { perPerson, total } = joyoTotalManDaysFromRecord(
      labor.joyoWorkStartIso,
      endIso,
      labor
    );
    persist({
      ...labor,
      joyoWorkEndIso: endIso,
      joyoManDaysPerPerson: perPerson,
      finalManDays: total,
    });
  }

  if (!labor) {
    return (
      <section
        className={styles.section}
        aria-labelledby="joyo-work-heading"
      >
        <div className={styles.sectionHead}>
          <h2 id="joyo-work-heading" className={styles.sectionTitle}>
            常用作業の打刻
          </h2>
          <p className={styles.empty}>
            常用作業の記録がありません。上部の「＋作業を開始する」から常用作業を登録してください。
          </p>
        </div>
      </section>
    );
  }

  const canStart = !labor.joyoWorkStartIso && !labor.joyoWorkEndIso;
  const canEnd = Boolean(labor.joyoWorkStartIso && !labor.joyoWorkEndIso);

  return (
    <section className={styles.section} aria-labelledby="joyo-work-heading">
      <div className={styles.sectionHead}>
        <h2 id="joyo-work-heading" className={styles.sectionTitle}>
          常用作業の打刻
        </h2>
        <p className={styles.lead}>
          写真の代わりに、作業の開始・終了時刻を打刻します。終了時に人工が自動計算されます。
        </p>
      </div>

      <div className={styles.times}>
        <dl>
          <dt>作業開始</dt>
          <dd>
            {labor.joyoWorkStartIso ? formatAt(labor.joyoWorkStartIso) : "—"}
          </dd>
        </dl>
        <dl>
          <dt>作業終了</dt>
          <dd>
            {labor.joyoWorkEndIso ? formatAt(labor.joyoWorkEndIso) : "—"}
          </dd>
        </dl>
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.btnStart}
          disabled={!canStart}
          onClick={onStart}
        >
          作業を開始する
        </button>
        <button
          type="button"
          className={styles.btnEnd}
          disabled={!canEnd}
          onClick={onEnd}
        >
          作業を終了する
        </button>
      </div>

    </section>
  );
}
