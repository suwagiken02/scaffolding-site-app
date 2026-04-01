import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import type { StaffMaster } from "../types/staffMaster";
import { ageFromBirthDate } from "../lib/ageFromBirthDate";
import { buildLaborListRowsForPerson } from "../lib/laborListForPerson";
import {
  formatDurationHm,
  formatTimeJa,
  isCheckInLate,
  listAttendanceInMonth,
  loadAttendanceStore,
  workMinutes,
} from "../lib/attendanceStorage";
import type { AttendanceRecord, AttendanceStore } from "../types/attendance";
import {
  getStaffMasterById,
  updateStaffMaster,
} from "../lib/staffMasterStorage";
import {
  clearStaffPersonalAuthed,
  isStaffPersonalAuthed,
  setStaffPersonalAuthed,
} from "../lib/staffPersonalSession";
import laborStyles from "./LaborManagementPage.module.css";
import pinStyles from "./StaffListPage.module.css";
import styles from "./StaffPersonalPage.module.css";

const jaCollator = new Intl.Collator("ja");
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

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

  const personName = draft?.name.trim() ?? "";

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
          マスター上の「役割」「打刻対象」「個人PIN」はマスター設定画面でのみ変更されます。
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
                  <th scope="col">現場名</th>
                  <th scope="col">作業内容</th>
                  <th scope="col">出勤</th>
                  <th scope="col">退勤</th>
                  <th scope="col">勤務時間</th>
                </tr>
              </thead>
              <tbody>
                {listRows.map((row, i) => {
                  const att = attendanceByDate.get(row.dateKey) ?? null;
                  const inAt = att ? formatTimeJa(att.inAt) : "—";
                  const outAt = att ? formatTimeJa(att.outAt) : "—";
                  const dur = att ? formatDurationHm(workMinutes(att)) : "—";
                  const late = att ? isCheckInLate(att) : false;

                  if (row.kind === "holiday") {
                    return (
                      <tr
                        key={`${row.dateKey}-holiday-${i}`}
                        className={laborStyles.holidayRow}
                      >
                        <td>{formatDateKeyJa(row.dateKey)}</td>
                        <td className={laborStyles.holidayText}>— 休日 —</td>
                        <td className={laborStyles.holidayText}>—</td>
                        <td className={late ? laborStyles.lateTime : undefined}>{inAt}</td>
                        <td>{outAt}</td>
                        <td>{dur}</td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={`${row.dateKey}-${row.siteId}-${i}`}>
                      <td>{formatDateKeyJa(row.dateKey)}</td>
                      <td>{row.siteName}</td>
                      <td>{row.work}</td>
                      <td className={late ? laborStyles.lateTime : undefined}>{inAt}</td>
                      <td>{outAt}</td>
                      <td>{dur}</td>
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
    </div>
  );
}
