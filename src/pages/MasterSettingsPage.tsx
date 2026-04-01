import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { MasterItem } from "../types/masterItem";
import type { NotificationRecipient } from "../types/notificationRecipient";
import {
  addRecipient,
  loadRecipients,
  removeRecipient,
} from "../lib/notificationRecipientStorage";
import {
  loadClientMasters,
  addClientMaster,
  removeClientMaster,
  loadVehicleMasters,
  addVehicleMaster,
  removeVehicleMaster,
  loadSalesMasters,
  addSalesMaster,
  removeSalesMaster,
  loadSiteTypeMasters,
  addSiteTypeMaster,
  removeSiteTypeMaster,
} from "../lib/mastersStorage";
import type { ContractorMaster } from "../types/contractorMaster";
import {
  addContractorMaster,
  loadContractorMasters,
  removeContractorMaster,
  updateContractorMaster,
} from "../lib/contractorMasterStorage";
import type { StaffMaster, StaffRole } from "../types/staffMaster";
import {
  addStaffMaster,
  loadStaffMasters,
  removeStaffMaster,
  staffHasRole,
  updateStaffMaster,
} from "../lib/staffMasterStorage";
import type { TrafficCostSetting } from "../types/trafficCostSetting";
import {
  addTrafficCostSetting,
  loadTrafficCostSettings,
  removeTrafficCostSetting,
  updateTrafficCostSetting,
} from "../lib/trafficCostStorage";
import {
  loadCompanyProfile,
  saveCompanyProfile,
  type CompanyProfile,
} from "../lib/companyProfileStorage";
import type { ExternalCompany } from "../types/externalCompany";
import {
  addExternalCompany,
  loadExternalCompanies,
  normalizeCompanyKey,
  removeExternalCompany,
  updateExternalCompany,
} from "../lib/externalCompaniesStorage";
import styles from "./MasterSettingsPage.module.css";

const PIN_DEFAULT = "1234";
const AUTH_KEY = "mastersPinAuthed";

type TabId =
  | "notify"
  | "client"
  | "company"
  | "contractor"
  | "staff"
  | "vehicle"
  | "sales"
  | "siteType"
  | "traffic"
  | "externalCompany";

const TABS: { id: TabId; label: string }[] = [
  { id: "notify", label: "通知先" },
  { id: "company", label: "自社設定" },
  { id: "client", label: "元請け様" },
  { id: "contractor", label: "請負会社" },
  { id: "staff", label: "スタッフ" },
  { id: "vehicle", label: "車両" },
  { id: "sales", label: "担当営業" },
  { id: "siteType", label: "現場種別" },
  { id: "traffic", label: "交通費設定" },
  { id: "externalCompany", label: "外部会社" },
];

const STAFF_ROLE_OPTIONS: StaffRole[] = ["職長", "子方", "その他"];

