import {
  FormEvent,
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { loadSites } from "../lib/siteStorage";
import { loadDailyLaborMap } from "../lib/siteDailyLaborStorage";
import { WORK_KINDS } from "../types/workKind";
import type { CompanyKind } from "../types/site";
import { todayLocalDateKey } from "../lib/dateUtils";
import {
  fetchKouseiBillingRecords,
  migrateKouseiBillingRow,
  postKouseiBillingSend,
  putKouseiBillingUpdate,
  kouseiBillingRowKey,
  type KouseiBillingRecord,
  type KouseiBillingRow,
} from "../lib/kouseiBillingStorage";
import { formatYenOrDash } from "../lib/kouseiBillingDerived";
import { KouseiBillingAmountFields } from "../components/KouseiBillingAmountFields";
import styles from "./ContractorAdminPage.module.css";

function toMonthValue(dateKey: string): string {
  return dateKey.slice(0, 7);
}

/** 月初〜「現在」までの締め日（当月は今日、過去月は月末） */
function monthRangeEnd(month: string, todayKey: string): string | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const todayMonth = todayKey.slice(0, 7);
  if (month > todayMonth) return null;
  const [y, mo] = month.split("-").map(Number);
  const lastD = new Date(y, mo, 0).getDate();
  const lastStr = `${month}-${String(lastD).padStart(2, "0")}`;
  if (month === todayMonth) return todayKey;
  return lastStr;
}

function defaultChecked(companyKind: CompanyKind): boolean {
  if (companyKind === "KOUSEI" || companyKind === "自社_green") return true;
  return false;
}

function computePeopleCount(record: {
  memberForemanNames?: string[];
  memberKogataNames?: string[];
  hadHelpTeam?: boolean;
  helpMemberNames?: string[];
}): number {
  const set = new Set<string>();
  for (const n of record.memberForemanNames ?? []) set.add(n);
  for (const n of record.memberKogataNames ?? []) set.add(n);
  if (record.hadHelpTeam) {
    for (const n of record.helpMemberNames ?? []) set.add(n);
  }
  return set.size;
}

function buildBillingRowsForMonth(month: string, todayKey: string): KouseiBillingRow[] {
  const rangeEnd = monthRangeEnd(month, todayKey);
  if (!rangeEnd) return [];
  const start = `${month}-01`;
  const sites = loadSites();
  const byId = new Map(sites.map((s) => [s.id, s]));
  const out: KouseiBillingRow[] = [];

  for (const s of sites) {
    const ss = byId.get(s.id);
    const kind = (ss?.companyKind ?? "自社") as CompanyKind;
    for (const k of WORK_KINDS) {
      const map = loadDailyLaborMap(s.id, k);
      for (const r of Object.values(map)) {
        if (r.dateKey < start || r.dateKey > rangeEnd) continue;
        out.push({
          siteId: s.id,
          siteName: ss?.name || "（現場名未設定）",
          clientName: ss?.clientName || "—",
          workKind: k,
          dateKey: r.dateKey,
          peopleCount: computePeopleCount(r),
          contractAmount: null,
          amount70: null,
          amount60: null,
          amount40: null,
          monthlyPayment: null,
          memo: "",
          checked: defaultChecked(kind),
        });
      }
    }
  }

  return out.sort((a, b) => {
    const c = a.dateKey.localeCompare(b.dateKey);
    return c !== 0 ? c : a.siteId.localeCompare(b.siteId);
  });
}

/** 同月の最新レコードから金額・メモのみを初期値に反映 */
function useIsDesktopMin768(): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    setOk(mq.matches);
    const on = () => setOk(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return ok;
}

function mergeLatestAmountMemo(
  base: KouseiBillingRow[],
  latest?: KouseiBillingRecord
): KouseiBillingRow[] {
  if (!latest) return base;
  const map = new Map(latest.rows.map((r) => [kouseiBillingRowKey(r), r]));
  return base.map((row) => {
    const k = kouseiBillingRowKey(row);
    const prev = map.get(k);
    if (!prev) return row;
    const p = migrateKouseiBillingRow(
      prev as KouseiBillingRow & { amount?: number | null }
    );
    return {
      ...row,
      contractAmount: p.contractAmount,
      amount70: p.amount70,
      amount60: p.amount60,
      amount40: p.amount40,
      monthlyPayment: p.monthlyPayment,
      memo: p.memo,
    };
  });
}

