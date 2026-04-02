import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { loadCompanyProfile } from "../lib/companyProfileStorage";
import {
  listKouseiConfirmedMonths,
  loadKouseiMonthList,
} from "../lib/kouseiListStorage";
import { loadKouseiAmount, saveKouseiAmount } from "../lib/kouseiAmountStorage";
import { sendEmailApi } from "../lib/sendEmailApi";
import { getSiteById, loadSites, normalizeEntranceDateKeys } from "../lib/siteStorage";
import type { Site } from "../types/site";
import { SiteMapView } from "../components/SiteMapView";
import { getEffectiveSiteDisplayStatus } from "../lib/siteStatus";
import { siteHasAnyWorkRecordOnDate } from "../lib/siteWorkRecordKeys";
import { todayLocalDateKey, tomorrowLocalDateKey } from "../lib/dateUtils";
import styles from "./ContractorAdminPage.module.css";
import siteListStyles from "./SiteListPage.module.css";

function formatYen(n: number): string {
  return `${Math.round(n).toLocaleString()}円`;
}

type MainTab = "sites" | "map" | "amount";
type SiteSubTab = "today" | "tomorrow" | "full";

function kouseiSites(sites: Site[]): Site[] {
  return sites.filter((s) => s.companyKind === "KOUSEI");
}

function siteMatchesTodayTab(site: Site, todayKey: string): boolean {
  if (normalizeEntranceDateKeys(site.entranceDateKeys).includes(todayKey)) {
    return true;
  }
  return siteHasAnyWorkRecordOnDate(site.id, todayKey);
}

/** KOUSEI一覧「明日」：入場日が明日の現場のみ */
function kouseiSiteMatchesTomorrowTab(site: Site, tomorrowKey: string): boolean {
  return normalizeEntranceDateKeys(site.entranceDateKeys).includes(tomorrowKey);
}

