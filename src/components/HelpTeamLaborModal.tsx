import { useCallback, useEffect, useId, useMemo, useState } from "react";
import type { Site } from "../types/site";
import type { WorkKind } from "../types/workKind";
import type { SiteDailyLaborRecord } from "../types/siteDailyLabor";
import {
  formatManDayOneDecimal,
  helpTeamManDays,
  hoursBetweenHHmmSameDay,
  hoursBetweenIso,
  registeredMemberCountForLabor,
  roundManDayOneDecimal,
  workSessionTotalManDaysFromRecord,
} from "../lib/manDayCalculations";
import { loadDailyLaborMap, saveDailyLaborRecord } from "../lib/siteDailyLaborStorage";
import { loadStaffMasters } from "../lib/staffMasterStorage";
import { staffMatchesKogataPicker } from "../types/staffMaster";
import styles from "./HelpTeamLaborModal.module.css";

const TIME_OPTIONS: string[] = (() => {
  const out: string[] = [];
  for (let h = 0; h < 24; h++) {
    out.push(`${String(h).padStart(2, "0")}:00`);
    out.push(`${String(h).padStart(2, "0")}:30`);
  }
  return out;
})();

type View =
  | "ask"
  | "no_summary"
  | "no_edit"
  | "yes_members"
  | "yes_start"
  | "yes_end"
  | "yes_summary"
  | "yes_edit";

type Props = {
  siteId: string;
  site: Site;
  workKind: WorkKind;
  dateKey: string;
  entryIso: string | null;
  endIso: string;
  onClose: () => void;
  onSaved: () => void;
};

function formatDateKeyJa(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return dateKey;
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "long" }).format(
    new Date(y, m - 1, d)
  );
}

function parseFinalInput(input: string, fallback: number): number {
  const t = input.trim().replace(/,/g, "");
  const n = parseFloat(t);
  if (Number.isNaN(n) || n < 0) return fallback;
  return roundManDayOneDecimal(n);
}

/** 作業開始時に保存された職長・子方。未保存時は現場の職長・子方名で代替（startMetaFields と同じ） */
function getRegularMemberLists(
  site: Site,
  siteId: string,
  workKind: WorkKind,
  dateKey: string
): { memberForemanNames: string[]; memberKogataNames: string[] } {
  const prev = loadDailyLaborMap(siteId, workKind)[dateKey];
  const fallbackForeman = site.foremanName.trim()
    ? [site.foremanName.trim()]
    : [];
  const fallbackKogata = site.kogataNames
    .map((n) => n.trim())
    .filter((n) => n.length > 0);
  const hasSelectedMembers =
    (prev?.memberForemanNames?.length ?? 0) > 0 ||
    (prev?.memberKogataNames?.length ?? 0) > 0;
  return {
    memberForemanNames: hasSelectedMembers
      ? prev!.memberForemanNames
      : fallbackForeman,
    memberKogataNames: hasSelectedMembers ? prev!.memberKogataNames : fallbackKogata,
  };
}

