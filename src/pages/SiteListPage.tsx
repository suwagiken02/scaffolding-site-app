import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Site } from "../types/site";
import { loadSites, normalizeEntranceDateKeys } from "../lib/siteStorage";
import { SiteMapView } from "../components/SiteMapView";
import { loadDailyLaborMap } from "../lib/siteDailyLaborStorage";
import { getEffectiveSiteDisplayStatus } from "../lib/siteStatus";
import { siteHasAnyWorkRecordOnDate } from "../lib/siteWorkRecordKeys";
import { todayLocalDateKey, tomorrowLocalDateKey } from "../lib/dateUtils";
import { siteNeedsRemovalFollowUpWarning } from "../lib/siteRemovalFollowUpWarning";
import { WORK_KINDS } from "../types/workKind";
import { loadContractorMasters } from "../lib/contractorMasterStorage";
import styles from "./SiteListPage.module.css";

/** 今日・明日・一覧はリスト表示、地図はマップ */
type MainTab = "today" | "tomorrow" | "full" | "map";

type SortOption =
  | "start_desc"
  | "start_asc"
  | "name_asc"
  | "client_asc"
  | "contractor_asc";

const SORT_CHOICES: { value: SortOption; label: string }[] = [
  { value: "start_desc", label: "開始日（新しい順）" },
  { value: "start_asc", label: "開始日（古い順）" },
  { value: "name_asc", label: "現場名（あいうえお順）" },
  { value: "client_asc", label: "元請け名（あいうえお順）" },
  { value: "contractor_asc", label: "請負会社名（あいうえお順）" },
];

const jaCollator = new Intl.Collator("ja");

function siteMatchesSearch(site: Site, q: string): boolean {
  if (!q) return true;
  const hay = [
    site.name,
    site.clientName,
    site.foremanName,
    site.siteTypeName,
  ]
    .join("\n")
    .toLowerCase();
  return hay.includes(q);
}

function getLatestContractorCompanyName(siteId: string): string {
  let bestDate = "";
  let bestName = "";
  for (const k of WORK_KINDS) {
    const map = loadDailyLaborMap(siteId, k);
    for (const r of Object.values(map)) {
      const name = (r.contractorCompanyName ?? "").trim();
      if (!name) continue;
      if (r.dateKey.localeCompare(bestDate) > 0) {
        bestDate = r.dateKey;
        bestName = name;
      }
    }
  }
  return bestName;
}

function sortSites(list: Site[], sort: SortOption): Site[] {
  const out = [...list];
  switch (sort) {
    case "start_desc":
      return out.sort((a, b) => b.startDate.localeCompare(a.startDate));
    case "start_asc":
      return out.sort((a, b) => a.startDate.localeCompare(b.startDate));
    case "name_asc":
      return out.sort((a, b) => jaCollator.compare(a.name, b.name));
    case "client_asc":
      return out.sort((a, b) =>
        jaCollator.compare(a.clientName || "", b.clientName || "")
      );
    case "contractor_asc":
      return out.sort((a, b) =>
        jaCollator.compare(
          getLatestContractorCompanyName(a.id),
          getLatestContractorCompanyName(b.id)
        )
      );
    default:
      return out;
  }
}

type SiteStatus =
  | "入場前"
  | "組立中"
  | "設置中"
  | "解体中"
  | "撤去済";
type StatusFilter = "all" | SiteStatus;

function computeSiteStatus(site: Site): SiteStatus {
  return getEffectiveSiteDisplayStatus(site);
}

function siteMatchesTodayTab(site: Site, todayKey: string): boolean {
  if (normalizeEntranceDateKeys(site.entranceDateKeys).includes(todayKey)) {
    return true;
  }
  return siteHasAnyWorkRecordOnDate(site.id, todayKey);
}

function siteMatchesTomorrowTab(site: Site, tomorrowKey: string): boolean {
  if (normalizeEntranceDateKeys(site.entranceDateKeys).includes(tomorrowKey)) {
    return true;
  }
  return siteHasAnyWorkRecordOnDate(site.id, tomorrowKey);
}

