import { useCallback, useEffect, useMemo, useState } from "react";
import type { Site } from "../types/site";
import type { WorkKind } from "../types/workKind";
import { WORK_KINDS } from "../types/workKind";
import type { SitePhoto } from "../types/sitePhoto";
import { sitePhotoDisplaySrc } from "../types/sitePhoto";
import { todayLocalDateKey } from "../lib/dateUtils";
import {
  loadPhotosForSiteWorkDate,
  listPhotoDateKeysForSiteWork,
} from "../lib/sitePhotoStorage";
import {
  listDateKeysForSiteWork,
  loadDailyLaborMap,
} from "../lib/siteDailyLaborStorage";
import { PhotoCategoryBadge } from "./PhotoCategoryBadge";
import photoStyles from "./SitePhotosSection.module.css";
import accStyles from "./SiteWorkDateAccordions.module.css";
import styles from "./SiteWorkRecordList.module.css";

type Filter = "all" | WorkKind;

type WorkRecordRow = {
  workKind: WorkKind;
  dateKey: string;
};

type Props = {
  siteId: string;
  site: Site;
  revision: number;
};

function formatDateKeySlash(dateKey: string): string {
  const [y, m, d] = dateKey.split("-");
  if (!y || !m || !d) return dateKey;
  return `${y}/${m}/${d}`;
}

function joinList(items: string[]): string {
  if (items.length === 0) return "—";
  return items.join("、");
}

function formatUploadedAt(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat("ja-JP", {
      dateStyle: "short",
      timeStyle: "medium",
    }).format(d);
  } catch {
    return iso;
  }
}

/**
 * 外部ポータル用：日付・作業種別・メンバー・写真のみ（人工・車両・編集なし）
 */
export function ExternalSiteReadOnlyWorkRecordList({
  siteId,
  site,
  revision,
}: Props) {
  const today = useMemo(() => todayLocalDateKey(), []);
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([today]));

  const rows = useMemo<WorkRecordRow[]>(() => {
    const out: WorkRecordRow[] = [];
    for (const w of WORK_KINDS) {
      const pk = listPhotoDateKeysForSiteWork(siteId, w);
      const dks = listDateKeysForSiteWork(siteId, w, pk);
      for (const dk of dks) out.push({ workKind: w, dateKey: dk });
    }
    const wOrder = (w: WorkKind) => WORK_KINDS.indexOf(w);
    return out.sort((a, b) => {
      const d = b.dateKey.localeCompare(a.dateKey);
      if (d !== 0) return d;
      return wOrder(a.workKind) - wOrder(b.workKind);
    });
  }, [siteId, revision]);

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter((r) => r.workKind === filter);
  }, [rows, filter]);

  useEffect(() => {
    setExpanded((prev) => new Set([...prev, todayLocalDateKey()]));
  }, [revision]);

  const toggle = useCallback((key: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }, []);

  function rowKey(w: WorkKind, dk: string) {
    return `${dk}__${w}`;
  }

  function memberLabel(workKind: WorkKind, dateKey: string): string {
    const labor = loadDailyLaborMap(siteId, workKind)[dateKey];
    if (!labor) return "—";
    const recordMemberNames =
      labor.memberForemanNames.length > 0 || labor.memberKogataNames.length > 0
        ? [...labor.memberForemanNames, ...labor.memberKogataNames]
        : [];
    const fallbackMemberNames = [site.foremanName, ...site.kogataNames]
      .map((n) => n.trim())
      .filter((n) => n.length > 0);
    return joinList(
      recordMemberNames.length > 0 ? recordMemberNames : fallbackMemberNames
    );
  }

  return (
    <section className={styles.section} aria-label="作業記録一覧">
      <div className={styles.head}>
        <h2 className={styles.title}>作業記録一覧</h2>
        <div className={styles.filters} role="tablist" aria-label="作業種別フィルター">
          <button
            type="button"
            role="tab"
            aria-selected={filter === "all"}
            className={filter === "all" ? styles.filterActive : styles.filter}
            onClick={() => setFilter("all")}
          >
            全て
          </button>
          {WORK_KINDS.map((w) => (
            <button
              key={w}
              type="button"
              role="tab"
              aria-selected={filter === w}
              className={filter === w ? styles.filterActive : styles.filter}
              onClick={() => setFilter(w)}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className={styles.empty}>作業記録はまだありません。</p>
      ) : (
        <ul className={accStyles.accList}>
          {filtered.map(({ workKind, dateKey }) => {
            const key = rowKey(workKind, dateKey);
            const isOpen = expanded.has(dateKey);
            const photos = loadPhotosForSiteWorkDate(siteId, workKind, dateKey);
            const members = memberLabel(workKind, dateKey);

            return (
              <li key={key} className={accStyles.accItem}>
                <button
                  type="button"
                  className={accStyles.accHeader}
                  aria-expanded={isOpen}
                  onClick={() => toggle(dateKey)}
                >
                  <span className={accStyles.accHeaderMain}>
                    <span className={accStyles.accHeaderLine1}>
                      {formatDateKeySlash(dateKey)}
                      <span className={accStyles.accSep}>　</span>
                      作業種別：{workKind}
                    </span>
                    <span className={accStyles.accHeaderLine2}>
                      メンバー：{members}
                    </span>
                  </span>
                  <span className={accStyles.accChevron} aria-hidden>
                    {isOpen ? "▼" : "▶"}
                  </span>
                </button>

                {isOpen && (
                  <div className={accStyles.accPanel}>
                    <section className={accStyles.block} aria-label="写真一覧">
                      <h3 className={accStyles.blockTitle}>作業写真</h3>
                      {photos.length === 0 ? (
                        <p className={accStyles.muted}>
                          この日の写真はありません。
                        </p>
                      ) : (
                        <ul className={photoStyles.photoGrid}>
                          {photos.map((p: SitePhoto) => (
                            <li key={p.id} className={photoStyles.photoCard}>
                              <div className={photoStyles.thumbWrap}>
                                <div className={photoStyles.badgeOverlay}>
                                  <PhotoCategoryBadge category={p.category} />
                                </div>
                                <img
                                  src={sitePhotoDisplaySrc(p)}
                                  alt={p.fileName}
                                  className={photoStyles.thumb}
                                  loading="lazy"
                                />
                              </div>
                              <div className={photoStyles.caption}>
                                <time
                                  className={photoStyles.time}
                                  dateTime={p.uploadedAt}
                                >
                                  {formatUploadedAt(p.uploadedAt)}
                                </time>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
