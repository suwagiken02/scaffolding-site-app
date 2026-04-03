import type { WorkKind } from "../types/workKind";
import type { SiteWorkRecordPunchApi } from "../hooks/useSiteWorkRecordPunch";
import styles from "./SiteJoyoWorkSection.module.css";

type Props = {
  punch: SiteWorkRecordPunchApi;
  workKind: WorkKind;
  dateKey: string;
  embedded?: boolean;
  /** false のときは親が punch.confirmModal を描画（アコーディオン閉時もモーダルを出すため） */
  renderConfirmModal?: boolean;
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

export function SiteWorkRecordPunchBlockBody({
  punch,
  workKind,
  dateKey,
  embedded,
  renderConfirmModal = true,
}: Props) {
  const {
    labor,
    startIso,
    endIso,
    canStart,
    canEnd,
    startLabel,
    endLabel,
    needsLaborConfirm,
    requestStart,
    requestEnd,
    openLaborHelp,
    confirmModal,
  } = punch;

  const sectionClass = embedded
    ? `${styles.section} ${styles.sectionEmbedded}`
    : styles.section;

  if (!labor) {
    return (
      <section
        className={sectionClass}
        aria-labelledby={`work-punch-heading-${dateKey}-${workKind}`}
      >
        <div className={styles.sectionHead}>
          <h3
            id={`work-punch-heading-${dateKey}-${workKind}`}
            className={styles.sectionTitle}
          >
            作業の打刻
          </h3>
          <p className={styles.empty}>
            この日の作業記録がありません。「作業内容を登録する」から登録してください。
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      className={sectionClass}
      aria-labelledby={`work-punch-heading-${dateKey}-${workKind}`}
    >
      {renderConfirmModal ? confirmModal : null}

      <div className={styles.sectionHead}>
        <h3
          id={`work-punch-heading-${dateKey}-${workKind}`}
          className={styles.sectionTitle}
        >
          作業の打刻
        </h3>
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
          className={`${styles.btnStart}${canStart ? ` ${styles.btnStartPulse}` : ""}${startIso ? ` ${styles.btnMuted}` : ""}`}
          disabled={!canStart}
          onClick={requestStart}
        >
          {startLabel}
        </button>
        <button
          type="button"
          className={`${styles.btnEnd}${canEnd ? ` ${styles.btnEndPulse}` : ""}${endIso ? ` ${styles.btnMuted}` : ""}`}
          disabled={!canEnd}
          onClick={requestEnd}
        >
          {endLabel}
        </button>
      </div>

      {needsLaborConfirm && (
        <p className={styles.lead}>
          <button
            type="button"
            className={styles.btnEnd}
            onClick={openLaborHelp}
          >
            手伝い班・最終人工の確定を続ける
          </button>
        </p>
      )}
    </section>
  );
}
