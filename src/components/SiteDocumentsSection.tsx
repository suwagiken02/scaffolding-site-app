import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { SiteDocument } from "../types/siteDocument";
import {
  deleteSiteDocumentFromR2,
  uploadSiteDocumentToR2,
} from "../lib/documentUploadApi";
import {
  loadDocumentsForSite,
  saveDocumentsForSite,
} from "../lib/siteDocumentStorage";
import styles from "./SiteDocumentsSection.module.css";

type Props = {
  siteId: string;
  revision: number;
  onStorageChange?: () => void;
};

function newDocId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function formatDocDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium" }).format(d);
  } catch {
    return "—";
  }
}

const ACCEPT =
  "application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png";

export function SiteDocumentsSection({
  siteId,
  revision,
  onStorageChange,
}: Props) {
  const headingId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  void revision;
  const docs = loadDocumentsForSite(siteId);
  const sorted = [...docs].sort(
    (a, b) =>
      new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
  );

  const bump = useCallback(() => {
    onStorageChange?.();
  }, [onStorageChange]);

  const persist = useCallback(
    (next: SiteDocument[]) => {
      saveDocumentsForSite(siteId, next);
      bump();
    },
    [siteId, bump]
  );

  const processFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setUploading(true);
      setError(null);
      try {
        const current = loadDocumentsForSite(siteId);
        const added: SiteDocument[] = [];
        for (const file of files) {
          const { url, key } = await uploadSiteDocumentToR2(file, { siteId });
          added.push({
            id: newDocId(),
            fileName: file.name?.trim() || "書類",
            uploadedAt: new Date().toISOString(),
            url,
            r2Key: key,
          });
        }
        persist([...added, ...current]);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "書類のアップロードに失敗しました。"
        );
      } finally {
        setUploading(false);
      }
    },
    [siteId, persist]
  );

  useEffect(() => {
    const input = fileInputRef.current;
    if (!input) return;

    function onChange() {
      const list = input.files;
      if (!list?.length) {
        input.value = "";
        return;
      }
      const arr = [...list];
      input.value = "";
      void processFiles(arr);
    }

    input.addEventListener("change", onChange);
    return () => input.removeEventListener("change", onChange);
  }, [processFiles]);

  const onAddClick = useCallback(() => {
    if (uploading) return;
    fileInputRef.current?.click();
  }, [uploading]);

  const onDelete = useCallback(
    async (doc: SiteDocument) => {
      if (deletingId) return;
      if (!window.confirm(`「${doc.fileName}」を削除しますか？`)) return;
      setDeletingId(doc.id);
      setError(null);
      try {
        await deleteSiteDocumentFromR2(siteId, doc.r2Key);
        const next = loadDocumentsForSite(siteId).filter((d) => d.id !== doc.id);
        persist(next);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "書類の削除に失敗しました。"
        );
      } finally {
        setDeletingId(null);
      }
    },
    [siteId, deletingId, persist]
  );

  return (
    <section
      className={styles.section}
      aria-labelledby={headingId}
    >
      <div className={styles.head}>
        <h2 id={headingId} className={styles.title}>
          書類
        </h2>
        <div className={styles.actions}>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            multiple
            className={styles.hiddenInput}
            aria-label="書類ファイルを選択"
          />
          <button
            type="button"
            className={styles.addBtn}
            disabled={uploading}
            onClick={onAddClick}
          >
            {uploading ? "アップロード中…" : "書類を追加する"}
          </button>
        </div>
      </div>
      <p className={styles.lead}>
        指示書・部材表など（PDF・JPG・PNG）。一覧からタップするとブラウザで開きます。
      </p>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {sorted.length === 0 ? (
        <p className={styles.empty}>まだ書類がありません。</p>
      ) : (
        <ul className={styles.list}>
          {sorted.map((d) => (
            <li key={d.id} className={styles.item}>
              <a
                className={styles.link}
                href={d.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {d.fileName}
              </a>
              <span className={styles.meta}>{formatDocDate(d.uploadedAt)}</span>
              <button
                type="button"
                className={styles.deleteBtn}
                disabled={deletingId === d.id}
                onClick={() => void onDelete(d)}
              >
                {deletingId === d.id ? "削除中…" : "削除"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
