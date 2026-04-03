import { useEffect, useMemo, useState } from "react";
import type { WorkKind } from "../types/workKind";
import type { SiteDailyLaborRecord } from "../types/siteDailyLabor";
import {
  loadDailyLaborMap,
  saveDailyLaborRecord,
} from "../lib/siteDailyLaborStorage";
import {
  workSessionTotalManDaysFromRecord,
} from "../lib/manDayCalculations";
import { getWorkEndIso, getWorkStartIso } from "../lib/workSessionTimes";
import { notifyWorkEndFcm, notifyWorkStartFcm } from "../lib/fcmNotifyApi";
import styles from "./SiteJoyoWorkSection.module.css";

type LaborModalCtx = {
  workKind: WorkKind;
  dateKey: string;
  entryIso: string | null;
  endIso: string;
};

type Props = {
  siteId: string;
  /** 通知文面用（マスターの現場名） */
  siteName: string;
  workKind: WorkKind;
  revision: number;
  todayDateKey: string;
  onStorageChange?: () => void;
  onLaborModalNeeded: (ctx: LaborModalCtx) => void;
  /** 作業開始打刻が保存された直後（注意モーダル用） */
  onAfterWorkStartPunch?: () => void;
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

function openLaborModalFromRecord(
  labor: SiteDailyLaborRecord,
  workKind: WorkKind,
  onLaborModalNeeded: (ctx: LaborModalCtx) => void
) {
  const start = getWorkStartIso(labor);
  const end = getWorkEndIso(labor);
  if (!end) return;
  onLaborModalNeeded({
    workKind,
    dateKey: labor.dateKey,
    entryIso: start,
    endIso: end,
  });
}

export function SiteWorkTimeSection({
  siteId,
  siteName,
  workKind,
  revision,
  todayDateKey,
  onStorageChange,
  onLaborModalNeeded,
  onAfterWorkStartPunch,
}: Props) {
  const [confirmKind, setConfirmKind] = useState<"start" | "end" | null>(null);

  const labor = useMemo(
    () => loadDailyLaborMap(siteId, workKind)[todayDateKey],
    [siteId, workKind, todayDateKey, revision]
  );

  function persist(next: SiteDailyLaborRecord) {
    saveDailyLaborRecord(siteId, workKind, next);
    onStorageChange?.();
  }

  function performStart() {
    if (!labor) return;
    if (getWorkStartIso(labor)) return;
    persist({
      ...labor,
      workStartIso: new Date().toISOString(),
      workEndIso: null,
      workManDaysPerPerson: null,
      finalManDays: null,
    });
    const nm = siteName.trim() || "現場";
    notifyWorkStartFcm(nm, workKind);
    onAfterWorkStartPunch?.();
  }

  function performEnd() {
    if (!labor) return;
    const start = getWorkStartIso(labor);
    if (!start || getWorkEndIso(labor)) return;
    const endIso = new Date().toISOString();
    const { perPerson } = workSessionTotalManDaysFromRecord(start, endIso, labor);
    persist({
      ...labor,
      workEndIso: endIso,
      workManDaysPerPerson: perPerson,
      finalManDays: null,
    });
    const nm = siteName.trim() || "現場";
    notifyWorkEndFcm(nm, workKind);
    openLaborModalFromRecord(
      { ...labor, workEndIso: endIso, workManDaysPerPerson: perPerson, dateKey: labor.dateKey },
      workKind,
      onLaborModalNeeded
    );
  }

  useEffect(() => {
    if (!confirmKind) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setConfirmKind(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmKind]);

  if (!labor) {
    return (
      <section className={styles.section} aria-labelledby="work-time-heading">
        <div className={styles.sectionHead}>
          <h2 id="work-time-heading" className={styles.sectionTitle}>
            作業の打刻（{workKind}）
          </h2>
          <p className={styles.empty}>
            本日の作業記録がありません。「＋作業内容を登録する」から登録してください。
          </p>
        </div>
      </section>
    );
  }

  const startIso = getWorkStartIso(labor);
  const endIso = getWorkEndIso(labor);
  const canStart = !startIso && !endIso;
  const canEnd = Boolean(startIso && !endIso);
  const needsLaborConfirm =
    Boolean(endIso) && labor.finalManDays === null;

  return (
    <section className={styles.section} aria-labelledby="work-time-heading">
      <div className={styles.sectionHead}>
        <h2 id="work-time-heading" className={styles.sectionTitle}>
          作業の打刻（{workKind}）
        </h2>
        <p className={styles.lead}>
          作業開始・終了を打刻します。終了後に手伝い班の有無と最終人工を確定します。
        </p>
      </div>

      <div className={styles.times}>
        <dl>
          <dt>作業開始</dt>
          <dd>{startIso ? formatAt(startIso) : "—"}</dd>
        </dl>
        <dl>
          <dt>作業終了</dt>
          <dd>{endIso ? formatAt(endIso) : "—"}</dd>
        </dl>
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={`${styles.btnStart}${canStart ? ` ${styles.btnStartPulse}` : ""}`}
          disabled={!canStart}
          onClick={() => setConfirmKind("start")}
        >
          作業を開始する
        </button>
        <button
          type="button"
          className={`${styles.btnEnd}${canEnd ? ` ${styles.btnEndPulse}` : ""}`}
          disabled={!canEnd}
          onClick={() => setConfirmKind("end")}
        >
          作業を終了する
        </button>
      </div>

      {confirmKind && (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onClick={() => setConfirmKind(null)}
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="work-punch-confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="work-punch-confirm-title" className={styles.modalTitle}>
              確認
            </h2>
            <p className={styles.modalBody}>
              {confirmKind === "start"
                ? "作業を開始します。よろしいですか？"
                : "作業を終了します。よろしいですか？"}
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalCancel}
                onClick={() => setConfirmKind(null)}
              >
                キャンセル
              </button>
              <button
                type="button"
                className={styles.modalConfirm}
                onClick={() => {
                  if (confirmKind === "start") performStart();
                  else performEnd();
                  setConfirmKind(null);
                }}
              >
                はい
              </button>
            </div>
          </div>
        </div>
      )}

      {needsLaborConfirm && (
        <p className={styles.lead}>
          <button
            type="button"
            className={styles.btnEnd}
            onClick={() => openLaborModalFromRecord(labor, workKind, onLaborModalNeeded)}
          >
            手伝い班・最終人工の確定を続ける
          </button>
        </p>
      )}
    </section>
  );
}
