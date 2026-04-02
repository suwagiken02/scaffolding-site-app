import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import multer from "multer";
import nodemailer from "nodemailer";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { basename, dirname, join } from "node:path";
import {
  initFirebaseAdminIfPossible,
  isFcmConfigured,
  notifyAdminRecipients,
  notifyAllStaff,
  notifyStaffByNames,
  readFcmTokensStore,
  registerFcmToken,
} from "./fcm.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envPathCandidates = [
  join(__dirname, ".env"),
  join(process.cwd(), "server", ".env"),
];
const envPath = envPathCandidates.find((p) => existsSync(p)) ?? envPathCandidates[0];
const envResult = dotenv.config({ path: envPath });

console.log("[mail-server] dotenv path:", envPath);
console.log("[mail-server] dotenv loaded:", !envResult.error);
if (envResult.error) {
  console.log("[mail-server] dotenv message:", envResult.error.message);
}

const PORT = Number(process.env.PORT) || 3001;
const GMAIL_USER = process.env.GMAIL_USER?.trim();
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, "");
const MAIL_FROM_NAME = process.env.MAIL_FROM_NAME || "足場現場管理";

console.log(
  "[mail-server] GMAIL_USER:",
  GMAIL_USER ? `${GMAIL_USER.slice(0, 4)}…@${GMAIL_USER.split("@")[1] ?? "?"}` : "(未設定)"
);
console.log(
  "[mail-server] GMAIL_APP_PASSWORD:",
  GMAIL_APP_PASSWORD ? `(設定あり・${GMAIL_APP_PASSWORD.length}文字)` : "(未設定)"
);

const app = express();
app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);
app.use(express.json({ limit: "256kb" }));

// ---- Persistent data dir (FCM tokens, JSON stores) — before routes that need DATA_DIR ----
const DATA_DIR =
  process.env.NODE_ENV === "production" ? "/var/data" : join(__dirname, "data");
try {
  mkdirSync(DATA_DIR, { recursive: true });
} catch {
  // ignore
}
console.log("[server] data dir:", DATA_DIR);
console.log(
  "[server] R2 photo upload:",
  process.env.R2_BUCKET_NAME?.trim() && process.env.R2_PUBLIC_BASE_URL?.trim()
    ? "bucket + public URL 設定あり"
    : "R2_BUCKET_NAME / R2_PUBLIC_BASE_URL を確認（写真API用）"
);
initFirebaseAdminIfPossible();

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
      return;
    }
    cb(new Error("画像ファイルのみアップロードできます。"));
  },
});

const payslipUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const n = String(file.originalname ?? "").toLowerCase();
    if (
      file.mimetype === "application/pdf" ||
      n.endsWith(".pdf")
    ) {
      cb(null, true);
      return;
    }
    cb(new Error("PDFファイルのみアップロードできます。"));
  },
});

/** 現場書類（PDF / JPG / PNG）→ sites/{siteId}/documents/ */
const siteDocumentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const m = file.mimetype;
    if (
      m === "image/jpeg" ||
      m === "image/jpg" ||
      m === "image/png" ||
      m === "application/pdf"
    ) {
      cb(null, true);
      return;
    }
    cb(new Error("PDF・JPG・PNGのみアップロードできます。"));
  },
});

const WORK_KINDS_JA = ["組み", "払い", "その他", "常用作業"];

function extFromMime(mime) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  return "jpg";
}

/** @type {S3Client | null} */
let r2ClientCache = null;

function getR2Client() {
  if (r2ClientCache) return r2ClientCache;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const endpoint = process.env.R2_ENDPOINT?.trim();
  if (!accessKeyId || !secretAccessKey || !endpoint) return null;
  r2ClientCache = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
  return r2ClientCache;
}

app.post(
  "/api/photos/upload",
  (req, res, next) => {
    photoUpload.single("file")(req, res, (err) => {
      if (err) {
        const msg = err instanceof Error ? err.message : "アップロードエラー";
        res.status(400).json({ ok: false, error: msg });
        return;
      }
      next();
    });
  },
  async (req, res) => {
    const bucket = process.env.R2_BUCKET_NAME?.trim();
    const publicBaseRaw = process.env.R2_PUBLIC_BASE_URL?.trim() ?? "";
    const publicBase = publicBaseRaw.replace(/\/$/, "");

    if (!getR2Client() || !bucket) {
      res.status(503).json({
        ok: false,
        error:
          "R2 の環境変数（R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_ENDPOINT / R2_BUCKET_NAME）が不足しています。",
      });
      return;
    }
    if (!publicBase) {
      res.status(503).json({
        ok: false,
        error:
          "R2_PUBLIC_BASE_URL が未設定です。R2 の公開アクセス用URL（末尾スラッシュなし）を設定してください。",
      });
      return;
    }
    if (!req.file?.buffer) {
      res.status(400).json({ ok: false, error: "ファイルがありません。" });
      return;
    }

    const siteId = String(req.body?.siteId ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
    const safeSiteId = siteId || "unknown";
    const wk = req.body?.workKind;
    const workKind = WORK_KINDS_JA.includes(wk) ? wk : "組み";
    const dk = req.body?.dateKey;
    if (typeof dk !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dk)) {
      res.status(400).json({ ok: false, error: "dateKey が不正です。" });
      return;
    }

    const ext = extFromMime(req.file.mimetype);
    const key = `sites/${safeSiteId}/${workKind}/${dk}/${randomUUID()}.${ext}`;

    try {
      const client = getR2Client();
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: req.file.buffer,
          ContentType: req.file.mimetype || "image/jpeg",
        })
      );
    } catch (e) {
      console.error("[server] R2 PutObject failed:", e);
      res.status(500).json({ ok: false, error: "ストレージへの保存に失敗しました。" });
      return;
    }

    const url = `${publicBase}/${key}`;

    res.json({ ok: true, url, key });
  }
);

