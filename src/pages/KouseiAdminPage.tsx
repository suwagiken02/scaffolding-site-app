import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { loadSites } from "../lib/siteStorage";
import { loadDailyLaborMap } from "../lib/siteDailyLaborStorage";
import { WORK_KINDS } from "../types/workKind";
import type { CompanyKind } from "../types/site";
import { todayLocalDateKey } from "../lib/dateUtils";
import {
  fetchKouseiBillingRecords,
  postKouseiBillingSend,
  kouseiBillingRowKey,
  type KouseiBillingRecord,
  type KouseiBillingRow,
} from "../lib/kouseiBillingStorage";
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
          amount: null,
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

  const [draftRows, setDraftRows] = useState<KouseiBillingRow[]>(() =>
    buildBillingRowsForMonth(toMonthValue(todayKey), todayKey)
  );

  useEffect(() => {
    setDraftRows(buildBillingRowsForMonth(month, todayKey));
  }, [month, todayKey]);

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

  const rangeEndLabel = monthRangeEnd(month, todayKey);

  function toggleChecked(r: KouseiBillingRow, checked: boolean) {
    const k = kouseiBillingRowKey(r);
    setDraftRows((prev) =>
      prev.map((row) =>
        kouseiBillingRowKey(row) === k ? { ...row, checked } : row
      )
    );
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
        amount: null,
        memo: "",
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
          初期チェック: KOUSEI・自社（緑）= ON、自社（白）= OFF。変更してから送信してください。
        </p>

        {draftRows.length === 0 ? (
          <p className={styles.muted}>該当する作業記録がありません。</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>送信</th>
                <th>日付</th>
                <th>現場名</th>
                <th>元請け名</th>
                <th>作業種別</th>
                <th>人数</th>
              </tr>
            </thead>
            <tbody>
              {draftRows.map((r) => (
                <tr key={kouseiBillingRowKey(r)}>
                  <td>
                    <input
                      type="checkbox"
                      checked={r.checked}
                      onChange={(e) => toggleChecked(r, e.target.checked)}
                      aria-label="送信に含める"
                    />
                  </td>
                  <td>{r.dateKey}</td>
                  <td>{r.siteName}</td>
                  <td>{r.clientName || "—"}</td>
                  <td>{r.workKind}</td>
                  <td>{r.peopleCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {message && <p className={styles.muted}>{message}</p>}
      </div>
    </div>
  );
}