export function HelpTeamLaborModal({
  siteId,
  site,
  workKind,
  dateKey,
  entryIso,
  endIso,
  onClose,
  onSaved,
}: Props) {
  const titleId = useId();
  const kogataList = useMemo(
    () =>
      loadStaffMasters().filter((s) => staffMatchesKogataPicker(s.role)),
    []
  );

  const [view, setView] = useState<View>("ask");
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());
  const [helpStart, setHelpStart] = useState("08:00");
  const [helpEnd, setHelpEnd] = useState("17:00");
  const [finalInput, setFinalInput] = useState("");
  const [memberError, setMemberError] = useState<string | null>(null);
  const [timeError, setTimeError] = useState<string | null>(null);

  const regularMembers = useMemo(
    () => getRegularMemberLists(site, siteId, workKind, dateKey),
    [site, siteId, workKind, dateKey]
  );
  const laborRecord = useMemo(
    () => loadDailyLaborMap(siteId, workKind)[dateKey],
    [siteId, workKind, dateKey]
  );

  const regularWorkerCount =
    regularMembers.memberForemanNames.length +
    regularMembers.memberKogataNames.length;

  const companyHours = useMemo(
    () => hoursBetweenIso(entryIso, endIso),
    [entryIso, endIso]
  );

  const companyRaw = useMemo(() => {
    if (!laborRecord) return 0;
    return workSessionTotalManDaysFromRecord(entryIso, endIso, laborRecord)
      .total;
  }, [entryIso, endIso, laborRecord]);
  const companyDisplay = useMemo(
    () => roundManDayOneDecimal(companyRaw),
    [companyRaw]
  );

  const helpCount = selectedNames.size;
  const helpHours = useMemo(
    () => hoursBetweenHHmmSameDay(helpStart, helpEnd),
    [helpStart, helpEnd]
  );
  const helpRaw = useMemo(
    () => helpTeamManDays(helpCount, helpStart, helpEnd),
    [helpCount, helpStart, helpEnd]
  );
  const helpDisplay = useMemo(
    () => roundManDayOneDecimal(helpRaw),
    [helpRaw]
  );
  const totalRaw = companyRaw + helpRaw;
  const totalDisplay = useMemo(
    () => roundManDayOneDecimal(totalRaw),
    [totalRaw]
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const toggleMember = useCallback((name: string) => {
    setSelectedNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
    setMemberError(null);
  }, []);

  function startMetaFields(): {
    createdAt: string;
    vehicleCount: number;
    memberForemanNames: string[];
    memberKogataNames: string[];
  } {
    const prev = loadDailyLaborMap(siteId, workKind)[dateKey];
    const lists = getRegularMemberLists(site, siteId, workKind, dateKey);

    return {
      createdAt:
        typeof prev?.createdAt === "string" && prev.createdAt
          ? prev.createdAt
          : new Date().toISOString(),
      vehicleCount:
        typeof prev?.vehicleCount === "number" ? prev.vehicleCount : 0,
      memberForemanNames: lists.memberForemanNames,
      memberKogataNames: lists.memberKogataNames,
    };
  }

  function persist(record: SiteDailyLaborRecord) {
    const prev = loadDailyLaborMap(siteId, workKind)[dateKey];
    saveDailyLaborRecord(siteId, workKind, { ...prev, ...record });
    onSaved();
    onClose();
  }

  function saveNoPath(useEdited: boolean) {
    const final = useEdited
      ? parseFinalInput(finalInput, companyDisplay)
      : companyDisplay;
    const meta = startMetaFields();
    persist({
      createdAt: meta.createdAt,
      dateKey,
      finalManDays: final,
      vehicleCount: meta.vehicleCount,
      memberForemanNames: meta.memberForemanNames,
      memberKogataNames: meta.memberKogataNames,
      hadHelpTeam: false,
      helpMemberNames: [],
      helpStartTime: null,
      helpEndTime: null,
    });
  }

  function saveYesPath(useEdited: boolean) {
    const final = useEdited
      ? parseFinalInput(finalInput, totalDisplay)
      : totalDisplay;
    const names = [...selectedNames].sort((a, b) => a.localeCompare("ja"));
    const meta = startMetaFields();
    persist({
      createdAt: meta.createdAt,
      dateKey,
      finalManDays: final,
      vehicleCount: meta.vehicleCount,
      memberForemanNames: meta.memberForemanNames,
      memberKogataNames: meta.memberKogataNames,
      hadHelpTeam: true,
      helpMemberNames: names,
      helpStartTime: helpStart,
      helpEndTime: helpEnd,
    });
  }

  function goNoSummary() {
    setFinalInput(formatManDayOneDecimal(companyDisplay));
    setView("no_summary");
  }

  function goYesSummary() {
    setTimeError(null);
    if (helpHours <= 0) {
      setTimeError(
        "「何時まで」の時刻は「何時に来ましたか」より後になるよう選んでください。"
      );
      return;
    }
    setFinalInput(formatManDayOneDecimal(totalDisplay));
    setView("yes_summary");
  }

  const dateJa = formatDateKeyJa(dateKey);
  const noEntryWarn = !entryIso;
  const companyMemberCountDisplay = laborRecord
    ? registeredMemberCountForLabor(laborRecord)
    : regularWorkerCount;

  return (
    <div className={styles.root} role="presentation">
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        {view === "ask" && (
          <>
            <h2 id={titleId} className={styles.title}>
              手伝い班の確認（{dateJa}）
            </h2>
            <p className={styles.lead}>この現場に手伝い班は来ましたか？</p>
            {noEntryWarn && (
              <p className={styles.warn}>
                作業開始の打刻が見つかりません。自社人工は 0
                として計算されます（後の画面で修正できます）。
              </p>
            )}
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.btnYes}
                onClick={() => {
                  setMemberError(null);
                  setView("yes_members");
                }}
              >
                はい
              </button>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={goNoSummary}
              >
                いいえ
              </button>
            </div>
          </>
        )}

        {view === "no_summary" && (
          <>
            <h2 id={titleId} className={styles.title}>
              最終人工の確認（{dateJa}）
            </h2>
            {noEntryWarn && (
              <p className={styles.warn}>
                作業開始打刻がないため、自社人工は時間差 0 として計算しています。
              </p>
            )}
            <p className={styles.lead}>
              今日の最終人工は{" "}
              <strong>{formatManDayOneDecimal(companyDisplay)}</strong>{" "}
              人工です。よろしいですか？
            </p>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => saveNoPath(false)}
              >
                確定
              </button>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => {
                  setFinalInput(formatManDayOneDecimal(companyDisplay));
                  setView("no_edit");
                }}
              >
                修正する
              </button>
            </div>
          </>
        )}

        {view === "no_edit" && (
          <>
            <h2 id={titleId} className={styles.title}>
              最終人工の修正（{dateJa}）
            </h2>
            <p className={styles.lead}>最終人工（人工）を入力してください。</p>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="labor-final-no">
                最終人工
              </label>
              <input
                id="labor-final-no"
                type="number"
                className={styles.numberInput}
                min={0}
                step={0.1}
                inputMode="decimal"
                value={finalInput}
                onChange={(e) => setFinalInput(e.target.value)}
              />
            </div>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => saveNoPath(true)}
              >
                確定
              </button>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setView("no_summary")}
              >
                戻る
              </button>
            </div>
          </>
        )}

        {view === "yes_members" && (
          <>
            <h2 id={titleId} className={styles.title}>
              手伝い班（{dateJa}）
            </h2>
            <p className={styles.lead}>誰が来ましたか？（複数選択可）</p>
            {memberError && (
              <p className={styles.error} role="alert">
                {memberError}
              </p>
            )}
            {kogataList.length === 0 ? (
              <p className={styles.emptyMasters}>
                スタッフマスターに「子方」役割の登録がありません。マスター設定の「スタッフ」タブで役割「子方」のスタッフを追加してから、いいえ（手伝いなし）で進んでください。
              </p>
            ) : (
              <ul className={styles.checkList}>
                {kogataList.map((m) => (
                  <li key={m.id} className={styles.checkRow}>
                    <label className={styles.checkLabel}>
                      <input
                        type="checkbox"
                        className={styles.check}
                        checked={selectedNames.has(m.name)}
                        onChange={() => toggleMember(m.name)}
                      />
                      {m.name}
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => {
                  if (selectedNames.size === 0) {
                    setMemberError("1名以上選ぶか、「いいえ」に戻ってください。");
                    return;
                  }
                  setView("yes_start");
                }}
              >
                次へ
              </button>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setView("ask")}
              >
                戻る
              </button>
            </div>
          </>
        )}

        {view === "yes_start" && (
          <>
            <h2 id={titleId} className={styles.title}>
              手伝い班の来場（{dateJa}）
            </h2>
            <p className={styles.lead}>何時に来ましたか？</p>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="help-start">
                開始
              </label>
              <select
                id="help-start"
                className={styles.select}
                value={helpStart}
                onChange={(e) => setHelpStart(e.target.value)}
              >
                {TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => setView("yes_end")}
              >
                次へ
              </button>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setView("yes_members")}
              >
                戻る
              </button>
            </div>
          </>
        )}

        {view === "yes_end" && (
          <>
            <h2 id={titleId} className={styles.title}>
              手伝い班の退場（{dateJa}）
            </h2>
            <p className={styles.lead}>何時まで来ましたか？</p>
            {timeError && (
              <p className={styles.error} role="alert">
                {timeError}
              </p>
            )}
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="help-end">
                終了
              </label>
              <select
                id="help-end"
                className={styles.select}
                value={helpEnd}
                onChange={(e) => {
                  setHelpEnd(e.target.value);
                  setTimeError(null);
                }}
              >
                {TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={goYesSummary}
              >
                次へ
              </button>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setView("yes_start")}
              >
                戻る
              </button>
            </div>
          </>
        )}

        {view === "yes_summary" && (
          <>
            <h2 id={titleId} className={styles.title}>
              最終人工の確認（{dateJa}）
            </h2>
            <dl className={styles.breakdown}>
              <dt>自社人工</dt>
              <dd>
                {formatManDayOneDecimal(companyDisplay)} 人工（登録者数{" "}
                {companyMemberCountDisplay} 名 × 作業{" "}
                {companyHours.toFixed(1)} 時間：0〜3時間未満 0.5人工/人、3時間以上
                1人工/人）
              </dd>
              <dt>手伝い人工</dt>
              <dd>
                {formatManDayOneDecimal(helpDisplay)} 人工（{helpCount}{" "}
                名 × {helpHours.toFixed(1)} 時間 ÷ 8）
              </dd>
            </dl>
            <p className={styles.lead}>
              今日の最終人工は{" "}
              <strong>{formatManDayOneDecimal(totalDisplay)}</strong>{" "}
              人工です。よろしいですか？
            </p>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => saveYesPath(false)}
              >
                確定
              </button>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => {
                  setFinalInput(formatManDayOneDecimal(totalDisplay));
                  setView("yes_edit");
                }}
              >
                修正する
              </button>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setView("yes_end")}
              >
                戻る
              </button>
            </div>
          </>
        )}

        {view === "yes_edit" && (
          <>
            <h2 id={titleId} className={styles.title}>
              最終人工の修正（{dateJa}）
            </h2>
            <p className={styles.lead}>最終人工（人工）を入力してください。</p>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="labor-final-yes">
                最終人工
              </label>
              <input
                id="labor-final-yes"
                type="number"
                className={styles.numberInput}
                min={0}
                step={0.1}
                inputMode="decimal"
                value={finalInput}
                onChange={(e) => setFinalInput(e.target.value)}
              />
            </div>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => saveYesPath(true)}
              >
                確定
              </button>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setView("yes_summary")}
              >
                戻る
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