function safeDocumentObjectName(originalName) {
  const base = basename(String(originalName || "document"));
  const cleaned = base.replace(/[/\\]/g, "").replace(/^\.+/, "").trim();
  if (!cleaned) return "document";
  return cleaned.slice(0, 180);
}

function documentContentType(mime, originalName) {
  const m = String(mime || "");
  if (m === "image/jpeg" || m === "image/jpg") return "image/jpeg";
  if (m === "image/png") return "image/png";
  if (m === "application/pdf") return "application/pdf";
  const n = String(originalName).toLowerCase();
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}

app.post(
  "/api/site-documents/upload",
  (req, res, next) => {
    siteDocumentUpload.single("file")(req, res, (err) => {
      if (err) {
        const msg = err instanceof Error ? err.message : "アップロードエラー";
        res.status(400).json({ ok: false, error: msg });
        return;
      }
      next();
    });
  },
  async (req, res) => {
    const bucket = process.env.R2_BUCKET_NAME?.trim();
    const publicBaseRaw = process.env.R2_PUBLIC_BASE_URL?.trim() ?? "";
    const publicBase = publicBaseRaw.replace(/\/$/, "");

    if (!getR2Client() || !bucket) {
      res.status(503).json({
        ok: false,
        error:
          "R2 の環境変数（R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_ENDPOINT / R2_BUCKET_NAME）が不足しています。",
      });
      return;
    }
    if (!publicBase) {
      res.status(503).json({
        ok: false,
        error:
          "R2_PUBLIC_BASE_URL が未設定です。R2 の公開アクセス用URL（末尾スラッシュなし）を設定してください。",
      });
      return;
    }
    if (!req.file?.buffer) {
      res.status(400).json({ ok: false, error: "ファイルがありません。" });
      return;
    }

    const siteId = String(req.body?.siteId ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
    const safeSiteId = siteId || "unknown";
    const objectSuffix = safeDocumentObjectName(req.file.originalname);
    const key = `sites/${safeSiteId}/documents/${randomUUID()}_${objectSuffix}`;

    const ct = documentContentType(req.file.mimetype, req.file.originalname);

    try {
      const client = getR2Client();
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: req.file.buffer,
          ContentType: ct,
        })
      );
    } catch (e) {
      console.error("[server] R2 site-documents PutObject failed:", e);
      res.status(500).json({ ok: false, error: "ストレージへの保存に失敗しました。" });
      return;
    }

    const url = `${publicBase}/${key}`;
    res.json({ ok: true, url, key });
  }
);