export function KouseiAdminPage() {
  const [pin, setPin] = useState("");
  const [authed, setAuthed] = useState(false);
  const todayKey = useMemo(() => todayLocalDateKey(), []);
  const [month, setMonth] = useState(toMonthValue(todayKey));
  const [message, setMessage] = useState<string | null>(null);
  const [billingRecords, setBillingRecords] = useState<KouseiBillingRecord[]>(
    []
  );
  const [billingError, setBillingError] = useState<string | null>(null);
  const [billingSending, setBillingSending] = useState(false);
  const [savingPut, setSavingPut] = useState(false);

  const [draftRows, setDraftRows] = useState<KouseiBillingRow[]>([]);
  const [editingRowKey, setEditingRowKey] = useState<string | null>(null);
  const contractInputRef = useRef<HTMLInputElement | null>(null);

  const isDesktop = useIsDesktopMin768();

  useEffect(() => {
    if (!editingRowKey) return;
    contractInputRef.current?.focus();
  }, [editingRowKey]);

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
    if (!authed) return;
    void loadBillingRecords();
  }, [authed, loadBillingRecords]);

  const latestForMonth = useMemo(() => {
    const list = billingRecords.filter((r) => r.month === month);
    if (list.length === 0) return undefined;
    return [...list].sort((a, b) => b.sentAt.localeCompare(a.sentAt))[0];
  }, [billingRecords, month]);

  const latestRowsSig = useMemo(
    () => (latestForMonth ? JSON.stringify(latestForMonth.rows) : ""),
    [latestForMonth]
  );

  useEffect(() => {
    const base = buildBillingRowsForMonth(month, todayKey);
    setDraftRows(mergeLatestAmountMemo(base, latestForMonth));
  }, [month, todayKey, latestForMonth?.id, latestRowsSig]);

  const rangeEndLabel = monthRangeEnd(month, todayKey);

  function updateRow(
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
    setDraftRows((prev) =>
      prev.map((row) =>
        kouseiBillingRowKey(row) === rowKey ? { ...row, ...patch } : row
      )
    );
  }

  function toggleChecked(r: KouseiBillingRow, checked: boolean) {
    const k = kouseiBillingRowKey(r);
    setDraftRows((prev) =>
      prev.map((row) =>
        kouseiBillingRowKey(row) === k ? { ...row, checked } : row
      )
    );
  }

  function toggleEditRow(rowKey: string) {
    setEditingRowKey((k) => (k === rowKey ? null : rowKey));
  }

  async function handleSavePut() {
    if (!latestForMonth) {
      setMessage(
        "保存するには、同じ月に送信済みのレコードが必要です（先に確定送信するか、既存レコードを参照してください）。"
      );
      return;
    }
    setSavingPut(true);
    setMessage(null);
    try {
      const draftByKey = new Map(
        draftRows.map((r) => [kouseiBillingRowKey(r), r])
      );
      const mergedRows = latestForMonth.rows.map((row) => {
        const k = kouseiBillingRowKey(row);
        const d = draftByKey.get(k);
        if (!d) return row;
        return {
          ...row,
          contractAmount: d.contractAmount,
          amount70: d.amount70,
          amount60: d.amount60,
          amount40: d.amount40,
          monthlyPayment: d.monthlyPayment,
          memo: d.memo,
          checked: d.checked,
        };
      });
      await putKouseiBillingUpdate(latestForMonth.id, { rows: mergedRows });
      await loadBillingRecords();
      setMessage("保存しました（メールは送信していません）。");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "保存に失敗しました。");
    } finally {
      setSavingPut(false);
    }
  }

  async function handleSend() {
    const checkedRows = draftRows.filter((r) => r.checked);
    if (checkedRows.length === 0) {
      setMessage("送信する行を1件以上チェックしてください。");
      return;
    }
    if (!rangeEndLabel) {
      setMessage("対象月が不正です。");
      return;
    }
    const ok = window.confirm(
      `チェックした ${checkedRows.length} 件をKOUSEI請求確認として送信します。よろしいですか？`
    );
    if (!ok) return;
    setBillingSending(true);
    setMessage(null);
    try {
      const payload = checkedRows.map((r) => ({
        ...r,
        checked: true,
      }));
      await postKouseiBillingSend({
        month,
        dateRangeEnd: rangeEndLabel,
        rows: payload,
        adminPin: "1234",
      });
      await loadBillingRecords();
      setMessage("確定送信しました。");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "確定送信に失敗しました。");
    } finally {
      setBillingSending(false);
    }
  }

  function onAuth(e: FormEvent) {
    e.preventDefault();
    if (pin.trim() === "1234") {
      setAuthed(true);
      setMessage(null);
      return;
    }
    setMessage("PINが違います。");
  }

  const sendCountThisMonth = billingRecords.filter((r) => r.month === month).length;
  const canSavePut = Boolean(latestForMonth);

  if (!authed) {
    return (
      <div>
        <div className={styles.pageHead}>
          <h1 className={styles.title}>KOUSEI管理</h1>
        </div>
        <div className={styles.panel}>
          <form onSubmit={onAuth} noValidate>
            <div className={styles.fieldRow}>
              <label className={styles.field}>
                <span className={styles.label}>事務用PIN</span>
                <input
                  className={styles.input}
                  type="password"
                  inputMode="numeric"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="1234"
                  autoComplete="off"
                />
              </label>
              <button type="submit" className={styles.btn}>
                認証する
              </button>
            </div>
            {message && <p className={styles.danger}>{message}</p>}
          </form>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className={styles.pageHead}>
        <h1 className={styles.title}>KOUSEI管理</h1>
      </div>

      <div className={styles.panel}>
        <div className={styles.fieldRow}>
          <label className={styles.field}>
            <span className={styles.label}>対象月</span>
            <input
              className={styles.input}
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </label>
          <button
            type="button"
            className={styles.btnSecondary}
            disabled={savingPut || !canSavePut}
            title={
              !canSavePut
                ? "同じ月に送信済みのレコードがないため保存できません"
                : undefined
            }
            onClick={() => void handleSavePut()}
          >
            {savingPut ? "保存中…" : "保存"}
          </button>
          <button
            type="button"
            className={styles.btn}
            disabled={billingSending || draftRows.length === 0}
            onClick={() => void handleSend()}
          >
            {billingSending ? "送信中…" : "確定送信"}
          </button>
          {sendCountThisMonth > 0 && (
            <span className={styles.billingBadge}>
              今月 {sendCountThisMonth} 件送信済み
            </span>
          )}
        </div>

        {billingError && <p className={styles.danger}>{billingError}</p>}

        <p className={styles.muted}>
          表示範囲: {month}-01 〜 {rangeEndLabel ?? "—"}
          （月初から現在までの作業記録）
        </p>
        <p className={styles.muted}>
          初期チェック: KOUSEI・自社（緑）= ON、自社（白）= OFF。金額・メモは同月の最新送信を反映します。「保存」はサーバーに反映するだけでメールは送りません。
        </p>

        {draftRows.length === 0 ? (
          <p className={styles.muted}>該当する作業記録がありません。</p>
        ) : isDesktop ? (
          <div className={styles.kouseiAdminTableWrap}>
            <table className={`${styles.table} ${styles.kouseiAdminTable}`}>
              <thead>
                <tr>
                  <th>送信</th>
                  <th>日付</th>
                  <th>現場名</th>
                  <th>元請け名</th>
                  <th>作業種別</th>
                  <th>人数</th>
                  <th>契約／月払</th>
                  <th>メモ</th>
                  <th>編集</th>
                </tr>
              </thead>
              <tbody>
                {draftRows.map((r) => {
                  const rk = kouseiBillingRowKey(r);
                  const editing = editingRowKey === rk;
                  return (
                    <Fragment key={rk}>
                      <tr>
                        <td>
                          <input
                            type="checkbox"
                            checked={r.checked}
                            onChange={(e) =>
                              toggleChecked(r, e.target.checked)
                            }
                            aria-label="送信に含める"
                          />
                        </td>
                        <td>{r.dateKey}</td>
                        <td>{r.siteName}</td>
                        <td>{r.clientName || "—"}</td>
                        <td>{r.workKind}</td>
                        <td>{r.peopleCount}</td>
                        <td>
                          <div className={styles.kouseiBillingSummary}>
                            <div>契約 {formatYenOrDash(r.contractAmount)}</div>
                            <div>月払 {formatYenOrDash(r.monthlyPayment)}</div>
                          </div>
                        </td>
                        <td className={styles.cellMemo}>
                          <input
                            className={styles.input}
                            type="text"
                            value={r.memo}
                            onChange={(e) =>
                              updateRow(rk, { memo: e.target.value })
                            }
                            placeholder="メモ"
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className={styles.btnSecondary}
                            onClick={() => toggleEditRow(rk)}
                          >
                            {editing ? "閉じる" : "編集"}
                          </button>
                        </td>
                      </tr>
                      {editing && (
                        <tr className={styles.kouseiBillingEditRow}>
                          <td colSpan={9}>
                            <div className={styles.kouseiBillingEditPanel}>
                              <KouseiBillingAmountFields
                                row={r}
                                contractInputRef={contractInputRef}
                                onPatch={(p) => updateRow(rk, p)}
                              />
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div>
            {draftRows.map((r) => {
              const rk = kouseiBillingRowKey(r);
              const editing = editingRowKey === rk;
              return (
                <div key={rk} className={styles.kouseiAdminCard}>
                  <div className={styles.kouseiAdminCardHead}>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.35rem",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={r.checked}
                        onChange={(e) =>
                          toggleChecked(r, e.target.checked)
                        }
                      />
                      <span>送信</span>
                    </label>
                    <span>{r.dateKey}</span>
                  </div>
                  <div className={styles.kouseiAdminCardGrid}>
                    <div className={styles.kouseiAdminCardFull}>
                      <span style={{ fontWeight: 800 }}>{r.siteName}</span>
                    </div>
                    <div>
                      <span className={styles.label}>元請け</span>
                      {r.clientName || "—"}
                    </div>
                    <div>
                      <span className={styles.label}>作業</span>
                      {r.workKind}
                    </div>
                    <div>
                      <span className={styles.label}>人数</span>
                      {r.peopleCount}
                    </div>
                    <div className={styles.kouseiAdminCardFull}>
                      <span className={styles.label}>契約／月払</span>
                      <div className={styles.kouseiBillingSummary}>
                        <div>契約 {formatYenOrDash(r.contractAmount)}</div>
                        <div>月払 {formatYenOrDash(r.monthlyPayment)}</div>
                      </div>
                    </div>
                    <div>
                      <span className={styles.label}>メモ</span>
                      <input
                        className={styles.input}
                        type="text"
                        value={r.memo}
                        onChange={(e) =>
                          updateRow(rk, { memo: e.target.value })
                        }
                        placeholder="メモ"
                      />
                    </div>
                    {editing && (
                      <div className={styles.kouseiAdminCardFull}>
                        <div className={styles.kouseiBillingEditPanel}>
                          <KouseiBillingAmountFields
                            row={r}
                            contractInputRef={contractInputRef}
                            onPatch={(p) => updateRow(rk, p)}
                          />
                        </div>
                      </div>
                    )}
                    <div className={styles.kouseiAdminCardFull}>
                      <button
                        type="button"
                        className={styles.btnSecondary}
                        style={{ width: "100%" }}
                        onClick={() => toggleEditRow(rk)}
                      >
                        {editing ? "金額フォームを閉じる" : "金額を編集"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {message && <p className={styles.muted}>{message}</p>}
      </div>
    </div>
  );
}