function StaffPanel({ onRefresh }: { onRefresh: () => void }) {
  const list = loadStaffMasters();
  const [name, setName] = useState("");
  const [roles, setRoles] = useState<Set<StaffRole>>(new Set());
  const [attendanceEnabled, setAttendanceEnabled] = useState(true);
  const [personalPin, setPersonalPin] = useState("");
  const [personalCode, setPersonalCode] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  function toggleRole(r: StaffRole) {
    setRoles((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      return next;
    });
  }

  function onAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const n = name.trim();
    if (!n) {
      setError("名前を入力してください。");
      return;
    }
    addStaffMaster({
      name: n,
      roles: [...roles],
      attendanceEnabled,
      personalPin: personalPin.replace(/\D/g, "").slice(0, 4),
      personalCode: personalCode.replace(/\D/g, "").slice(0, 6),
      birthDate: "",
      address: "",
      jobType: "",
      position: "",
      hireDate: "",
      emergencyContact: { name: "", relationship: "", phone: "" },
      insurance: { health: "", pension: "", employment: "" },
      kentaiBook: false,
      chutaiBook: false,
      qualifications: [],
      paidLeaveUsages: [],
      birthdayLeaveUsages: [],
      email: newEmail.trim(),
    });
    setName("");
    setRoles(new Set());
    setAttendanceEnabled(true);
    setPersonalPin("");
    setPersonalCode("");
    setNewEmail("");
    onRefresh();
  }

  function setRow(next: StaffMaster) {
    updateStaffMaster(next);
    onRefresh();
  }

  return (
    <div className={styles.panel}>
      <h2 className={styles.panelTitle}>スタッフマスター</h2>
      <p className={styles.panelDesc}>
        スタッフの「役割」と「打刻対象」をまとめて管理します。職長名・子方名の選択肢や打刻ページの表示に反映されます。
      </p>

      <form className={styles.form} onSubmit={onAdd} noValidate>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <div className={styles.fields}>
          <label className={styles.field}>
            <span className={styles.label}>名前（必須）</span>
            <input
              className={styles.input}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例：伊藤"
            />
          </label>

          <div className={styles.field}>
            <span className={styles.label}>役割（複数可）</span>
            <div className={styles.checkboxRow} role="group" aria-label="役割">
              {STAFF_ROLE_OPTIONS.map((r) => (
                <label key={r} className={styles.checkboxItem}>
                  <input
                    type="checkbox"
                    checked={roles.has(r)}
                    onChange={() => toggleRole(r)}
                  />
                  <span>{r}</span>
                </label>
              ))}
            </div>
          </div>

          <label className={styles.field}>
            <span className={styles.label}>打刻対象</span>
            <div className={styles.toggleRow}>
              <input
                type="checkbox"
                checked={attendanceEnabled}
                onChange={(e) => setAttendanceEnabled(e.target.checked)}
                aria-label="打刻対象"
              />
              <span className={styles.toggleHint}>
                {attendanceEnabled ? "ON" : "OFF"}
              </span>
            </div>
          </label>

          <label className={styles.field}>
            <span className={styles.label}>個人PIN（4桁）</span>
            <input
              className={styles.input}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={personalPin}
              onChange={(e) =>
                setPersonalPin(e.target.value.replace(/\D/g, "").slice(0, 4))
              }
              placeholder="例：1234"
              aria-label="個人PIN"
            />
            <span className={styles.fieldHint}>
              スタッフ一覧から個人ページを開くときに使います。
            </span>
          </label>

          <label className={styles.field}>
            <span className={styles.label}>個人コード（6桁）</span>
            <input
              className={styles.input}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={personalCode}
              onChange={(e) =>
                setPersonalCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="例：000001"
              aria-label="個人コード"
            />
            <span className={styles.fieldHint}>
              給与明細PDFのファイル名と紐付けます（数字6桁）。
            </span>
          </label>

          <label className={styles.field}>
            <span className={styles.label}>メールアドレス（通知用）</span>
            <input
              className={styles.input}
              type="email"
              autoComplete="off"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="休暇申請の結果通知など"
            />
          </label>

          <button type="submit" className={styles.submit}>
            追加
          </button>
        </div>
      </form>

      <h3 className={styles.subTitle}>登録一覧</h3>
      {list.length === 0 ? (
        <p className={styles.empty}>まだ登録がありません。</p>
      ) : (
        <ul className={styles.list}>
          {list.map((r) => (
            <li key={r.id} className={styles.card}>
              <div className={styles.cardBody}>
                <div className={styles.staffRowTop}>
                  <input
                    className={styles.input}
                    type="text"
                    value={r.name}
                    onChange={(e) => setRow({ ...r, name: e.target.value })}
                    aria-label="名前"
                  />
                  <input
                    className={styles.input}
                    type="email"
                    value={r.email ?? ""}
                    onChange={(e) => setRow({ ...r, email: e.target.value })}
                    placeholder="メール（通知用）"
                    aria-label="メールアドレス"
                  />
                </div>
                <div className={styles.staffRowMid}>
                  <div className={styles.checkboxRow} role="group" aria-label="役割">
                    {STAFF_ROLE_OPTIONS.map((role) => (
                      <label key={role} className={styles.checkboxItem}>
                        <input
                          type="checkbox"
                          checked={staffHasRole(r, role)}
                          onChange={() => {
                            const nextRoles = new Set(r.roles);
                            if (nextRoles.has(role)) nextRoles.delete(role);
                            else nextRoles.add(role);
                            setRow({ ...r, roles: [...nextRoles] });
                          }}
                        />
                        <span>{role}</span>
                      </label>
                    ))}
                  </div>
                  <label className={styles.toggleRow}>
                    <input
                      type="checkbox"
                      checked={r.attendanceEnabled}
                      onChange={(e) =>
                        setRow({ ...r, attendanceEnabled: e.target.checked })
                      }
                    />
                    <span className={styles.toggleHint}>打刻対象</span>
                  </label>
                  <label className={styles.staffPinRow}>
                    <span className={styles.label}>個人PIN（4桁）</span>
                    <input
                      className={styles.input}
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={4}
                      value={r.personalPin}
                      onChange={(e) =>
                        setRow({
                          ...r,
                          personalPin: e.target.value.replace(/\D/g, "").slice(0, 4),
                        })
                      }
                      aria-label="個人PIN"
                    />
                  </label>
                  <label className={styles.staffPinRow}>
                    <span className={styles.label}>個人コード（6桁）</span>
                    <input
                      className={styles.input}
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={6}
                      value={r.personalCode ?? ""}
                      onChange={(e) =>
                        setRow({
                          ...r,
                          personalCode: e.target.value.replace(/\D/g, "").slice(0, 6),
                        })
                      }
                      aria-label="個人コード"
                    />
                  </label>
                </div>
              </div>
              <button
                type="button"
                className={styles.delete}
                onClick={() => {
                  removeStaffMaster(r.id);
                  onRefresh();
                }}
              >
                削除
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ContractorPanel({ onRefresh }: { onRefresh: () => void }) {
  const list = loadContractorMasters();
  const [name, setName] = useState("");
  const [viewPin, setViewPin] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const n = name.trim();
    if (!n) {
      setError("会社名を入力してください。");
      return;
    }
    const created = addContractorMaster(n, viewPin.trim());
    if (email.trim()) {
      updateContractorMaster({ ...created, email: email.trim() });
    }
    setName("");
    setViewPin("");
    setEmail("");
    onRefresh();
  }

  function setRow(next: ContractorMaster) {
    updateContractorMaster(next);
    onRefresh();
  }

  return (
    <div className={styles.panel}>
      <h2 className={styles.panelTitle}>請負会社マスター</h2>
      <p className={styles.panelDesc}>
        請負会社名と、請負会社側の閲覧ページで使用する「閲覧用PIN」を管理します。
      </p>

      <form className={styles.form} onSubmit={onAdd} noValidate>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.fields}>
          <label className={styles.field}>
            <span className={styles.label}>会社名（必須）</span>
            <input
              className={styles.input}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例：〇〇工業株式会社"
              autoComplete="organization"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>閲覧用PIN</span>
            <input
              className={`${styles.input} ${styles.pinInput}`}
              type="text"
              inputMode="numeric"
              value={viewPin}
              onChange={(e) => setViewPin(e.target.value)}
              placeholder="例：0000"
              autoComplete="off"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>メールアドレス</span>
            <input
              className={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="例：vendor@example.com"
              autoComplete="email"
            />
          </label>
          <button type="submit" className={styles.submit}>
            追加
          </button>
        </div>
      </form>

      <h3 className={styles.subTitle}>登録一覧</h3>
      {list.length === 0 ? (
        <p className={styles.empty}>まだ登録がありません。</p>
      ) : (
        <ul className={styles.list}>
          {list.map((r) => (
            <li key={r.id} className={styles.card}>
              <div className={styles.contractorRow}>
                <div className={styles.cardBody}>
                  <div className={styles.cardName}>{r.name}</div>
                </div>
                <label className={styles.field} style={{ minWidth: "10rem" }}>
                  <span className={styles.label}>閲覧用PIN</span>
                  <input
                    className={`${styles.input} ${styles.pinInput}`}
                    type="text"
                    inputMode="numeric"
                    value={r.viewPin}
                    onChange={(e) => setRow({ ...r, viewPin: e.target.value })}
                    autoComplete="off"
                  />
                </label>
                <label className={styles.field} style={{ minWidth: "16rem" }}>
                  <span className={styles.label}>メールアドレス</span>
                  <input
                    className={styles.input}
                    type="email"
                    value={r.email}
                    onChange={(e) => setRow({ ...r, email: e.target.value })}
                    autoComplete="email"
                  />
                </label>
              </div>
              <button
                type="button"
                className={styles.delete}
                onClick={() => {
                  removeContractorMaster(r.id);
                  onRefresh();
                }}
              >
                削除
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SimpleNameListPanel({
  title,
  description,
  placeholder,
  list,
  onRefresh,
  onAdd,
  onRemove,
}: {
  title: string;
  description: string;
  placeholder: string;
  list: MasterItem[];
  onRefresh: () => void;
  onAdd: (name: string) => void;
  onRemove: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const n = name.trim();
    if (!n) {
      setError("名前を入力してください。");
      return;
    }
    onAdd(n);
    setName("");
    onRefresh();
  }

  function handleDelete(id: string) {
    onRemove(id);
    onRefresh();
  }

  return (
    <div className={styles.panel}>
      <h2 className={styles.panelTitle}>{title}</h2>
      <p className={styles.panelDesc}>{description}</p>

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.fields}>
          <label className={styles.field}>
            <span className={styles.label}>追加</span>
            <input
              className={styles.input}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={placeholder}
            />
          </label>
          <button type="submit" className={styles.submit}>
            追加
          </button>
        </div>
      </form>

      <h3 className={styles.subTitle}>登録一覧</h3>
      {list.length === 0 ? (
        <p className={styles.empty}>まだ登録がありません。</p>
      ) : (
        <ul className={styles.list}>
          {list.map((r) => (
            <li key={r.id} className={styles.card}>
              <div className={styles.cardBody}>
                <span className={styles.cardName}>{r.name}</span>
              </div>
              <button
                type="button"
                className={styles.delete}
                onClick={() => handleDelete(r.id)}
              >
                削除
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NotificationPanel() {
  const [list, setList] = useState<NotificationRecipient[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setList(loadRecipients());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const n = name.trim();
    const em = email.trim();
    if (!n) {
      setError("名前を入力してください。");
      return;
    }
    if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      setError("有効なメールアドレスを入力してください。");
      return;
    }
    addRecipient({ name: n, email: em });
    setName("");
    setEmail("");
    refresh();
  }

  function handleDelete(id: string) {
    removeRecipient(id);
    refresh();
  }

  return (
    <div className={styles.panel}>
      <h2 className={styles.panelTitle}>通知先</h2>
      <p className={styles.panelDesc}>
        メール通知の宛先を登録します。各現場の「通知先」タブで送る相手を選べます。
      </p>

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.fields}>
          <label className={styles.field}>
            <span className={styles.label}>名前</span>
            <input
              className={styles.input}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例：山田 太郎"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>メールアドレス</span>
            <input
              className={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="例：yamada@example.com"
            />
          </label>
          <button type="submit" className={styles.submit}>
            追加
          </button>
        </div>
      </form>

      <h3 className={styles.subTitle}>登録一覧</h3>
      {list.length === 0 ? (
        <p className={styles.empty}>まだ登録がありません。</p>
      ) : (
        <ul className={styles.list}>
          {list.map((r) => (
            <li key={r.id} className={styles.card}>
              <div className={styles.cardBody}>
                <span className={styles.cardName}>{r.name}</span>
                <span className={styles.cardEmail}>{r.email}</span>
              </div>
              <button
                type="button"
                className={styles.delete}
                onClick={() => handleDelete(r.id)}
              >
                削除
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function yenOrNaN(raw: string): number {
  const t = raw.trim().replace(/,/g, "");
  if (!t) return NaN;
  const n = Number(t);
  return n;
}

function TrafficCostPanel({ onRefresh }: { onRefresh: () => void }) {
  const [list, setList] = useState<TrafficCostSetting[]>([]);
  const [municipality, setMunicipality] = useState("");
  const [gasRaw, setGasRaw] = useState("");
  const [etcRaw, setEtcRaw] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setList(loadTrafficCostSettings());
    onRefresh();
  }, [onRefresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    function onSaved() {
      refresh();
    }
    window.addEventListener("trafficCostSettingsSaved", onSaved);
    return () => window.removeEventListener("trafficCostSettingsSaved", onSaved);
  }, [refresh]);

  const gas = yenOrNaN(gasRaw);
  const etc = yenOrNaN(etcRaw);
  const total =
    Number.isFinite(gas) && Number.isFinite(etc)
      ? Math.max(0, Math.round(gas)) + Math.max(0, Math.round(etc))
      : null;

  function handleAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const m = municipality.trim();
    if (!m) {
      setError("市区町村名を入力してください。");
      return;
    }
    if (!Number.isFinite(gas) || gas < 0) {
      setError("ガソリン代は 0 以上の数値で入力してください。");
      return;
    }
    if (!Number.isFinite(etc) || etc < 0) {
      setError("ETC料金は 0 以上の数値で入力してください。");
      return;
    }
    addTrafficCostSetting({
      municipality: m,
      gasYen: Math.round(gas),
      etcYen: Math.round(etc),
    });
    setMunicipality("");
    setGasRaw("");
    setEtcRaw("");
    refresh();
  }

  function updateRow(id: string, patch: Partial<TrafficCostSetting>) {
    const prev = list.find((x) => x.id === id);
    if (!prev) return;
    const next: TrafficCostSetting = { ...prev, ...patch };
    updateTrafficCostSetting(next);
    refresh();
  }

  return (
    <div className={styles.panel}>
      <h2 className={styles.panelTitle}>交通費設定</h2>
      <p className={styles.panelDesc}>
        市区町村ごとに、1台あたりの交通費（ガソリン代＋ETC料金）を登録します。現場の住所（市区町村）と照合して自動表示・集計します。
      </p>

      <form className={styles.form} onSubmit={handleAdd} noValidate>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.fields}>
          <label className={styles.field}>
            <span className={styles.label}>市区町村名</span>
            <input
              className={styles.input}
              type="text"
              value={municipality}
              onChange={(e) => setMunicipality(e.target.value)}
              placeholder="例：伊那市"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>ガソリン代（円）</span>
            <input
              className={styles.input}
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={gasRaw}
              onChange={(e) => setGasRaw(e.target.value)}
              placeholder="例：3000"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>ETC料金（円）</span>
            <input
              className={styles.input}
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={etcRaw}
              onChange={(e) => setEtcRaw(e.target.value)}
              placeholder="例：800"
            />
          </label>
          <div className={styles.field}>
            <span className={styles.label}>合計交通費</span>
            <div className={styles.input} aria-label="合計交通費（自動計算）">
              {total === null ? "—" : `${total.toLocaleString()} 円`}
            </div>
          </div>
          <button type="submit" className={styles.submit}>
            追加
          </button>
        </div>
      </form>

      <h3 className={styles.subTitle}>登録一覧</h3>
      {list.length === 0 ? (
        <p className={styles.empty}>まだ登録がありません。</p>
      ) : (
        <ul className={styles.list}>
          {list.map((r) => {
            const rowTotal = r.gasYen + r.etcYen;
            return (
              <li key={r.id} className={styles.card}>
                <div className={styles.cardBody}>
                  <label className={styles.field}>
                    <span className={styles.label}>市区町村名</span>
                    <input
                      className={styles.input}
                      type="text"
                      value={r.municipality}
                      onChange={(e) =>
                        updateRow(r.id, { municipality: e.target.value })
                      }
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>ガソリン代（円）</span>
                    <input
                      className={styles.input}
                      type="number"
                      min={0}
                      step={1}
                      value={r.gasYen}
                      onChange={(e) =>
                        updateRow(r.id, {
                          gasYen: Math.max(
                            0,
                            Math.round(Number(e.target.value || 0))
                          ),
                        })
                      }
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>ETC料金（円）</span>
                    <input
                      className={styles.input}
                      type="number"
                      min={0}
                      step={1}
                      value={r.etcYen}
                      onChange={(e) =>
                        updateRow(r.id, {
                          etcYen: Math.max(
                            0,
                            Math.round(Number(e.target.value || 0))
                          ),
                        })
                      }
                    />
                  </label>
                  <div className={styles.field}>
                    <span className={styles.label}>合計交通費</span>
                    <div className={styles.input}>
                      {rowTotal.toLocaleString()} 円
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.delete}
                  onClick={() => {
                    removeTrafficCostSetting(r.id);
                    refresh();
                  }}
                >
                  削除
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function CompanyPanel({ onRefresh }: { onRefresh: () => void }) {
  const initial = loadCompanyProfile();
  const [companyName, setCompanyName] = useState(initial.companyName);
  const [logoDataUrl, setLogoDataUrl] = useState(initial.logoDataUrl);
  const [adminEmail, setAdminEmail] = useState(initial.adminEmail);
  const [kouseiPin, setKouseiPin] = useState(initial.kouseiPin);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function onLogoChange(file: File | null) {
    setError(null);
    setMessage(null);
    if (!file) return;
    if (!(file.type === "image/png" || file.type === "image/jpeg")) {
      setError("ロゴは PNG または JPG でアップロードしてください。");
      return;
    }
    if (file.size > 2_000_000) {
      setError("ロゴ画像が大きすぎます（2MB以下にしてください）。");
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("read error"));
      reader.readAsDataURL(file);
    });
    setLogoDataUrl(dataUrl);
  }

  function onSave() {
    setError(null);
    setMessage(null);
    const next: CompanyProfile = {
      companyName: companyName.trim(),
      logoDataUrl: logoDataUrl.trim(),
      adminEmail: adminEmail.trim(),
      kouseiPin: kouseiPin.trim(),
    };
    saveCompanyProfile(next);
    onRefresh();
    setMessage("保存しました。");
  }

  return (
    <div className={styles.panel}>
      <h2 className={styles.panelTitle}>自社設定</h2>
      <p className={styles.panelDesc}>
        PDF出力で使用する自社会社名とロゴを設定します。
      </p>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {message && <p className={styles.saved}>{message}</p>}

      <div className={styles.fields}>
        <label className={styles.field}>
          <span className={styles.label}>自社会社名</span>
          <input
            className={styles.input}
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="例：株式会社〇〇"
            autoComplete="organization"
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>事務員 通知先メールアドレス</span>
          <input
            className={styles.input}
            type="email"
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
            placeholder="例：office@example.com"
            autoComplete="email"
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>KOUSEI専用PIN</span>
          <input
            className={styles.input}
            type="text"
            inputMode="numeric"
            value={kouseiPin}
            onChange={(e) => setKouseiPin(e.target.value)}
            placeholder="例：0000"
            autoComplete="off"
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>自社ロゴ画像（PNG / JPG）</span>
          <input
            className={styles.input}
            type="file"
            accept="image/png,image/jpeg"
            onChange={(e) => void onLogoChange(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>

      {logoDataUrl.trim() && (
        <div className={styles.logoPreview}>
          <img src={logoDataUrl} alt="自社ロゴプレビュー" />
          <button
            type="button"
            className={styles.delete}
            onClick={() => setLogoDataUrl("")}
          >
            ロゴを削除
          </button>
        </div>
      )}

      <div className={styles.fields} style={{ justifyContent: "flex-end" }}>
        <button type="button" className={styles.submit} onClick={onSave}>
          保存
        </button>
      </div>
    </div>
  );
}

export function MasterSettingsPage() {
  const [tab, setTab] = useState<TabId>("notify");
  const [, bump] = useState(0);
  const refresh = useCallback(() => bump((n) => n + 1), []);

  const [authed, setAuthed] = useState(() => {
    try {
      return sessionStorage.getItem(AUTH_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);

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
              "BS",
              "0",
              "ENTER",
            ].map((k) => {
              const isBack = k === "BS";
              const isEnter = k === "ENTER";
              const label = isBack ? "⌫" : isEnter ? "入室" : k;
              const className = isEnter ? styles.enterBtn : styles.keyBtn;
              return (
                <button
                  key={k}
                  type="button"
                  className={className}
                  disabled={isEnter && pin.length !== 4}
                  onClick={() => {
                    setPinError(null);
                    if (isBack) {
                      setPin((p) => p.slice(0, -1));
                      return;
                    }
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
                    if (pin.length >= 4) return;
                    setPin((p) => p + k);
                  }}
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

  return (
    <div>
      <div className={styles.breadcrumb}>
        <Link to="/">← 現場一覧に戻る</Link>
      </div>

      <h1 className={styles.title}>マスター設定</h1>
      <p className={styles.lead}>
        通知先・元請け・職長・子方・車両・担当営業・現場種別をまとめて管理します。現場登録フォームの選択肢に反映されます。
      </p>

      <div className={styles.tabs} role="tablist" aria-label="マスター種別">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? styles.tabActive : styles.tab}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "notify" && <NotificationPanel />}

      {tab === "company" && <CompanyPanel onRefresh={refresh} />}

      {tab === "client" && (
        <SimpleNameListPanel
          title="元請け様マスター"
          description="会社名のみを登録します。"
          placeholder="例：〇〇建設株式会社"
          list={loadClientMasters()}
          onRefresh={refresh}
          onAdd={(n) => addClientMaster(n)}
          onRemove={removeClientMaster}
        />
      )}

      {tab === "contractor" && <ContractorPanel onRefresh={refresh} />}

      {tab === "staff" && <StaffPanel onRefresh={refresh} />}

      {tab === "vehicle" && (
        <SimpleNameListPanel
          title="車両マスター"
          description="車両名・ナンバーなど、識別できる文字列を1行で登録します。"
          placeholder="例：2tショート 品川500あ1234"
          list={loadVehicleMasters()}
          onRefresh={refresh}
          onAdd={(n) => addVehicleMaster(n)}
          onRemove={removeVehicleMaster}
        />
      )}

      {tab === "sales" && (
        <SimpleNameListPanel
          title="担当営業マスター"
          description="担当営業の名前を登録します。"
          placeholder="例：田中 一郎"
          list={loadSalesMasters()}
          onRefresh={refresh}
          onAdd={(n) => addSalesMaster(n)}
          onRemove={removeSalesMaster}
        />
      )}

      {tab === "siteType" && (
        <SimpleNameListPanel
          title="現場種別マスター"
          description="新築・改修・塗装・解体・設備・土木が初回のみ自動登録されます。追加・削除できます。"
          placeholder="例：その他工事"
          list={loadSiteTypeMasters()}
          onRefresh={refresh}
          onAdd={(n) => addSiteTypeMaster(n)}
          onRemove={removeSiteTypeMaster}
        />
      )}

      {tab === "traffic" && <TrafficCostPanel onRefresh={refresh} />}

      {tab === "externalCompany" && <ExternalCompanyPanel onRefresh={refresh} />}
    </div>
  );
}

function ExternalCompanyPanel({ onRefresh }: { onRefresh: () => void }) {
  const list = loadExternalCompanies();
  const [companyName, setCompanyName] = useState("");
  const [companyKeyRaw, setCompanyKeyRaw] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const n = companyName.trim();
    if (!n) {
      setError("会社名を入力してください。");
      return;
    }
    const k = normalizeCompanyKey(companyKeyRaw);
    if (!k || !/^[a-z0-9]+$/.test(k)) {
      setError("URLキーは英数字のみで入力してください。");
      return;
    }
    const p = pin.replace(/\D/g, "").slice(0, 4);
    if (p.length !== 4) {
      setError("PINは4桁の数字を入力してください。");
      return;
    }
    const created = addExternalCompany({
      companyName: n,
      companyKey: k,
      pin: p,
    });
    if (!created) {
      setError("このURLキーは既に使われています。");
      return;
    }
    setCompanyName("");
    setCompanyKeyRaw("");
    setPin("");
    onRefresh();
  }

  function setRow(next: ExternalCompany) {
    updateExternalCompany(next);
    onRefresh();
  }

  return (
    <div className={styles.panel}>
      <h2 className={styles.panelTitle}>外部会社マスター</h2>
      <p className={styles.panelDesc}>
        外部会社向けの現場登録ページ（パス{" "}
        <code>/external/URLキー</code>）で使う会社名・URLキー・PINを登録します。
      </p>

      <form className={styles.form} onSubmit={onAdd} noValidate>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.fields}>
          <label className={styles.field}>
            <span className={styles.label}>会社名（必須）</span>
            <input
              className={styles.input}
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="例：〇〇工業株式会社"
              autoComplete="organization"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>URLキー（英数字のみ・必須）</span>
            <input
              className={styles.input}
              type="text"
              value={companyKeyRaw}
              onChange={(e) =>
                setCompanyKeyRaw(e.target.value.replace(/[^a-zA-Z0-9]/g, ""))
              }
              placeholder="例：kousei"
              autoComplete="off"
              spellCheck={false}
            />
            <span className={styles.fieldHint}>
              登録時のURL例：…/external/
              {companyKeyRaw ? normalizeCompanyKey(companyKeyRaw) || "（キー）" : "（キー）"}
            </span>
          </label>
          <label className={styles.field}>
            <span className={styles.label}>PIN（4桁）</span>
            <input
              className={`${styles.input} ${styles.pinInput}`}
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="例：1234"
              autoComplete="off"
            />
          </label>
          <button type="submit" className={styles.submit}>
            追加
          </button>
        </div>
      </form>

      <h3 className={styles.subTitle}>登録一覧</h3>
      {list.length === 0 ? (
        <p className={styles.empty}>まだ登録がありません。</p>
      ) : (
        <ul className={styles.list}>
          {list.map((r) => (
            <li key={r.id} className={styles.card}>
              <div className={styles.cardBody}>
                <div className={styles.staffRowTop}>
                  <input
                    className={styles.input}
                    type="text"
                    value={r.companyName}
                    onChange={(e) =>
                      setRow({ ...r, companyName: e.target.value })
                    }
                    aria-label="会社名"
                  />
                  <input
                    className={styles.input}
                    type="text"
                    value={r.companyKey}
                    onChange={(e) =>
                      setRow({
                        ...r,
                        companyKey: normalizeCompanyKey(e.target.value),
                      })
                    }
                    aria-label="URLキー"
                    spellCheck={false}
                  />
                </div>
                <label className={styles.field}>
                  <span className={styles.label}>PIN（4桁）</span>
                  <input
                    className={`${styles.input} ${styles.pinInput}`}
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    value={r.pin}
                    onChange={(e) =>
                      setRow({
                        ...r,
                        pin: e.target.value.replace(/\D/g, "").slice(0, 4),
                      })
                    }
                  />
                </label>
              </div>
              <button
                type="button"
                className={styles.delete}
                onClick={() => {
                  removeExternalCompany(r.id);
                  onRefresh();
                }}
              >
                削除
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
