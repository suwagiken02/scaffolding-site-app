import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Site } from "../types/site";
import { getSiteById, updateSite } from "../lib/siteStorage";
import { SiteEditorForm } from "../components/SiteEditorForm";
import styles from "./SiteFormPage.module.css";

export function SiteEditPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const navigate = useNavigate();
  const [site, setSite] = useState<Site | null | undefined>(undefined);

  useEffect(() => {
    if (!siteId) {
      setSite(null);
      return;
    }
    setSite(getSiteById(siteId) ?? null);
  }, [siteId]);

  function handleSubmit(updated: Site) {
    updateSite(updated);
    navigate(`/sites/${updated.id}`);
  }

  if (site === undefined) {
    return (
      <p className={styles.lead} style={{ color: "var(--text-muted)" }}>
        読み込み中…
      </p>
    );
  }

  if (site === null) {
    return (
      <div>
        <p>この現場は見つかりませんでした。</p>
        <Link to="/">現場一覧へ</Link>
      </div>
    );
  }

  return (
    <SiteEditorForm
      initialSite={site}
      onSubmit={handleSubmit}
      cancelHref={`/sites/${site.id}`}
      pageTitle="現場の編集"
      lead="内容を変更して保存すると、現場ページに反映されます。"
      submitLabel="保存する"
      showSiteListWarningIgnore
    />
  );
}
