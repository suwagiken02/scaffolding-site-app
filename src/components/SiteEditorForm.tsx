import type { Dispatch, SetStateAction } from "react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Site, CompanyKind, SiteMemo } from "../types/site";
import type { MasterItem } from "../types/masterItem";
import {
  loadClientMasters,
  loadVehicleMasters,
  loadSalesMasters,
  loadSiteTypeMasters,
} from "../lib/mastersStorage";
import { loadStaffMasters } from "../lib/staffMasterStorage";
import type { StaffMaster } from "../types/staffMaster";
import {
  resolveGoogleMapsUrlForPin,
  type LatLng,
} from "../lib/googleMapsUrlCoords";
import {
  newSiteMemoId,
  normalizeEntranceDateKeys,
  normalizeSiteMemos,
  startDateFromEntranceDateKeys,
} from "../lib/siteStorage";
import formStyles from "../pages/SiteFormPage.module.css";
import styles from "./SiteEditorForm.module.css";

function newSiteId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `site-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function splitExtra(input: string): string[] {
  return input.split(/[\n,、]/).map((s) => s.trim()).filter(Boolean);
}

function uniq(a: string[]): string[] {
  return [...new Set(a)];
}

function masterName(list: MasterItem[], id: string): string {
  return list.find((m) => m.id === id)?.name ?? "";
}

function staffName(list: StaffMaster[], id: string): string {
  return list.find((m) => m.id === id)?.name ?? "";
}

type Props = {
  initialSite: Site | null;
  onSubmit: (site: Site) => void;
  cancelHref: string;
  pageTitle: string;
  lead?: string;
  submitLabel: string;
  /** 現場編集時のみ。一覧の「要確認」警告を抑止するチェックを表示 */
  showSiteListWarningIgnore?: boolean;
};

export function SiteEditorForm({
  initialSite,
  onSubmit,
  cancelHref,
  pageTitle,
  lead,
  submitLabel,
  showSiteListWarningIgnore = false,
}: Props) {
  const clients = loadClientMasters();
  const vehicles = loadVehicleMasters();
  const sales = loadSalesMasters();
  const siteTypes = loadSiteTypeMasters();

  const [name, setName] = useState("");
  const [siteCode, setSiteCode] = useState("");
  const [clientSelectId, setClientSelectId] = useState("");
  const [clientFree, setClientFree] = useState("");
  const [address, setAddress] = useState("");
  const [googleMapUrl, setGoogleMapUrl] = useState("");
  const [addressFetchStatus, setAddressFetchStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [addressFetchMessage, setAddressFetchMessage] = useState<string | null>(
    null
  );
  const lastResolvedUrlRef = useRef<string>("");
  /** URL から解析した緯度経度（現在の googleMapUrl と一致するとき保存対象） */
  const [mapPinResolved, setMapPinResolved] = useState<LatLng | null>(null);
  const [mapPinSourceUrl, setMapPinSourceUrl] = useState("");
  const [entranceDateKeys, setEntranceDateKeys] = useState<string[]>([]);
  const [entranceDateDraft, setEntranceDateDraft] = useState("");
  const [salesSelectId, setSalesSelectId] = useState("");
  const [siteTypeSelectId, setSiteTypeSelectId] = useState("");
  const [companyKind, setCompanyKind] = useState<CompanyKind>("自社");
  const [alwaysShowOnMap, setAlwaysShowOnMap] = useState(false);
  const [ignoreSiteListWarning, setIgnoreSiteListWarning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [siteMemos, setSiteMemos] = useState<SiteMemo[]>([]);

  useEffect(() => {
    if (!initialSite) {
      setSiteMemos([]);
      setAlwaysShowOnMap(false);
      setMapPinResolved(null);
      setMapPinSourceUrl("");
      return;
    }

    const c = loadClientMasters();
    const s = loadSalesMasters();
    const st = loadSiteTypeMasters();

    setName(initialSite.name);
    setSiteCode(initialSite.siteCode ?? "");
    const cid = c.find((x) => x.name === initialSite.clientName)?.id ?? "";
    setClientSelectId(cid);
    setClientFree(cid ? "" : initialSite.clientName);
    setAddress(initialSite.address);
    setGoogleMapUrl(initialSite.googleMapUrl ?? "");
    setEntranceDateKeys(normalizeEntranceDateKeys(initialSite.entranceDateKeys));
    setEntranceDateDraft("");

    const sid = s.find((x) => x.name === initialSite.salesName)?.id ?? "";
    setSalesSelectId(sid);

    const tid = st.find((x) => x.name === initialSite.siteTypeName)?.id ?? "";
    setSiteTypeSelectId(tid);
    const ck = initialSite.companyKind;
    setCompanyKind(
      ck === "KOUSEI" || ck === "自社" || ck === "自社_green" ? ck : "自社"
    );
    setAlwaysShowOnMap(initialSite.alwaysShowOnMap === true);
    setIgnoreSiteListWarning(initialSite.ignoreSiteListWarning === true);
    setSiteMemos(normalizeSiteMemos(initialSite.siteMemos));
    const gUrl = (initialSite.googleMapUrl ?? "").trim();
    if (
      typeof initialSite.mapPinLat === "number" &&
      typeof initialSite.mapPinLng === "number" &&
      Number.isFinite(initialSite.mapPinLat) &&
      Number.isFinite(initialSite.mapPinLng) &&
      gUrl
    ) {
      setMapPinResolved({
        lat: initialSite.mapPinLat,
        lng: initialSite.mapPinLng,
      });
      setMapPinSourceUrl(gUrl);
    } else {
      setMapPinResolved(null);
      setMapPinSourceUrl("");
    }
  }, [initialSite]);

  useEffect(() => {
    let cancelled = false;
    const url = googleMapUrl.trim();
    if (!url) {
      setAddressFetchStatus("idle");
      setAddressFetchMessage(null);
      lastResolvedUrlRef.current = "";
      setMapPinResolved(null);
      setMapPinSourceUrl("");
      return;
    }
    if (lastResolvedUrlRef.current === url) return;

    async function run() {
      setAddressFetchStatus("loading");
      setAddressFetchMessage("住所を取得中...");

      const coords = await resolveGoogleMapsUrlForPin(url);
      if (cancelled) return;
      if (!coords) {
        setAddressFetchStatus("error");
        setAddressFetchMessage(
          "住所を取得できませんでした（URLから座標を読み取れません）。手入力してください。"
        );
        lastResolvedUrlRef.current = url;
        setMapPinResolved(null);
        setMapPinSourceUrl("");
        return;
      }

      setMapPinResolved(coords);
      setMapPinSourceUrl(url);

      try {
        const q = new URLSearchParams({
          format: "jsonv2",
          lat: String(coords.lat),
          lon: String(coords.lng),
          zoom: "10",
          addressdetails: "1",
        });
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?${q.toString()}`,
          {
            method: "GET",
            mode: "cors",
            credentials: "omit",
            headers: {
              "Accept-Language": "ja",
            },
          }
        );
        if (!res.ok) throw new Error("nominatim failed");
        const data = (await res.json()) as any;
        const a = data?.address ?? {};
        const muni =
          a.city ||
          a.town ||
          a.village ||
          a.municipality ||
          a.county ||
          "";
        const name = typeof muni === "string" ? muni.trim() : "";
        if (!name) {
          setAddressFetchStatus("error");
          setAddressFetchMessage(
            "住所を取得できませんでした（市区町村名が見つかりません）。手入力してください。"
          );
          lastResolvedUrlRef.current = url;
          return;
        }
        setAddress(name);
        setAddressFetchStatus("success");
        setAddressFetchMessage("住所を取得しました。必要に応じて編集してください。");
        lastResolvedUrlRef.current = url;
      } catch {
        setAddressFetchStatus("error");
        setAddressFetchMessage(
          "住所を取得できませんでした（通信に失敗しました）。手入力してください。"
        );
        lastResolvedUrlRef.current = url;
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [googleMapUrl]);

  function toggleSetId(
    setter: Dispatch<SetStateAction<Set<string>>>,
    id: string
  ) {
    setter((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const c = loadClientMasters();
    const s = loadSalesMasters();
    const st = loadSiteTypeMasters();

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("現場名を入力してください。");
      return;
    }

    const normalizedEntrances = normalizeEntranceDateKeys(entranceDateKeys);
    const clientName = clientFree.trim() || masterName(c, clientSelectId);
    const salesName = masterName(s, salesSelectId);
    const siteTypeName = masterName(st, siteTypeSelectId);
    const trimmedMapUrl = googleMapUrl.trim();
    const pinToSave =
      trimmedMapUrl &&
      mapPinSourceUrl === trimmedMapUrl &&
      mapPinResolved !== null
        ? { mapPinLat: mapPinResolved.lat, mapPinLng: mapPinResolved.lng }
        : {};

    const site: Site = {
      id: initialSite?.id ?? newSiteId(),
      name: trimmedName,
      siteCode: siteCode.trim(),
      clientName,
      address: address.trim(),
      googleMapUrl: trimmedMapUrl,
      ...pinToSave,
      startDate: startDateFromEntranceDateKeys(normalizedEntrances),
      entranceDateKeys: normalizedEntrances,
      salesName,
      foremanName: initialSite?.foremanName ?? "",
      kogataNames: initialSite?.kogataNames ?? [],
      vehicleLabels: initialSite?.vehicleLabels ?? [],
      siteMemos: siteMemos
        .map((m) => ({ id: m.id, text: m.text.trim() }))
        .filter((m) => m.text.length > 0),
      siteTypeName,
      companyKind,
      createdAt: initialSite?.createdAt ?? new Date().toISOString(),
      scaffoldingRemovalCompletedAt: initialSite?.scaffoldingRemovalCompletedAt,
      ignoreSiteListWarning: showSiteListWarningIgnore
        ? ignoreSiteListWarning
          ? true
          : undefined
        : initialSite?.ignoreSiteListWarning === true
          ? true
          : undefined,
      ...(initialSite?.manualDisplayStatus
        ? { manualDisplayStatus: initialSite.manualDisplayStatus }
        : {}),
      ...(alwaysShowOnMap ? { alwaysShowOnMap: true } : {}),
    };

    onSubmit(site);
  }

  return (
    <div>
      <div className={formStyles.breadcrumb}>
        <Link to={cancelHref}>← 戻る</Link>
      </div>
      <h1 className={formStyles.pageTitle}>{pageTitle}</h1>
      {lead && <p className={formStyles.lead}>{lead}</p>}

      <form
        className={`${formStyles.form} ${styles.formWide}`}
        onSubmit={handleSubmit}
        noValidate
      >
        {error && (
          <p className={formStyles.error} role="alert">
            {error}
          </p>
        )}

        <label className={formStyles.field}>
          <span className={formStyles.label}>1. 現場名</span>
          <input
            className={formStyles.input}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例：〇〇ビル新築工事"
            autoComplete="off"
          />
        </label>

        <label className={formStyles.field}>
          <span className={formStyles.label}>現場コード</span>
          <input
            className={formStyles.input}
            type="text"
            value={siteCode}
            onChange={(e) => setSiteCode(e.target.value)}
            placeholder="例：K-1220、S-346"
            autoComplete="off"
          />
        </label>

        <div className={formStyles.field}>
          <span className={formStyles.label}>2. 元請け様</span>
          <div className={styles.dualField}>
            <select
              className={styles.select}
              value={clientSelectId}
              onChange={(e) => setClientSelectId(e.target.value)}
              aria-label="元請け様マスターから選択"
            >
              <option value="">マスターから選択</option>
              {clients.map((m) => (
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
          <p className={styles.hint}>
            手入力がある場合はそちらを優先して保存します。
          </p>
        </div>

        <label className={formStyles.field}>
          <span className={formStyles.label}>3. GoogleマップURL</span>
          <input
            className={formStyles.input}
            type="url"
            inputMode="url"
            value={googleMapUrl}
            onChange={(e) => setGoogleMapUrl(e.target.value)}
            placeholder="https://maps.google.com/?q=… または https://goo.gl/maps/…"
            autoComplete="off"
          />
          <p className={styles.hint}>
            GoogleマップでURLを取得する方法：GoogleマップでコピーしたURLをそのまま貼り付けてください。
          </p>
          {mapPinResolved && mapPinSourceUrl === googleMapUrl.trim() && (
            <p className={styles.hint} role="status">
              緯度経度を取得しました（保存時に記録します）:{" "}
              {mapPinResolved.lat.toFixed(6)}, {mapPinResolved.lng.toFixed(6)}
            </p>
          )}
        </label>

        <label className={`${formStyles.field} ${styles.checkboxField}`}>
          <span className={formStyles.label}>マップ表示</span>
          <span className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={alwaysShowOnMap}
              onChange={(e) => setAlwaysShowOnMap(e.target.checked)}
              aria-label="マップに常時表示する"
            />
            <span>マップに常時表示する</span>
          </span>
          <p className={styles.hint}>
            チェックを入れると、地図の「本日の作業」「足場設置中」のどちらのタブでもピンが表示されます（上記
            GoogleマップURLの登録が必要です）。
          </p>
        </label>

        <label className={formStyles.field}>
          <span className={formStyles.label}>4. 住所（表示用）</span>
          <input
            className={formStyles.input}
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="例：東京都渋谷区（市町村までなど）"
            autoComplete="street-address"
          />
          {addressFetchMessage && (
            <p
              className={styles.hint}
              aria-live={addressFetchStatus === "loading" ? "polite" : "off"}
            >
              {addressFetchMessage}
            </p>
          )}
          <p className={styles.hint}>
            地図のピンには使いません。市町村名までの表示用としてご利用ください。
          </p>
        </label>

        <div className={formStyles.field}>
          <span className={formStyles.label}>5. 入場日</span>
          <div className={styles.entranceAddRow}>
            <input
              className={`${formStyles.input} ${styles.entranceDateInput}`}
              type="date"
              value={entranceDateDraft}
              onChange={(e) => setEntranceDateDraft(e.target.value)}
              aria-label="追加する入場日"
            />
            <button
              type="button"
              className={styles.entranceAddBtn}
              onClick={() => {
                const t = entranceDateDraft.trim();
                if (!t) return;
                setEntranceDateKeys((prev) =>
                  normalizeEntranceDateKeys([...prev, t])
                );
                setEntranceDateDraft("");
              }}
            >
              追加
            </button>
          </div>
          {entranceDateKeys.length === 0 ? (
            <p className={styles.hint}>未登録です。複数の入場日を登録できます。</p>
          ) : (
            <ul className={styles.entranceList}>
              {[...entranceDateKeys]
                .sort((a, b) => b.localeCompare(a))
                .map((dk) => (
                  <li key={dk} className={styles.entranceListItem}>
                    <span>{dk}</span>
                    <button
                      type="button"
                      className={styles.entranceRemoveBtn}
                      onClick={() =>
                        setEntranceDateKeys((prev) =>
                          prev.filter((x) => x !== dk)
                        )
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
          <span className={formStyles.label}>6. 担当営業名</span>
          <select
            className={styles.select}
            value={salesSelectId}
            onChange={(e) => setSalesSelectId(e.target.value)}
            aria-label="担当営業マスターから選択"
          >
            <option value="">選択してください</option>
            {sales.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <p className={styles.hint}>マスター設定の「担当営業」に登録した名前から選びます。</p>
        </div>

        <div className={formStyles.field}>
          <span className={formStyles.label}>7. 現場種別</span>
          <select
            className={styles.select}
            value={siteTypeSelectId}
            onChange={(e) => setSiteTypeSelectId(e.target.value)}
            aria-label="現場種別"
          >
            <option value="">選択してください</option>
            {siteTypes.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        <div className={formStyles.field}>
          <label className={formStyles.label} htmlFor="site-editor-company-kind">
            8. 区分（KOUSEI / 自社）
          </label>
          <select
            id="site-editor-company-kind"
            className={styles.select}
            value={companyKind}
            onChange={(e) =>
              setCompanyKind(e.target.value as CompanyKind)
            }
            aria-label="区分"
          >
            <option value="KOUSEI">KOUSEI</option>
            <option
              value="自社"
              style={{ color: "#ffffff", backgroundColor: "#1f2937" }}
            >
              自社
            </option>
            <option value="自社_green" style={{ color: "#15803d" }}>
              自社
            </option>
          </select>
        </div>

        <div className={formStyles.field}>
          <span className={formStyles.label}>メモ</span>
          {siteMemos.length === 0 ? (
            <p className={styles.hint}>未登録です。必要に応じて追加してください。</p>
          ) : (
            <ul className={styles.memoEditorList}>
              {siteMemos.map((m) => (
                <li key={m.id} className={styles.memoEditorItem}>
                  <textarea
                    className={styles.memoEditorTextarea}
                    value={m.text}
                    onChange={(e) =>
                      setSiteMemos((prev) =>
                        prev.map((x) =>
                          x.id === m.id ? { ...x, text: e.target.value } : x
                        )
                      )
                    }
                    rows={3}
                    aria-label="メモ"
                  />
                  <button
                    type="button"
                    className={styles.entranceRemoveBtn}
                    onClick={() =>
                      setSiteMemos((prev) =>
                        prev.filter((x) => x.id !== m.id)
                      )
                    }
                  >
                    削除
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className={styles.memoAddMemoBtn}
            onClick={() =>
              setSiteMemos((prev) => [
                ...prev,
                { id: newSiteMemoId(), text: "" },
              ])
            }
          >
            メモを追加
          </button>
        </div>

        {showSiteListWarningIgnore && (
          <label className={`${formStyles.field} ${styles.checkboxField}`}>
            <span className={formStyles.label}>一覧の警告</span>
            <span className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={ignoreSiteListWarning}
                onChange={(e) => setIgnoreSiteListWarning(e.target.checked)}
              />
              <span>警告を無視する</span>
            </span>
            <p className={styles.hint}>
              チェックを入れると、現場一覧の「要確認」表示の対象外になります。
            </p>
          </label>
        )}

        <div className={formStyles.actions}>
          <button type="submit" className={formStyles.submit}>
            {submitLabel}
          </button>
          <Link to={cancelHref} className={formStyles.cancel}>
            キャンセル
          </Link>
        </div>
      </form>
    </div>
  );
}
