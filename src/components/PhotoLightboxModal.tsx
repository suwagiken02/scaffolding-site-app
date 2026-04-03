import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { SitePhoto } from "../types/sitePhoto";
import { sitePhotoDisplaySrc } from "../types/sitePhoto";
import styles from "./PhotoLightboxModal.module.css";

type Props = {
  open: boolean;
  photos: SitePhoto[];
  initialIndex: number;
  onClose: () => void;
};

export function PhotoLightboxModal({
  open,
  photos,
  initialIndex,
  onClose,
}: Props) {
  const [index, setIndex] = useState(0);

  const clampIndex = useCallback(
    (i: number) => {
      if (photos.length === 0) return 0;
      return ((i % photos.length) + photos.length) % photos.length;
    },
    [photos.length]
  );

  useEffect(() => {
    if (!open || photos.length === 0) return;
    setIndex(clampIndex(initialIndex));
  }, [open, initialIndex, photos.length, clampIndex]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (photos.length <= 1) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setIndex((i) => clampIndex(i - 1));
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setIndex((i) => clampIndex(i + 1));
      }
    }
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, photos.length, onClose, clampIndex]);

  if (!open || photos.length === 0) return null;

  const current = photos[index];
  const src = sitePhotoDisplaySrc(current);

  const modal = (
    <div
      className={styles.backdrop}
      role="presentation"
      onClick={onClose}
      aria-hidden={!open}
    >
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="写真の拡大表示"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className={styles.closeBtn}
          aria-label="閉じる"
          onClick={onClose}
        >
          <span aria-hidden>×</span>
        </button>

        {photos.length > 1 && (
          <>
            <button
              type="button"
              className={styles.navBtn}
              style={{ left: "0.35rem" }}
              aria-label="前の写真"
              onClick={(e) => {
                e.stopPropagation();
                setIndex((i) => clampIndex(i - 1));
              }}
            >
              <span aria-hidden>‹</span>
            </button>
            <button
              type="button"
              className={styles.navBtn}
              style={{ right: "0.35rem" }}
              aria-label="次の写真"
              onClick={(e) => {
                e.stopPropagation();
                setIndex((i) => clampIndex(i + 1));
              }}
            >
              <span aria-hidden>›</span>
            </button>
          </>
        )}

        <div className={styles.imageScroll}>
          <img
            src={src}
            alt={current.fileName}
            className={styles.image}
            draggable={false}
          />
        </div>

        {photos.length > 1 && (
          <div className={styles.counter} aria-live="polite">
            {index + 1} / {photos.length}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
