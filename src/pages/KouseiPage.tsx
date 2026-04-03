import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { loadCompanyProfile } from "../lib/companyProfileStorage";
import {
  listKouseiConfirmedMonths,
  loadKouseiMonthList,
} from "../lib/kouseiListStorage";
import { loadKouseiAmount, saveKouseiAmount } from "../lib/kouseiAmountStorage";
import {
  fetchKouseiBillingRecords,
  kouseiBillingRowKey,
  migrateKouseiBillingRow,
  putKouseiBillingUpdate,
  type KouseiBillingRecord,
  type KouseiBillingRow,
} from "../lib/kouseiBillingStorage";
import {
  effectiveAmount40,
  effectiveAmount60,
  effectiveAmount70,
  formatYenOrDash,
} from "../lib/kouseiBillingDerived";
import { KouseiBillingAmountFields } from "../components/KouseiBillingAmountFields";
import { sendEmailApi } from "../lib/sendEmailApi";
import { getSiteById, loadSites, normalizeEntranceDateKeys } from "../lib/siteStorage";
import type { Site } from "../types/site";
import { SiteMapView } from "../components/SiteMapView";
import { getEffectiveSiteDisplayStatus } from "../lib/siteStatus";
import { siteHasAnyWorkRecordOnDate } from "../lib/siteWorkRecordKeys";
import {
  todayLocalDateKey,
  tomorrowLocalDateKey,
} from "../lib/dateUtils";

function toMonthValue(dateKey: string): string {
  return dateKey.slice(0, 7);
}
import styles from "./ContractorAdminPage.module.css";
import siteListStyles from "./SiteListPage.module.css";

function formatYen(n: number): string {
  return `${Math.round(n).toLocaleString()}円`;
}

/** 今日 | 明日 | 一覧 | 地図 | 請求確認 | 金額 — デフォルトは「今日」 */
type MainTab =
  | "today"
  | "tomorrow"
  | "full"
  | "map"
  | "billing"
  | "amount";

function kouseiSites(sites: Site[]): Site[] {
  return sites.filter((s) => s.companyKind === "KOUSEI");
}

function siteMatchesTodayTab(site: Site, todayKey: string): boolean {
  if (normalizeEntranceDateKeys(site.entranceDateKeys).includes(todayKey)) {
    return true;
  }
  return siteHasAnyWorkRecordOnDate(site.id, todayKey);
}

function siteMatchesTomorrowEntranceOnly(
  site: Site,
  tomorrowKey: string
): boolean {
  return normalizeEntranceDateKeys(site.entranceDateKeys).includes(tomorrowKey);
}

