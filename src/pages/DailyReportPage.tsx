import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { PhotoCategoryBadge } from "../components/PhotoCategoryBadge";
import {
  PHOTO_CATEGORY_ORDER,
  PHOTO_CATEGORY_LABELS,
  type PhotoCategory,
  type SitePhoto,
} from "../types/sitePhoto";
import { getSiteById } from "../lib/siteStorage";
import { loadPhotosForSiteWorkDate } from "../lib/sitePhotoStorage";
import { todayLocalDateKey } from "../lib/dateUtils";
import { isWorkKind, type WorkKind } from "../types/workKind";
import styles from "./DailyReportPage.module.css";

function parseDateKey(raw: string | null): string {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return todayLocalDateKey();
}

function formatReportTitleDate(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return dateKey;
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "long",
  }).format(new Date(y, m - 1, d));
}

function joinList(items: string[]): string {
  if (items.length === 0) return "—";
  return items.join("、");
}

function sortPhotosForReport(photos: SitePhoto[]): SitePhoto[] {
  const orderIdx = (c: PhotoCategory) => PHOTO_CATEGORY_ORDER.indexOf(c);
  return [...photos].sort((a, b) => {
    const oc = orderIdx(a.category) - orderIdx(b.category);
    if (oc !== 0) return oc;
    return (
      new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime()
    );
  });
}

function parseWorkKind(raw: string | null): WorkKind {
  if (raw && isWorkKind(raw)) return raw;
  return "組み";
}

export function DailyReportPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const reportDate = parseDateKey(searchParams.get("date"));
  const workKind = parseWorkKind(searchParams.get("work"));

  const site = siteId ? getSiteById(siteId) : undefined;

  const photosForDay = useMemo(() => {
    if (!siteId) return [];
    const list = loadPhotosForSiteWorkDate(siteId, workKind, reportDate);
    return sortPhotosForReport(list);
  }, [siteId, workKind, reportDate]);

  if (!siteId) {
    return (
      <div className={styles.page}>
        <p>現場が指定されていません。</p>
      </div>
    );
  }

  if (!site) {
    return (
      <div className={styles.page}>
        <p className={styles.muted}>この現場は見つかりませんでした。</p>
        <Link to="/">現場一覧へ</Link>
      </div>
    );
  }

  function onDateChange(next: string) {
    setSearchParams({ date: next, work: workKind });
  }

  return (
    <div className={styles.page}>
      <header className={styles.docHeader}>
        <div className={`${styles.toolbar} ${styles.noPrint}`}>
          <Link to={`/sites/${siteId}`} className={styles.backLink}>
            ← 現場ページに戻る
          </Link>
          <div className={styles.toolbarActions}>
            <label className={styles.dateField}>
              <span className={styles.dateLabel}>作業日</span>
              <input
                type="date"
                className={styles.dateInput}
                value={reportDate}
                onChange={(e) => onDateChange(e.target.value)}
              />
            </label>
            <button
              type="button"
              className={styles.printBtn}
              onClick={() => window.print()}
            >
              印刷 / PDF保存
            </button>
          </div>
        </div>
        <p className={`${styles.hint} ${styles.noPrint}`}>
          印刷ダイアログで「PDFに保存」または「Microsoft Print to
          PDF」を選ぶと、PDFとして保存できます。
        </p>

        <div className={styles.titleBlock}>
          <h1 className={styles.docTitle}>作業日報</h1>
          <p className={styles.docDate}>{formatReportTitleDate(reportDate)}</p>
          <p className={styles.workKindBadge}>作業種別：{workKind}</p>
          <p className={styles.siteName}>{site.name}</p>
        </div>
      </header>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>現場情報</h2>
        <table className={styles.infoTable}>
          <tbody>
            <tr>
              <th scope="row">現場名</th>
              <td>{site.name}</td>
            </tr>
            <tr>
              <th scope="row">元請け様</th>
              <td>{site.clientName || "—"}</td>
            </tr>
            <tr>
              <th scope="row">住所（表示用）</th>
              <td>{site.address || "—"}</td>
            </tr>
            <tr>
              <th scope="row">GoogleマップURL</th>
              <td>{site.googleMapUrl?.trim() || "—"}</td>
            </tr>
            <tr>
              <th scope="row">開始日</th>
              <td>{site.startDate}</td>
            </tr>
            <tr>
              <th scope="row">担当営業名</th>
              <td>{site.salesName || "—"}</td>
            </tr>
            <tr>
              <th scope="row">職長名</th>
              <td>{site.foremanName || "—"}</td>
            </tr>
            <tr>
              <th scope="row">子方名</th>
              <td>{joinList(site.kogataNames)}</td>
            </tr>
            <tr>
              <th scope="row">人員数</th>
              <td>{site.workerCount} 名</td>
            </tr>
            <tr>
              <th scope="row">車両</th>
              <td>{joinList(site.vehicleLabels)}</td>
            </tr>
            <tr>
              <th scope="row">現場種別</th>
              <td>{site.siteTypeName || "—"}</td>
            </tr>
            <tr>
              <th scope="row">自社 / KOUSEI</th>
              <td>{site.companyKind}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          本日の写真（{photosForDay.length} 件）
        </h2>
        {photosForDay.length === 0 ? (
          <p className={styles.empty}>
            この日に登録された写真はありません。日付を変えるか、現場ページで写真を追加してください。
          </p>
        ) : (
          <ul className={styles.photoList}>
            {photosForDay.map((p, index) => (
              <li key={p.id} className={styles.photoBlock}>
                <div className={styles.photoHead}>
                  <span className={styles.photoNo}>#{index + 1}</span>
                  <PhotoCategoryBadge category={p.category} size="large" />
                  <time
                    className={styles.photoTime}
                    dateTime={p.uploadedAt}
                  >
                    {new Intl.DateTimeFormat("ja-JP", {
                      timeStyle: "medium",
                    }).format(new Date(p.uploadedAt))}
                  </time>
                </div>
                <div className={styles.photoFrame}>
                  <img
                    src={p.dataUrl}
                    alt={`${PHOTO_CATEGORY_LABELS[p.category]} ${p.fileName}`}
                    className={styles.photoImg}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className={`${styles.docFooter} ${styles.noPrint}`}>
        <button
          type="button"
          className={styles.printBtnSecondary}
          onClick={() => window.print()}
        >
          印刷 / PDF保存
        </button>
      </footer>
    </div>
  );
}