app.post("/api/site-documents/delete", async (req, res) => {
  const siteId = String(req.body?.siteId ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
  const key = String(req.body?.key ?? "").trim();
  const expectedPrefix = siteId ? `sites/${siteId}/documents/` : "";

  if (!siteId || !expectedPrefix || !key.startsWith(expectedPrefix) || key.includes("..")) {
    res.status(400).json({ ok: false, error: "不正な要求です。" });
    return;
  }

  const bucket = process.env.R2_BUCKET_NAME?.trim();
  if (!getR2Client() || !bucket) {
    res.status(503).json({
      ok: false,
      error: "R2 が未設定です。",
    });
    return;
  }

  try {
    const client = getR2Client();
    await client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
  } catch (e) {
    console.error("[server] R2 site-documents DeleteObject failed:", e);
    res.status(500).json({ ok: false, error: "ストレージからの削除に失敗しました。" });
    return;
  }

  res.json({ ok: true });
});

// ---- FCM（トークン登録・プッシュ） ----
app.post("/api/fcm-tokens", async (req, res) => {
  try {
    const staffName =
      typeof req.body?.staffName === "string" ? req.body.staffName.trim() : "";
    const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
    if (!staffName || !token) {
      res.status(400).json({ ok: false, error: "staffName と token が必要です。" });
      return;
    }
    await registerFcmToken(DATA_DIR, staffName, token);
    res.json({ ok: true });
  } catch (e) {
    console.error("[server] POST /api/fcm-tokens", e);
    res.status(500).json({ ok: false, error: "save failed" });
  }
});

/** スタッフ名をキーにしたトークン一覧（URL エンコードされた名前を渡す） */
app.get("/api/fcm-tokens/:staffNameEncoded", async (req, res) => {
  try {
    let name = String(req.params.staffNameEncoded ?? "").trim();
    try {
      name = decodeURIComponent(name);
    } catch {
      // そのまま
    }
    if (!name) {
      res.status(400).json({ ok: false, error: "staffName が不正です。" });
      return;
    }
    const store = await readFcmTokensStore(DATA_DIR);
    const tokens = Array.isArray(store[name]) ? store[name] : [];
    res.json({ ok: true, tokens });
  } catch (e) {
    console.error("[server] GET /api/fcm-tokens", e);
    res.status(500).json({ ok: false, error: "read failed" });
  }
});

app.post("/api/fcm-notify/work-start", async (req, res) => {
  try {
    const siteName =
      typeof req.body?.siteName === "string" ? req.body.siteName.trim() : "";
    const workKind =
      typeof req.body?.workKind === "string" ? req.body.workKind.trim() : "";
    if (!siteName || !workKind) {
      res.status(400).json({ ok: false, error: "siteName と workKind が必要です。" });
      return;
    }
    if (!isFcmConfigured()) {
      res.json({ ok: true, skipped: true });
      return;
    }
    await notifyAllStaff(
      DATA_DIR,
      "【作業開始】",
      `${siteName}で${workKind}の作業が開始されました`
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("[server] POST /api/fcm-notify/work-start", e);
    res.status(500).json({ ok: false, error: "notify failed" });
  }
});

app.post("/api/fcm-notify/work-end", async (req, res) => {
  try {
    const siteName =
      typeof req.body?.siteName === "string" ? req.body.siteName.trim() : "";
    const workKind =
      typeof req.body?.workKind === "string" ? req.body.workKind.trim() : "";
    if (!siteName || !workKind) {
      res.status(400).json({ ok: false, error: "siteName と workKind が必要です。" });
      return;
    }
    if (!isFcmConfigured()) {
      res.json({ ok: true, skipped: true });
      return;
    }
    await notifyAllStaff(
      DATA_DIR,
      "【作業終了】",
      `${siteName}で${workKind}の作業が終了しました`
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("[server] POST /api/fcm-notify/work-end", e);
    res.status(500).json({ ok: false, error: "notify failed" });
  }
});

function formatAttendanceTimeJa(iso) {
  try {
    const d = new Date(String(iso));
    if (Number.isNaN(d.getTime())) return String(iso);
    return new Intl.DateTimeFormat("ja-JP", {
      dateStyle: "short",
      timeStyle: "medium",
    }).format(d);
  } catch {
    return String(iso);
  }
}

app.post("/api/fcm-notify/attendance", async (req, res) => {
  try {
    const staffName =
      typeof req.body?.staffName === "string" ? req.body.staffName.trim() : "";
    const punchKind = req.body?.punchKind === "out" ? "out" : "in";
    const timeIso =
      typeof req.body?.timeIso === "string" ? req.body.timeIso.trim() : "";
    if (!staffName || !timeIso) {
      res.status(400).json({ ok: false, error: "staffName と timeIso が必要です。" });
      return;
    }
    if (!isFcmConfigured()) {
      res.json({ ok: true, skipped: true });
      return;
    }
    const label = punchKind === "out" ? "退勤" : "出勤";
    const t = formatAttendanceTimeJa(timeIso);
    await notifyStaffByNames(
      [staffName],
      DATA_DIR,
      "【打刻完了】",
      `${label}の打刻が完了しました（${t}）`
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("[server] POST /api/fcm-notify/attendance", e);
    res.status(500).json({ ok: false, error: "notify failed" });
  }
});

app.post("/api/fcm-notify/external-site", async (req, res) => {
  try {
    const companyName =
      typeof req.body?.companyName === "string" ? req.body.companyName.trim() : "";
    const siteName = typeof req.body?.siteName === "string" ? req.body.siteName.trim() : "";
    if (!companyName || !siteName) {
      res.status(400).json({ ok: false, error: "companyName と siteName が必要です。" });
      return;
    }
    if (!isFcmConfigured()) {
      res.json({ ok: true, skipped: true });
      return;
    }
    await notifyAdminRecipients(
      DATA_DIR,
      "【新規現場】",
      `${companyName}から${siteName}が登録されました`
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("[server] POST /api/fcm-notify/external-site", e);
    res.status(500).json({ ok: false, error: "notify failed" });
  }
});

function safeKeyToPath(key) {
  const raw = String(key ?? "");
  const safe = raw.replace(/[^a-zA-Z0-9._-]/g, "_");
  return join(DATA_DIR, `${safe}.json`);
}

app.get("/api/storage/bulk", async (req, res) => {
  // Return all persisted keys (one file per key).
  const out = {};
  try {
    const files = await readdir(DATA_DIR);
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      const key = f.slice(0, -5);
      try {
        const value = await readFile(join(DATA_DIR, f), "utf8");
        out[key] = String(value);
      } catch {
        // ignore
      }
    }
    res.json(out);
  } catch {
    res.json({});
  }
});

app.get("/api/storage/:key", async (req, res) => {
  const key = req.params.key;
  try {
    const p = safeKeyToPath(key);
    if (!existsSync(p)) {
      res.status(404).json({ ok: false, error: "not found" });
      return;
    }
    const value = await readFile(p, "utf8");
    res.json({ ok: true, value: String(value) });
  } catch (e) {
    res.status(500).json({ ok: false, error: "read failed" });
  }
});

app.put("/api/storage/:key", async (req, res) => {
  const key = req.params.key;
  const value = typeof req.body?.value === "string" ? req.body.value : "";
  try {
    const p = safeKeyToPath(key);
    await writeFile(p, value, "utf8");
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: "write failed" });
  }
});

// ---- 打刻データ（専用 JSON。/var/data/attendance-store.json） ----
const ATTENDANCE_FILE = join(DATA_DIR, "attendance-store.json");
/** 旧: localStorage 同期で保存されていたファイル名 */
const ATTENDANCE_LEGACY_FILE = join(DATA_DIR, "scaffolding-attendance-v1.json");

async function readAttendanceStoreRaw() {
  for (const p of [ATTENDANCE_FILE, ATTENDANCE_LEGACY_FILE]) {
    try {
      if (!existsSync(p)) continue;
      const raw = await readFile(p, "utf8");
      const parsed = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // try next
    }
  }
  return {};
}

async function writeAttendanceStoreJson(store) {
  await writeFile(ATTENDANCE_FILE, JSON.stringify(store), "utf8");
}

app.get("/api/attendance", async (_req, res) => {
  try {
    const store = await readAttendanceStoreRaw();
    res.json({ ok: true, store });
  } catch (e) {
    console.error("[server] GET /api/attendance", e);
    res.status(500).json({ ok: false, error: "read failed" });
  }
});

app.post("/api/attendance", async (req, res) => {
  try {
    const body = req.body;
    if (!body || typeof body !== "object") {
      res.status(400).json({ ok: false, error: "body required" });
      return;
    }

    if (body.action === "delete") {
      const personName = typeof body.personName === "string" ? body.personName : "";
      const dateKey = typeof body.dateKey === "string" ? body.dateKey : "";
      if (!personName || !dateKey) {
        res.status(400).json({ ok: false, error: "personName and dateKey required" });
        return;
      }
      const store = await readAttendanceStoreRaw();
      const prev = store[personName];
      if (prev && typeof prev === "object" && prev[dateKey]) {
        const nextPerson = { ...prev };
        delete nextPerson[dateKey];
        if (Object.keys(nextPerson).length === 0) {
          const nextStore = { ...store };
          delete nextStore[personName];
          await writeAttendanceStoreJson(nextStore);
        } else {
          store[personName] = nextPerson;
          await writeAttendanceStoreJson(store);
        }
      }
      res.json({ ok: true });
      return;
    }

    const personName = typeof body.personName === "string" ? body.personName : "";
    const record = body.record;
    if (!personName || !record || typeof record !== "object") {
      res.status(400).json({ ok: false, error: "personName and record required" });
      return;
    }
    const dateKey = typeof record.dateKey === "string" ? record.dateKey : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      res.status(400).json({ ok: false, error: "record.dateKey invalid" });
      return;
    }

    const store = await readAttendanceStoreRaw();
    const prev = store[personName] && typeof store[personName] === "object" ? store[personName] : {};
    store[personName] = { ...prev, [dateKey]: record };
    await writeAttendanceStoreJson(store);
    res.json({ ok: true });
  } catch (e) {
    console.error("[server] POST /api/attendance", e);
    res.status(500).json({ ok: false, error: "write failed" });
  }
});

// ---- 休暇申請（leave-requests.json + 承認時に master-staff-v1 を更新） ----
const LEAVE_REQUESTS_FILE = join(DATA_DIR, "leave-requests.json");
const STAFF_STORAGE_FILE = join(DATA_DIR, "master-staff-v1.json");
const COMPANY_PROFILE_FILE = join(DATA_DIR, "company-profile-v1.json");

async function readLeaveRequestsFromDisk() {
  try {
    if (!existsSync(LEAVE_REQUESTS_FILE)) return [];
    const raw = await readFile(LEAVE_REQUESTS_FILE, "utf8");
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p : [];
  } catch (e) {
    console.error("[server] readLeaveRequestsFromDisk", e);
    return [];
  }
}

async function writeLeaveRequestsToDisk(list) {
  await writeFile(LEAVE_REQUESTS_FILE, JSON.stringify(list, null, 0), "utf8");
}

async function readStaffMastersFromDisk() {
  try {
    if (!existsSync(STAFF_STORAGE_FILE)) return [];
    const raw = await readFile(STAFF_STORAGE_FILE, "utf8");
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p : [];
  } catch (e) {
    console.error("[server] readStaffMastersFromDisk", e);
    return [];
  }
}

async function writeStaffMastersToDisk(list) {
  await writeFile(STAFF_STORAGE_FILE, JSON.stringify(list), "utf8");
}

async function readCompanyAdminEmailFromDisk() {
  try {
    if (!existsSync(COMPANY_PROFILE_FILE)) return "";
    const raw = await readFile(COMPANY_PROFILE_FILE, "utf8");
    const p = JSON.parse(raw);
    return typeof p.adminEmail === "string" ? p.adminEmail.trim() : "";
  } catch {
    return "";
  }
}

async function sendMailToRecipients(toList, subject, text) {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) return false;
  const to = Array.isArray(toList)
    ? toList
        .filter((x) => typeof x === "string")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  if (to.length === 0) return false;
  const transport = nodemailer.createTransport({
    service: "gmail",
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });
  await transport.sendMail({
    from: `"${MAIL_FROM_NAME}" <${GMAIL_USER}>`,
    to: to.join(", "),
    subject: String(subject).trim(),
    text: String(text).trim(),
  });
  return true;
}

