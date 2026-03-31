import { useEffect, useMemo, useState } from "react";
import { loadSites } from "../lib/siteStorage";
import { loadStaffMasters } from "../lib/staffMasterStorage";
import {
  buildActivityRowsForPerson,
  filterRowsByMonth,
  summarizeMonth,
} from "../lib/workerActivity";
import {
  deleteAttendanceForPersonDate,
  formatDurationHm,
  formatTimeJa,
  hhmmFromLocalIso,
  isCheckInLate,
  listAttendanceInMonth,
  loadAttendanceForPersonDate,
  updateAttendanceFromHHmmFields,
  workMinutes,
} from "../lib/attendanceStorage";
import type { AttendanceRecord } from "../types/attendance";
import styles from "./LaborManagementPage.module.css";

const jaCollator = new Intl.Collator("ja");
const PIN_DEFAULT = "1234";

function masterPersonOptions(): string[] {
  const all = loadStaffMasters().map((s) => s.name.trim()).filter(Boolean);
  const set = new Set<string>(all);
  return [...set].sort((a, b) => jaCollator.compare(a, b));
}

function yearOptions(): number[] {
  const y = new Date().getFullYear();
  const out: number[] = [];
  for (let i = y - 5; i <= y + 3; i++) out.push(i);
  return out;
}

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function formatDateKeyJa(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return dateKey;
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium" }).format(
    new Date(y, m - 1, d)
  );
}

