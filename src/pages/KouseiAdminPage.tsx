import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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

const UNDO_MS = 30_000;

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

type UndoEntry = {
  key: string;
  label: string;
  expiresAt: number;
};

export function KouseiAdminPage() {
  const [pin, setPin] = useState("");
  const [authed, setAuthed] = useState(false);
  const [month, setMonth] = useState(toMonthValue(todayLocalDateKey()));
  const [message, setMessage] = useState<string | null>(null);
  /** loadKouseiMonthList を再実行するためのバージョン（削除・取り消し直後に反映） */
  const [storageTick, setStorageTick] = useState(0);
  const [undoEntries, setUndoEntries] = useState<UndoEntry[]>([]);
  const undoTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );

  const monthState = useMemo(
    () => loadKouseiMonthList(month),
    [month, storageTick]
  );

  const rows = useMemo(() => {
    const all = buildRowsForMonth(month);
    const excluded = new Set(monthState.excludedRowKeys);
    return all.filter((r) => !excluded.has(rowKey(r)));
  }, [month, monthState.excludedRowKeys]);

  const clearUndoTimers = useCallback(() => {
    for (const t of undoTimeoutsRef.current.values()) {
      clearTimeout(t);
    }
    undoTimeoutsRef.current.clear();
  }, []);

  useEffect(() => {
    return () => {
      clearUndoTimers();
    };
  }, [clearUndoTimers]);

  /** 対象月が変わったら取り消し用 state は破棄（別画面相当・セッション内の取り消し不可） */
  useEffect(() => {
    clearUndoTimers();
    setUndoEntries([]);
  }, [month, clearUndoTimers]);

  function bumpStorage() {
    setStorageTick((t) => t + 1);
  }

  function scheduleUndoExpiry(key: string) {
    const prev = undoTimeoutsRef.current.get(key);
    if (prev) clearTimeout(prev);
    const tid = setTimeout(() => {
      setUndoEntries((list) => list.filter((e) => e.key !== key));
      undoTimeoutsRef.current.delete(key);
    }, UNDO_MS);
    undoTimeoutsRef.current.set(key, tid);
  }

  function handleDelete(r: KouseiRow) {
    if (monthState.confirmed) return;
    const k = rowKey(r);
    const next = new Set(monthState.excludedRowKeys);
    next.add(k);
    saveKouseiMonthList({
      ...monthState,
      month,
      excludedRowKeys: [...next],
    });
    bumpStorage();
    const label = `${r.siteName}（${r.dateKey}・${r.workKind}）`;
    setUndoEntries((list) => [
      ...list.filter((e) => e.key !== k),
      { key: k, label, expiresAt: Date.now() + UNDO_MS },
    ]);
    scheduleUndoExpiry(k);
  }

  function handleUndo(key: string) {
    const tid = undoTimeoutsRef.current.get(key);
    if (tid) clearTimeout(tid);
    undoTimeoutsRef.current.delete(key);
    const next = new Set(monthState.excludedRowKeys);
    next.delete(key);
    saveKouseiMonthList({
      ...monthState,
      month,
      excludedRowKeys: [...next],
    });
    bumpStorage();
    setUndoEntries((list) => list.filter((e) => e.key !== key));
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

  const visibleUndo = undoEntries.filter((e) => Date.now() < e.expiresAt);

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
              const ok = window.confirm(
                "一覧を確定します。確定後はKOUSEI側ページに表示されます。よろしいですか？"
              );
              if (!ok) return;
              saveKouseiMonthList({
                ...monthState,
                month,
                confirmed: true,
                confirmedRows: rows,
              });
              bumpStorage();
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
                      onClick={() => handleDelete(r)}
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

        {visibleUndo.length > 0 && (
          <div className={styles.undoBar} role="region" aria-label="削除の取り消し">
            <p className={styles.undoBarTitle}>直近の削除（30秒以内に取り消し可）</p>
            {visibleUndo.map((e) => (
              <div key={e.key} className={styles.undoRow}>
                <span className={styles.undoLabel}>削除しました: {e.label}</span>
                <button
                  type="button"
                  className={styles.undoBtn}
                  onClick={() => handleUndo(e.key)}
                >
                  元に戻す
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