export function KouseiPage() {
  const profile = useMemo(() => loadCompanyProfile(), []);
  const [pin, setPin] = useState("");
  const [authed, setAuthed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [sites, setSites] = useState<Site[]>([]);
  const [mainTab, setMainTab] = useState<MainTab>("today");

  const todayKey = useMemo(() => todayLocalDateKey(), []);
  const tomorrowKey = useMemo(() => tomorrowLocalDateKey(), []);

  const [billingRecords, setBillingRecords] = useState<KouseiBillingRecord[]>(
    []
  );
  const [billingMonth, setBillingMonth] = useState(() =>
    toMonthValue(todayLocalDateKey())
  );
  /** レコードIDごとの編集中行（保存前） */
  const [localRowsById, setLocalRowsById] = useState<
    Record<string, KouseiBillingRow[]>
  >({});
  const [billingError, setBillingError] = useState<string | null>(null);
  const [billingMessage, setBillingMessage] = useState<string | null>(null);
  const [billingSavingId, setBillingSavingId] = useState<string | null>(null);

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

  const loadBillingRecords = useCallback(async () => {
    try {
      setBillingError(null);
      const list = await fetchKouseiBillingRecords();
      setBillingRecords(list);
    } catch (e) {
      setBillingError(
        e instanceof Error ? e.message : "請求データの取得に失敗しました"
      );
      setBillingRecords([]);
    }
  }, []);

  useEffect(() => {
    if (!authed || mainTab !== "billing") return;
    void loadBillingRecords();
  }, [authed, mainTab, loadBillingRecords]);

  useEffect(() => {
    setLocalRowsById((prev) => {
      const next = { ...prev };
      for (const r of billingRecords) {
        next[r.id] = r.rows.map((row) =>
          migrateKouseiBillingRow(
            row as KouseiBillingRow & { amount?: number | null }
          )
        );
      }
      return next;
    });
  }, [billingRecords]);

  const billingRecordsForMonth = useMemo(() => {
    return billingRecords
      .filter((r) => r.month === billingMonth)
      .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  }, [billingRecords, billingMonth]);

  const billingMonthOptions = useMemo(() => {
    const s = new Set(billingRecords.map((r) => r.month));
    s.add(toMonthValue(todayKey));
    return [...s].sort((a, b) => b.localeCompare(a));
  }, [billingRecords, todayKey]);

  const months = useMemo(() => listKouseiConfirmedMonths(), []);
  const [month, setMonth] = useState(months[0] ?? "");

  const monthList = useMemo(() => {
    if (!authed || !month) return null;
    const v = loadKouseiMonthList(month);
    return v.confirmed ? v : null;
  }, [authed, month]);

  const [draft, setDraft] = useState<Record<string, string>>({});

  const filteredKouseiList = useMemo(() => {
    const ks = kouseiSites(sites);
    if (mainTab === "today") {
      return ks.filter((s) => siteMatchesTodayTab(s, todayKey));
    }
    if (mainTab === "tomorrow") {
      return ks.filter((s) => siteMatchesTomorrowEntranceOnly(s, tomorrowKey));
    }
    if (mainTab === "full") {
      return ks;
    }
    return [];
  }, [sites, mainTab, todayKey, tomorrowKey]);

  function updateBillingRow(
    recordId: string,
    rowKey: string,
    patch: Partial<
      Pick<
        KouseiBillingRow,
        | "contractAmount"
        | "amount70"
        | "amount60"
        | "amount40"
        | "monthlyPayment"
        | "memo"
      >
    >
  ) {
    setLocalRowsById((prev) => {
      const rows = prev[recordId];
      if (!rows) return prev;
      return {
        ...prev,
        [recordId]: rows.map((row) =>
          kouseiBillingRowKey(row) === rowKey ? { ...row, ...patch } : row
        ),
      };
    });
  }

  function billingRowsAllAmountsFilled(rows: KouseiBillingRow[]): boolean {
    if (rows.length === 0) return false;
    return rows.every((r) => {
      const c = r.contractAmount;
      const m = r.monthlyPayment;
      if (
        c === null ||
        !Number.isFinite(c) ||
        c < 0 ||
        m === null ||
        !Number.isFinite(m) ||
        m < 0
      ) {
        return false;
      }
      const e70 = effectiveAmount70(r);
      const e60 = effectiveAmount60(r);
      const e40 = effectiveAmount40(r);
      return (
        e70 !== null &&
        Number.isFinite(e70) &&
        e60 !== null &&
        Number.isFinite(e60) &&
        e40 !== null &&
        Number.isFinite(e40)
      );
    });
  }

  async function notifySuwaAfterSave(
    month: string,
    rows: KouseiBillingRow[]
  ) {
    const to = (profile.notificationEmail ?? "").trim();
    if (!to) return;
    const [y, mm] = month.split("-");
    const lines = rows.map((r) => {
      const parts = [
        `契約:${formatYenOrDash(r.contractAmount)}`,
        `請70%:${formatYenOrDash(effectiveAmount70(r))}`,
        `架60%:${formatYenOrDash(effectiveAmount60(r))}`,
        `払40%:${formatYenOrDash(effectiveAmount40(r))}`,
        `月払:${formatYenOrDash(r.monthlyPayment)}`,
      ];
      return `${r.siteName} / ${parts.join(" ")} / ${(r.memo ?? "").trim() || "—"}`;
    });
    await sendEmailApi({
      to: [to],
      subject: `【KOUSEI請求確認】${y}年${mm}月分 金額が更新されました`,
      text: `${y}年${mm}月分の金額が更新されました。\n\n${lines.join("\n")}\n`,
    });
  }

  async function onBillingSave(recordId: string) {
    const rows = localRowsById[recordId];
    if (!rows?.length) return;
    setBillingError(null);
    setBillingMessage(null);
    setBillingSavingId(recordId);
    try {
      const rec = billingRecords.find((r) => r.id === recordId);
      const updated = await putKouseiBillingUpdate(recordId, { rows });
      setBillingRecords((prev) =>
        prev.map((r) => (r.id === updated.id ? updated : r))
      );
      setBillingMessage("保存しました。");
      if (rec) {
        await notifySuwaAfterSave(rec.month, rows);
      }
    } catch (e) {
      setBillingError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setBillingSavingId(null);
    }
  }

  async function onBillingConfirm(recordId: string) {
    const rows = localRowsById[recordId];
    if (!rows?.length) return;
    if (!billingRowsAllAmountsFilled(rows)) {
      setBillingError("すべての行に金額を入力してください。");
      return;
    }
    setBillingError(null);
    setBillingMessage(null);
    setBillingSavingId(recordId);
    try {
      const rec = billingRecords.find((r) => r.id === recordId);
      const updated = await putKouseiBillingUpdate(recordId, {
        rows,
        status: "confirmed",
      });
      setBillingRecords((prev) =>
        prev.map((r) => (r.id === updated.id ? updated : r))
      );
      setBillingMessage("確認済みにしました。");
      if (rec) {
        await notifySuwaAfterSave(rec.month, rows);
      }
    } catch (e) {
      setBillingError(
        e instanceof Error ? e.message : "確認済みの更新に失敗しました"
      );
    } finally {
      setBillingSavingId(null);
    }
  }

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

  const listTabActive =
    mainTab === "today" || mainTab === "tomorrow" || mainTab === "full";

  return (
    <div>
      <div className={styles.pageHead}>
        <h1 className={styles.title}>KOUSEI</h1>
      </div>

      <div
        className={siteListStyles.tabs}
        role="tablist"
        aria-label="KOUSEIの表示"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mainTab === "today"}
          className={
            mainTab === "today" ? siteListStyles.tabActive : siteListStyles.tab
          }
          onClick={() => setMainTab("today")}
        >
          今日
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mainTab === "tomorrow"}
          className={
            mainTab === "tomorrow"
              ? siteListStyles.tabActive
              : siteListStyles.tab
          }
          onClick={() => setMainTab("tomorrow")}
        >
          明日
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mainTab === "full"}
          className={
            mainTab === "full" ? siteListStyles.tabActive : siteListStyles.tab
          }
          onClick={() => setMainTab("full")}
        >
          一覧
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mainTab === "map"}
          className={
            mainTab === "map" ? siteListStyles.tabActive : siteListStyles.tab
          }
          onClick={() => setMainTab("map")}
        >
          地図
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mainTab === "billing"}
          className={
            mainTab === "billing"
              ? siteListStyles.tabActive
              : siteListStyles.tab
          }
          onClick={() => setMainTab("billing")}
        >
          請求確認
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mainTab === "amount"}
          className={
            mainTab === "amount"
              ? siteListStyles.tabActive
              : siteListStyles.tab
          }
          onClick={() => setMainTab("amount")}
        >
          金額
        </button>
      </div>

      {listTabActive && (
        <div className={styles.panel}>
          {kouseiSites(sites).length === 0 ? (
            <p className={styles.muted}>KOUSEIの現場がまだありません。</p>
          ) : filteredKouseiList.length === 0 ? (
            <p className={styles.muted} role="status">
              {mainTab === "today"
                ? "今日の入場または本日の作業記録があるKOUSEI現場はありません"
                : mainTab === "tomorrow"
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
                    <Link
                      to={`/sites/${site.id}`}
                      className={siteListStyles.cardRow}
                    >
                      <span className={siteListStyles.siteName}>
                        {site.name || "（現場名未設定）"}
                      </span>
                      <span className={siteListStyles.siteClient}>
                        {site.clientName?.trim() || "—"}
                      </span>
                      <div className={siteListStyles.cardRowRight}>
                        <span
                          className={`${siteListStyles.statusBadge} ${badgeClass}`}
                          aria-label={`ステータス: ${status}`}
                        >
                          {status}
                        </span>
                      </div>
                    </Link>
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

      {mainTab === "billing" && (
        <div className={styles.panel}>
          <div className={styles.fieldRow}>
            <label className={styles.field}>
              <span className={styles.label}>対象月</span>
              <select
                className={styles.select}
                value={billingMonth}
                onChange={(e) => setBillingMonth(e.target.value)}
              >
                {billingMonthOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {billingError && <p className={styles.danger}>{billingError}</p>}
          {billingMessage && (
            <p className={styles.muted}>{billingMessage}</p>
          )}
          {billingRecordsForMonth.length === 0 ? (
            <p className={styles.muted}>
              この月の請求データはまだありません。
            </p>
          ) : (
            <>
              {billingRecordsForMonth.map((rec) => {
                const rows = localRowsById[rec.id] ?? rec.rows;
                const busy = billingSavingId === rec.id;
                const readOnly = rec.status === "confirmed";
                const canConfirm =
                  !readOnly && billingRowsAllAmountsFilled(rows);
                return (
                  <div
                    key={rec.id}
                    style={{
                      marginTop: "1.25rem",
                      paddingTop: "1rem",
                      borderTop: "1px solid var(--border)",
                    }}
                  >
                    <p className={styles.muted}>
                      送信: {rec.sentAt} / 締め日: {rec.dateRangeEnd} /{" "}
                      {rec.status === "confirmed" ? "確認済み" : "未確認"}
                    </p>
                    <div className={styles.fieldRow}>
                      {!readOnly && (
                        <>
                          <button
                            type="button"
                            className={styles.btn}
                            disabled={busy}
                            onClick={() => void onBillingSave(rec.id)}
                          >
                            {busy ? "保存中…" : "保存"}
                          </button>
                          {canConfirm && (
                            <button
                              type="button"
                              className={styles.btn}
                              disabled={busy}
                              onClick={() => void onBillingConfirm(rec.id)}
                            >
                              {busy ? "処理中…" : "確認済みにする"}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                    <div className={styles.kouseiAdminTableWrap}>
                      <table
                        className={`${styles.table} ${styles.kouseiBillingKouseiTable}`}
                      >
                        <thead>
                          <tr>
                            <th>日付</th>
                            <th>現場名</th>
                            <th>元請け名</th>
                            <th>作業種別</th>
                            <th>人数</th>
                            <th>金額（5項目）</th>
                            <th>メモ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r) => {
                            const rk = kouseiBillingRowKey(r);
                            return (
                              <tr key={rk}>
                                <td>{r.dateKey}</td>
                                <td>{r.siteName}</td>
                                <td>{r.clientName || "—"}</td>
                                <td>{r.workKind}</td>
                                <td>{r.peopleCount}</td>
                                <td className={styles.kouseiBillingCellAmount}>
                                  {readOnly ? (
                                    <div className={styles.kouseiBillingSummary}>
                                      <div>
                                        契約 {formatYenOrDash(r.contractAmount)}
                                      </div>
                                      <div>
                                        請70%{" "}
                                        {formatYenOrDash(effectiveAmount70(r))}
                                      </div>
                                      <div>
                                        架60%{" "}
                                        {formatYenOrDash(effectiveAmount60(r))}
                                      </div>
                                      <div>
                                        払40%{" "}
                                        {formatYenOrDash(effectiveAmount40(r))}
                                      </div>
                                      <div>
                                        月払{" "}
                                        {formatYenOrDash(r.monthlyPayment)}
                                      </div>
                                    </div>
                                  ) : (
                                    <KouseiBillingAmountFields
                                      compact
                                      row={r}
                                      onPatch={(p) =>
                                        updateBillingRow(rec.id, rk, p)
                                      }
                                    />
                                  )}
                                </td>
                                <td>
                                  {readOnly ? (
                                    r.memo || "—"
                                  ) : (
                                    <input
                                      className={styles.input}
                                      type="text"
                                      value={r.memo}
                                      onChange={(e) =>
                                        updateBillingRow(rec.id, rk, {
                                          memo: e.target.value,
                                        })
                                      }
                                      placeholder="メモ"
                                    />
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </>
          )}
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
