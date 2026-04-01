import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import type { Site } from "../types/site";
import type { ExternalCompany } from "../types/externalCompany";
import {
  getExternalCompanyByKey,
  normalizeCompanyKey,
  pinMatches,
} from "../lib/externalCompaniesStorage";
import {
  addSite,
  getSiteById,
  newSiteMemoId,
  normalizeEntranceDateKeys,
  normalizeSiteMemos,
  startDateFromEntranceDateKeys,
  updateSite,
} from "../lib/siteStorage";
import {
  siteHasAnyWorkRecordRows,
  siteHasHaraiWorkRecordRows,
} from "../lib/siteWorkRecordKeys";
import { loadSalesMasters, loadSiteTypeMasters } from "../lib/mastersStorage";
import formStyles from "./SiteFormPage.module.css";
import pinStyles from "./LeaveRequestsPage.module.css";
import styles from "./ExternalSitePortalPage.module.css";

const OFFICE_AUTH_PREFIX = "externalPortalAuth:";

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

function authStorageKey(companyKey: string): string {
  return `${OFFICE_AUTH_PREFIX}${companyKey}`;
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
      return sessionStorage.getItem(authStorageKey(normalizedKey)) === "1";
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
      setAuthed(sessionStorage.getItem(authStorageKey(normalizedKey)) === "1");
    } catch {
      setAuthed(false);
    }
  }, [normalizedKey]);

  const salesMasters = useMemo(() => loadSalesMasters(), [revision]);
  const siteTypeMasters = useMemo(() => loadSiteTypeMasters(), [revision]);

  const sortedSites = useMemo(
    () =>
      [...sites].sort((a, b) =>
        a.name.localeCompare(b.name, "ja", { sensitivity: "base" })
      ),
    [sites]
  );

  if (!companyKeyParam || !normalizedKey) {
    return (
      <div className={styles.page}>
        <p className={styles.muted}>URL が不正です。</p>
      </div>
    );
  }

  if (!company) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>外部現場登録</h1>
        <p className={styles.muted}>
          このキー（{normalizedKey}）の会社がマスターに登録されていません。
        </p>
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
                          sessionStorage.setItem(authStorageKey(normalizedKey), "1");
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
        salesMasters={salesMasters}
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
                sessionStorage.removeItem(authStorageKey(normalizedKey));
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

      {sites.length === 0 ? (
        <p className={styles.empty}>まだ現場が登録されていません。</p>
      ) : (
        <ul className={styles.list}>
          {sortedSites.map((s) => {
            const st = computeSiteStatus(s);
            return (
              <li key={s.id} className={styles.card}>
                <div className={styles.cardMain}>
                  <span className={styles.siteName}>{s.name || "（無題）"}</span>
                  <span className={styles.siteClient}>
                    {s.clientName?.trim() || "—"}
                  </span>
                </div>
                <span className={`${styles.statusBadge} ${statusBadgeClass(st)}`}>
                  {st}
                </span>
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
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

type FormProps = {
  company: ExternalCompany;
  normalizedKey: string;
  salesMasters: { id: string; name: string }[];
  siteTypeMasters: { id: string; name: string }[];
  editingId: string | null;
  onCancel: () => void;
  onSaved: () => void;
};

function ExternalSiteForm({
  company,
  normalizedKey,
  salesMasters,
  siteTypeMasters,
  editingId,
  onCancel,
  onSaved,
}: FormProps) {
  const existing = editingId ? getSiteById(editingId) : undefined;

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
  const [clientName, setClientName] = useState("");
  const [googleMapUrl, setGoogleMapUrl] = useState("");
  const [address, setAddress] = useState("");
  const [entranceDateKeys, setEntranceDateKeys] = useState<string[]>([]);
  const [entranceDraft, setEntranceDraft] = useState("");
  const [salesSelectId, setSalesSelectId] = useState("");
  const [siteTypeSelectId, setSiteTypeSelectId] = useState("");
  const [memoText, setMemoText] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!existing) {
      setName("");
      setClientName("");
      setGoogleMapUrl("");
      setAddress("");
      setEntranceDateKeys([]);
      setEntranceDraft("");
      setSalesSelectId("");
      setSiteTypeSelectId("");
      setMemoText("");
      return;
    }
    setName(existing.name);
    setClientName(existing.clientName ?? "");
    setGoogleMapUrl(existing.googleMapUrl ?? "");
    setAddress(existing.address ?? "");
    setEntranceDateKeys(normalizeEntranceDateKeys(existing.entranceDateKeys));
    setEntranceDraft("");
    const sid = salesMasters.find((x) => x.name === existing.salesName)?.id ?? "";
    setSalesSelectId(sid);
    const tid = siteTypeMasters.find((x) => x.name === existing.siteTypeName)?.id ?? "";
    setSiteTypeSelectId(tid);
    const memos = normalizeSiteMemos(existing.siteMemos);
    setMemoText(memos.map((m) => m.text).join("\n"));
  }, [existing, salesMasters, siteTypeMasters]);

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
    const salesName = masterName(salesMasters, salesSelectId);
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

        <label className={formStyles.field}>
          <span className={formStyles.label}>元請け様名</span>
          <input
            className={formStyles.input}
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            autoComplete="off"
          />
        </label>

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

        <label className={formStyles.field}>
          <span className={formStyles.label}>担当営業名</span>
          <select
            className={formStyles.input}
            value={salesSelectId}
            onChange={(e) => setSalesSelectId(e.target.value)}
            aria-label="担当営業"
          >
            <option value="">選択してください</option>
            {salesMasters.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>

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
