import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import type { Site } from "../types/site";
import type { WorkKind } from "../types/workKind";
import { WORK_KINDS } from "../types/workKind";
import type { SiteDailyLaborRecord } from "../types/siteDailyLabor";
import { type SitePhoto, sitePhotoDisplaySrc } from "../types/sitePhoto";
import {
  loadPhotosForSiteWorkDate,
  mainMemberWorkTimesFromPhotos,
  savePhotosForSiteWorkDate,
  listPhotoDateKeysForSiteWork,
} from "../lib/sitePhotoStorage";
import {
  loadDailyLaborMap,
  listDateKeysForSiteWork,
  removeDailyLaborRecord,
} from "../lib/siteDailyLaborStorage";
import {
  FOCUS_SITE_WORK_RECORD,
  siteWorkRecordElementId,
} from "../lib/siteWorkRecordFocus";
import { laborIsContractor } from "../lib/siteDailyLaborEmployment";
import { getWorkEndIso, getWorkStartIso } from "../lib/workSessionTimes";
import { PhotoCategoryBadge } from "./PhotoCategoryBadge";
import { PhotoLightboxModal } from "./PhotoLightboxModal";
import type { LaborModalCtx } from "../hooks/useSiteWorkRecordPunch";
import { useSiteWorkRecordPunch } from "../hooks/useSiteWorkRecordPunch";
import { SiteWorkRecordPunchBlockBody } from "./SiteWorkRecordPunchBlockBody";
import { SiteWorkPhotoAddButton } from "./SiteWorkPhotoAddButton";
import photoStyles from "./SitePhotosSection.module.css";
import accStyles from "./SiteWorkDateAccordions.module.css";
import joyoStyles from "./SiteJoyoWorkSection.module.css";
import styles from "./SiteWorkRecordList.module.css";

type Filter = "all" | WorkKind;

type WorkRecordRow = {
  workKind: WorkKind;
  dateKey: string;
};

type Props = {
  siteId: string;
  site: Site;
  /** 通知・表示用の現場名 */
  siteName: string;
  revision: number;
  onInvalidate: () => void;
  onLaborModalNeeded: (ctx: LaborModalCtx) => void;
  onAfterWorkStartPunch?: () => void;
};

function formatDateKeySlash(dateKey: string): string {
  const [y, m, d] = dateKey.split("-");
  if (!y || !m || !d) return dateKey;
  return `${y}/${m}/${d}`;
}