export function SiteListPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [mainTab, setMainTab] = useState<MainTab>("today");
  const [sortBy, setSortBy] = useState<SortOption>("start_desc");
  const [searchText, setSearchText] = useState("");
  const [workRevision, setWorkRevision] = useState(0);
  const [photoRevision, setPhotoRevision] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [contractorFilter, setContractorFilter] = useState<string>("");

  const contractors = useMemo(() => loadContractorMasters(), []);

  const reloadSites = useCallback(() => {
    setSites(loadSites());
  }, []);

  useEffect(() => {
    reloadSites();
  }, [reloadSites]);

  useEffect(() => {
    function onSiteDataSaved() {
      reloadSites();
    }
    window.addEventListener("siteDataSaved", onSiteDataSaved);
    return () => window.removeEventListener("siteDataSaved", onSiteDataSaved);
  }, [reloadSites]);

  useEffect(() => {
    function bump() {
      setWorkRevision((r) => r + 1);
    }
    window.addEventListener("siteDailyLaborSaved", bump);
    return () => window.removeEventListener("siteDailyLaborSaved", bump);
  }, []);

  useEffect(() => {
    function bump() {
      setPhotoRevision((r) => r + 1);
    }
    window.addEventListener("siteWorkPhotosChanged", bump);
    return () => window.removeEventListener("siteWorkPhotosChanged", bump);
  }, []);

  const contractorChoices = useMemo(() => {
    const set = new Set<string>();
    for (const s of sites) {
      const n = getLatestContractorCompanyName(s.id).trim();
      if (n) set.add(n);
    }
    for (const m of contractors) {
      const n = m.name.trim();
      if (n) set.add(n);
    }
    return [...set].sort((a, b) => jaCollator.compare(a, b));
  }, [sites, contractors, workRevision]);

  const listForDisplay = useMemo(() => {
    const todayKey = todayLocalDateKey();
    const tomorrowKey = tomorrowLocalDateKey();
    let scopeSites = sites;
    if (mainTab === "today") {
      scopeSites = sites.filter((s) => siteMatchesTodayTab(s, todayKey));
    } else if (mainTab === "tomorrow") {
      scopeSites = sites.filter((s) => siteMatchesTomorrowTab(s, tomorrowKey));
    }
    const q = searchText.trim().toLowerCase();
    const filtered = scopeSites.filter((s) => siteMatchesSearch(s, q));
    const statusFiltered =
      statusFilter === "all"
        ? filtered
        : filtered.filter((s) => computeSiteStatus(s) === statusFilter);
    const contractorFiltered = contractorFilter.trim()
      ? statusFiltered.filter(
          (s) => getLatestContractorCompanyName(s.id) === contractorFilter.trim()
        )
      : statusFiltered;
    const sorted = sortSites(contractorFiltered, sortBy);
    const pendingExternal = sorted.filter((s) => s.externalUnconfirmed === true);
    const rest = sorted.filter((s) => s.externalUnconfirmed !== true);
    const active: Site[] = [];
    const ended: Site[] = [];
    for (const s of rest) {
      (computeSiteStatus(s) === "撤去済" ? ended : active).push(s);
    }
    const activeWarn = active.filter((s) => siteNeedsRemovalFollowUpWarning(s));
    const activeOk = active.filter((s) => !siteNeedsRemovalFollowUpWarning(s));
    return [
      ...sortSites(pendingExternal, sortBy),
      ...sortSites(activeWarn, sortBy),
      ...sortSites(activeOk, sortBy),
      ...ended,
    ];
  }, [
    sites,
    mainTab,
    searchText,
    sortBy,
    statusFilter,
    contractorFilter,
    workRevision,
    photoRevision,
  ]);

  return (
    <div>
      <div className={styles.head}>
        <h1 className={styles.title}>現場一覧</h1>
        <Link to="/sites/new" className={styles.primaryBtn}>
          新規登録
        </Link>
      </div>

      <div className={styles.tabs} role="tablist" aria-label="表示の切り替え">
        <button
          type="button"
          role="tab"
          id="tab-today"
          aria-selected={mainTab === "today"}
          aria-controls="panel-list"
          className={mainTab === "today" ? styles.tabActive : styles.tab}
          onClick={() => setMainTab("today")}
        >
          今日
        </button>
        <button
          type="button"
          role="tab"
          id="tab-tomorrow"
          aria-selected={mainTab === "tomorrow"}
          aria-controls="panel-list"
          className={mainTab === "tomorrow" ? styles.tabActive : styles.tab}
          onClick={() => setMainTab("tomorrow")}
        >
          明日
        </button>
        <button
          type="button"
          role="tab"
          id="tab-full"
          aria-selected={mainTab === "full"}
          aria-controls="panel-list"
          className={mainTab === "full" ? styles.tabActive : styles.tab}
          onClick={() => setMainTab("full")}
        >
          一覧
        </button>
        <button
          type="button"
          role="tab"
          id="tab-map"
          aria-selected={mainTab === "map"}
          aria-controls="panel-map"
          className={mainTab === "map" ? styles.tabActive : styles.tab}
          onClick={() => setMainTab("map")}
        >
          地図
        </button>
      </div>

      {mainTab !== "map" && (
        <div
          id="panel-list"
          role="tabpanel"
          aria-labelledby={
            mainTab === "today"
              ? "tab-today"
              : mainTab === "tomorrow"
                ? "tab-tomorrow"
                : "tab-full"
          }
        >
          {sites.length === 0 ? (
            <div className={styles.empty}>
              <p className={styles.emptyText}>
                登録された現場はまだありません。
              </p>
              <Link to="/sites/new" className={styles.primaryBtn}>
                最初の現場を登録する
              </Link>
            </div>
          ) : (
            <>
              <div className={styles.listToolbar}>
                <div className={styles.toolbarSortStatusGroup}>
                  <label className={styles.toolbarField}>
                    <span className={styles.toolbarLabel}>並び替え</span>
                    <select
                      className={styles.sortSelect}
                      value={sortBy}
                      onChange={(e) =>
                        setSortBy(e.target.value as SortOption)
                      }
                      aria-label="一覧の並び替え"
                    >
                      {SORT_CHOICES.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.toolbarField}>
                    <span className={styles.toolbarLabel}>ステータス</span>
                    <select
                      className={styles.sortSelect}
                      value={statusFilter}
                      onChange={(e) =>
                        setStatusFilter(e.target.value as StatusFilter)
                      }
                      aria-label="ステータスで絞り込み"
                    >
                      <option value="all">すべて</option>
                      <option value="入場前">入場前</option>
                      <option value="組立中">組立中</option>
                      <option value="設置中">設置中</option>
                      <option value="解体中">解体中</option>
                      <option value="撤去済">撤去済</option>
                    </select>
                  </label>
                </div>
                <label className={styles.toolbarFieldGrow}>
                  <span className={styles.toolbarLabel}>検索</span>
                  <input
                    type="search"
                    className={styles.searchInput}
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="現場名・元請け・職長・種別"
                    autoComplete="off"
                    aria-label="現場をキーワードで検索"
                  />
                </label>
                <label className={styles.toolbarField}>
                  <span className={styles.toolbarLabel}>請負会社</span>
                  <select
                    className={styles.sortSelect}
                    value={contractorFilter}
                    onChange={(e) => setContractorFilter(e.target.value)}
                    aria-label="請負会社名で絞り込み"
                  >
                    <option value="">すべて</option>
                    {contractorChoices.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {listForDisplay.length === 0 ? (
                <p className={styles.noHits} role="status">
                  {mainTab === "today"
                    ? "今日の入場または本日の作業記録がある現場はありません"
                    : mainTab === "tomorrow"
                      ? "明日の入場または明日の作業記録がある現場はありません"
                      : "該当する現場が見つかりません"}
                </p>
              ) : (
            <ul className={styles.list}>
              {listForDisplay.map((site) => {
                const status = computeSiteStatus(site);
                const needsWarn = siteNeedsRemovalFollowUpWarning(site);
                const badgeClass =
                  status === "入場前"
                    ? styles.statusPre
                    : status === "組立中"
                      ? styles.statusAssembly
                      : status === "設置中"
                        ? styles.statusActive
                        : status === "解体中"
                          ? styles.statusDismantle
                          : styles.statusEnded;
                return (
                  <li key={site.id} className={styles.cardItem}>
                    <div className={styles.cardRow}>
                      <Link
                        to={`/sites/${site.id}`}
                        className={styles.cardRowLink}
                      >
                        <span className={styles.siteName}>
                          {site.name || "（現場名未設定）"}
                        </span>
                        <span className={styles.siteClient}>
                          {site.clientName?.trim() || "—"}
                        </span>
                      </Link>
                      <div className={styles.cardRowRight}>
                        {needsWarn && (
                          <span
                            className={`${styles.statusBadge} ${styles.warnBadge}`}
                            aria-label="要確認"
                          >
                            要確認
                          </span>
                        )}
                        {site.externalUnconfirmed === true && (
                          <span
                            className={`${styles.statusBadge} ${styles.externalConfirmBadge}`}
                            aria-label="外部登録の確認待ち"
                          >
                            要確認
                            {site.externalCompanyName?.trim()
                              ? `（${site.externalCompanyName.trim()}）`
                              : site.externalCompanyKey
                                ? `（${site.externalCompanyKey}）`
                                : ""}
                          </span>
                        )}
                        <span
                          className={`${styles.statusBadge} ${badgeClass}`}
                          aria-label={`ステータス: ${status}`}
                        >
                          {status}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
              )}
            </>
          )}
        </div>
      )}

      {mainTab === "map" && (
        <div
          id="panel-map"
          role="tabpanel"
          aria-labelledby="tab-map"
        >
          <SiteMapView sites={sites} />
        </div>
      )}

    </div>
  );
}
