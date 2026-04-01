import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import admin from "firebase-admin";

/** @type {import("firebase-admin").app.App | null} */
let firebaseApp = null;

function appsReady() {
  return admin.apps.length > 0;
}

/**
 * 事務員向け通知: マスターで役割に「その他」が含まれるスタッフ（FCMトークン登録済みの端末へ送信）
 */
export function isOfficeStaffForFcm(s) {
  if (!s || typeof s.id !== "string" || !s.id.trim()) return false;
  const roles = Array.isArray(s.roles) ? s.roles : [];
  return roles.includes("その他");
}

export function initFirebaseAdminIfPossible() {
  if (appsReady()) return true;
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (typeof privateKey === "string") {
    privateKey = privateKey.replace(/\\n/g, "\n");
  }
  if (!projectId || !clientEmail || !privateKey) {
    return false;
  }
  try {
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
    console.log("[server] Firebase Admin initialized for FCM");
    return true;
  } catch (e) {
    console.error("[server] Firebase Admin init failed:", e);
    return false;
  }
}

export function isFcmConfigured() {
  return appsReady();
}

/** @param {string} dataDir */
export function fcmTokensPath(dataDir) {
  return join(dataDir, "fcm-tokens.json");
}

/**
 * @returns {Promise<Record<string, string[]>>}
 */
export async function readFcmTokensStore(dataDir) {
  const p = fcmTokensPath(dataDir);
  try {
    if (!existsSync(p)) return {};
    const raw = await readFile(p, "utf8");
    const j = JSON.parse(raw);
    if (typeof j !== "object" || j === null || Array.isArray(j)) return {};
    /** @type {Record<string, string[]>} */
    const out = {};
    for (const [k, v] of Object.entries(j)) {
      if (typeof k !== "string" || !k.trim()) continue;
      if (!Array.isArray(v)) continue;
      const tokens = v.filter((t) => typeof t === "string" && t.length > 0);
      if (tokens.length) out[k.trim()] = [...new Set(tokens)].slice(0, 20);
    }
    return out;
  } catch (e) {
    console.error("[server] readFcmTokensStore", e);
    return {};
  }
}

/**
 * @param {string} dataDir
 * @param {Record<string, string[]>} store
 */
export async function writeFcmTokensStore(dataDir, store) {
  await writeFile(fcmTokensPath(dataDir), JSON.stringify(store, null, 0), "utf8");
}

/**
 * @param {string} dataDir
 * @param {string} staffId
 * @param {string} token
 */
export async function registerFcmToken(dataDir, staffId, token) {
  const sid = String(staffId ?? "").trim();
  const t = String(token ?? "").trim();
  if (!sid || !t) return;
  const store = await readFcmTokensStore(dataDir);
  const prev = Array.isArray(store[sid]) ? store[sid] : [];
  const next = [t, ...prev.filter((x) => x !== t)];
  store[sid] = [...new Set(next)].slice(0, 20);
  await writeFcmTokensStore(dataDir, store);
}

/**
 * @param {string[]} staffIds
 * @param {unknown[]} staffList
 * @param {string} dataDir
 * @returns {Promise<string[]>}
 */
export async function collectTokensForStaffIds(staffIds, staffList, dataDir) {
  const set = new Set(staffIds.map((x) => String(x ?? "").trim()).filter(Boolean));
  if (set.size === 0) return [];
  const store = await readFcmTokensStore(dataDir);
  const validIds = new Set(
    (Array.isArray(staffList) ? staffList : [])
      .filter((s) => s && typeof s.id === "string")
      .map((s) => s.id)
  );
  const tokens = [];
  for (const id of set) {
    if (!validIds.has(id)) continue;
    const list = store[id];
    if (Array.isArray(list)) {
      for (const t of list) {
        if (typeof t === "string" && t.length > 0) tokens.push(t);
      }
    }
  }
  return [...new Set(tokens)];
}

/**
 * @param {unknown[]} staffList
 * @param {string} dataDir
 */
export async function collectOfficeStaffTokens(staffList, dataDir) {
  const officeIds = (Array.isArray(staffList) ? staffList : [])
    .filter(isOfficeStaffForFcm)
    .map((s) => s.id);
  return collectTokensForStaffIds(officeIds, staffList, dataDir);
}

const BATCH = 500;

/**
 * @param {string[]} tokens
 * @param {string} title
 * @param {string} body
 */
export async function sendFcmToTokens(tokens, title, body) {
  if (!appsReady() || tokens.length === 0) return { sent: 0, failed: 0 };
  const messaging = admin.messaging();
  let sent = 0;
  let failed = 0;
  const t = String(title ?? "").trim() || "お知らせ";
  const b = String(body ?? "").trim() || "";

  for (let i = 0; i < tokens.length; i += BATCH) {
    const chunk = tokens.slice(i, i + BATCH);
    try {
      const res = await messaging.sendEachForMulticast({
        tokens: chunk,
        notification: { title: t, body: b },
        webpush: {
          fcmOptions: {
            link: "/",
          },
        },
      });
      sent += res.successCount;
      failed += res.failureCount;
    } catch (e) {
      console.error("[server] sendEachForMulticast", e);
      failed += chunk.length;
    }
  }
  return { sent, failed };
}

/**
 * @param {unknown[]} staffList
 * @param {string} dataDir
 * @param {string} title
 * @param {string} body
 */
export async function notifyOfficeStaff(staffList, dataDir, title, body) {
  if (!appsReady()) {
    console.error("[server] FCM notifyOfficeStaff: Firebase not configured");
    return;
  }
  const tokens = await collectOfficeStaffTokens(staffList, dataDir);
  if (tokens.length === 0) {
    console.warn(
      "[server] FCM notifyOfficeStaff: no tokens (事務向けは役割「その他」かつトークン登録が必要です)"
    );
    return;
  }
  const r = await sendFcmToTokens(tokens, title, body);
  console.log("[server] FCM office notify:", r);
}

/**
 * @param {string[]} staffIds
 * @param {unknown[]} staffList
 * @param {string} dataDir
 * @param {string} title
 * @param {string} body
 */
export async function notifyStaffIds(staffIds, staffList, dataDir, title, body) {
  if (!appsReady()) return;
  const tokens = await collectTokensForStaffIds(staffIds, staffList, dataDir);
  if (tokens.length === 0) return;
  const r = await sendFcmToTokens(tokens, title, body);
  console.log("[server] FCM staff notify:", r);
}
