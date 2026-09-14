/**
 * Scotland Census 2022 and NISRA Census 2021 parsers.
 * Numbers are copied from downloaded official workbooks. Categories are
 * kept in the producer’s wording — they are not remapped onto E&W groups.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAW = path.join(ROOT, "data", "raw");

const SCOTLAND_NON_WHITE_HEADING = [
  /mixed or multiple/i,
  /pakistani/i,
  /indian/i,
  /bangladeshi/i,
  /chinese/i,
  /other asian/i,
  /african/i,
  /caribbean or black/i,
  /^arab/i,
  /other ethnic group/i,
];

function readWb(rel) {
  const abs = path.join(RAW, rel);
  if (!fs.existsSync(abs) || fs.statSync(abs).size === 0) return null;
  return XLSX.read(fs.readFileSync(abs), { type: "buffer", cellDates: false });
}

function sheetAoa(wb, name) {
  if (!wb || !wb.Sheets[name]) return [];
  return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "", raw: false });
}

function num(value) {
  if (value === null || value === undefined) return null;
  let s = String(value).trim();
  if (!s || s === ":" || s === "-" || s === "–" || s === "—" || s === "z" || s === "[z]" || s === "*" || /^missing/i.test(s)) {
    return null;
  }
  s = s.replace(/[£$€]/g, "").replace(/,/g, "").replace(/\s/g, "").replace(/%$/, "");
  if (/^\((.+)\)$/.test(s)) s = `-${s.slice(1, -1)}`;
  s = s.replace(/p$/i, "").replace(/r$/i, "");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function yearOf(value) {
  const s = String(value);
  const full = s.match(/(18|19|20)\d{2}/);
  return full ? Number(full[0]) : null;
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").replace(/\[note[^\]]*\]/gi, "").trim();
}

function findHeaderRow(rows, re) {
  return rows.findIndex((r) => re.test(clean(r[0])) || r.some((c) => re.test(clean(c))));
}

function parseCountTable(rows, { startRe, geoCol = 1, nameCol = 0 }) {
  const start = rows.findIndex((r) => startRe.test(clean(r[0])));
  if (start < 0) return { header: [], records: [] };
  const headerIdx = rows.findIndex((r, i) => i > start && /geography code|area code/i.test(clean(r[1] || r[0])));
  const header = (rows[headerIdx] || []).map(clean);
  const records = [];
  for (const row of rows.slice(headerIdx + 1)) {
    const code = clean(row[geoCol]);
    const name = clean(row[nameCol]);
    if (!code || /^(ms-|table |geography)/i.test(name)) break;
    if (!code) continue;
    const rec = { code, name };
    header.forEach((h, i) => {
      if (i <= geoCol) return;
      rec[h] = num(row[i]);
    });
    records.push(rec);
  }
  return { header, records };
}

export function concordanceNotes() {
  return {
    title: "UK nation concordance — do not silent-conflate",
    items: [
      {
        theme: "Census date",
        text: "England & Wales and Northern Ireland censuses were 21 March 2021. Scotland’s Census was 20 March 2022. A UK-wide 2021 census map would be a date mismatch for Scotland.",
      },
      {
        theme: "Country of birth",
        text: "UK-born is the four UK countries as published. NISRA MS-A16 note 3: ‘Europe: Other non-EU’ includes United Kingdom (part not specified) and Ireland (part not specified) — those cells are not added into UK-born here. NRS vital-events United Kingdom rows can include Crown Dependencies (see table notes).",
      },
      {
        theme: "Ethnic group — White",
        text: "E&W 2021 high-level White includes White British, White Irish, Gypsy or Irish Traveller, Roma, and Other White. Scotland’s form also puts Irish, Polish, Gypsy/Traveller, Roma, Showman/Showwoman and Other White under the White heading — but NRS also publishes a ‘minority ethnic’ figure that includes those White minorities. NISRA lists Irish Traveller and Roma as separate columns from White. These three White percentages are not the same category.",
      },
      {
        theme: "Ethnic group — African / Chinese",
        text: "Scotland’s 2022 high-level tick-box groups treat African as its own heading and Chinese as a named Asian group. E&W 2021 presents a five-group roll-up (White / Mixed / Asian / Black / Other). NISRA MS-B01 uses a different intermediate list (Indian, Chinese, Filipino, Pakistani, Black African, …). Groups are shown as published, not forced onto one UK list.",
      },
      {
        theme: "Religion",
        text: "Modern affiliation starts in 2001. The question is voluntary. Scotland does not impute a religion when the question is skipped — ‘Not stated’ is a valid residual (6.2% in 2022). E&W 2021 has a different non-response treatment. Northern Ireland publishes current religion (MS-B19) and a separate ‘religion or religion brought up in’ table (MS-B23). MS-B23 is not mixed into the E&W/Scotland affiliation percentages. MS-B19 has no standalone Muslim column (Muslim is inside Other religions).",
      },
      {
        theme: "Nationality vs national identity",
        text: "APS Table 2.1 is self-reported citizenship (British / non-British). Scotland Figure 9 and NISRA MS-B15 are national identity (feeling of attachment), not passports and not citizenship. They are never written onto the nationality stock layer.",
      },
      {
        theme: "Age × birthplace × sex",
        text: "ONS RM011 is persons only. The published E&W sex split is commissioned table CT21_0433 (sex × single year of age × bespoke country of birth) for England & Wales as a whole — not local authorities. UK-born there is the four UK country columns; ‘Rest of UK; Channel Islands; Isle of Man’ is excluded. Scotland Figure 8 and NISRA MS-A31 are persons. They are not remapped onto CT21_0433 bands or onto each other.",
      },
      {
        theme: "Scotland UV bulk",
        text: "UKDS UV201 / UV204 / UV205 council CSVs were still datastore-pending or not fetchable without a login wall when last probed. NRS multivariate bulk zips are OA/parish/island files, not those UV tables. Council colours stay on Area Overviews. Categories are not silently merged with E&W or NISRA headings.",
      },
    ],
  };
}

export function parseScotlandEilr(rel = "nrs/census2022-eilr-chart-data.xlsx") {
  const wb = readWb(rel);
  if (!wb) return null;

  const religionRows = sheetAoa(wb, "Figure 2");
  const composition = { S: { 2011: [], 2022: [] } };
  const christian = {};
  const none = {};
  const muslim = {};
  for (const row of religionRows) {
    const y = yearOf(row[0]);
    const group = clean(row[1]);
    const pct = num(row[2]);
    if (!y || !group || pct == null) continue;
    composition.S[y] ??= [];
    composition.S[y].push({ group, pct, n: null });
  }
  for (const y of [2011, 2022]) {
    const arr = composition.S[y] || [];
    const chris = arr.filter((g) => /church of scotland|roman catholic|other christian/i.test(g.group));
    const chrisPct = chris.reduce((s, g) => s + (g.pct || 0), 0);
    if (chris.length) christian.S = [...(christian.S || []), { year: y, value: chrisPct, note: "Scotland Census: Church of Scotland + Roman Catholic + Other Christian (not a UK-wide Christian definition)" }];
    const noneG = arr.find((g) => /^no religion$/i.test(g.group));
    if (noneG) none.S = [...(none.S || []), { year: y, value: noneG.pct, note: "Scotland Census current religion; percentages include non-response in the denominator" }];
    const mus = arr.find((g) => /^muslim$/i.test(g.group));
    if (mus) muslim.S = [...(muslim.S || []), { year: y, value: mus.pct, note: "Scotland Census 2022/2011 current religion" }];
  }

  const ethRows = sheetAoa(wb, "Figure 5");
  const whiteShare = {};
  const minorityShare = {};
  const ethComposition = { S: { 2011: [], 2022: [] } };
  for (const row of ethRows) {
    const y = yearOf(row[0]);
    const group = clean(row[1]);
    const pct = num(row[2]);
    if (!y || !group || pct == null) continue;
    ethComposition.S[y] ??= [];
    ethComposition.S[y].push({ group, pct, n: null });
  }
  for (const y of [2011, 2022]) {
    const arr = ethComposition.S[y] || [];
    const nonWhite = arr.filter((g) => SCOTLAND_NON_WHITE_HEADING.some((re) => re.test(g.group)));
    const nonWhitePct = nonWhite.reduce((s, g) => s + (g.pct || 0), 0);
    if (nonWhite.length) {
      whiteShare.S = [
        ...(whiteShare.S || []),
        {
          year: y,
          value: 100 - nonWhitePct,
          note: "Scotland Census White heading (includes Irish, Polish, Gypsy/Traveller, Roma, Showman, Other White). Computed as 100 minus published non-White heading groups in Figure 5. Not E&W high-level White.",
        },
      ];
    }
  }
  const fig4 = sheetAoa(wb, "Figure 4");
  for (const row of fig4) {
    const y = yearOf(row[0]);
    const pct = num(row[1]);
    if (!y || pct == null) continue;
    minorityShare.S = [
      ...(minorityShare.S || []),
      {
        year: y,
        value: pct,
        note: "NRS ‘minority ethnic background’ — includes some White minorities (Irish, Polish, Other White, …). Not the complement of E&W White.",
      },
    ];
  }

  const cobAgeRows = sheetAoa(wb, "Figure 8");
  const cobAgeBands = [];
  const cobTotals = { Scotland: 0, "Rest of UK": 0, Overseas: 0 };
  for (const row of cobAgeRows) {
    const cob = clean(row[0]);
    const age = clean(row[1]);
    const v = num(row[2]);
    if (!v || !/^(Scotland|Rest of UK|Overseas)$/i.test(cob)) continue;
    cobTotals[cob] += v;
    cobAgeBands.push({ band: age, cob, n: v });
  }
  const ukBorn = cobTotals.Scotland + cobTotals["Rest of UK"];
  const nonUk = cobTotals.Overseas;
  const total = ukBorn + nonUk;
  const cobShare = total ? (100 * nonUk) / total : null;
  const cobByAge = [];
  const byBand = {};
  for (const r of cobAgeBands) {
    byBand[r.band] ??= { band: r.band, uk: 0, nonUk: 0, scotland: 0, restUk: 0 };
    if (r.cob === "Overseas") byBand[r.band].nonUk += r.n;
    else {
      byBand[r.band].uk += r.n;
      if (r.cob === "Scotland") byBand[r.band].scotland += r.n;
      else byBand[r.band].restUk += r.n;
    }
  }
  for (const b of Object.values(byBand)) cobByAge.push(b);

  const identityRows = sheetAoa(wb, "Figure 9");
  const nationalIdentity = { S: { 2011: [], 2022: [] } };
  for (const row of identityRows) {
    const y = yearOf(row[0]);
    const group = clean(row[1]);
    const pct = num(row[2]);
    if (!y || !group || pct == null) continue;
    nationalIdentity.S[y] ??= [];
    nationalIdentity.S[y].push({ group, pct });
  }

  return {
    religion: { composition, christian, none, muslim },
    ethnicity: { composition: ethComposition, whiteShare, minorityShare },
    cob: {
      year: 2022,
      ukBorn,
      nonUkBorn: nonUk,
      shareNonUk: cobShare,
      note: "Scotland’s Census 2022 Figure 8: Scotland + Rest of UK = UK-born; Overseas = non-UK-born. Counts are unrounded figure-data persons.",
    },
    cobAge: {
      geography: "S",
      year: 2022,
      source: "Scotland’s Census 2022 EILR Figure 8 — country of birth by age (persons, not a sex split)",
      bands: cobByAge,
    },
    nationalIdentity,
  };
}

export function parseScotlandBirths(rel = "nrs/vital-events-2024-chapter-3.xlsx") {
  const wb = readWb(rel);
  if (!wb) return null;
  const t313 = sheetAoa(wb, "Table_313");
  const header = t313.find((r) => /^country of birth of mother$/i.test(clean(r[0])) && r.slice(1).some((c) => yearOf(c)));
  const years = (header || []).slice(1).map((cell) => (/^(18|19|20)\d{2}$/.test(String(cell).trim()) ? Number(String(cell).trim()) : null));
  const uk = t313.find((r) => /^United Kingdom/i.test(clean(r[0])));
  const tot = t313.find((r) => /^All countries$/i.test(clean(r[0])));
  const notStated = t313.find((r) => /^Not stated$/i.test(clean(r[0])));
  const share = {};
  const ukMothers = {};
  const nonUkMothers = {};
  years.forEach((y, i) => {
    if (!y) return;
    const t = num(tot?.[i + 1]);
    const u = num(uk?.[i + 1]);
    const ns = num(notStated?.[i + 1]) || 0;
    if (t == null || u == null) return;
    const non = t - u - ns;
    ukMothers.S = [...(ukMothers.S || []), { year: y, value: u, note: "NRS Table 3.13 United Kingdom row (see table notes for Crown Dependencies)" }];
    nonUkMothers.S = [...(nonUkMothers.S || []), { year: y, value: non, note: "NRS Table 3.13: All countries − United Kingdom − not stated" }];
    share.S = [...(share.S || []), { year: y, value: (100 * non) / t, note: "NRS Table 3.13 share of live births to non-UK-born mothers" }];
  });

  const t309 = sheetAoa(wb, "Table_309");
  const h309 = t309.find((r) => /area name/i.test(clean(r[0])));
  const council = [];
  const hIdx = t309.indexOf(h309);
  for (const row of t309.slice(hIdx + 1)) {
    const name = clean(row[0]);
    const type = clean(row[1]);
    const all = num(row[2]);
    const ukb = num(row[3]);
    if (!all || ukb == null) continue;
    if (/^scotland$/i.test(name)) continue;
    if (!/council/i.test(type)) continue;
    council.push({
      name,
      year: 2024,
      all,
      ukMothers: ukb,
      nonUkMothers: all - ukb,
      shareNonUk: (100 * (all - ukb)) / all,
      note: "NRS Table 3.09 2024 live births by mother’s country of birth, council area. UK column as published.",
    });
  }
  return { share, ukMothers, nonUkMothers, council };
}

export function parseNisraMsTable(rel, { ukCols, whiteCols, christianCols, noneCols, muslimCols } = {}) {
  const wb = readWb(rel);
  if (!wb) return null;
  const out = { ni: null, lgd: [] };
  for (const sheet of ["NI", "LGD"]) {
    const rows = sheetAoa(wb, sheet);
    const parsed = parseCountTable(rows, { startRe: /^MS-[A-Z]\d+/i });
    if (sheet === "NI") out.ni = parsed.records[0] || null;
    else out.lgd = parsed.records;
    out.header = parsed.header;
  }
  return out;
}

function sumKeys(rec, testers) {
  if (!rec) return null;
  let sum = 0;
  let hit = 0;
  for (const [k, v] of Object.entries(rec)) {
    if (v == null || typeof v !== "number") continue;
    if (testers.some((re) => re.test(k))) {
      sum += v;
      hit += 1;
    }
  }
  return hit ? sum : null;
}

export function parseNisraCob(rel = "nisra/census2021-ms-a16-cob.xlsx") {
  const parsed = parseNisraMsTable(rel);
  if (!parsed) return null;
  const ukRe = [/united kingdom:\s*northern ireland/i, /united kingdom:\s*england/i, /united kingdom:\s*scotland/i, /united kingdom:\s*wales/i];
  const toShare = (rec) => {
    if (!rec) return null;
    const total = rec["All usual residents"];
    const uk = sumKeys(rec, ukRe);
    if (!total || uk == null) return null;
    return {
      code: rec.code,
      name: rec.name,
      year: 2021,
      ukBorn: uk,
      nonUkBorn: total - uk,
      shareNonUk: (100 * (total - uk)) / total,
      note: "NISRA MS-A16: UK-born = NI+England+Scotland+Wales only. ‘Other non-EU’ can include UK part-not-specified and is left out of UK-born.",
    };
  };
  return { ni: toShare(parsed.ni), lgd: parsed.lgd.map(toShare).filter(Boolean) };
}

export function parseNisraEthnicity(rel = "nisra/census2021-ms-b01-ethnicity.xlsx") {
  const parsed = parseNisraMsTable(rel);
  if (!parsed) return null;
  const toRow = (rec) => {
    if (!rec) return null;
    const total = rec["All usual residents"];
    const white = rec.White;
    if (!total || white == null) return null;
    const groups = Object.entries(rec)
      .filter(([k, v]) => v != null && typeof v === "number" && k !== "All usual residents" && k !== "code" && k !== "name")
      .map(([group, n]) => ({ group, n, pct: (100 * n) / total }));
    return {
      code: rec.code,
      name: rec.name,
      year: 2021,
      white,
      total,
      pctWhite: (100 * white) / total,
      groups,
      note: "NISRA MS-B01: White excludes Irish Traveller and Roma (separate columns). Not the E&W 2021 White high-level group.",
    };
  };
  return { ni: toRow(parsed.ni), lgd: parsed.lgd.map(toRow).filter(Boolean) };
}

export function parseNisraReligion(rel = "nisra/census2021-ms-b19-religion.xlsx") {
  const parsed = parseNisraMsTable(rel);
  if (!parsed) return null;
  const chrisRe = [/catholic/i, /presbyterian/i, /church of ireland/i, /methodist/i, /other christian/i];
  const toRow = (rec) => {
    if (!rec) return null;
    const total = rec["All usual residents"];
    const christian = sumKeys(rec, chrisRe);
    const none = sumKeys(rec, [/^no religion$/i]);
    if (!total) return null;
    const groups = Object.entries(rec)
      .filter(([k, v]) => v != null && typeof v === "number" && !/^all usual|^code$|^name$/i.test(k))
      .map(([group, n]) => ({ group, n, pct: (100 * n) / total }));
    return {
      code: rec.code,
      name: rec.name,
      year: 2021,
      christian,
      none,
      pctChristian: christian != null ? (100 * christian) / total : null,
      pctNone: none != null ? (100 * none) / total : null,
      pctMuslim: null,
      groups,
      note: "NISRA MS-B19 current religion. Christian = Catholic + Presbyterian + Church of Ireland + Methodist + Other Christian. No standalone Muslim column. Not religion-brought-up-in (MS-B23).",
    };
  };
  return { ni: toRow(parsed.ni), lgd: parsed.lgd.map(toRow).filter(Boolean) };
}

export function parseNisraReligionBroughtUp(rel = "nisra/census2021-ms-b23-religion-brought-up.xlsx") {
  const parsed = parseNisraMsTable(rel);
  if (!parsed?.ni) return null;
  const rec = parsed.ni;
  const total = rec["All usual residents"];
  if (!total) return null;
  return {
    year: 2021,
    geography: "NI",
    groups: Object.entries(rec)
      .filter(([k, v]) => v != null && typeof v === "number" && !/^all usual|^code$|^name$/i.test(k))
      .map(([group, n]) => ({ group, n, pct: (100 * n) / total })),
    note: "NISRA MS-B23 religion or religion brought up in — NI-specific concept, not mixed into E&W/Scotland affiliation.",
  };
}

export function parseNisraIdentity(rel = "nisra/census2021-ms-b15-national-identity.xlsx") {
  const parsed = parseNisraMsTable(rel);
  if (!parsed?.ni) return null;
  const rec = parsed.ni;
  const total = rec["All usual residents"];
  if (!total) return null;
  return {
    year: 2021,
    geography: "NI",
    groups: Object.entries(rec)
      .filter(([k, v]) => v != null && typeof v === "number" && !/^all usual|^code$|^name$/i.test(k))
      .map(([group, n]) => ({ group, pct: (100 * n) / total, n })),
    note: "NISRA MS-B15 national identity (feeling of attachment), not citizenship and not passports.",
  };
}

export function parseNisraCobAge(rel = "nisra/census2021-ms-a31-cob-age.xlsx") {
  const wb = readWb(rel);
  if (!wb) return null;
  const rows = sheetAoa(wb, "NI");
  const header = rows.find((r) => /geography code/i.test(clean(r[1])));
  const data = rows.find((r) => /^N92000002$/.test(clean(r[1])) && num(r[2]) > 100000);
  if (!header || !data) return null;
  const bands = [];
  const ageRe = /aged (\d+-\d+|\d+\+) years/i;
  const groups = {};
  header.forEach((h, i) => {
    const label = clean(h);
    const age = label.match(ageRe);
    if (!age) return;
    const band = age[1];
    groups[band] ??= { band, uk: 0, nonUk: 0, total: 0 };
    const v = num(data[i]);
    if (v == null) return;
    if (/^usual residents aged/i.test(label) && !label.includes(":")) {
      groups[band].total += v;
      return;
    }
    if (/united kingdom:\s*(northern ireland|england|scotland|wales)/i.test(label)) groups[band].uk += v;
    else if (label.includes(":")) groups[band].nonUk += v;
  });
  for (const b of Object.values(groups)) {
    if (!b.total && (b.uk || b.nonUk)) b.total = b.uk + b.nonUk;
    bands.push(b);
  }
  if (bands.length < 3) return null;
  return {
    geography: "NI",
    year: 2021,
    source: "NISRA Census 2021 MS-A31 country of birth (basic) by broad age. UK-born = four UK countries only. Persons, not a sex split.",
    bands,
  };
}

export function parseNisraBirths(rel = "nisra/births-tables-2024.xlsx") {
  const wb = readWb(rel);
  if (!wb) return null;
  const t = sheetAoa(wb, "Table 3.18");
  const header = t.find((r) => /^year$/i.test(clean(r[0])));
  const share = {};
  const ukMothers = {};
  const nonUkMothers = {};
  const hIdx = t.indexOf(header);
  for (const row of t.slice(hIdx + 1)) {
    const y = yearOf(row[0]);
    const all = num(row[1]);
    const ni = num(row[2]);
    const restUk = num(row[3]);
    const roi = num(row[4]);
    const a8 = num(row[5]);
    const other = num(row[6]);
    if (!y || !all) continue;
    const uk = (ni || 0) + (restUk || 0);
    const non = (roi || 0) + (a8 || 0) + (other || 0);
    ukMothers.NI = [...(ukMothers.NI || []), { year: y, value: uk, note: "NISRA RGAR Table 3.18: NI-born + rest of UK" }];
    nonUkMothers.NI = [...(nonUkMothers.NI || []), { year: y, value: non, note: "NISRA RGAR Table 3.18: Republic of Ireland + A8 + all other countries" }];
    share.NI = [...(share.NI || []), { year: y, value: (100 * non) / all, note: "NISRA RGAR Table 3.18 share of births to non-UK-born mothers" }];
  }
  return { share, ukMothers, nonUkMothers };
}

export function parseUkMyePyramids(rel = "ons/mye24tablesuk.xlsx") {
  const wb = readWb(rel);
  if (!wb) return {};
  const persons = sheetAoa(wb, "MYE2 - Persons");
  const females = sheetAoa(wb, "MYE2 - Females");
  const males = sheetAoa(wb, "MYE2 - Males");
  const headerRow = persons.find((r) => String(r[0]).trim() === "Code");
  if (!headerRow) return {};
  const want = {
    UK: "K02000001",
    EW: "K04000001",
    E: "E92000001",
    W: "W92000004",
    S: "S92000003",
    NI: "N92000002",
  };
  const pyramids = {};
  const year = 2024;
  for (const [geo, code] of Object.entries(want)) {
    const p = persons.find((r) => String(r[0]).trim() === code);
    const f = females.find((r) => String(r[0]).trim() === code);
    const m = males.find((r) => String(r[0]).trim() === code);
    if (!p) continue;
    const pyramid = [];
    for (let i = 4; i < headerRow.length; i++) {
      const ageLabel = String(headerRow[i]).trim();
      const ageN = ageLabel === "90+" || Number(ageLabel) >= 90 ? 90 : num(ageLabel);
      if (ageN == null) continue;
      const band = ageN >= 90 ? "90+" : `${Math.floor(ageN / 5) * 5}-${Math.floor(ageN / 5) * 5 + 4}`;
      let slot = pyramid.find((b) => b.band === band);
      if (!slot) {
        slot = { band, male: 0, female: 0, persons: 0 };
        pyramid.push(slot);
      }
      slot.persons += num(p[i]) || 0;
      if (m) slot.male += num(m[i]) || 0;
      if (f) slot.female += num(f[i]) || 0;
    }
    pyramids[`${geo}:${year}`] = pyramid;
  }
  return pyramids;
}

function pctOf(items, testers) {
  let sum = 0;
  let hit = 0;
  for (const it of items || []) {
    if (it.value == null || typeof it.value !== "number") continue;
    if (testers.some((re) => re.test(it.label))) {
      sum += it.value;
      hit += 1;
    }
  }
  return hit ? sum : null;
}

export function parseScotlandCouncilOverviews(rel = "nrs/census2022-area-overviews.json") {
  const abs = path.join(RAW, rel);
  if (!fs.existsSync(abs) || fs.statSync(abs).size === 0) return null;
  const raw = JSON.parse(fs.readFileSync(abs, "utf8"));
  const areas = raw.areas || [];
  if (areas.length < 30) return null;
  const cob = [];
  const ethnicity = [];
  const religion = [];
  const noteBase =
    "Scotland’s Census 2022 Area Overview (Search the Census). Published NRS headings — not remapped onto E&W groups. Equivalent to UV201 / UV204 / UV205 council tables.";
  for (const area of areas) {
    const code = String(area.code || "").trim();
    const name = String(area.name || "").trim();
    if (!/^S12/.test(code)) continue;
    const ukBornPct = pctOf(area.countryOfBirth, [
      /^%?\s*Scotland$/i,
      /^%?\s*England$/i,
      /^%?\s*Wales$/i,
      /^%?\s*Northern Ireland$/i,
    ]);
    const whitePct = pctOf(area.ethnicGroup, [/^%?\s*White/i]);
    const christianPct = pctOf(area.religion, [
      /church of scotland/i,
      /roman catholic/i,
      /other christian/i,
    ]);
    const nonePct = pctOf(area.religion, [/no religion/i]);
    const muslimPct = pctOf(area.religion, [/^%?\s*Muslim$/i]);
    if (ukBornPct != null) {
      cob.push({
        code,
        name,
        year: 2022,
        shareNonUk: 100 - ukBornPct,
        ukBornPct,
        groups: area.countryOfBirth,
        note: `${noteBase} UK-born = Scotland+England+Wales+Northern Ireland only.`,
      });
    }
    if (whitePct != null) {
      ethnicity.push({
        code,
        name,
        year: 2022,
        pctWhite: whitePct,
        groups: area.ethnicGroup,
        note: `${noteBase} White = sum of published White-* headings (includes Irish, Polish, Other White). Not E&W high-level White.`,
      });
    }
    if (christianPct != null || nonePct != null || muslimPct != null) {
      religion.push({
        code,
        name,
        year: 2022,
        pctChristian: christianPct,
        pctNone: nonePct,
        pctMuslim: muslimPct,
        groups: area.religion,
        note: `${noteBase} Christian = Church of Scotland + Roman Catholic + Other Christian. Not stated is a residual, not imputed.`,
      });
    }
  }
  if (cob.length < 30) return null;
  return { cob, ethnicity, religion, source: raw };
}

export function scotlandCouncilLookup(rel = "nrs/mye-scotland-2024.xlsx") {
  const wb = readWb(rel);
  if (!wb) return {};
  const rows = sheetAoa(wb, "Table 1");
  const map = {};
  for (const row of rows) {
    const name = clean(row[0]);
    const code = clean(row[1]);
    const type = clean(row[2]);
    if (/^S12/.test(code) && /council/i.test(type)) map[name.toLowerCase()] = code;
  }
  return map;
}
