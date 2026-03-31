import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  PHOTO_CATEGORIES,
  type PhotoCategory,
  type SitePhoto,
} from "../types/sitePhoto";
import type { Site } from "../types/site";
import type { WorkKind } from "../types/workKind";
import {
  loadPhotosForSiteWorkDate,
  savePhotosForSiteWorkDate,
} from "../lib/sitePhotoStorage";
import { uploadSitePhotoToR2 } from "../lib/photoUploadApi";
import { sendWorkNotificationIfNeeded } from "../lib/sendEmailApi";
import { isoToLocalDateKey } from "../lib/dateUtils";
import { HelpTeamLaborModal } from "./HelpTeamLaborModal";
import styles from "./SitePhotosSection.module.css";

type MailConfirmKind = "start" | "end";

type PendingLaborFlow = {
  dateKey: string;
  entryIso: string | null;
  endIso: string;
};

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

function laborContextAfterEndUpload(
  newItems: SitePhoto[],
  merged: SitePhoto[]
): PendingLaborFlow | null {
  if (newItems.length === 0) return null;
  const dateKey = isoToLocalDateKey(newItems[0].uploadedAt);
  if (!dateKey) return null;
  const endMs = Math.max(
    ...newItems.map((p) => new Date(p.uploadedAt).getTime())
  );
  if (Number.isNaN(endMs)) return null;
  const endIso = new Date(endMs).toISOString();
  let entryIso: string | null = null;
  let minT = Infinity;
  for (const p of merged) {
    if (p.category !== "入場時") continue;
    if (isoToLocalDateKey(p.uploadedAt) !== dateKey) continue;
    const t = new Date(p.uploadedAt).getTime();
    if (!Number.isNaN(t) && t < minT) {
      minT = t;
      entryIso = p.uploadedAt;
    }
  }
  return { dateKey, entryIso, endIso };
}