app.get("/api/leave-requests", async (_req, res) => {
  try {
    const list = await readLeaveRequestsFromDisk();
    list.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    res.json({ ok: true, list });
  } catch (e) {
    console.error("[server] GET /api/leave-requests", e);
    res.status(500).json({ ok: false, error: "read failed" });
  }
});

app.post("/api/leave-requests", async (req, res) => {
  try {
    const body = req.body ?? {};
    const staffId = typeof body.staffId === "string" ? body.staffId.trim() : "";
    const staffName = typeof body.staffName === "string" ? body.staffName.trim() : "";
    const kind = body.kind === "birthday" ? "birthday" : body.kind === "paid" ? "paid" : "";
    const startDate = typeof body.startDate === "string" ? body.startDate.trim() : "";
    const endDate = typeof body.endDate === "string" ? body.endDate.trim() : "";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const days = typeof body.days === "number" && Number.isFinite(body.days) ? body.days : NaN;

    if (!staffId || !staffName || !kind) {
      res.status(400).json({ ok: false, error: "staffId, staffName, kind が必要です。" });
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      res.status(400).json({ ok: false, error: "開始日・終了日は YYYY-MM-DD 形式で指定してください。" });
      return;
    }
    if (!(days > 0)) {
      res.status(400).json({ ok: false, error: "日数は正の数で指定してください。" });
      return;
    }
    if (startDate > endDate) {
      res.status(400).json({ ok: false, error: "終了日は開始日以降にしてください。" });
      return;
    }

    const request = {
      id: randomUUID(),
      staffId,
      staffName,
      kind,
      startDate,
      endDate,
      days,
      reason,
      status: "pending",
      createdAt: new Date().toISOString(),
      decidedAt: null,
    };

    const list = await readLeaveRequestsFromDisk();
    list.push(request);
    await writeLeaveRequestsToDisk(list);

    const adminEmail = await readCompanyAdminEmailFromDisk();
    if (adminEmail) {
      const kindJa = kind === "paid" ? "有給休暇" : "誕生日休暇";
      const textBody = [
        `${staffName}さんから休暇申請が届きました。`,
        "",
        `種別: ${kindJa}`,
        `期間: ${startDate} ～ ${endDate}`,
        `日数: ${days} 日`,
        reason ? `理由: ${reason}` : "",
        "",
        `申請ID: ${request.id}`,
      ]
        .filter(Boolean)
        .join("\n");
      try {
        await sendMailToRecipients([adminEmail], `【休暇申請】${staffName}さん`, textBody);
      } catch (e) {
        console.error("[server] leave-request notify admin mail", e);
      }
    }

    if (isFcmConfigured()) {
      try {
        await notifyAdminRecipients(
          DATA_DIR,
          "【休暇申請】",
          `${staffName}から申請が届きました`
        );
      } catch (e) {
        console.error("[server] FCM leave-request notify", e);
      }
    }

    res.json({ ok: true, request });
  } catch (e) {
    console.error("[server] POST /api/leave-requests", e);
    res.status(500).json({ ok: false, error: "write failed" });
  }
});

