import { useMemo, useState } from "react";
import type { Site } from "../types/site";
import type { WorkKind } from "../types/workKind";
import { WORK_KINDS } from "../types/workKind";
import {
  loadDailyLaborMap,
  saveDailyLaborRecord,
} from "../lib/siteDailyLaborStorage";
import { loadStaffMasters } from "../lib/staffMasterStorage";
import { loadContractorMasters } from "../lib/contractorMasterStorage";
import type { SiteDailyLaborRecord } from "../types/siteDailyLabor";
import styles from "./SiteWorkStartModal.module.css";

type Props = {
  site: Site;
  todayDateKey: string;
  initialWorkKind: WorkKind;
  onClose: () => void;
  onStarted: (nextWorkKind: WorkKind) => void;
};

function toNumberOrNaN(raw: string): number {
  const t = raw.trim();
  if (!t) return NaN;
  const n = Number(t);
  return n;
}

export function SiteWorkStartModal({
  site,
  todayDateKey,
  initialWorkKind,
  onClose,
  onStarted,
}: Props) {
  const staff = useMemo(() => loadStaffMasters(), []);
  const contractors = useMemo(() => loadContractorMasters(), []);
  const foremanMasters = useMemo(
    () => staff.filter((s) => s.roles.includes("職長")),
    [staff]
  );
  const kogataMasters = useMemo(
    () => staff.filter((s) => s.roles.includes("子方")),
    [staff]
  );

  const foremanInit = useMemo(() => {
    const norm = site.foremanName.trim();
    if (!norm) return new Set<string>();
    const names = new Set(foremanMasters.map((m) => m.name.trim()).filter(Boolean));
    return names.has(norm) ? new Set([norm]) : new Set<string>();
  }, [foremanMasters, site.foremanName]);

  const kogataInit = useMemo(() => {
    const allowed = new Set(kogataMasters.map((m) => m.name.trim()).filter(Boolean));
    const out = new Set<string>();
    for (const n of site.kogataNames) {
      const nn = n.trim();
      if (nn && allowed.has(nn)) out.add(nn);
    }
    return out;
  }, [kogataMasters, site.kogataNames]);

  const [workKind, setWorkKind] = useState<WorkKind>(initialWorkKind);
  const [employmentKind, setEmploymentKind] = useState<"社員" | "請負">("社員");
  const [selectedForeman, setSelectedForeman] = useState<Set<string>>(foremanInit);
  const [selectedKogata, setSelectedKogata] = useState<Set<string>>(kogataInit);
  const [contractorSelectId, setContractorSelectId] = useState<string>("");
  const [contractorFree, setContractorFree] = useState<string>("");
  const [contractorPeopleRaw, setContractorPeopleRaw] = useState<string>("1");
  const [vehicleCount, setVehicleCount] = useState<number>(() =>
    Math.max(1, site.vehicleLabels.length)
  );
  const [error, setError] = useState<string | null>(null);

  const hasTodayRecordForSelectedKind = useMemo(() => {
    const laborByDate = loadDailyLaborMap(site.id, workKind);
    return Boolean(laborByDate[todayDateKey]);
  }, [site.id, todayDateKey, workKind]);

  const startDisabled = useMemo(() => {
    const hasMembers =
      selectedForeman.size > 0 || selectedKogata.size > 0;
    const companyName =
      contractorFree.trim() ||
      contractors.find((c) => c.id === contractorSelectId)?.name?.trim() ||
      "";
    const hasCompany = companyName.trim().length > 0;
    const p = toNumberOrNaN(contractorPeopleRaw);
    const hasPeople = Number.isFinite(p) && p > 0;
    const hasValidVehicle =
      Number.isFinite(vehicleCount) && vehicleCount >= 1 && Number.isInteger(vehicleCount);
    return (
      !(employmentKind === "社員" ? hasMembers : hasCompany && hasPeople) ||
      !hasValidVehicle ||
      hasTodayRecordForSelectedKind
    );
  }, [
    vehicleCount,
    employmentKind,
    selectedForeman,
    selectedKogata,
    contractorFree,
    contractorSelectId,
    contractors,
    contractorPeopleRaw,
    hasTodayRecordForSelectedKind,
  ]);

  function toggle(setter: (next: Set<string>) => void, set: Set<string>, name: string) {
    const next = new Set(set);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setter(next);
  }

  function onStart() {
    setError(null);
    const v = vehicleCount;
    const hasMembers = selectedForeman.size > 0 || selectedKogata.size > 0;
    const contractorCompanyName =
      contractorFree.trim() ||
      contractors.find((c) => c.id === contractorSelectId)?.name?.trim() ||
      "";
    const contractorPeopleCountRaw = toNumberOrNaN(contractorPeopleRaw);
    const contractorPeopleCount =
      Number.isFinite(contractorPeopleCountRaw) && contractorPeopleCountRaw > 0
        ? Math.round(contractorPeopleCountRaw)
        : 0;
    if (employmentKind === "社員") {
      if (!hasMembers) {
        setError("参加メンバーを1名以上選択してください。");
        return;
      }
    } else {
      if (!contractorCompanyName.trim()) {
        setError("会社名を入力または選択してください。");
        return;
      }
      if (!contractorPeopleCount) {
        setError("人数は 1 以上の数値で入力してください。");
        return;
      }
    }
    if (!Number.isFinite(v) || v < 1 || !Number.isInteger(v)) {
      setError("車両台数は 1 以上の整数で指定してください。");
      return;
    }
    if (hasTodayRecordForSelectedKind) {
      setError("この作業種別の本日分記録は既に作成されています。");
      return;
    }

    const record: SiteDailyLaborRecord = {
      createdAt: new Date().toISOString(),
      dateKey: todayDateKey,
      finalManDays: null,
      employmentKind,
      contractorCompanyName,
      contractorPeopleCount,
      vehicleCount: v,
      memberForemanNames:
        employmentKind === "社員"
          ? [...selectedForeman].sort((a, b) => a.localeCompare(b))
          : [],
      memberKogataNames:
        employmentKind === "社員"
          ? [...selectedKogata].sort((a, b) => a.localeCompare(b))
          : [],
      hadHelpTeam: false,
      helpMemberNames: [],
      helpStartTime: null,
      helpEndTime: null,
      workStartIso: null,
      workEndIso: null,
      workManDaysPerPerson: null,
    };

    saveDailyLaborRecord(site.id, workKind, record);
    onStarted(workKind);
    onClose();
  }

  return (
    <div
      className={styles.modalBackdrop}
      role="presentation"
      onClick={onClose}
    >
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="work-start-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="work-start-title" className={styles.modalTitle}>
          作業を追加する
        </h2>

        <div className={styles.modalScroll}>
          <div className={styles.form}>
          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>作業種別</legend>
            <div className={styles.radioRow}>
              {WORK_KINDS.map((k) => (
                <label key={k} className={styles.radioLabel}>
                  <input
                    type="radio"
                    name="work-kind"
                    value={k}
                    checked={workKind === k}
                    onChange={() => setWorkKind(k)}
                  />
                  {k}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>社員 / 請負</legend>
            <div className={styles.radioRow}>
              {(["社員", "請負"] as const).map((k) => (
                <label key={k} className={styles.radioLabel}>
                  <input
                    type="radio"
                    name="employment-kind"
                    value={k}
                    checked={employmentKind === k}
                    onChange={() => setEmploymentKind(k)}
                  />
                  {k}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>参加メンバー</legend>

            {employmentKind === "社員" ? (
              <>
                <div className={styles.checkboxGroup}>
                  <div className={styles.checkboxGroupTitle}>職長</div>
                  {foremanMasters.length === 0 ? (
                    <p className={styles.hint}>職長マスターが登録されていません。</p>
                  ) : (
                    <div className={styles.checkboxWrap}>
                      {foremanMasters.map((m) => (
                        <label key={m.id} className={styles.checkboxLabel}>
                          <input
                            type="checkbox"
                            checked={selectedForeman.has(m.name)}
                            onChange={() =>
                              toggle(setSelectedForeman, selectedForeman, m.name)
                            }
                          />
                          {m.name}
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <div className={styles.checkboxGroup}>
                  <div className={styles.checkboxGroupTitle}>子方</div>
                  {kogataMasters.length === 0 ? (
                    <p className={styles.hint}>子方マスターが登録されていません。</p>
                  ) : (
                    <div className={styles.checkboxWrap}>
                      {kogataMasters.map((m) => (
                        <label key={m.id} className={styles.checkboxLabel}>
                          <input
                            type="checkbox"
                            checked={selectedKogata.has(m.name)}
                            onChange={() =>
                              toggle(setSelectedKogata, selectedKogata, m.name)
                            }
                          />
                          {m.name}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className={styles.field}>
                <span className={styles.label}>会社名</span>
                <div className={styles.dualField}>
                  <select
                    className={styles.select}
                    value={contractorSelectId}
                    onChange={(e) => setContractorSelectId(e.target.value)}
                    aria-label="会社名マスターから選択"
                  >
                    <option value="">マスターから選択</option>
                    {contractors.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <input
                    className={styles.textInput}
                    type="text"
                    value={contractorFree}
                    onChange={(e) => setContractorFree(e.target.value)}
                    placeholder="手入力（マスター未使用時、または上書き）"
                    autoComplete="organization"
                  />
                </div>
                <label className={styles.field}>
                  <span className={styles.label}>人数</span>
                  <input
                    type="number"
                    className={styles.numberInput}
                    min={1}
                    step={1}
                    value={contractorPeopleRaw}
                    onChange={(e) => setContractorPeopleRaw(e.target.value)}
                  />
                </label>
                <p className={styles.hint}>
                  手入力がある場合はそちらを優先して保存します。
                </p>
              </div>
            )}
          </fieldset>

          <div className={styles.field}>
            <span className={styles.label} id="vehicle-count-label">
              車両台数
            </span>
            <div
              className={styles.vehicleStepper}
              role="group"
              aria-labelledby="vehicle-count-label"
            >
              <button
                type="button"
                className={styles.vehicleStepBtn}
                aria-label="1台増やす"
                onClick={() => setVehicleCount((c) => c + 1)}
              >
                ▲
              </button>
              <span className={styles.vehicleValue} aria-live="polite">
                {vehicleCount}
              </span>
              <button
                type="button"
                className={styles.vehicleStepBtn}
                aria-label="1台減らす"
                disabled={vehicleCount <= 1}
                onClick={() => setVehicleCount((c) => Math.max(1, c - 1))}
              >
                ▼
              </button>
            </div>
            <div className={styles.vehicleShortcuts} role="group" aria-label="台数のショートカット">
              {([1, 2, 3] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  className={styles.vehicleShortcutBtn}
                  onClick={() => setVehicleCount(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          {hasTodayRecordForSelectedKind && (
            <p className={styles.note}>
              この作業種別の本日分記録は既に作成されています。別の作業種別を選ぶか、作業記録一覧をご確認ください。
            </p>
          )}
          </div>
        </div>

        <div className={styles.modalFooter}>
          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>
              キャンセル
            </button>
            <button
              type="button"
              className={styles.confirmBtn}
              disabled={startDisabled}
              onClick={onStart}
            >
              作業開始
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