function newPhotoId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `ph-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function SitePhotosSection({
  siteId,
  site,
  workKind,
  todayDateKey,
  onStorageChange,
  beforeAddPhotos,
  registerAddPhotosTrigger,
}: Props) {
  const inputId = useId();
  const mailModalTitleId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalYesBtnRef = useRef<HTMLButtonElement>(null);
  const shouldSendMailRef = useRef(false);
  const pendingCategoryRef = useRef<PhotoCategory>("入場時");
  const pendingUploadCategoryRef = useRef<PhotoCategory>("入場時");

  const [storageError, setStorageError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [uploadCategory, setUploadCategory] =
    useState<PhotoCategory>("入場時");
  const [mailConfirm, setMailConfirm] = useState<MailConfirmKind | null>(null);
  const [pendingLaborFlow, setPendingLaborFlow] =
    useState<PendingLaborFlow | null>(null);

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
    async (
      imageFiles: File[],
      category: PhotoCategory,
      shouldSendMail: boolean
    ) => {
      setIsAdding(true);
      setStorageError(null);

      try {
        const newItems: SitePhoto[] = [];
        for (const file of imageFiles) {
          const url = await uploadSitePhotoToR2(file, {
            siteId,
            workKind,
            dateKey: todayDateKey,
          });
          newItems.push({
            id: newPhotoId(),
            url,
            uploadedAt: new Date().toISOString(),
            fileName: file.name || "image",
            category,
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

        if (shouldSendMail && (category === "入場時" || category === "終了時")) {
          const atIso = newItems[0]?.uploadedAt ?? new Date().toISOString();
          try {
            await sendWorkNotificationIfNeeded(
              siteId,
              site,
              category,
              atIso
            );
          } catch (mailErr) {
            const msg =
              mailErr instanceof Error
                ? mailErr.message
                : "メール送信に失敗しました。";
            window.alert(msg);
          }
        }

        if (category === "終了時") {
          const ctx = laborContextAfterEndUpload(newItems, merged);
          if (ctx) setPendingLaborFlow(ctx);
        }
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "写真のアップロードに失敗しました。";
        setStorageError(msg);
      } finally {
        setIsAdding(false);
      }
    },
    [siteId, site, workKind, todayDateKey, persist]
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

      const category = pendingCategoryRef.current;
      const shouldSendMail = shouldSendMailRef.current;

      const imageFiles = [...fileList].filter((f) =>
        f.type.startsWith("image/")
      );
      input.value = "";

      if (imageFiles.length === 0) return;

      void processSelectedImageFiles(imageFiles, category, shouldSendMail);
    }

    input.addEventListener("change", onFileInputChange);
    return () => input.removeEventListener("change", onFileInputChange);
  }, [processSelectedImageFiles]);

  useEffect(() => {
    if (mailConfirm !== null) {
      modalYesBtnRef.current?.focus();
    }
  }, [mailConfirm]);

  useEffect(() => {
    if (mailConfirm === null) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMailConfirm(null);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mailConfirm]);

  function openFilePickerAfterMailChoice(sendMail: boolean) {
    shouldSendMailRef.current = sendMail;
    pendingCategoryRef.current = pendingUploadCategoryRef.current;
    setMailConfirm(null);
    fileInputRef.current?.click();
  }

  const handleAddPhotosClick = useCallback(() => {
    if (isAdding || mailConfirm !== null || pendingLaborFlow !== null) return;

    if (beforeAddPhotos) {
      try {
        if (!beforeAddPhotos()) return;
      } catch {
        return;
      }
    }

    const category = uploadCategory;

    if (category === "入場時") {
      pendingUploadCategoryRef.current = category;
      setMailConfirm("start");
      return;
    }
    if (category === "終了時") {
      pendingUploadCategoryRef.current = category;
      setMailConfirm("end");
      return;
    }

    shouldSendMailRef.current = false;
    pendingCategoryRef.current = category;
    fileInputRef.current?.click();
  }, [beforeAddPhotos, isAdding, mailConfirm, pendingLaborFlow, uploadCategory]);

  useEffect(() => {
    registerAddPhotosTrigger?.(handleAddPhotosClick);
  }, [registerAddPhotosTrigger, handleAddPhotosClick]);

  return (
    <section className={styles.section} aria-labelledby={inputId + "-heading"}>
      <div className={styles.sectionHead}>
        <h2 id={inputId + "-heading"} className={styles.sectionTitle}>
          写真を追加
        </h2>
        <div className={styles.actions}>
          <label className={styles.categoryField}>
            <span className={styles.categoryLabel}>種別</span>
            <select
              className={styles.categorySelect}
              value={uploadCategory}
              onChange={(e) =>
                setUploadCategory(e.target.value as PhotoCategory)
              }
              aria-label="写真の種別"
            >
              {PHOTO_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
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
            disabled={
              isAdding || mailConfirm !== null || pendingLaborFlow !== null
            }
            onClick={handleAddPhotosClick}
          >
            {isAdding ? "追加中…" : "写真を追加"}
          </button>
        </div>
      </div>
      <p className={styles.categoryHint}>
        選択中の作業種別・<strong>今日の日付</strong>
        に保存されます。下の日付一覧で確認・削除できます。
      </p>

      {storageError && (
        <p className={styles.error} role="alert">
          {storageError}
        </p>
      )}

      {pendingLaborFlow && (
        <HelpTeamLaborModal
          siteId={siteId}
          site={site}
          workKind={workKind}
          dateKey={pendingLaborFlow.dateKey}
          entryIso={pendingLaborFlow.entryIso}
          endIso={pendingLaborFlow.endIso}
          onClose={() => setPendingLaborFlow(null)}
          onSaved={bump}
        />
      )}

      {mailConfirm !== null && (
        <div className={styles.modalRoot} role="presentation">
          <div
            className={styles.modalPanel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={mailModalTitleId}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id={mailModalTitleId} className={styles.modalTitle}>
              {mailConfirm === "start"
                ? "作業開始の通知メールを送りますか？"
                : "作業終了の通知メールを送りますか？"}
            </h3>
            <div className={styles.modalActions}>
              <button
                type="button"
                ref={modalYesBtnRef}
                className={styles.modalBtnYes}
                onClick={() => openFilePickerAfterMailChoice(true)}
              >
                はい
              </button>
              <button
                type="button"
                className={styles.modalBtnNo}
                onClick={() => openFilePickerAfterMailChoice(false)}
              >
                いいえ
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
