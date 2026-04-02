import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { StaffMaster } from "../types/staffMaster";
import { loadStaffMasters } from "../lib/staffMasterStorage";
import { setStaffPersonalAuthed } from "../lib/staffPersonalSession";
import styles from "./StaffListPage.module.css";

const jaCollator = new Intl.Collator("ja");

function staffJobTypeLabel(s: StaffMaster): string {
  const j = s.jobType.trim();
  if (j) return j;
  if (s.role) return s.role;
  return "—";
}

export function StaffListPage() {
  const navigate = useNavigate();
  const [list, setList] = useState<StaffMaster[]>(() => loadStaffMasters());
  const [pinTarget, setPinTarget] = useState<StaffMaster | null>(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);

  useEffect(() => {
    function refresh() {
      setList(loadStaffMasters());
    }
    window.addEventListener("staffMasterSaved", refresh);
    return () => window.removeEventListener("staffMasterSaved", refresh);
  }, []);

  useEffect(() => {
    if (!pinTarget) return;
    setPin("");
    setPinError(null);
  }, [pinTarget]);

  const sorted = useMemo(() => {
    return [...list].sort((a, b) => jaCollator.compare(a.name, b.name));
  }, [list]);

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>スタッフ</h1>
      <p className={styles.lead}>
        名前を選ぶと PIN を入力し、個人ページを開けます。PIN はマスター設定のスタッフで事務員が設定します。
      </p>

      {sorted.length === 0 ? (
        <p className={styles.empty}>登録されたスタッフがいません。</p>
      ) : (
        <ul className={styles.list} aria-label="スタッフ一覧">
          {sorted.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className={styles.rowBtn}
                onClick={() => setPinTarget(s)}
              >
                <span className={styles.rowName}>{s.name}</span>
                <span className={styles.rowJob}>{staffJobTypeLabel(s)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {pinTarget && (
        <div
          className={styles.pinBackdrop}
          role="presentation"
          onClick={() => setPinTarget(null)}
        >
          <div
            className={styles.pinCard}
            role="dialog"
            aria-modal="true"
            aria-labelledby="staff-list-pin-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="staff-list-pin-title" className={styles.pinTitle}>
              PINコード
            </h2>
            <p className={styles.pinLead}>
              {pinTarget.name}さんの個人ページを開くため、4桁のPINを入力してください。
            </p>
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
                        const expected = pinTarget.personalPin;
                        if (!expected || expected.length !== 4) {
                          setPinError("個人PINが未設定です。マスター設定で設定してください。");
                          setPin("");
                          return;
                        }
                        if (pin !== expected) {
                          setPinError("PINが違います");
                          setPin("");
                          return;
                        }
                        const id = pinTarget.id;
                        setPinTarget(null);
                        setPin("");
                        setStaffPersonalAuthed(id);
                        navigate(`/staff/${id}`);
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
            <div className={styles.pinFooter}>
              <button
                type="button"
                className={styles.modalBack}
                onClick={() => setPinTarget(null)}
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
