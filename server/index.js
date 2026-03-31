import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import nodemailer from "nodemailer";
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

// ---- Persistent JSON storage (Render disk /var/data) ----
const DATA_DIR =
  process.env.NODE_ENV === "production" ? "/var/data" : join(__dirname, "data");
try {
  mkdirSync(DATA_DIR, { recursive: true });
} catch {
  // ignore
}
console.log("[server] data dir:", DATA_DIR);

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
