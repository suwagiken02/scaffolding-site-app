import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Site } from "../types/site";
import type { ExternalCompany } from "../types/externalCompany";
import {
  getExternalCompanyByKey,
  normalizeCompanyKey,
  pinMatches,
} from "../lib/externalCompaniesStorage";
import {
  addExternalClientMaster,
  addExternalSalesMaster,
  loadExternalCompanyMasters,
  removeExternalClientMaster,
  removeExternalSalesMaster,
} from "../lib/externalCompanyMastersStorage";
import { purgeSiteData } from "../lib/purgeSiteData";
import {
  addSite,
  getSiteById,
  loadSites,
  newSiteMemoId,
  normalizeEntranceDateKeys,
  normalizeSiteMemos,
  startDateFromEntranceDateKeys,
  updateSite,
} from "../lib/siteStorage";
import { externalPortalAuthStorageKey } from "../lib/externalPortalAuth";
import {
  siteHasAnyWorkRecordRows,
  siteHasHaraiWorkRecordRows,
} from "../lib/siteWorkRecordKeys";
import { loadSiteTypeMasters } from "../lib/mastersStorage";
import editorStyles from "../components/SiteEditorForm.module.css";
import formStyles from "./SiteFormPage.module.css";
import pinStyles from "./LeaveRequestsPage.module.css";
import siteDetailStyles from "./SiteDetailPage.module.css";
import styles from "./ExternalSitePortalPage.module.css";

