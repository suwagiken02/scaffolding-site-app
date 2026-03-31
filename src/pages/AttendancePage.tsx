import { useEffect, useMemo, useState } from "react";
import { todayLocalDateKey } from "../lib/dateUtils";
import { loadStaffMasters } from "../lib/staffMasterStorage";
import {
  formatTimeJa,
  loadAttendanceForPersonDate,
  nextPunchKind,
  punchAttendance,
} from "../lib/attendanceStorage";
import styles from "./AttendancePage.module.css";

const jaCollator = new Intl.Collator("ja");
const PIN_DEFAULT = "1234";
const AUTH_KEY = "attendancePinAuthed";

type ConfirmState = {
  personName: string;
  kind: "in" | "out" | "already_done";
};

type MeetingState = {
  personName: string;
  kind: "in" | "out" | "already_done";
  opt1: string;
  opt2: string;
  selected: string | null;
  otherRaw: string;
  error: string | null;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function ceilTo10Min(date: Date): Date {
  const d = new Date(date);
  d.setSeconds(0, 0);
  const m = d.getMinutes();
  const next = Math.ceil(m / 10) * 10;
  if (next === 60) {
    d.setHours(d.getHours() + 1);
    d.setMinutes(0);
  } else {
    d.setMinutes(next);
  }
  return d;
}

function toHHmm(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function normalizeHHmmOrNull(raw: string): string | null {
  const t = raw.trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23) return null;
  if (mm < 0 || mm > 59) return null;
  return `${pad2(hh)}:${pad2(mm)}`;
}

export function AttendancePage() {
  const todayKey = useMemo(() => todayLocalDateKey(), []);
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    const load = () => {
      const all = loadStaffMasters();
      const list = all
        .filter((s) => s.attendanceEnabled)
        .map((s) => ({ id: s.id, name: s.name }));
      setStaff(list);
    };
    load();
    window.addEventListener("storage", load);
    window.addEventListener("focus", load);
    return () => {
      window.removeEventListener("storage", load);
      window.removeEventListener("focus", load);
    };
  }, []);

  const people = useMemo(() => {
    const names = staff.map((x) => x?.name?.trim?.() ?? "").filter(Boolean);
    const set = new Set<string>(names.filter(Boolean));
    return [...set].sort((a, b) => jaCollator.compare(a, b));
  }, [staff]);

  const [authed, setAuthed] = useState(() => {
    try {
      return sessionStorage.getItem(AUTH_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);

  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [meeting, setMeeting] = useState<MeetingState | null>(null);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);

  function resetPinAuth() {
    try {
      sessionStorage.removeItem(AUTH_KEY);
    } catch {
      // ignore
    }
    setAuthed(false);
    setPin("");
    setPinError(null);
    setConfirm(null);
    setMeeting(null);
    setDoneMessage(null);
  }

  useEffect(() => {
    if (!doneMessage) return;
    const t = window.setTimeout(() => setDoneMessage(null), 3000);
    return () => window.clearTimeout(t);
  }, [doneMessage]);

  useEffect(() => {
    if (!confirm) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setConfirm(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirm]);

  useEffect(() => {
    if (!meeting) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMeeting(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [meeting]);

  if (!authed) {
    return (
      <div className={styles.pinPage}>
        <div className={styles.pinCard} role="region" aria-label="PINコード認証">
          <h1 className={styles.pinTitle}>PINコード</h1>
          <p className={styles.pinLead}>4桁のPINコードを入力してください。</p>

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
              const label = isEnter ? "入室" : isBack ? "⌫" : k;
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
                      if (pin === PIN_DEFAULT) {
                        try {
                          sessionStorage.setItem(AUTH_KEY, "1");
                        } catch {
                          // ignore
                        }
                        setAuthed(true);
                        setPin("");
                        setPinError(null);
                        return;
                      }
                      setPinError("PINが違います");
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
                    isEnter
                      ? "入室"
                      : isBack
                        ? "1文字削除"
                        : `数字${k}`
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (doneMessage) {
    return (
      <div className={styles.done} role="status" aria-live="polite">
        <div className={styles.doneCard}>
          <div className={styles.doneTitle}>打刻完了！</div>
          <div className={styles.doneText}>{doneMessage}</div>
          <div className={styles.doneHint}>3秒後に元の画面に戻ります。</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>打刻</h1>
      <p className={styles.lead}>本日（{todayKey.replaceAll("-", "/")}）の出勤・退勤を打刻します。</p>

      {people.length === 0 ? (
        <p className={styles.empty}>
          打刻対象のスタッフがいません。マスター設定の「スタッフ」タブで「打刻対象」をONにしてください。
        </p>
      ) : (
        <div className={styles.grid} role="list" aria-label="打刻対象者">
          {people.map((name) => (
            <button
              key={name}
              type="button"
              className={styles.personBtn}
              onClick={() => {
                const rec = loadAttendanceForPersonDate(name, todayKey);
                setConfirm({ personName: name, kind: nextPunchKind(rec) });
              }}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {confirm && (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onClick={() => setConfirm(null)}
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="attendance-confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="attendance-confirm-title" className={styles.modalTitle}>
              {confirm.personName}さんで
              {confirm.kind === "in"
                ? "出勤"
                : confirm.kind === "out"
                  ? "退勤"
                  : "打刻"}
              しますか？
            </h2>

            {confirm.kind === "already_done" ? (
              <p className={styles.modalText}>
                本日は既に出勤・退勤の打刻が完了しています。
              </p>
            ) : (
              <p className={styles.modalText}>
                「はい」を押すと
                {confirm.kind === "in" ? "出勤" : "退勤"}として打刻します。
              </p>
            )}

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalBack}
                onClick={() => setConfirm(null)}
              >
                戻る
              </button>
              <button
                type="button"
                className={styles.modalYes}
                disabled={confirm.kind === "already_done"}
                onClick={() => {
                  const base = ceilTo10Min(new Date());
                  const opt1 = toHHmm(base);
                  const opt2 = toHHmm(new Date(base.getTime() + 10 * 60000));
                  setConfirm(null);
                  setMeeting({
                    personName: confirm.personName,
                    kind: confirm.kind,
                    opt1,
                    opt2,
                    selected: opt1,
                    otherRaw: "",
                    error: null,
                  });
                }}
              >
                はい
              </button>
            </div>
          </div>
        </div>
      )}

      {meeting && (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onClick={() => setMeeting(null)}
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="attendance-meeting-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="attendance-meeting-title" className={styles.modalTitle}>
              集合時間は何時でしたか？
            </h2>
            <p className={styles.modalText}>
              {meeting.personName}さんの
              {meeting.kind === "in" ? "出勤" : meeting.kind === "out" ? "退勤" : "打刻"}
              を確定する前に、集合時間を選んでください。
            </p>

            {meeting.error && (
              <p className={styles.meetingError} role="alert">
                {meeting.error}
              </p>
            )}

            <div className={styles.meetingOptions} role="group" aria-label="集合時間の候補">
              {[meeting.opt1, meeting.opt2].map((t) => (
                <button
                  key={t}
                  type="button"
                  className={
                    meeting.selected === t ? styles.meetingBtnActive : styles.meetingBtn
                  }
                  onClick={() => setMeeting((m) => (m ? { ...m, selected: t, otherRaw: "", error: null } : m))}
                >
                  {t}
                </button>
              ))}
            </div>

            <label className={styles.meetingOther}>
              <span className={styles.meetingOtherLabel}>その他（HH:MM）</span>
              <input
                className={styles.meetingOtherInput}
                type="text"
                inputMode="numeric"
                placeholder="例：07:00"
                value={meeting.otherRaw}
                onChange={(e) =>
                  setMeeting((m) =>
                    m
                      ? { ...m, otherRaw: e.target.value, selected: null, error: null }
                      : m
                  )
                }
              />
            </label>

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalBack}
                onClick={() => setMeeting(null)}
              >
                戻る
              </button>
              <button
                type="button"
                className={styles.modalYes}
                onClick={() => {
                  const chosen =
                    meeting.selected ?? normalizeHHmmOrNull(meeting.otherRaw);
                  if (!chosen) {
                    setMeeting((m) =>
                      m ? { ...m, error: "集合時間は HH:MM 形式で入力してください。" } : m
                    );
                    return;
                  }
                  const nowIso = new Date().toISOString();
                  const res = punchAttendance(meeting.personName, todayKey, nowIso, chosen);
                  const t = formatTimeJa(nowIso);
                  setMeeting(null);
                  if (res.kind === "in") setDoneMessage(`出勤：${t}`);
                  else if (res.kind === "out") setDoneMessage(`退勤：${t}`);
                  else setDoneMessage(`本日は打刻済みです`);
                }}
              >
                打刻する
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={styles.resetWrap} aria-label="開発用">
        <button type="button" className={styles.resetBtn} onClick={resetPinAuth}>
          PIN認証をリセット
        </button>
      </div>
    </div>
  );
}

