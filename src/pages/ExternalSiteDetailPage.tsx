import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Site } from "../types/site";
import type { ExternalCompany } from "../types/externalCompany";
import {
  getExternalCompanyByKey,
  normalizeCompanyKey,
} from "../lib/externalCompaniesStorage";
import { getSiteById, normalizeEntranceDateKeys } from "../lib/siteStorage";
import {
  siteHasAnyWorkRecordRows,
  siteHasHaraiWorkRecordRows,
} from "../lib/siteWorkRecordKeys";
import { ExternalPortalPinGate } from "../components/ExternalPortalPinGate";
import { ExternalSiteReadOnlyWorkRecordList } from "../components/ExternalSiteReadOnlyWorkRecordList";
import formStyles from "./SiteFormPage.module.css";
import portalStyles from "./ExternalSitePortalPage.module.css";

function computeSiteStatus(site: Site): "組立前" | "設置中" | "解体中" | "終了" {
  if (site.scaffoldingRemovalCompletedAt?.trim()) return "終了";
  if (!siteHasAnyWorkRecordRows(site.id)) return "組立前";
  return siteHasHaraiWorkRecordRows(site.id) ? "解体中" : "設置中";
}

function statusBadgeClass(
  status: ReturnType<typeof computeSiteStatus>
): string {
  if (status === "組立前") return portalStyles.stPre;
  if (status === "設置中") return portalStyles.stActive;
  if (status === "解体中") return portalStyles.stDismantle;
  return portalStyles.stEnded;
}

export function ExternalSiteDetailPage() {
  const { companyKey: companyKeyParam, siteId } = useParams<{
    companyKey: string;
    siteId: string;
  }>();

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

  const [revision, setRevision] = useState(0);

  useEffect(() => {
    function onSaved() {
      setRevision((r) => r + 1);
    }
    window.addEventListener("siteDataSaved", onSaved);
    return () => window.removeEventListener("siteDataSaved", onSaved);
  }, []);

  const site = siteId ? getSiteById(siteId) : undefined;
  const belongs =
    site &&
    normalizeCompanyKey(site.externalCompanyKey ?? "") === normalizedKey;

  const entranceDatesSorted = useMemo(() => {
    if (!site) return [];
    return [...normalizeEntranceDateKeys(site.entranceDateKeys)].sort((a, b) =>
      b.localeCompare(a)
    );
  }, [site]);

  if (!companyKeyParam || !normalizedKey || !company) {
    return (
      <div className={portalStyles.page}>
        <p className={portalStyles.muted}>このURLは無効です。</p>
      </div>
    );
  }

  return (
    <ExternalPortalPinGate company={company} normalizedKey={normalizedKey}>
      <div className={`${portalStyles.page} ${portalStyles.pagePortal}`}>
        {!siteId || !site || !belongs ? (
          <>
            <p className={portalStyles.muted}>この現場は見つかりませんでした。</p>
            <p>
              <Link className={portalStyles.linkBtn} to={`/external/${normalizedKey}`}>
                一覧に戻る
              </Link>
            </p>
          </>
        ) : (
          <>
            <div className={formStyles.breadcrumb}>
              <Link to={`/external/${normalizedKey}`}>← 一覧に戻る</Link>
            </div>
            <header className={portalStyles.detailHead}>
              <h1 className={portalStyles.title}>
                {site.name || "（無題）"}
              </h1>
              <p className={portalStyles.detailStatusRow}>
                <span className={portalStyles.detailStatusLabel}>ステータス</span>
                <span
                  className={`${portalStyles.statusBadge} ${statusBadgeClass(
                    computeSiteStatus(site)
                  )}`}
                >
                  {computeSiteStatus(site)}
                </span>
              </p>
            </header>

            <section
              className={portalStyles.portalBasicSection}
              aria-labelledby="ext-portal-basic-info-title"
            >
              <h2
                id="ext-portal-basic-info-title"
                className={portalStyles.portalBasicTitle}
              >
                現場基本情報
              </h2>
              <dl className={portalStyles.portalDetailsGrid}>
                <div className={portalStyles.portalRow}>
                  <dt className={portalStyles.portalDt}>現場名</dt>
                  <dd className={portalStyles.portalDd}>
                    {site.name?.trim() || "—"}
                  </dd>
                </div>
                <div className={portalStyles.portalRow}>
                  <dt className={portalStyles.portalDt}>元請け様名</dt>
                  <dd className={portalStyles.portalDd}>
                    {site.clientName?.trim() || "—"}
                  </dd>
                </div>
                <div className={portalStyles.portalRow}>
                  <dt className={portalStyles.portalDt}>住所</dt>
                  <dd className={portalStyles.portalDd}>
                    {site.address?.trim() || "—"}
                  </dd>
                </div>
                <div className={portalStyles.portalRow}>
                  <dt className={portalStyles.portalDt}>GoogleマップURL</dt>
                  <dd className={portalStyles.portalDd}>
                    {site.googleMapUrl?.trim() ? (
                      <a
                        href={site.googleMapUrl.trim()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={portalStyles.portalMapLink}
                      >
                        地図を開く
                      </a>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                <div className={portalStyles.portalRow}>
                  <dt className={portalStyles.portalDt}>入場日一覧</dt>
                  <dd className={portalStyles.portalDd}>
                    {entranceDatesSorted.length === 0 ? (
                      "—"
                    ) : (
                      <ul className={portalStyles.portalEntranceList}>
                        {entranceDatesSorted.map((dk) => (
                          <li key={dk}>{dk}</li>
                        ))}
                      </ul>
                    )}
                  </dd>
                </div>
                <div className={portalStyles.portalRow}>
                  <dt className={portalStyles.portalDt}>現場種別</dt>
                  <dd className={portalStyles.portalDd}>
                    {site.siteTypeName?.trim() || "—"}
                  </dd>
                </div>
                <div className={portalStyles.portalRow}>
                  <dt className={portalStyles.portalDt}>担当営業名</dt>
                  <dd className={portalStyles.portalDd}>
                    {site.salesName?.trim() || "—"}
                  </dd>
                </div>
              </dl>
            </section>

            <ExternalSiteReadOnlyWorkRecordList
              siteId={site.id}
              site={site}
              revision={revision}
            />
          </>
        )}
      </div>
    </ExternalPortalPinGate>
  );
}
