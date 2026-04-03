import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
} from "react";
import type { Site } from "../types/site";
import type { WorkKind } from "../types/workKind";
import type { SiteDailyLaborRecord } from "../types/siteDailyLabor";
import {
  type SitePhoto,
  sitePhotoDisplaySrc,
} from "../types/sitePhoto";
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
import { laborIsContractor } from "../lib/siteDailyLaborEmployment";
import { getWorkEndIso, getWorkStartIso } from "../lib/workSessionTimes";
import { PhotoCategoryBadge } from "./PhotoCategoryBadge";
import { PhotoLightboxModal } from "./PhotoLightboxModal";
import type { LaborModalCtx } from "../hooks/useSiteWorkRecordPunch";
import { useSiteWorkRecordPunch } from "../hooks/useSiteWorkRecordPunch";
import { SiteWorkRecordPunchBlockBody } from "./SiteWorkRecordPunchBlockBody";
import photoStyles from "./SitePhotosSection.module.css";
import joyoStyles from "./SiteJoyoWorkSection.module.css";
import styles from "./SiteWorkDateAccordions.module.css";

type Props = {
  siteId: string;
  site: Site;
  siteName: string;
  workKind: WorkKind;
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

function joinList(items: string[]): string {
  if (items.length === 0) return "—";
  return items.join("、");
}

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

type SiteWorkDateAccordionRowProps = {
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
  onPhotoLightbox: (photos: SitePhoto[], index: number) => void;
  removePhoto: (dateKey: string, photoId: string) => void;
  onLaborDeleteRequest: (record: SiteDailyLaborRecord) => void;
};

function SiteWorkDateAccordionRow({
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
  onPhotoLightbox,
  removePhoto,
  onLaborDeleteRequest,
}: SiteWorkDateAccordionRowProps) {
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
    <li className={styles.accItem}>
      {punch.confirmModal}

      <div className={styles.accTopRow}>
        <button
          type="button"
          className={styles.accHeader}
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
          <span className={styles.accChevron} aria-hidden>
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
      </div>

      {isOpen && (
        <div className={styles.accPanel}>
          <section className={styles.block} aria-label="人工データ">
            <h3 className={styles.blockTitle}>人工・手伝い班</h3>
            {labor ? (
              <>
                <dl className={styles.laborDl}>
                  {laborIsContractor(labor) ? (
                    <>
                      <div className={styles.laborRow}>
                        <dt>請負会社名</dt>
                        <dd>{contractorCompanyTrim || "—"}</dd>
                      </div>
                      <div className={styles.laborRow}>
                        <dt>人数</dt>
                        <dd>
                          {formatContractorPeopleCount(
                            labor.contractorPeopleCount
                          )}
                        </dd>
                      </div>
                      <div className={styles.laborRow}>
                        <dt>車両台数</dt>
                        <dd>
                          {formatVehicleCount(labor.vehicleCount)}
                        </dd>
                      </div>
                      <div className={styles.laborRow}>
                        <dt>作業開始</dt>
                        <dd>{formatIsoMaybe(mainEntryIso)}</dd>
                      </div>
                      <div className={styles.laborRow}>
                        <dt>作業終了</dt>
                        <dd>{formatIsoMaybe(mainEndIso)}</dd>
                      </div>
                      <div className={styles.laborRow}>
                        <dt>最終人工</dt>
                        <dd>
                          {formatManDay(labor.finalManDays)}人工
                        </dd>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className={styles.laborRow}>
                        <dt>メインメンバー（職長・子方）</dt>
                        <dd>
                          {joinList([
                            ...labor.memberForemanNames,
                            ...labor.memberKogataNames,
                          ])}
                        </dd>
                      </div>
                      <div className={styles.laborRow}>
                        <dt>メインメンバー作業開始</dt>
                        <dd>{formatIsoMaybe(mainEntryIso)}</dd>
                      </div>
                      <div className={styles.laborRow}>
                        <dt>メインメンバー作業終了</dt>
                        <dd>{formatIsoMaybe(mainEndIso)}</dd>
                      </div>
                      <div className={styles.laborRow}>
                        <dt>最終人工</dt>
                        <dd>
                          {formatManDay(labor.finalManDays)}人工
                        </dd>
                      </div>
                      {(labor.workManDaysPerPerson ??
                        labor.joyoManDaysPerPerson) != null && (
                        <div className={styles.laborRow}>
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
                      <div className={styles.laborRow}>
                        <dt>手伝い班</dt>
                        <dd>{labor.hadHelpTeam ? "あり" : "なし"}</dd>
                      </div>
                      <div className={styles.laborRow}>
                        <dt>手伝いメンバー</dt>
                        <dd>
                          {labor.hadHelpTeam &&
                          labor.helpMemberNames.length > 0
                            ? joinList(labor.helpMemberNames)
                            : "—"}
                        </dd>
                      </div>
                      <div className={styles.laborRow}>
                        <dt>手伝い開始</dt>
                        <dd>{labor.helpStartTime ?? "—"}</dd>
                      </div>
                      <div className={styles.laborRow}>
                        <dt>手伝い終了</dt>
                        <dd>{labor.helpEndTime ?? "—"}</dd>
                      </div>
                    </>
                  )}
                </dl>
                <button
                  type="button"
                  className={styles.laborDeleteBtn}
                  onClick={() => onLaborDeleteRequest(labor)}
                >
                  この日の人工データを削除
                </button>
              </>
            ) : (
              <p className={styles.muted}>
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

          <section className={styles.block} aria-label="写真一覧">
            <h3 className={styles.blockTitle}>写真</h3>
            {photos.length === 0 ? (
              <p className={styles.muted}>この日の写真はありません。</p>
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
                        onClick={() => removePhoto(dateKey, p.id)}
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

export function SiteWorkDateAccordions({
  siteId,
  site,
  siteName,
  workKind,
  revision,
  onInvalidate,
  onLaborModalNeeded,
  onAfterWorkStartPunch,
}: Props) {
  const [expanded, setExpanded] = useState(() => new Set<string>());
  const [laborConfirm, setLaborConfirm] = useState<SiteDailyLaborRecord | null>(
    null
  );
  const [photoLightbox, setPhotoLightbox] = useState<{
    photos: SitePhoto[];
    index: number;
  } | null>(null);

  /** 作業種別タブ切り替え時はすべて閉じた状態から */
  useEffect(() => {
    setExpanded(new Set());
  }, [workKind]);

  const dateKeys = useMemo(() => {
    const pk = listPhotoDateKeysForSiteWork(siteId, workKind);
    return listDateKeysForSiteWork(siteId, workKind, pk);
  }, [siteId, workKind, revision]);

  const toggle = useCallback((dk: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(dk)) n.delete(dk);
      else n.add(dk);
      return n;
    });
  }, []);

  function removePhoto(dateKey: string, photoId: string) {
    const current = loadPhotosForSiteWorkDate(siteId, workKind, dateKey);
    const next = current.filter((p) => p.id !== photoId);
    savePhotosForSiteWorkDate(siteId, workKind, dateKey, next);
    onInvalidate();
  }

  if (dateKeys.length === 0) {
    return (
      <p className={styles.empty}>
        この作業種別ではまだ作業記録が登録されていません。
        「＋作業内容を登録する」から、本日分の記録を作成してください。
      </p>
    );
  }

  return (
    <div className={styles.root}>
      <h2 className={styles.sectionTitle}>日付別</h2>
      <ul className={styles.accList}>
        {dateKeys.map((dateKey) => (
          <SiteWorkDateAccordionRow
            key={dateKey}
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
            onPhotoLightbox={(photos, index) =>
              setPhotoLightbox({ photos, index })
            }
            removePhoto={removePhoto}
            onLaborDeleteRequest={(record) => setLaborConfirm(record)}
          />
        ))}
      </ul>

      <PhotoLightboxModal
        open={photoLightbox !== null}
        photos={photoLightbox?.photos ?? []}
        initialIndex={photoLightbox?.index ?? 0}
        onClose={() => setPhotoLightbox(null)}
      />

      {laborConfirm && (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onClick={() => setLaborConfirm(null)}
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="labor-del-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="labor-del-title" className={styles.modalTitle}>
              記録の削除
            </h3>
            <p className={styles.modalText}>この日の記録を削除しますか？</p>
            <p className={styles.modalSub}>
              対象日: {formatDateKeySlash(laborConfirm.dateKey)}
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalCancel}
                onClick={() => setLaborConfirm(null)}
              >
                キャンセル
              </button>
              <button
                type="button"
                className={styles.modalDanger}
                onClick={() => {
                  removeDailyLaborRecord(
                    siteId,
                    workKind,
                    laborConfirm.dateKey
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
    </div>
  );
}
