import { useEffect, useMemo, useRef, useState } from "react";
import { ActionProgressContent } from "../components/ActionProgressButton";
import actionProgressStyles from "../components/ActionProgressButton.module.css";
import { useAsyncActionFeedback } from "./useAsyncActionFeedback";
import type { WorkKind } from "../types/workKind";
import type { SiteDailyLaborRecord } from "../types/siteDailyLabor";
import {
  loadDailyLaborMap,
  saveDailyLaborRecord,
} from "../lib/siteDailyLaborStorage";
import { workSessionTotalManDaysFromRecord } from "../lib/manDayCalculations";
import { getWorkEndIso, getWorkStartIso } from "../lib/workSessionTimes";
import { notifyWorkEndFcm, notifyWorkStartFcm } from "../lib/fcmNotifyApi";
import styles from "../components/SiteJoyoWorkSection.module.css";

export type LaborModalCtx = {
  workKind: WorkKind;
  dateKey: string;
  entryIso: string | null;
  endIso: string;
};

export type UseSiteWorkRecordPunchParams = {
  siteId: string;
  siteName: string;
  workKind: WorkKind;
  dateKey: string;
  revision: number;
  onStorageChange?: () => void;
  onLaborModalNeeded: (ctx: LaborModalCtx) => void;
  onAfterWorkStartPunch?: () => void;
};

export type SiteWorkRecordPunchApi = ReturnType<typeof useSiteWorkRecordPunch>;

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

export function useSiteWorkRecordPunch({
  siteId,
  siteName,
  workKind,
  dateKey,
  revision,
  onStorageChange,
  onLaborModalNeeded,
  onAfterWorkStartPunch,
}: UseSiteWorkRecordPunchParams) {
  const [confirmKind, setConfirmKind] = useState<"start" | "end" | null>(null);
  const { phase: confirmPhase, run: runConfirm, reset: resetConfirmPhase } =
    useAsyncActionFeedback({
      onAfterSuccessReset: () => setConfirmKind(null),
    });
  const prevConfirmOpenRef = useRef(false);

  const labor = useMemo(
    () => loadDailyLaborMap(siteId, workKind)[dateKey],
    [siteId, workKind, dateKey, revision]
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
      {
        ...labor,
        workEndIso: endIso,
        workManDaysPerPerson: perPerson,
        dateKey: labor.dateKey,
      },
      workKind,
      onLaborModalNeeded
    );
  }

  useEffect(() => {
    const open = confirmKind !== null;
    if (open && !prevConfirmOpenRef.current) {
      resetConfirmPhase();
    }
    prevConfirmOpenRef.current = open;
  }, [confirmKind, resetConfirmPhase]);

  useEffect(() => {
    if (!confirmKind) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && confirmPhase === "idle") setConfirmKind(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmKind, confirmPhase]);

  const startIso = labor ? getWorkStartIso(labor) : null;
  const endIso = labor ? getWorkEndIso(labor) : null;
  const canStart = Boolean(labor && !startIso && !endIso);
  const canEnd = Boolean(labor && startIso && !endIso);
  const needsLaborConfirm =
    Boolean(labor && endIso && labor.finalManDays === null);

  const startLabel = startIso ? "開始済み" : "作業を開始する";
  const endLabel = endIso ? "終了済み" : "作業を終了する";

  const confirmModal =
    confirmKind !== null ? (
      <div
        className={styles.modalBackdrop}
        role="presentation"
        onClick={() => {
          if (confirmPhase !== "idle") return;
          setConfirmKind(null);
        }}
      >
        <div
          className={styles.modal}
          role="dialog"
          aria-modal="true"
          aria-labelledby={`work-punch-confirm-${dateKey}-${workKind}`}
          onClick={(e) => e.stopPropagation()}
        >
          <h2
            id={`work-punch-confirm-${dateKey}-${workKind}`}
            className={styles.modalTitle}
          >
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
              disabled={confirmPhase !== "idle"}
              onClick={() => setConfirmKind(null)}
            >
              キャンセル
            </button>
            <button
              type="button"
              className={`${styles.modalConfirm} ${actionProgressStyles.host} ${confirmPhase === "success" ? actionProgressStyles.hostSuccess : ""}`}
              style={{
                pointerEvents: confirmPhase !== "idle" ? "none" : undefined,
              }}
              aria-busy={confirmPhase !== "idle"}
              aria-disabled={confirmPhase !== "idle"}
              onClick={() =>
                void runConfirm(async () => {
                  await new Promise<void>((r) => queueMicrotask(r));
                  if (confirmKind === "start") performStart();
                  else performEnd();
                })
              }
            >
              <span className={actionProgressStyles.content}>
                <ActionProgressContent
                  phase={confirmPhase}
                  idleLabel={
                    confirmKind === "start"
                      ? "作業を開始する"
                      : "作業を終了する"
                  }
                />
              </span>
            </button>
          </div>
        </div>
      </div>
    ) : null;

  return {
    labor,
    startIso,
    endIso,
    canStart,
    canEnd,
    startLabel,
    endLabel,
    needsLaborConfirm,
    requestStart: () => setConfirmKind("start"),
    requestEnd: () => setConfirmKind("end"),
    openLaborHelp: () => {
      if (labor) openLaborModalFromRecord(labor, workKind, onLaborModalNeeded);
    },
    confirmModal,
  };
}
