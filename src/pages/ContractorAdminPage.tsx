import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { loadSites } from "../lib/siteStorage";
import { loadContractorMasters } from "../lib/contractorMasterStorage";
import { loadDailyLaborMap } from "../lib/siteDailyLaborStorage";
import { WORK_KINDS, type WorkKind } from "../types/workKind";
import {
  loadContractorBillingAmount,
  saveContractorBillingAmount,
} from "../lib/contractorBillingStorage";
import { todayLocalDateKey } from "../lib/dateUtils";
import { loadCompanyProfile } from "../lib/companyProfileStorage";
import styles from "./ContractorAdminPage.module.css";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { sendEmailApi } from "../lib/sendEmailApi";
import {
  loadContractorWorkflow,
  saveContractorWorkflow,
} from "../lib/contractorWorkflowStorage";

type Row = {
  dateKey: string;
  siteId: string;
  siteName: string;
  workKind: WorkKind;
  peopleCount: number;
  amountYen: number | null;
};

function toMonthValue(dateKey: string): string {
  // YYYY-MM-DD -> YYYY-MM
  return dateKey.slice(0, 7);
}

function formatYen(n: number): string {
  return `${Math.round(n).toLocaleString()}円`;
}

function safeFileName(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "_").trim();
}

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

export function ContractorAdminPage() {
  const [pin, setPin] = useState("");
  const [authed, setAuthed] = useState(false);
  const contractors = useMemo(() => loadContractorMasters(), []);
  const [contractorId, setContractorId] = useState("");
  const [month, setMonth] = useState(toMonthValue(todayLocalDateKey()));
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [sendingBusy, setSendingBusy] = useState(false);
  const autoSendRanRef = useRef(false);

  const contractorName = useMemo(() => {
    const n = contractors.find((c) => c.id === contractorId)?.name ?? "";
    return n;
  }, [contractors, contractorId]);

  const contractorEmail = useMemo(() => {
    const e = contractors.find((c) => c.id === contractorId)?.email ?? "";
    return e.trim();
  }, [contractors, contractorId]);

  const adminEmail = useMemo(() => loadCompanyProfile().adminEmail.trim(), []);

  const workflow = useMemo(() => {
    if (!contractorId || !month) {
      return loadContractorWorkflow("", "");
    }
    return loadContractorWorkflow(contractorId, month);
  }, [contractorId, month]);

  const rows = useMemo(() => {
    if (!authed) return [];
    if (!contractorName.trim()) return [];
    if (!month.trim()) return [];
    return buildRows(contractorName, month);
  }, [authed, contractorName, month]);

  const [amountDraft, setAmountDraft] = useState<Record<string, string>>({});

  const totals = useMemo(() => {
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
  }, [rows]);

  function rowKey(r: Row): string {
    return `${r.siteId}__${r.workKind}__${r.dateKey}`;
  }

  async function autoSendPreviousMonthIfNeeded(): Promise<void> {
    if (autoSendRanRef.current) return;
    autoSendRanRef.current = true;

    const baseMonth = monthOf(todayLocalDateKey());
    const prevMonth = shiftMonth(baseMonth, -1);
    const profile = loadCompanyProfile();
    const viewUrl = `${window.location.origin}${import.meta.env.BASE_URL}contractor/view`;

    const list = loadContractorMasters();
    for (const c of list) {
      const wf = loadContractorWorkflow(c.id, prevMonth);
      if (wf.status !== "未送信") continue;
      const rowsPrev = buildRows(c.name, prevMonth);
      if (rowsPrev.length === 0) continue;
      const to = c.email.trim();
      if (!to) continue;

      try {
        await sendEmailApi({
          to: [to],
          subject: `${prevMonth}分の作業一覧をご確認ください`,
          text: `${prevMonth}分の作業一覧をご確認ください。\n\n閲覧ページ: ${viewUrl}\n`,
        });
        saveContractorWorkflow({
          ...wf,
          contractorId: c.id,
          month: prevMonth,
          status: "確認待ち",
        });
      } catch (e) {
        console.warn("[contractor-auto-send] failed", {
          contractor: c.name,
          month: prevMonth,
          error: e,
          adminEmail: profile.adminEmail,
        });
      }
    }
  }

  function onAuth(e: FormEvent) {
    e.preventDefault();
    if (pin.trim() === "1234") {
      setAuthed(true);
      setSaveMessage(null);
      return;
    }
    setSaveMessage("PINが違います。");
  }

  function onSaveAll() {
    setSaveMessage(null);
    if (!contractorName.trim() || !month.trim()) return;

    for (const r of rows) {
      const k = rowKey(r);
      const raw = (amountDraft[k] ?? "").trim();
      if (!raw) continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) continue;
      saveContractorBillingAmount(
        {
          contractorName,
          siteId: r.siteId,
          workKind: r.workKind,
          dateKey: r.dateKey,
        },
        n
      );
    }
    setSaveMessage("保存しました。");
    setAmountDraft({});

    // all amounts filled => send mail + move to "金額確認待ち"
    const allFilled = rows.every((r) => {
      const k = rowKey(r);
      const raw = (amountDraft[k] ?? "").trim();
      const n = raw ? Number(raw) : null;
      const after =
        raw && Number.isFinite(n as number) && (n as number) >= 0
          ? (n as number)
          : r.amountYen;
      return typeof after === "number" && Number.isFinite(after) && after >= 0;
    });
    if (
      allFilled &&
      contractorEmail &&
      workflow.status !== "金額確認待ち" &&
      workflow.status !== "了承済み"
    ) {
      void (async () => {
        setSendingBusy(true);
        try {
          const url = `${window.location.origin}${import.meta.env.BASE_URL}contractor/view`;
          await sendEmailApi({
            to: [contractorEmail],
            subject: `${month}分の金額が確定しました。ご確認ください`,
            text: `${month}分の金額が確定しました。ご確認ください。\n\n閲覧ページ: ${url}\n`,
          });
          saveContractorWorkflow({
            ...workflow,
            contractorId,
            month,
            status: "金額確認待ち",
          });
          setSaveMessage("金額確認メールを送信しました。");
        } catch (e) {
          setSaveMessage(
            e instanceof Error ? e.message : "メール送信に失敗しました。"
          );
        } finally {
          setSendingBusy(false);
        }
      })();
    }
  }

  useEffect(() => {
    // app起動時・このページを開いたときに前月分の未送信をチェックして自動送信
    void autoSendPreviousMonthIfNeeded();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onPdf() {
    if (!contractorName.trim() || !month.trim()) return;
    setPdfBusy(true);
    try {
      const profile = loadCompanyProfile();
      const doc = new jsPDF({ unit: "pt", format: "a4" });

      const pageW = doc.internal.pageSize.getWidth();
      const margin = 36;
      let y = 44;

      // header: logo (left), company (right), title (center)
      const logo = profile.logoDataUrl?.trim() ?? "";
      if (logo.startsWith("data:image/")) {
        try {
          const fmt = logo.startsWith("data:image/png") ? "PNG" : "JPEG";
          doc.addImage(logo, fmt, margin, y - 18, 90, 36);
        } catch {
          // ignore invalid image
        }
      }

      const companyName = profile.companyName?.trim() ?? "";
      if (companyName) {
        doc.setFontSize(11);
        doc.text(companyName, pageW - margin, y, { align: "right" });
      }

      doc.setFontSize(16);
      doc.text("作業明細書", pageW / 2, y, { align: "center" });
      y += 22;

      doc.setFontSize(11);
      doc.text(`請負会社名：${contractorName}`, margin, y);
      doc.text(`対象月：${month}`, pageW - margin, y, { align: "right" });
      y += 16;

      // table
      const body = rows.map((r) => [
        r.dateKey,
        r.siteName,
        r.workKind,
        String(r.peopleCount),
        r.amountYen === null ? "" : String(r.amountYen),
      ]);

      autoTable(doc, {
        startY: y + 10,
        margin: { left: margin, right: margin },
        head: [["日付", "現場名", "作業種別", "人数", "金額"]],
        body,
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [240, 240, 240], textColor: 20 },
        columnStyles: {
          3: { halign: "right" },
          4: { halign: "right" },
        },
      });

      // footer totals
      const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } })
        .lastAutoTable?.finalY;
      const fy = typeof finalY === "number" ? finalY + 18 : y + 18;
      doc.setFontSize(11);
      doc.text(`合計人数：${totals.people} 人`, pageW - margin, fy, {
        align: "right",
      });
      doc.text(
        `合計金額：${
          totals.amountCount === 0 ? "—" : formatYen(totals.amount)
        }`,
        pageW - margin,
        fy + 16,
        { align: "right" }
      );

      const file = safeFileName(
        `作業明細書_${contractorName}_${month}.pdf`
      );
      doc.save(file);
    } finally {
      setPdfBusy(false);
    }
  }

  if (!authed) {
    return (
      <div>
        <div className={styles.pageHead}>
          <h1 className={styles.title}>請負管理</h1>
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
            {saveMessage && <p className={styles.danger}>{saveMessage}</p>}
          </form>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className={styles.pageHead}>
        <h1 className={styles.title}>請負管理</h1>
      </div>

      <div className={styles.panel}>
        <div className={styles.statusBar}>
          <span className={styles.statusLabel}>ステータス</span>
          <span className={styles.statusValue}>
            {contractorId && month ? workflow.status : "—"}
          </span>
        </div>

        <div className={styles.fieldRow}>
          <label className={styles.field}>
            <span className={styles.label}>請負会社</span>
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
            <span className={styles.label}>対象月</span>
            <input
              className={styles.input}
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </label>
          {contractorId && month && workflow.status === "確認済み" && (
            <button type="button" className={styles.btn} onClick={onSaveAll}>
              金額を提案
            </button>
          )}
          <button
            type="button"
            className={styles.btn}
            disabled={pdfBusy || !contractorName.trim() || !month.trim()}
            onClick={() => void onPdf()}
          >
            PDF出力
          </button>
        </div>

        {!contractorName.trim() ? (
          <p className={styles.muted}>請負会社を選択してください。</p>
        ) : rows.length === 0 ? (
          <p className={styles.muted}>該当する作業記録がありません。</p>
        ) : (
          <>
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
                {rows.map((r) => {
                  const k = rowKey(r);
                  const draft = amountDraft[k];
                  const value =
                    draft !== undefined
                      ? draft
                      : r.amountYen === null
                        ? ""
                        : String(r.amountYen);
                  return (
                    <tr key={k}>
                      <td>{r.dateKey}</td>
                      <td>{r.siteName}</td>
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
                            setAmountDraft((p) => ({ ...p, [k]: e.target.value }))
                          }
                          placeholder="円"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className={styles.summary}>
              <span>合計人数: {totals.people} 人</span>
              <span>
                合計金額:{" "}
                {totals.amountCount === 0 ? "—" : formatYen(totals.amount)}
              </span>
            </div>
          </>
        )}

        {saveMessage && <p className={styles.muted}>{saveMessage}</p>}
      </div>
    </div>
  );
}