function newSiteId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `site-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function computeSiteStatus(site: Site): "組立前" | "設置中" | "解体中" | "終了" {
  if (site.scaffoldingRemovalCompletedAt?.trim()) return "終了";
  if (!siteHasAnyWorkRecordRows(site.id)) return "組立前";
  return siteHasHaraiWorkRecordRows(site.id) ? "解体中" : "設置中";
}

function statusBadgeClass(
  status: ReturnType<typeof computeSiteStatus>
): string {
  if (status === "組立前") return styles.stPre;
  if (status === "設置中") return styles.stActive;
  if (status === "解体中") return styles.stDismantle;
  return styles.stEnded;
}

type ExternalSiteListSort =
  | "entranceDesc"
  | "entranceAsc"
  | "name"
  | "status";

const STATUS_SORT_ORDER: Record<
  ReturnType<typeof computeSiteStatus>,
  number
> = {
  組立前: 0,
  設置中: 1,
  解体中: 2,
  終了: 3,
};

/** 複数入場日があるときは最新日を代表とする。未設定時は開始日・登録日で代替。 */
function representativeEntranceDateKey(site: Site): string {
  const keys = normalizeEntranceDateKeys(site.entranceDateKeys);
  if (keys.length > 0) {
    return keys.reduce((a, b) => (a >= b ? a : b));
  }
  const sd = site.startDate?.trim();
  if (sd) return sd;
  const c = site.createdAt?.trim();
  if (c) {
    const d = c.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  }
  return "";
}

function tieBreakNameId(a: Site, b: Site): number {
  const n = a.name.localeCompare(b.name, "ja", { sensitivity: "base" });
  if (n !== 0) return n;
  return a.id.localeCompare(b.id);
}

function compareExternalSites(
  a: Site,
  b: Site,
  sort: ExternalSiteListSort
): number {
  switch (sort) {
    case "entranceDesc": {
      const ka = representativeEntranceDateKey(a);
      const kb = representativeEntranceDateKey(b);
      if (!ka && !kb) return tieBreakNameId(a, b);
      if (!ka) return 1;
      if (!kb) return -1;
      const c = kb.localeCompare(ka);
      return c !== 0 ? c : tieBreakNameId(a, b);
    }
    case "entranceAsc": {
      const ka = representativeEntranceDateKey(a);
      const kb = representativeEntranceDateKey(b);
      if (!ka && !kb) return tieBreakNameId(a, b);
      if (!ka) return 1;
      if (!kb) return -1;
      const c = ka.localeCompare(kb);
      return c !== 0 ? c : tieBreakNameId(a, b);
    }
    case "name":
      return tieBreakNameId(a, b);
    case "status": {
      const c =
        STATUS_SORT_ORDER[computeSiteStatus(a)] -
        STATUS_SORT_ORDER[computeSiteStatus(b)];
      return c !== 0 ? c : tieBreakNameId(a, b);
    }
    default:
      return tieBreakNameId(a, b);
  }
}

export function ExternalSitePortalPage() {
  const { companyKey: companyKeyParam } = useParams<{ companyKey: string }>();
  const normalizedKey = useMemo(
    () => normalizeCompanyKey(companyKeyParam ?? ""),
    [companyKeyParam]
  );

  const [company, setCompany] = useState<ExternalCompany | null>(() =>
    normalizedKey ? getExternalCompanyByKey(normalizedKey) : null
  );

  useEffect(() => {
    if (!normalizedKey) {
      setCompany(null);
      return;
    }
    setCompany(getExternalCompanyByKey(normalizedKey));
  }, [normalizedKey]);

  const [authed, setAuthed] = useState(() => {
    if (!normalizedKey) return false;
    try {
      return sessionStorage.getItem(externalPortalAuthStorageKey(normalizedKey)) === "1";
    } catch {
      return false;
    }
  });

  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);

  const [sites, setSites] = useState<Site[]>([]);
  const [revision, setRevision] = useState(0);

  const [mode, setMode] = useState<"list" | "form">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [listTab, setListTab] = useState<"sites" | "masters">("sites");
  const [listSort, setListSort] = useState<ExternalSiteListSort>("entranceDesc");
  const [listSearchQuery, setListSearchQuery] = useState("");
  const [masterRevision, setMasterRevision] = useState(0);

  const [deletePinSiteId, setDeletePinSiteId] = useState<string | null>(null);
  const [deletePin, setDeletePin] = useState("");
  const [deletePinError, setDeletePinError] = useState<string | null>(null);
  const [confirmDeleteSiteId, setConfirmDeleteSiteId] = useState<string | null>(
    null
  );

  const reloadSites = useCallback(() => {
    if (!normalizedKey) {
      setSites([]);
      return;
    }
    const list = loadSites().filter(
      (s) =>
        normalizeCompanyKey(s.externalCompanyKey ?? "") === normalizedKey
    );
    setSites(list);
  }, [normalizedKey]);

  useEffect(() => {
    reloadSites();
  }, [reloadSites, revision]);

  useEffect(() => {
    function onSaved() {
      setRevision((r) => r + 1);
    }
    window.addEventListener("siteDataSaved", onSaved);
    return () => window.removeEventListener("siteDataSaved", onSaved);
  }, []);

  useEffect(() => {
    if (!normalizedKey) return;
    try {
      setAuthed(sessionStorage.getItem(externalPortalAuthStorageKey(normalizedKey)) === "1");
    } catch {
      setAuthed(false);
    }
  }, [normalizedKey]);

  const siteTypeMasters = useMemo(() => loadSiteTypeMasters(), [revision]);

  const filteredSites = useMemo(() => {
    const q = listSearchQuery.trim().toLowerCase();
    if (!q) return sites;
    return sites.filter((s) => {
      const name = (s.name || "").toLowerCase();
      const client = (s.clientName || "").trim().toLowerCase();
      return name.includes(q) || client.includes(q);
    });
  }, [sites, listSearchQuery]);

  const sortedSites = useMemo(
    () =>
      [...filteredSites].sort((a, b) =>
        compareExternalSites(a, b, listSort)
      ),
    [filteredSites, listSort]
  );

  if (!companyKeyParam || !normalizedKey || !company) {
    return (
      <div className={styles.page}>
        <p className={styles.muted}>このURLは無効です。</p>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className={pinStyles.page}>
        <h1 className={pinStyles.title}>{company.companyName}</h1>
        <p className={pinStyles.lead}>4桁のPINを入力してください。</p>
        <div className={pinStyles.pinBackdrop} style={{ position: "relative", inset: "auto" }}>
          <div
            className={pinStyles.pinCard}
            style={{ margin: "0 auto" }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ext-pin-title"
          >
            <h2 id="ext-pin-title" className={pinStyles.pinTitle}>
              PINコード
            </h2>
            <p className={pinStyles.pinLead}>外部登録用の4桁PINです。</p>
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
                        if (!pinMatches(company, pin)) {
                          setPinError("PINが違います");
                          setPin("");
                          return;
                        }
                        try {
                          sessionStorage.setItem(
                            externalPortalAuthStorageKey(normalizedKey),
                            "1"
                          );
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

  if (mode === "form") {
    return (
      <ExternalSiteForm
        company={company}
        normalizedKey={normalizedKey}
        masterRevision={masterRevision}
        siteTypeMasters={siteTypeMasters}
        editingId={editingId}
        onCancel={() => {
          setMode("list");
          setEditingId(null);
        }}
        onSaved={() => {
          setMode("list");
          setEditingId(null);
          setRevision((r) => r + 1);
        }}
      />
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>現場登録（{company.companyName}）</h1>
          <p className={styles.lead}>
            貴社が登録した現場のみ表示されます。編集すると諏訪技建側で再度確認が必要になる場合があります。
          </p>
        </div>
        <div className={styles.headActions}>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => {
              setEditingId(null);
              setListTab("sites");
              setMode("form");
            }}
          >
            新規現場を登録する
          </button>
          <button
            type="button"
            className={styles.ghostBtn}
            onClick={() => {
              try {
                sessionStorage.removeItem(
                  externalPortalAuthStorageKey(normalizedKey)
                );
              } catch {
                // ignore
              }
              setAuthed(false);
            }}
          >
            PINを切る
          </button>
        </div>
      </header>

      <div className={styles.portalTabs} role="tablist" aria-label="外部ポータル">
        <button
          type="button"
          role="tab"
          aria-selected={listTab === "sites"}
          className={listTab === "sites" ? styles.tabActive : styles.tab}
          onClick={() => setListTab("sites")}
        >
          現場一覧
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={listTab === "masters"}
          className={listTab === "masters" ? styles.tabActive : styles.tab}
          onClick={() => setListTab("masters")}
        >
          マスター設定
        </button>
      </div>

      {listTab === "masters" ? (
        <ExternalCompanyMastersPanel
          normalizedKey={normalizedKey}
          masterRevision={masterRevision}
          onChanged={() => setMasterRevision((r) => r + 1)}
        />
      ) : sites.length === 0 ? (
        <p className={styles.empty}>まだ現場が登録されていません。</p>
      ) : (
        <>
          <div className={styles.listToolbar}>
            <div className={styles.searchGroup}>
              <label className={styles.toolbarLabel} htmlFor="ext-site-search">
                検索
              </label>
              <input
                id="ext-site-search"
                type="search"
                className={formStyles.input}
                value={listSearchQuery}
                onChange={(e) => setListSearchQuery(e.target.value)}
                placeholder="現場名・元請け名"
                autoComplete="off"
                enterKeyHint="search"
                aria-label="現場名・元請け名で検索"
              />
            </div>
            <div className={styles.sortGroup}>
              <label className={styles.toolbarLabel} htmlFor="ext-site-list-sort">
                並び替え
              </label>
              <select
                id="ext-site-list-sort"
                className={formStyles.input}
                value={listSort}
                onChange={(e) =>
                  setListSort(e.target.value as ExternalSiteListSort)
                }
                aria-label="一覧の並び替え"
              >
                <option value="entranceDesc">入場日が新しい順</option>
                <option value="entranceAsc">入場日が古い順</option>
                <option value="name">現場名順（あいうえお順）</option>
                <option value="status">ステータス順</option>
              </select>
            </div>
          </div>
          {sortedSites.length === 0 ? (
            <p className={styles.empty}>該当する現場がありません。</p>
          ) : (
            <ul className={styles.list}>
              {sortedSites.map((s) => {
                const st = computeSiteStatus(s);
                return (
                  <li key={s.id} className={styles.card}>
                    <Link
                      className={styles.cardLink}
                      to={`/external/${normalizedKey}/site/${s.id}`}
                      aria-label={`${s.name || "（無題）"}の詳細`}
                    >
                      <div className={styles.cardMain}>
                        <span className={styles.siteName}>{s.name || "（無題）"}</span>
                        <span className={styles.siteClient}>
                          {s.clientName?.trim() || "—"}
                        </span>
                      </div>
                      <span className={`${styles.statusBadge} ${statusBadgeClass(st)}`}>
                        {st}
                      </span>
                    </Link>
                    <div className={styles.cardActions}>
                      <button
                        type="button"
                        className={styles.editBtn}
                        onClick={() => {
                          setEditingId(s.id);
                          setMode("form");
                        }}
                      >
                        編集
                      </button>
                      <button
                        type="button"
                        className={styles.deleteSiteCardBtn}
                        onClick={() => {
                          setDeletePinSiteId(s.id);
                          setDeletePin("");
                          setDeletePinError(null);
                        }}
                      >
                        削除
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {deletePinSiteId !== null && (
        <div
          className={siteDetailStyles.deletePinBackdrop}
          role="presentation"
          onClick={() => {
            setDeletePinSiteId(null);
            setDeletePin("");
            setDeletePinError(null);
          }}
        >
          <div
            className={siteDetailStyles.deletePinCard}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ext-delete-pin-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="ext-delete-pin-title"
              className={siteDetailStyles.deletePinTitle}
            >
              PINコード
            </h2>
            <p className={siteDetailStyles.deletePinLead}>
              現場を削除するには、貴社の4桁PINを入力してください。
            </p>
            <div className={siteDetailStyles.deletePinDots} aria-label="入力状況">
              {Array.from({ length: 4 }).map((_, j) => (
                <span
                  key={j}
                  className={
                    deletePin.length > j
                      ? siteDetailStyles.deletePinDotOn
                      : siteDetailStyles.deletePinDotOff
                  }
                />
              ))}
            </div>
            {deletePinError && (
              <p className={siteDetailStyles.deletePinError} role="alert">
                {deletePinError}
              </p>
            )}
            <div
              className={siteDetailStyles.deleteKeypad}
              role="group"
              aria-label="テンキー"
            >
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
                const disabled = isEnter ? deletePin.length !== 4 : false;
                return (
                  <button
                    key={k}
                    type="button"
                    className={
                      isEnter
                        ? siteDetailStyles.deleteEnterBtn
                        : siteDetailStyles.deleteKeyBtn
                    }
                    disabled={disabled}
                    onClick={() => {
                      setDeletePinError(null);
                      if (isEnter) {
                        if (deletePin.length !== 4) return;
                        if (!pinMatches(company, deletePin)) {
                          setDeletePinError("PINが違います");
                          setDeletePin("");
                          return;
                        }
                        const sid = deletePinSiteId;
                        setDeletePinSiteId(null);
                        setDeletePin("");
                        setConfirmDeleteSiteId(sid);
                        return;
                      }
                      if (isBack) {
                        setDeletePin((p) => p.slice(0, -1));
                        return;
                      }
                      setDeletePin((p) => (p.length >= 4 ? p : `${p}${k}`));
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
            <div className={siteDetailStyles.deletePinFooter}>
              <button
                type="button"
                className={siteDetailStyles.deletePinCancelBtn}
                onClick={() => {
                  setDeletePinSiteId(null);
                  setDeletePin("");
                  setDeletePinError(null);
                }}
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteSiteId !== null && (
        <div
          className={siteDetailStyles.deleteConfirmBackdrop}
          role="presentation"
          onClick={() => setConfirmDeleteSiteId(null)}
        >
          <div
            className={siteDetailStyles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ext-delete-confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="ext-delete-confirm-title"
              className={siteDetailStyles.modalTitle}
            >
              現場の削除
            </h2>
            <p className={siteDetailStyles.deleteModalText}>
              この現場を削除しますか？
            </p>
            <div className={siteDetailStyles.modalActions}>
              <button
                type="button"
                className={siteDetailStyles.modalCancel}
                onClick={() => setConfirmDeleteSiteId(null)}
              >
                キャンセル
              </button>
              <button
                type="button"
                className={siteDetailStyles.modalDanger}
                onClick={() => {
                  const id = confirmDeleteSiteId;
                  setConfirmDeleteSiteId(null);
                  if (!id) return;
                  const site = getSiteById(id);
                  if (
                    !site ||
                    normalizeCompanyKey(site.externalCompanyKey ?? "") !==
                      normalizedKey
                  ) {
                    return;
                  }
                  purgeSiteData(id);
                }}
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type MastersPanelProps = {
  normalizedKey: string;
  masterRevision: number;
  onChanged: () => void;
};

function ExternalCompanyMastersPanel({
  normalizedKey,
  masterRevision,
  onChanged,
}: MastersPanelProps) {
  const { clients, sales } = useMemo(
    () => loadExternalCompanyMasters(normalizedKey),
    [normalizedKey, masterRevision]
  );
  const [clientDraft, setClientDraft] = useState("");
  const [salesDraft, setSalesDraft] = useState("");

  function handleAddClient(e: FormEvent) {
    e.preventDefault();
    const added = addExternalClientMaster(normalizedKey, clientDraft);
    if (added) {
      setClientDraft("");
      onChanged();
    }
  }

  function handleAddSales(e: FormEvent) {
    e.preventDefault();
    const added = addExternalSalesMaster(normalizedKey, salesDraft);
    if (added) {
      setSalesDraft("");
      onChanged();
    }
  }

  return (
    <div className={styles.mastersWrap}>
      <section className={styles.masterSection} aria-labelledby="ext-master-client">
        <h2 id="ext-master-client" className={styles.masterHeading}>
          元請け様名マスター
        </h2>
        <p className={styles.masterLead}>
          現場登録フォームの「元請け様名」で選べる候補です。貴社のみに保存されます。
        </p>
        <form className={styles.masterAddRow} onSubmit={handleAddClient}>
          <input
            className={formStyles.input}
            value={clientDraft}
            onChange={(e) => setClientDraft(e.target.value)}
            placeholder="名前を入力して追加"
            aria-label="元請け様名を追加"
            autoComplete="off"
          />
          <button type="submit" className={styles.masterAddBtn}>
            追加
          </button>
        </form>
        {clients.length === 0 ? (
          <p className={styles.masterEmpty}>まだ登録がありません。</p>
        ) : (
          <ul className={styles.masterList}>
            {clients.map((row) => (
              <li key={row.id} className={styles.masterRow}>
                <span className={styles.masterName}>{row.name}</span>
                <button
                  type="button"
                  className={styles.masterRemoveBtn}
                  onClick={() => {
                    removeExternalClientMaster(normalizedKey, row.id);
                    onChanged();
                  }}
                >
                  削除
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.masterSection} aria-labelledby="ext-master-sales">
        <h2 id="ext-master-sales" className={styles.masterHeading}>
          担当営業名マスター
        </h2>
        <p className={styles.masterLead}>
          現場登録フォームの「担当営業名」で選べる候補です。貴社のみに保存されます。
        </p>
        <form className={styles.masterAddRow} onSubmit={handleAddSales}>
          <input
            className={formStyles.input}
            value={salesDraft}
            onChange={(e) => setSalesDraft(e.target.value)}
            placeholder="名前を入力して追加"
            aria-label="担当営業名を追加"
            autoComplete="off"
          />
          <button type="submit" className={styles.masterAddBtn}>
            追加
          </button>
        </form>
        {sales.length === 0 ? (
          <p className={styles.masterEmpty}>まだ登録がありません。</p>
        ) : (
          <ul className={styles.masterList}>
            {sales.map((row) => (
              <li key={row.id} className={styles.masterRow}>
                <span className={styles.masterName}>{row.name}</span>
                <button
                  type="button"
                  className={styles.masterRemoveBtn}
                  onClick={() => {
                    removeExternalSalesMaster(normalizedKey, row.id);
                    onChanged();
                  }}
                >
                  削除
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

type FormProps = {
  company: ExternalCompany;
  normalizedKey: string;
  masterRevision: number;
  siteTypeMasters: { id: string; name: string }[];
  editingId: string | null;
  onCancel: () => void;
  onSaved: () => void;
};

function ExternalSiteForm({
  company,
  normalizedKey,
  masterRevision,
  siteTypeMasters,
  editingId,
  onCancel,
  onSaved,
}: FormProps) {
  const existing = editingId ? getSiteById(editingId) : undefined;

  const clientMasters = useMemo(
    () => loadExternalCompanyMasters(normalizedKey).clients,
    [normalizedKey, masterRevision]
  );
  const salesMasters = useMemo(
    () => loadExternalCompanyMasters(normalizedKey).sales,
    [normalizedKey, masterRevision]
  );

  if (editingId && !existing) {
    return (
      <div className={styles.page}>
        <p className={styles.muted}>この現場は見つかりませんでした。</p>
        <button type="button" className={styles.ghostBtn} onClick={onCancel}>
          一覧に戻る
        </button>
      </div>
    );
  }

  const [name, setName] = useState("");
  const [clientSelectId, setClientSelectId] = useState("");
  const [clientFree, setClientFree] = useState("");
  const [googleMapUrl, setGoogleMapUrl] = useState("");
  const [address, setAddress] = useState("");
  const [entranceDateKeys, setEntranceDateKeys] = useState<string[]>([]);
  const [entranceDraft, setEntranceDraft] = useState("");
  const [salesSelectId, setSalesSelectId] = useState("");
  const [salesFree, setSalesFree] = useState("");
  const [siteTypeSelectId, setSiteTypeSelectId] = useState("");
  const [memoText, setMemoText] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!existing) {
      setName("");
      setClientSelectId("");
      setClientFree("");
      setGoogleMapUrl("");
      setAddress("");
      setEntranceDateKeys([]);
      setEntranceDraft("");
      setSalesSelectId("");
      setSalesFree("");
      setSiteTypeSelectId("");
      setMemoText("");
      return;
    }
    setName(existing.name);
    const cid =
      clientMasters.find((x) => x.name === existing.clientName)?.id ?? "";
    setClientSelectId(cid);
    setClientFree(cid ? "" : (existing.clientName ?? ""));
    setGoogleMapUrl(existing.googleMapUrl ?? "");
    setAddress(existing.address ?? "");
    setEntranceDateKeys(normalizeEntranceDateKeys(existing.entranceDateKeys));
    setEntranceDraft("");
    const sid =
      salesMasters.find((x) => x.name === existing.salesName)?.id ?? "";
    setSalesSelectId(sid);
    setSalesFree(sid ? "" : (existing.salesName ?? ""));
    const tid = siteTypeMasters.find((x) => x.name === existing.siteTypeName)?.id ?? "";
    setSiteTypeSelectId(tid);
    const memos = normalizeSiteMemos(existing.siteMemos);
    setMemoText(memos.map((m) => m.text).join("\n"));
  }, [existing, clientMasters, salesMasters, siteTypeMasters]);

  function masterName(list: { id: string; name: string }[], id: string): string {
    return list.find((m) => m.id === id)?.name ?? "";
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("現場名を入力してください。");
      return;
    }
    if (existing) {
      if (
        normalizeCompanyKey(existing.externalCompanyKey ?? "") !== normalizedKey
      ) {
        setError("この現場を編集する権限がありません。");
        return;
      }
    }
    const entrances = normalizeEntranceDateKeys(entranceDateKeys);
    const clientName = clientFree.trim() || masterName(clientMasters, clientSelectId);
    const salesName = salesFree.trim() || masterName(salesMasters, salesSelectId);
    const siteTypeName = masterName(siteTypeMasters, siteTypeSelectId);
    const memos = memoText.trim()
      ? [{ id: newSiteMemoId(), text: memoText.trim() }]
      : [];

    if (existing) {
      const next: Site = {
        ...existing,
        name: trimmedName,
        clientName: clientName.trim(),
        googleMapUrl: googleMapUrl.trim(),
        address: address.trim(),
        startDate: startDateFromEntranceDateKeys(entrances),
        entranceDateKeys: entrances,
        salesName,
        siteTypeName,
        siteMemos: memos,
        companyKind: "KOUSEI",
        externalUnconfirmed: true,
        externalCompanyKey: normalizedKey,
        externalCompanyName: company.companyName,
      };
      updateSite(next);
    } else {
      const site: Site = {
        id: newSiteId(),
        name: trimmedName,
        siteCode: "",
        clientName: clientName.trim(),
        address: address.trim(),
        googleMapUrl: googleMapUrl.trim(),
        startDate: startDateFromEntranceDateKeys(entrances),
        entranceDateKeys: entrances,
        salesName,
        foremanName: "",
        kogataNames: [],
        vehicleLabels: [],
        siteTypeName,
        companyKind: "KOUSEI",
        siteMemos: memos,
        createdAt: new Date().toISOString(),
        externalUnconfirmed: true,
        externalCompanyKey: normalizedKey,
        externalCompanyName: company.companyName,
      };
      addSite(site);
    }
    onSaved();
  }

  return (
    <div className={styles.page}>
      <div className={formStyles.breadcrumb}>
        <button type="button" className={styles.linkBtn} onClick={onCancel}>
          ← 一覧に戻る
        </button>
      </div>
      <h1 className={formStyles.pageTitle}>
        {existing ? "現場を編集" : "新規現場を登録"}
      </h1>
      <p className={formStyles.lead}>
        登録後、諏訪技建の現場一覧に反映されます（要確認として表示されます）。
      </p>

      <form className={formStyles.form} onSubmit={handleSubmit} noValidate>
        {error && (
          <p className={formStyles.error} role="alert">
            {error}
          </p>
        )}

        <label className={formStyles.field}>
          <span className={formStyles.label}>現場名</span>
          <input
            className={formStyles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
          />
        </label>

        <div className={formStyles.field}>
          <span className={formStyles.label}>元請け様名</span>
          <div className={editorStyles.dualField}>
            <select
              className={editorStyles.select}
              value={clientSelectId}
              onChange={(e) => setClientSelectId(e.target.value)}
              aria-label="元請け様マスターから選択"
            >
              <option value="">マスターから選択</option>
              {clientMasters.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <input
              className={formStyles.input}
              type="text"
              value={clientFree}
              onChange={(e) => setClientFree(e.target.value)}
              placeholder="手入力（マスター未使用時、または上書き）"
              autoComplete="organization"
            />
          </div>
          <p className={editorStyles.hint}>
            手入力がある場合はそちらを優先して保存します。
          </p>
        </div>

        <label className={formStyles.field}>
          <span className={formStyles.label}>GoogleマップURL</span>
          <input
            className={formStyles.input}
            type="url"
            value={googleMapUrl}
            onChange={(e) => setGoogleMapUrl(e.target.value)}
            autoComplete="off"
          />
        </label>

        <label className={formStyles.field}>
          <span className={formStyles.label}>住所（表示用）</span>
          <input
            className={formStyles.input}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            autoComplete="street-address"
          />
        </label>

        <div className={formStyles.field}>
          <span className={formStyles.label}>入場日（複数可）</span>
          <div className={styles.entranceRow}>
            <input
              className={formStyles.input}
              type="date"
              value={entranceDraft}
              onChange={(e) => setEntranceDraft(e.target.value)}
              aria-label="追加する入場日"
            />
            <button
              type="button"
              className={styles.addDateBtn}
              onClick={() => {
                const t = entranceDraft.trim();
                if (!t) return;
                setEntranceDateKeys((prev) =>
                  normalizeEntranceDateKeys([...prev, t])
                );
                setEntranceDraft("");
              }}
            >
              追加
            </button>
          </div>
          {entranceDateKeys.length > 0 && (
            <ul className={styles.dateList}>
              {entranceDateKeys.map((dk) => (
                <li key={dk}>
                  {dk}
                  <button
                    type="button"
                    className={styles.removeDateBtn}
                    onClick={() =>
                      setEntranceDateKeys((prev) => prev.filter((x) => x !== dk))
                    }
                  >
                    削除
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={formStyles.field}>
          <span className={formStyles.label}>担当営業名</span>
          <div className={editorStyles.dualField}>
            <select
              className={editorStyles.select}
              value={salesSelectId}
              onChange={(e) => setSalesSelectId(e.target.value)}
              aria-label="担当営業マスターから選択"
            >
              <option value="">マスターから選択</option>
              {salesMasters.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <input
              className={formStyles.input}
              type="text"
              value={salesFree}
              onChange={(e) => setSalesFree(e.target.value)}
              placeholder="手入力（マスター未使用時、または上書き）"
              autoComplete="name"
            />
          </div>
          <p className={editorStyles.hint}>
            手入力がある場合はそちらを優先して保存します。
          </p>
        </div>

        <label className={formStyles.field}>
          <span className={formStyles.label}>現場種別</span>
          <select
            className={formStyles.input}
            value={siteTypeSelectId}
            onChange={(e) => setSiteTypeSelectId(e.target.value)}
            aria-label="現場種別"
          >
            <option value="">選択してください</option>
            {siteTypeMasters.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>

        <label className={formStyles.field}>
          <span className={formStyles.label}>備考・メモ</span>
          <textarea
            className={`${formStyles.input} ${styles.textareaMemo}`}
            rows={4}
            value={memoText}
            onChange={(e) => setMemoText(e.target.value)}
          />
        </label>

        <div className={formStyles.actions}>
          <button type="submit" className={formStyles.submit}>
            {existing ? "保存する" : "登録する"}
          </button>
          <button type="button" className={styles.ghostBtn} onClick={onCancel}>
            キャンセル
          </button>
        </div>
      </form>
    </div>
  );
}
