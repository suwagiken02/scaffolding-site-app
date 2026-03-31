/**
 * Cloudflare R2 バケットに CORS を設定する（S3 互換 API）
 *
 * 必要な環境変数:
 *   R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET_NAME
 *
 * 実行: npm run set-r2-cors --prefix server
 *   または server ディレクトリで: node scripts/set-r2-cors.mjs
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverRoot = join(__dirname, "..");

for (const p of [
  join(serverRoot, ".env"),
  join(process.cwd(), "server", ".env"),
  join(process.cwd(), ".env"),
]) {
  if (existsSync(p)) {
    dotenv.config({ path: p });
    break;
  }
}

const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
const endpoint = process.env.R2_ENDPOINT?.trim();
const bucket = process.env.R2_BUCKET_NAME?.trim();

if (!accessKeyId || !secretAccessKey || !endpoint || !bucket) {
  console.error(
    "環境変数が不足しています: R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET_NAME"
  );
  process.exit(1);
}

const client = new S3Client({
  region: "auto",
  endpoint,
  credentials: { accessKeyId, secretAccessKey },
});

const corsConfiguration = {
  CORSRules: [
    {
      AllowedOrigins: ["*"],
      AllowedMethods: ["GET", "PUT", "POST"],
      AllowedHeaders: ["*"],
    },
  ],
};

try {
  await client.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: corsConfiguration,
    })
  );
  console.log("CORS をバケットに適用しました:", bucket);
  console.log(JSON.stringify(corsConfiguration, null, 2));
} catch (e) {
  console.error("PutBucketCors に失敗しました:", e?.message ?? e);
  if (e?.$metadata) {
    console.error("メタデータ:", e.$metadata);
  }
  if (e?.name === "AccessDenied") {
    console.error(
      "ヒント: R2 の API トークンにバケット設定（CORS）の変更権限があるか確認してください。ダッシュボードの R2 → バケット → CORS から手動設定も可能です。"
    );
  }
  process.exit(1);
}
