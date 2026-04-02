import { useLayoutEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

function isStandaloneDisplayMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) {
      return true;
    }
  } catch {
    // ignore
  }
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

/**
 * external.html?key= で通常ブラウザから開いたときのみ、クライアント遷移で
 * /external/:companyKey へ移す（フルリロードしない → manifest-external を維持）。
 * standalone のときはインラインスクリプト側のリダイレクトに任せる。
 */
export function ExternalHtmlKeyRedirect() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const key = searchParams.get("key")?.trim() ?? "";

  useLayoutEffect(() => {
    if (!key) return;
    if (isStandaloneDisplayMode()) return;
    navigate(`/external/${encodeURIComponent(key)}`, { replace: true });
  }, [key, navigate]);

  return null;
}
