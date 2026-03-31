/**
 * Google マップの URL / リダイレクト後の URL / HTML 断片から緯度経度を抽出する。
 * 対応例: ?q=35.1,138.2 / @35.1,138.2,17z / !3d35.1!4d138.2 / &ll=
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

/** 文字列全体から複数パターンで座標を探す（最初の有効値） */
export function extractLatLngFromGoogleMapsText(text: string): LatLng | null {
  if (!text || typeof text !== "string") return null;

  let s = text;
  try {
    s = decodeURIComponent(text);
  } catch {
    s = text;
  }

  // @lat,lng（zoom 等が続く場合あり）
  const atRe = /@(-?\d+\.\d+|-?\d+),(-?\d+\.\d+|-?\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = atRe.exec(s)) !== null) {
    const p = tryPair(m[1], m[2]);
    if (p) return p;
  }

  // ?q=lat,lng または &q=（座標のみのとき）
  const qParam = /[?&]q=([^&]+)/i.exec(s);
  if (qParam) {
    let q = qParam[1];
    try {
      q = decodeURIComponent(q.replace(/\+/g, " "));
    } catch {
      /* keep */
    }
    const coordOnly = /^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/.exec(q.trim());
    if (coordOnly) {
      const p = tryPair(coordOnly[1], coordOnly[2]);
      if (p) return p;
    }
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

/**
 * 入力URLからピン用座標を得る。
 * 短縮URLは fetch でリダイレクト先・本文をたどって解析（CORS等で失敗しうる）。
 */
export async function resolveGoogleMapsUrlForPin(
  input: string
): Promise<LatLng | null> {
  const t = input.trim();
  if (!t) return null;

  const direct = extractLatLngFromGoogleMapsText(t);
  if (direct) return direct;

  if (!looksLikeGoogleShortUrl(t)) return null;

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
