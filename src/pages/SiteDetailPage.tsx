import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Site } from "../types/site";
import { getSiteById, updateSite } from "../lib/siteStorage";
import { todayLocalDateKey } from "../lib/dateUtils";
import { WORK_KINDS, type WorkKind } from "../types/workKind";
import { LaborSummaryBar } from "../components/LaborSummaryBar";
import { SitePhotosSection } from "../components/SitePhotosSection";
import { SiteWorkStartModal } from "../components/SiteWorkStartModal";
import { SiteNotificationRecipientsPanel } from "../components/SiteNotificationRecipientsPanel";
import { loadDailyLaborMap } from "../lib/siteDailyLaborStorage";
import { loadPhotosForSiteWorkDate } from "../lib/sitePhotoStorage";
import { SiteWorkRecordList } from "../components/SiteWorkRecordList";
import {
  loadTrafficCostSettings,
  resolveTrafficCostByAddress,
} from "../lib/trafficCostStorage";
import styles from "./SiteDetailPage.module.css";

function openDailyReport(siteId: string, workKind: WorkKind) {
  const d = todayLocalDateKey();
  const path = `sites/${siteId}/daily-report?date=${encodeURIComponent(d)}&work=${encodeURIComponent(workKind)}`;
  const url = new URL(
    path,
    `${window.location.origin}${import.meta.env.BASE_URL}`
  );
  window.open(url.href, "_blank", "noopener,noreferrer");
}

function joinList(items: string[]): string {
  if (items.length === 0) return "—";
  return items.join("、");
}

function formatRemovalCompletedDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
}

function normalizeString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function normalizeStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

function normalizeNonNegativeInt(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.round(n);
}

function formatYen(n: number): string {
  return `${Math.round(n).toLocaleString()}円`;
}

