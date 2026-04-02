import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import type { LeaveRequest } from "../types/leaveRequest";
import type { PayslipRecord } from "../types/payslip";
import type { StaffMaster, StaffPaidLeaveUsage } from "../types/staffMaster";
import { fetchPayslipsForStaff } from "../lib/payslipsApi";
import { createLeaveRequest, fetchLeaveRequests } from "../lib/leaveRequestsApi";
import { registerCurrentFcmTokenToServer } from "../lib/fcmInit";
import { hydrateLocalStorageFromServer } from "../lib/persistStorageApi";
import { ageFromBirthDate } from "../lib/ageFromBirthDate";
import { buildLaborListRowsForPerson } from "../lib/laborListForPerson";
import {
  formatDurationHm,
  formatTimeJa,
  getAttendanceRecord,
  hhmmFromLocalIso,
  isCheckInLate,
  listAttendanceInMonth,
  loadAttendanceStore,
  updateAttendanceFromHHmmFields,
  workMinutes,
} from "../lib/attendanceStorage";
import type { AttendanceRecord, AttendanceStore } from "../types/attendance";
import {
  birthdayLeaveRemaining,
  buildPaidLeaveHistory,
  computePaidLeaveBuckets,
  nextPaidGrantInfo,
} from "../lib/paidLeave";
import {
  getStaffMasterById,
  updateStaffMaster,
} from "../lib/staffMasterStorage";
import {
  clearFcmStaffContext,
  clearStaffPersonalAuthed,
  isStaffPersonalAuthed,
  setFcmStaffContext,
  setStaffPersonalAuthed,
} from "../lib/staffPersonalSession";
import laborStyles from "./LaborManagementPage.module.css";
import pinStyles from "./StaffListPage.module.css";
import styles from "./StaffPersonalPage.module.css";

const jaCollator = new Intl.Collator("ja");
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
/** 勤怠一覧の編集時PIN（稼働管理の一覧タブと同じ） */
const ATT_EDIT_PIN = "1234";

function yearOptions(): number[] {
  const y = new Date().getFullYear();
  const out: number[] = [];
  for (let i = y - 5; i <= y + 3; i++) out.push(i);
  return out;
}

function formatDateKeyJa(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return dateKey;
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium" }).format(
    new Date(y, m - 1, d)
  );
}

function cloneStaff(s: StaffMaster): StaffMaster {
  return JSON.parse(JSON.stringify(s)) as StaffMaster;
}

function leaveKindLabel(k: LeaveRequest["kind"]): string {
  return k === "paid" ? "有給休暇" : "誕生日休暇";
}

function leaveStatusLabel(s: LeaveRequest["status"]): string {
  if (s === "pending") return "申請中";
  if (s === "approved") return "承認済み";
  return "否認";
}

function formatYearMonthJa(ym: string): string {
  const [y, m] = ym.split("-");
  if (!y || !m) return ym;
  return `${y}年${parseInt(m, 10)}月`;
}

