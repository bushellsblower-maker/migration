/**
 * Source-health stamp + optional checksum pin update.
 * Does not invent statistics. Records hash / presence / last OK vs last fail
 * for each feed in data/sources.json.
 *
 *   node scripts/write-source-health.mjs           # rewrite health from current files
 *   node scripts/write-source-health.mjs --ok      # successful refresh (update pins)
 *   node scripts/write-source-health.mjs --fail    # failed refresh (keep last-good pins)
 *   node scripts/write-source-health.mjs --update-pins
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAW = path.join(ROOT, "data", "raw");
const HEALTH = path.join(ROOT, "public", "data", "source-health.json");
const PINS = path.join(ROOT, "data", "checksums.json");
const REFRESH = path.join(ROOT, "public", "data", "refresh-status.json");
const UV = path.join(RAW, "nrs", "uv-bulk-status.json");

const okFlag = process.argv.includes("--ok") || process.env.MIG_REFRESH_OK === "1";
const failFlag = process.argv.includes("--fail") || process.env.MIG_REFRESH_OK === "0";
const updatePins = process.argv.includes("--update-pins") || okFlag;
const success = okFlag && !failFlag;

function readJson(abs, fallback = null) {
  if (!fs.existsSync(abs)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(abs, "utf8"));
  } catch {
    return fallback;
  }
}

function sha256(abs) {
  return crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex");
}

const sources = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "sources.json"), "utf8"));
const prevHealth = readJson(HEALTH, {});
const prevPins = readJson(PINS, { files: {} });
const refresh = readJson(REFRESH, {});
const uv = readJson(UV, null);
const now = new Date().toISOString();

const prevFeeds = new Map((prevHealth.feeds || []).map((f) => [f.id, f]));
const pinFiles = prevPins.files || {};
const nextPins = { ...prevPins, files: { ...pinFiles } };

const feeds = [];
let hashMismatches = 0;
let missingCritical = 0;

for (const src of sources.files) {
  const abs = path.join(RAW, src.dest);
  const present = fs.existsSync(abs) && fs.statSync(abs).size > 0;
  const prev = prevFeeds.get(src.id) || {};
  const rec = {
    id: src.id,
    dest: src.dest,
    producer: src.producer,
    critical: Boolean(src.critical),
    stableUrl: Boolean(src.stableUrl),
    usedFor: src.usedFor || "",
    url: src.url,
    present,
    bytes: present ? fs.statSync(abs).size : 0,
    sha256: present ? sha256(abs) : null,
    pinnedSha256: pinFiles[src.id]?.sha256 || null,
    hashMatch: null,
    status: "unknown",
    lastOk: prev.lastOk || null,
    lastFail: prev.lastFail || null,
    note: "",
  };

  if (!present) {
    rec.status = "missing";
    rec.note = src.critical ? "Critical extract missing." : "Optional extract not present.";
    rec.lastFail = now;
    if (src.critical) missingCritical += 1;
  } else if (rec.pinnedSha256) {
    rec.hashMatch = rec.sha256 === rec.pinnedSha256;
    if (rec.hashMatch) {
      rec.status = "ok";
      rec.note = "Matches pinned last-good hash.";
      rec.lastOk = success || prev.lastOk ? (success ? now : prev.lastOk) : prev.lastOk || now;
    } else {
      rec.status = "hash-changed";
      rec.note = src.stableUrl
        ? "Hash differs from the last ingest-validated pin. Ingest must still parse before the catalog is replaced."
        : "Vintage URL / file content changed versus the last pin. Expected when a producer republishes; ingest is the gate.";
      hashMismatches += 1;
      if (success) rec.lastOk = now;
      else if (failFlag) rec.lastFail = now;
    }
  } else {
    rec.status = "unpinned";
    rec.note = "No pin yet — will be pinned after a successful ingest.";
    rec.hashMatch = null;
    if (success) rec.lastOk = now;
  }

  if (success && present && updatePins) {
    nextPins.files[src.id] = {
      dest: src.dest,
      sha256: rec.sha256,
      bytes: rec.bytes,
      critical: rec.critical,
      stableUrl: rec.stableUrl,
    };
    rec.pinnedSha256 = rec.sha256;
    rec.hashMatch = true;
    rec.status = "ok";
    rec.lastOk = now;
    rec.note = "Pinned after successful ingest.";
  }

  if (failFlag && rec.critical && rec.status === "missing") {
    rec.lastFail = now;
  }

  feeds.push(rec);
}

if (success && updatePins) {
  nextPins.title = "Pinned SHA-256 of last ingest-validated extracts";
  nextPins.note =
    "Pins are last-known-good hashes after a successful ingest. A later download may change a file; ingest must still parse. If ingest fails, the previous catalog and these pins stay.";
  nextPins.updated = now;
  fs.mkdirSync(path.dirname(PINS), { recursive: true });
  fs.writeFileSync(PINS, `${JSON.stringify(nextPins, null, 2)}\n`);
  console.log("updated", path.relative(ROOT, PINS), Object.keys(nextPins.files).length, "pins");
}

const health = {
  generated: now,
  ok: failFlag ? false : success ? true : refresh.ok ?? null,
  lastAttempt: refresh.lastAttempt || now,
  lastSuccess: success ? now : refresh.lastSuccess || prevHealth.lastSuccess || null,
  lastFailure: failFlag ? now : refresh.lastFailure || prevHealth.lastFailure || null,
  source: process.env.GITHUB_ACTIONS === "true" ? "github-actions" : "local",
  workflow: refresh.workflow || "https://github.com/bushellsblower-maker/migration/actions/workflows/refresh.yml",
  workflowRun: refresh.workflowRun || null,
  missingCritical,
  hashMismatches,
  uvBulk: uv
    ? {
        status: uv.status || "unknown",
        downloadableWithoutLogin: Boolean(uv.downloadableWithoutLogin),
        blocker: uv.blocker || null,
        probed: uv.probed || null,
      }
    : { status: "not-probed", downloadableWithoutLogin: false, blocker: "UV probe has not been run.", probed: null },
  note: failFlag
    ? "Last refresh failed. Showing last-good catalog and last-good checksum pins. No invented series."
    : success
      ? "Last refresh finished without a critical download or SCHEMA ERROR. Pins updated to the validated files."
      : "Source health from current working-tree files. Pins are only rewritten on a successful refresh.",
  feeds,
};

fs.mkdirSync(path.dirname(HEALTH), { recursive: true });
fs.writeFileSync(HEALTH, `${JSON.stringify(health, null, 2)}\n`);
console.log("wrote", path.relative(ROOT, HEALTH), health.ok === false ? "FAIL" : health.ok ? "OK" : "STAMP");

if (missingCritical && !failFlag && process.env.MIG_ALLOW_PARTIAL !== "1") {
  console.error("CRITICAL extracts missing:", feeds.filter((f) => f.critical && !f.present).map((f) => f.id).join(", "));
  process.exitCode = 1;
}
