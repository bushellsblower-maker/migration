/**
 * Write data/raw/manifest.json after a download pass.
 * Records size, mtime, and sha256 for every file listed in data/sources.json.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAW = path.join(ROOT, "data", "raw");
const sources = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "sources.json"), "utf8"));

const files = [];
for (const src of sources.files) {
  const abs = path.join(RAW, src.dest);
  const exists = fs.existsSync(abs) && fs.statSync(abs).size > 0;
  const rec = {
    id: src.id,
    dest: src.dest,
    url: src.url,
    producer: src.producer,
    critical: Boolean(src.critical),
    stableUrl: Boolean(src.stableUrl),
    present: exists,
    bytes: exists ? fs.statSync(abs).size : 0,
    mtime: exists ? fs.statSync(abs).mtime.toISOString() : null,
    sha256: null,
  };
  if (exists) {
    rec.sha256 = crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex");
  }
  files.push(rec);
}

const manifest = {
  generated: new Date().toISOString(),
  ogl: sources.ogl,
  files,
  missingCritical: files.filter((f) => f.critical && !f.present).map((f) => f.id),
};

fs.writeFileSync(path.join(RAW, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log("wrote data/raw/manifest.json", manifest.files.length, "entries; missing critical:", manifest.missingCritical.join(", ") || "none");
if (manifest.missingCritical.length) process.exitCode = 1;
