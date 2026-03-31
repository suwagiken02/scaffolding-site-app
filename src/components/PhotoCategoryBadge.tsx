import {
  PHOTO_CATEGORY_LABELS,
  type PhotoCategory,
} from "../types/sitePhoto";
import styles from "./PhotoCategoryBadge.module.css";

const variant: Record<PhotoCategory, string> = {
  入場時: styles.entry,
  "休憩①": styles.break,
  "休憩②": styles.break,
  "休憩③": styles.break,
  終了時: styles.end,
};

type Props = {
  category: PhotoCategory;
  /** 日報などで少し大きめにする */
  size?: "default" | "large";
};

export function PhotoCategoryBadge({ category, size = "default" }: Props) {
  return (
    <span
      className={`${styles.badge} ${variant[category]} ${size === "large" ? styles.large : ""}`}
    >
      {PHOTO_CATEGORY_LABELS[category]}
    </span>
  );
}
