/**
 * Probe whether Scotland Census 2022 UV201 / UV204 / UV205 bulk CSVs
 * (or current NRS equivalents) are downloadable without a login wall.
 * Never invents council figures — writes a status record only.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEST = path.join(ROOT, "data", "raw", "nrs", "uv-bulk-status.json");
const UA = "MigrationExplorer/0.1 (research; OGL reuse; +https://migration.cybush.uk)";

const TARGETS = [
  {
    id: "ukds-uv201",
    table: "UV201",
    theme: "ethnic group",
    url: "https://statistics.ukdataservice.ac.uk/dataset/scotland-s-census-2022-uv201-ethnic-group",
    api: "https://statistics.ukdataservice.ac.uk/api/3/action/package_show?id=scotland-s-census-2022-uv201-ethnic-group",
  },
  {
    id: "ukds-uv204",
    table: "UV204",
    theme: "country of birth",
    url: "https://statistics.ukdataservice.ac.uk/dataset/scotland-s-census-2022-uv204-country-of-birth",
    api: "https://statistics.ukdataservice.ac.uk/api/3/action/package_show?id=scotland-s-census-2022-uv204-country-of-birth",
  },
  {
    id: "ukds-uv205",
    table: "UV205",
    theme: "religion",
    url: "https://statistics.ukdataservice.ac.uk/dataset/scotland-s-census-2022-uv205-religion",
    api: "https://statistics.ukdataservice.ac.uk/api/3/action/package_show?id=scotland-s-census-2022-uv205-religion",
  },
  {
    id: "nrs-bulk-multivariate",
    table: null,
    theme: "NRS multivariate bulk (not UV univariate)",
    url: "https://www.scotlandscensus.gov.uk/documents/bulk-download-files-multivariate-data/",
  },
];

async function fetchOnce(url, { timeoutMs = 20000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/json;q=0.9,*/*;q=0.8" },
      redirect: "follow",
      signal: ctrl.signal,
    });
    const ct = res.headers.get("content-type") || "";
    const text = await res.text();
    return { ok: res.ok, status: res.status, contentType: ct, bytes: text.length, text };
  } catch (err) {
    return { ok: false, status: 0, contentType: "", bytes: 0, text: "", error: String(err.message || err) };
  } finally {
    clearTimeout(t);
  }
}

function parseUkdsResources(text) {
  try {
    const json = JSON.parse(text);
    const resources = json?.result?.resources || [];
    return resources.map((r) => ({
      name: r.name || r.description || "",
      format: r.format || "",
      url: r.url || "",
      datastoreActive: Boolean(r.datastore_active),
      state: r.state || "",
      pending: /pending/i.test(`${r.name || ""} ${r.description || ""} ${r.state || ""}`),
    }));
  } catch {
    return null;
  }
}

function htmlLooksPending(text) {
  const t = String(text || "");
  const pending = (t.match(/datastore pending|csv datastore pending/gi) || []).length;
  const login = /sign in|log in|create an account|uk data service account/i.test(t);
  return { pendingHits: pending, loginWall: login, mentionsUv: /UV20[145]/i.test(t) };
}

