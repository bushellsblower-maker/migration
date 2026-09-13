/**
 * Cymon Audit page-hit helper (Workers Analytics Engine).
 *
 * Copy this file into other Cybush Workers, bind the same dataset, and call
 * `recordAuditHit(request, env, ctx)` at the start of `fetch`.
 */

export const AUDIT_HITS_BINDING = "AUDIT_HITS";
export const AUDIT_HITS_DATASET = "cybush";

export const AUDIT_BOT_SCORE_MAX_BOT = 29;
export const AUDIT_BOT_SCORE_MIN_HUMAN = 30;

export const AUDIT_VISITOR_CLASSES = ["human", "bot", "verified_bot", "unknown"];

const STATIC_EXT =
  /\.(?:js|mjs|cjs|css|map|png|jpe?g|gif|webp|avif|ico|svg|woff2?|ttf|eot|otf|mp4|webm|wasm|txt|xml|json)$/i;

const HEALTH_PATH = /^(?:\/api\/health\/?|\/health\/?|\/ready\/?|\/livez\/?|\/healthz\/?)$/i;

const NOISE_PREFIXES = [
  "/_next/static",
  "/_next/webpack",
  "/_next/image",
  "/favicon",
  "/robots.txt",
  "/sitemap",
  "/.well-known",
  "/cdn-cgi",
  "/assets/",
  "/cymon-fleet/",
];

const CRAWLER_UA = [
  "googlebot",
  "google-inspectiontool",
  "adsbot-google",
  "mediapartners-google",
  "bingbot",
  "slurp",
  "duckduckbot",
  "baiduspider",
  "yandexbot",
  "facebookexternalhit",
  "twitterbot",
  "linkedinbot",
  "applebot",
  "gptbot",
  "chatgpt-user",
  "claudebot",
  "anthropic-ai",
  "bytespider",
  "semrushbot",
  "ahrefsbot",
  "mj12bot",
  "dotbot",
  "petalbot",
  "amazonbot",
  "ia_archiver",
  "screaming frog",
  "discordbot",
  "telegrambot",
];

const HEALTH_PROBE_UA =
  /cloudflare-healthchecks|kube-probe|googlehc|amazon-route53|elb-healthchecker|uptime-kuma|better uptime|uptimerobot|pingdom|statuscake|healthcheck/i;

export function isAuditVisitorClass(value) {
  return AUDIT_VISITOR_CLASSES.includes(value);
}

export function clientIpFromRequest(request) {
  const direct =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("true-client-ip") ||
    request.headers.get("x-real-ip") ||
    "";
  if (direct.trim()) return clip(direct.trim(), 64);
  const forwarded = request.headers.get("x-forwarded-for");
  if (!forwarded) return "";
  const first = forwarded.split(",")[0]?.trim() ?? "";
  return clip(first, 64);
}

export function classifyAuditVisitor(request) {
  const cf = requestCf(request);
  const bm = cf?.botManagement;
  const verified = bm?.verifiedBot === true || cf?.verifiedBot === true;
  if (verified) return "verified_bot";

  const score = typeof bm?.score === "number" && Number.isFinite(bm.score) ? bm.score : null;
  if (score != null && score > 0) {
    if (score <= AUDIT_BOT_SCORE_MAX_BOT) return "bot";
    if (score >= AUDIT_BOT_SCORE_MIN_HUMAN) return "human";
  }

  const ua = request.headers.get("user-agent") ?? "";
  if (looksLikeCrawlerUa(ua)) return "bot";
  return "unknown";
}

export function looksLikeCrawlerUa(ua) {
  const lower = ua.toLowerCase();
  if (!lower) return false;
  return CRAWLER_UA.some((token) => lower.includes(token));
}

export function shouldRecordAuditHit(request) {
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") return false;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return false;
  }

  const path = url.pathname || "/";
  if (isNoisePath(path)) return false;

  const ua = request.headers.get("user-agent") ?? "";
  if (HEALTH_PROBE_UA.test(ua)) return false;

  const dest = (request.headers.get("sec-fetch-dest") ?? "").toLowerCase();
  if (dest) {
    if (dest === "document" || dest === "iframe" || dest === "nested-document") return true;
    return false;
  }

  const accept = (request.headers.get("accept") ?? "").toLowerCase();
  if (!accept || accept === "*/*" || accept.includes("text/html")) return true;
  return false;
}

export function buildAuditHitPoint(request) {
  const url = new URL(request.url);
  const host = url.hostname.trim().toLowerCase();
  const path = clip(url.pathname || "/", 256);
  const ip = clientIpFromRequest(request);
  const visitor = classifyAuditVisitor(request);
  const score = botScore(request);
  return {
    indexes: [host],
    blobs: [path, ip, visitor],
    doubles: [score],
  };
}

export function recordAuditHit(request, env, ctx) {
  try {
    const dataset = env?.AUDIT_HITS;
    if (!dataset || typeof dataset.writeDataPoint !== "function") return;
    if (!shouldRecordAuditHit(request)) return;
    const point = buildAuditHitPoint(request);
    if (!point.indexes[0]) return;
    const write = () => {
      dataset.writeDataPoint(point);
    };
    if (ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(Promise.resolve().then(write));
      return;
    }
    write();
  } catch {
    // soft-fail
  }
}

function isNoisePath(path) {
  const p = path.toLowerCase();
  if (HEALTH_PATH.test(p)) return true;
  if (p.startsWith("/api/")) return true;
  if (NOISE_PREFIXES.some((prefix) => p === prefix || p.startsWith(prefix))) return true;
  if (STATIC_EXT.test(p)) return true;
  return false;
}

function requestCf(request) {
  const cf = request.cf;
  return cf && typeof cf === "object" ? cf : undefined;
}

function botScore(request) {
  const score = requestCf(request)?.botManagement?.score;
  return typeof score === "number" && Number.isFinite(score) ? score : 0;
}

function clip(value, max) {
  return value.length <= max ? value : value.slice(0, max);
}
