import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { SitePhoto } from "../types/sitePhoto";
import type { Site } from "../types/site";
import type { WorkKind } from "../types/workKind";
import {
  loadPhotosForSiteWorkDate,
  savePhotosForSiteWorkDate,
} from "../lib/sitePhotoStorage";
import { uploadSitePhotoToR2 } from "../lib/photoUploadApi";
import styles from "./SitePhotosSection.module.css";

/** 新規アップロードは種別を付けず「記録」として保存（一覧では区別しない） */
const UPLOAD_CATEGORY = "記録" as const;

type Props = {
  siteId: string;
  site: Site;
  workKind: WorkKind;
  /** 本日の日付キー（YYYY-MM-DD）。アップロードは常にこの日付に紐付けます */
  todayDateKey: string;
  onStorageChange?: () => void;
  /**
   * 「写真を追加」クリック時に呼ばれるゲート。
   * false を返すとファイル選択を開かずに中断します（モーダル表示などに使用）。
   */
  beforeAddPhotos?: () => boolean;

  /** 親が「写真を追加」処理を再実行できるように登録する */
  registerAddPhotosTrigger?: (fn: () => void) => void;
};

function newPhotoId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `ph-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function SitePhotosSection({
  siteId,
  site: _site,
  workKind,
  todayDateKey,
  onStorageChange,
  beforeAddPhotos,
  registerAddPhotosTrigger,
}: Props) {
  void _site;
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [storageError, setStorageError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const bump = useCallback(() => {
    onStorageChange?.();
  }, [onStorageChange]);

  const persist = useCallback(
    (next: SitePhoto[]) => {
      try {
        savePhotosForSiteWorkDate(siteId, workKind, todayDateKey, next);
        setStorageError(null);
        bump();
      } catch {
        setStorageError("写真のメタデータを保存できませんでした。もう一度お試しください。");
        throw new Error("save failed");
      }
    },
    [siteId, workKind, todayDateKey, bump]
  );

  const processSelectedImageFiles = useCallback(
    async (imageFiles: File[]) => {
      setIsAdding(true);
      setStorageError(null);

      try {
        const newItems: SitePhoto[] = [];
        for (const file of imageFiles) {
          const url = await uploadSitePhotoToR2(file, {
            siteId,
            workKind,
            dateKey: todayDateKey,
            photoCategory: UPLOAD_CATEGORY,
            siteName: _site.name?.trim() ?? "",
          });
          newItems.push({
            id: newPhotoId(),
            url,
            uploadedAt: new Date().toISOString(),
            fileName: file.name || "image",
            category: UPLOAD_CATEGORY,
          });
        }

        const current = loadPhotosForSiteWorkDate(
          siteId,
          workKind,
          todayDateKey
        );
        const merged = [...newItems, ...current];

        try {
          persist(merged);
        } catch {
          return;
        }
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "写真のアップロードに失敗しました。";
        setStorageError(msg);
      } finally {
        setIsAdding(false);
      }
    },
    [siteId, workKind, todayDateKey, persist]
  );

  useEffect(() => {
    const input = fileInputRef.current;
    if (!input) return;

    function onFileInputChange() {
      const fileList = input.files;
      if (!fileList?.length) {
        input.value = "";
        return;
      }

      const imageFiles = [...fileList].filter((f) =>
        f.type.startsWith("image/")
      );
      input.value = "";

      if (imageFiles.length === 0) return;

      void processSelectedImageFiles(imageFiles);
    }

    input.addEventListener("change", onFileInputChange);
    return () => input.removeEventListener("change", onFileInputChange);
  }, [processSelectedImageFiles]);

  const handleAddPhotosClick = useCallback(() => {
    if (isAdding) return;

    if (beforeAddPhotos) {
      try {
        if (!beforeAddPhotos()) return;
      } catch {
        return;
      }
    }

    fileInputRef.current?.click();
  }, [beforeAddPhotos, isAdding]);

  // flushSync 直後に親が photoAddTrigger を呼ぶため、同一コミット内で最新ハンドラを登録する
  useLayoutEffect(() => {
    registerAddPhotosTrigger?.(handleAddPhotosClick);
  }, [registerAddPhotosTrigger, handleAddPhotosClick]);

  return (
    <section className={styles.section} aria-labelledby={inputId + "-heading"}>
      <div className={styles.sectionHead}>
        <h2 id={inputId + "-heading"} className={styles.sectionTitle}>
          写真
        </h2>
        <div className={styles.actions}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className={styles.hiddenInput}
            aria-label="写真ファイルを選択"
          />
          <button
            type="button"
            className={styles.addBtn}
            disabled={isAdding}
            onClick={handleAddPhotosClick}
          >
            {isAdding ? "追加中…" : "写真を追加する"}
          </button>
        </div>
      </div>
      <p className={styles.categoryHint}>
        選択中の作業種別・<strong>今日の日付</strong>
        の作業記録に保存されます。下の作業記録一覧で確認・削除できます。
      </p>

      {storageError && (
        <p className={styles.error} role="alert">
          {storageError}
        </p>
      )}
    </section>
  );
}
