import { useCallback, useEffect, useMemo, useState } from "react";
import type { Site } from "../types/site";
import type { WorkKind } from "../types/workKind";
import { WORK_KINDS } from "../types/workKind";
import type { SiteDailyLaborRecord } from "../types/siteDailyLabor";
import { type SitePhoto, sitePhotoDisplaySrc } from "../types/sitePhoto";
import { todayLocalDateKey } from "../lib/dateUtils";
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
import { PhotoCategoryBadge } from "./PhotoCategoryBadge";
import photoStyles from "./SitePhotosSection.module.css";
import accStyles from "./SiteWorkDateAccordions.module.css";
import styles from "./SiteWorkRecordList.module.css";

type Filter = "all" | WorkKind;

type WorkRecordRow = {
  workKind: WorkKind;
  dateKey: string;
};

type Props = {
  siteId: string;
  site: Site;
  revision: number;
  onInvalidate: () => void;
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

function joinList(items: string[]): string {
  if (items.length === 0) return "—";
  return items.join("、");
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

export function SiteWorkRecordList({ siteId, site, revision, onInvalidate }: Props) {
  const today = useMemo(() => todayLocalDateKey(), []);
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([today]));
  const [laborConfirm, setLaborConfirm] = useState<{
    workKind: WorkKind;
    record: SiteDailyLaborRecord;
  } | null>(null);
  const [workConfirm, setWorkConfirm] = useState<{
    workKind: WorkKind;
    dateKey: string;
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
    // 今日の記録は常にデフォルト展開（記録作成/保存直後にも効く）
    setExpanded((prev) => new Set([...prev, todayLocalDateKey()]));
  }, [revision]);

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
          {filtered.map(({ workKind, dateKey }) => {
            const key = rowKey(workKind, dateKey);
            const isOpen = expanded.has(dateKey); // 今日は日付基準で開く
            const labor = loadDailyLaborMap(siteId, workKind)[dateKey];
            const photos = loadPhotosForSiteWorkDate(siteId, workKind, dateKey);
            const { entryIso: mainEntryIso, endIso: mainEndIso } =
              mainMemberWorkTimesFromPhotos(photos);
            const manLabel = labor ? formatManDay(labor.finalManDays) : "—";

            const recordMemberNames =
              labor &&
              (labor.memberForemanNames.length > 0 ||
                labor.memberKogataNames.length > 0)
                ? [...labor.memberForemanNames, ...labor.memberKogataNames]
                : [];
            const fallbackMemberNames = [
              site.foremanName,
              ...site.kogataNames,
            ]
              .map((n) => n.trim())
              .filter((n) => n.length > 0);
            const headerMemberLabel = labor
              ? joinList(
                  recordMemberNames.length > 0
                    ? recordMemberNames
                    : fallbackMemberNames
                )
              : "—";

            const needsVehicleFallback =
              labor &&
              labor.vehicleCount === 0 &&
              labor.memberForemanNames.length === 0 &&
              labor.memberKogataNames.length === 0;
            const headerVehicleCount = labor
              ? needsVehicleFallback
                ? site.vehicleLabels.length
                : labor.vehicleCount
              : NaN;
            const headerVehicleLabel = labor
              ? formatVehicleCount(headerVehicleCount)
              : "—";

            return (
              <li
                key={key}
                id={siteWorkRecordElementId(dateKey, workKind)}
                className={accStyles.accItem}
              >
                <div className={styles.rowHeader}>
                  <button
                    type="button"
                    className={accStyles.accHeader}
                    aria-expanded={isOpen}
                    onClick={() => toggle(dateKey)}
                  >
                    <span className={accStyles.accHeaderMain}>
                      <span className={accStyles.accHeaderLine1}>
                        {formatDateKeySlash(dateKey)}
                        <span className={accStyles.accSep}>　</span>
                        作業種別：{workKind}
                      </span>
                      <span className={accStyles.accHeaderLine2}>
                        メンバー：{headerMemberLabel}
                        <span className={accStyles.accSep}>　</span>
                        車両：{headerVehicleLabel}
                        <span className={accStyles.accSep}>　</span>
                        人工：{manLabel}
                      </span>
                    </span>
                    <span className={accStyles.accChevron} aria-hidden>
                      {isOpen ? "▼" : "▶"}
                    </span>
                  </button>
                  <button
                    type="button"
                    className={styles.rowDeleteBtn}
                    onClick={() => setWorkConfirm({ workKind, dateKey })}
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
                              <dd>{formatManDay(labor.finalManDays)}人工</dd>
                            </div>
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
                          </dl>
                          <button
                            type="button"
                            className={accStyles.laborDeleteBtn}
                            onClick={() =>
                              setLaborConfirm({ workKind, record: labor })
                            }
                          >
                            この日の人工データを削除
                          </button>
                        </>
                      ) : (
                        <p className={accStyles.muted}>
                          未登録です。終了時の写真を登録し、人工の確認フローを完了すると表示されます。
                        </p>
                      )}
                    </section>

                    <section className={accStyles.block} aria-label="写真一覧">
                      <h3 className={accStyles.blockTitle}>写真</h3>
                      {photos.length === 0 ? (
                        <p className={accStyles.muted}>この日の写真はありません。</p>
                      ) : (
                        <ul className={photoStyles.photoGrid}>
                          {photos.map((p: SitePhoto) => (
                            <li key={p.id} className={photoStyles.photoCard}>
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
          })}
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

