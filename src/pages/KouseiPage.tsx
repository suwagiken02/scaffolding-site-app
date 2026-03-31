import { FormEvent, useMemo, useState } from "react";
import { loadCompanyProfile } from "../lib/companyProfileStorage";
import { listKouseiConfirmedMonths, loadKouseiMonthList } from "../lib/kouseiListStorage";
import { loadKouseiAmount, saveKouseiAmount } from "../lib/kouseiAmountStorage";
import { sendEmailApi } from "../lib/sendEmailApi";
import { getSiteById } from "../lib/siteStorage";
import styles from "./ContractorAdminPage.module.css";

function formatYen(n: number): string {
  return `${Math.round(n).toLocaleString()}円`;
}

export function KouseiPage() {
  const profile = useMemo(() => loadCompanyProfile(), []);
  const [pin, setPin] = useState("");
  const [authed, setAuthed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const months = useMemo(() => listKouseiConfirmedMonths(), []);
  const [month, setMonth] = useState(months[0] ?? "");

  const monthList = useMemo(() => {
    if (!authed || !month) return null;
    const v = loadKouseiMonthList(month);
    return v.confirmed ? v : null;
  }, [authed, month]);

  const [draft, setDraft] = useState<Record<string, string>>({});

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

  if (!month) {
    return (
      <div>
        <div className={styles.pageHead}>
          <h1 className={styles.title}>KOUSEI</h1>
        </div>
        <div className={styles.panel}>
          <p className={styles.muted}>確定済みの一覧がありません。</p>
        </div>
      </div>
    );
  }

  const rows = monthList?.confirmedRows ?? [];
  const allAmountsFilled = rows.length > 0 && rows.every((r) => {
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
      <div className={styles.panel}>
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
                const value = draft[k] !== undefined ? draft[k] : saved === null ? "" : String(saved);
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
                        onChange={(e) => setDraft((p) => ({ ...p, [k]: e.target.value }))}
                        placeholder="未確定"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