app.post("/api/leave-requests/:id/decide", async (req, res) => {
  try {
    const id = String(req.params.id ?? "").trim();
    const action = req.body?.action === "reject" ? "reject" : req.body?.action === "approve" ? "approve" : "";
    if (!id || !action) {
      res.status(400).json({ ok: false, error: "action（approve / reject）が必要です。" });
      return;
    }

    const list = await readLeaveRequestsFromDisk();
    const idx = list.findIndex((r) => r && r.id === id);
    if (idx < 0) {
      res.status(404).json({ ok: false, error: "申請が見つかりません。" });
      return;
    }
    const row = list[idx];
    if (row.status !== "pending") {
      res.status(400).json({ ok: false, error: "すでに処理済みの申請です。" });
      return;
    }

    const decidedAt = new Date().toISOString();
    const nextRow = { ...row, decidedAt };

    if (action === "reject") {
      nextRow.status = "rejected";
      list[idx] = nextRow;
      await writeLeaveRequestsToDisk(list);

      const staffList = await readStaffMastersFromDisk();
      const staff = staffList.find((s) => s && s.id === row.staffId);
      const em = staff && typeof staff.email === "string" ? staff.email.trim() : "";
      if (em) {
        const kindJa = row.kind === "paid" ? "有給休暇" : "誕生日休暇";
        const textBody = [
          `${row.staffName}さん`,
          "",
          "休暇申請が否認されました。",
          "",
          `種別: ${kindJa}`,
          `期間: ${row.startDate} ～ ${row.endDate}`,
          `日数: ${row.days} 日`,
        ].join("\n");
        try {
          await sendMailToRecipients([em], "【休暇申請】否認のお知らせ", textBody);
        } catch (e) {
          console.error("[server] leave reject mail", e);
        }
      }

      if (isFcmConfigured()) {
        try {
          await notifyStaffByNames(
            [row.staffName],
            DATA_DIR,
            "【休暇申請】",
            "否認されました"
          );
        } catch (e) {
          console.error("[server] FCM leave reject", e);
        }
      }

      res.json({ ok: true, request: nextRow });
      return;
    }

    // approve
    const staffList = await readStaffMastersFromDisk();
    const sidx = staffList.findIndex((s) => s && s.id === row.staffId);
    if (sidx < 0) {
      res.status(400).json({ ok: false, error: "スタッフマスターに該当者がいません。" });
      return;
    }
    const staff = { ...staffList[sidx] };
    const dateKey = row.startDate;
    const useDays = row.days;
    if (row.kind === "paid") {
      const arr = Array.isArray(staff.paidLeaveUsages) ? [...staff.paidLeaveUsages] : [];
      arr.push({ dateKey, days: useDays });
      staff.paidLeaveUsages = arr;
    } else {
      const arr = Array.isArray(staff.birthdayLeaveUsages) ? [...staff.birthdayLeaveUsages] : [];
      arr.push({ dateKey, days: useDays });
      staff.birthdayLeaveUsages = arr;
    }
    staffList[sidx] = staff;
    await writeStaffMastersToDisk(staffList);

    nextRow.status = "approved";
    list[idx] = nextRow;
    await writeLeaveRequestsToDisk(list);

    const em = typeof staff.email === "string" ? staff.email.trim() : "";
    if (em) {
      const kindJa = row.kind === "paid" ? "有給休暇" : "誕生日休暇";
      const textBody = [
        `${row.staffName}さん`,
        "",
        "休暇申請が承認されました。有給・誕生日休暇の使用として記録されました。",
        "",
        `種別: ${kindJa}`,
        `期間: ${row.startDate} ～ ${row.endDate}`,
        `日数: ${row.days} 日`,
      ].join("\n");
      try {
        await sendMailToRecipients([em], "【休暇申請】承認のお知らせ", textBody);
      } catch (e) {
        console.error("[server] leave approve mail", e);
      }
    }

    if (isFcmConfigured()) {
      try {
        await notifyStaffByNames(
          [row.staffName],
          DATA_DIR,
          "【休暇申請】",
          "承認されました"
        );
      } catch (e) {
        console.error("[server] FCM leave approve", e);
      }
    }

    res.json({ ok: true, request: nextRow });
  } catch (e) {
    console.error("[server] POST /api/leave-requests/:id/decide", e);
    res.status(500).json({ ok: false, error: "update failed" });
  }
});

