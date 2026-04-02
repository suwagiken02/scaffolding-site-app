/**
 * Google マップの URL / リダイレクト後の URL / HTML 断片から緯度経度を抽出する。
 * 対応例:
 * - https://maps.google.com/maps?q=35.68,139.76
 * - .../place/...@35.995004,138.150585,17z/...（@ 直後の lat,lng）
 * - !3d35.123!4d138.456 / &ll= / &center=
 * - 短縮 URL は fetch でリダイレクト先・本文をたどって解析
 */

export type LatLng = { lat: number; lng: number };

function isValidLat(n: number): boolean {
  return Number.isFinite(n) && n >= -90 && n <= 90;
}

function isValidLng(n: number): boolean {
  return Number.isFinite(n) && n >= -180 && n <= 180;
}

function tryPair(a: string, b: string): LatLng | null {
  const lat = parseFloat(a);
  const lng = parseFloat(b);
  if (!isValidLat(lat) || !isValidLng(lng)) return null;
  return { lat, lng };
}

/** @ の直後の「緯度,経度」（ズームや data= が続く場合あり） */
const AT_LAT_LNG_RE =
  /@([+-]?\d+(?:\.\d+)?),([+-]?\d+(?:\.\d+)?)(?:[,/]|$|[^0-9.+-])/g;

/** q パラメータ値が「座標2値のみ」のとき */
function tryLatLngFromQValue(qRaw: string): LatLng | null {
  let q = qRaw.trim();
  try {
    q = decodeURIComponent(q.replace(/\+/g, " "));
  } catch {
    /* keep */
  }
  const coordOnly =
    /^([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)$/.exec(q.trim());
  if (coordOnly) return tryPair(coordOnly[1], coordOnly[2]);
  return null;
}

/** 文字列全体から複数パターンで座標を探す（最初の有効値） */
export function extractLatLngFromGoogleMapsText(text: string): LatLng | null {
  if (!text || typeof text !== "string") return null;

  let s = text;
  try {
    s = decodeURIComponent(text);
  } catch {
    s = text;
  }

  // @lat,lng（例: /place/...@35.995004,138.150585,17z/）
  let m: RegExpExecArray | null;
  AT_LAT_LNG_RE.lastIndex = 0;
  while ((m = AT_LAT_LNG_RE.exec(s)) !== null) {
    const p = tryPair(m[1], m[2]);
    if (p) return p;
  }

  // ?q= &q=（座標のみ）
  const qParam = /[?&]q=([^&]+)/i.exec(s);
  if (qParam) {
    const fromQ = tryLatLngFromQValue(qParam[1]);
    if (fromQ) return fromQ;
  }

  // !3d35.123!4d138.456（モバイル共有URLなど）
  const d34 = /!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/gi;
  while ((m = d34.exec(s)) !== null) {
    const p = tryPair(m[1], m[2]);
    if (p) return p;
  }

  // ll=lat,lng
  const ll = /[?&]ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/i.exec(s);
  if (ll) {
    const p = tryPair(ll[1], ll[2]);
    if (p) return p;
  }

  // center=lat,lng
  const center = /[?&]center=(-?\d+\.?\d*),(-?\d+\.?\d*)/i.exec(s);
  if (center) {
    const p = tryPair(center[1], center[2]);
    if (p) return p;
  }

  return null;
}

function looksLikeGoogleShortUrl(url: string): boolean {
  return /^https?:\/\/(goo\.gl\/maps|maps\.app\.goo\.gl)\b/i.test(url.trim());
}

/** ブラウザから直接取得を試みる長い Google マップ URL（CORS で失敗しうる） */
function looksLikeGoogleMapsPageUrl(url: string): boolean {
  return /https?:\/\/(www\.)?(maps\.google\.[^/]+\/maps|google\.[^/]+\/maps)\b/i.test(
    url.trim()
  );
}

/**
 * 入力URLからピン用座標を得る。
 * 短縮URL・maps.google / google.com/maps は fetch でリダイレクト先・本文をたどって解析（CORS等で失敗しうる）。
 */
export async function resolveGoogleMapsUrlForPin(
  input: string
): Promise<LatLng | null> {
  const t = input.trim();
  if (!t) return null;

  const direct = extractLatLngFromGoogleMapsText(t);
  if (direct) return direct;

  if (!looksLikeGoogleShortUrl(t) && !looksLikeGoogleMapsPageUrl(t)) {
    return null;
  }

  try {
    const res = await fetch(t, {
      method: "GET",
      redirect: "follow",
      mode: "cors",
      credentials: "omit",
    });
    const fromFinal = extractLatLngFromGoogleMapsText(res.url);
    if (fromFinal) return fromFinal;
    const html = await res.text();
    return extractLatLngFromGoogleMapsText(html);
  } catch {
    return null;
  }
}
