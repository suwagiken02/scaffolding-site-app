import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Site, SiteMemo } from "../types/site";
import {
  getSiteById,
  newSiteMemoId,
  normalizeEntranceDateKeys,
  normalizeSiteMemos,
  startDateFromEntranceDateKeys,
  updateSite,
} from "../lib/siteStorage";
import { todayLocalDateKey } from "../lib/dateUtils";
import { WORK_KINDS, type WorkKind } from "../types/workKind";
import { LaborSummaryBar } from "../components/LaborSummaryBar";
import { HelpTeamLaborModal } from "../components/HelpTeamLaborModal";
import { SitePhotosSection } from "../components/SitePhotosSection";
import { SiteWorkTimeSection } from "../components/SiteWorkTimeSection";
import { SiteWorkStartModal } from "../components/SiteWorkStartModal";
import { SiteNotificationRecipientsPanel } from "../components/SiteNotificationRecipientsPanel";
import { loadDailyLaborMap } from "../lib/siteDailyLaborStorage";
import { SiteDocumentsSection } from "../components/SiteDocumentsSection";
import { SiteProcessSummaryPhotos } from "../components/SiteProcessSummaryPhotos";
import { SiteWorkRecordList } from "../components/SiteWorkRecordList";
import {
  loadTrafficCostSettings,
  resolveTrafficCostByAddress,
} from "../lib/trafficCostStorage";
import { purgeSiteData } from "../lib/purgeSiteData";
import {
  getEffectiveSiteDisplayStatus,
  SITE_DISPLAY_STATUS_OPTIONS,
} from "../lib/siteStatus";
import styles from "./SiteDetailPage.module.css";

const PIN_DELETE_SITE = "1234";

