import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import L from "leaflet";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { Site } from "../types/site";
import { normalizeEntranceDateKeys } from "../lib/siteStorage";
import {
  resolveGoogleMapsUrlForPin,
  type LatLng,
} from "../lib/googleMapsUrlCoords";
import {
  getTodayMapPinKind,
  siteMatchesScaffoldingInstallMap,
} from "../lib/sitePhotoStorage";
import { siteHasAnyWorkRecordOnDate } from "../lib/siteWorkRecordKeys";
import { getEffectiveSiteDisplayStatus } from "../lib/siteStatus";
import { normalizeCompanyKey } from "../lib/externalCompaniesStorage";
import { todayLocalDateKey } from "../lib/dateUtils";
import styles from "./SiteMapView.module.css";

const JP_CENTER: [number, number] = [36.2048, 138.2529];
const JP_ZOOM = 5;

const PIN_RED = "#dc2626";
const PIN_YELLOW = "#ca8a04";
const PIN_GREEN = "#16a34a";
const PIN_ORANGE = "#ea580c";
const PIN_SLATE = "#64748b";
const PIN_USER = "#2563eb";

type MapSubTab = "today" | "scaffold";

type PinColorKey = "red" | "yellow" | "green" | "orange" | "slate";

type MarkerOk = {
  site: Site;
  lat: number;
  lng: number;
  pin: PinColorKey;
};

type MarkerFail = { site: Site; reason: "unresolved_url" };

