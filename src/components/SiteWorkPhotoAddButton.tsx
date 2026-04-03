import { useCallback, useEffect, useRef, useState } from "react";
import type { SitePhoto } from "../types/sitePhoto";
import type { Site } from "../types/site";
import type { WorkKind } from "../types/workKind";
import {
  loadPhotosForSiteWorkDate,
  savePhotosForSiteWorkDate,
} from "../lib/sitePhotoStorage";
import { uploadSitePhotoToR2 } from "../lib/photoUploadApi";
import photoStyles from "./SitePhotosSection.module.css";

const UPLOAD_CATEGORY = "記録" as const;

type Props = {
  siteId: string;
  site: Site;
  workKind: WorkKind;
  /** 紐付ける日付（YYYY-MM-DD） */
  dateKey: string;
  onStorageChange?: () => void;
};

function newPhotoId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `ph-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/** 作業記録アコーディオン内の「写真を追加する」 */
export function SiteWorkPhotoAddButton({
  siteId,
  site,
  workKind,
  dateKey,
  onStorageChange,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const bump = useCallback(() => {
    onStorageChange?.();
  }, [onStorageChange]);

  const persist = useCallback(
    (next: SitePhoto[]) => {
      try {
        savePhotosForSiteWorkDate(siteId, workKind, dateKey, next);
        setStorageError(null);
        bump();
      } catch {
        setStorageError("写真のメタデータを保存できませんでした。もう一度お試しください。");
        throw new Error("save failed");
      }
    },
    [siteId, workKind, dateKey, bump]
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
            dateKey,
            photoCategory: UPLOAD_CATEGORY,
            siteName: site.name?.trim() ?? "",
          });
          newItems.push({
            id: newPhotoId(),
            url,
            uploadedAt: new Date().toISOString(),
            fileName: file.name || "image",
            category: UPLOAD_CATEGORY,
          });
        }
        const current = loadPhotosForSiteWorkDate(siteId, workKind, dateKey);
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
    [siteId, workKind, dateKey, site.name, persist]
  );

  useEffect(() => {
    const input = fileInputRef.current;
    if (!input) return;
    function onFileInputChange() {
      const el = fileInputRef.current;
      if (!el) return;
      const fileList = el.files;
      if (!fileList?.length) {
        el.value = "";
        return;
      }
      const imageFiles = [...fileList].filter((f) =>
        f.type.startsWith("image/")
      );
      el.value = "";
      if (imageFiles.length === 0) return;
      void processSelectedImageFiles(imageFiles);
    }
    input.addEventListener("change", onFileInputChange);
    return () => input.removeEventListener("change", onFileInputChange);
  }, [processSelectedImageFiles]);

  return (
    <div className={photoStyles.inlinePhotoAdd}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className={photoStyles.hiddenInput}
        aria-label="写真ファイルを選択"
      />
      <button
        type="button"
        className={photoStyles.addBtn}
        disabled={isAdding}
        onClick={() => {
          if (!isAdding) fileInputRef.current?.click();
        }}
      >
        {isAdding ? "追加中…" : "写真を追加する"}
      </button>
      {storageError && (
        <p className={photoStyles.error} role="alert">
          {storageError}
        </p>
      )}
    </div>
  );
}
