import { useNavigate } from "react-router-dom";
import type { Site } from "../types/site";
import { addSite } from "../lib/siteStorage";
import { SiteEditorForm } from "../components/SiteEditorForm";

export function SiteNewPage() {
  const navigate = useNavigate();

  function handleSubmit(site: Site) {
    addSite(site);
  }

  function handleSubmitComplete(site: Site) {
    navigate(`/sites/${site.id}`, { replace: true });
  }

  return (
    <SiteEditorForm
      initialSite={null}
      onSubmit={handleSubmit}
      onSubmitComplete={handleSubmitComplete}
      cancelHref="/"
      pageTitle="現場の新規登録"
      lead="入力後に登録すると、その現場専用のページが作成されます。"
      submitLabel="登録して現場ページを作成"
    />
  );
}