export function KouseiPage() {
  const profile = useMemo(() => loadCompanyProfile(), []);
  const [pin, setPin] = useState("");
  const [authed, setAuthed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [sites, setSites] = useState<Site[]>([]);
  const [mainTab, setMainTab] = useState<MainTab>("sites");
  const [siteSubTab, setSiteSubTab] = useState<SiteSubTab>("today");

  const reloadSites = useCallback(() => {
    setSites(loadSites());
  }, []);

  useEffect(() => {
    reloadSites();
  }, [reloadSites]);

  useEffect(() => {
    function onSaved() {
      reloadSites();
    }
    window.addEventListener("siteDataSaved", onSaved);
    window.addEventListener("siteDailyLaborSaved", onSaved);
    return () => {
      window.removeEventListener("siteDataSaved", onSaved);
      window.removeEventListener("siteDailyLaborSaved", onSaved);
    };
  }, [reloadSites]);

  const months = useMemo(() => listKouseiConfirmedMonths(), []);
  const [month, setMonth] = useState(months[0] ?? "");

  const monthList = useMemo(() => {
    if (!authed || !month) return null;
    const v = loadKouseiMonthList(month);
    return v.confirmed ? v : null;
  }, [authed, month]);

  const [draft, setDraft] = useState<Record<string, string>>({});

  const todayKey = useMemo(() => todayLocalDateKey(), []);
  const tomorrowKey = useMemo(() => tomorrowLocalDateKey(), []);

  const filteredKouseiList = useMemo(() => {
    const ks = kouseiSites(sites);
    if (siteSubTab === "today") {
      return ks.filter((s) => siteMatchesTodayTab(s, todayKey));
    }
    if (siteSubTab === "tomorrow") {
      return ks.filter((s) => kouseiSiteMatchesTomorrowTab(s, tomorrowKey));
    }
    return ks;
  }, [sites, siteSubTab, todayKey, tomorrowKey]);

  function onAuth(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (pin.trim() && pin.trim() === (profile.kouseiPin ?? "").trim()) {
      setAuthed(true);
      return;
    }
    setError("PINが違います。");
  }

  if (!authed) {
    return (
      <div>
        <div className={styles.pageHead}>
          <h1 className={styles.title}>KOUSEI</h1>
        </div>
        <div className={styles.panel}>
          <form onSubmit={onAuth} noValidate>
            <div className={styles.fieldRow}>
              <label className={styles.field}>
                <span className={styles.label}>PIN</span>
                <input
                  className={styles.input}
                  type="password"
                  inputMode="numeric"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  autoComplete="off"
                />
              </label>
              <button type="submit" className={styles.btn}>
                閲覧する
              </button>
            </div>
            {error && <p className={styles.danger}>{error}</p>}
          </form>
        </div>
      </div>
    );
  }

  const rows = monthList?.confirmedRows ?? [];
  const allAmountsFilled =
    rows.length > 0 &&
    rows.every((r) => {
      const k = `${r.siteId}__${r.workKind}__${r.dateKey}`;
      const raw = (draft[k] ?? "").trim();
      const n = raw ? Number(raw) : null;
      const after =
        raw && Number.isFinite(n as number) && (n as number) >= 0
          ? (n as number)
          : loadKouseiAmount({ month, rowKey: k });
      return typeof after === "number" && Number.isFinite(after) && after >= 0;
    });

  async function onPropose() {
    setError(null);
    setMessage(null);
    const adminEmail = (profile.adminEmail ?? "").trim();
    if (!adminEmail) {
      setError("事務員の通知先メールが未設定です（マスター設定→自社設定）。");
      return;
    }

    for (const r of rows) {
      const k = `${r.siteId}__${r.workKind}__${r.dateKey}`;
      const raw = (draft[k] ?? "").trim();
      if (!raw) continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) continue;
      saveKouseiAmount({ month, rowKey: k }, n);
    }
    setDraft({});

    const lines = rows.map((r) => {
      const k = `${r.siteId}__${r.workKind}__${r.dateKey}`;
      const amt = loadKouseiAmount({ month, rowKey: k });
      const amtText = amt === null ? "未確定" : formatYen(amt);
      const code = (r.siteCode ?? "").trim();
      const client = (r.clientName ?? "").trim();
      return `${code || "—"} / ${r.dateKey} / ${r.siteName} / ${client || "—"} / ${r.workKind} / ${r.peopleCount}人 / ${amtText}`;
    });

    await sendEmailApi({
      to: [adminEmail],
      subject: `KOUSEIより${month}分の金額提案が届きました`,
      text: `KOUSEIより${month}分の金額提案が届きました。\n\n${lines.join("\n")}\n`,
    });

    setMessage("送信しました。");
  }

  return (
    <div>
      <div className={styles.pageHead}>
        <h1 className={styles.title}>KOUSEI</h1>
      </div>

      <div className={siteListStyles.tabs} role="tablist" aria-label="KOUSEIメニュー">
        <button
          type="button"
          role="tab"
          aria-selected={mainTab === "sites"}
          className={mainTab === "sites" ? siteListStyles.tabActive : siteListStyles.tab}
          onClick={() => setMainTab("sites")}
        >
          現場
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mainTab === "map"}
          className={mainTab === "map" ? siteListStyles.tabActive : siteListStyles.tab}
          onClick={() => setMainTab("map")}
        >
          地図
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mainTab === "amount"}
          className={mainTab === "amount" ? siteListStyles.tabActive : siteListStyles.tab}
          onClick={() => setMainTab("amount")}
        >
          金額
        </button>
      </div>

      {mainTab === "sites" && (
        <div className={styles.panel}>
          <div className={siteListStyles.tabs} role="tablist" aria-label="現場一覧の表示">
            <button
              type="button"
              role="tab"
              aria-selected={siteSubTab === "today"}
              className={
                siteSubTab === "today" ? siteListStyles.tabActive : siteListStyles.tab
              }
              onClick={() => setSiteSubTab("today")}
            >
              今日
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={siteSubTab === "tomorrow"}
              className={
                siteSubTab === "tomorrow"
                  ? siteListStyles.tabActive
                  : siteListStyles.tab
              }
              onClick={() => setSiteSubTab("tomorrow")}
            >
              明日
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={siteSubTab === "full"}
              className={
                siteSubTab === "full" ? siteListStyles.tabActive : siteListStyles.tab
              }
              onClick={() => setSiteSubTab("full")}
            >
              一覧
            </button>
          </div>

          {kouseiSites(sites).length === 0 ? (
            <p className={styles.muted}>KOUSEIの現場がまだありません。</p>
          ) : filteredKouseiList.length === 0 ? (
            <p className={styles.muted} role="status">
              {siteSubTab === "today"
                ? "今日の入場または本日の作業記録があるKOUSEI現場はありません"
                : siteSubTab === "tomorrow"
                  ? "明日が入場日のKOUSEI現場はありません"
                  : "該当する現場がありません"}
            </p>
          ) : (
            <ul className={siteListStyles.list}>
              {filteredKouseiList.map((site) => {
                const status = getEffectiveSiteDisplayStatus(site);
                const badgeClass =
                  status === "入場前"
                    ? siteListStyles.statusPre
                    : status === "組立中"
                      ? siteListStyles.statusAssembly
                      : status === "設置中"
                        ? siteListStyles.statusActive
                        : status === "解体中"
                          ? siteListStyles.statusDismantle
                          : siteListStyles.statusEnded;
                return (
                  <li key={site.id} className={siteListStyles.cardItem}>
                    <div className={siteListStyles.cardRow}>
                      <Link
                        to={`/sites/${site.id}`}
                        className={siteListStyles.cardRowLink}
                      >
                        <span className={siteListStyles.siteName}>
                          {site.name || "（現場名未設定）"}
                        </span>
                        <span className={siteListStyles.siteClient}>
                          {site.clientName?.trim() || "—"}
                        </span>
                      </Link>
                      <div className={siteListStyles.cardRowRight}>
                        <span
                          className={`${siteListStyles.statusBadge} ${badgeClass}`}
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
        </div>
      )}

      {mainTab === "map" && (
        <div className={styles.panel}>
          <SiteMapView sites={sites} companyKindFilter="KOUSEI" />
        </div>
      )}

      {mainTab === "amount" && (
        <div className={styles.panel}>
          {!month ? (
            <p className={styles.muted}>確定済みの一覧がありません。</p>
          ) : (
            <>
              <div className={styles.fieldRow}>
                <label className={styles.field}>
                  <span className={styles.label}>対象月</span>
                  <select
                    className={styles.select}
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                  >
                    {months.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className={styles.btn}
                  disabled={!allAmountsFilled}
                  onClick={() => void onPropose()}
                >
                  金額を提案する
                </button>
              </div>

              {error && <p className={styles.danger}>{error}</p>}
              {message && <p className={styles.muted}>{message}</p>}

              {rows.length === 0 ? (
                <p className={styles.muted}>該当なし</p>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>現場コード</th>
                      <th>日付</th>
                      <th>現場名</th>
                      <th>元請け名</th>
                      <th>作業種別</th>
                      <th>人数</th>
                      <th>金額</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const k = `${r.siteId}__${r.workKind}__${r.dateKey}`;
                      const site = getSiteById(r.siteId);
                      const code = (r.siteCode ?? site?.siteCode ?? "").trim();
                      const client = (r.clientName ?? site?.clientName ?? "").trim();
                      const saved = loadKouseiAmount({ month, rowKey: k });
                      const value =
                        draft[k] !== undefined
                          ? draft[k]
                          : saved === null
                            ? ""
                            : String(saved);
                      return (
                        <tr key={k}>
                          <td>{code || "—"}</td>
                          <td>{r.dateKey}</td>
                          <td>{r.siteName}</td>
                          <td>{client || "—"}</td>
                          <td>{r.workKind}</td>
                          <td>{r.peopleCount}</td>
                          <td>
                            <input
                              className={styles.amountInput}
                              type="number"
                              min={0}
                              step={1}
                              value={value}
                              onChange={(e) =>
                                setDraft((p) => ({ ...p, [k]: e.target.value }))
                              }
                              placeholder="未確定"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
