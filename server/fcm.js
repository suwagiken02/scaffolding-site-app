import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import admin from "firebase-admin";

/** @type {import("firebase-admin").app.App | null} */
let firebaseApp = null;

function appsReady() {
  return admin.apps.length > 0;
}

/** 通知先マスター（localStorage 同期）のファイル名 */
const NOTIFICATION_RECIPIENTS_FILE = "notification-recipients-master-v1.json";
/** スタッフマスター（isAdmin + fcmToken） */
const STAFF_MASTER_FILE = "master-staff-v1.json";

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
 * キーはスタッフ名（trim）。値は端末トークン配列。
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
 * @param {string} staffName
 * @param {string} token
 */
export async function registerFcmToken(dataDir, staffName, token) {
  const name = String(staffName ?? "").trim();
  const t = String(token ?? "").trim();
  if (!name || !t) return;
  const store = await readFcmTokensStore(dataDir);
  const prev = Array.isArray(store[name]) ? store[name] : [];
  const next = [t, ...prev.filter((x) => x !== t)];
  store[name] = [...new Set(next)].slice(0, 20);
  await writeFcmTokensStore(dataDir, store);
}

/**
 * @param {Record<string, string[]>} store
 * @returns {string[]}
 */
export function collectAllTokensFromStore(store) {
  const out = [];
  for (const v of Object.values(store)) {
    if (!Array.isArray(v)) continue;
    for (const t of v) {
      if (typeof t === "string" && t.length > 0) out.push(t);
    }
  }
  return [...new Set(out)];
}

/**
 * @param {string[]} staffNames
 * @param {Record<string, string[]>} store
 * @returns {string[]}
 */
export function collectTokensForStaffNames(staffNames, store) {
  const set = new Set(staffNames.map((x) => String(x ?? "").trim()).filter(Boolean));
  if (set.size === 0) return [];
  const tokens = [];
  for (const name of set) {
    const list = store[name];
    if (Array.isArray(list)) {
      for (const t of list) {
        if (typeof t === "string" && t.length > 0) tokens.push(t);
      }
    }
  }
  return [...new Set(tokens)];
}

/**
 * マスター notificationRecipients に保存された FCM トークン（管理者向け）
 * @param {string} dataDir
 * @returns {Promise<string[]>}
 */
export async function readNotificationRecipientFcmTokens(dataDir) {
  const p = join(dataDir, NOTIFICATION_RECIPIENTS_FILE);
  try {
    if (!existsSync(p)) return [];
    const raw = await readFile(p, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const tokens = [];
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const ft = row.fcmToken;
      if (typeof ft === "string" && ft.trim().length > 0) tokens.push(ft.trim());
    }
    return [...new Set(tokens)];
  } catch (e) {
    console.error("[server] readNotificationRecipientFcmTokens", e);
    return [];
  }
}

/**
 * スタッフマスターに保存された fcmToken をすべて（isAdmin 問わず）
 * @param {string} dataDir
 * @returns {Promise<string[]>}
 */
export async function readAllStaffFcmTokensFromStaffMaster(dataDir) {
  const p = join(dataDir, STAFF_MASTER_FILE);
  try {
    if (!existsSync(p)) return [];
    const raw = await readFile(p, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const tokens = [];
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const ft = row.fcmToken;
      if (typeof ft === "string" && ft.trim().length > 0) tokens.push(ft.trim());
    }
    return [...new Set(tokens)];
  } catch (e) {
    console.error("[server] readAllStaffFcmTokensFromStaffMaster", e);
    return [];
  }
}

/**
 * スタッフマスターで isAdmin: true かつ fcmToken がある端末へ（管理者向け）
 * @param {string} dataDir
 * @returns {Promise<string[]>}
 */
export async function readAdminStaffFcmTokensFromStaffMaster(dataDir) {
  const p = join(dataDir, STAFF_MASTER_FILE);
  try {
    if (!existsSync(p)) return [];
    const raw = await readFile(p, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const tokens = [];
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      if (row.isAdmin !== true) continue;
      const ft = row.fcmToken;
      if (typeof ft === "string" && ft.trim().length > 0) tokens.push(ft.trim());
    }
    return [...new Set(tokens)];
  } catch (e) {
    console.error("[server] readAdminStaffFcmTokensFromStaffMaster", e);
    return [];
  }
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
 * 登録済みの全トークンへ（全スタッフ）
 * fcm-tokens.json と master-staff-v1.json の fcmToken をマージし、重複は1回だけ送信
 * @param {string} dataDir
 * @param {string} title
 * @param {string} body
 */
export async function notifyAllStaff(dataDir, title, body) {
  if (!appsReady()) return;
  const store = await readFcmTokensStore(dataDir);
  const fromTokenFile = collectAllTokensFromStore(store);
  const fromStaffMaster = await readAllStaffFcmTokensFromStaffMaster(dataDir);
  const tokens = [...new Set([...fromTokenFile, ...fromStaffMaster])];
  if (tokens.length === 0) {
    console.warn("[server] FCM notifyAllStaff: no tokens");
    return;
  }
  const r = await sendFcmToTokens(tokens, title, body);
  console.log("[server] FCM all-staff notify:", r);
}

/**
 * スタッフ名に紐づくトークンへ
 * @param {string[]} staffNames
 * @param {string} dataDir
 * @param {string} title
 * @param {string} body
 */
export async function notifyStaffByNames(staffNames, dataDir, title, body) {
  if (!appsReady()) return;
  const store = await readFcmTokensStore(dataDir);
  const tokens = collectTokensForStaffNames(staffNames, store);
  if (tokens.length === 0) {
    console.warn("[server] FCM notifyStaffByNames: no tokens for", staffNames);
    return;
  }
  const r = await sendFcmToTokens(tokens, title, body);
  console.log("[server] FCM staff-by-name notify:", r);
}

/**
 * スタッフマスター（isAdmin + 端末登録 fcmToken）へ管理者向け通知
 * @param {string} dataDir
 * @param {string} title
 * @param {string} body
 */
export async function notifyAdminRecipients(dataDir, title, body) {
  if (!appsReady()) return;
  const tokens = await readAdminStaffFcmTokensFromStaffMaster(dataDir);
  if (tokens.length === 0) {
    console.warn(
      "[server] FCM notifyAdminRecipients: no admin staff fcmToken in master-staff-v1"
    );
    return;
  }
  const r = await sendFcmToTokens(tokens, title, body);
  console.log("[server] FCM admin notify:", r);
}
