import type { Site } from "../types/site";
import type { PhotoCategory } from "../types/sitePhoto";
import { loadRecipients } from "./notificationRecipientStorage";
import { getSelectedRecipientIds } from "./siteNotificationRecipientStorage";

const API_BASE = (
  import.meta.env.VITE_EMAIL_API_URL ?? "http://localhost:3001"
).replace(/\/$/, "");

function formatMailDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat("ja-JP", {
      dateStyle: "long",
      timeStyle: "medium",
    }).format(d);
  } catch {
    return iso;
  }
}

function joinLines(items: string[]): string {
  if (items.length === 0) return "—";
  return items.join("、");
}

export function buildNotificationBody(site: Site, uploadedAtIso: string): string {
  const lines = [
    `現場名: ${site.name}`,
    `元請け様: ${site.clientName || "—"}`,
    `住所: ${site.address || "—"}`,
    `GoogleマップURL: ${site.googleMapUrl?.trim() || "—"}`,
    `開始日: ${site.startDate}`,
    `担当営業名: ${site.salesName || "—"}`,
    `職長名: ${site.foremanName || "—"}`,
    `子方名: ${joinLines(site.kogataNames)}`,
    `人員数: ${site.workerCount}名`,
    `車両: ${joinLines(site.vehicleLabels)}`,
    `現場種別: ${site.siteTypeName || "—"}`,
    `区分: ${site.companyKind}`,
    `日時: ${formatMailDateTime(uploadedAtIso)}`,
  ];
  return lines.join("\n");
}

export function getEmailsForSiteNotifications(siteId: string): string[] {
  const selectedIds = new Set(getSelectedRecipientIds(siteId));
  if (selectedIds.size === 0) return [];
  const master = loadRecipients();
  const emails = master
    .filter((r) => selectedIds.has(r.id))
    .map((r) => r.email.trim())
    .filter(Boolean);
  return [...new Set(emails)];
}

export type WorkMailKind = "start" | "end";

export function subjectForWorkMail(kind: WorkMailKind, siteName: string): string {
  if (kind === "start") return `【作業開始】${siteName}`;
  return `【作業終了】${siteName}`;
}

/** 入場時・終了時メール用（件名・本文は種別に連動） */
export function buildWorkMail(
  site: Site,
  category: PhotoCategory,
  uploadedAtIso: string
): { subject: string; text: string } | null {
  if (category === "入場時") {
    return {
      subject: subjectForWorkMail("start", site.name),
      text: buildNotificationBody(site, uploadedAtIso),
    };
  }
  if (category === "終了時") {
    return {
      subject: subjectForWorkMail("end", site.name),
      text: buildNotificationBody(site, uploadedAtIso),
    };
  }
  return null;
}

export async function sendEmailApi(params: {
  to: string[];
  subject: string;
  text: string;
}): Promise<void> {
  const url = `${API_BASE}/api/send-email`;
  const payload = {
    to: params.to,
    subject: params.subject,
    text: params.text,
  };

  console.log("[sendEmailApi] POST 開始", url, {
    toCount: params.to.length,
    subject: params.subject,
  });

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error("[sendEmailApi] fetch 例外（CORS・接続先・オフライン）:", e);
    throw new Error(
      `メールAPIに接続できませんでした（${url}）。サーバー（npm run server）が起動しているか確認してください。`
    );
  }

  console.log("[sendEmailApi] レスポンス", res.status, res.statusText);

  let data: { ok?: boolean; error?: string } = {};
  try {
    data = await res.json();
  } catch {
    console.warn("[sendEmailApi] JSON パース不可");
  }

  if (!res.ok || !data.ok) {
    console.warn("[sendEmailApi] エラー応答", data);
    throw new Error(data.error ?? "メール送信に失敗しました。");
  }

  console.log("[sendEmailApi] 送信API成功");
}

export async function sendWorkNotificationIfNeeded(
  siteId: string,
  site: Site,
  category: PhotoCategory,
  uploadedAtIso: string
): Promise<void> {
  const mail = buildWorkMail(site, category, uploadedAtIso);
  if (!mail) return;
  const to = getEmailsForSiteNotifications(siteId);
  if (to.length === 0) {
    throw new Error(
      "この現場で通知先にチェックされた宛先がありません。通知先タブを確認してください。"
    );
  }
  await sendEmailApi({ ...mail, to });
}