function openDailyReport(siteId: string, workKind: WorkKind) {
  const d = todayLocalDateKey();
  const path = `sites/${siteId}/daily-report?date=${encodeURIComponent(d)}&work=${encodeURIComponent(workKind)}`;
  const url = new URL(
    path,
    `${window.location.origin}${import.meta.env.BASE_URL}`
  );
  window.open(url.href, "_blank", "noopener,noreferrer");
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

function formatYen(n: number): string {
  return `${Math.round(n).toLocaleString()}円`;
}

export function SiteDetailPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const navigate = useNavigate();
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
  const [helpLaborModal, setHelpLaborModal] = useState<{
    workKind: WorkKind;
    dateKey: string;
    entryIso: string | null;
    endIso: string;
  } | null>(null);
  const [entranceExpanded, setEntranceExpanded] = useState(false);
  const [deleteSitePinOpen, setDeleteSitePinOpen] = useState(false);
  const [deleteSiteConfirmOpen, setDeleteSiteConfirmOpen] = useState(false);
  const [deleteSitePin, setDeleteSitePin] = useState("");
  const [deleteSitePinError, setDeleteSitePinError] = useState<string | null>(
    null
  );
  const [statusChangePinOpen, setStatusChangePinOpen] = useState(false);
  const [statusSelectOpen, setStatusSelectOpen] = useState(false);
  const [statusChangePin, setStatusChangePin] = useState("");
  const [statusChangePinError, setStatusChangePinError] = useState<
    string | null
  >(null);
  const [memoAddOpen, setMemoAddOpen] = useState(false);
  const [memoDraft, setMemoDraft] = useState("");
  const [editingMemoId, setEditingMemoId] = useState<string | null>(null);
  const [editingMemoText, setEditingMemoText] = useState("");
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
    setEntranceExpanded(false);
  }, [siteId]);

  useEffect(() => {
    setDeleteSitePinOpen(false);
    setDeleteSiteConfirmOpen(false);
    setDeleteSitePin("");
    setDeleteSitePinError(null);
    setStatusChangePinOpen(false);
    setStatusSelectOpen(false);
    setStatusChangePin("");
    setStatusChangePinError(null);
  }, [siteId]);

  useEffect(() => {
    if (!deleteSitePinOpen) return;
    setDeleteSitePin("");
    setDeleteSitePinError(null);
  }, [deleteSitePinOpen]);

  useEffect(() => {
    if (!statusChangePinOpen) return;
    setStatusChangePin("");
    setStatusChangePinError(null);
  }, [statusChangePinOpen]);

  useEffect(() => {
    if (!deleteSitePinOpen && !deleteSiteConfirmOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (deleteSitePinOpen) {
        setDeleteSitePinOpen(false);
        setDeleteSitePin("");
        setDeleteSitePinError(null);
      } else {
        setDeleteSiteConfirmOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteSitePinOpen, deleteSiteConfirmOpen]);

  useEffect(() => {
    if (!statusChangePinOpen && !statusSelectOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (statusChangePinOpen) {
        setStatusChangePinOpen(false);
        setStatusChangePin("");
        setStatusChangePinError(null);
      } else {
        setStatusSelectOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [statusChangePinOpen, statusSelectOpen]);

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
      siteCode: "",
      clientName: "",
      address: "",
      googleMapUrl: "",
      startDate: "",
      entranceDateKeys: [],
      salesName: "",
      foremanName: "",
      kogataNames: [],
      vehicleLabels: [],
      siteTypeName: "",
      companyKind: "自社",
      siteMemos: [],
      createdAt: "",
      scaffoldingRemovalCompletedAt: undefined,
      ignoreSiteListWarning: undefined,
      externalUnconfirmed: undefined,
      externalCompanyKey: "",
      externalCompanyName: "",
      manualDisplayStatus: undefined,
    };

    if (!site) return empty;

    const s: any = site;
    const companyKind =
      s?.companyKind === "自社" || s?.companyKind === "KOUSEI"
        ? (s.companyKind as Site["companyKind"])
        : "自社";
    const entranceDateKeys = normalizeEntranceDateKeys(s?.entranceDateKeys);
    const startDate =
      entranceDateKeys.length > 0
        ? entranceDateKeys[0]
        : normalizeString(s?.startDate);
    return {
      ...empty,
      id: normalizeString(s?.id) || empty.id,
      name: normalizeString(s?.name),
      clientName: normalizeString(s?.clientName),
      address: normalizeString(s?.address),
      googleMapUrl: normalizeString(s?.googleMapUrl),
      startDate,
      entranceDateKeys,
      salesName: normalizeString(s?.salesName),
      foremanName: normalizeString(s?.foremanName),
      kogataNames: normalizeStringArray(s?.kogataNames),
      vehicleLabels: normalizeStringArray(s?.vehicleLabels),
      siteMemos: normalizeSiteMemos(s?.siteMemos),
      siteTypeName: normalizeString(s?.siteTypeName),
      companyKind,
      createdAt: normalizeString(s?.createdAt),
      scaffoldingRemovalCompletedAt:
        typeof s?.scaffoldingRemovalCompletedAt === "string" &&
        s.scaffoldingRemovalCompletedAt.trim()
          ? s.scaffoldingRemovalCompletedAt
          : undefined,
      ignoreSiteListWarning:
        s?.ignoreSiteListWarning === true ? true : undefined,
      externalUnconfirmed:
        s?.externalUnconfirmed === true
          ? true
          : s?.externalUnconfirmed === false
            ? false
            : undefined,
      externalCompanyKey:
        typeof s?.externalCompanyKey === "string" ? s.externalCompanyKey : "",
      externalCompanyName:
        typeof s?.externalCompanyName === "string" ? s.externalCompanyName : "",
      siteCode:
        typeof s?.siteCode === "string" && s.siteCode.trim()
          ? s.siteCode.trim()
          : "",
      manualDisplayStatus:
        s?.manualDisplayStatus === "入場前" ||
        s?.manualDisplayStatus === "組立中" ||
        s?.manualDisplayStatus === "設置中" ||
        s?.manualDisplayStatus === "解体中" ||
        s?.manualDisplayStatus === "撤去済"
          ? s.manualDisplayStatus
          : undefined,
    };
  }, [site, siteId]);

  const entranceDatesDesc = useMemo(
    () => [...safeSite.entranceDateKeys].sort((a, b) => b.localeCompare(a)),
    [safeSite.entranceDateKeys]
  );

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

  /** 写真アップロード先の作業種別（今日の人工が無いときは画面上の workKind を使う） */
  const photoSectionWorkKind = useMemo<WorkKind>(() => {
    if (todayWorkKinds.length === 1) return todayWorkKinds[0];
    if (todayWorkKinds.length > 1) return todayUploadKind;
    return workKind;
  }, [todayWorkKinds, todayUploadKind, workKind]);

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
      // 人工未登録でも今日の日付へ写真を追加できる（作業種別は workKind）
      return true;
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
  }, [todayWorkKinds, todayUploadKind, safeSite.id, todayKey]);

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
        <div className={styles.headerTitleRow}>
          <h1 className={styles.title}>{safeSite.name || "（現場名未設定）"}</h1>
          {(() => {
            const displayStatus = getEffectiveSiteDisplayStatus(safeSite);
            const badgeClass =
              displayStatus === "入場前"
                ? styles.detailStatusPre
                : displayStatus === "組立中"
                  ? styles.detailStatusAssembly
                  : displayStatus === "設置中"
                    ? styles.detailStatusActive
                    : displayStatus === "解体中"
                      ? styles.detailStatusDismantle
                      : styles.detailStatusEnded;
            return (
              <>
                <span
                  className={`${styles.detailStatusBadge} ${badgeClass}`}
                  aria-label={`ステータス: ${displayStatus}`}
                >
                  {displayStatus}
                </span>
                <button
                  type="button"
                  className={styles.statusChangeBtn}
                  onClick={() => {
                    setStatusChangePinError(null);
                    setStatusChangePin("");
                    setStatusChangePinOpen(true);
                  }}
                >
                  変更
                </button>
              </>
            );
          })()}
        </div>
        <p className={styles.headerClient}>
          {safeSite.clientName?.trim() || "—"}
        </p>
        <SiteDocumentsSection
          siteId={safeSite.id}
          revision={fileRevision}
          onStorageChange={bumpFile}
        />
        <SiteProcessSummaryPhotos siteId={safeSite.id} revision={fileRevision} />
      </header>

      {safeSite.externalUnconfirmed === true && (
        <div className={styles.externalConfirmBanner} role="region" aria-label="外部登録の確認">
          <p className={styles.externalConfirmText}>
            外部会社から登録された現場です。内容を確認したら「確認済みにする」を押してください。
            {safeSite.externalCompanyName.trim()
              ? `（登録元：${safeSite.externalCompanyName.trim()}）`
              : null}
          </p>
          <button
            type="button"
            className={styles.externalConfirmBtn}
            onClick={() => {
              const cur = getSiteById(safeSite.id);
              if (!cur) return;
              updateSite({
                ...cur,
                externalUnconfirmed: false,
              });
              refreshSiteFromStorage();
            }}
          >
            確認済みにする
          </button>
        </div>
      )}

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
          基本情報
        </button>
      </div>

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
            ＋作業を開始する
          </button>
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
              setTodayUploadKind(next);
            }}
          />
        )}

        {todayWorkKinds.length > 1 && (
          <div
            className={styles.workKindTabs}
            role="group"
            aria-label="本日登録済みの作業種別の切り替え"
          >
            {todayWorkKinds.map((k) => (
              <button
                key={k}
                type="button"
                className={
                  todayUploadKind === k
                    ? styles.workKindTabActive
                    : styles.workKindTab
                }
                onClick={() => setTodayUploadKind(k)}
              >
                {k}
              </button>
            ))}
          </div>
        )}

        <SiteWorkTimeSection
          siteId={safeSite.id}
          workKind={photoSectionWorkKind}
          revision={fileRevision}
          todayDateKey={todayKey}
          onStorageChange={bumpFile}
          onLaborModalNeeded={(ctx) => setHelpLaborModal(ctx)}
        />

        <SitePhotosSection
          siteId={safeSite.id}
          site={safeSite}
          workKind={photoSectionWorkKind}
          todayDateKey={todayKey}
          onStorageChange={bumpFile}
          beforeAddPhotos={beforeAddPhotos}
          registerAddPhotosTrigger={(fn) => {
            photoAddTriggerRef.current = fn;
          }}
        />

        {helpLaborModal && (
          <HelpTeamLaborModal
            siteId={safeSite.id}
            site={safeSite}
            workKind={helpLaborModal.workKind}
            dateKey={helpLaborModal.dateKey}
            entryIso={helpLaborModal.entryIso}
            endIso={helpLaborModal.endIso}
            onClose={() => setHelpLaborModal(null)}
            onSaved={bumpFile}
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
      </section>

      <section aria-label="人工・交通費">
        <h2 className={styles.pageSectionTitle}>人工・交通費</h2>
        <LaborSummaryBar siteId={safeSite.id} revision={fileRevision} />

        <section className={styles.trafficSummary} aria-label="交通費">
          <h3 className={styles.sectionTitle}>交通費</h3>
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
              const joyo = sumFor("常用作業");
              const grand = kumi + harai + sonota + joyo;
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
                  <div className={styles.trafficItem}>
                    <span className={styles.trafficLabel}>常用作業の交通費合計</span>
                    <span className={styles.trafficAmount}>
                      {formatYen(joyo)}
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
        <div className={styles.basicInfoTitleRow}>
          <h2 className={styles.pageSectionTitle}>現場基本情報</h2>
          <Link to={`/sites/${safeSite.id}/edit`} className={styles.editLink}>
            編集する
          </Link>
        </div>
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
            <dd className={styles.dd}>
              {startDateFromEntranceDateKeys(safeSite.entranceDateKeys) || "—"}
            </dd>
          </div>
          <div className={styles.row}>
            <dt className={styles.dt}>入場日</dt>
            <dd className={`${styles.dd} ${styles.entranceDd}`}>
              {entranceDatesDesc.length === 0 ? (
                "—"
              ) : (
                <>
                  <ul className={styles.entranceDateList}>
                    {(entranceExpanded
                      ? entranceDatesDesc
                      : entranceDatesDesc.slice(0, 3)
                    ).map((dk) => (
                      <li
                        key={dk}
                        className={
                          dk < todayKey
                            ? styles.entranceDatePast
                            : styles.entranceDateCurrent
                        }
                      >
                        {dk}
                      </li>
                    ))}
                  </ul>
                  {entranceDatesDesc.length > 3 && (
                    <button
                      type="button"
                      className={styles.entranceMoreBtn}
                      onClick={() => setEntranceExpanded((v) => !v)}
                    >
                      {entranceExpanded ? "閉じる" : "もっと見る"}
                    </button>
                  )}
                </>
              )}
            </dd>
          </div>
          <div className={styles.row}>
            <dt className={styles.dt}>担当営業名</dt>
            <dd className={styles.dd}>{safeSite.salesName || "—"}</dd>
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

        <div className={styles.memoBlock} aria-label="現場メモ">
          <h3 className={styles.memoHeading}>メモ</h3>
          {!memoAddOpen ? (
            <button
              type="button"
              className={styles.memoAddOpenBtn}
              onClick={() => {
                setMemoAddOpen(true);
                setMemoDraft("");
              }}
            >
              メモを追加
            </button>
          ) : (
            <div className={styles.memoAddForm}>
              <textarea
                className={styles.memoTextarea}
                value={memoDraft}
                onChange={(e) => setMemoDraft(e.target.value)}
                rows={4}
                placeholder="メモを入力"
                aria-label="新しいメモ"
              />
              <div className={styles.memoFormActions}>
                <button
                  type="button"
                  className={styles.memoSaveBtn}
                  onClick={() => {
                    const t = memoDraft.trim();
                    if (!t) return;
                    const next: Site = {
                      ...safeSite,
                      siteMemos: [
                        ...safeSite.siteMemos,
                        { id: newSiteMemoId(), text: t },
                      ],
                    };
                    updateSite(next);
                    setSite(next);
                    setMemoAddOpen(false);
                    setMemoDraft("");
                  }}
                >
                  保存
                </button>
                <button
                  type="button"
                  className={styles.memoCancelBtn}
                  onClick={() => {
                    setMemoAddOpen(false);
                    setMemoDraft("");
                  }}
                >
                  キャンセル
                </button>
              </div>
            </div>
          )}

          {safeSite.siteMemos.length > 0 && (
            <ul className={styles.memoList}>
              {safeSite.siteMemos.map((m: SiteMemo) => (
                <li key={m.id} className={styles.memoItem}>
                  {editingMemoId === m.id ? (
                    <div className={styles.memoEditForm}>
                      <textarea
                        className={styles.memoTextarea}
                        value={editingMemoText}
                        onChange={(e) => setEditingMemoText(e.target.value)}
                        rows={4}
                        aria-label="メモを編集"
                      />
                      <div className={styles.memoFormActions}>
                        <button
                          type="button"
                          className={styles.memoSaveBtn}
                          onClick={() => {
                            const t = editingMemoText.trim();
                            const next: Site = {
                              ...safeSite,
                              siteMemos: safeSite.siteMemos.map((x) =>
                                x.id === m.id ? { ...x, text: t } : x
                              ),
                            };
                            updateSite(next);
                            setSite(next);
                            setEditingMemoId(null);
                            setEditingMemoText("");
                          }}
                        >
                          保存
                        </button>
                        <button
                          type="button"
                          className={styles.memoCancelBtn}
                          onClick={() => {
                            setEditingMemoId(null);
                            setEditingMemoText("");
                          }}
                        >
                          キャンセル
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className={styles.memoBody}>{m.text || "—"}</p>
                      <div className={styles.memoItemActions}>
                        <button
                          type="button"
                          className={styles.memoEditBtn}
                          onClick={() => {
                            setEditingMemoId(m.id);
                            setEditingMemoText(m.text);
                          }}
                        >
                          編集
                        </button>
                        <button
                          type="button"
                          className={styles.memoDeleteBtn}
                          onClick={() => {
                            const next: Site = {
                              ...safeSite,
                              siteMemos: safeSite.siteMemos.filter(
                                (x) => x.id !== m.id
                              ),
                            };
                            updateSite(next);
                            setSite(next);
                            if (editingMemoId === m.id) {
                              setEditingMemoId(null);
                              setEditingMemoText("");
                            }
                          }}
                        >
                          削除
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={styles.notifyWrap}>
          <SiteNotificationRecipientsPanel siteId={safeSite.id} />
        </div>
      </section>

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
      </div>

      <div className={styles.deleteSiteBar}>
        <button
          type="button"
          className={styles.deleteSiteBtn}
          onClick={() => setDeleteSitePinOpen(true)}
        >
          この現場を削除する
        </button>
      </div>

      {deleteSitePinOpen && (
        <div
          className={styles.deletePinBackdrop}
          role="presentation"
          onClick={() => {
            setDeleteSitePinOpen(false);
            setDeleteSitePin("");
            setDeleteSitePinError(null);
          }}
        >
          <div
            className={styles.deletePinCard}
            role="dialog"
            aria-modal="true"
            aria-labelledby="site-detail-delete-pin-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="site-detail-delete-pin-title"
              className={styles.deletePinTitle}
            >
              PINコード
            </h2>
            <p className={styles.deletePinLead}>
              4桁のPINコードを入力してください。
            </p>
            <div className={styles.deletePinDots} aria-label="入力状況">
              {Array.from({ length: 4 }).map((_, j) => (
                <span
                  key={j}
                  className={
                    deleteSitePin.length > j
                      ? styles.deletePinDotOn
                      : styles.deletePinDotOff
                  }
                />
              ))}
            </div>
            {deleteSitePinError && (
              <p className={styles.deletePinError} role="alert">
                {deleteSitePinError}
              </p>
            )}
            <div className={styles.deleteKeypad} role="group" aria-label="テンキー">
              {[
                "1",
                "2",
                "3",
                "4",
                "5",
                "6",
                "7",
                "8",
                "9",
                "enter",
                "0",
                "back",
              ].map((k) => {
                const isEnter = k === "enter";
                const isBack = k === "back";
                const label = isEnter ? "確定" : isBack ? "⌫" : k;
                const disabled = isEnter ? deleteSitePin.length !== 4 : false;
                return (
                  <button
                    key={k}
                    type="button"
                    className={
                      isEnter ? styles.deleteEnterBtn : styles.deleteKeyBtn
                    }
                    disabled={disabled}
                    onClick={() => {
                      setDeleteSitePinError(null);
                      if (isEnter) {
                        if (deleteSitePin.length !== 4) return;
                        if (deleteSitePin !== PIN_DELETE_SITE) {
                          setDeleteSitePinError("PINが違います");
                          setDeleteSitePin("");
                          return;
                        }
                        setDeleteSitePinOpen(false);
                        setDeleteSitePin("");
                        setDeleteSiteConfirmOpen(true);
                        return;
                      }
                      if (isBack) {
                        setDeleteSitePin((p) => p.slice(0, -1));
                        return;
                      }
                      setDeleteSitePin((p) =>
                        p.length >= 4 ? p : `${p}${k}`
                      );
                    }}
                    aria-label={
                      isEnter ? "確定" : isBack ? "1文字削除" : `数字${k}`
                    }
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div className={styles.deletePinFooter}>
              <button
                type="button"
                className={styles.deletePinCancelBtn}
                onClick={() => {
                  setDeleteSitePinOpen(false);
                  setDeleteSitePin("");
                  setDeleteSitePinError(null);
                }}
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteSiteConfirmOpen && (
        <div
          className={styles.deleteConfirmBackdrop}
          role="presentation"
          onClick={() => setDeleteSiteConfirmOpen(false)}
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="site-detail-delete-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="site-detail-delete-dialog-title"
              className={styles.modalTitle}
            >
              現場の削除
            </h2>
            <p className={styles.deleteModalText}>
              この現場を削除しますか？元に戻せません。
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalCancel}
                onClick={() => setDeleteSiteConfirmOpen(false)}
              >
                キャンセル
              </button>
              <button
                type="button"
                className={styles.modalDanger}
                onClick={() => {
                  purgeSiteData(safeSite.id);
                  setDeleteSiteConfirmOpen(false);
                  navigate("/");
                }}
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}

      {statusChangePinOpen && (
        <div
          className={styles.deletePinBackdrop}
          role="presentation"
          onClick={() => {
            setStatusChangePinOpen(false);
            setStatusChangePin("");
            setStatusChangePinError(null);
          }}
        >
          <div
            className={styles.deletePinCard}
            role="dialog"
            aria-modal="true"
            aria-labelledby="site-detail-status-pin-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="site-detail-status-pin-title"
              className={styles.deletePinTitle}
            >
              PINコード
            </h2>
            <p className={styles.deletePinLead}>
              ステータスを変更するには4桁のPINを入力してください。
            </p>
            <div className={styles.deletePinDots} aria-label="入力状況">
              {Array.from({ length: 4 }).map((_, j) => (
                <span
                  key={j}
                  className={
                    statusChangePin.length > j
                      ? styles.deletePinDotOn
                      : styles.deletePinDotOff
                  }
                />
              ))}
            </div>
            {statusChangePinError && (
              <p className={styles.deletePinError} role="alert">
                {statusChangePinError}
              </p>
            )}
            <div className={styles.deleteKeypad} role="group" aria-label="テンキー">
              {[
                "1",
                "2",
                "3",
                "4",
                "5",
                "6",
                "7",
                "8",
                "9",
                "enter",
                "0",
                "back",
              ].map((k) => {
                const isEnter = k === "enter";
                const isBack = k === "back";
                const label = isEnter ? "確定" : isBack ? "⌫" : k;
                const disabled = isEnter ? statusChangePin.length !== 4 : false;
                return (
                  <button
                    key={k}
                    type="button"
                    className={
                      isEnter ? styles.deleteEnterBtn : styles.deleteKeyBtn
                    }
                    disabled={disabled}
                    onClick={() => {
                      setStatusChangePinError(null);
                      if (isEnter) {
                        if (statusChangePin.length !== 4) return;
                        if (statusChangePin !== PIN_DELETE_SITE) {
                          setStatusChangePinError("PINが違います");
                          setStatusChangePin("");
                          return;
                        }
                        setStatusChangePinOpen(false);
                        setStatusChangePin("");
                        setStatusSelectOpen(true);
                        return;
                      }
                      if (isBack) {
                        setStatusChangePin((p) => p.slice(0, -1));
                        return;
                      }
                      setStatusChangePin((p) =>
                        p.length >= 4 ? p : `${p}${k}`
                      );
                    }}
                    aria-label={
                      isEnter ? "確定" : isBack ? "1文字削除" : `数字${k}`
                    }
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div className={styles.deletePinFooter}>
              <button
                type="button"
                className={styles.deletePinCancelBtn}
                onClick={() => {
                  setStatusChangePinOpen(false);
                  setStatusChangePin("");
                  setStatusChangePinError(null);
                }}
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {statusSelectOpen && (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onClick={() => setStatusSelectOpen(false)}
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="site-detail-status-select-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="site-detail-status-select-title"
              className={styles.modalTitle}
            >
              ステータスを変更
            </h2>
            <p className={styles.statusSelectLead}>
              一覧に表示するステータスを選びます。手動で選んだ内容は自動判定より優先されます。
            </p>
            <div
              className={styles.statusOptionGrid}
              role="group"
              aria-label="ステータス"
            >
              {SITE_DISPLAY_STATUS_OPTIONS.map((st) => (
                <button
                  key={st}
                  type="button"
                  className={styles.statusOptionBtn}
                  onClick={() => {
                    const cur = getSiteById(safeSite.id);
                    if (!cur) return;
                    updateSite({ ...cur, manualDisplayStatus: st });
                    refreshSiteFromStorage();
                    setStatusSelectOpen(false);
                  }}
                >
                  {st}
                </button>
              ))}
            </div>
            <div className={styles.statusSelectFooter}>
              <button
                type="button"
                className={styles.statusRevertBtn}
                onClick={() => {
                  const cur = getSiteById(safeSite.id);
                  if (!cur) return;
                  updateSite({ ...cur, manualDisplayStatus: undefined });
                  refreshSiteFromStorage();
                  setStatusSelectOpen(false);
                }}
              >
                自動判定に戻す
              </button>
              <button
                type="button"
                className={styles.modalCancel}
                onClick={() => setStatusSelectOpen(false)}
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

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
    </div>
  );
}
