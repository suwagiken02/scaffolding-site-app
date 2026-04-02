import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { todayLocalDateKey } from "../lib/dateUtils";
import { loadStaffMasters } from "../lib/staffMasterStorage";
import { staffIsAttendanceEligible } from "../types/staffMaster";
import {
  deleteAttendanceForPersonDate,
  formatTimeJa,
  getAttendanceRecord,
  loadAttendanceStore,
  nextPunchKind,
  punchAttendance,
} from "../lib/attendanceStorage";
import type { AttendanceStore } from "../types/attendance";
import styles from "./AttendancePage.module.css";

const jaCollator = new Intl.Collator("ja");
const PIN_DEFAULT = "1234";
const AUTH_KEY = "attendancePinAuthed";
/** タブレット常時表示向け：打刻画面の定期リフレッシュ間隔 */
const ATTENDANCE_AUTO_RELOAD_MS = 60 * 60 * 1000;

type ConfirmState = {
  personName: string;
  kind: "in" | "out" | "already_done";
};

type MeetingState = {
  personName: string;
  kind: "in" | "out" | "already_done";
  /** 繰り上げ4つ（10分単位切り上げ＋+10/+20/+30分） */
  optionsUp: string[];
  /** 繰り下げ2つ（10分単位切り捨て＋さらに10分前） */
  optionsDown: string[];
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

function floorTo10Min(date: Date): Date {
  const d = new Date(date);
  d.setSeconds(0, 0);
  const m = d.getMinutes();
  d.setMinutes(Math.floor(m / 10) * 10);
  return d;
}

function toHHmm(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function buildMeetingTimeOptions(now: Date): {
  optionsUp: string[];
  optionsDown: string[];
} {
  const ceil0 = ceilTo10Min(now);
  const optionsUp = [0, 10, 20, 30].map((addMin) =>
    toHHmm(new Date(ceil0.getTime() + addMin * 60000))
  );
  const floor0 = floorTo10Min(now);
  const optionsDown = [
    toHHmm(floor0),
    toHHmm(new Date(floor0.getTime() - 10 * 60000)),
  ];
  return { optionsUp, optionsDown };
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

function formatTodayJp(dateKey: string): string {
  const parts = dateKey.split("-");
  if (parts.length !== 3) return `${dateKey}の打刻`;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return `${dateKey}の打刻`;
  }
  const dt = new Date(y, m - 1, d);
  const wday = ["日", "月", "火", "水", "木", "金", "土"][dt.getDay()];
  return `${y}年${m}月${d}日（${wday}）の打刻`;
}

export function AttendancePage() {
  /** ページ読み込み時の日付（日付またぎでずれたらリロードで再取得） */
  const [todayKey] = useState(() => todayLocalDateKey());
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    const load = () => {
      const all = loadStaffMasters();
      const list = all
        .filter((s) => staffIsAttendanceEligible(s.role))
        .map((s) => ({ id: s.id, name: s.name }));
      setStaff(list);
    };
    load();
    window.addEventListener("storage", load);
    window.addEventListener("focus", load);
    window.addEventListener("staffMasterSaved", load);
    return () => {
      window.removeEventListener("storage", load);
      window.removeEventListener("focus", load);
      window.removeEventListener("staffMasterSaved", load);
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
  const [attStore, setAttStore] = useState<AttendanceStore>({});
  const [attLoadError, setAttLoadError] = useState<string | null>(null);
  const [attRefreshing, setAttRefreshing] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deletePinOpen, setDeletePinOpen] = useState(false);
  const [deleteModePin, setDeleteModePin] = useState("");
  const [deleteModePinError, setDeleteModePinError] = useState<string | null>(
    null
  );

  const confirmRef = useRef<ConfirmState | null>(null);
  const meetingRef = useRef<MeetingState | null>(null);
  const doneMessageRef = useRef<string | null>(null);
  const deleteConfirmRef = useRef<string | null>(null);
  const deletePinOpenRef = useRef(false);
  const punchBusyRef = useRef(false);
  confirmRef.current = confirm;
  meetingRef.current = meeting;
  doneMessageRef.current = doneMessage;
  deleteConfirmRef.current = deleteConfirm;
  deletePinOpenRef.current = deletePinOpen;

  useEffect(() => {
    setConfirm(null);
    setMeeting(null);
    setDeleteConfirm(null);
    setDeletePinOpen(false);
    setDeleteModePin("");
    setDeleteModePinError(null);
  }, [todayKey]);

  const refreshAttendance = useCallback(async () => {
    setAttLoadError(null);
    setAttRefreshing(true);
    try {
      const s = await loadAttendanceStore();
      setAttStore(s);
    } catch (e) {
      setAttLoadError(
        e instanceof Error ? e.message : "打刻データを読み込めませんでした"
      );
    } finally {
      setAttRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!authed) return;
    void refreshAttendance();
  }, [authed, todayKey, refreshAttendance]);

  useEffect(() => {
    if (!authed) return;
    function onSaved() {
      void refreshAttendance();
    }
    window.addEventListener("attendanceSaved", onSaved);
    return () => window.removeEventListener("attendanceSaved", onSaved);
  }, [authed, refreshAttendance]);

  /** 打刻ページを定期的にリロード（sessionStorage の PIN 済みフラグは維持される） */
  useEffect(() => {
    if (!authed) return;
    const intervalId = window.setInterval(() => {
      if (
        punchBusyRef.current ||
        confirmRef.current !== null ||
        meetingRef.current !== null ||
        doneMessageRef.current !== null ||
        deleteConfirmRef.current !== null ||
        deletePinOpenRef.current
      ) {
        return;
      }
      window.location.reload();
    }, ATTENDANCE_AUTO_RELOAD_MS);
    return () => window.clearInterval(intervalId);
  }, [authed]);

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
    setDeleteMode(false);
    setDeleteConfirm(null);
    setDeletePinOpen(false);
    setDeleteModePin("");
    setDeleteModePinError(null);
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

  useEffect(() => {
    if (!deleteConfirm) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setDeleteConfirm(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteConfirm]);

  useEffect(() => {
    if (!deletePinOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setDeletePinOpen(false);
        setDeleteModePin("");
        setDeleteModePinError(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deletePinOpen]);

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
      <header className={styles.dateHeader}>
        <h1 className={styles.dateHeaderTitle}>{formatTodayJp(todayKey)}</h1>
        <button
          type="button"
          className={styles.dateReloadBtn}
          onClick={() => window.location.reload()}
        >
          更新する
        </button>
      </header>

      {attLoadError && (
        <p className={styles.empty} role="alert">
          {attLoadError}
        </p>
      )}
      {attRefreshing && !attLoadError && (
        <p className={styles.empty} aria-live="polite">
          打刻データを読み込み中…
        </p>
      )}

      {people.length === 0 ? (
        <p className={styles.empty}>
          打刻対象のスタッフがいません。マスター設定の「スタッフ」タブで「打刻対象」をONにしてください。
        </p>
      ) : (
        <div className={styles.grid} role="list" aria-label="打刻対象者">
          {people.map((name) => (
            <div key={name} className={styles.personRow}>
              <button
                type="button"
                className={styles.personBtn}
                onClick={() => {
                  const dk = todayKey;
                  const rec = getAttendanceRecord(attStore, name, dk);
                  setConfirm({ personName: name, kind: nextPunchKind(rec) });
                }}
              >
                {name}
              </button>
              {deleteMode && (
                <button
                  type="button"
                  className={styles.deleteMarkBtn}
                  aria-label={`${name}の本日の打刻を削除`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteConfirm(name);
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {deletePinOpen && (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onClick={() => {
            setDeletePinOpen(false);
            setDeleteModePin("");
            setDeleteModePinError(null);
          }}
        >
          <div
            className={styles.pinCard}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-mode-pin-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="delete-mode-pin-title" className={styles.pinTitle}>
              削除モード
            </h2>
            <p className={styles.pinLead}>4桁のPINコードを入力してください。</p>

            <div className={styles.pinDots} aria-label="入力状況">
              {Array.from({ length: 4 }).map((_, i) => (
                <span
                  key={i}
                  className={
                    deleteModePin.length > i ? styles.pinDotOn : styles.pinDotOff
                  }
                />
              ))}
            </div>

            {deleteModePinError && (
              <p className={styles.pinError} role="alert">
                {deleteModePinError}
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
                const disabled = isEnter ? deleteModePin.length !== 4 : false;
                return (
                  <button
                    key={k}
                    type="button"
                    className={isEnter ? styles.enterBtn : styles.keyBtn}
                    disabled={disabled}
                    onClick={() => {
                      setDeleteModePinError(null);
                      if (isEnter) {
                        if (deleteModePin.length !== 4) return;
                        if (deleteModePin === PIN_DEFAULT) {
                          setDeleteMode(true);
                          setDeletePinOpen(false);
                          setDeleteModePin("");
                          setDeleteModePinError(null);
                          return;
                        }
                        setDeleteModePinError("PINが違います");
                        setDeleteModePin("");
                        return;
                      }
                      if (isBack) {
                        setDeleteModePin((p) => p.slice(0, -1));
                        return;
                      }
                      setDeleteModePin((p) =>
                        p.length >= 4 ? p : `${p}${k}`
                      );
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
                  const now = new Date();
                  const { optionsUp, optionsDown } = buildMeetingTimeOptions(now);
                  setConfirm(null);
                  // 集合時間の質問は「出勤」のときだけ。
                  // 「退勤」は集合時間入力をスキップしてそのまま打刻する。
                  if (confirm.kind === "out") {
                    const nowIso = new Date().toISOString();
                    const personName = confirm.personName;
                    void (async () => {
                      punchBusyRef.current = true;
                      try {
                        const dateKey = todayKey;
                        const res = await punchAttendance(
                          personName,
                          dateKey,
                          nowIso,
                          null
                        );
                        const t = formatTimeJa(nowIso);
                        if (res.kind === "out") setDoneMessage(`退勤：${t}`);
                        else if (res.kind === "in") setDoneMessage(`出勤：${t}`);
                        else setDoneMessage(`本日は打刻済みです`);
                      } catch (e) {
                        window.alert(
                          e instanceof Error ? e.message : "打刻の保存に失敗しました"
                        );
                      } finally {
                        punchBusyRef.current = false;
                      }
                    })();
                    return;
                  }
                  setMeeting({
                    personName: confirm.personName,
                    kind: confirm.kind,
                    optionsUp,
                    optionsDown,
                    selected: optionsUp[0] ?? null,
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

      {deleteConfirm && (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onClick={() => setDeleteConfirm(null)}
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="attendance-delete-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="attendance-delete-title" className={styles.modalTitle}>
              {deleteConfirm}さんの本日（
              {todayKey.replaceAll("-", "/")}）の打刻を削除しますか？
            </h2>
            <p className={styles.modalText}>
              この操作は取り消せません。削除するには「削除する」を押してください。
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalBack}
                onClick={() => setDeleteConfirm(null)}
              >
                キャンセル
              </button>
              <button
                type="button"
                className={styles.modalDanger}
                disabled={deleteBusy}
                onClick={() => {
                  const name = deleteConfirm;
                  if (!name) return;
                  void (async () => {
                    setDeleteBusy(true);
                    try {
                      await deleteAttendanceForPersonDate(name, todayKey);
                      await refreshAttendance();
                      setDeleteMode(false);
                      setDeleteConfirm(null);
                    } catch (e) {
                      window.alert(
                        e instanceof Error ? e.message : "削除に失敗しました"
                      );
                    } finally {
                      setDeleteBusy(false);
                    }
                  })();
                }}
              >
                {deleteBusy ? "削除中…" : "削除する"}
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
              {meeting.optionsUp.map((t, i) => (
                <button
                  key={`up-${i}-${t}`}
                  type="button"
                  className={
                    meeting.selected === t ? styles.meetingBtnActive : styles.meetingBtn
                  }
                  onClick={() =>
                    setMeeting((m) =>
                      m ? { ...m, selected: t, otherRaw: "", error: null } : m
                    )
                  }
                >
                  {t}
                </button>
              ))}
              {meeting.optionsDown.map((t, i) => (
                <button
                  key={`down-${i}-${t}`}
                  type="button"
                  className={
                    meeting.selected === t
                      ? styles.meetingBtnDownActive
                      : styles.meetingBtnDown
                  }
                  onClick={() =>
                    setMeeting((m) =>
                      m ? { ...m, selected: t, otherRaw: "", error: null } : m
                    )
                  }
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
                  const personName = meeting.personName;
                  setMeeting(null);
                  void (async () => {
                    punchBusyRef.current = true;
                    try {
                      const dateKey = todayKey;
                      const res = await punchAttendance(
                        personName,
                        dateKey,
                        nowIso,
                        chosen
                      );
                      const t = formatTimeJa(nowIso);
                      if (res.kind === "in") setDoneMessage(`出勤：${t}`);
                      else if (res.kind === "out") setDoneMessage(`退勤：${t}`);
                      else setDoneMessage(`本日は打刻済みです`);
                    } catch (e) {
                      window.alert(
                        e instanceof Error ? e.message : "打刻の保存に失敗しました"
                      );
                    } finally {
                      punchBusyRef.current = false;
                    }
                  })();
                }}
              >
                打刻する
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={styles.resetWrap} aria-label="操作">
        <button
          type="button"
          className={`${styles.deleteModeBtn} ${deleteMode ? styles.deleteModeBtnActive : ""}`}
          onClick={() => {
            if (deleteMode) {
              setDeleteMode(false);
              return;
            }
            setDeleteModePin("");
            setDeleteModePinError(null);
            setDeletePinOpen(true);
          }}
        >
          {deleteMode ? "削除モードを終了" : "削除モード"}
        </button>
        <button type="button" className={styles.resetBtn} onClick={resetPinAuth}>
          PIN認証をリセット
        </button>
      </div>
    </div>
  );
}