export function SiteDetailPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const [site, setSite] = useState<Site | null | undefined>(undefined);
  const [workKind, setWorkKind] = useState<WorkKind>("組み");
  const [fileRevision, setFileRevision] = useState(0);
  const [removalConfirmOpen, setRemovalConfirmOpen] = useState(false);
  const [removalConfirmAcknowledged, setRemovalConfirmAcknowledged] =
    useState(false);
  const [workStartOpen, setWorkStartOpen] = useState(false);
  const [workStartMessage, setWorkStartMessage] = useState<string | null>(null);
  const [todayUploadKind, setTodayUploadKind] = useState<WorkKind>("組み");
  const [photoAddMessage, setPhotoAddMessage] = useState<string | null>(null);
  const [photoTargetOpen, setPhotoTargetOpen] = useState(false);
  const [photoTargetKind, setPhotoTargetKind] = useState<WorkKind>("組み");
  const photoAddTriggerRef = useRef<(() => void) | null>(null);
  const basicInfoSectionRef = useRef<HTMLElement | null>(null);

  const todayKey = useMemo(() => todayLocalDateKey(), []);

  const bumpFile = useCallback(() => {
    setFileRevision((r) => r + 1);
  }, []);

  const refreshSiteFromStorage = useCallback(() => {
    if (!siteId) return;
    setSite(getSiteById(siteId) ?? null);
  }, [siteId]);

  useEffect(() => {
    if (!siteId) {
      setSite(null);
      return;
    }
    setSite(getSiteById(siteId) ?? null);
  }, [siteId]);

  useEffect(() => {
    if (!site) return;
    function onStorageEvent(e: Event) {
      const d = (e as CustomEvent<{ siteId?: string }>).detail;
      if (d?.siteId === site.id) bumpFile();
    }
    window.addEventListener("siteDailyLaborSaved", onStorageEvent);
    window.addEventListener("siteWorkPhotosChanged", onStorageEvent);
    window.addEventListener("trafficCostSettingsSaved", bumpFile);
    return () => {
      window.removeEventListener("siteDailyLaborSaved", onStorageEvent);
      window.removeEventListener("siteWorkPhotosChanged", onStorageEvent);
      window.removeEventListener("trafficCostSettingsSaved", bumpFile);
    };
  }, [site, bumpFile]);

  useEffect(() => {
    if (!siteId) return;
    function onSiteDataSaved(e: Event) {
      const d = (e as CustomEvent<{ siteId?: string }>).detail;
      if (d?.siteId === siteId) refreshSiteFromStorage();
    }
    window.addEventListener("siteDataSaved", onSiteDataSaved);
    return () => window.removeEventListener("siteDataSaved", onSiteDataSaved);
  }, [siteId, refreshSiteFromStorage]);

  useEffect(() => {
    if (!removalConfirmOpen) {
      setRemovalConfirmAcknowledged(false);
      return;
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setRemovalConfirmOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [removalConfirmOpen]);

  const safeSite: Site = useMemo(() => {
    // site が未読込/未存在でも Hooks の順番が変わらないよう、常に生成する
    const baseId = typeof siteId === "string" ? siteId : "";
    const empty: Site = {
      id: baseId,
      name: "",
      clientName: "",
      address: "",
      googleMapUrl: "",
      startDate: "",
      salesName: "",
      foremanName: "",
      kogataNames: [],
      workerCount: 0,
      vehicleLabels: [],
      siteTypeName: "",
      companyKind: "自社",
      createdAt: "",
      scaffoldingRemovalCompletedAt: undefined,
    };

    if (!site) return empty;

    const s: any = site;
    const companyKind =
      s?.companyKind === "自社" || s?.companyKind === "KOUSEI"
        ? (s.companyKind as Site["companyKind"])
        : "自社";
    return {
      ...empty,
      id: normalizeString(s?.id) || empty.id,
      name: normalizeString(s?.name),
      clientName: normalizeString(s?.clientName),
      address: normalizeString(s?.address),
      googleMapUrl: normalizeString(s?.googleMapUrl),
      startDate: normalizeString(s?.startDate),
      salesName: normalizeString(s?.salesName),
      foremanName: normalizeString(s?.foremanName),
      kogataNames: normalizeStringArray(s?.kogataNames),
      workerCount: normalizeNonNegativeInt(s?.workerCount, 0),
      vehicleLabels: normalizeStringArray(s?.vehicleLabels),
      siteTypeName: normalizeString(s?.siteTypeName),
      companyKind,
      createdAt: normalizeString(s?.createdAt),
      scaffoldingRemovalCompletedAt:
        typeof s?.scaffoldingRemovalCompletedAt === "string" &&
        s.scaffoldingRemovalCompletedAt.trim()
          ? s.scaffoldingRemovalCompletedAt
          : undefined,
    };
  }, [site, siteId]);

  const hasTodayWorkRecordAny = useMemo(() => {
    if (!safeSite.id) return false;
    return WORK_KINDS.some((k) => Boolean(loadDailyLaborMap(safeSite.id, k)[todayKey]));
  }, [safeSite.id, todayKey, fileRevision]);

  const todayWorkKind = useMemo<WorkKind | null>(() => {
    if (!safeSite.id) return null;
    for (const k of WORK_KINDS) {
      if (loadDailyLaborMap(safeSite.id, k)[todayKey]) return k;
    }
    return null;
  }, [safeSite.id, todayKey, fileRevision]);

  const todayWorkKinds = useMemo<WorkKind[]>(() => {
    if (!safeSite.id) return [];
    return WORK_KINDS.filter((k) => Boolean(loadDailyLaborMap(safeSite.id, k)[todayKey]));
  }, [safeSite.id, todayKey, fileRevision]);

  useEffect(() => {
    // 今日の作業が1件なら自動選択、複数なら先頭をデフォルトにする
    if (todayWorkKinds.length === 0) return;
    if (todayWorkKinds.includes(todayUploadKind)) return;
    setTodayUploadKind(todayWorkKinds[0]);
  }, [todayWorkKinds, todayUploadKind]);

  useEffect(() => {
    if (!photoTargetOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setPhotoTargetOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [photoTargetOpen]);

  const beforeAddPhotos = useCallback(() => {
    setPhotoAddMessage(null);
    if (todayWorkKinds.length === 0) {
      setPhotoAddMessage("先に作業を追加してください");
      return false;
    }
    if (todayWorkKinds.length === 1) {
      setTodayUploadKind(todayWorkKinds[0]);
      return true;
    }
    let latest: WorkKind | null = null;
    let latestMs = -Infinity;
    for (const k of todayWorkKinds) {
      const rec = loadDailyLaborMap(safeSite.id, k)[todayKey];
      const ms =
        rec && typeof rec.createdAt === "string" ? Date.parse(rec.createdAt) : NaN;
      if (Number.isFinite(ms) && ms > latestMs) {
        latestMs = ms;
        latest = k;
      }
    }
    const initial =
      latest ??
      (todayWorkKinds.includes(todayUploadKind)
        ? todayUploadKind
        : todayWorkKinds[0]);
    setPhotoTargetKind(initial);
    setPhotoTargetOpen(true);
    return false;
  }, [todayWorkKinds, todayUploadKind]);

  const resolvedTraffic = useMemo(() => {
    const address = safeSite.address.trim();
    if (!address) return null;
    const settings = loadTrafficCostSettings();
    return resolveTrafficCostByAddress(address, settings);
  }, [safeSite.address, fileRevision]);

  if (site === undefined) {
    return (
      <p className={styles.muted} aria-live="polite">
        読み込み中…
      </p>
    );
  }

  if (site === null) {
    return (
      <div>
        <p className={styles.notFound}>この現場は見つかりませんでした。</p>
        <Link to="/">現場一覧に戻る</Link>
      </div>
    );
  }

  return (
    <div>
      <div className={styles.breadcrumb}>
        <Link to="/">← 現場一覧に戻る</Link>
      </div>

      <header className={styles.header}>
        <h1 className={styles.title}>{safeSite.name || "（現場名未設定）"}</h1>
        <p className={styles.sub}>現場ファイル</p>
        <Link to={`/sites/${safeSite.id}/edit`} className={styles.editLink}>
          編集する
        </Link>
      </header>

      <div className={styles.scaffoldRemovalBar}>
        {safeSite.scaffoldingRemovalCompletedAt?.trim() ? (
          <button
            type="button"
            className={styles.scaffoldRemovalDone}
            disabled
            aria-label={`足場撤去は完了済みです（${formatRemovalCompletedDate(safeSite.scaffoldingRemovalCompletedAt)}）`}
          >
            撤去完了済み（
            {formatRemovalCompletedDate(safeSite.scaffoldingRemovalCompletedAt)}）
          </button>
        ) : (
          <button
            type="button"
            className={styles.scaffoldRemovalBtn}
            onClick={() => setRemovalConfirmOpen(true)}
          >
            足場撤去完了
          </button>
        )}
      </div>

      <div className={styles.basicInfoJumpBar}>
        <button
          type="button"
          className={styles.basicInfoJumpBtn}
          onClick={() =>
            basicInfoSectionRef.current?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            })
          }
        >
          基本情報へ ↓
        </button>
      </div>

      {removalConfirmOpen && (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onClick={() => setRemovalConfirmOpen(false)}
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="scaffold-removal-dialog-title"
            aria-describedby="scaffold-removal-dialog-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="scaffold-removal-dialog-title" className={styles.modalTitle}>
              足場撤去の完了
            </h2>
            <p
              id="scaffold-removal-dialog-desc"
              className={styles.modalBody}
            >
              足場の撤去が完了しましたか？この操作は取り消せません。
            </p>
            <label className={styles.modalAckLabel}>
              <input
                id="scaffold-removal-confirm-check"
                className={styles.modalCheckbox}
                type="checkbox"
                checked={removalConfirmAcknowledged}
                onChange={(e) =>
                  setRemovalConfirmAcknowledged(e.target.checked)
                }
              />
              <span>足場の撤去が完了したことを確認しました</span>
            </label>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalCancel}
                onClick={() => setRemovalConfirmOpen(false)}
              >
                キャンセル
              </button>
              <button
                type="button"
                className={styles.modalConfirm}
                disabled={!removalConfirmAcknowledged}
                onClick={() => {
                  if (!removalConfirmAcknowledged) return;
                  const at = new Date().toISOString();
                  const next: Site = {
                    ...safeSite,
                    scaffoldingRemovalCompletedAt: at,
                  };
                  updateSite(next);
                  setSite(next);
                  setRemovalConfirmOpen(false);
                }}
              >
                完了にする
              </button>
            </div>
          </div>
        </div>
      )}

      <section aria-label="作業記録一覧">
        <div className={styles.startWorkWrap}>
          <button
            type="button"
            className={styles.startWorkBtn}
            onClick={() => {
              setWorkStartMessage(null);
              setWorkStartOpen(true);
            }}
          >
            + 作業を追加する
          </button>
          <p className={styles.startWorkHint}>
            今日の記録は「作業開始」から作成します。開始後、写真アップロードと人工・手伝い班の記録が表示されます。
          </p>
          {workStartMessage && (
            <p className={styles.workStartMessage} role="status">
              {workStartMessage}
            </p>
          )}
        </div>

        {workStartOpen && (
          <SiteWorkStartModal
            site={safeSite}
            todayDateKey={todayKey}
            initialWorkKind={workKind}
            onClose={() => setWorkStartOpen(false)}
            onStarted={(next) => {
              setWorkStartMessage(null);
              setWorkKind(next);
            }}
          />
        )}

        {todayWorkKinds.length > 0 && (
          <SitePhotosSection
            siteId={safeSite.id}
            site={safeSite}
            workKind={todayWorkKinds.length === 1 ? todayWorkKinds[0] : todayUploadKind}
            todayDateKey={todayKey}
            onStorageChange={bumpFile}
            beforeAddPhotos={beforeAddPhotos}
            registerAddPhotosTrigger={(fn) => {
              photoAddTriggerRef.current = fn;
            }}
          />
        )}

        {photoAddMessage && (
          <p className={styles.workStartMessage} role="status">
            {photoAddMessage}
          </p>
        )}

        {photoTargetOpen && (
          <div
            className={styles.modalBackdrop}
            role="presentation"
            onClick={() => {
              setPhotoTargetOpen(false);
            }}
          >
            <div
              className={styles.modal}
              role="dialog"
              aria-modal="true"
              aria-labelledby="photo-target-title"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="photo-target-title" className={styles.modalTitle}>
                どの作業に追加しますか？
              </h2>
              <div className={styles.modalBody}>
                {todayWorkKinds.map((k) => (
                  <label key={k} className={styles.radioLabel}>
                    <input
                      type="radio"
                      name="photo-target-kind"
                      checked={photoTargetKind === k}
                      onChange={() => setPhotoTargetKind(k)}
                    />
                    {k}（{todayKey.replaceAll("-", "/")}）
                  </label>
                ))}
              </div>
              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.modalCancel}
                  onClick={() => {
                    setPhotoTargetOpen(false);
                  }}
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  className={styles.modalConfirm}
                  onClick={() => {
                    setTodayUploadKind(photoTargetKind);
                    setPhotoTargetOpen(false);
                    // ここはユーザー操作なので、ここで直接「写真を追加」を再実行する
                    photoAddTriggerRef.current?.();
                  }}
                >
                  この作業に追加する
                </button>
              </div>
            </div>
          </div>
        )}

        <SiteWorkRecordList
          siteId={safeSite.id}
          site={safeSite}
          revision={fileRevision}
          onInvalidate={bumpFile}
        />

        <div className={styles.reportBar}>
          <button
            type="button"
            className={styles.reportBtn}
            onClick={() =>
              openDailyReport(
                safeSite.id,
                todayWorkKinds.length === 1
                  ? todayWorkKinds[0]
                  : todayWorkKinds.length > 1
                    ? todayUploadKind
                    : todayWorkKind ?? workKind
              )
            }
          >
            日報を生成する
          </button>
          <span className={styles.reportHint}>
            選択中の作業種別・今日の日付で開きます。別タブで印刷またはPDF保存にご利用ください。
          </span>
        </div>
      </section>

      <section aria-label="人工・交通費サマリー">
        <h2 className={styles.pageSectionTitle}>人工・交通費サマリー</h2>
        <LaborSummaryBar siteId={safeSite.id} revision={fileRevision} />

        <section className={styles.trafficSummary} aria-label="交通費サマリー">
          <h3 className={styles.sectionTitle}>交通費サマリー</h3>
          {!resolvedTraffic ? (
            <p className={styles.trafficHint}>交通費マスターに未登録です</p>
          ) : (
            (() => {
              const perCar = resolvedTraffic.totalYen;
              const sumFor = (kind: WorkKind) => {
                const map = loadDailyLaborMap(safeSite.id, kind);
                let total = 0;
                for (const r of Object.values(map)) {
                  const vc =
                    typeof r.vehicleCount === "number" ? r.vehicleCount : 0;
                  if (Number.isFinite(vc) && vc > 0) total += vc * perCar;
                }
                return total;
              };
              const kumi = sumFor("組み");
              const harai = sumFor("払い");
              const sonota = sumFor("その他");
              const grand = kumi + harai + sonota;
              return (
                <div className={styles.trafficGrid}>
                  <div className={styles.trafficItem}>
                    <span className={styles.trafficLabel}>組みの交通費合計</span>
                    <span className={styles.trafficAmount}>
                      {formatYen(kumi)}
                    </span>
                  </div>
                  <div className={styles.trafficItem}>
                    <span className={styles.trafficLabel}>払いの交通費合計</span>
                    <span className={styles.trafficAmount}>
                      {formatYen(harai)}
                    </span>
                  </div>
                  <div className={styles.trafficItem}>
                    <span className={styles.trafficLabel}>その他の交通費合計</span>
                    <span className={styles.trafficAmount}>
                      {formatYen(sonota)}
                    </span>
                  </div>
                  <div className={`${styles.trafficItem} ${styles.trafficTotal}`}>
                    <span className={styles.trafficLabel}>総交通費</span>
                    <span className={styles.trafficAmount}>
                      {formatYen(grand)}
                    </span>
                  </div>
                  <p className={styles.trafficNote}>
                    1台あたり{formatYen(perCar)} × 日ごとの車両台数で計算します。
                  </p>
                </div>
              );
            })()
          )}
        </section>

        <section className={styles.trafficSection} aria-label="交通費（1台あたり）">
          <h3 className={styles.sectionTitle}>交通費</h3>
          {resolvedTraffic ? (
            <p className={styles.trafficValue}>
              1台あたり：
              <strong>{formatYen(resolvedTraffic.totalYen)}</strong>（ガソリン代
              {formatYen(resolvedTraffic.setting.gasYen)}＋ETC
              {formatYen(resolvedTraffic.setting.etcYen)}）
            </p>
          ) : (
            <p className={styles.trafficHint}>交通費マスターに未登録です</p>
          )}
        </section>
      </section>

      <section
        ref={basicInfoSectionRef}
        id="site-basic-info"
        className={styles.basicInfoSection}
        aria-label="現場基本情報"
      >
        <h2 className={styles.pageSectionTitle}>現場基本情報</h2>
        <dl className={styles.detailsGrid}>
          <div className={styles.row}>
            <dt className={styles.dt}>現場名</dt>
            <dd className={styles.dd}>{safeSite.name || "—"}</dd>
          </div>
          <div className={styles.row}>
            <dt className={styles.dt}>現場コード</dt>
            <dd className={styles.dd}>{safeSite.siteCode?.trim() || "—"}</dd>
          </div>
          <div className={styles.row}>
            <dt className={styles.dt}>元請け様</dt>
            <dd className={styles.dd}>{safeSite.clientName || "—"}</dd>
          </div>
          <div className={styles.row}>
            <dt className={styles.dt}>住所（表示用）</dt>
            <dd className={styles.dd}>{safeSite.address || "—"}</dd>
          </div>
          <div className={styles.row}>
            <dt className={styles.dt}>GoogleマップURL</dt>
            <dd className={styles.dd}>
              {safeSite.googleMapUrl?.trim() ? (
                <a
                  href={safeSite.googleMapUrl.trim()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.externalLink}
                >
                  地図を開く
                </a>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div className={styles.row}>
            <dt className={styles.dt}>開始日</dt>
            <dd className={styles.dd}>{safeSite.startDate || "—"}</dd>
          </div>
          <div className={styles.row}>
            <dt className={styles.dt}>担当営業名</dt>
            <dd className={styles.dd}>{safeSite.salesName || "—"}</dd>
          </div>
          <div className={styles.row}>
            <dt className={styles.dt}>職長名</dt>
            <dd className={styles.dd}>{safeSite.foremanName || "—"}</dd>
          </div>
          <div className={styles.row}>
            <dt className={styles.dt}>子方名</dt>
            <dd className={styles.dd}>{joinList(safeSite.kogataNames)}</dd>
          </div>
          <div className={styles.row}>
            <dt className={styles.dt}>人員数</dt>
            <dd className={styles.dd}>{safeSite.workerCount} 名</dd>
          </div>
          <div className={styles.row}>
            <dt className={styles.dt}>車両</dt>
            <dd className={styles.dd}>{joinList(safeSite.vehicleLabels)}</dd>
          </div>
          <div className={styles.row}>
            <dt className={styles.dt}>現場種別</dt>
            <dd className={styles.dd}>{safeSite.siteTypeName || "—"}</dd>
          </div>
          <div className={styles.row}>
            <dt className={styles.dt}>自社 / KOUSEI</dt>
            <dd className={styles.dd}>{safeSite.companyKind}</dd>
          </div>
        </dl>

        <div className={styles.notifyWrap}>
          <SiteNotificationRecipientsPanel siteId={safeSite.id} />
        </div>
      </section>
    </div>
  );
}
