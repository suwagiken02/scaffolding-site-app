import { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  SiteWorkRecordPunchBlock,
  type LaborModalCtx,
} from "./SiteWorkRecordPunchBlock";
import photoStyles from "./SitePhotosSection.module.css";
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

  const laborByDate = useMemo(
    () => loadDailyLaborMap(siteId, workKind),
    [siteId, workKind, revision]
  );

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
        {dateKeys.map((dateKey) => {
          const isOpen = expanded.has(dateKey);
          const labor = laborByDate[dateKey];
          const photos = loadPhotosForSiteWorkDate(siteId, workKind, dateKey);
          const { entryIso: mainEntryIso, endIso: mainEndIso } =
            mainMemberTimesForWorkRecord(workKind, photos, labor);
          const manLabel = labor ? formatManDay(labor.finalManDays) : "—";

          const isContractor = labor ? laborIsContractor(labor) : false;
          const recordMemberNames =
            labor && (labor.memberForemanNames.length > 0 || labor.memberKogataNames.length > 0)
              ? [...labor.memberForemanNames, ...labor.memberKogataNames]
              : [];
          const fallbackMemberNames = [
            site.foremanName,
            ...site.kogataNames,
          ].map((n) => n.trim()).filter((n) => n.length > 0);
          const contractorCompanyTrim = (labor?.contractorCompanyName ?? "").trim();
          const headerMemberLabel = labor
            ? isContractor
              ? `${contractorCompanyTrim || "請負"}${
                  Number.isFinite(labor.contractorPeopleCount) &&
                  (labor.contractorPeopleCount ?? 0) > 0
                    ? `（${labor.contractorPeopleCount}名）`
                    : ""
                }`
              : joinList(
                  recordMemberNames.length > 0
                    ? recordMemberNames
                    : fallbackMemberNames
                )
            : "—";

          const needsVehicleFallback =
            labor &&
            !isContractor &&
            labor.vehicleCount === 0 &&
            labor.memberForemanNames.length === 0 &&
            labor.memberKogataNames.length === 0;
          const headerVehicleCount = labor
            ? needsVehicleFallback
              ? site.vehicleLabels.length
              : labor.vehicleCount
            : NaN;
          const headerVehicleLabel = labor ? formatVehicleCount(headerVehicleCount) : "—";

          return (
            <li key={dateKey} className={styles.accItem}>
              <button
                type="button"
                className={styles.accHeader}
                aria-expanded={isOpen}
                onClick={() => toggle(dateKey)}
              >
                <span className={styles.accHeaderMain}>
                  <span className={styles.accHeaderLine1}>
                    {formatDateKeySlash(dateKey)}
                    <span className={styles.accSep}>　</span>
                    作業種別：{workKind}
                  </span>
                  <span className={styles.accHeaderLine2}>
                    メンバー：{headerMemberLabel}
                    <span className={styles.accSep}>　</span>
                    車両：{headerVehicleLabel}
                    <span className={styles.accSep}>　</span>
                    人工：{manLabel}
                  </span>
                </span>
                <span className={styles.accChevron} aria-hidden>
                  {isOpen ? "▼" : "▶"}
                </span>
              </button>
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
                                <dd>
                                  {contractorCompanyTrim || "—"}
                                </dd>
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
                          onClick={() => setLaborConfirm(labor)}
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

                  <SiteWorkRecordPunchBlock
                    siteId={siteId}
                    siteName={siteName}
                    workKind={workKind}
                    dateKey={dateKey}
                    revision={revision}
                    onStorageChange={onInvalidate}
                    onLaborModalNeeded={onLaborModalNeeded}
                    onAfterWorkStartPunch={onAfterWorkStartPunch}
                    embedded
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
                              onClick={() =>
                                setPhotoLightbox({ photos, index: pi })
                              }
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
        })}
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
