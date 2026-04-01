import { useCallback, useEffect, useMemo, useState } from "react";
import { loadCompanyProfile } from "../lib/companyProfileStorage";
import { downloadRosterXlsx, rosterRowFromStaff } from "../lib/rosterExport";
import { loadStaffMasters } from "../lib/staffMasterStorage";
import type { StaffMaster } from "../types/staffMaster";
import pinStyles from "./LeaveRequestsPage.module.css";
import styles from "./RosterPage.module.css";

const OFFICE_PIN = "1234";
const AUTH_KEY = "rosterOfficeAuthed";

const jaCollator = new Intl.Collator("ja");

export function RosterPage() {
  const [authed, setAuthed] = useState(() => {
    try {
      return sessionStorage.getItem(AUTH_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);

  const [staffList, setStaffList] = useState<StaffMaster[]>(() => loadStaffMasters());
  const [includedIds, setIncludedIds] = useState<Set<string>>(() => {
    return new Set(loadStaffMasters().map((s) => s.id));
  });

  const refreshStaff = useCallback(() => {
    const list = loadStaffMasters();
    setStaffList(list);
    setIncludedIds((prev) => {
      const next = new Set(prev);
      for (const s of list) {
        if (!next.has(s.id)) next.add(s.id);
      }
      for (const id of next) {
        if (!list.some((s) => s.id === id)) next.delete(id);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    window.addEventListener("staffMasterSaved", refreshStaff);
    return () => window.removeEventListener("staffMasterSaved", refreshStaff);
  }, [refreshStaff]);

  const sorted = useMemo(() => {
    return [...staffList].sort((a, b) => jaCollator.compare(a.name, b.name));
  }, [staffList]);

  const exportRows = useMemo(() => {
    return sorted.filter((s) => includedIds.has(s.id));
  }, [sorted, includedIds]);

  const companyName = loadCompanyProfile().companyName.trim();
  const todayLabel = new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "long",
  }).format(new Date());

  function toggleIncluded(id: string, checked: boolean) {
    setIncludedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function onExcel() {
    if (exportRows.length === 0) {
      window.alert("出力するスタッフを1人以上選択してください。");
      return;
    }
    try {
      downloadRosterXlsx(exportRows, companyName, new Date());
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Excelの出力に失敗しました。");
    }
  }

  function onPrint() {
    if (exportRows.length === 0) {
      window.alert("印刷するスタッフを1人以上選択してください。");
      return;
    }
    const cleanup = () => {
      document.body.removeAttribute("data-print-roster");
      window.removeEventListener("afterprint", cleanup);
    };
    document.body.setAttribute("data-print-roster", "1");
    window.addEventListener("afterprint", cleanup);
    window.requestAnimationFrame(() => window.print());
  }

  if (!authed) {
    return (
      <div className={pinStyles.page}>
        <h1 className={pinStyles.title}>名簿管理</h1>
        <p className={pinStyles.lead}>事務員用PIN（4桁）を入力してください。</p>
        <div className={pinStyles.pinBackdrop} style={{ position: "relative", inset: "auto" }}>
          <div
            className={pinStyles.pinCard}
            style={{ margin: "0 auto" }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="roster-office-pin"
          >
            <h2 id="roster-office-pin" className={pinStyles.pinTitle}>
              PINコード
            </h2>
            <p className={pinStyles.pinLead}>4桁のPINを入力してください。</p>
            <div className={pinStyles.pinDots} aria-label="入力状況">
              {Array.from({ length: 4 }).map((_, i) => (
                <span
                  key={i}
                  className={pin.length > i ? pinStyles.pinDotOn : pinStyles.pinDotOff}
                />
              ))}
            </div>
            {pinError && (
              <p className={pinStyles.pinError} role="alert">
                {pinError}
              </p>
            )}
            <div className={pinStyles.keypad} role="group" aria-label="テンキー">
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
                    className={isEnter ? pinStyles.enterBtn : pinStyles.keyBtn}
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
      <div className={styles.noPrint}>
        <h1 className={styles.title}>名簿管理</h1>
        <p className={styles.lead}>
          チェックを外したスタッフはExcel・印刷に含まれません。マスター設定の自社名がヘッダーに表示されます。
        </p>
        <div className={styles.toolbar}>
          <button type="button" className={`${styles.toolBtn} ${styles.toolBtnPrimary}`} onClick={onExcel}>
            Excel出力
          </button>
          <button type="button" className={styles.toolBtn} onClick={onPrint}>
            印刷
          </button>
          <button
            type="button"
            className={styles.toolBtn}
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
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className={styles.empty}>登録されたスタッフがいません。マスター設定で追加してください。</p>
      ) : (
        <div className={styles.sheet}>
          <h2 className={styles.sheetTitle}>作業員名簿（全建統一様式第5号）</h2>
          <p className={styles.sheetMeta}>
            作成日：{todayLabel}
            <br />
            自社名：{companyName || "—"}
          </p>
          <div className={styles.tableWrap}>
            <table className={styles.rosterTable}>
              <thead>
                <tr>
                  <th className={`${styles.checkCol} ${styles.noPrint}`} scope="col">
                    出力
                  </th>
                  <th scope="col">氏名</th>
                  <th scope="col">生年月日</th>
                  <th scope="col">年齢</th>
                  <th scope="col">住所</th>
                  <th scope="col">職種</th>
                  <th scope="col">役職</th>
                  <th scope="col">雇入年月日</th>
                  <th scope="col">健康保険</th>
                  <th scope="col">年金保険</th>
                  <th scope="col">雇用保険</th>
                  <th scope="col">建退共手帳</th>
                  <th scope="col">中退共手帳</th>
                  <th scope="col">資格・免許</th>
                  <th scope="col">緊急連絡先</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((s) => {
                  const inRoster = includedIds.has(s.id);
                  const r = rosterRowFromStaff(s);
                  return (
                    <tr
                      key={s.id}
                      className={inRoster ? undefined : `${styles.rowExcluded} ${styles.rowDimmed}`}
                    >
                      <td className={`${styles.checkCol} ${styles.noPrint}`}>
                        <input
                          type="checkbox"
                          checked={inRoster}
                          onChange={(e) => toggleIncluded(s.id, e.target.checked)}
                          aria-label={`${s.name}を出力に含める`}
                        />
                      </td>
                      <td>{r.name}</td>
                      <td>{r.birth}</td>
                      <td>{r.age}</td>
                      <td>{r.address}</td>
                      <td>{r.jobType}</td>
                      <td>{r.position}</td>
                      <td>{r.hireDate}</td>
                      <td>{r.health}</td>
                      <td>{r.pension}</td>
                      <td>{r.employment}</td>
                      <td>{r.kentai}</td>
                      <td>{r.chutai}</td>
                      <td>{r.qualifications}</td>
                      <td>{r.emergency}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
