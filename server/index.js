import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import multer from "multer";
import nodemailer from "nodemailer";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

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
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);
app.use(express.json({ limit: "256kb" }));

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

const WORK_KINDS_JA = ["組み", "払い", "その他"];

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

// ---- Persistent JSON storage (Render disk /var/data) ----
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
