import { getRequest } from "@tanstack/react-start/server";

export type Gate = { ok: true } | { ok: false; error: string; retryAfter: number };

const buckets = new Map<string, number[]>();

const BOT_UA =
  /curl|wget|python-requests|scrapy|httpclient|libwww|go-http-client|java\/|php\/|nikto|sqlmap|masscan|zgrab|headlesschrome|phantomjs|puppeteer|playwright|axios\/|node-fetch|undici/i;

function clientIp(req: Request) {
  const h = req.headers;
  const raw =
    h.get("cf-connecting-ip") ||
    h.get("x-real-ip") ||
    (h.get("x-forwarded-for") || "").split(",")[0] ||
    "local";
  return raw.trim().slice(0, 64) || "local";
}

function isBot(req: Request) {
  const ua = req.headers.get("user-agent") || "";
  if (ua.length < 12) return true;
  if (BOT_UA.test(ua)) return true;
  const site = (req.headers.get("sec-fetch-site") || "").toLowerCase();
  if (site === "cross-site") return true;
  return false;
}

function take(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const next = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (next.length >= max) {
    const wait = Math.ceil((next[0] + windowMs - now) / 1000);
    buckets.set(key, next);
    return wait;
  }
  next.push(now);
  buckets.set(key, next);
  return 0;
}

export function gate(route: string, max: number, windowMs: number): Gate {
  const req = getRequest();
  if (!req) return { ok: false, error: "Kapı kapalı.", retryAfter: 15 };
  if (isBot(req)) return { ok: false, error: "Otomatik istek reddedildi.", retryAfter: 60 };
  const ip = clientIp(req);
  const burst = take(`burst:${ip}`, 40, 60_000);
  if (burst) return { ok: false, error: "Çok hızlı. Bir dakika bekle.", retryAfter: burst };
  const wait = take(`${route}:${ip}`, max, windowMs);
  if (wait) return { ok: false, error: "Sınır doldu. Biraz sonra.", retryAfter: wait };
  return { ok: true };
}
