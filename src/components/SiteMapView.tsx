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
import { resolveGoogleMapsUrlForPin } from "../lib/googleMapsUrlCoords";
import {
  getTodayMapPinKind,
  siteMatchesScaffoldingInstallMap,
} from "../lib/sitePhotoStorage";
import { todayLocalDateKey } from "../lib/dateUtils";
import styles from "./SiteMapView.module.css";

const JP_CENTER: [number, number] = [36.2048, 138.2529];
const JP_ZOOM = 5;

const PIN_RED = "#dc2626";
const PIN_YELLOW = "#ca8a04";
const PIN_GREEN = "#16a34a";
const PIN_ORANGE = "#ea580c";

type MapSubTab = "today" | "scaffold";

type PinColorKey = "red" | "yellow" | "green" | "orange";

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
  sites: Site[];
};

export function SiteMapView({ sites }: Props) {
  const [mapSubTab, setMapSubTab] = useState<MapSubTab>("today");
  const [markers, setMarkers] = useState<MarkerOk[]>([]);
  const [failed, setFailed] = useState<MarkerFail[]>([]);
  const [skippedNoUrl, setSkippedNoUrl] = useState(0);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [photoRevision, setPhotoRevision] = useState(0);
  /** 直近の取得対象件数（空メッセージの判定用） */
  const [lastCandidateTotal, setLastCandidateTotal] = useState(0);

  const icons = useMemo(
    () => ({
      red: makePinIcon(PIN_RED),
      yellow: makePinIcon(PIN_YELLOW),
      green: makePinIcon(PIN_GREEN),
      orange: makePinIcon(PIN_ORANGE),
    }),
    []
  );

  useEffect(() => {
    function bump() {
      setPhotoRevision((r) => r + 1);
    }
    window.addEventListener("siteWorkPhotosChanged", bump);
    window.addEventListener("siteDataSaved", bump);
    return () => {
      window.removeEventListener("siteWorkPhotosChanged", bump);
      window.removeEventListener("siteDataSaved", bump);
    };
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
      const noUrlCount = sites.length - withUrlAll.length;

      let candidates: Site[];
      if (mapSubTab === "today") {
        candidates = withUrlAll;
      } else {
        candidates = withUrlAll.filter((s) =>
          siteMatchesScaffoldingInstallMap(s)
        );
      }

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

        const coords = await resolveGoogleMapsUrlForPin(site.googleMapUrl);
        if (cancelled) return;

        if (coords) {
          let pin: PinColorKey;
          if (mapSubTab === "scaffold") {
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
  }, [sites, mapSubTab, photoRevision]);

  const positions = useMemo(
    () => markers.map((m) => [m.lat, m.lng] as [number, number]),
    [markers]
  );

  if (sites.length === 0) {
    return (
      <p className={styles.hint}>地図に表示する現場がありません。</p>
    );
  }

  const withUrlCount = sites.filter((s) => s.googleMapUrl?.trim()).length;

  return (
    <div className={styles.wrap}>
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
            : lastCandidateTotal > 0 &&
                failed.length >= lastCandidateTotal
              ? "いずれの現場もURLから位置を取得できませんでした。下記をご確認ください。"
              : "本日作業中の現場はありません。"}
        </p>
      )}

      {!loading && mapSubTab === "scaffold" && markers.length === 0 && (
        <p className={styles.emptyMapMessage} role="status">
          {withUrlCount === 0
            ? "GoogleマップURLが登録されている現場がありません。"
            : lastCandidateTotal > 0 &&
                failed.length >= lastCandidateTotal
              ? "いずれの現場もURLから位置を取得できませんでした。下記をご確認ください。"
              : "現在設置中の足場はありません。"}
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
          {markers.map((m) => (
            <Marker
              key={`${mapSubTab}-${m.site.id}`}
              position={[m.lat, m.lng]}
              icon={icons[m.pin]}
            >
              <Popup>
                <div className={styles.popup}>
                  <div className={styles.popupTitle}>{m.site.name}</div>
                  <div className={styles.popupRow}>
                    職長: {m.site.foremanName || "—"}
                  </div>
                  <Link
                    to={`/sites/${m.site.id}`}
                    className={styles.popupLink}
                  >
                    現場ページを開く
                  </Link>
                </div>
              </Popup>
            </Marker>
          ))}
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