async function main() {
  const probes = [];
  let bulkCsvAvailable = false;

  for (const target of TARGETS) {
    const rec = {
      id: target.id,
      table: target.table,
      theme: target.theme,
      url: target.url,
      http: null,
      apiHttp: null,
      resources: null,
      notes: [],
      downloadableWithoutLogin: false,
    };

    if (target.api) {
      const api = await fetchOnce(target.api);
      rec.apiHttp = { status: api.status, ok: api.ok, bytes: api.bytes, error: api.error || null };
      const resources = api.ok ? parseUkdsResources(api.text) : null;
      rec.resources = resources;
      if (resources?.length) {
        const ready = resources.filter((r) => r.url && !r.pending && /csv/i.test(r.format || r.url));
        rec.downloadableWithoutLogin = ready.length > 0;
        if (ready.length) bulkCsvAvailable = true;
        else rec.notes.push("CKAN lists resources but none are ready CSV downloads (still pending or empty URL).");
      } else if (!api.ok) {
        rec.notes.push(`UKDS CKAN API ${api.status || "failed"}${api.error ? ` (${api.error})` : ""} — cannot confirm a public CSV.`);
      }
    }

    const page = await fetchOnce(target.url);
    rec.http = { status: page.status, ok: page.ok, bytes: page.bytes, error: page.error || null };
    if (page.ok) {
      const look = htmlLooksPending(page.text);
      rec.html = look;
      if (look.pendingHits) rec.notes.push(`Page text still says datastore pending (${look.pendingHits} hit(s)).`);
      if (look.loginWall) rec.notes.push("Page mentions a UKDS account / login.");
      if (target.id === "nrs-bulk-multivariate") {
        const hasUv = /UV201|UV204|UV205/i.test(page.text);
        const zips = [...page.text.matchAll(/href="([^"]+\.zip)"/gi)].map((m) => m[1]);
        rec.nrsZips = zips;
        if (!hasUv) {
          rec.notes.push(
            "NRS multivariate bulk page lists Output Area / Civil Parish / Inhabited Island group zips. It does not publish UV201 / UV204 / UV205 council univariate CSVs."
          );
        }
      }
    } else if (page.status === 403) {
      rec.notes.push("HTTP 403 from this environment (WAF/login). Public listings last seen still marked datastore pending — no CSV ingested.");
    } else {
      rec.notes.push(`HTTP ${page.status || "error"} — no bulk CSV retrieved.`);
    }

    probes.push(rec);
  }

  const status = bulkCsvAvailable ? "available" : "blocked";
  const out = {
    title: "Scotland Census 2022 UV201 / UV204 / UV205 bulk probe",
    producer: "UK Data Service / National Records of Scotland",
    probed: new Date().toISOString(),
    status,
    downloadableWithoutLogin: bulkCsvAvailable,
    fallback: "Scotland’s Census 2022 Area Overviews (32 councils) remain the ingested council-level COB / ethnicity / religion source. Categories stay in NRS wording.",
    blocker: bulkCsvAvailable
      ? null
      : "UKDS UV201 / UV204 / UV205 resources are still datastore-pending or not fetchable without a login wall. NRS public bulk zips are multivariate OA/parish/island files, not the UV council univariate tables. No council counts are invented from the pending datastore.",
    urls: {
      uv201: "https://statistics.ukdataservice.ac.uk/dataset/scotland-s-census-2022-uv201-ethnic-group",
      uv204: "https://statistics.ukdataservice.ac.uk/dataset/scotland-s-census-2022-uv204-country-of-birth",
      uv205: "https://statistics.ukdataservice.ac.uk/dataset/scotland-s-census-2022-uv205-religion",
      nrsBulk: "https://www.scotlandscensus.gov.uk/documents/bulk-download-files-multivariate-data/",
      areaOverviews: "https://www.scotlandscensus.gov.uk/search-the-census",
    },
    probes,
  };

  fs.mkdirSync(path.dirname(DEST), { recursive: true });
  fs.writeFileSync(DEST, `${JSON.stringify(out, null, 2)}\n`);
  console.log("wrote", path.relative(ROOT, DEST), out.status);
  if (bulkCsvAvailable) {
    console.log("UV bulk CSVs appear downloadable — add them to download-raw.sh and ingest. Do not silent-merge onto E&W/NI headings.");
  }
}

main().catch((err) => {
  console.error("FAIL scotland UV probe", err.message || err);
  const fallback = {
    title: "Scotland Census 2022 UV201 / UV204 / UV205 bulk probe",
    probed: new Date().toISOString(),
    status: "blocked",
    downloadableWithoutLogin: false,
    blocker: `Probe threw: ${String(err.message || err)}. Area Overviews stay in use; no UV counts invented.`,
    fallback: "Scotland’s Census 2022 Area Overviews remain the council-level source.",
  };
  fs.mkdirSync(path.dirname(DEST), { recursive: true });
  fs.writeFileSync(DEST, `${JSON.stringify(fallback, null, 2)}\n`);
  process.exit(0);
});