function formatManDay(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${(Math.round(n * 10) / 10).toFixed(1)}`;
}

function formatVehicleCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  return `${n}台`;
}

function formatContractorPeopleCount(
  n: number | null | undefined
): string {
  if (n === null || n === undefined || !Number.isFinite(n) || n <= 0) {
    return "—";
  }
  return `${n}名`;
}

function joinList(items: string[]): string {
  if (items.length === 0) return "—";
  return items.join("、");
}

/** アコーディオンヘッダー用：作業員名（請負会社名） */
function headerWorkerLabel(
  labor: SiteDailyLaborRecord | undefined,
  site: Site
): string {
  if (!labor) return "—";
  const recordMemberNames = [
    ...labor.memberForemanNames,
    ...labor.memberKogataNames,
  ]
    .map((n) => n.trim())
    .filter((n) => n.length > 0);
  const fallbackMemberNames = [site.foremanName, ...site.kogataNames]
    .map((n) => n.trim())
    .filter((n) => n.length > 0);
  const names = joinList(
    recordMemberNames.length > 0 ? recordMemberNames : fallbackMemberNames
  );
  const co = (labor.contractorCompanyName ?? "").trim();
  if (laborIsContractor(labor) && co) {
    if (names === "—") return `（${co}）`;
    return `${names}（${co}）`;
  }
  return names;
}

function stopAccordionToggle(e: MouseEvent) {
  e.stopPropagation();
}

function formatUploadedAt(iso: string): string {
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

function formatIsoMaybe(iso: string | null): string {
  if (!iso) return "—";
  return formatUploadedAt(iso);
}

function mainMemberTimesForWorkRecord(
  _workKind: WorkKind,
  photos: SitePhoto[],
  labor: SiteDailyLaborRecord | undefined
): { entryIso: string | null; endIso: string | null } {
  if (labor) {
    const ws = getWorkStartIso(labor);
    const we = getWorkEndIso(labor);
    if (ws || we) {
      return { entryIso: ws, endIso: we };
    }
  }
  return mainMemberWorkTimesFromPhotos(photos);
}

type SiteWorkRecordListRowProps = {
  siteId: string;
  site: Site;
  siteName: string;
  workKind: WorkKind;
  dateKey: string;
  revision: number;
  isOpen: boolean;
  onToggleDate: () => void;
  onInvalidate: () => void;
  onLaborModalNeeded: (ctx: LaborModalCtx) => void;
  onAfterWorkStartPunch?: () => void;
  onRequestDeleteWork: () => void;
  onPhotoLightbox: (photos: SitePhoto[], index: number) => void;
  removePhoto: (workKind: WorkKind, dateKey: string, photoId: string) => void;
  onLaborDeleteRequest: (workKind: WorkKind, record: SiteDailyLaborRecord) => void;
};

function SiteWorkRecordListRow({
  siteId,
  site,
  siteName,
  workKind,
  dateKey,
  revision,
  isOpen,
  onToggleDate,
  onInvalidate,
  onLaborModalNeeded,
  onAfterWorkStartPunch,
  onRequestDeleteWork,
  onPhotoLightbox,
  removePhoto,
  onLaborDeleteRequest,
}: SiteWorkRecordListRowProps) {
  const punch = useSiteWorkRecordPunch({
    siteId,
    siteName,
    workKind,
    dateKey,
    revision,
    onStorageChange: onInvalidate,
    onLaborModalNeeded,
    onAfterWorkStartPunch,
  });

  const labor = loadDailyLaborMap(siteId, workKind)[dateKey];
  const photos = loadPhotosForSiteWorkDate(siteId, workKind, dateKey);
  const { entryIso: mainEntryIso, endIso: mainEndIso } =
    mainMemberTimesForWorkRecord(workKind, photos, labor);
  const manLabel = labor ? formatManDay(labor.finalManDays) : "—";
  const contractorCompanyTrim = (labor?.contractorCompanyName ?? "").trim();
  const workerHeader = headerWorkerLabel(labor, site);

  return (
    <li
      id={siteWorkRecordElementId(dateKey, workKind)}
      className={accStyles.accItem}
    >
      {punch.confirmModal}

      <div className={styles.rowHeader}>
        <button
          type="button"
          className={`${accStyles.accHeader} ${styles.rowHeaderToggle}`}
          aria-expanded={isOpen}
          onClick={onToggleDate}
        >
          <span className={styles.accHeaderRow}>
            <span
              className={`${styles.accHeaderCell} ${styles.accHeaderCellDate}`}
              title={formatDateKeySlash(dateKey)}
            >
              {formatDateKeySlash(dateKey)}
            </span>
            <span className={styles.accHeaderSep} aria-hidden>
              ／
            </span>
            <span
              className={`${styles.accHeaderCell} ${styles.accHeaderCellKind}`}
              title={workKind}
            >
              {workKind}
            </span>
            <span className={styles.accHeaderSep} aria-hidden>
              ／
            </span>
            <span
              className={`${styles.accHeaderCell} ${styles.accHeaderCellWorker}`}
              title={workerHeader}
            >
              {workerHeader}
            </span>
            <span className={styles.accHeaderSep} aria-hidden>
              ／
            </span>
            <span
              className={`${styles.accHeaderCell} ${styles.accHeaderCellMan}`}
              title={manLabel}
            >
              {manLabel}
            </span>
          </span>
          <span className={accStyles.accChevron} aria-hidden>
            {isOpen ? "▼" : "▶"}
          </span>
        </button>

        <div
          className={styles.headerPunchCluster}
          onClick={stopAccordionToggle}
          onPointerDown={stopAccordionToggle}
        >
          <button
            type="button"
            className={`${joyoStyles.btnStart}${punch.canStart ? ` ${joyoStyles.btnStartPulse}` : ""}${punch.startIso ? ` ${joyoStyles.btnMuted}` : ""} ${styles.headerPunchBtn}`}
            disabled={!punch.canStart}
            onClick={(e) => {
              stopAccordionToggle(e);
              punch.requestStart();
            }}
          >
            {punch.startLabel}
          </button>
          <button
            type="button"
            className={`${joyoStyles.btnEnd}${punch.canEnd ? ` ${joyoStyles.btnEndPulse}` : ""}${punch.endIso ? ` ${joyoStyles.btnMuted}` : ""} ${styles.headerPunchBtn}`}
            disabled={!punch.canEnd}
            onClick={(e) => {
              stopAccordionToggle(e);
              punch.requestEnd();
            }}
          >
            {punch.endLabel}
          </button>
        </div>

        <button
          type="button"
          className={styles.rowDeleteBtn}
          onClick={onRequestDeleteWork}
          aria-label="作業記録を削除"
        >
          削除
        </button>
      </div>

      {isOpen && (
        <div className={accStyles.accPanel}>
          <section className={accStyles.block} aria-label="人工データ">
            <h3 className={accStyles.blockTitle}>人工・手伝い班</h3>
            {labor ? (
              <>
                <dl className={accStyles.laborDl}>
                  {laborIsContractor(labor) ? (
                    <>
                      <div className={accStyles.laborRow}>
                        <dt>請負会社名</dt>
                        <dd>{contractorCompanyTrim || "—"}</dd>
                      </div>
                      <div className={accStyles.laborRow}>
                        <dt>人数</dt>
                        <dd>
                          {formatContractorPeopleCount(
                            labor.contractorPeopleCount
                          )}
                        </dd>
                      </div>
                      <div className={accStyles.laborRow}>
                        <dt>車両台数</dt>
                        <dd>
                          {formatVehicleCount(labor.vehicleCount)}
                        </dd>
                      </div>
                      <div className={accStyles.laborRow}>
                        <dt>作業開始</dt>
                        <dd>{formatIsoMaybe(mainEntryIso)}</dd>
                      </div>
                      <div className={accStyles.laborRow}>
                        <dt>作業終了</dt>
                        <dd>{formatIsoMaybe(mainEndIso)}</dd>
                      </div>
                      <div className={accStyles.laborRow}>
                        <dt>最終人工</dt>
                        <dd>
                          {formatManDay(labor.finalManDays)}人工
                        </dd>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className={accStyles.laborRow}>
                        <dt>メインメンバー（職長・子方）</dt>
                        <dd>
                          {joinList([
                            ...labor.memberForemanNames,
                            ...labor.memberKogataNames,
                          ])}
                        </dd>
                      </div>
                      <div className={accStyles.laborRow}>
                        <dt>メインメンバー作業開始</dt>
                        <dd>{formatIsoMaybe(mainEntryIso)}</dd>
                      </div>
                      <div className={accStyles.laborRow}>
                        <dt>メインメンバー作業終了</dt>
                        <dd>{formatIsoMaybe(mainEndIso)}</dd>
                      </div>
                      <div className={accStyles.laborRow}>
                        <dt>最終人工</dt>
                        <dd>
                          {formatManDay(labor.finalManDays)}人工
                        </dd>
                      </div>
                      {(labor.workManDaysPerPerson ??
                        labor.joyoManDaysPerPerson) != null && (
                        <div className={accStyles.laborRow}>
                          <dt>1人あたり人工（セッション）</dt>
                          <dd>
                            {formatManDay(
                              labor.workManDaysPerPerson ??
                                labor.joyoManDaysPerPerson
                            )}
                            人工
                          </dd>
                        </div>
                      )}
                      <div className={accStyles.laborRow}>
                        <dt>手伝い班</dt>
                        <dd>{labor.hadHelpTeam ? "あり" : "なし"}</dd>
                      </div>
                      <div className={accStyles.laborRow}>
                        <dt>手伝いメンバー</dt>
                        <dd>
                          {labor.hadHelpTeam &&
                          labor.helpMemberNames.length > 0
                            ? joinList(labor.helpMemberNames)
                            : "—"}
                        </dd>
                      </div>
                      <div className={accStyles.laborRow}>
                        <dt>手伝い開始</dt>
                        <dd>{labor.helpStartTime ?? "—"}</dd>
                      </div>
                      <div className={accStyles.laborRow}>
                        <dt>手伝い終了</dt>
                        <dd>{labor.helpEndTime ?? "—"}</dd>
                      </div>
                    </>
                  )}
                </dl>
                <button
                  type="button"
                  className={accStyles.laborDeleteBtn}
                  onClick={() => onLaborDeleteRequest(workKind, labor)}
                >
                  この日の人工データを削除
                </button>
              </>
            ) : (
              <p className={accStyles.muted}>
                未登録です。作業終了の打刻後、手伝い班・最終人工の確認を完了すると表示されます。
              </p>
            )}
          </section>

          <SiteWorkRecordPunchBlockBody
            punch={punch}
            workKind={workKind}
            dateKey={dateKey}
            embedded
            renderConfirmModal={false}
          />

          <section className={accStyles.block} aria-label="写真一覧">
            <h3 className={accStyles.blockTitle}>写真</h3>
            <SiteWorkPhotoAddButton
              siteId={siteId}
              site={site}
              workKind={workKind}
              dateKey={dateKey}
              onStorageChange={onInvalidate}
            />
            {photos.length === 0 ? (
              <p className={accStyles.muted}>この日の写真はありません。</p>
            ) : (
              <ul className={photoStyles.photoGrid}>
                {photos.map((p: SitePhoto, pi: number) => (
                  <li key={p.id} className={photoStyles.photoCard}>
                    <button
                      type="button"
                      className={photoStyles.thumbOpenBtn}
                      onClick={() => onPhotoLightbox(photos, pi)}
                      aria-label="写真を拡大表示"
                    >
                      <div className={photoStyles.thumbWrap}>
                        <div className={photoStyles.badgeOverlay}>
                          <PhotoCategoryBadge category={p.category} />
                        </div>
                        <img
                          src={sitePhotoDisplaySrc(p)}
                          alt={p.fileName}
                          className={photoStyles.thumb}
                          loading="lazy"
                        />
                      </div>
                    </button>
                    <div className={photoStyles.caption}>
                      <time
                        className={photoStyles.time}
                        dateTime={p.uploadedAt}
                      >
                        {formatUploadedAt(p.uploadedAt)}
                      </time>
                      <button
                        type="button"
                        className={photoStyles.deleteBtn}
                        onClick={() => removePhoto(workKind, dateKey, p.id)}
                      >
                        削除
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </li>
  );
}

export function SiteWorkRecordList({
  siteId,
  site,
  siteName,
  revision,
  onInvalidate,
  onLaborModalNeeded,
  onAfterWorkStartPunch,
}: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [laborConfirm, setLaborConfirm] = useState<{
    workKind: WorkKind;
    record: SiteDailyLaborRecord;
  } | null>(null);
  const [workConfirm, setWorkConfirm] = useState<{
    workKind: WorkKind;
    dateKey: string;
  } | null>(null);
  const [photoLightbox, setPhotoLightbox] = useState<{
    photos: SitePhoto[];
    index: number;
  } | null>(null);

  const rows = useMemo<WorkRecordRow[]>(() => {
    const out: WorkRecordRow[] = [];
    for (const w of WORK_KINDS) {
      const pk = listPhotoDateKeysForSiteWork(siteId, w);
      const dks = listDateKeysForSiteWork(siteId, w, pk);
      for (const dk of dks) out.push({ workKind: w, dateKey: dk });
    }
    // 新しい日付が上（同日なら 作業種別の順）
    const wOrder = (w: WorkKind) => WORK_KINDS.indexOf(w);
    return out.sort((a, b) => {
      const d = b.dateKey.localeCompare(a.dateKey);
      if (d !== 0) return d;
      return wOrder(a.workKind) - wOrder(b.workKind);
    });
  }, [siteId, revision]);

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter((r) => r.workKind === filter);
  }, [rows, filter]);

  useEffect(() => {
    function onFocusSiteWorkRecord(e: Event) {
      const d = (
        e as CustomEvent<{
          siteId?: string;
          dateKey?: string;
          workKind?: WorkKind;
        }>
      ).detail;
      if (!d?.siteId || d.siteId !== siteId || !d.dateKey || !d.workKind) {
        return;
      }
      setFilter("all");
      setExpanded((prev) => new Set([...prev, d.dateKey!]));
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          document
            .getElementById(siteWorkRecordElementId(d.dateKey!, d.workKind!))
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });
    }
    window.addEventListener(FOCUS_SITE_WORK_RECORD, onFocusSiteWorkRecord);
    return () =>
      window.removeEventListener(FOCUS_SITE_WORK_RECORD, onFocusSiteWorkRecord);
  }, [siteId]);

  const toggle = useCallback((key: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }, []);

  function rowKey(w: WorkKind, dk: string) {
    return `${dk}__${w}`;
  }

  function removePhoto(workKind: WorkKind, dateKey: string, photoId: string) {
    const current = loadPhotosForSiteWorkDate(siteId, workKind, dateKey);
    const next = current.filter((p) => p.id !== photoId);
    savePhotosForSiteWorkDate(siteId, workKind, dateKey, next);
    onInvalidate();
  }

  return (
    <section className={styles.section} aria-label="作業記録一覧">
      <div className={styles.head}>
        <h2 className={styles.title}>作業記録一覧</h2>
        <div className={styles.filters} role="tablist" aria-label="作業種別フィルター">
          <button
            type="button"
            role="tab"
            aria-selected={filter === "all"}
            className={filter === "all" ? styles.filterActive : styles.filter}
            onClick={() => setFilter("all")}
          >
            全て
          </button>
          {WORK_KINDS.map((w) => (
            <button
              key={w}
              type="button"
              role="tab"
              aria-selected={filter === w}
              className={filter === w ? styles.filterActive : styles.filter}
              onClick={() => setFilter(w)}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className={styles.empty}>作業記録はまだありません。</p>
      ) : (
        <ul className={accStyles.accList}>
          {filtered.map(({ workKind, dateKey }) => (
            <SiteWorkRecordListRow
              key={rowKey(workKind, dateKey)}
              siteId={siteId}
              site={site}
              siteName={siteName}
              workKind={workKind}
              dateKey={dateKey}
              revision={revision}
              isOpen={expanded.has(dateKey)}
              onToggleDate={() => toggle(dateKey)}
              onInvalidate={onInvalidate}
              onLaborModalNeeded={onLaborModalNeeded}
              onAfterWorkStartPunch={onAfterWorkStartPunch}
              onRequestDeleteWork={() =>
                setWorkConfirm({ workKind, dateKey })
              }
              onPhotoLightbox={(photos, index) =>
                setPhotoLightbox({ photos, index })
              }
              removePhoto={removePhoto}
              onLaborDeleteRequest={(wk, record) =>
                setLaborConfirm({ workKind: wk, record })
              }
            />
          ))}
        </ul>
      )}

      {laborConfirm && (
        <div
          className={accStyles.modalBackdrop}
          role="presentation"
          onClick={() => setLaborConfirm(null)}
        >
          <div
            className={accStyles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="labor-del-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="labor-del-title" className={accStyles.modalTitle}>
              記録の削除
            </h3>
            <p className={accStyles.modalText}>この日の記録を削除しますか？</p>
            <p className={accStyles.modalSub}>
              対象日: {formatDateKeySlash(laborConfirm.record.dateKey)} /{" "}
              {laborConfirm.workKind}
            </p>
            <div className={accStyles.modalActions}>
              <button
                type="button"
                className={accStyles.modalCancel}
                onClick={() => setLaborConfirm(null)}
              >
                キャンセル
              </button>
              <button
                type="button"
                className={accStyles.modalDanger}
                onClick={() => {
                  removeDailyLaborRecord(
                    siteId,
                    laborConfirm.workKind,
                    laborConfirm.record.dateKey
                  );
                  setLaborConfirm(null);
                  onInvalidate();
                }}
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}

      <PhotoLightboxModal
        open={photoLightbox !== null}
        photos={photoLightbox?.photos ?? []}
        initialIndex={photoLightbox?.index ?? 0}
        onClose={() => setPhotoLightbox(null)}
      />

      {workConfirm && (
        <div
          className={accStyles.modalBackdrop}
          role="presentation"
          onClick={() => setWorkConfirm(null)}
        >
          <div
            className={accStyles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="work-del-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="work-del-title" className={accStyles.modalTitle}>
              作業記録の削除
            </h3>
            <p className={accStyles.modalText}>この作業記録を削除しますか？</p>
            <p className={accStyles.modalSub}>
              対象日: {formatDateKeySlash(workConfirm.dateKey)} / {workConfirm.workKind}
            </p>
            <div className={accStyles.modalActions}>
              <button
                type="button"
                className={accStyles.modalCancel}
                onClick={() => setWorkConfirm(null)}
              >
                キャンセル
              </button>
              <button
                type="button"
                className={accStyles.modalDanger}
                onClick={() => {
                  // 写真・人工（手伝い班含む）をまとめて削除
                  savePhotosForSiteWorkDate(
                    siteId,
                    workConfirm.workKind,
                    workConfirm.dateKey,
                    []
                  );
                  removeDailyLaborRecord(
                    siteId,
                    workConfirm.workKind,
                    workConfirm.dateKey
                  );
                  setWorkConfirm(null);
                  onInvalidate();
                }}
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

