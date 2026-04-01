import { useCallback, useEffect, useRef, useState } from "react";
import type { PayslipRecord } from "../types/payslip";
import { deletePayslip, fetchPayslips, uploadPayslips } from "../lib/payslipsApi";
import styles from "./LeaveRequestsPage.module.css";

const OFFICE_PIN = "1234";
const AUTH_KEY = "payslipsOfficeAuthed";

function formatYearMonthJa(ym: string): string {
  const [y, m] = ym.split("-");
  if (!y || !m) return ym;
  return `${y}年${parseInt(m, 10)}月`;
}

export function PayslipsPage() {
  const [authed, setAuthed] = useState(() => {
    try {
      return sessionStorage.getItem(AUTH_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);

  const [list, setList] = useState<PayslipRecord[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSummary, setUploadSummary] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      const data = await fetchPayslips();
      setList(data);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "読み込みに失敗しました");
      setList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authed) return;
    void refresh();
  }, [authed, refresh]);

  async function onUpload() {
    const input = fileInputRef.current;
    const files = input?.files ? Array.from(input.files) : [];
    if (files.length === 0) {
      setUploadError("PDFファイルを選択してください。");
      return;
    }
    setUploadError(null);
    setUploadSummary(null);
    setUploading(true);
    try {
      const results = await uploadPayslips(files);
      const failed = results.filter((r) => !r.ok);
      const okCount = results.length - failed.length;
      if (failed.length > 0) {
        setUploadError(
          failed.map((f) => `${f.originalName}: ${f.error ?? "失敗"}`).join("\n")
        );
      }
      if (okCount > 0) {
        setUploadSummary(`${okCount} 件をアップロードしました。`);
      }
      if (input) input.value = "";
      await refresh();
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "アップロードに失敗しました");
    } finally {
      setUploading(false);
    }
  }

  async function onDelete(id: string) {
    if (!window.confirm("この給与明細を削除しますか？（ストレージからも削除されます）")) {
      return;
    }
    setDeletingId(id);
    setLoadError(null);
    try {
      await deletePayslip(id);
      await refresh();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setDeletingId(null);
    }
  }

  if (!authed) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>給与明細</h1>
        <p className={styles.lead}>事務員用PIN（4桁）を入力してください。</p>
        <div className={styles.pinBackdrop} style={{ position: "relative", inset: "auto" }}>
          <div
            className={styles.pinCard}
            style={{ margin: "0 auto" }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="payslip-office-pin"
          >
            <h2 id="payslip-office-pin" className={styles.pinTitle}>
              PINコード
            </h2>
            <p className={styles.pinLead}>4桁のPINを入力してください。</p>
            <div className={styles.pinDots} aria-label="入力状況">
              {Array.from({ length: 4 }).map((_, i) => (
                <span
                  key={i}
                  className={pin.length > i ? styles.pinDotOn : styles.pinDotOff}
                />
              ))}
            </div>
            {pinError && (
              <p className={styles.pinError} role="alert">
                {pinError}
              </p>
            )}
            <div className={styles.keypad} role="group" aria-label="テンキー">
              {[
                "1",
                "2",
                "3",
                "4",
                "5",
                "6",
                "7",
                "8",
                "9",
                "enter",
                "0",
                "back",
              ].map((k) => {
                const isEnter = k === "enter";
                const isBack = k === "back";
                const label = isEnter ? "確定" : isBack ? "⌫" : k;
                const disabled = isEnter ? pin.length !== 4 : false;
                return (
                  <button
                    key={k}
                    type="button"
                    className={isEnter ? styles.enterBtn : styles.keyBtn}
                    disabled={disabled}
                    onClick={() => {
                      setPinError(null);
                      if (isEnter) {
                        if (pin.length !== 4) return;
                        if (pin !== OFFICE_PIN) {
                          setPinError("PINが違います");
                          setPin("");
                          return;
                        }
                        try {
                          sessionStorage.setItem(AUTH_KEY, "1");
                        } catch {
                          // ignore
                        }
                        setAuthed(true);
                        setPin("");
                        return;
                      }
                      if (isBack) {
                        setPin((p) => p.slice(0, -1));
                        return;
                      }
                      setPin((p) => (p.length >= 4 ? p : `${p}${k}`));
                    }}
                    aria-label={
                      isEnter ? "確定" : isBack ? "1文字削除" : `数字${k}`
                    }
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>給与明細</h1>
      <p className={styles.lead}>
        PDFのファイル名は「年月日8桁＋個人コード6桁.pdf」（例：20260331000001.pdf）にしてください。マスターの個人コードと一致するスタッフに紐付きます。
      </p>
      <p className={styles.lead}>
        <button
          type="button"
          className={styles.modalBack}
          onClick={() => {
            try {
              sessionStorage.removeItem(AUTH_KEY);
            } catch {
              // ignore
            }
            setAuthed(false);
          }}
        >
          PINを切る
        </button>
      </p>

      <section aria-label="アップロード" style={{ marginBottom: "1.75rem" }}>
        <h2 className={styles.title} style={{ fontSize: "1.15rem", marginBottom: "0.75rem" }}>
          PDFをアップロード
        </h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            multiple
            aria-label="給与明細PDF（複数可）"
          />
          <button
            type="button"
            className={styles.modalBack}
            disabled={uploading}
            onClick={() => void onUpload()}
          >
            {uploading ? "アップロード中…" : "アップロード"}
          </button>
        </div>
        {uploadSummary && (
          <p className={styles.lead} role="status">
            {uploadSummary}
          </p>
        )}
        {uploadError && (
          <pre
            className={styles.error}
            style={{ whiteSpace: "pre-wrap", marginTop: "0.75rem" }}
            role="alert"
          >
            {uploadError}
          </pre>
        )}
      </section>

      <h2 className={styles.title} style={{ fontSize: "1.15rem", marginBottom: "0.75rem" }}>
        アップロード済み一覧
      </h2>

      {loadError && (
        <p className={styles.error} role="alert">
          {loadError}
        </p>
      )}
      {loading && !loadError && <p className={styles.lead}>読み込み中…</p>}

      {!loading && list.length === 0 && !loadError ? (
        <p className={styles.empty}>まだ給与明細がありません。</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>スタッフ名</th>
                <th>年月</th>
                <th>ファイル名</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id}>
                  <td>{r.staffName}</td>
                  <td>{formatYearMonthJa(r.yearMonth)}</td>
                  <td>
                    <a href={r.url} target="_blank" rel="noopener noreferrer">
                      {r.fileName}
                    </a>
                  </td>
                  <td>
                    <button
                      type="button"
                      className={`${styles.actionBtn} ${styles.actionReject}`}
                      disabled={deletingId === r.id}
                      onClick={() => void onDelete(r.id)}
                    >
                      {deletingId === r.id ? "削除中…" : "削除"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