// ---- 給与明細（R2: payslips/{個人コード}/{ファイル名} + payslips-index.json） ----
const PAYSLIPS_INDEX_FILE = join(DATA_DIR, "payslips-index.json");

function normalizePersonalCode6Server(s) {
  const d = String(s ?? "").replace(/\D/g, "").slice(0, 6);
  return d.padStart(6, "0");
}

function parsePayslipFileName(originalName) {
  const base = basename(String(originalName)).trim();
  const m = /^(\d{8})(\d{6})\.pdf$/i.exec(base);
  if (!m) return null;
  return { yyyymmdd: m[1], code6: m[2] };
}

function yyyymmddToYearMonth(yyyymmdd) {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}`;
}

async function readPayslipsFromDisk() {
  try {
    if (!existsSync(PAYSLIPS_INDEX_FILE)) return [];
    const raw = await readFile(PAYSLIPS_INDEX_FILE, "utf8");
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p : [];
  } catch (e) {
    console.error("[server] readPayslipsFromDisk", e);
    return [];
  }
}

async function writePayslipsToDisk(list) {
  await writeFile(PAYSLIPS_INDEX_FILE, JSON.stringify(list, null, 0), "utf8");
}

async function r2DeleteObjectKey(key) {
  const bucket = process.env.R2_BUCKET_NAME?.trim();
  if (!getR2Client() || !bucket) return false;
  try {
    const client = getR2Client();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (e) {
    console.error("[server] R2 DeleteObject failed:", e);
    return false;
  }
}

app.get("/api/payslips", async (_req, res) => {
  try {
    const list = await readPayslipsFromDisk();
    list.sort((a, b) => String(b.uploadedAt || "").localeCompare(String(a.uploadedAt || "")));
    res.json({ ok: true, list });
  } catch (e) {
    console.error("[server] GET /api/payslips", e);
    res.status(500).json({ ok: false, error: "read failed" });
  }
});

app.get("/api/payslips/staff/:staffId", async (req, res) => {
  try {
    const staffId = String(req.params.staffId ?? "").trim();
    if (!staffId) {
      res.status(400).json({ ok: false, error: "staffId が不正です。" });
      return;
    }
    const list = await readPayslipsFromDisk();
    const filtered = list.filter((r) => r && r.staffId === staffId);
    filtered.sort((a, b) => String(b.uploadedAt || "").localeCompare(String(a.uploadedAt || "")));
    res.json({ ok: true, list: filtered });
  } catch (e) {
    console.error("[server] GET /api/payslips/staff", e);
    res.status(500).json({ ok: false, error: "read failed" });
  }
});

app.post(
  "/api/payslips/upload",
  (req, res, next) => {
    payslipUpload.array("files", 100)(req, res, (err) => {
      if (err) {
        const msg = err instanceof Error ? err.message : "アップロードエラー";
        res.status(400).json({ ok: false, error: msg });
        return;
      }
      next();
    });
  },
  async (req, res) => {
    const bucket = process.env.R2_BUCKET_NAME?.trim();
    const publicBaseRaw = process.env.R2_PUBLIC_BASE_URL?.trim() ?? "";
    const publicBase = publicBaseRaw.replace(/\/$/, "");

    if (!getR2Client() || !bucket) {
      res.status(503).json({
        ok: false,
        error:
          "R2 の環境変数（R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_ENDPOINT / R2_BUCKET_NAME）が不足しています。",
      });
      return;
    }
    if (!publicBase) {
      res.status(503).json({
        ok: false,
        error:
          "R2_PUBLIC_BASE_URL が未設定です。R2 の公開アクセス用URL（末尾スラッシュなし）を設定してください。",
      });
      return;
    }

    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length === 0) {
      res.status(400).json({ ok: false, error: "PDFファイルを選択してください。" });
      return;
    }

    const staffList = await readStaffMastersFromDisk();
    let index = await readPayslipsFromDisk();
    const results = [];

    for (const file of files) {
      if (!file?.buffer) {
        results.push({ originalName: file?.originalname ?? "", ok: false, error: "ファイルがありません。" });
        continue;
      }
      const safeBase = basename(String(file.originalname ?? ""));
      const parsed = parsePayslipFileName(safeBase);
      if (!parsed) {
        results.push({
          originalName: safeBase,
          ok: false,
          error: "ファイル名は「年月日8桁＋個人コード6桁.pdf」（例：20260331000001.pdf）にしてください。",
        });
        continue;
      }
      const code6 = parsed.code6;
      const staff = staffList.find(
        (s) => s && normalizePersonalCode6Server(s.personalCode) === code6
      );
      if (!staff || !staff.id) {
        results.push({
          originalName: safeBase,
          ok: false,
          error: `個人コード ${code6} に該当するスタッフが見つかりません。マスターで個人コードを登録してください。`,
        });
        continue;
      }
      const staffName = typeof staff.name === "string" ? staff.name.trim() : "";
      const r2Key = `payslips/${code6}/${safeBase}`;

      const dup = index.filter((r) => r && r.r2Key === r2Key);
      for (const d of dup) {
        await r2DeleteObjectKey(d.r2Key);
      }
      index = index.filter((r) => !r || r.r2Key !== r2Key);

      try {
        const client = getR2Client();
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: r2Key,
            Body: file.buffer,
            ContentType: "application/pdf",
          })
        );
      } catch (e) {
        console.error("[server] payslip R2 PutObject failed:", e);
        results.push({
          originalName: safeBase,
          ok: false,
          error: "ストレージへの保存に失敗しました。",
        });
        continue;
      }

      const yearMonth = yyyymmddToYearMonth(parsed.yyyymmdd);
      const url = `${publicBase}/${r2Key}`;
      const uploadedAt = new Date().toISOString();
      const record = {
        id: randomUUID(),
        staffId: staff.id,
        staffName,
        personalCode: code6,
        fileName: safeBase,
        dateKeyYyyymmdd: parsed.yyyymmdd,
        yearMonth,
        url,
        r2Key,
        uploadedAt,
      };
      index.push(record);
      await writePayslipsToDisk(index);

      results.push({ originalName: safeBase, ok: true, url, id: record.id });

      const [y, mo] = yearMonth.split("-");
      const monthJa = mo ? `${y}年${parseInt(mo, 10)}月` : yearMonth;

      const em = typeof staff.email === "string" ? staff.email.trim() : "";
      if (em) {
        const textBody = `${monthJa}分の給与明細がアップロードされました。個人ページからご確認ください。`;
        try {
          await sendMailToRecipients([em], "【給与明細】アップロードのお知らせ", textBody);
        } catch (e) {
          console.error("[server] payslip notify mail", e);
        }
      }

      if (isFcmConfigured()) {
        try {
          const nm =
            typeof staff.name === "string" ? staff.name.trim() : "";
          if (nm) {
            await notifyStaffByNames(
              [nm],
              DATA_DIR,
              "【給与明細】",
              `${monthJa}分がアップロードされました`
            );
          }
        } catch (e) {
          console.error("[server] FCM payslip notify", e);
        }
      }
    }

    res.json({ ok: true, results });
  }
);

app.delete("/api/payslips/:id", async (req, res) => {
  try {
    const id = String(req.params.id ?? "").trim();
    if (!id) {
      res.status(400).json({ ok: false, error: "id が不正です。" });
      return;
    }
    const list = await readPayslipsFromDisk();
    const idx = list.findIndex((r) => r && r.id === id);
    if (idx < 0) {
      res.status(404).json({ ok: false, error: "該当する給与明細がありません。" });
      return;
    }
    const row = list[idx];
    const key = typeof row.r2Key === "string" ? row.r2Key : "";
    if (key) {
      await r2DeleteObjectKey(key);
    }
    list.splice(idx, 1);
    await writePayslipsToDisk(list);
    res.json({ ok: true });
  } catch (e) {
    console.error("[server] DELETE /api/payslips/:id", e);
    res.status(500).json({ ok: false, error: "delete failed" });
  }
});

// ---- Static hosting (Vite dist) ----
// dist is at project root: ../dist (relative to server/)
const DIST_DIR = join(__dirname, "..", "dist");
const hasDist = existsSync(DIST_DIR);
if (process.env.NODE_ENV === "production") {
  console.log("[mail-server] NODE_ENV=production");
}
console.log("[mail-server] dist dir:", DIST_DIR, "exists:", hasDist);

// Serve built assets if present (Render: same service for FE+BE)
if (hasDist) {
  app.use(express.static(DIST_DIR));
}

function normalizeEmails(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((x) => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean);
}

app.post("/api/send-email", async (req, res) => {
  console.log("[mail-server] POST /api/send-email 受信");

  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    console.warn("[mail-server] Gmail 環境変数不足のため 500 を返します");
    res.status(500).json({
      ok: false,
      error: "Gmail の環境変数（GMAIL_USER / GMAIL_APP_PASSWORD）が未設定です。server/.env を確認してください。",
    });
    return;
  }

  const { to, subject, text } = req.body ?? {};
  const recipients = normalizeEmails(to);

  if (typeof subject !== "string" || !subject.trim()) {
    res.status(400).json({ ok: false, error: "件名（subject）が不正です。" });
    return;
  }
  if (typeof text !== "string" || !text.trim()) {
    res.status(400).json({ ok: false, error: "本文（text）が不正です。" });
    return;
  }
  if (recipients.length === 0) {
    res.status(400).json({ ok: false, error: "宛先（to）がありません。" });
    return;
  }

  console.log("[mail-server] 送信試行:", {
    recipients: recipients.length,
    subject: subject.trim().slice(0, 40),
  });

  const transport = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: GMAIL_USER,
      pass: GMAIL_APP_PASSWORD,
    },
  });

  try {
    await transport.sendMail({
      from: `"${MAIL_FROM_NAME}" <${GMAIL_USER}>`,
      to: recipients.join(", "),
      subject: subject.trim(),
      text: text.trim(),
    });
    console.log("[mail-server] sendMail 成功");
    res.json({ ok: true });
  } catch (e) {
    console.error("[mail-server] sendMail 失敗:", e);
    res.status(500).json({
      ok: false,
      error: "メール送信に失敗しました。Gmail 設定やネットワークを確認してください。",
    });
  }
});

// SPA fallback: return dist/index.html for non-API routes
// (Some hosting envs may not set NODE_ENV explicitly.)
if (hasDist) {
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api/")) {
      res.status(404).json({ ok: false, error: "API route not found." });
      return;
    }
    res.sendFile(join(DIST_DIR, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`メールAPI server listening on http://localhost:${PORT}`);
});
