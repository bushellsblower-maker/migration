/**
 * Record the last refresh attempt for the site stamp.
 * Does not invent statistics — only timestamps and pass/fail.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEST = path.join(ROOT, "public", "data", "refresh-status.json");
const ok = process.argv.includes("--ok") || process.env.MIG_REFRESH_OK === "1";
const failed = process.argv.includes("--fail") || process.env.MIG_REFRESH_OK === "0";
const success = ok && !failed;

const prev = fs.existsSync(DEST) ? JSON.parse(fs.readFileSync(DEST, "utf8")) : {};
const now = new Date().toISOString();
const runUrl =
  process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : prev.workflowRun || null;

const status = {
  lastAttempt: now,
  lastSuccess: success ? now : prev.lastSuccess || null,
  lastFailure: success ? prev.lastFailure || null : now,
  ok: success,
  source: process.env.GITHUB_ACTIONS === "true" ? "github-actions" : "local",
  workflow: "https://github.com/bushellsblower-maker/migration/actions/workflows/refresh.yml",
  workflowRun: runUrl,
  note: success
    ? "Last refresh finished without a critical download or SCHEMA ERROR. Checksum pins and source-health.json were updated."
    : "Last refresh failed. The published catalog was not overwritten with invented figures. Source health records last OK vs last fail per feed. See the workflow run.",
  sourceHealth: "./source-health.json",
};

fs.mkdirSync(path.dirname(DEST), { recursive: true });
fs.writeFileSync(DEST, `${JSON.stringify(status, null, 2)}\n`);
console.log("wrote", path.relative(ROOT, DEST), status.ok ? "OK" : "FAIL");
