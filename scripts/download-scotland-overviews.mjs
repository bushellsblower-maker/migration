/**
 * Download Scotland’s Census 2022 Area Overviews for the 32 council areas.
 * Official NRS JSON — percentages are copied, not remapped onto E&W groups.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEST = path.join(ROOT, "data", "raw", "nrs", "census2022-area-overviews.json");
const UA = "MigrationExplorer/0.1 (research; OGL reuse; +https://migration.cybush.uk)";
const API = "https://www.scotlandscensus.gov.uk/search-the-census/api/profiles";

const COUNCILS = [
  ["S12000005", "Clackmannanshire"],
  ["S12000006", "Dumfries and Galloway"],
  ["S12000008", "East Ayrshire"],
  ["S12000010", "East Lothian"],
  ["S12000011", "East Renfrewshire"],
  ["S12000013", "Na h-Eileanan Siar"],
  ["S12000014", "Falkirk"],
  ["S12000017", "Highland"],
  ["S12000018", "Inverclyde"],
  ["S12000019", "Midlothian"],
  ["S12000020", "Moray"],
  ["S12000021", "North Ayrshire"],
  ["S12000023", "Orkney Islands"],
  ["S12000026", "Scottish Borders"],
  ["S12000027", "Shetland Islands"],
  ["S12000028", "South Ayrshire"],
  ["S12000029", "South Lanarkshire"],
  ["S12000030", "Stirling"],
  ["S12000033", "Aberdeen City"],
  ["S12000034", "Aberdeenshire"],
  ["S12000035", "Argyll and Bute"],
  ["S12000036", "City of Edinburgh"],
  ["S12000038", "Renfrewshire"],
  ["S12000039", "West Dunbartonshire"],
  ["S12000040", "West Lothian"],
  ["S12000041", "Angus"],
  ["S12000042", "Dundee City"],
  ["S12000045", "East Dunbartonshire"],
  ["S12000047", "Fife"],
  ["S12000048", "Perth and Kinross"],
  ["S12000049", "Glasgow City"],
  ["S12000050", "North Lanarkshire"],
];

function items(profile, subcategoryId) {
  for (const group of profile.profiles || []) {
    for (const sub of group.subProfiles || []) {
      if (sub.subcategoryId !== subcategoryId) continue;
      const out = [];
      for (const it of sub.profileItems || []) {
        const raw = it.dataPoints?.[0]?.value;
        const value = Number(raw);
        if (!Number.isFinite(value)) continue;
        out.push({ label: String(it.label || "").trim(), value });
      }
      return out;
    }
  }
  return [];
}

async function fetchProfile(code) {
  const url = `${API}?year=2022&AreasIds=${encodeURIComponent(`${code}:CA2019:2022`)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${code} HTTP ${res.status}`);
  return res.json();
}

async function main() {
  const force = process.argv.includes("--force") || process.env.FORCE === "1";
  if (fs.existsSync(DEST) && fs.statSync(DEST).size > 1000 && !force) {
    console.log("exists", path.relative(ROOT, DEST));
    return;
  }
  const areas = [];
  for (const [code, name] of COUNCILS) {
    const raw = await fetchProfile(code);
    const cob = items(raw, "EILR_cob");
    const eth = items(raw, "EILR_ethnic");
    const rel = items(raw, "EILR_religion");
    if (cob.length < 4 || eth.length < 4 || rel.length < 4) {
      throw new Error(`${code} ${name}: Area Overview identity tables incomplete`);
    }
    areas.push({
      code,
      name: raw.labels?.[0] || name,
      areaType: "CA2019",
      countryOfBirth: cob,
      ethnicGroup: eth,
      religion: rel,
    });
    console.log("OK", code, raw.labels?.[0] || name);
  }
  if (areas.length !== 32) throw new Error(`expected 32 councils, got ${areas.length}`);
  const out = {
    title: "Scotland’s Census 2022 Area Overviews — council area identity tables",
    producer: "National Records of Scotland / Scotland’s Census",
    license: "OGL v3.0",
    year: 2022,
    geography: "Council Area 2019 (S12, matching ONS LAD December 2021)",
    source: "Scotland’s Census Search the Census Area Overviews API",
    url: "https://www.scotlandscensus.gov.uk/search-the-census",
    api: API,
    equivalentTables: ["UV204 country of birth", "UV201 ethnic group", "UV205 religion"],
    note: "Copied from the official Area Overviews JSON. Percentages are NRS published headings, not remapped onto England & Wales groups. UK-born is Scotland+England+Wales+Northern Ireland only. White is the sum of published White-* headings (includes Irish, Polish, Other White).",
    retrieved: new Date().toISOString(),
    areas,
  };
  fs.mkdirSync(path.dirname(DEST), { recursive: true });
  fs.writeFileSync(DEST, `${JSON.stringify(out, null, 2)}\n`);
  console.log("wrote", path.relative(ROOT, DEST), areas.length, "councils");
}

main().catch((err) => {
  console.error("FAIL scotland area overviews", err.message || err);
  process.exit(1);
});