function makePinIcon(color: string) {
  return L.divIcon({
    className: styles.markerIcon,
    html: `<div style="width:26px;height:26px;background:${color};border:3px solid #fff;border-radius:50%;box-shadow:0 2px 10px rgba(0,0,0,0.35)"></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -12],
  });
}

function MapFitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length === 0) return;
    if (positions.length === 1) {
      map.setView(positions[0], 14);
      return;
    }
    const bounds = L.latLngBounds(positions);
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 16 });
  }, [map, positions]);
  return null;
}

function MapInvalidateSize() {
  const map = useMap();
  useEffect(() => {
    const t = window.setTimeout(() => {
      map.invalidateSize();
    }, 200);
    return () => window.clearTimeout(t);
  }, [map]);
  return null;
}

type Props = {
  /** 全現場（常時表示ピンの合流用。通常は loadSites()） */
  sites: Site[];
  /** 指定時はタブ条件に合う現場をこの種別に限定。常時表示ピンは sites 全体から追加 */
  companyKindFilter?: "KOUSEI";
  /** 指定時は externalCompanyKey が一致する現場のみタブ条件の対象（companyKindFilter より優先） */
  externalCompanyKey?: string;
  /** バルーンから開くパス（外部ポータル用）。未指定時は /sites/:id */
  siteDetailHref?: (site: Site) => string;
};

function matchesMapScopeFilter(
  site: Site,
  companyKindFilter: Props["companyKindFilter"],
  externalCompanyKey: Props["externalCompanyKey"]
): boolean {
  if (externalCompanyKey) {
    return (
      normalizeCompanyKey(site.externalCompanyKey ?? "") ===
      normalizeCompanyKey(externalCompanyKey)
    );
  }
  if (companyKindFilter) {
    return site.companyKind === companyKindFilter;
  }
  return true;
}

function siteShowsOnTodayWorkMap(site: Site, todayKey: string): boolean {
  if (normalizeEntranceDateKeys(site.entranceDateKeys).includes(todayKey)) {
    return true;
  }
  return siteHasAnyWorkRecordOnDate(site.id, todayKey);
}

function coordsFromSiteOrUrl(site: Site): Promise<LatLng | null> {
  if (
    typeof site.mapPinLat === "number" &&
    typeof site.mapPinLng === "number" &&
    Number.isFinite(site.mapPinLat) &&
    Number.isFinite(site.mapPinLng)
  ) {
    return Promise.resolve({ lat: site.mapPinLat, lng: site.mapPinLng });
  }
  return resolveGoogleMapsUrlForPin(site.googleMapUrl);
}

function unionAlwaysPins(baseCandidates: Site[], allSites: Site[]): Site[] {
  const seen = new Set(baseCandidates.map((s) => s.id));
  const out = [...baseCandidates];
  for (const s of allSites) {
    if (!s.alwaysShowOnMap || !s.googleMapUrl?.trim()) continue;
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    out.push(s);
  }
  return out;
}

export function SiteMapView({
  sites,
  companyKindFilter,
  externalCompanyKey,
  siteDetailHref,
}: Props) {
  const [mapSubTab, setMapSubTab] = useState<MapSubTab>("today");
  const [markers, setMarkers] = useState<MarkerOk[]>([]);
  const [failed, setFailed] = useState<MarkerFail[]>([]);
  const [skippedNoUrl, setSkippedNoUrl] = useState(0);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [photoRevision, setPhotoRevision] = useState(0);
  const [lastCandidateTotal, setLastCandidateTotal] = useState(0);
  const [userPos, setUserPos] = useState<[number, number] | null>(null);
  const [geoState, setGeoState] = useState<
    "idle" | "loading" | "success" | "denied" | "unavailable"
  >("idle");

  const icons = useMemo(
    () => ({
      red: makePinIcon(PIN_RED),
      yellow: makePinIcon(PIN_YELLOW),
      green: makePinIcon(PIN_GREEN),
      orange: makePinIcon(PIN_ORANGE),
      slate: makePinIcon(PIN_SLATE),
      user: makePinIcon(PIN_USER),
    }),
    []
  );

  useEffect(() => {
    function bump() {
      setPhotoRevision((r) => r + 1);
    }
    window.addEventListener("siteWorkPhotosChanged", bump);
    window.addEventListener("siteDataSaved", bump);
    window.addEventListener("siteDailyLaborSaved", bump);
    return () => {
      window.removeEventListener("siteWorkPhotosChanged", bump);
      window.removeEventListener("siteDataSaved", bump);
      window.removeEventListener("siteDailyLaborSaved", bump);
    };
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoState("unavailable");
      return;
    }
    setGeoState("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPos([pos.coords.latitude, pos.coords.longitude]);
        setGeoState("success");
      },
      () => {
        setUserPos(null);
        setGeoState("denied");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60_000 }
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    const todayKey = todayLocalDateKey();

    async function run() {
      setMarkers([]);
      setFailed([]);
      setSkippedNoUrl(0);
      setLoading(true);

      const withUrlAll = sites.filter((s) => s.googleMapUrl?.trim());
      const statsSites = externalCompanyKey
        ? sites.filter((s) =>
            matchesMapScopeFilter(s, undefined, externalCompanyKey)
          )
        : sites;
      const statsWithUrl = statsSites.filter((s) => s.googleMapUrl?.trim());
      const noUrlCount = statsSites.length - statsWithUrl.length;

      const naturalCandidates = withUrlAll.filter((s) => {
        if (!matchesMapScopeFilter(s, companyKindFilter, externalCompanyKey)) {
          return false;
        }
        if (mapSubTab === "today") {
          return siteShowsOnTodayWorkMap(s, todayKey);
        }
        return siteMatchesScaffoldingInstallMap(s);
      });
      const naturalIds = new Set(naturalCandidates.map((s) => s.id));

      const candidates = unionAlwaysPins(naturalCandidates, sites);

      setSkippedNoUrl(noUrlCount);
      const total = candidates.length;
      setLastCandidateTotal(total);
      setProgress({ done: 0, total });

      if (total === 0) {
        setLoading(false);
        return;
      }

      const ok: MarkerOk[] = [];
      const bad: MarkerFail[] = [];

      for (let i = 0; i < candidates.length; i++) {
        const site = candidates[i];
        if (cancelled) return;

        const coords = await coordsFromSiteOrUrl(site);
        if (cancelled) return;

        if (coords) {
          const isAlwaysExtra = !naturalIds.has(site.id);
          let pin: PinColorKey;
          if (isAlwaysExtra) {
            pin = "slate";
          } else if (mapSubTab === "scaffold") {
            pin = "orange";
          } else {
            const k = getTodayMapPinKind(site.id, todayKey);
            pin =
              k === "finished"
                ? "green"
                : k === "in_progress"
                  ? "yellow"
                  : "red";
          }
          ok.push({ site, lat: coords.lat, lng: coords.lng, pin });
        } else {
          bad.push({ site, reason: "unresolved_url" });
        }
        setProgress({ done: i + 1, total });
      }

      if (cancelled) return;
      setMarkers(ok);
      setFailed(bad);
      setLoading(false);
    }

    if (sites.length === 0) {
      setLoading(false);
      setProgress({ done: 0, total: 0 });
      setSkippedNoUrl(0);
      setLastCandidateTotal(0);
      return;
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [sites, mapSubTab, photoRevision, companyKindFilter, externalCompanyKey]);

  const positions = useMemo(() => {
    const p = markers.map((m) => [m.lat, m.lng] as [number, number]);
    if (userPos) p.push(userPos);
    return p;
  }, [markers, userPos]);

  if (sites.length === 0) {
    return (
      <p className={styles.hint}>地図に表示する現場がありません。</p>
    );
  }

  const statsSitesForMsg = externalCompanyKey
    ? sites.filter((s) =>
        matchesMapScopeFilter(s, undefined, externalCompanyKey)
      )
    : sites;
  const withUrlCount = statsSitesForMsg.filter((s) => s.googleMapUrl?.trim())
    .length;

  return (
    <div className={styles.wrap}>
      {geoState === "denied" && (
        <div className={styles.geoDenied} role="status">
          <p className={styles.geoDeniedTitle}>位置情報の許可が必要です</p>
          <p className={styles.geoDeniedBody}>
            現在地を地図に表示するには、ブラウザの設定でこのサイトへの位置情報の利用を許可してください。
          </p>
          <ul className={styles.geoDeniedList}>
            <li>
              <strong>Chrome / Edge</strong>
              ：アドレスバー左の鍵または情報アイコンから「サイトの設定」→「位置情報」を「許可」に変更
            </li>
            <li>
              <strong>Safari（iPhone）</strong>
              ：設定アプリ → Safari → 位置情報 → 対象サイトを「許可」に変更
            </li>
            <li>
              <strong>Android Chrome</strong>
              ：Chrome の設定 → サイトの設定 → 位置情報 → このサイトを許可
            </li>
          </ul>
        </div>
      )}

      {geoState === "unavailable" && (
        <p className={styles.geoWeak} role="status">
          この端末・ブラウザでは位置情報を利用できません。
        </p>
      )}

      <div className={styles.subTabBar} role="tablist" aria-label="地図の種類">
        <button
          type="button"
          role="tab"
          aria-selected={mapSubTab === "today"}
          className={
            mapSubTab === "today" ? styles.subTabActive : styles.subTab
          }
          onClick={() => setMapSubTab("today")}
        >
          本日の作業
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mapSubTab === "scaffold"}
          className={
            mapSubTab === "scaffold" ? styles.subTabActive : styles.subTab
          }
          onClick={() => setMapSubTab("scaffold")}
        >
          足場設置中
        </button>
      </div>

      {loading && (
        <p className={styles.status} aria-live="polite">
          GoogleマップのURLから位置を取得しています…（{progress.done}/
          {progress.total}）
        </p>
      )}

      {!loading && mapSubTab === "today" && markers.length === 0 && (
        <p className={styles.emptyMapMessage} role="status">
          {withUrlCount === 0
            ? "GoogleマップURLが登録されている現場がありません。"
            : lastCandidateTotal > 0 && failed.length >= lastCandidateTotal
              ? "いずれの現場もURLから位置を取得できませんでした。下記をご確認ください。"
              : "本日の入場日または本日の作業記録がある現場はありません（常時表示の現場を除く）。"}
        </p>
      )}

      {!loading && mapSubTab === "scaffold" && markers.length === 0 && (
        <p className={styles.emptyMapMessage} role="status">
          {withUrlCount === 0
            ? "GoogleマップURLが登録されている現場がありません。"
            : lastCandidateTotal > 0 && failed.length >= lastCandidateTotal
              ? "いずれの現場もURLから位置を取得できませんでした。下記をご確認ください。"
              : "現在設置中の足場はありません（常時表示の現場を除く）。"}
        </p>
      )}

      <div className={styles.mapShell}>
        <MapContainer
          center={JP_CENTER}
          zoom={JP_ZOOM}
          className={styles.map}
          scrollWheelZoom
        >
          <MapInvalidateSize />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {userPos && (
            <Marker position={userPos} icon={icons.user} zIndexOffset={1000}>
              <Popup>
                <span className={styles.userPopupLabel}>現在地</span>
              </Popup>
            </Marker>
          )}
          {markers.map((m) => {
            const status = getEffectiveSiteDisplayStatus(m.site);
            const href = siteDetailHref
              ? siteDetailHref(m.site)
              : `/sites/${m.site.id}`;
            return (
              <Marker
                key={`${mapSubTab}-${m.site.id}`}
                position={[m.lat, m.lng]}
                icon={icons[m.pin]}
              >
                <Popup>
                  <Link
                    to={href}
                    className={styles.popupBalloon}
                  >
                    <div className={styles.popupTitle}>{m.site.name}</div>
                    <div className={styles.popupStatus}>{status}</div>
                    <div className={styles.popupHint}>タップして現場を開く</div>
                  </Link>
                </Popup>
              </Marker>
            );
          })}
          {positions.length > 0 && <MapFitBounds positions={positions} />}
        </MapContainer>
      </div>

      {mapSubTab === "today" && (
        <ul className={styles.legend} aria-label="凡例（本日の作業）">
          <li>
            <span
              className={styles.legendDot}
              style={{ background: PIN_RED }}
            />
            未着手（本日は入場・終了の写真なし）
          </li>
          <li>
            <span
              className={styles.legendDot}
              style={{ background: PIN_YELLOW }}
            />
            作業中（本日入場時あり・終了時なし）
          </li>
          <li>
            <span
              className={styles.legendDot}
              style={{ background: PIN_GREEN }}
            />
            作業終了（本日終了時あり）
          </li>
          <li>
            <span
              className={styles.legendDot}
              style={{ background: PIN_SLATE }}
            />
            常時表示（マップに固定）
          </li>
          <li>
            <span
              className={styles.legendDot}
              style={{ background: PIN_USER }}
            />
            現在地
          </li>
        </ul>
      )}

      {mapSubTab === "scaffold" && (
        <ul className={styles.legend} aria-label="凡例（足場設置中）">
          <li>
            <span
              className={styles.legendDot}
              style={{ background: PIN_ORANGE }}
            />
            設置中（組みに写真あり・足場撤去未完了）
          </li>
          <li>
            <span
              className={styles.legendDot}
              style={{ background: PIN_SLATE }}
            />
            常時表示（マップに固定）
          </li>
          <li>
            <span
              className={styles.legendDot}
              style={{ background: PIN_USER }}
            />
            現在地
          </li>
        </ul>
      )}

      {(skippedNoUrl > 0 || failed.length > 0) && (
        <div className={styles.notes}>
          {skippedNoUrl > 0 && (
            <p className={styles.note}>
              <strong>GoogleマップURLが未入力</strong>のためピンを出していない現場（
              {skippedNoUrl} 件）
            </p>
          )}
          {failed.length > 0 && (
            <p className={styles.note}>
              <strong>URLから位置を取得できなかった</strong>現場（
              {failed.length} 件）:{" "}
              {failed.map((f) => f.site.name).join("、")}
              <span className={styles.noteHint}>
                {" "}
                （座標が含まれる共有URLに差し替えるか、短縮URLの場合はブラウザで開いたあとのURLを登録してください）
              </span>
            </p>
          )}
        </div>
      )}

      <p className={styles.disclaimer}>
        ピン位置は登録された Google
        マップのURLから読み取っています。表示は目安です。
      </p>
    </div>
  );
}