function dateKey(y: number, m1: number, d: number): string {
  return `${y}-${String(m1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function daysInMonthDateKeys(y: number, m1: number): string[] {
  const last = new Date(y, m1, 0).getDate();
  const out: string[] = [];
  for (let d = 1; d <= last; d++) out.push(dateKey(y, m1, d));
  return out;
}

export function LaborManagementPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [personName, setPersonName] = useState("");
  const [tab, setTab] = useState<"list" | "labor" | "attendance">("list");
  const [attRevision, setAttRevision] = useState(0);
  const [pinGate, setPinGate] = useState<null | { mode: "edit" | "delete"; dateKey: string }>(
    null
  );
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [editModal, setEditModal] = useState<null | { dateKey: string }>(null);
  const [editIn, setEditIn] = useState("");
  const [editOut, setEditOut] = useState("");
  const [editMeeting, setEditMeeting] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const personOptions = masterPersonOptions();

  useEffect(() => {
    const bump = () => setAttRevision((x) => x + 1);
    window.addEventListener("attendanceSaved", bump);
    return () => window.removeEventListener("attendanceSaved", bump);
  }, []);

  useEffect(() => {
    if (!pinGate) return;
    setPin("");
    setPinError(null);
  }, [pinGate]);

  useEffect(() => {
    if (!editModal || !personName) return;
    const rec = loadAttendanceForPersonDate(personName, editModal.dateKey);
    setEditIn(hhmmFromLocalIso(rec.inAt));
    setEditOut(hhmmFromLocalIso(rec.outAt));
    setEditMeeting(rec.meetingTime ?? "");
    setEditError(null);
  }, [editModal, personName]);

  useEffect(() => {
    if (!pinGate && !editModal) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setPinGate(null);
        setEditModal(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pinGate, editModal]);

  const { rowsInMonth, summary } = useMemo(() => {
    const sites = loadSites();
    const allRows = buildActivityRowsForPerson(sites, personName);
    const filtered = filterRowsByMonth(allRows, year, month);
    return {
      rowsInMonth: filtered,
      summary: summarizeMonth(filtered),
    };
  }, [personName, year, month]);

  const attendanceRows = useMemo(() => {
    if (!personName) return [];
    return listAttendanceInMonth(personName, year, month);
  }, [personName, year, month, attRevision]);

  const attendanceTotalMinutes = useMemo(() => {
    let total = 0;
    for (const r of attendanceRows) {
      const m = workMinutes(r);
      if (m !== null) total += m;
    }
    return total;
  }, [attendanceRows]);

  const attendanceByDate = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    for (const r of attendanceRows) map.set(r.dateKey, r);
    return map;
  }, [attendanceRows]);

  const listRows = useMemo(() => {
    if (!personName) return [];
    const byDate = new Map<string, { siteId: string; siteName: string; roles: Set<string> }[]>();
    for (const r of rowsInMonth) {
      const list = byDate.get(r.dateKey) ?? [];
      const existing = list.find((x) => x.siteId === r.siteId);
      if (existing) existing.roles.add(r.role);
      else list.push({ siteId: r.siteId, siteName: r.siteName, roles: new Set([r.role]) });
      byDate.set(r.dateKey, list);
    }
    const days = daysInMonthDateKeys(year, month).sort((a, b) => b.localeCompare(a));
    return days.flatMap((dk) => {
      const items = byDate.get(dk);
      if (!items || items.length === 0) {
        return [{ kind: "holiday" as const, dateKey: dk }];
      }
      return items
        .slice()
        .sort((a, b) => jaCollator.compare(a.siteName, b.siteName))
        .map((it) => ({
          kind: "work" as const,
          dateKey: dk,
          siteId: it.siteId,
          siteName: it.siteName,
          work: [...it.roles].join("・"),
        }));
    });
  }, [personName, rowsInMonth, year, month]);

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>作業員稼働管理</h1>
      <p className={styles.lead}>
        各現場の作業記録（参加メンバー）に登録された方について、
        <strong>入場時の写真がある日</strong>を稼働日として集計します。
      </p>

      <div className={styles.tabs} role="tablist" aria-label="表示切り替え">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "list"}
          className={tab === "list" ? styles.tabActive : styles.tab}
          onClick={() => setTab("list")}
        >
          一覧
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "labor"}
          className={tab === "labor" ? styles.tabActive : styles.tab}
          onClick={() => setTab("labor")}
        >
          稼働
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "attendance"}
          className={tab === "attendance" ? styles.tabActive : styles.tab}
          onClick={() => setTab("attendance")}
        >
          勤怠
        </button>
      </div>

      <section className={styles.filters} aria-label="絞り込み">
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
        <div className={styles.fieldGrow}>
          <label className={styles.label} htmlFor="labor-person">
            対象者
          </label>
          <select
            id="labor-person"
            className={styles.selectWide}
            value={personName}
            onChange={(e) => setPersonName(e.target.value)}
          >
            <option value="">選択してください</option>
            {personOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <p className={styles.hint}>
            マスター設定の「スタッフ」に登録された名前から選びます。
          </p>
        </div>
      </section>

      {!personName ? (
        <p className={styles.placeholder}>対象者を選ぶと表示されます。</p>
      ) : tab === "list" ? (
        <>
          <section className={styles.tableSection} aria-label="一覧">
            <h2 className={styles.sectionTitle}>
              一覧（{year}年{month}月・{personName}）
            </h2>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">日付</th>
                    <th scope="col">現場名</th>
                    <th scope="col">作業内容</th>
                    <th scope="col">出勤</th>
                    <th scope="col">退勤</th>
                    <th scope="col">勤務時間</th>
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
                    const hasAttRecord = att != null;
                    const actionsCell = hasAttRecord ? (
                      <div className={styles.rowActions}>
                        <button
                          type="button"
                          className={styles.actionBtn}
                          onClick={() => setPinGate({ mode: "edit", dateKey: row.dateKey })}
                        >
                          編集
                        </button>
                        <button
                          type="button"
                          className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                          onClick={() => setPinGate({ mode: "delete", dateKey: row.dateKey })}
                        >
                          削除
                        </button>
                      </div>
                    ) : (
                      "—"
                    );
                    if (row.kind === "holiday") {
                      return (
                        <tr key={`${row.dateKey}-holiday-${i}`} className={styles.holidayRow}>
                          <td>{formatDateKeyJa(row.dateKey)}</td>
                          <td className={styles.holidayText}>— 休日 —</td>
                          <td className={styles.holidayText}>—</td>
                          <td className={late ? styles.lateTime : undefined}>{inAt}</td>
                          <td>{outAt}</td>
                          <td>{dur}</td>
                          <td>{actionsCell}</td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={`${row.dateKey}-${row.siteId}-${i}`}>
                        <td>{formatDateKeyJa(row.dateKey)}</td>
                        <td>{row.siteName}</td>
                        <td>{row.work}</td>
                        <td className={late ? styles.lateTime : undefined}>{inAt}</td>
                        <td>{outAt}</td>
                        <td>{dur}</td>
                        <td>{actionsCell}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className={styles.summary} aria-label="月間合計勤務時間">
            <div className={styles.listTotal}>
              <span className={styles.listTotalLabel}>月間合計勤務時間</span>
              <span className={styles.listTotalValue}>
                {formatDurationHm(attendanceTotalMinutes)}
              </span>
            </div>
          </section>

          {pinGate && (
            <div
              className={styles.pinBackdrop}
              role="presentation"
              onClick={() => setPinGate(null)}
            >
              <div
                className={styles.pinCard}
                role="dialog"
                aria-modal="true"
                aria-labelledby="labor-pin-title"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 id="labor-pin-title" className={styles.pinTitle}>
                  PINコード
                </h2>
                <p className={styles.pinLead}>4桁のPINコードを入力してください。</p>
                <div className={styles.pinDots} aria-label="入力状況">
                  {Array.from({ length: 4 }).map((_, j) => (
                    <span
                      key={j}
                      className={pin.length > j ? styles.pinDotOn : styles.pinDotOff}
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
                            if (pin !== PIN_DEFAULT) {
                              setPinError("PINが違います");
                              setPin("");
                              return;
                            }
                            const dk = pinGate.dateKey;
                            const mode = pinGate.mode;
                            setPinGate(null);
                            setPin("");
                            if (mode === "delete") {
                              if (window.confirm("この打刻記録を削除しますか？")) {
                                deleteAttendanceForPersonDate(personName, dk);
                              }
                            } else {
                              setEditModal({ dateKey: dk });
                            }
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
                    onClick={() => setPinGate(null)}
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            </div>
          )}

          {editModal && (
            <div
              className={styles.modalBackdrop}
              role="presentation"
              onClick={() => setEditModal(null)}
            >
              <div
                className={styles.modal}
                role="dialog"
                aria-modal="true"
                aria-labelledby="labor-edit-title"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 id="labor-edit-title" className={styles.modalTitle}>
                  打刻の編集（{formatDateKeyJa(editModal.dateKey)}）
                </h2>
                <div className={styles.editFields}>
                  <label className={styles.editLabel} htmlFor="labor-edit-in">
                    出勤時間（HH:MM）
                  </label>
                  <input
                    id="labor-edit-in"
                    className={styles.editInput}
                    value={editIn}
                    onChange={(e) => {
                      setEditIn(e.target.value);
                      setEditError(null);
                    }}
                    placeholder="例: 08:30"
                    autoComplete="off"
                  />
                  <label className={styles.editLabel} htmlFor="labor-edit-out">
                    退勤時間（HH:MM）
                  </label>
                  <input
                    id="labor-edit-out"
                    className={styles.editInput}
                    value={editOut}
                    onChange={(e) => {
                      setEditOut(e.target.value);
                      setEditError(null);
                    }}
                    placeholder="例: 17:00"
                    autoComplete="off"
                  />
                  <label className={styles.editLabel} htmlFor="labor-edit-meeting">
                    集合時間（HH:MM）
                  </label>
                  <input
                    id="labor-edit-meeting"
                    className={styles.editInput}
                    value={editMeeting}
                    onChange={(e) => {
                      setEditMeeting(e.target.value);
                      setEditError(null);
                    }}
                    placeholder="例: 08:00"
                    autoComplete="off"
                  />
                </div>
                {editError && (
                  <p className={styles.editError} role="alert">
                    {editError}
                  </p>
                )}
                <div className={styles.modalActions}>
                  <button
                    type="button"
                    className={styles.modalBack}
                    onClick={() => setEditModal(null)}
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    className={styles.modalYes}
                    onClick={() => {
                      const res = updateAttendanceFromHHmmFields(personName, editModal.dateKey, {
                        inHHmm: editIn,
                        outHHmm: editOut,
                        meetingHHmm: editMeeting,
                      });
                      if (!res.ok) {
                        setEditError(res.error);
                        return;
                      }
                      setEditModal(null);
                    }}
                  >
                    保存
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      ) : tab === "labor" ? (
        <>
          <section className={styles.summary} aria-label="サマリー（稼働）">
            <h2 className={styles.sectionTitle}>
              サマリー（{year}年{month}月・{personName}）
            </h2>
            <dl className={styles.summaryGrid}>
              <div className={styles.summaryItem}>
                <dt>職長として稼働した日数</dt>
                <dd>{summary.foremanDistinctDays} 日</dd>
              </div>
              <div className={styles.summaryItem}>
                <dt>子方として稼働した日数</dt>
                <dd>{summary.kogataDistinctDays} 日</dd>
              </div>
              <div className={styles.summaryItem}>
                <dt>総出勤日数</dt>
                <dd>{summary.totalDistinctDays} 日</dd>
              </div>
            </dl>
            <p className={styles.summaryNote}>
              職長名・子方名の両方に同一人物がいる現場では、同一日に職長・子方の両方でカウントされる場合があります。総出勤日数は日付の重複を除いた日数です。
            </p>
          </section>

          <section className={styles.tableSection} aria-label="稼働詳細">
            <h2 className={styles.sectionTitle}>稼働詳細</h2>
            {rowsInMonth.length === 0 ? (
              <p className={styles.empty}>この月に該当する稼働はありません。</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">日付</th>
                      <th scope="col">現場名</th>
                      <th scope="col">役割</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rowsInMonth.map((r, i) => (
                      <tr key={`${r.dateKey}-${r.siteId}-${r.role}-${i}`}>
                        <td>{formatDateKeyJa(r.dateKey)}</td>
                        <td>{r.siteName}</td>
                        <td>{r.role}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : (
        <>
          <section className={styles.summary} aria-label="サマリー（勤怠）">
            <h2 className={styles.sectionTitle}>
              月間合計勤務時間（{year}年{month}月・{personName}）
            </h2>
            <p className={styles.attTotal}>
              {formatDurationHm(attendanceTotalMinutes)}
            </p>
          </section>

          <section className={styles.tableSection} aria-label="出退勤一覧">
            <h2 className={styles.sectionTitle}>出退勤一覧</h2>
            {attendanceRows.length === 0 ? (
              <p className={styles.empty}>この月の打刻はありません。</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">日付</th>
                      <th scope="col">出勤</th>
                      <th scope="col">退勤</th>
                      <th scope="col">勤務時間</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendanceRows.map((r) => (
                      <tr key={r.dateKey}>
                        <td>{formatDateKeyJa(r.dateKey)}</td>
                        <td>{formatTimeJa(r.inAt)}</td>
                        <td>{formatTimeJa(r.outAt)}</td>
                        <td>{formatDurationHm(workMinutes(r))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