export function StaffPersonalPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [staff, setStaff] = useState<StaffMaster | null>(() =>
    id ? getStaffMasterById(id) ?? null : null
  );
  const [draft, setDraft] = useState<StaffMaster | null>(null);
  const [attRevision, setAttRevision] = useState(0);
  const [attStore, setAttStore] = useState<AttendanceStore>({});
  const [attLoadError, setAttLoadError] = useState<string | null>(null);
  const [attLoading, setAttLoading] = useState(false);

  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** sessionStorage 更新後に再描画するため */
  const [sessionBump, setSessionBump] = useState(0);

  const [paidNewDate, setPaidNewDate] = useState("");
  const [paidNewDays, setPaidNewDays] = useState("1");
  const [birthNewDate, setBirthNewDate] = useState("");

  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [lrKind, setLrKind] = useState<"paid" | "birthday">("paid");
  const [lrStart, setLrStart] = useState("");
  const [lrEnd, setLrEnd] = useState("");
  const [lrDays, setLrDays] = useState("1");
  const [lrReason, setLrReason] = useState("");
  const [lrSubmitError, setLrSubmitError] = useState<string | null>(null);
  const [myLeaveRequests, setMyLeaveRequests] = useState<LeaveRequest[]>([]);
  const [leaveReqLoading, setLeaveReqLoading] = useState(false);
  const [leaveReqError, setLeaveReqError] = useState<string | null>(null);

  const [myPayslips, setMyPayslips] = useState<PayslipRecord[]>([]);
  const [payslipLoading, setPayslipLoading] = useState(false);
  const [payslipError, setPayslipError] = useState<string | null>(null);

  const [attPinGate, setAttPinGate] = useState<null | { dateKey: string }>(
    null
  );
  const [attGatePin, setAttGatePin] = useState("");
  const [attGatePinError, setAttGatePinError] = useState<string | null>(null);
  const [attEditModal, setAttEditModal] = useState<null | { dateKey: string }>(
    null
  );
  const [attEditIn, setAttEditIn] = useState("");
  const [attEditOut, setAttEditOut] = useState("");
  const [attEditMeeting, setAttEditMeeting] = useState("");
  const [attEditError, setAttEditError] = useState<string | null>(null);

  const authed = useMemo(
    () => Boolean(id && isStaffPersonalAuthed(id)),
    [id, sessionBump]
  );

  useEffect(() => {
    if (!id) return;
    function load() {
      setStaff(getStaffMasterById(id) ?? null);
    }
    load();
    window.addEventListener("staffMasterSaved", load);
    return () => window.removeEventListener("staffMasterSaved", load);
  }, [id]);

  useEffect(() => {
    if (!staff || !authed) {
      setDraft(null);
      return;
    }
    setDraft(cloneStaff(staff));
  }, [staff, authed]);

  useEffect(() => {
    if (!authed) return;
    let cancelled = false;
    setAttLoading(true);
    setAttLoadError(null);
    void (async () => {
      try {
        const s = await loadAttendanceStore();
        if (!cancelled) setAttStore(s);
      } catch (e) {
        if (!cancelled) {
          setAttLoadError(
            e instanceof Error ? e.message : "打刻データの読み込みに失敗しました"
          );
          setAttStore({});
        }
      } finally {
        if (!cancelled) setAttLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authed, attRevision]);

  useEffect(() => {
    const bump = () => setAttRevision((x) => x + 1);
    window.addEventListener("attendanceSaved", bump);
    return () => window.removeEventListener("attendanceSaved", bump);
  }, []);

  useEffect(() => {
    if (!authed) return;
    setPin("");
    setPinError(null);
  }, [authed]);

  useEffect(() => {
    if (!authed || !id) return;
    const nm = draft?.name?.trim() ?? staff?.name?.trim() ?? "";
    if (nm) setFcmStaffContext(nm);
    void registerCurrentFcmTokenToServer();
  }, [authed, id, draft?.name, staff?.name]);

  useEffect(() => {
    if (!authed || !id) return;
    void hydrateLocalStorageFromServer().then(() => {
      window.dispatchEvent(new CustomEvent("staffMasterSaved"));
    });
  }, [authed, id]);

  useEffect(() => {
    if (!authed || !id) return;
    let cancelled = false;
    setLeaveReqLoading(true);
    void (async () => {
      try {
        const all = await fetchLeaveRequests();
        if (!cancelled) {
          setMyLeaveRequests(all.filter((r) => r.staffId === id));
          setLeaveReqError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setLeaveReqError(
            e instanceof Error ? e.message : "休暇申請の読み込みに失敗しました"
          );
          setMyLeaveRequests([]);
        }
      } finally {
        if (!cancelled) setLeaveReqLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authed, id]);

  useEffect(() => {
    if (!authed || !id) return;
    let cancelled = false;
    setPayslipLoading(true);
    setPayslipError(null);
    void (async () => {
      try {
        const rows = await fetchPayslipsForStaff(id);
        if (!cancelled) setMyPayslips(rows);
      } catch (e) {
        if (!cancelled) {
          setPayslipError(
            e instanceof Error ? e.message : "給与明細の読み込みに失敗しました"
          );
          setMyPayslips([]);
        }
      } finally {
        if (!cancelled) setPayslipLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authed, id]);

  useEffect(() => {
    if (!leaveModalOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setLeaveModalOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [leaveModalOpen]);

  useEffect(() => {
    if (!attPinGate && !attEditModal) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setAttPinGate(null);
        setAttEditModal(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [attPinGate, attEditModal]);

  const personName = draft?.name.trim() ?? "";

  useEffect(() => {
    if (!attEditModal || !personName) return;
    const rec = getAttendanceRecord(attStore, personName, attEditModal.dateKey);
    setAttEditIn(hhmmFromLocalIso(rec.inAt));
    setAttEditOut(hhmmFromLocalIso(rec.outAt));
    setAttEditMeeting(rec.meetingTime ?? "");
    setAttEditError(null);
  }, [attEditModal, personName, attStore]);

  useEffect(() => {
    if (!attPinGate) return;
    setAttGatePin("");
    setAttGatePinError(null);
  }, [attPinGate]);

  const attendanceRows = useMemo(() => {
    if (!personName) return [];
    return listAttendanceInMonth(attStore, personName, year, month);
  }, [personName, year, month, attStore]);

  const attendanceByDate = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    for (const r of attendanceRows) map.set(r.dateKey, r);
    return map;
  }, [attendanceRows]);

  const attendanceTotalMinutes = useMemo(() => {
    let total = 0;
    for (const r of attendanceRows) {
      const m = workMinutes(r);
      if (m !== null) total += m;
    }
    return total;
  }, [attendanceRows]);

  const listRows = useMemo(
    () => buildLaborListRowsForPerson(personName, year, month, jaCollator),
    [personName, year, month]
  );

  const age = draft?.birthDate ? ageFromBirthDate(draft.birthDate) : null;

  const paidLeaveStats = useMemo(() => {
    if (!draft?.hireDate?.trim()) return null;
    return computePaidLeaveBuckets(draft.hireDate, draft.paidLeaveUsages ?? []);
  }, [draft]);

  const nextGrant = useMemo(() => {
    if (!draft?.hireDate?.trim()) return null;
    return nextPaidGrantInfo(draft.hireDate);
  }, [draft]);

  const birthdayRemain = useMemo(() => {
    if (!draft?.birthDate?.trim() || !draft?.hireDate?.trim()) return null;
    return birthdayLeaveRemaining(
      draft.birthDate,
      draft.hireDate,
      draft.birthdayLeaveUsages ?? []
    );
  }, [draft]);

  const paidHistory = useMemo(() => {
    if (!draft?.hireDate?.trim()) return [];
    return buildPaidLeaveHistory(draft.hireDate, draft.paidLeaveUsages ?? []);
  }, [draft]);

  function persistDraft(next: StaffMaster) {
    if (!id) return;
    updateStaffMaster(next);
    const fresh = getStaffMasterById(id);
    if (fresh) setDraft(cloneStaff(fresh));
  }

  function addPaidUsage() {
    if (!draft) return;
    const days = Math.max(0, Number(String(paidNewDays).replace(/[^\d.]/g, "")) || 0);
    if (!paidNewDate || !/^\d{4}-\d{2}-\d{2}$/.test(paidNewDate) || days <= 0) {
      window.alert("使用日と日数を正しく入力してください。");
      return;
    }
    persistDraft({
      ...draft,
      paidLeaveUsages: [...(draft.paidLeaveUsages ?? []), { dateKey: paidNewDate, days }],
    });
    setPaidNewDate("");
    setPaidNewDays("1");
  }

  function removePaidUsage(u: StaffPaidLeaveUsage) {
    if (!draft) return;
    const idx = draft.paidLeaveUsages.findIndex(
      (x) => x.dateKey === u.dateKey && x.days === u.days
    );
    if (idx < 0) return;
    persistDraft({
      ...draft,
      paidLeaveUsages: draft.paidLeaveUsages.filter((_, j) => j !== idx),
    });
  }

  function addBirthdayUsage() {
    if (!draft) return;
    if (!birthNewDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthNewDate)) {
      window.alert("使用日を入力してください。");
      return;
    }
    persistDraft({
      ...draft,
      birthdayLeaveUsages: [
        ...(draft.birthdayLeaveUsages ?? []),
        { dateKey: birthNewDate, days: 1 },
      ],
    });
    setBirthNewDate("");
  }

  function removeBirthdayUsage(index: number) {
    if (!draft) return;
    persistDraft({
      ...draft,
      birthdayLeaveUsages: draft.birthdayLeaveUsages.filter((_, j) => j !== index),
    });
  }

  async function submitLeaveRequest() {
    if (!draft || !id) return;
    setLrSubmitError(null);
    const days = parseFloat(String(lrDays).replace(",", "."));
    if (!lrStart || !lrEnd || !/^\d{4}-\d{2}-\d{2}$/.test(lrStart) || !/^\d{4}-\d{2}-\d{2}$/.test(lrEnd)) {
      setLrSubmitError("開始日・終了日を入力してください。");
      return;
    }
    if (lrStart > lrEnd) {
      setLrSubmitError("終了日は開始日以降にしてください。");
      return;
    }
    if (!(days > 0)) {
      setLrSubmitError("日数は正の数にしてください。");
      return;
    }
    try {
      await createLeaveRequest({
        staffId: id,
        staffName: draft.name.trim(),
        kind: lrKind,
        startDate: lrStart,
        endDate: lrEnd,
        days,
        reason: lrReason.trim(),
      });
      const all = await fetchLeaveRequests();
      setMyLeaveRequests(all.filter((r) => r.staffId === id));
      setLeaveModalOpen(false);
      setLrReason("");
      setLrSubmitError(null);
    } catch (e) {
      setLrSubmitError(e instanceof Error ? e.message : "送信に失敗しました。");
    }
  }

  function onSubmitProfile(e: FormEvent) {
    e.preventDefault();
    setSaveMsg(null);
    setSaveError(null);
    if (!draft || !id) return;
    try {
      updateStaffMaster(draft);
      const next = getStaffMasterById(id);
      if (next) setDraft(cloneStaff(next));
      setSaveMsg("保存しました。");
      window.setTimeout(() => setSaveMsg(null), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "保存に失敗しました。");
    }
  }

  if (!id) {
    return <Navigate to="/staff" replace />;
  }

  if (!staff) {
    return <Navigate to="/staff" replace />;
  }

  if (!authed) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>PINコード</h1>
        <p className={styles.lead}>
          {staff.name}さんの個人ページを表示するには、4桁のPINを入力してください。
        </p>
        <div className={pinStyles.pinBackdrop} style={{ position: "relative", inset: "auto" }}>
          <div
            className={pinStyles.pinCard}
            style={{ margin: "0 auto", maxWidth: 420 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="staff-personal-pin-title"
          >
            <h2 id="staff-personal-pin-title" className={pinStyles.pinTitle}>
              PIN入力
            </h2>
            <p className={pinStyles.pinLead}>4桁のPINコードを入力してください。</p>
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
                        const expected = staff.personalPin;
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
                        setStaffPersonalAuthed(id);
                        const nm = staff.name?.trim() ?? "";
                        if (nm) setFcmStaffContext(nm);
                        void registerCurrentFcmTokenToServer();
                        setPin("");
                        setSessionBump((x) => x + 1);
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
            <div className={pinStyles.pinFooter}>
              <button
                type="button"
                className={pinStyles.modalBack}
                onClick={() => navigate("/staff")}
              >
                スタッフ一覧に戻る
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className={styles.page}>
        <p className={styles.lead}>読み込み中…</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.logoutRow}>
        <Link to="/staff" className={styles.logoutBtn}>
          ← スタッフ一覧
        </Link>
        <button
          type="button"
          className={styles.logoutBtn}
          onClick={() => {
            clearStaffPersonalAuthed(id);
            clearFcmStaffContext();
            navigate("/staff");
          }}
        >
          PINを切って終了
        </button>
      </div>

      <h1 className={styles.title}>個人ページ（{draft.name}）</h1>
      <p className={styles.lead}>
        プロフィールを編集して保存できます。勤怠は打刻・稼働管理と同じデータを参照します。
      </p>

      <section className={styles.section} aria-label="休暇申請">
        <h2 className={styles.sectionTitle}>休暇申請</h2>
        <button
          type="button"
          className={styles.applyBtn}
          onClick={() => {
            setLrSubmitError(null);
            setLeaveModalOpen(true);
          }}
        >
          休暇を申請する
        </button>
        <p className={styles.leaveHint}>
          申請を送ると事務員（自社設定の通知先メール）に通知されます。承認後に有給・誕生日休暇から日数が差し引かれます。
        </p>
        {leaveReqError && (
          <p className={styles.saveError} role="alert">
            {leaveReqError}
          </p>
        )}
        {leaveReqLoading && !leaveReqError && (
          <p className={styles.lead}>申請一覧を読み込み中…</p>
        )}
        {!leaveReqLoading && myLeaveRequests.length === 0 && !leaveReqError && (
          <p className={styles.leaveHint}>まだ申請がありません。</p>
        )}
        {myLeaveRequests.length > 0 && (
          <div className={styles.leaveTableWrap}>
            <table className={styles.leaveTable}>
              <thead>
                <tr>
                  <th>種別</th>
                  <th>期間</th>
                  <th>日数</th>
                  <th>理由</th>
                  <th>ステータス</th>
                </tr>
              </thead>
              <tbody>
                {[...myLeaveRequests]
                  .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                  .map((r) => (
                  <tr key={r.id}>
                    <td>{leaveKindLabel(r.kind)}</td>
                    <td>
                      {formatDateKeyJa(r.startDate)} ～ {formatDateKeyJa(r.endDate)}
                    </td>
                    <td>{r.days} 日</td>
                    <td>{r.reason?.trim() ? r.reason : "—"}</td>
                    <td
                      className={
                        r.status === "pending"
                          ? styles.reqStatusP
                          : r.status === "approved"
                            ? styles.reqStatusOk
                            : styles.reqStatusNg
                      }
                    >
                      {leaveStatusLabel(r.status)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.section} aria-label="給与明細">
        <h2 className={styles.sectionTitle}>給与明細</h2>
        {payslipError && (
          <p className={styles.saveError} role="alert">
            {payslipError}
          </p>
        )}
        {payslipLoading && !payslipError && (
          <p className={styles.lead}>給与明細を読み込み中…</p>
        )}
        {!payslipLoading && myPayslips.length === 0 && !payslipError && (
          <p className={styles.leaveHint}>まだ給与明細がありません。</p>
        )}
        {myPayslips.length > 0 && (
          <ul className={styles.payslipList}>
            {myPayslips.map((p) => (
              <li key={p.id}>
                <a
                  className={styles.payslipLink}
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {formatYearMonthJa(p.yearMonth)} — PDFを開く（{p.fileName}）
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form className={styles.section} onSubmit={onSubmitProfile} noValidate>
        <h2 className={styles.sectionTitle}>プロフィール</h2>
        <div className={styles.grid}>
          <label className={styles.field}>
            <span className={styles.label}>氏名</span>
            <input
              className={styles.input}
              type="text"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              autoComplete="name"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>メールアドレス（通知用）</span>
            <input
              className={styles.input}
              type="email"
              value={draft.email ?? ""}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              autoComplete="email"
              placeholder="休暇申請の結果通知など"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>生年月日</span>
            <input
              className={styles.input}
              type="date"
              value={draft.birthDate}
              onChange={(e) => setDraft({ ...draft, birthDate: e.target.value })}
            />
          </label>
          <div className={styles.field}>
            <span className={styles.label}>年齢</span>
            <p className={styles.ageHint}>
              {age !== null ? `${age} 歳` : "—（生年月日を入力すると表示）"}
            </p>
          </div>
          <label className={`${styles.field} ${styles.fieldFull}`}>
            <span className={styles.label}>現住所</span>
            <input
              className={styles.input}
              type="text"
              value={draft.address}
              onChange={(e) => setDraft({ ...draft, address: e.target.value })}
              autoComplete="street-address"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>職種</span>
            <input
              className={styles.input}
              type="text"
              value={draft.jobType}
              onChange={(e) => setDraft({ ...draft, jobType: e.target.value })}
              placeholder="例：足場工"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>役職</span>
            <input
              className={styles.input}
              type="text"
              value={draft.position}
              onChange={(e) => setDraft({ ...draft, position: e.target.value })}
              placeholder="例：職長・作業員"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>雇入年月日（入社日）</span>
            <input
              className={styles.input}
              type="date"
              value={draft.hireDate}
              onChange={(e) => setDraft({ ...draft, hireDate: e.target.value })}
            />
          </label>
        </div>

        <h3 className={styles.sectionTitle} style={{ marginTop: "1.25rem", fontSize: "1rem" }}>
          緊急連絡先
        </h3>
        <div className={styles.grid}>
          <label className={styles.field}>
            <span className={styles.label}>氏名</span>
            <input
              className={styles.input}
              type="text"
              value={draft.emergencyContact.name}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  emergencyContact: { ...draft.emergencyContact, name: e.target.value },
                })
              }
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>続柄</span>
            <input
              className={styles.input}
              type="text"
              value={draft.emergencyContact.relationship}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  emergencyContact: {
                    ...draft.emergencyContact,
                    relationship: e.target.value,
                  },
                })
              }
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>電話番号</span>
            <input
              className={styles.input}
              type="tel"
              value={draft.emergencyContact.phone}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  emergencyContact: { ...draft.emergencyContact, phone: e.target.value },
                })
              }
            />
          </label>
        </div>

        <h3 className={styles.sectionTitle} style={{ marginTop: "1.25rem", fontSize: "1rem" }}>
          保険情報
        </h3>
        <div className={styles.grid}>
          <label className={styles.field}>
            <span className={styles.label}>健康保険</span>
            <input
              className={styles.input}
              type="text"
              value={draft.insurance.health}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  insurance: { ...draft.insurance, health: e.target.value },
                })
              }
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>年金</span>
            <input
              className={styles.input}
              type="text"
              value={draft.insurance.pension}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  insurance: { ...draft.insurance, pension: e.target.value },
                })
              }
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>雇用保険</span>
            <input
              className={styles.input}
              type="text"
              value={draft.insurance.employment}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  insurance: { ...draft.insurance, employment: e.target.value },
                })
              }
            />
          </label>
        </div>

        <div className={styles.checkboxRow} style={{ marginTop: "1rem" }}>
          <label className={styles.checkboxItem}>
            <input
              type="checkbox"
              checked={draft.kentaiBook}
              onChange={(e) => setDraft({ ...draft, kentaiBook: e.target.checked })}
            />
            <span>建退共手帳あり</span>
          </label>
          <label className={styles.checkboxItem}>
            <input
              type="checkbox"
              checked={draft.chutaiBook}
              onChange={(e) => setDraft({ ...draft, chutaiBook: e.target.checked })}
            />
            <span>中退共手帳あり</span>
          </label>
        </div>

        <h3 className={styles.sectionTitle} style={{ marginTop: "1.25rem", fontSize: "1rem" }}>
          資格・免許
        </h3>
        <div className={styles.qualList}>
          {draft.qualifications.map((q, i) => (
            <div key={i} className={styles.qualRow}>
              <input
                className={`${styles.input} ${styles.qualInput}`}
                type="text"
                value={q}
                onChange={(e) => {
                  const next = [...draft.qualifications];
                  next[i] = e.target.value;
                  setDraft({ ...draft, qualifications: next });
                }}
                placeholder="資格・免許名"
              />
              <button
                type="button"
                className={`${styles.btnSmall} ${styles.btnDanger}`}
                onClick={() => {
                  const next = draft.qualifications.filter((_, j) => j !== i);
                  setDraft({ ...draft, qualifications: next });
                }}
              >
                削除
              </button>
            </div>
          ))}
          <button
            type="button"
            className={styles.btnSmall}
            onClick={() =>
              setDraft({ ...draft, qualifications: [...draft.qualifications, ""] })
            }
          >
            ＋ 資格・免許を追加
          </button>
        </div>

        <p className={styles.readOnlyHint} style={{ marginTop: "1rem" }}>
          マスター上の「役割」「打刻対象」「個人PIN」はマスター設定画面でのみ変更されます。メールは休暇申請の承認・否認通知に使います。
        </p>

        <div className={styles.saveRow}>
          <button type="submit" className={styles.saveBtn}>
            プロフィールを保存
          </button>
          {saveMsg && <p className={styles.saveMsg}>{saveMsg}</p>}
          {saveError && (
            <p className={styles.saveError} role="alert">
              {saveError}
            </p>
          )}
        </div>
      </form>

      <section className={styles.section} aria-label="有給・誕生日休暇">
        <h2 className={styles.sectionTitle}>有給・誕生日休暇</h2>
        {!draft.hireDate?.trim() ? (
          <p className={styles.leaveHint}>
            有給を表示するには、上記プロフィールの「雇入年月日（入社日）」を入力して保存してください。
          </p>
        ) : paidLeaveStats && !paidLeaveStats.hireValid ? (
          <p className={styles.leaveHint}>入社日の形式が正しくありません。</p>
        ) : (
          <>
            <div className={styles.leaveSummary}>
              <div className={styles.leaveStat}>
                <p className={styles.leaveStatLabel}>保有（現在使える有給）</p>
                <p className={styles.leaveStatValue}>
                  {paidLeaveStats ? `${paidLeaveStats.remainingTotal} 日` : "—"}
                </p>
              </div>
              <div className={styles.leaveStat}>
                <p className={styles.leaveStatLabel}>使用済み有給</p>
                <p className={styles.leaveStatValue}>
                  {paidLeaveStats ? `${paidLeaveStats.totalUsed} 日` : "—"}
                </p>
              </div>
              <div className={styles.leaveStat}>
                <p className={styles.leaveStatLabel}>残有給（期限内）</p>
                <p className={styles.leaveStatValue}>
                  {paidLeaveStats ? `${paidLeaveStats.remainingTotal} 日` : "—"}
                </p>
              </div>
            </div>
            {nextGrant && (
              <p className={styles.leaveNext}>
                次回付与の予定：{formatDateKeyJa(nextGrant.nextGrantKey)} ・{" "}
                <strong>{nextGrant.nextDays} 日</strong>（入社日からの経過に基づく自動計算）
              </p>
            )}
            {birthdayRemain !== null && draft.birthDate?.trim() && (
              <p className={styles.leaveBirthday}>
                誕生日休暇：残 {birthdayRemain} 日（誕生日の属する月に年1日付与。有給とは別管理）
              </p>
            )}

            <h3 className={styles.sectionTitle} style={{ fontSize: "1rem", marginTop: "0.5rem" }}>
              有給の使用を記録
            </h3>
            <p className={styles.leaveHint}>
              取得した有給は日付と日数で登録します。保存先はスタッフマスターです。
            </p>
            <div className={styles.leaveAddRow}>
              <label className={styles.field}>
                <span className={styles.label}>使用日</span>
                <input
                  className={styles.input}
                  type="date"
                  value={paidNewDate}
                  onChange={(e) => setPaidNewDate(e.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>日数</span>
                <input
                  className={styles.input}
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={paidNewDays}
                  onChange={(e) => setPaidNewDays(e.target.value)}
                />
              </label>
              <button type="button" className={styles.saveBtn} onClick={addPaidUsage}>
                有給使用を追加
              </button>
            </div>
            {paidLeaveStats && paidLeaveStats.sortedUsages.length > 0 && (
              <div className={styles.leaveTableWrap}>
                <table className={styles.leaveTable}>
                  <thead>
                    <tr>
                      <th>使用日</th>
                      <th>日数</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {paidLeaveStats.sortedUsages.map((u, i) => (
                      <tr key={`${u.dateKey}-${u.days}-${i}`}>
                        <td>{formatDateKeyJa(u.dateKey)}</td>
                        <td>{u.days} 日</td>
                        <td>
                          <button
                            type="button"
                            className={`${styles.btnSmall} ${styles.btnDanger}`}
                            onClick={() => removePaidUsage(u)}
                          >
                            削除
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h3 className={styles.sectionTitle} style={{ fontSize: "1rem" }}>
              付与単位の残日数（参考）
            </h3>
            <p className={styles.leaveHint}>
              付与から2年で時効。古い付与から先に消化されます。
            </p>
            {paidLeaveStats && paidLeaveStats.buckets.length > 0 && (
              <div className={styles.leaveTableWrap}>
                <table className={styles.leaveTable}>
                  <thead>
                    <tr>
                      <th>付与日</th>
                      <th>付与日数</th>
                      <th>失効日</th>
                      <th>残日数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paidLeaveStats.buckets.map((b) => (
                      <tr key={b.grantKey}>
                        <td>{formatDateKeyJa(b.grantKey)}</td>
                        <td>{b.grantDays} 日</td>
                        <td>{formatDateKeyJa(b.expireKey)}</td>
                        <td>{b.remainingDays} 日</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h3 className={styles.sectionTitle} style={{ fontSize: "1rem" }}>
              有給の履歴（付与・使用と残日数）
            </h3>
            {paidHistory.length === 0 ? (
              <p className={styles.leaveHint}>まだ履歴がありません。</p>
            ) : (
              <div className={styles.leaveTableWrap}>
                <table className={styles.leaveTable}>
                  <thead>
                    <tr>
                      <th>日付</th>
                      <th>内容</th>
                      <th>付与日数 / 使用日数</th>
                      <th>失効日</th>
                      <th>残日数（その時点）</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paidHistory.map((row, i) => (
                      <tr key={`${row.kind}-${row.dateKey}-${i}`}>
                        <td>{formatDateKeyJa(row.dateKey)}</td>
                        <td>{row.kind === "grant" ? "付与" : "使用"}</td>
                        <td>
                          {row.kind === "grant"
                            ? `${row.grantDays ?? 0} 日`
                            : `${row.usageDays ?? 0} 日`}
                        </td>
                        <td>
                          {row.kind === "grant" && row.expireKey
                            ? formatDateKeyJa(row.expireKey)
                            : "—"}
                        </td>
                        <td>{row.balanceAfter} 日</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h3 className={styles.sectionTitle} style={{ fontSize: "1rem" }}>
              誕生日休暇の使用
            </h3>
            <div className={styles.leaveAddRow}>
              <label className={styles.field}>
                <span className={styles.label}>使用日</span>
                <input
                  className={styles.input}
                  type="date"
                  value={birthNewDate}
                  onChange={(e) => setBirthNewDate(e.target.value)}
                />
              </label>
              <button type="button" className={styles.saveBtn} onClick={addBirthdayUsage}>
                誕生日休暇を1日使用として追加
              </button>
            </div>
            {(draft.birthdayLeaveUsages ?? []).length > 0 && (
              <div className={styles.leaveTableWrap}>
                <table className={styles.leaveTable}>
                  <thead>
                    <tr>
                      <th>使用日</th>
                      <th>日数</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {draft.birthdayLeaveUsages.map((u, i) => (
                      <tr key={`${u.dateKey}-b-${i}`}>
                        <td>{formatDateKeyJa(u.dateKey)}</td>
                        <td>{u.days} 日</td>
                        <td>
                          <button
                            type="button"
                            className={`${styles.btnSmall} ${styles.btnDanger}`}
                            onClick={() => removeBirthdayUsage(i)}
                          >
                            削除
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>

      <section className={styles.section} aria-label="勤怠一覧">
        <h2 className={styles.sectionTitle}>勤怠一覧</h2>
        <div className={styles.filters}>
          <div className={styles.field}>
            <span className={styles.label}>対象月</span>
            <div className={styles.monthRow}>
              <select
                className={styles.select}
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                aria-label="年"
              >
                {yearOptions().map((y) => (
                  <option key={y} value={y}>
                    {y}年
                  </option>
                ))}
              </select>
              <select
                className={styles.select}
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                aria-label="月"
              >
                {MONTHS.map((m) => (
                  <option key={m} value={m}>
                    {m}月
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {attLoadError && (
          <p className={styles.attError} role="alert">
            {attLoadError}
          </p>
        )}
        {attLoading && !attLoadError && (
          <p className={styles.lead}>打刻データを読み込み中…</p>
        )}

        <div className={laborStyles.tableSection}>
          <div className={laborStyles.tableWrap}>
            <table className={laborStyles.table}>
              <thead>
                <tr>
                  <th scope="col">日付</th>
                  <th scope="col">出勤</th>
                  <th scope="col">退勤</th>
                  <th scope="col">勤務時間</th>
                  <th scope="col">現場名</th>
                  <th scope="col">操作</th>
                </tr>
              </thead>
              <tbody>
                {listRows.map((row, i) => {
                  const att = attendanceByDate.get(row.dateKey) ?? null;
                  const inAt = att ? formatTimeJa(att.inAt) : "—";
                  const outAt = att ? formatTimeJa(att.outAt) : "—";
                  const dur = att ? formatDurationHm(workMinutes(att)) : "—";
                  const late = att ? isCheckInLate(att) : false;

                  const editBtn = (
                    <button
                      type="button"
                      className={laborStyles.actionBtn}
                      onClick={() => {
                        setAttGatePin("");
                        setAttGatePinError(null);
                        setAttPinGate({ dateKey: row.dateKey });
                      }}
                    >
                      編集
                    </button>
                  );

                  if (row.kind === "holiday") {
                    return (
                      <tr
                        key={`${row.dateKey}-holiday-${i}`}
                        className={laborStyles.holidayRow}
                      >
                        <td>{formatDateKeyJa(row.dateKey)}</td>
                        <td className={late ? laborStyles.lateTime : undefined}>{inAt}</td>
                        <td>{outAt}</td>
                        <td>{dur}</td>
                        <td className={laborStyles.holidayText}>—</td>
                        <td>
                          <div className={laborStyles.rowActions}>{editBtn}</div>
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={`${row.dateKey}-work-${i}`}>
                      <td>{formatDateKeyJa(row.dateKey)}</td>
                      <td className={late ? laborStyles.lateTime : undefined}>{inAt}</td>
                      <td>{outAt}</td>
                      <td>{dur}</td>
                      <td>{row.siteNamesLabel}</td>
                      <td>
                        <div className={laborStyles.rowActions}>{editBtn}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className={laborStyles.listTotal}>
          <span className={laborStyles.listTotalLabel}>月間合計勤務時間</span>
          <span className={laborStyles.listTotalValue}>
            {formatDurationHm(attendanceTotalMinutes)}
          </span>
        </div>
      </section>

      {attPinGate && (
        <div
          className={laborStyles.pinBackdrop}
          role="presentation"
          onClick={() => setAttPinGate(null)}
        >
          <div
            className={laborStyles.pinCard}
            role="dialog"
            aria-modal="true"
            aria-labelledby="staff-att-pin-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="staff-att-pin-title" className={laborStyles.pinTitle}>
              PINコード
            </h2>
            <p className={laborStyles.pinLead}>
              4桁のPINコードを入力してください。
            </p>
            <div className={laborStyles.pinDots} aria-label="入力状況">
              {Array.from({ length: 4 }).map((_, j) => (
                <span
                  key={j}
                  className={
                    attGatePin.length > j
                      ? laborStyles.pinDotOn
                      : laborStyles.pinDotOff
                  }
                />
              ))}
            </div>
            {attGatePinError && (
              <p className={laborStyles.pinError} role="alert">
                {attGatePinError}
              </p>
            )}
            <div className={laborStyles.keypad} role="group" aria-label="テンキー">
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
                const disabled = isEnter ? attGatePin.length !== 4 : false;
                return (
                  <button
                    key={k}
                    type="button"
                    className={isEnter ? laborStyles.enterBtn : laborStyles.keyBtn}
                    disabled={disabled}
                    onClick={() => {
                      setAttGatePinError(null);
                      if (isEnter) {
                        if (attGatePin.length !== 4) return;
                        if (attGatePin !== ATT_EDIT_PIN) {
                          setAttGatePinError("PINが違います");
                          setAttGatePin("");
                          return;
                        }
                        const dk = attPinGate.dateKey;
                        setAttPinGate(null);
                        setAttGatePin("");
                        setAttEditModal({ dateKey: dk });
                        return;
                      }
                      if (isBack) {
                        setAttGatePin((p) => p.slice(0, -1));
                        return;
                      }
                      setAttGatePin((p) =>
                        p.length >= 4 ? p : `${p}${k}`
                      );
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
            <div className={laborStyles.pinFooter}>
              <button
                type="button"
                className={laborStyles.modalBack}
                onClick={() => setAttPinGate(null)}
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {attEditModal && (
        <div
          className={laborStyles.modalBackdrop}
          role="presentation"
          onClick={() => setAttEditModal(null)}
        >
          <div
            className={laborStyles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="staff-att-edit-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="staff-att-edit-title" className={laborStyles.modalTitle}>
              打刻の編集（{formatDateKeyJa(attEditModal.dateKey)}）
            </h2>
            <div className={laborStyles.editFields}>
              <label className={laborStyles.editLabel} htmlFor="staff-att-edit-in">
                出勤時間（HH:MM）
              </label>
              <input
                id="staff-att-edit-in"
                className={laborStyles.editInput}
                value={attEditIn}
                onChange={(e) => {
                  setAttEditIn(e.target.value);
                  setAttEditError(null);
                }}
                placeholder="例: 08:30"
                autoComplete="off"
              />
              <label className={laborStyles.editLabel} htmlFor="staff-att-edit-out">
                退勤時間（HH:MM）
              </label>
              <input
                id="staff-att-edit-out"
                className={laborStyles.editInput}
                value={attEditOut}
                onChange={(e) => {
                  setAttEditOut(e.target.value);
                  setAttEditError(null);
                }}
                placeholder="例: 17:00"
                autoComplete="off"
              />
              <label
                className={laborStyles.editLabel}
                htmlFor="staff-att-edit-meeting"
              >
                集合時間（HH:MM）
              </label>
              <input
                id="staff-att-edit-meeting"
                className={laborStyles.editInput}
                value={attEditMeeting}
                onChange={(e) => {
                  setAttEditMeeting(e.target.value);
                  setAttEditError(null);
                }}
                placeholder="例: 08:00"
                autoComplete="off"
              />
            </div>
            {attEditError && (
              <p className={laborStyles.editError} role="alert">
                {attEditError}
              </p>
            )}
            <div className={laborStyles.modalActions}>
              <button
                type="button"
                className={laborStyles.modalBack}
                onClick={() => setAttEditModal(null)}
              >
                キャンセル
              </button>
              <button
                type="button"
                className={laborStyles.modalYes}
                onClick={() => {
                  void (async () => {
                    const res = await updateAttendanceFromHHmmFields(
                      personName,
                      attEditModal.dateKey,
                      {
                        inHHmm: attEditIn,
                        outHHmm: attEditOut,
                        meetingHHmm: attEditMeeting,
                      }
                    );
                    if (!res.ok) {
                      setAttEditError(res.error);
                      return;
                    }
                    setAttEditModal(null);
                  })();
                }}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {leaveModalOpen && (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onClick={() => setLeaveModalOpen(false)}
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="leave-req-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="leave-req-title" className={styles.modalTitle}>
              休暇申請
            </h2>
            {lrSubmitError && (
              <p className={styles.saveError} role="alert">
                {lrSubmitError}
              </p>
            )}
            <div className={styles.grid}>
              <label className={styles.field}>
                <span className={styles.label}>休暇種別</span>
                <select
                  className={styles.input}
                  value={lrKind}
                  onChange={(e) =>
                    setLrKind(e.target.value === "birthday" ? "birthday" : "paid")
                  }
                >
                  <option value="paid">有給休暇</option>
                  <option value="birthday">誕生日休暇</option>
                </select>
              </label>
              <label className={styles.field}>
                <span className={styles.label}>開始日</span>
                <input
                  className={styles.input}
                  type="date"
                  value={lrStart}
                  onChange={(e) => setLrStart(e.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>終了日</span>
                <input
                  className={styles.input}
                  type="date"
                  value={lrEnd}
                  onChange={(e) => setLrEnd(e.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>日数</span>
                <input
                  className={styles.input}
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={lrDays}
                  onChange={(e) => setLrDays(e.target.value)}
                />
              </label>
              <label className={`${styles.field} ${styles.fieldFull}`}>
                <span className={styles.label}>理由（任意）</span>
                <textarea
                  className={styles.textarea}
                  value={lrReason}
                  onChange={(e) => setLrReason(e.target.value)}
                  rows={3}
                />
              </label>
            </div>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalBtn}
                onClick={() => setLeaveModalOpen(false)}
              >
                キャンセル
              </button>
              <button
                type="button"
                className={`${styles.modalBtn} ${styles.modalBtnPrimary}`}
                onClick={() => void submitLeaveRequest()}
              >
                申請する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
