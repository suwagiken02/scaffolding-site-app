import { FormEvent, useMemo, useState } from "react";
import { todayLocalDateKey } from "../lib/dateUtils";
import { loadSites } from "../lib/siteStorage";
import { loadContractorMasters } from "../lib/contractorMasterStorage";
import { loadDailyLaborMap } from "../lib/siteDailyLaborStorage";
import { WORK_KINDS, type WorkKind } from "../types/workKind";
import { loadContractorBillingAmount } from "../lib/contractorBillingStorage";
import { loadCompanyProfile } from "../lib/companyProfileStorage";
import { sendEmailApi } from "../lib/sendEmailApi";
import {
  loadContractorWorkflow,
  saveContractorWorkflow,
} from "../lib/contractorWorkflowStorage";
import styles from "./ContractorAdminPage.module.css";

type Row = {
  dateKey: string;
  siteId: string;
  siteName: string;
  workKind: WorkKind;
  peopleCount: number;
  amountYen: number | null;
};

function monthOf(dateKey: string): string {
  return dateKey.slice(0, 7);
}

function shiftMonth(yyyyMm: string, delta: number): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  const d = new Date(y, (m ?? 1) - 1 + delta, 1);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}`;
}

function formatYen(n: number): string {
  return `${Math.round(n).toLocaleString()}円`;
}

function buildRows(contractorName: string, month: string): Row[] {
  const sites = loadSites();
  const byId = new Map(sites.map((s) => [s.id, s.name]));
  const out: Row[] = [];

  for (const s of sites) {
    for (const k of WORK_KINDS) {
      const map = loadDailyLaborMap(s.id, k);
      for (const r of Object.values(map)) {
        if (!r.dateKey.startsWith(`${month}-`)) continue;
        if (r.employmentKind !== "請負") continue;
        if ((r.contractorCompanyName ?? "").trim() !== contractorName.trim())
          continue;
        const people =
          typeof r.contractorPeopleCount === "number" && r.contractorPeopleCount > 0
            ? r.contractorPeopleCount
            : 0;
        const amount = loadContractorBillingAmount({
          contractorName,
          siteId: s.id,
          workKind: k,
          dateKey: r.dateKey,
        });
        out.push({
          dateKey: r.dateKey,
          siteId: s.id,
          siteName: byId.get(s.id) || "（現場名未設定）",
          workKind: k,
          peopleCount: people,
          amountYen: amount,
        });
      }
    }
  }

  return out.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

export function ContractorViewPage() {
  const contractors = useMemo(() => loadContractorMasters(), []);
  const [contractorId, setContractorId] = useState("");
  const [pin, setPin] = useState("");
  const [authed, setAuthed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contractor = useMemo(
    () => contractors.find((c) => c.id === contractorId) ?? null,
    [contractors, contractorId]
  );

  const baseMonth = useMemo(() => monthOf(todayLocalDateKey()), []);
  const prevMonth = useMemo(() => shiftMonth(baseMonth, -1), [baseMonth]);

  function onAuth(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!contractor) {
      setError("会社名を選択してください。");
      return;
    }
    if (pin.trim() && pin.trim() === contractor.viewPin.trim()) {
      setAuthed(true);
      return;
    }
    setError("PINが違います。");
  }

  const rowsPrev = useMemo(() => {
    if (!authed || !contractor) return [];
    return buildRows(contractor.name, prevMonth);
  }, [authed, contractor, prevMonth]);

  const rowsThis = useMemo(() => {
    if (!authed || !contractor) return [];
    return buildRows(contractor.name, baseMonth);
  }, [authed, contractor, baseMonth]);

  const adminEmail = useMemo(() => loadCompanyProfile().adminEmail.trim(), []);

  const wfPrev = useMemo(() => {
    if (!contractorId || !authed) return loadContractorWorkflow("", "");
    return loadContractorWorkflow(contractorId, prevMonth);
  }, [contractorId, authed, prevMonth]);

  const wfThis = useMemo(() => {
    if (!contractorId || !authed) return loadContractorWorkflow("", "");
    return loadContractorWorkflow(contractorId, baseMonth);
  }, [contractorId, authed, baseMonth]);

  function totals(rows: Row[]) {
    let people = 0;
    let amount = 0;
    let amountCount = 0;
    for (const r of rows) {
      people += r.peopleCount;
      if (typeof r.amountYen === "number") {
        amount += r.amountYen;
        amountCount += 1;
      }
    }
    return { people, amount, amountCount };
  }

  if (!authed) {
    return (
      <div>
        <div className={styles.pageHead}>
          <h1 className={styles.title}>請負会社閲覧</h1>
        </div>
        <div className={styles.panel}>
          <form onSubmit={onAuth} noValidate>
            <div className={styles.fieldRow}>
              <label className={styles.field}>
                <span className={styles.label}>会社名</span>
                <select
                  className={styles.select}
                  value={contractorId}
                  onChange={(e) => setContractorId(e.target.value)}
                >
                  <option value="">選択してください</option>
                  {contractors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
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

  const tPrev = totals(rowsPrev);
  const tThis = totals(rowsThis);

  async function onConfirmDone(month: string) {
    if (!contractor) return;
    if (!adminEmail) {
      setError("事務員の通知先メールが未設定です（マスター設定→自社設定）。");
      return;
    }
    await sendEmailApi({
      to: [adminEmail],
      subject: `【確認完了】${contractor.name}より${month}分の作業内容確認が完了しました`,
      text: `【確認完了】${contractor.name}より${month}分の作業内容確認が完了しました。\n`,
    });
    saveContractorWorkflow({
      ...loadContractorWorkflow(contractor.id, month),
      contractorId: contractor.id,
      month,
      status: "確認済み",
    });
  }

  async function onApproved(month: string) {
    if (!contractor) return;
    if (!adminEmail) {
      setError("事務員の通知先メールが未設定です（マスター設定→自社設定）。");
      return;
    }
    await sendEmailApi({
      to: [adminEmail],
      subject: `【了承済み】${contractor.name}より${month}分の金額了承が完了しました`,
      text: `【了承済み】${contractor.name}より${month}分の金額了承が完了しました。\n`,
    });
    saveContractorWorkflow({
      ...loadContractorWorkflow(contractor.id, month),
      contractorId: contractor.id,
      month,
      status: "了承済み",
    });
  }

  function renderTable(rows: Row[]) {
    if (rows.length === 0) return <p className={styles.muted}>該当なし</p>;
    return (
      <table className={styles.table}>
        <thead>
          <tr>
            <th>日付</th>
            <th>現場名</th>
            <th>作業種別</th>
            <th>人数</th>
            <th>金額</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.siteId}__${r.workKind}__${r.dateKey}`}>
              <td>{r.dateKey}</td>
              <td>{r.siteName}</td>
              <td>{r.workKind}</td>
              <td>{r.peopleCount}</td>
              <td>
                {r.amountYen === null ? (
                  <span className={styles.muted}>未確定</span>
                ) : (
                  formatYen(r.amountYen)
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <div>
      <div className={styles.pageHead}>
        <h1 className={styles.title}>請負会社閲覧</h1>
      </div>

      <div className={styles.panel}>
        <p className={styles.muted}>会社: {contractor?.name}</p>

        <h2 className={styles.title} style={{ fontSize: "1.05rem" }}>
          前月（{prevMonth}）
        </h2>
        <p className={styles.muted}>ステータス: {wfPrev.status}</p>
        {wfPrev.status === "確認待ち" && (
          <button type="button" className={styles.btn} onClick={() => void onConfirmDone(prevMonth)}>
            作業を確認
          </button>
        )}
        {wfPrev.status === "金額確認待ち" && (
          <button type="button" className={styles.btn} onClick={() => void onApproved(prevMonth)}>
            金額を了承
          </button>
        )}
        {renderTable(rowsPrev)}
        <div className={styles.summary}>
          <span>合計人数: {tPrev.people} 人</span>
          <span>
            合計金額:{" "}
            {tPrev.amountCount === 0 ? "—" : formatYen(tPrev.amount)}
          </span>
        </div>

        <h2
          className={styles.title}
          style={{ fontSize: "1.05rem", marginTop: "1.2rem" }}
        >
          当月（{baseMonth}）
        </h2>
        <p className={styles.muted}>ステータス: {wfThis.status}</p>
        {wfThis.status === "確認待ち" && (
          <button type="button" className={styles.btn} onClick={() => void onConfirmDone(baseMonth)}>
            作業を確認
          </button>
        )}
        {wfThis.status === "金額確認待ち" && (
          <button type="button" className={styles.btn} onClick={() => void onApproved(baseMonth)}>
            金額を了承
          </button>
        )}
        {renderTable(rowsThis)}
        <div className={styles.summary}>
          <span>合計人数: {tThis.people} 人</span>
          <span>
            合計金額:{" "}
            {tThis.amountCount === 0 ? "—" : formatYen(tThis.amount)}
          </span>
        </div>
      </div>
    </div>
  );
}

