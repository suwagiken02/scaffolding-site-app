import { useCallback, useEffect, useMemo, useState } from "react";
import type { WorkKind } from "../types/workKind";
import { sitePhotoDisplaySrc } from "../types/sitePhoto";
import { pickProcessSummaryPhotos } from "../lib/processSummaryPhotos";
import { FOCUS_SITE_WORK_RECORD } from "../lib/siteWorkRecordFocus";
import styles from "./SiteProcessSummaryPhotos.module.css";

type Props = {
  siteId: string;
  revision: number;
};

function formatDateKeySlash(dateKey: string): string {
  const [y, m, d] = dateKey.split("-");
  if (!y || !m || !d) return dateKey;
  return `${y}/${m}/${d}`;
}

export function SiteProcessSummaryPhotos({ siteId, revision }: Props) {
  const slots = useMemo(
    () => pickProcessSummaryPhotos(siteId),
    [siteId, revision]
  );

  const [loadedIds, setLoadedIds] = useState<Set<string>>(() => new Set());
  const [failedIds, setFailedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setLoadedIds(new Set());
    setFailedIds(new Set());
  }, [siteId, revision, slots]);

  const markLoaded = useCallback((id: string) => {
    setLoadedIds((prev) => new Set([...prev, id]));
  }, []);

  const markFailed = useCallback((id: string) => {
    setFailedIds((prev) => new Set([...prev, id]));
  }, []);

  const onJump = useCallback(
    (dateKey: string, workKind: WorkKind) => {
      window.dispatchEvent(
        new CustomEvent(FOCUS_SITE_WORK_RECORD, {
          detail: { siteId, dateKey, workKind },
        })
      );
    },
    [siteId]
  );

  if (slots.length === 0) return null;

  const allSettled = slots.every((s) => {
    const src = sitePhotoDisplaySrc(s.photo).trim();
    return (
      !src ||
      loadedIds.has(s.photo.id) ||
      failedIds.has(s.photo.id)
    );
  });

  return (
    <div className={styles.wrap} aria-label="工程サマリー写真">
      {!allSettled && (
        <p className={styles.loadingText} aria-live="polite">
          写真を読み込み中…
        </p>
      )}
      <ul className={styles.strip}>
        {slots.map((s) => {
          const src = sitePhotoDisplaySrc(s.photo).trim();
          const settled =
            !src ||
            loadedIds.has(s.photo.id) ||
            failedIds.has(s.photo.id);
          const label = `${formatDateKeySlash(s.dateKey)}・${s.workKind}の作業記録へ移動`;
          return (
            <li key={`${s.photo.id}-${s.dateKey}-${s.workKind}`} className={styles.stripItem}>
              <button
                type="button"
                className={`${styles.thumbBtn} ${settled ? styles.thumbLoaded : ""}`}
                onClick={() => onJump(s.dateKey, s.workKind)}
                aria-label={label}
                title={label}
              >
                <span className={styles.thumbSkeleton} aria-hidden />
                {src ? (
                  <img
                    className={styles.thumbImg}
                    src={src}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    onLoad={() => markLoaded(s.photo.id)}
                    onError={() => markFailed(s.photo.id)}
                  />
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
