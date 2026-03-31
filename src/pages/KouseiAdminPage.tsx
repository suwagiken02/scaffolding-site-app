import { FormEvent, useMemo, useState } from "react";
import { loadSites } from "../lib/siteStorage";
import { loadDailyLaborMap } from "../lib/siteDailyLaborStorage";
import { WORK_KINDS } from "../types/workKind";
import { todayLocalDateKey } from "../lib/dateUtils";
import {
  loadKouseiMonthList,
  saveKouseiMonthList,
  type KouseiRow,
} from "../lib/kouseiListStorage";
import styles from "./ContractorAdminPage.module.css";

function toMonthValue(dateKey: string): string {
  return dateKey.slice(0, 7);
}

function rowKey(r: KouseiRow): string {
  return `${r.siteId}__${r.workKind}__${r.dateKey}`;
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

function buildRowsForMonth(month: string): KouseiRow[] {
  const sites = loadSites();
  const byId = new Map(sites.map((s) => [s.id, s]));
  const out: KouseiRow[] = [];

  for (const s of sites) {
    for (const k of WORK_KINDS) {
      const map = loadDailyLaborMap(s.id, k);
      for (const r of Object.values(map)) {
        if (!r.dateKey.startsWith(`${month}-`)) continue;
        const ss = byId.get(s.id);
        out.push({
          siteCode: ss?.siteCode?.trim() || "",
          dateKey: r.dateKey,
          siteId: s.id,
          siteName: ss?.name || "（現場名未設定）",
          clientName: ss?.clientName || "—",
          workKind: k,
          peopleCount: computePeopleCount(r),
        });
      }
    }
  }

  return out.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

export function KouseiAdminPage() {
  const [pin, setPin] = useState("");
  const [authed, setAuthed] = useState(false);
  const [month, setMonth] = useState(toMonthValue(todayLocalDateKey()));
  const [message, setMessage] = useState<string | null>(null);

  const monthState = useMemo(() => loadKouseiMonthList(month), [month]);

  const rows = useMemo(() => {
    const all = buildRowsForMonth(month);
    const excluded = new Set(monthState.excludedRowKeys);
    return all.filter((r) => !excluded.has(rowKey(r)));
  }, [month, monthState.excludedRowKeys]);

  function onAuth(e: FormEvent) {
    e.preventDefault();
    if (pin.trim() === "1234") {
      setAuthed(true);
      setMessage(null);
      return;
    }
    setMessage("PINが違います。");
  }

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
            disabled={monthState.confirmed || rows.length === 0}
            onClick={() => {
              const ok = window.confirm("一覧を確定します。確定後はKOUSEI側ページに表示されます。よろしいですか？");
              if (!ok) return;
              saveKouseiMonthList({
                ...monthState,
                month,
                confirmed: true,
                confirmedRows: rows,
              });
              setMessage("確定しました。");
            }}
          >
            確定して送信
          </button>
        </div>

        <p className={styles.muted}>
          状態: {monthState.confirmed ? "確定済み" : "未確定"}
        </p>

        {rows.length === 0 ? (
          <p className={styles.muted}>該当する作業記録がありません。</p>
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
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={rowKey(r)}>
                  <td>{r.siteCode || "—"}</td>
                  <td>{r.dateKey}</td>
                  <td>{r.siteName}</td>
                  <td>{r.clientName || "—"}</td>
                  <td>{r.workKind}</td>
                  <td>{r.peopleCount}</td>
                  <td>
                    <button
                      type="button"
                      className={styles.btn}
                      disabled={monthState.confirmed}
                      onClick={() => {
                        const k = rowKey(r);
                        const next = new Set(monthState.excludedRowKeys);
                        next.add(k);
                        saveKouseiMonthList({
                          ...monthState,
                          month,
                          excludedRowKeys: [...next],
                        });
                      }}
                    >
                      削除
                    </button>
                  </td>
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

