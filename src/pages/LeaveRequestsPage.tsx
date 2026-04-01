import { useCallback, useEffect, useState } from "react";
import { decideLeaveRequest, fetchLeaveRequests } from "../lib/leaveRequestsApi";
import { hydrateLocalStorageFromServer } from "../lib/persistStorageApi";
import type { LeaveRequest } from "../types/leaveRequest";
import styles from "./LeaveRequestsPage.module.css";

const OFFICE_PIN = "1234";
const AUTH_KEY = "leaveRequestsOfficeAuthed";

function formatDateKeyJa(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return dateKey;
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium" }).format(
    new Date(y, m - 1, d)
  );
}

function kindLabel(s: LeaveRequest["kind"]): string {
  return s === "paid" ? "有給休暇" : "誕生日休暇";
}

function statusLabel(s: LeaveRequest["status"]): string {
  if (s === "pending") return "申請中";
  if (s === "approved") return "承認済み";
  return "否認";
}

function statusClass(s: LeaveRequest["status"]): string {
  if (s === "pending") return styles.statusPending;
  if (s === "approved") return styles.statusApproved;
  return styles.statusRejected;
}

export function LeaveRequestsPage() {
  const [authed, setAuthed] = useState(() => {
    try {
      return sessionStorage.getItem(AUTH_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);

  const [list, setList] = useState<LeaveRequest[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      const data = await fetchLeaveRequests();
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

  async function onDecide(id: string, action: "approve" | "reject") {
    if (!window.confirm(action === "approve" ? "この申請を承認しますか？" : "この申請を否認しますか？")) {
      return;
    }
    setActionId(id);
    try {
      await decideLeaveRequest(id, action);
      await hydrateLocalStorageFromServer();
      window.dispatchEvent(new CustomEvent("staffMasterSaved"));
      await refresh();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "処理に失敗しました");
    } finally {
      setActionId(null);
    }
  }

  if (!authed) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>休暇申請一覧</h1>
        <p className={styles.lead}>事務員用PIN（4桁）を入力してください。</p>
        <div className={styles.pinBackdrop} style={{ position: "relative", inset: "auto" }}>
          <div
            className={styles.pinCard}
            style={{ margin: "0 auto" }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="leave-office-pin"
          >
            <h2 id="leave-office-pin" className={styles.pinTitle}>
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
      <h1 className={styles.title}>休暇申請一覧</h1>
      <p className={styles.lead}>
        申請の承認・否認を行います。承認するとスタッフマスターに使用記録が追加されます（サーバー保存）。
        自社設定の「事務員の通知先メール」に申請時の通知が届きます。
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

      {loadError && (
        <p className={styles.error} role="alert">
          {loadError}
        </p>
      )}
      {loading && !loadError && <p className={styles.lead}>読み込み中…</p>}

      {!loading && list.length === 0 && !loadError ? (
        <p className={styles.empty}>申請はまだありません。</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>スタッフ</th>
                <th>種別</th>
                <th>期間</th>
                <th>日数</th>
                <th>理由</th>
                <th>ステータス</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id}>
                  <td>{r.staffName}</td>
                  <td>{kindLabel(r.kind)}</td>
                  <td>
                    {formatDateKeyJa(r.startDate)} ～ {formatDateKeyJa(r.endDate)}
                  </td>
                  <td>{r.days} 日</td>
                  <td>{r.reason?.trim() ? r.reason : "—"}</td>
                  <td className={statusClass(r.status)}>{statusLabel(r.status)}</td>
                  <td>
                    {r.status === "pending" ? (
                      <div className={styles.rowActions}>
                        <button
                          type="button"
                          className={`${styles.actionBtn} ${styles.actionApprove}`}
                          disabled={actionId === r.id}
                          onClick={() => void onDecide(r.id, "approve")}
                        >
                          承認
                        </button>
                        <button
                          type="button"
                          className={`${styles.actionBtn} ${styles.actionReject}`}
                          disabled={actionId === r.id}
                          onClick={() => void onDecide(r.id, "reject")}
                        >
                          否認
                        </button>
                      </div>
                    ) : (
                      "—"
                    )}
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
