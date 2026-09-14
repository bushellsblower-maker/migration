/**
 * Build public/data/catalog.json from downloaded official files.
 * Never invent values: skip cells that are not parseable numbers.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";
import {
  concordanceNotes,
  parseScotlandEilr,
  parseScotlandBirths,
  parseNisraCob,
  parseNisraEthnicity,
  parseNisraReligion,
  parseNisraReligionBroughtUp,
  parseNisraIdentity,
  parseNisraCobAge,
  parseNisraBirths,
  parseUkMyePyramids,
  scotlandCouncilLookup,
} from "./ingest-nations.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAW = path.join(ROOT, "data", "raw");
const OUT = path.join(ROOT, "public", "data");
const GEO_OUT = path.join(ROOT, "public", "geo");

const NATIONS = {
  UK: { id: "UK", name: "United Kingdom", gss: "K02000001", kind: "uk" },
  GB: { id: "GB", name: "Great Britain", gss: "K03000001", kind: "gb" },
  EW: { id: "EW", name: "England and Wales", gss: "K04000001", kind: "country-group" },
  E: { id: "E", name: "England", gss: "E92000001", kind: "nation" },
  W: { id: "W", name: "Wales", gss: "W92000004", kind: "nation" },
  S: { id: "S", name: "Scotland", gss: "S92000003", kind: "nation" },
  NI: { id: "NI", name: "Northern Ireland", gss: "N92000002", kind: "nation" },
};

const REGIONS = {
  E12000001: "North East",
  E12000002: "North West",
  E12000003: "Yorkshire and The Humber",
  E12000004: "East Midlands",
  E12000005: "West Midlands",
  E12000006: "East of England",
  E12000007: "London",
  E12000008: "South East",
  E12000009: "South West",
};

const GSS_TO_ID = {
  K02000001: "UK",
  K03000001: "GB",
  K04000001: "EW",
  E92000001: "E",
  W92000004: "W",
  S92000003: "S",
  N92000002: "NI",
};

function readWb(rel) {
  const abs = path.join(RAW, rel);
  if (!fs.existsSync(abs) || fs.statSync(abs).size === 0) {
    console.warn("missing", rel);
    return null;
  }
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
  if (full) return Number(full[0]);
  const ye = s.match(/YE\s+(?:Jan|Mar|Jun|Sep|Dec)\s+(\d{2})\b/i);
  if (ye) {
    const yy = Number(ye[1]);
    return yy >= 40 ? 1900 + yy : 2000 + yy;
  }
  return null;
}

function point(year, value, extra = {}) {
  if (year == null || value == null) return null;
  return { year, value, ...extra };
}

function addPoint(series, geo, year, value, extra) {
  const p = point(year, value, extra);
  if (!p) return;
  if (!series[geo]) series[geo] = [];
  series[geo].push(p);
}

function sortSeries(series) {
  for (const key of Object.keys(series)) {
    const byYear = new Map();
    for (const p of series[key]) byYear.set(p.year, p);
    series[key] = [...byYear.values()].sort((a, b) => a.year - b.year);
  }
  return series;
}

function parseCsv(rel) {
  const abs = path.join(RAW, rel);
  const text = fs.readFileSync(abs, "utf8");
  return text.split(/\r?\n/).map((line) => {
    const out = [];
    let cur = "";
    let q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === "," && !q) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out;
  });
}

function source(id, name, url, extra = {}) {
  return { id, name, url, license: "OGL v3.0", ...extra };
}

function parsePopCsv() {
  const rows = parseCsv("ons/pop.csv");
  const header = rows[0].map((h) => h.replace(/^"|"$/g, ""));
  const col = {
    S: header.findIndex((h) => /Scotland/i.test(h)),
    GB: header.findIndex((h) => /Great Britain/i.test(h)),
    E: header.findIndex((h) => /^England population/i.test(h)),
    EW: header.findIndex((h) => /England and Wales/i.test(h)),
    UK: header.findIndex((h) => /United Kingdom/i.test(h)),
    NI: header.findIndex((h) => /Northern Ireland/i.test(h)),
    W: header.findIndex((h) => /^Wales population/i.test(h)),
  };
  const series = {};
  for (const row of rows) {
    const y = yearOf(row[0]);
    if (!y) continue;
    for (const [geo, idx] of Object.entries(col)) {
      if (idx >= 0) addPoint(series, geo, y, num(row[idx]));
    }
  }
  return sortSeries(series);
}

function parseEwHistorical(wb) {
  const series = {};
  const t7 = sheetAoa(wb, "Table 7");
  for (const row of t7) {
    const y = yearOf(row[0]);
    if (!y) continue;
    addPoint(series, "EW", y, num(row[1]));
  }
  const t10 = sheetAoa(wb, "Table 10");
  for (const row of t10) {
    const y = yearOf(row[0]);
    if (!y) continue;
    addPoint(series, "E", y, num(row[1]));
  }
  const t12 = sheetAoa(wb, "Table 12");
  for (const row of t12) {
    const y = yearOf(row[0]);
    if (!y) continue;
    addPoint(series, "W", y, num(row[1]));
  }
  return sortSeries(series);
}

function parseGb1937(wb) {
  const series = {};
  const rows = sheetAoa(wb, "GB Total Pop 1937-2014");
  for (const row of rows) {
    const y = yearOf(row[0]);
    if (!y) continue;
    let v = num(row[1]);
    if (v != null && v < 200000) v = Math.round(v * 1000);
    addPoint(series, "GB", y, v, y >= 1940 && y <= 1947 ? { flag: "wartime-definition" } : {});
  }
  return sortSeries(series);
}

function parseRegional(wb) {
  const series = {};
  for (const sheet of ["Table 3", "Table 4"]) {
    const rows = sheetAoa(wb, sheet);
    for (const row of rows) {
      const y = yearOf(row[0]);
      const code = String(row[1] || "").trim();
      if (!y || !REGIONS[code]) continue;
      addPoint(series, code, y, num(row[3]));
    }
  }
  return sortSeries(series);
}

function parseAgeSex(ewWb, myeWb) {
  const pyramids = {};
  const t9 = sheetAoa(ewWb, "Table 9");
  const yearCols = {};
  if (t9[1]) {
    t9[1].forEach((cell, i) => {
      const y = yearOf(cell);
      if (y) yearCols[y] = i;
    });
  }
  const bands = {};
  for (const row of t9.slice(2)) {
    const age = String(row[0]).trim();
    const sex = String(row[1]).trim().toLowerCase();
    if (age !== "All Ages" && /^\d+$/.test(age) && (sex === "males" || sex === "females" || sex === "persons")) {
      const ageN = Number(age);
      const band = ageN >= 90 ? "90+" : `${Math.floor(ageN / 5) * 5}-${Math.floor(ageN / 5) * 5 + 4}`;
      for (const [y, col] of Object.entries(yearCols)) {
        const v = num(row[col]);
        if (v == null) continue;
        bands[y] ??= {};
        bands[y][band] ??= { male: 0, female: 0, persons: 0 };
        if (sex === "males") bands[y][band].male += v;
        else if (sex === "females") bands[y][band].female += v;
        else bands[y][band].persons += v;
      }
    }
  }
  // Table 9 in this file is persons by single year (Sex column = Persons).
  // Use MYE2 male/female sheets for the latest mid-year.
  if (myeWb) {
    const persons = sheetAoa(myeWb, "MYE2 - Persons");
    const females = sheetAoa(myeWb, "MYE2 - Females");
    const males = sheetAoa(myeWb, "MYE2 - Males");
    const headerRow = persons.find((r) => String(r[0]).trim() === "Code");
    const latestYear = 2025;
    const take = (rows, geoName) => {
      const row = rows.find((r) => String(r[1]).replace(/\s+/g, " ").trim().toUpperCase() === geoName);
      return row || null;
    };
    const geoRows = {
      EW: "ENGLAND AND WALES",
      E: "ENGLAND",
    };
    for (const [geo, label] of Object.entries(geoRows)) {
      const p = take(persons, label);
      const f = take(females, label);
      const m = take(males, label);
      if (!p || !headerRow) continue;
      const pyramid = [];
      for (let i = 4; i < headerRow.length; i++) {
        const ageLabel = String(headerRow[i]).trim();
        const ageN = ageLabel === "90+" ? 90 : num(ageLabel);
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
      pyramids[`${geo}:${latestYear}`] = pyramid;
    }
    // English regions
    for (const [code, name] of Object.entries(REGIONS)) {
      const p = persons.find((r) => String(r[0]).trim() === code);
      const f = females.find((r) => String(r[0]).trim() === code);
      const m = males.find((r) => String(r[0]).trim() === code);
      if (!p || !headerRow) continue;
      const pyramid = [];
      for (let i = 4; i < headerRow.length; i++) {
        const ageLabel = String(headerRow[i]).trim();
        const ageN = ageLabel === "90+" ? 90 : num(ageLabel);
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
      pyramids[`${code}:${latestYear}`] = pyramid;
    }
  }
  return { pyramids };
}

function parseLtimHistorical(wb) {
  const immigration = {};
  const emigration = {};
  const net = {};
  const rows = sheetAoa(wb, "Data");
  const headerIdx = rows.findIndex((r) => String(r[0]).trim() === "Year");
  for (const row of rows.slice(headerIdx + 1)) {
    const y = yearOf(row[0]);
    if (!y) continue;
    // File is in thousands
    const imm = num(row[1]);
    const emi = num(row[2]);
    const n = num(row[3]);
    addPoint(immigration, "UK", y, imm == null ? null : imm * 1000, { method: y < 1991 ? "pre-1991" : "ips-ltim" });
    addPoint(emigration, "UK", y, emi == null ? null : emi * 1000, { method: y < 1991 ? "pre-1991" : "ips-ltim" });
    addPoint(net, "UK", y, n == null ? null : n * 1000, { method: y < 1991 ? "pre-1991" : "ips-ltim" });
  }
  return {
    immigration: sortSeries(immigration),
    emigration: sortSeries(emigration),
    net: sortSeries(net),
  };
}

function parseLtimAdmin(wb) {
  const immigration = {};
  const emigration = {};
  const net = {};
  const rows = sheetAoa(wb, "1");
  const headerIdx = rows.findIndex((r) => /Flow/i.test(String(r[0])));
  for (const row of rows.slice(headerIdx + 1)) {
    const flow = String(row[0]).trim();
    const period = String(row[1] || "");
    if (!/^YE Dec /i.test(period)) continue;
    const y = yearOf(period);
    const v = num(row[2]);
    const extra = {
      method: "admin-ltim",
      period,
      provisional: /p/i.test(period),
      revised: /r/i.test(period),
    };
    if (flow === "Immigration") addPoint(immigration, "UK", y, v, extra);
    if (flow === "Emigration") addPoint(emigration, "UK", y, v, extra);
    if (/^Net/i.test(flow)) addPoint(net, "UK", y, v, extra);
  }
  return {
    immigration: sortSeries(immigration),
    emigration: sortSeries(emigration),
    net: sortSeries(net),
  };
}

function parseApsStock(wb, sheetName, yesRe, noRe) {
  const yes = {};
  const no = {};
  const shareNo = {};
  const rows = sheetAoa(wb, sheetName);
  const headerIdx = rows.findIndex((r) => String(r[0]).trim() === "Area Code");
  const header = (rows[headerIdx] || []).map((h) => String(h).replace(/\s+/g, " ").trim());
  const yesCol = header.findIndex((h) => yesRe.test(h) && /Estimate/i.test(h) && !/\+\/-/.test(h));
  const noCol = header.findIndex((h) => noRe.test(h) && /Estimate/i.test(h) && !/\+\/-/.test(h));
  const yesCi = header.findIndex((h) => yesRe.test(h) && /\+\/-/.test(h));
  const noCi = header.findIndex((h) => noRe.test(h) && /\+\/-/.test(h));
  const year = 2021;
  const las = [];
  for (const row of rows.slice(headerIdx + 1)) {
    const code = String(row[0] || "").trim();
    const name = String(row[1] || "").replace(/\[Note.*?\]/g, "").trim();
    const geoType = String(row[2] || "").trim();
    const yv = num(row[yesCol]);
    const nv = num(row[noCol]);
    if (yv == null || nv == null) continue;
    const geo = GSS_TO_ID[code];
    if (geo) {
      addPoint(yes, geo, year, yv, { ci: num(row[yesCi]) });
      addPoint(no, geo, year, nv, { ci: num(row[noCi]) });
      addPoint(shareNo, geo, year, (100 * nv) / (yv + nv));
    }
    if (REGIONS[code]) {
      addPoint(yes, code, year, yv, { ci: num(row[yesCi]) });
      addPoint(no, code, year, nv, { ci: num(row[noCi]) });
      addPoint(shareNo, code, year, (100 * nv) / (yv + nv));
    }
    if (/local authority|unitary|metropolitan district|london borough/i.test(geoType)) {
      las.push({
        code,
        name,
        year,
        yes: yv,
        no: nv,
        shareNo: (100 * nv) / (yv + nv),
        ciNo: num(row[noCi]),
      });
    }
  }
  return {
    yes: sortSeries(yes),
    no: sortSeries(no),
    shareNo: sortSeries(shareNo),
    las,
  };
}

function parseAps(wb) {
  const cob = parseApsStock(wb, "1.1", /^United Kingdom\b/i, /^Non-United Kingdom\b/i);
  return {
    bornUk: cob.yes,
    bornNonUk: cob.no,
    shareNonUk: cob.shareNo,
    las: cob.las.map((r) => ({
      code: r.code,
      name: r.name,
      year: r.year,
      ukBorn: r.yes,
      nonUkBorn: r.no,
      shareNonUk: r.shareNo,
      ciNonUk: r.ciNo,
    })),
  };
}

function parseApsNationality(wb) {
  const nat = parseApsStock(wb, "2.1", /^British\b/i, /^Non-British\b/i);
  return {
    british: nat.yes,
    nonBritish: nat.no,
    shareNonBritish: nat.shareNo,
    las: nat.las.map((r) => ({
      code: r.code,
      name: r.name,
      year: r.year,
      british: r.yes,
      nonBritish: r.no,
      shareNonBritish: r.shareNo,
      ciNonBritish: r.ciNo,
    })),
  };
}

function rollupLasToItl(las, ladToItl, fields) {
  const buckets = {};
  for (const row of las) {
    const itl = ladToItl[row.code];
    if (!itl) continue;
    buckets[itl] ??= { code: itl };
    for (const [src, dest] of Object.entries(fields)) {
      buckets[itl][dest] = (buckets[itl][dest] || 0) + (row[src] || 0);
    }
  }
  return Object.values(buckets);
}

function parseCensusCob(fig4) {
  const share = {};
  const las = [];
  const rows = sheetAoa(fig4, "Figure 4");
  const headerIdx = rows.findIndex((r) => /LA code/i.test(String(r[0])));
  for (const row of rows.slice(headerIdx + 1)) {
    const code = String(row[0] || "").trim();
    const name = String(row[1] || "").trim();
    if (!/^E|^W/.test(code)) continue;
    const p2011 = num(row[2]);
    const p2021 = num(row[3]);
    las.push({ code, name, y2011: p2011, y2021: p2021 });
  }
  // Nation rollups are not in this LA file; use census-cob-fig1? That's components of change.
  // We compute E&W unweighted? No — do not average LAs. Leave nation totals to APS + notes.
  return { share: sortSeries(share), las };
}

function parseEthnicity(grouped, mapWb) {
  const composition = { E: { 2011: [], 2021: [] }, EW: { 2011: [], 2021: [] } };
  const rows = sheetAoa(grouped, "Figure 1");
  const headerIdx = rows.findIndex((r) => /Ethnic Group/i.test(String(r[0])));
  for (const row of rows.slice(headerIdx + 1)) {
    const group = String(row[0] || "").trim();
    if (!group || /^(units|notes?:|source|figure)/i.test(group) || /excluded|presented ethnic|distribution \(high-level/i.test(group)) continue;
    const n2011 = num(row[1]);
    const n2021 = num(row[2]);
    const p2011 = num(row[3]);
    const p2021 = num(row[4]);
    if (n2011 == null && n2021 == null && p2011 == null && p2021 == null) continue;
    composition.EW[2011].push({ group, n: n2011, pct: p2011 });
    composition.EW[2021].push({ group, n: n2021, pct: p2021 });
  }
  const whiteShare = {};
  const las = [];
  const map = sheetAoa(mapWb, "Figure 3");
  const h = map.find((r) => /Area code/i.test(String(r[0])));
  const hIdx = map.indexOf(h);
  const labels = (h || []).map((x) => String(x));
  for (const row of map.slice(hIdx + 1)) {
    const code = String(row[0] || "").trim();
    const name = String(row[1] || "").trim();
    if (!code) continue;
    const cells = [];
    let total = 0;
    let white = 0;
    for (let i = 2; i < labels.length; i++) {
      const v = num(row[i]);
      if (v == null) continue;
      cells.push({ group: labels[i], n: v });
      total += v;
      if (/^White/i.test(labels[i])) white += v;
    }
    if (!total) continue;
    const pctWhite = (100 * white) / total;
    las.push({ code, name, year: 2021, pctWhite, white, total, groups: cells });
  }
  addPoint(whiteShare, "EW", 2011, composition.EW[2011].find((g) => /^White$/i.test(g.group))?.pct);
  addPoint(whiteShare, "EW", 2021, composition.EW[2021].find((g) => /^White$/i.test(g.group))?.pct);
  return { composition, whiteShare: sortSeries(whiteShare), las };
}

function parseReligion(fig1, fig2) {
  const composition = { EW: { 2011: [], 2021: [] } };
  const rows = sheetAoa(fig1, "Figure 1");
  const headerIdx = rows.findIndex((r) => /^Religion$/i.test(String(r[0]).trim()));
  for (const row of rows.slice(headerIdx + 1)) {
    const group = String(row[0] || "").trim();
    if (!group || /^(units|notes?:|source|figure)/i.test(group)) continue;
    const n2011 = num(row[1]);
    const n2021 = num(row[2]);
    const p2011 = num(row[3]);
    const p2021 = num(row[4]);
    if (n2011 == null && n2021 == null && p2011 == null && p2021 == null) continue;
    composition.EW[2011].push({ group, n: n2011, pct: p2011 });
    composition.EW[2021].push({ group, n: n2021, pct: p2021 });
  }
  const christian = {};
  const none = {};
  const muslim = {};
  for (const [y, arr] of Object.entries(composition.EW)) {
    addPoint(christian, "EW", Number(y), arr.find((g) => /^Christian$/i.test(g.group))?.pct);
    addPoint(none, "EW", Number(y), arr.find((g) => /^No religion$/i.test(g.group))?.pct);
    addPoint(muslim, "EW", Number(y), arr.find((g) => /^Muslim$/i.test(g.group))?.pct);
  }
  const las = [];
  const map = sheetAoa(fig2, "Figure 2");
  const h = map.find((r) => /Area code/i.test(String(r[0])));
  const hIdx = map.indexOf(h);
  const labels = (h || []).map((x) => String(x));
  for (const row of map.slice(hIdx + 1)) {
    const code = String(row[0] || "").trim();
    const name = String(row[1] || "").trim();
    if (!code) continue;
    const rec = { code, name, year: 2021 };
    let total = 0;
    for (let i = 2; i < labels.length; i++) {
      const v = num(row[i]);
      if (v == null) continue;
      const key = labels[i].replace(/\s*\(number\)\s*/i, "").trim();
      rec[key] = v;
      total += v;
    }
    rec.total = total;
    if (total) {
      rec.pctChristian = rec.Christian != null ? (100 * rec.Christian) / total : null;
      rec.pctNone = rec["No religion"] != null ? (100 * rec["No religion"]) / total : null;
      rec.pctMuslim = rec.Muslim != null ? (100 * rec.Muslim) / total : null;
    }
    las.push(rec);
  }
  return {
    composition,
    christian: sortSeries(christian),
    none: sortSeries(none),
    muslim: sortSeries(muslim),
    las,
  };
}

function parseBirths(wb2025, mapWb) {
  const ukMothers = {};
  const nonUkMothers = {};
  const total = {};
  const share = {};
  const t1 = sheetAoa(wb2025, "Table_1");
  const header = t1.find((r) => String(r[0]).includes("Country of birth of mother"));
  const years = header.slice(1).map(yearOf);
  const findRow = (re) => t1.find((r) => re.test(String(r[0])));
  const uk = findRow(/^UK$/i);
  const non = findRow(/outside United Kingdom/i);
  const tot = findRow(/^Total$/i);
  years.forEach((y, i) => {
    if (!y) return;
    addPoint(ukMothers, "EW", y, num(uk?.[i + 1]));
    addPoint(nonUkMothers, "EW", y, num(non?.[i + 1]));
    addPoint(total, "EW", y, num(tot?.[i + 1]));
    const t = num(tot?.[i + 1]);
    const n = num(non?.[i + 1]);
    if (t && n != null) addPoint(share, "EW", y, (100 * n) / t);
  });
  const regionShare = {};
  const map = sheetAoa(mapWb, "data");
  const mh = map.find((r) => String(r[0]).trim() === "Code");
  const mIdx = map.indexOf(mh);
  const mapYears = (mh || []).slice(3).map(yearOf);
  for (const row of map.slice(mIdx + 1)) {
    const code = String(row[0] || "").split(",")[0].trim();
    const geo = GSS_TO_ID[code] || (REGIONS[code] ? code : null);
    if (!geo) continue;
    mapYears.forEach((y, i) => {
      if (!y) return;
      addPoint(regionShare, geo, y, num(row[i + 3]));
    });
  }
  return {
    ukMothers: sortSeries(ukMothers),
    nonUkMothers: sortSeries(nonUkMothers),
    total: sortSeries(total),
    share: sortSeries(share),
    regionShare: sortSeries(regionShare),
  };
}

function parseWideYearTable(rows, startRowLabel) {
  const headerIdx = rows.findIndex((r) => String(r[0]).includes(startRowLabel) || /Date|Year|Method|As at/i.test(String(r[0])));
  let header = rows[headerIdx];
  // find the header that actually contains years
  for (let i = 0; i < rows.length; i++) {
    const years = rows[i].filter((c) => yearOf(c));
    if (years.length >= 5) {
      header = rows[i];
      break;
    }
  }
  const years = header.map((c, i) => ({ i, y: yearOf(c), label: String(c) }));
  const metrics = {};
  for (const row of rows) {
    const name = String(row[0] || "").trim();
    if (!name || yearOf(name) || /date|as at|method of entry|year$/i.test(name)) continue;
    const calendarYears = new Set(years.filter(({ y, label }) => y && !/year ending june/i.test(label)).map(({ y }) => y));
    const series = {};
    for (const { i, y, label } of years) {
      if (!y || i === 0) continue;
      const midYear = /year ending june/i.test(label);
      if (midYear && calendarYears.has(y)) continue;
      addPoint(series, "UK", y, num(row[i]), midYear ? { period: String(label).trim(), midYear: true } : {});
    }
    if (Object.keys(series).length) metrics[name] = sortSeries(series);
  }
  return metrics;
}

function parseAsylum(wb) {
  const rows = sheetAoa(wb, "Asy_00a");
  return parseWideYearTable(rows, "Date");
}

function parseBoats(wb) {
  const rows = sheetAoa(wb, "IER_01");
  return parseWideYearTable(rows, "Method");
}

function parseEmpRateSheet(wb, sheetName, keys) {
  const rates = {};
  const rows = sheetAoa(wb, sheetName);
  const headerIdx = rows.findIndex((r) => /Dataset identifier/i.test(String(r[0])));
  if (headerIdx < 0) return rates;
  for (const row of rows.slice(headerIdx + 1)) {
    const label = String(row[0] || "").trim();
    const y = yearOf(label);
    if (!y) continue;
    if (!/Oct-Dec|Oct–Dec/i.test(label)) continue;
    for (const [key, col] of Object.entries(keys)) {
      addPoint(rates, key, y, num(row[col]));
    }
  }
  return sortSeries(rates);
}

function parseEmp06(wb) {
  const rates = parseEmpRateSheet(wb, "Country of birth rates", {
    all: 1,
    "UK-born": 2,
    "non-UK-born": 3,
  });
  const nationality = parseEmpRateSheet(wb, "Nationality rates", {
    all: 1,
    "UK-nationality": 2,
    "non-UK-nationality": 3,
  });
  return { rates, nationality };
}

function parseHousing(wb) {
  const ratio = {};
  const rows = sheetAoa(wb, "1c");
  const header = rows.find((r) => String(r[0]).trim() === "Code");
  const years = header.slice(2).map(yearOf);
  const hIdx = rows.indexOf(header);
  for (const row of rows.slice(hIdx + 1)) {
    const code = String(row[0] || "").trim();
    const geo = GSS_TO_ID[code] || (REGIONS[code] ? code : null);
    if (!geo) continue;
    years.forEach((y, i) => addPoint(ratio, geo, y, num(row[i + 2])));
  }
  return { ratio: sortSeries(ratio) };
}

function parseMac(wb) {
  const fig10 = sheetAoa(wb, "Figure_10");
  const groups = (fig10[1] || []).slice(1).map((x) => String(x).replace(/\s+/g, " ").trim()).filter(Boolean);
  const values = (fig10[2] || []).slice(1).map(num);
  const staticEstimates = groups
    .map((label, i) => ({
      label,
      gbp: values[i],
      year: "2022/23",
      frame: "static",
      incidence: "average",
      publicGoods: "baseline",
      population: /UK resident|UK working|UK child|UK non-working/i.test(label) ? "uk-born" : "visa",
      sourceSheet: "Figure_10",
      methodNote: "MAC static net fiscal impact including visa fees (primary spending), arrival-year 2022/23. Per person, not a UK-wide stock total.",
    }))
    .filter((d) => d.gbp != null);
  const t11 = sheetAoa(wb, "Table_11");
  const headers = (t11[1] || []).map((x) => String(x).replace(/\s+/g, " ").trim());
  const sensitivities = [];
  for (const row of t11.slice(2)) {
    const scenario = String(row[0] || "").trim();
    if (!scenario) continue;
    const cells = {};
    headers.forEach((h, i) => {
      if (!i || !h) return;
      const v = num(row[i]);
      if (v != null) cells[h] = v;
    });
    const publicGoods = /Pure Public Goods/i.test(scenario)
      ? "pure-mc0"
      : /Congestible Public Goods/i.test(scenario)
        ? "congestible-mc0"
        : "baseline";
    const incidence = /MC=0|MC = 0/i.test(scenario) ? "marginal" : "average";
    if (Object.keys(cells).length) sensitivities.push({ scenario, cells, publicGoods, incidence, frame: "static" });
  }
  const t23 = sheetAoa(wb, "Table_23");
  const lifetimeCohorts = [];
  for (const row of t23.slice(2)) {
    const label = String(row[0] || "").trim();
    if (!label) continue;
    const tax = num(row[1]);
    const visaFees = num(row[2]);
    const expenditure = num(row[3]);
    const net = num(row[4]);
    if (tax == null && net == null) continue;
    lifetimeCohorts.push({
      label,
      taxGbpMillion: tax,
      visaFeesGbpMillion: visaFees,
      expenditureGbpMillion: expenditure,
      netGbpMillion: net,
      year: "2022/23",
      unit: "£ million, lifetime cohort total",
      frame: "dynamic",
      incidence: "average",
      publicGoods: "baseline",
      population: "visa",
      sourceSheet: "Table_23",
      methodNote: "MAC Table 23 lifetime cohort totals for the 2022/23 visa cohort (tax + visa fees − expenditure). Discounted lifetime model, not a stock of all migrants.",
    });
  }
  return { staticEstimates, sensitivities, lifetimeCohorts };
}

function loadFiscalCitations() {
  const p = path.join(ROOT, "data", "fiscal-citations.json");
  if (!fs.existsSync(p)) return { assumptionAxes: [], estimates: [] };
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function loadManifest() {
  const p = path.join(RAW, "manifest.json");
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function parseAsylumExtra(wb) {
  const grants = parseWideYearTable(sheetAoa(wb, "Asy_02a"), "Date");
  const awaiting = parseWideYearTable(sheetAoa(wb, "Asy_03a"), "As at");
  return { grants, awaiting };
}

function detectionGroup(name) {
  if (/small boat/i.test(name)) return "small-boat";
  return "other-detection";
}

function parseRm011CobAge() {
  const abs = path.join(RAW, "ons/census-rm011-cob-age.csv");
  if (!fs.existsSync(abs) || fs.statSync(abs).size < 200) return null;
  const rows = parseCsv("ons/census-rm011-cob-age.csv");
  if (rows.length < 4) return null;
  const header = rows[0].map((h) => String(h).replace(/^"|"$/g, ""));
  const cobIdx = header.findIndex((h) => /country of birth/i.test(h));
  const ageIdx = header.findIndex((h) => /^age/i.test(h) && !/sort/i.test(h));
  const valIdx = header.findIndex((h) => /^(observation|obs|value|v4_1)$/i.test(h));
  if (cobIdx < 0 || ageIdx < 0 || valIdx < 0) return null;
  const bands = {};
  for (const row of rows.slice(1)) {
    const cob = String(row[cobIdx] || "").trim();
    const age = String(row[ageIdx] || "").trim();
    const v = num(row[valIdx]);
    if (!cob || !age || v == null || /^total/i.test(age)) continue;
    const uk = /united kingdom|europe: united kingdom/i.test(cob);
    const nonUk =
      /eu countries|non-eu|africa|asia|americas|oceania|british overseas|antarctica/i.test(cob) &&
      !/united kingdom/i.test(cob);
    if (!uk && !nonUk) continue;
    bands[age] ??= { band: age, uk: 0, nonUk: 0 };
    if (uk) bands[age].uk += v;
    else bands[age].nonUk += v;
  }
  const list = Object.values(bands);
  if (list.length < 3) return null;
  return { geography: "EW", year: 2021, source: "ONS Census 2021 RM011 country of birth by age", bands: list };
}

function yearsOfSeries(series) {
  const ys = new Set();
  for (const pts of Object.values(series || {})) {
    for (const p of pts) ys.add(p.year);
  }
  return [...ys].sort((a, b) => a - b);
}

function mergePrefer(primary, fallback) {
  const out = { ...fallback };
  for (const [geo, pts] of Object.entries(primary)) {
    const map = new Map((out[geo] || []).map((p) => [p.year, p]));
    for (const p of pts) map.set(p.year, p);
    out[geo] = [...map.values()].sort((a, b) => a.year - b.year);
  }
  return out;
}

function loadLookups() {
  const p = path.join(ROOT, "public", "geo", "lookups.json");
  if (!fs.existsSync(p)) {
    console.warn("missing public/geo/lookups.json — run scripts/normalize-geo.mjs first");
    return { ladToItl: {}, itl1Names: {} };
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

const schemaIssues = [];
function schemaError(msg) {
  schemaIssues.push({ level: "error", msg });
  console.error("SCHEMA ERROR", msg);
}
function schemaWarn(msg) {
  schemaIssues.push({ level: "warn", msg });
  console.warn("SCHEMA WARN", msg);
}

function requireExisting(rel, { critical = true } = {}) {
  const abs = path.join(RAW, rel);
  if (!fs.existsSync(abs) || fs.statSync(abs).size === 0) {
    (critical ? schemaError : schemaWarn)(`missing ${rel}`);
    return false;
  }
  return true;
}

function requireSheet(wb, rel, sheet) {
  if (!wb) {
    schemaError(`unreadable ${rel}`);
    return false;
  }
  if (!wb.Sheets[sheet]) {
    schemaError(`${rel} has no sheet “${sheet}” — official layout may have changed`);
    return false;
  }
  return true;
}

function requireSeries(series, label, minYears = 3) {
  const n = yearsOfSeries(series).length;
  if (n < minYears) schemaError(`${label} has ${n} year(s); expected at least ${minYears}. Parser or source schema may have broken.`);
}

function finishSchemaOrExit() {
  const errors = schemaIssues.filter((i) => i.level === "error");
  const warns = schemaIssues.filter((i) => i.level === "warn");
  if (warns.length) console.warn(`${warns.length} ingest warning(s)`);
  if (!errors.length) {
    console.log("SCHEMA OK");
    return;
  }
  console.error(`${errors.length} critical ingest error(s).`);
  if (process.env.MIG_ALLOW_PARTIAL === "1") {
    schemaWarn("MIG_ALLOW_PARTIAL=1 — writing catalog anyway (may be incomplete). Default is to leave the previous catalog in place.");
    return;
  }
  console.error("catalog.json was not overwritten. See data/sources.json → howRefreshWorks.");
  process.exit(1);
}

function main() {
  const lookups = loadLookups();
  const fiscalCitations = loadFiscalCitations();
  const manifest = loadManifest();

  requireExisting("ons/pop.csv");
  requireExisting("ons/ltim-1964-2015.xls");
  requireExisting("ons/ltim-flows-may2026.xlsx");
  requireExisting("ho/asylum-summary-jun-2026.ods");
  requireExisting("ho/illegal-entry-summary-jun-2026.ods");
  requireExisting("mac/fiscal_report_ods_tables.checked.ods");
  requireExisting("ons/aps-cob-nationality-2021.xls");
  requireExisting("ons/emp06aug2026.xls");
  requireExisting("ons/housing-affordability.xlsx");
  requireExisting("geo/itl1-ons-buc.geojson");
  requireExisting("geo/lad-ons-buc.geojson");

  const ewPopWb = readWb("ons/ew-pop-1838-2025.xlsx");
  const myeWb = readWb("ons/mye25tablesew.xlsx");
  const ltimHistWb = readWb("ons/ltim-1964-2015.xls");
  const ltimAdminWb = readWb("ons/ltim-flows-may2026.xlsx");
  const apsWb = readWb("ons/aps-cob-nationality-2021.xls");
  const asyWb = readWb("ho/asylum-summary-jun-2026.ods");
  const ierWb = readWb("ho/illegal-entry-summary-jun-2026.ods");
  const empWb = readWb("ons/emp06aug2026.xls");
  const macWb = readWb("mac/fiscal_report_ods_tables.checked.ods");

  requireSheet(ewPopWb, "ons/ew-pop-1838-2025.xlsx", "Table 7");
  requireSheet(ltimHistWb, "ons/ltim-1964-2015.xls", "Data");
  requireSheet(ltimAdminWb, "ons/ltim-flows-may2026.xlsx", "1");
  requireSheet(apsWb, "ons/aps-cob-nationality-2021.xls", "1.1");
  requireSheet(asyWb, "ho/asylum-summary-jun-2026.ods", "Asy_00a");
  requireSheet(ierWb, "ho/illegal-entry-summary-jun-2026.ods", "IER_01");
  requireSheet(empWb, "ons/emp06aug2026.xls", "Country of birth rates");
  requireSheet(macWb, "mac/fiscal_report_ods_tables.checked.ods", "Figure_10");
  requireSheet(macWb, "mac/fiscal_report_ods_tables.checked.ods", "Table_11");

  const pop = parsePopCsv();
  const ewHist = parseEwHistorical(ewPopWb);
  const gb = parseGb1937(readWb("ons/gb-pop-1937-2014.xls"));
  const regional = parseRegional(readWb("ons/regional-pop-1971-2023.xlsx"));
  const age = parseAgeSex(ewPopWb, myeWb);
  const ltimHist = parseLtimHistorical(ltimHistWb);
  const ltimAdmin = parseLtimAdmin(ltimAdminWb);
  const aps = parseAps(apsWb);
  const nationality = parseApsNationality(apsWb);
  const cobCensus = parseCensusCob(readWb("ons/census-cob-fig4.xlsx"));
  const ethnicity = parseEthnicity(readWb("ons/census-ethnicity-grouped.xlsx"), readWb("ons/census-ethnicity-map.xlsx"));
  const religion = parseReligion(readWb("ons/census-religion-fig1.xlsx"), readWb("ons/census-religion-fig2.xlsx"));
  const births = parseBirths(readWb("ons/births-parents-cob-2025.xlsx"), readWb("ons/births-cob-map.xlsx"));
  const asylum = parseAsylum(asyWb);
  const asylumExtra = parseAsylumExtra(asyWb);
  const boats = parseBoats(ierWb);
  const emp = parseEmp06(empWb);
  const housing = parseHousing(readWb("ons/housing-affordability.xlsx"));
  const mac = parseMac(macWb);
  const cobAge = parseRm011CobAge();
  const scotEilr = parseScotlandEilr();
  const scotBirths = parseScotlandBirths();
  const niCob = parseNisraCob();
  const niEth = parseNisraEthnicity();
  const niRel = parseNisraReligion();
  const niRelBroughtUp = parseNisraReligionBroughtUp();
  const niIdentity = parseNisraIdentity();
  const niCobAge = parseNisraCobAge();
  const niBirths = parseNisraBirths();
  const ukMyePyramids = parseUkMyePyramids();
  const scotCouncilCodes = scotlandCouncilLookup();
  if (!scotEilr) schemaWarn("Scotland Census 2022 EILR chart data missing or unreadable — nation ethnicity/religion/COB×age stay E&W-only");
  if (!niCob) schemaWarn("NISRA MS-A16 missing or unreadable — NI census country-of-birth not spliced");
  if (ukMyePyramids) Object.assign(age.pyramids, ukMyePyramids);

  if (scotEilr?.cob?.shareNonUk != null) {
    const note = `${scotEilr.cob.note} ITL1 TLM is the same Scotland total — not a sub-Scotland estimate.`;
    addPoint(aps.shareNonUk, "S", 2022, scotEilr.cob.shareNonUk, { note });
    addPoint(aps.bornUk, "S", 2022, scotEilr.cob.ukBorn, { note });
    addPoint(aps.bornNonUk, "S", 2022, scotEilr.cob.nonUkBorn, { note });
    addPoint(aps.shareNonUk, "S92000003", 2022, scotEilr.cob.shareNonUk, { note });
    addPoint(aps.shareNonUk, "TLM", 2022, scotEilr.cob.shareNonUk, { note });
  }
  if (niCob?.ni) {
    const note = `${niCob.ni.note} ITL1 TLN is the same NI total — not a sub-NI estimate.`;
    addPoint(aps.shareNonUk, "NI", 2021, niCob.ni.shareNonUk, { note });
    addPoint(aps.bornUk, "NI", 2021, niCob.ni.ukBorn, { note });
    addPoint(aps.bornNonUk, "NI", 2021, niCob.ni.nonUkBorn, { note });
    addPoint(aps.shareNonUk, "N92000002", 2021, niCob.ni.shareNonUk, { note });
    addPoint(aps.shareNonUk, "TLN", 2021, niCob.ni.shareNonUk, { note });
  }
  for (const [y, pts] of Object.entries(scotEilr?.ethnicity?.whiteShare || {})) {
    for (const p of pts) addPoint(ethnicity.whiteShare, y, p.year, p.value, { note: p.note });
  }
  if (niEth?.ni) {
    addPoint(ethnicity.whiteShare, "NI", 2021, niEth.ni.pctWhite, { note: niEth.ni.note });
    addPoint(ethnicity.whiteShare, "N92000002", 2021, niEth.ni.pctWhite, { note: niEth.ni.note });
    addPoint(ethnicity.whiteShare, "TLN", 2021, niEth.ni.pctWhite, { note: `${niEth.ni.note} ITL1 TLN is the NI total.` });
  }
  for (const p of scotEilr?.ethnicity?.whiteShare?.S || []) {
    addPoint(ethnicity.whiteShare, "S92000003", p.year, p.value, { note: p.note });
    addPoint(ethnicity.whiteShare, "TLM", p.year, p.value, { note: `${p.note} ITL1 TLM is the Scotland total.` });
  }
  for (const [geo, pts] of Object.entries(scotEilr?.religion?.christian || {})) {
    for (const p of pts) addPoint(religion.christian, geo, p.year, p.value, { note: p.note });
  }
  for (const [geo, pts] of Object.entries(scotEilr?.religion?.none || {})) {
    for (const p of pts) addPoint(religion.none, geo, p.year, p.value, { note: p.note });
  }
  for (const [geo, pts] of Object.entries(scotEilr?.religion?.muslim || {})) {
    for (const p of pts) addPoint(religion.muslim, geo, p.year, p.value, { note: p.note });
  }
  if (niRel?.ni) {
    if (niRel.ni.pctChristian != null) {
      addPoint(religion.christian, "NI", 2021, niRel.ni.pctChristian, { note: niRel.ni.note });
      addPoint(religion.christian, "N92000002", 2021, niRel.ni.pctChristian, { note: niRel.ni.note });
      addPoint(religion.christian, "TLN", 2021, niRel.ni.pctChristian, { note: niRel.ni.note });
    }
    if (niRel.ni.pctNone != null) {
      addPoint(religion.none, "NI", 2021, niRel.ni.pctNone, { note: niRel.ni.note });
      addPoint(religion.none, "N92000002", 2021, niRel.ni.pctNone, { note: niRel.ni.note });
      addPoint(religion.none, "TLN", 2021, niRel.ni.pctNone, { note: niRel.ni.note });
    }
  }
  for (const p of scotEilr?.religion?.christian?.S || []) {
    addPoint(religion.christian, "S92000003", p.year, p.value, { note: p.note });
    addPoint(religion.christian, "TLM", p.year, p.value, { note: p.note });
  }
  for (const p of scotEilr?.religion?.none?.S || []) {
    addPoint(religion.none, "S92000003", p.year, p.value, { note: p.note });
    addPoint(religion.none, "TLM", p.year, p.value, { note: p.note });
  }
  for (const p of scotEilr?.religion?.muslim?.S || []) {
    addPoint(religion.muslim, "S92000003", p.year, p.value, { note: p.note });
    addPoint(religion.muslim, "TLM", p.year, p.value, { note: p.note });
  }
  if (scotBirths?.share) {
    for (const [geo, pts] of Object.entries(scotBirths.share)) {
      for (const p of pts) addPoint(births.share, geo, p.year, p.value, { note: p.note });
    }
    for (const [geo, pts] of Object.entries(scotBirths.ukMothers || {})) {
      for (const p of pts) addPoint(births.ukMothers, geo, p.year, p.value, { note: p.note });
    }
    for (const [geo, pts] of Object.entries(scotBirths.nonUkMothers || {})) {
      for (const p of pts) addPoint(births.nonUkMothers, geo, p.year, p.value, { note: p.note });
    }
  }
  if (niBirths?.share) {
    for (const [geo, pts] of Object.entries(niBirths.share)) {
      for (const p of pts) addPoint(births.share, geo, p.year, p.value, { note: p.note });
    }
    for (const [geo, pts] of Object.entries(niBirths.ukMothers || {})) {
      for (const p of pts) addPoint(births.ukMothers, geo, p.year, p.value, { note: p.note });
    }
    for (const [geo, pts] of Object.entries(niBirths.nonUkMothers || {})) {
      for (const p of pts) addPoint(births.nonUkMothers, geo, p.year, p.value, { note: p.note });
    }
  }
  for (const row of scotBirths?.council || []) {
    const code = scotCouncilCodes[row.name.toLowerCase()];
    if (!code) continue;
    addPoint(births.regionShare, code, row.year, row.shareNonUk, { note: row.note, name: row.name });
    addPoint(births.share, code, row.year, row.shareNonUk, { note: row.note, name: row.name });
  }
  if (scotEilr?.ethnicity?.composition) {
    ethnicity.composition.S = scotEilr.ethnicity.composition.S;
  }
  if (scotEilr?.religion?.composition) {
    religion.composition.S = scotEilr.religion.composition.S;
  }
  if (niEth?.ni?.groups) {
    ethnicity.composition.NI = { 2021: niEth.ni.groups };
  }
  if (niRel?.ni?.groups) {
    religion.composition.NI = { 2021: niRel.ni.groups };
  }
  sortSeries(aps.shareNonUk);
  sortSeries(aps.bornUk);
  sortSeries(aps.bornNonUk);
  sortSeries(ethnicity.whiteShare);
  sortSeries(religion.christian);
  sortSeries(religion.none);
  sortSeries(religion.muslim);
  sortSeries(births.share);
  sortSeries(births.ukMothers);
  sortSeries(births.nonUkMothers);
  sortSeries(births.regionShare);

  requireSeries(pop, "ONS pop.csv", 20);
  requireSeries(ltimHist.emigration, "IPS-era emigration", 10);
  requireSeries(ltimAdmin.emigration, "admin LTIM emigration", 5);
  requireSeries(ltimAdmin.immigration, "admin LTIM immigration", 5);
  if (!asylum["People claiming asylum"] && !asylum["people claiming asylum"]) {
    const asyKeys = Object.keys(asylum);
    if (!asyKeys.some((k) => /people claiming asylum/i.test(k))) schemaError("Asy_00a missing “People claiming asylum”");
    if (!asyKeys.some((k) => /grants of protection/i.test(k))) schemaError("Asy_00a missing grants row");
    if (!asyKeys.some((k) => /^refusals$/i.test(k))) schemaError("Asy_00a missing refusals row");
    if (!asyKeys.some((k) => /awaiting an initial decision/i.test(k))) schemaError("Asy_00a missing awaiting-decision row");
  }
  if (!Object.keys(boats).some((k) => /small boat/i.test(k))) schemaError("IER_01 missing small-boat detections");
  if (!mac.staticEstimates?.length) schemaError("MAC Figure_10 produced no static estimates");
  if (!fiscalCitations.estimates?.length) schemaError("data/fiscal-citations.json has no estimates");

  const mye = mergePrefer(pop, mergePrefer(ewHist, gb));
  // English ITL1 (E12*) sit in the regional workbook; Wales/Scotland/NI ITL1 = nation totals.
  for (const [geo, pts] of Object.entries(regional)) {
    mye[geo] = pts;
  }
  for (const nation of ["W", "S", "NI"]) {
    const gss = NATIONS[nation].gss;
    if (mye[nation]) mye[gss] = mye[nation];
  }

  const ethItl = rollupLasToItl(ethnicity.las, lookups.ladToItl || {}, { white: "white", total: "total" });
  for (const row of ethItl) {
    if (!row.total) continue;
    addPoint(ethnicity.whiteShare, row.code, 2021, (100 * row.white) / row.total, {
      note: "sum of published 2021 LA counts in this extract, assigned via ONS LAD21 centroids to ITL1",
    });
  }

  const relItl = rollupLasToItl(
    religion.las,
    lookups.ladToItl || {},
    { Christian: "Christian", "No religion": "none", Muslim: "Muslim", total: "total" }
  );
  for (const row of relItl) {
    if (!row.total) continue;
    const extra = { note: "sum of published 2021 LA counts in this extract, assigned via ONS LAD21 centroids to ITL1" };
    if (row.Christian != null) addPoint(religion.christian, row.code, 2021, (100 * row.Christian) / row.total, extra);
    if (row.none != null) addPoint(religion.none, row.code, 2021, (100 * row.none) / row.total, extra);
    if (row.Muslim != null) addPoint(religion.muslim, row.code, 2021, (100 * row.Muslim) / row.total, extra);
  }
  sortSeries(ethnicity.whiteShare);
  sortSeries(religion.christian);
  sortSeries(religion.none);
  sortSeries(religion.muslim);

  const pyramidTotals = {};
  for (const [key, bands] of Object.entries(age.pyramids || {})) {
    const [geo, year] = key.split(":");
    const persons = bands.reduce((n, b) => n + (b.persons || 0), 0);
    addPoint(pyramidTotals, geo, Number(year), persons);
  }
  sortSeries(pyramidTotals);

  const layers = [
    {
      id: "p1-mye-total",
      title: "Mid-year population stock",
      short: "Population",
      coverage: { start: 1940, end: 2025 },
      mapGeos: ["E", "W", "S", "NI"],
      mapLevels: {
        nation: { available: true, yearsFrom: 1971, note: "UK/nation MYE from 1971 in this extract; earlier years are E&W or GB only." },
        region: { available: true, yearsFrom: 1981, yearsTo: 2023, note: "English ITL1 from the regional MYE workbook; Wales/Scotland/NI ITL1 use the published nation totals." },
        la: { available: false, reason: "No local-authority mid-year estimates in this extract. Nomis LA series exist but were not downloaded." },
      },
      confidence: "accredited",
      badges: ["Accredited official statistics", "Wartime definition break 1940–47", "Census rebases"],
      breaks: [
        { year: 1940, label: "Wartime civilian / home / forces-abroad definitions vary (1940–47)" },
        { year: 1941, label: "1941 Census cancelled" },
        { year: 1971, label: "Consistent UK/nation MYE time series in this extract" },
        { year: 2021, label: "Census 2021/22 rebase revises intercensal years" },
        { year: 2025, label: "UK mid-2025 provisional / rounded" },
      ],
      sources: [
        source("ons-mye", "ONS population estimates time series (pop)", "https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationestimates/datasets/populationestimatestimeseriesdataset"),
        source("ons-ew-long", "ONS England & Wales population estimates 1838–2025", "https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationestimates/datasets/estimatesofthepopulationforenglandandwales"),
        source("ons-gb-1937", "ONS Great Britain population estimates 1937–2014 (ad hoc)", "https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationestimates/adhocs/004357greatbritainpopulationestimates1937to2014"),
        source("ons-regional", "ONS regional population estimates 1971–2023", "https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationestimates/datasets/estimatesofthepopulationforenglandandwales"),
      ],
      notes: [
        "UK nation totals in this app follow the ONS pop time series from 1971. Earlier years use the E&W long table and the GB 1937–2014 ad hoc — they are not a single spliced usual-residence definition.",
        "Mid-year estimates count usual residents (UN 12-month concept). They do not count short-term migrants.",
        "Scotland and Northern Ireland are not separately identified in the 1937–2014 GB ad hoc extract used for 1940–1970.",
      ],
      definitions: [
        "Usually resident population: people who live in the UK, or intend to, for 12 months or more.",
      ],
      metrics: [
        { id: "population", label: "Usual residents", unit: "people", format: "count", series: mye },
        { id: "regional", label: "Regional usual residents (E&W)", unit: "people", format: "count", series: regional },
      ],
      defaultMetric: "population",
      mapMetric: "population",
      vizModes: ["absolute", "index"],
    },
    {
      id: "p1-ltim-net",
      title: "Immigration, emigration and net migration",
      short: "Migration flows",
      coverage: { start: 1964, end: 2025 },
      mapGeos: [],
      mapLevels: {
        nation: { available: false, reason: "LTIM in this extract is a UK total only — there is no nation-split flow map." },
        region: { available: false, reason: "No comparable ITL1 LTIM series in this extract." },
        la: { available: false, reason: "No comparable local-authority LTIM series in this extract." },
      },
      noMapReason: "Official LTIM in this extract is a UK national series. There is no comparable historic local-authority flow map.",
      confidence: "mixed",
      badges: ["Method break 1991", "IPS vs admin (do not splice)", "Latest points provisional"],
      breaks: [
        { year: 1964, label: "IPS-based timeline begins (pre-1991 methods differ)" },
        { year: 1991, label: "LTIM 1991+ methodology" },
        { year: 2012, label: "Admin-based LTIM (YE June 2012–); official statistics in development" },
        { year: 2020, label: "IPS disruption / COVID; admin transformation" },
      ],
      sources: [
        source("ons-ltim-ips", "ONS LTIM by citizenship 1964–2015 (ad hoc)", "https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/internationalmigration/adhocs/006408longterminternationalmigrationintoandoutoftheukbycitizenship1964to2015"),
        source("ons-ltim-admin", "ONS long-term international migration flows, provisional (YE Dec 2025)", "https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/internationalmigration/datasets/longterminternationalimmigrationemigrationandnetmigrationflowsprovisional"),
        source("ons-ltim-qmi", "Admin-based LTIM QMI", "https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/internationalmigration/methodologies/adminbasedlongterminternationalmigrationestimatesqmi"),
      ],
      notes: [
        "The 1964–2015 series and the 2012– admin series are shown as separate lines. They are not the same method.",
        "Admin-based chart points use year-ending December only, to avoid plotting four overlapping quarterly vintages as four years.",
        "IPS measured stated intentions; admin-based LTIM observes travel and visa/tax histories. Latest ~four points are revisable.",
        "Emigration is a published series in its own right. Net migration is immigration minus emigration — it is not a substitute for the outflow.",
      ],
      definitions: [
        "Long-term international migrant (UN): a person who changes their country of usual residence for 12 months or more.",
        "Immigration: inflows of long-term migrants. Emigration: outflows. Net migration = immigration − emigration.",
      ],
      extras: {
        flowTrio: ["immig-admin", "emig-admin", "net-admin", "immig-ips", "emig-ips", "net-ips"],
      },
      metrics: [
        { id: "immig-ips", label: "Immigration (IPS-era)", unit: "people", format: "count", series: ltimHist.immigration, flow: "immigration" },
        { id: "emig-ips", label: "Emigration (IPS-era)", unit: "people", format: "count", series: ltimHist.emigration, flow: "emigration" },
        { id: "net-ips", label: "Net migration (IPS-era)", unit: "people", format: "count", series: ltimHist.net, flow: "net" },
        { id: "immig-admin", label: "Immigration (admin LTIM, YE Dec)", unit: "people", format: "count", series: ltimAdmin.immigration, flow: "immigration" },
        { id: "emig-admin", label: "Emigration (admin LTIM, YE Dec)", unit: "people", format: "count", series: ltimAdmin.emigration, flow: "emigration" },
        { id: "net-admin", label: "Net migration (admin LTIM, YE Dec)", unit: "people", format: "count", series: ltimAdmin.net, flow: "net" },
      ],
      defaultMetric: "emig-admin",
      vizModes: ["absolute"],
    },
    {
      id: "p3-emigration",
      title: "Emigration — long-term outflows",
      short: "Emigration",
      coverage: { start: 1964, end: 2025 },
      mapGeos: [],
      mapLevels: {
        nation: { available: false, reason: "LTIM emigration in this extract is a UK total only." },
        region: { available: false, reason: "No ITL1 emigration series in this extract." },
        la: { available: false, reason: "No local-authority emigration series in this extract." },
      },
      noMapReason: "Official LTIM emigration is a UK national series. It is an outflow, not a local stock.",
      confidence: "mixed",
      badges: ["First-class outflow", "Not the inverse of a stock", "IPS vs admin (do not splice)"],
      breaks: [
        { year: 1964, label: "IPS-era emigration timeline begins" },
        { year: 1991, label: "LTIM 1991+ methodology" },
        { year: 2012, label: "Admin-based LTIM emigration (YE December in this extract)" },
      ],
      sources: [
        source("ons-ltim-ips", "ONS LTIM by citizenship 1964–2015 (ad hoc)", "https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/internationalmigration/adhocs/006408longterminternationalmigrationintoandoutoftheukbycitizenship1964to2015"),
        source("ons-ltim-admin", "ONS long-term international migration flows, provisional (YE Dec 2025)", "https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/internationalmigration/datasets/longterminternationalimmigrationemigrationandnetmigrationflowsprovisional"),
      ],
      notes: [
        "This layer is the published emigration series. Immigration is drawn only as context. Net migration lives on the Migration flows layer.",
        "IPS-era and admin-based lines are different methods. Do not splice them.",
      ],
      definitions: [
        "Emigration: people leaving the UK who change their country of usual residence for 12 months or more.",
      ],
      extras: { flowTrio: ["emig-admin", "emig-ips", "immig-admin", "immig-ips"] },
      metrics: [
        { id: "emig-admin", label: "Emigration (admin LTIM, YE Dec)", unit: "people", format: "count", series: ltimAdmin.emigration, flow: "emigration" },
        { id: "emig-ips", label: "Emigration (IPS-era)", unit: "people", format: "count", series: ltimHist.emigration, flow: "emigration" },
        { id: "immig-admin", label: "Immigration (admin LTIM, context)", unit: "people", format: "count", series: ltimAdmin.immigration, flow: "immigration" },
        { id: "immig-ips", label: "Immigration (IPS-era, context)", unit: "people", format: "count", series: ltimHist.immigration, flow: "immigration" },
      ],
      defaultMetric: "emig-admin",
      vizModes: ["absolute"],
    },
    {
      id: "p1-cob-stock",
      title: "Country of birth — UK-born and non-UK-born stock",
      short: "Country of birth",
      identity: "country-of-birth",
      coverage: { start: 2011, end: 2022 },
      mapGeos: ["E", "W", "S", "NI"],
      mapLevels: {
        nation: { available: true, years: [2021, 2022], note: "APS YE June 2021 for all UK nations. Scotland Census 2022 Figure 8 replaces the APS point for Scotland in 2022 only. NISRA MS-A16 is preferred for NI in 2021." },
        region: { available: true, years: [2021, 2022], note: "APS YE June 2021 ITL1. Scotland ITL1 in 2022 uses the Scotland census nation total (TLM = Scotland). NI ITL1 uses NISRA 2021." },
        la: { available: true, years: [2011, 2021], note: "Census 2011 & 2021 E&W % non-UK-born; NISRA MS-A16 LGD 2021; APS YE June 2021 LA estimates where the sample supports them. Scotland council-area COB stocks are not in this extract." },
      },
      confidence: "survey-and-census",
      badges: ["Country of birth ≠ nationality ≠ ethnic group", "APS household survey", "Census LA snapshot"],
      breaks: [
        { year: 2011, label: "Census 2011 country-of-birth (E&W LA percentages)" },
        { year: 2021, label: "Census 2021 (E&W + NISRA MS-A16) and APS YE June 2021 (UK, nations, regions, LAs)" },
        { year: 2022, label: "Scotland’s Census 2022 country of birth (Figure 8). Not an E&W/NI census year." },
      ],
      sources: [
        source("ons-aps", "ONS population by country of birth and nationality (APS, YE June 2021)", "https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/internationalmigration/datasets/populationoftheunitedkingdombycountryofbirthandnationality"),
        source("census-cob", "Census 2021 E&W country of birth / passports (figure data)", "https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/internationalmigration/bulletins/internationalmigrationenglandandwales/census2021"),
        source("nomis-ts012", "Nomis TS012 Country of birth", "https://www.nomisweb.co.uk/datasets/c2021ts012"),
        source("nrs-eilr", "Scotland’s Census 2022 EILR chart data (Figure 8 country of birth by age)", "https://www.scotlandscensus.gov.uk/documents/scotlands-census-2022-ethnic-group-national-identity-language-and-religion-chart-data/"),
        source("nisra-msa16", "NISRA Census 2021 MS-A16 country of birth — basic detail", "https://www.nisra.gov.uk/publications/census-2021-main-statistics-demography-tables-country-birth"),
      ],
      notes: [
        "Country of birth is not nationality and is not ethnicity. A UK-born person may have any ethnic group; a British national may be born abroad.",
        "APS is a household survey: it excludes most communal establishments and totals do not match mid-year estimates.",
        "The main APS bulletin series ends YE June 2021. This build does not invent a post-2021 APS time series.",
        "Scotland’s Census was in 2022. Combining it with E&W/NI 2021 as a single UK census year would be a date mismatch. 2022 map colour for Scotland is the census Figure 8 UK-born / overseas split; E&W and NI stay dimmed that year.",
        "NISRA MS-A16 UK-born is NI + England + Scotland + Wales only. The published ‘Other non-EU’ residual can include United Kingdom (part not specified) and is not added into UK-born.",
        "Scotland council-area country-of-birth stocks (UV204) exist via Search the Census but no stable bulk file was retrieved for this extract — those LAs stay labelled no comparable data.",
      ],
      definitions: [
        "Country of birth (this layer): where a usual resident was born. It is not a passport, not a nationality, and not an ethnic group.",
        "APS Table 1.1 labels: ‘United Kingdom’ / ‘Non-United Kingdom’ country-of-birth groups as published (YE June 2021). The workbook’s Country Groupings sheet includes the Crown Dependencies in the UK-born group — that is the producer’s grouping, not a synonym for British nationality.",
      ],
      metrics: [
        { id: "uk-born", label: "UK-born usual residents (country of birth, APS YE Jun 2021)", unit: "people", format: "count", series: aps.bornUk },
        { id: "non-uk-born", label: "Non-UK-born usual residents (country of birth, APS YE Jun 2021)", unit: "people", format: "count", series: aps.bornNonUk },
        { id: "share-non-uk", label: "Non-UK-born share of usual residents (country of birth, APS)", unit: "%", format: "percent", series: aps.shareNonUk },
      ],
      extras: {
        las: cobCensus.las,
        apsLas: aps.las.slice(0, 400),
        niLas: (niCob?.lgd || []).map((r) => ({ code: r.code, name: r.name, year: 2021, shareNonUk: r.shareNonUk, ukBorn: r.ukBorn, nonUkBorn: r.nonUkBorn })),
      },
      snapshotYears: [2011, 2021, 2022],
      defaultMetric: "share-non-uk",
      mapMetric: "share-non-uk",
      vizModes: ["share", "absolute"],
    },
    {
      id: "p1-nationality-stock",
      title: "Nationality — British and non-British stock",
      short: "Nationality",
      identity: "nationality",
      coverage: { start: 2021, end: 2021 },
      mapGeos: ["E", "W", "S", "NI"],
      mapLevels: {
        nation: { available: true, years: [2021], note: "APS YE June 2021 Table 2.1 nation totals." },
        region: { available: true, years: [2021], note: "APS YE June 2021 ITL1 / English-region nationality stocks." },
        la: { available: true, years: [2021], note: "APS YE June 2021 LA estimates where the sample is large enough; suppressed cells stay blank." },
      },
      confidence: "survey",
      badges: ["Nationality ≠ country of birth ≠ ethnic group", "APS household survey", "YE June 2021 only"],
      breaks: [{ year: 2021, label: "APS YE June 2021 nationality stocks (Table 2.1)" }],
      sources: [
        source("ons-aps-nat", "ONS population by country of birth and nationality (APS, YE June 2021), Table 2.1", "https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/internationalmigration/datasets/populationoftheunitedkingdombycountryofbirthandnationality"),
      ],
      notes: [
        "Nationality is self-reported citizenship in the APS. A British national may be born abroad; a UK-born resident may hold another nationality.",
        "Do not read this layer as ‘native’ or as White British. Those are different questions.",
        "APS excludes most communal establishments. Totals do not match mid-year estimates.",
        "The main APS bulletin series ends YE June 2021. No later nationality stock is invented here.",
        "Scotland Figure 9 and NISRA MS-B15 are national identity (feeling of attachment), not citizenship. They are never written onto this layer.",
      ],
      definitions: [
        "British: APS Table 2.1 ‘British Estimate’ — British nationality, not country of birth.",
        "Non-British: APS Table 2.1 ‘Non-British Estimate’ — any other reported nationality.",
      ],
      metrics: [
        { id: "british", label: "British nationality (APS YE Jun 2021)", unit: "people", format: "count", series: nationality.british },
        { id: "non-british", label: "Non-British nationality (APS YE Jun 2021)", unit: "people", format: "count", series: nationality.nonBritish },
        { id: "share-non-british", label: "Non-British nationality share (APS)", unit: "%", format: "percent", series: nationality.shareNonBritish },
      ],
      extras: { apsLas: nationality.las.slice(0, 400) },
      snapshotYears: [2021],
      defaultMetric: "share-non-british",
      mapMetric: "share-non-british",
      vizModes: ["share", "absolute"],
    },
    {
      id: "p2-identity-compare",
      title: "Identity compare — birthplace, nationality, ethnic group",
      short: "Identity (compare)",
      identity: "compare",
      coverage: { start: 2021, end: 2022 },
      mapGeos: ["E", "W", "S", "NI"],
      mapLevels: {
        nation: { available: true, years: [2021, 2022], note: "Side-by-side figures. 2021 is the only year with all three questions for E&W and NI. Scotland ethnicity/religion/COB census is 2022. National identity (census) is shown separately — it is not nationality." },
        region: { available: true, years: [2021, 2022], note: "APS birthplace and nationality at ITL1; ethnicity ITL1 is the sum of published E&W LA census counts plus Scotland/NI nation census where dated." },
        la: { available: true, years: [2021], note: "Census % non-UK-born (E&W), NISRA LGD 2021, APS nationality, and census ethnic group where each source has a row. Scotland council stocks are not in this extract." },
      },
      confidence: "mixed",
      badges: ["Three different questions", "Never ‘native’", "Do not splice the three series"],
      breaks: [{ year: 2021, label: "Only year in this extract with all three identity questions populated" }],
      sources: [
        source("ons-aps", "ONS APS YE June 2021 country of birth and nationality", "https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/internationalmigration/datasets/populationoftheunitedkingdombycountryofbirthandnationality"),
        source("census-eth", "Census 2021 ethnic group, England and Wales", "https://www.ons.gov.uk/peoplepopulationandcommunity/culturalidentity/ethnicity/bulletins/ethnicgroupenglandandwales/census2021"),
        source("census-cob", "Census 2021 E&W country of birth figure data", "https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/internationalmigration/bulletins/internationalmigrationenglandandwales/census2021"),
        source("nrs-eilr", "Scotland’s Census 2022 EILR chart data", "https://www.scotlandscensus.gov.uk/documents/scotlands-census-2022-ethnic-group-national-identity-language-and-religion-chart-data/"),
        source("nisra-msb01", "NISRA Census 2021 MS-B01 ethnic group", "https://www.nisra.gov.uk/publications/census-2021-main-statistics-ethnicity-tables"),
        source("nisra-msb15", "NISRA Census 2021 MS-B15 national identity", "https://www.nisra.gov.uk/publications/census-2021-main-statistics-identity-tables"),
      ],
      notes: [
        "These columns answer different published questions. A high non-UK-born share is not a non-British share and is not a non-White share.",
        "The word ‘native’ is not used: it conflates birthplace, nationality, and ethnicity.",
        "Ethnicity ITL1 values for England are sums of the published 2021 LA counts in this extract, assigned to ITL1 with ONS LAD21 centroids. Scotland and NI ITL1 use the nation census figures (different dates and category lists).",
        "Census national identity (Scotland Figure 9; NISRA MS-B15) is a feeling of attachment. It is not APS nationality and is not written onto the nationality layer.",
      ],
      definitions: [
        "Country of birth: where the person was born (APS / census).",
        "Nationality: reported citizenship (APS Table 2.1).",
        "Ethnic group: self-identified high-level group (Census 2021).",
      ],
      metrics: [
        { id: "share-non-uk", label: "Non-UK-born share (country of birth, APS)", unit: "%", format: "percent", series: aps.shareNonUk },
        { id: "share-non-british", label: "Non-British nationality share (APS)", unit: "%", format: "percent", series: nationality.shareNonBritish },
        { id: "pct-white", label: "White high-level share (Census 2021 ethnic group)", unit: "%", format: "percent", series: ethnicity.whiteShare },
      ],
      extras: {
        compare: true,
        cobLas: cobCensus.las,
        cobApsLas: aps.las.slice(0, 400),
        natApsLas: nationality.las.slice(0, 400),
        ethLas: ethnicity.las.map(({ groups, ...rest }) => rest),
        niCobLas: niCob?.lgd || [],
        niEthLas: (niEth?.lgd || []).map(({ groups, ...rest }) => rest),
        scotIdentity: scotEilr?.nationalIdentity || null,
        niIdentity,
        concordance: concordanceNotes(),
      },
      snapshotYears: [2021, 2022],
      defaultMetric: "share-non-uk",
      mapMetric: "share-non-uk",
      vizModes: ["share", "compare"],
    },
    {
      id: "p1-ethnicity-census",
      title: "Ethnic group (census snapshots)",
      short: "Ethnic group",
      identity: "ethnicity",
      coverage: { start: 2011, end: 2022 },
      mapGeos: ["E", "W", "S", "NI"],
      mapLevels: {
        nation: { available: true, years: [2011, 2021, 2022], note: "E&W high-level White in 2011/2021. Scotland White heading in 2011/2022 (includes Irish/Polish/Other White). NISRA MS-B01 White in 2021 excludes Irish Traveller and Roma. These are not the same category." },
        region: { available: true, years: [2021, 2022], note: "2021 ITL1 England = sum of published E&W LA counts. Scotland/NI ITL1 use the nation census figures for their census year." },
        la: { available: true, years: [2021], note: "2021 E&W local authorities from the census map extract; NISRA MS-B01 LGDs. Scotland council ethnicity stocks are not in this extract (Figure 6 is Polish only and is not used as a White share)." },
      },
      noMapYearsOutside: "No comparable UK ethnicity question before 1991. This extract has E&W 2011 and 2021 high-level groups; 1991/2001 concordance is not in the downloaded files.",
      confidence: "census-snapshot",
      badges: ["No pre-1991 series", "Categories change between censuses", "Nation concordance required"],
      breaks: [
        { year: 1991, label: "First census ethnicity question (not in this extract)" },
        { year: 2001, label: "Mixed category added (not in this extract)" },
        { year: 2011, label: "E&W high-level groups and Scotland Figure 5 in this extract" },
        { year: 2021, label: "E&W Census 2021 and NISRA MS-B01; write-in detail expanded" },
        { year: 2022, label: "Scotland’s Census 2022 (not an E&W/NI census year)" },
      ],
      sources: [
        source("census-eth", "Census 2021 ethnic group, England and Wales", "https://www.ons.gov.uk/peoplepopulationandcommunity/culturalidentity/ethnicity/bulletins/ethnicgroupenglandandwales/census2021"),
        source("nomis-ts021", "Nomis TS021 Ethnic group", "https://www.nomisweb.co.uk/datasets/c2021ts021"),
        source("nrs-eilr", "Scotland’s Census 2022 EILR chart data (Figure 5 ethnic groups)", "https://www.scotlandscensus.gov.uk/documents/scotlands-census-2022-ethnic-group-national-identity-language-and-religion-chart-data/"),
        source("nisra-msb01", "NISRA Census 2021 MS-B01 ethnic group", "https://www.nisra.gov.uk/publications/census-2021-main-statistics-ethnicity-tables"),
      ],
      notes: [
        "Ethnicity is self-identified and is not country of birth or nationality.",
        "E&W ‘White’ includes White British, White Irish, Gypsy or Irish Traveller, Roma (2021), and Other White. It is not a synonym for UK-born.",
        "Scotland Figure 5 White heading is 100 minus the published non-White heading groups. NRS ‘minority ethnic’ (Figure 4) also includes White minorities — that series is not plotted as the complement of E&W White.",
        "NISRA MS-B01 lists Irish Traveller and Roma as separate columns from White. Do not read the NI White share as the E&W high-level White share.",
      ],
      definitions: [
        "High-level ethnic groups follow the ONS 2021 five-group presentation used in the cited bulletin figure.",
      ],
      metrics: [
        { id: "pct-white", label: "White share (census heading as published — see concordance)", unit: "%", format: "percent", series: ethnicity.whiteShare },
        ...(scotEilr?.ethnicity?.minorityShare?.S
          ? [{ id: "pct-minority-scot", label: "Scotland minority-ethnic share (NRS definition, includes some White minorities)", unit: "%", format: "percent", series: scotEilr.ethnicity.minorityShare }]
          : []),
      ],
      extras: {
        composition: ethnicity.composition,
        las: ethnicity.las.map(({ groups, ...rest }) => rest),
        niLas: (niEth?.lgd || []).map(({ groups, ...rest }) => rest),
      },
      snapshotYears: [2011, 2021, 2022],
      defaultMetric: "pct-white",
      mapMetric: "pct-white",
      vizModes: ["share", "composition"],
    },
    {
      id: "p1-religion-census",
      title: "Religion (census snapshots)",
      short: "Religion",
      coverage: { start: 2011, end: 2022 },
      mapGeos: ["E", "W", "S", "NI"],
      mapLevels: {
        nation: { available: true, years: [2011, 2021, 2022], note: "E&W 2011/2021 affiliation. Scotland 2011/2022 current religion (not stated is a residual). NISRA MS-B19 2021 current religion. MS-B23 religion-brought-up-in is a separate NI concept." },
        region: { available: true, years: [2021, 2022], note: "2021 ITL1 England = sum of published E&W LA counts. Scotland/NI ITL1 use nation census figures for their census year." },
        la: { available: true, years: [2021], note: "2021 E&W local authorities from the census map extract; NISRA MS-B19 LGDs. Scotland council religion stocks are not in this extract." },
      },
      confidence: "census-snapshot",
      badges: ["Voluntary question", "No modern affiliation series before 2001", "Nation concordance required"],
      breaks: [
        { year: 2001, label: "First modern affiliation question (2001 counts cited in bulletin text; 2011/21/22 in this extract)" },
        { year: 2011, label: "E&W Census 2011 and Scotland Figure 2" },
        { year: 2021, label: "E&W Census 2021 and NISRA MS-B19" },
        { year: 2022, label: "Scotland’s Census 2022 current religion (not an E&W/NI census year)" },
      ],
      sources: [
        source("census-rel", "Census 2021 religion, England and Wales", "https://www.ons.gov.uk/peoplepopulationandcommunity/culturalidentity/religion/bulletins/religionenglandandwales/census2021"),
        source("nrs-eilr", "Scotland’s Census 2022 EILR chart data (Figure 2 religion)", "https://www.scotlandscensus.gov.uk/documents/scotlands-census-2022-ethnic-group-national-identity-language-and-religion-chart-data/"),
        source("nisra-msb19", "NISRA Census 2021 MS-B19 religion", "https://www.nisra.gov.uk/publications/census-2021-main-statistics-religion-tables"),
        source("nisra-msb23", "NISRA Census 2021 MS-B23 religion or religion brought up in", "https://www.nisra.gov.uk/publications/census-2021-main-statistics-religion-tables"),
      ],
      notes: [
        "The religion question is voluntary. Non-response is a category, not missing data to be filled in. Scotland publishes ‘Not stated’ without imputing a religion.",
        "1851 worship-attendance counts are not comparable to modern affiliation.",
        "Northern Ireland’s ‘religion brought up in’ (MS-B23) is a different question and is shown only as a cited composition extra — it is not mixed into the Christian / no-religion map percentages.",
        "NISRA MS-B19 has no standalone Muslim column. The Muslim metric stays blank for NI (Other religions is not treated as Muslim).",
        "Scotland Christian % is Church of Scotland + Roman Catholic + Other Christian as published. That is not silently treated as the E&W Christian tick-box.",
      ],
      metrics: [
        { id: "christian", label: "Christian % (nation-specific grouping — see notes)", unit: "%", format: "percent", series: religion.christian },
        { id: "none", label: "No religion % (current religion as published)", unit: "%", format: "percent", series: religion.none },
        { id: "muslim", label: "Muslim % (where a standalone category is published)", unit: "%", format: "percent", series: religion.muslim },
      ],
      extras: {
        composition: religion.composition,
        las: religion.las.map((r) => ({ code: r.code, name: r.name, year: 2021, pctChristian: r.pctChristian, pctNone: r.pctNone, pctMuslim: r.pctMuslim })),
        niLas: (niRel?.lgd || []).map((r) => ({ code: r.code, name: r.name, year: 2021, pctChristian: r.pctChristian, pctNone: r.pctNone, pctMuslim: r.pctMuslim })),
        niBroughtUp: niRelBroughtUp,
      },
      snapshotYears: [2011, 2021, 2022],
      defaultMetric: "christian",
      mapMetric: "christian",
      vizModes: ["share", "composition"],
    },
    {
      id: "p1-age-sex",
      title: "Age–sex structure",
      short: "Age–sex",
      coverage: { start: 2021, end: 2025 },
      mapGeos: ["E", "W", "S", "NI"],
      mapLevels: {
        nation: { available: true, years: [2024, 2025], note: "Mid-2025 E&W/England pyramids from the E&W MYE workbook. Mid-2024 UK/nation pyramids (including Scotland and NI) from ONS UK MYE2." },
        region: { available: true, years: [2024, 2025], note: "English ITL1 from mid-2025 MYE2. Wales/Scotland/NI ITL1 use the nation mid-2024 UK MYE2 pyramids." },
        la: { available: false, reason: "No local-authority age–sex pyramid in this extract." },
      },
      confidence: "accredited",
      badges: ["Mid-2025 E&W / regions", "Mid-2024 UK nations", "COB×age is census, not MYE"],
      breaks: [
        { year: 2021, label: "NISRA MS-A31 country of birth by broad age (NI, persons)" },
        { year: 2022, label: "Scotland Census Figure 8 country of birth by age (persons, not sex)" },
        { year: 2024, label: "ONS UK MYE2 mid-2024 age–sex for UK nations" },
        { year: 2025, label: "ONS mid-2025 E&W / English-region pyramids" },
      ],
      sources: [
        source("ons-mye-age", "ONS mid-2025 population estimates, England and Wales", "https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationestimates/datasets/estimatesofthepopulationforenglandandwales"),
        source("ons-mye-uk", "ONS mid-2024 population estimates for UK, England and Wales, Scotland and Northern Ireland", "https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationestimates/datasets/populationestimatesforukenglandandwalesscotlandandnorthernireland"),
        source("nrs-eilr", "Scotland’s Census 2022 EILR Figure 8 — country of birth by age", "https://www.scotlandscensus.gov.uk/documents/scotlands-census-2022-ethnic-group-national-identity-language-and-religion-chart-data/"),
        source("nisra-msa31", "NISRA Census 2021 MS-A31 country of birth by broad age", "https://www.nisra.gov.uk/publications/census-2021-main-statistics-demography-tables-country-birth"),
      ],
      notes: [
        "Mid-year pyramids are usual residents by age and sex. They are not birthplace- or nationality-specific.",
        cobAge
          ? "A Census 2021 E&W country-of-birth-by-age table (ONS RM011) is attached where the download parsed. It is age by birthplace, not a sex split, and not a MYE pyramid."
          : "Age × country-of-birth for E&W is ONS RM011 (Census 2021). The optional CSV was not present or did not parse in this build — no E&W birthplace pyramid is invented.",
        "Scotland Figure 8 is persons by age and country-of-birth group (Scotland / Rest of UK / Overseas). It is not a male/female pyramid.",
        "NISRA MS-A31 is persons by broad age and country of birth. UK-born is the four UK countries only.",
      ],
      metrics: [{ id: "persons", label: "Usual residents (sum of published age bands)", unit: "people", format: "count", series: pyramidTotals }],
      extras: {
        pyramids: age.pyramids,
        cobAge: cobAge || null,
        cobAgeScot: scotEilr?.cobAge || null,
        cobAgeNi: niCobAge || null,
      },
      defaultMetric: "persons",
      mapMetric: "persons",
      vizModes: ["pyramid"],
    },
    {
      id: "p1-births-cob",
      title: "Births by mother’s country of birth",
      short: "Births",
      coverage: { start: 2008, end: 2025 },
      mapGeos: ["E", "W", "S", "NI"],
      mapLevels: {
        nation: { available: true, yearsFrom: 2008, note: "E&W 2008–2025 (ONS Table 1). Scotland selected years from NRS Table 3.13. NI 2014–2024 from NISRA RGAR Table 3.18. These are three vital-registration systems, not one UK series." },
        region: { available: true, yearsFrom: 2016, yearsTo: 2024, note: "E&W regional share from the 2023 bulletin figure (either parent born outside the UK) for 2016–22. Scotland council-area mother’s-COB shares for 2024 from NRS Table 3.09." },
        la: { available: true, years: [2024], note: "Scotland council areas, 2024 mother’s country of birth (NRS Table 3.09). E&W and NI local-authority mother’s-COB tables are not in this extract." },
      },
      confidence: "accredited",
      badges: ["E&W / Scotland / NI vital registration", "Birthplace ≠ ethnicity", "Not one UK series"],
      breaks: [
        { year: 1969, label: "Parents’ country of birth collected at E&W registration from April 1969 (earlier years not in this workbook)" },
        { year: 2008, label: "Start of the consistent E&W table ingested from the 2025 workbook" },
        { year: 2014, label: "Start of NISRA RGAR Table 3.18 and NRS Table 3.13 in this extract" },
      ],
      sources: [
        source("ons-births", "ONS births by parents’ country of birth, England and Wales", "https://www.ons.gov.uk/peoplepopulationandcommunity/birthsdeathsandmarriages/livebirths/datasets/parentscountryofbirth"),
        source("ons-births-map", "ONS 2023 bulletin figure (regional shares 2016–2022)", "https://www.ons.gov.uk/peoplepopulationandcommunity/birthsdeathsandmarriages/livebirths/bulletins/parentscountryofbirthenglandandwales/2023"),
        source("nrs-ve-3", "NRS Vital Events Reference Tables 2024, chapter 3 (Tables 3.09 and 3.13)", "https://www.nrscotland.gov.uk/publications/vital-events-reference-tables-2024/"),
        source("nisra-rgar-births", "NISRA Registrar General Annual Report 2024 births tables (Table 3.18)", "https://www.nisra.gov.uk/publications/registrar-general-annual-report-2023-births"),
      ],
      notes: [
        "A birth to a non-UK-born mother is not a measure of the mother’s ethnicity, nationality, or long-term migrant status.",
        "E&W, Scotland and Northern Ireland are separate vital-registration systems. They are drawn as separate geographies, not spliced into one UK line.",
        "The E&W 2025 workbook’s Table 1 covers 2008–2025. NRS Table 3.13 in this extract has 2014, 2019 and 2022–2024. NISRA Table 3.18 is 2014–2024.",
        "The E&W regional 2016–22 figure is either parent born outside the UK — not the same as mother’s birthplace alone. Scotland 2024 council shares are mother’s country of birth.",
      ],
      metrics: [
        { id: "share-non-uk-mother", label: "Births to non-UK-born mothers (as published by each producer)", unit: "%", format: "percent", series: births.share },
        { id: "births-non-uk", label: "Births to non-UK-born mothers", unit: "births", format: "count", series: births.nonUkMothers },
        { id: "births-uk", label: "Births to UK-born mothers", unit: "births", format: "count", series: births.ukMothers },
        { id: "region-share", label: "Subnational share (E&W either-parent 2016–22; Scotland mother’s COB 2024)", unit: "%", format: "percent", series: births.regionShare },
      ],
      defaultMetric: "share-non-uk-mother",
      mapMetric: "share-non-uk-mother",
      vizModes: ["share", "absolute"],
    },
    {
      id: "p1-asylum",
      title: "Asylum claims, decisions and awaiting decision",
      short: "Asylum",
      coverage: { start: 2010, end: 2026 },
      mapGeos: [],
      mapLevels: {
        nation: { available: false, reason: "UK totals only in this extract." },
        region: { available: false, reason: "No ITL1 asylum series in this summary extract." },
        la: { available: false, reason: "Local support tables exist in other HO files and are not mapped here." },
      },
      noMapReason: "Home Office asylum summary tables in this extract are UK totals (people). Local support data exist in other HO files and are not mapped here.",
      confidence: "accredited",
      badges: ["People, not cases — labelled", "WIP / backlog definitions change", "Appeals incomplete after 2022"],
      breaks: [
        { year: 2010, label: "Start of this summary-table extract" },
        { year: 2022, label: "Appeals columns suppressed in later years of Asy_00a" },
      ],
      sources: [
        source("ho-asy", "Home Office asylum summary tables, YE June 2026", "https://www.gov.uk/government/statistical-data-sets/immigration-system-statistics-data-tables"),
        source("ho-asy-chapter", "How many people are in the UK asylum system", "https://www.gov.uk/government/statistics/immigration-system-statistics-year-ending-june-2026/how-many-people-are-in-the-uk-asylum-system"),
      ],
      notes: [
        "The default chart is claims, grants, refusals, and people awaiting an initial decision — four different published rows, not one backlog concept.",
        "Grant rate is at initial decision and excludes withdrawals depending on the table.",
        "Asy_02a grant types and Asy_03a waiting-time bands are extra series from the same YE June 2026 summary workbook. History is not extended beyond those tables.",
        "Do not back-cast modern ‘work in progress’ concepts into 1940–1970s.",
      ],
      definitions: [
        "People claiming asylum: main applicants plus dependants in the summary people count.",
        "Grants / refusals: initial decisions in that year (flow), not a stock.",
        "Awaiting an initial decision: stock at year end, not a lifetime backlog of every later stage.",
      ],
      extras: {
        throughputIds: [
          "people-claiming-asylum",
          "grants-of-protection-or-other-leave",
          "refusals",
          "people-awaiting-an-initial-decision",
        ],
      },
      metrics: [
        ...Object.entries(asylum).map(([name, series]) => ({
          id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/g, ""),
          label: name,
          unit: /rate|%/i.test(name) ? "%" : "people",
          format: /rate|%/i.test(name) ? "percent" : "count",
          series,
          group: /awaiting/i.test(name) ? "stock" : /grant|refusal|withdrawal|claim/i.test(name) ? "flow" : "other",
        })),
        ...Object.entries(asylumExtra.grants || {}).map(([name, series]) => ({
          id: `asy02a-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/g, "")}`,
          label: `${name} (Asy_02a grant / resettlement types)`,
          unit: "people",
          format: "count",
          series,
          group: "grant-type",
        })),
        ...Object.entries(asylumExtra.awaiting || {}).map(([name, series]) => ({
          id: `asy03a-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/g, "")}`,
          label: `${name} (Asy_03a awaiting by duration)`,
          unit: "people",
          format: "count",
          series,
          group: "awaiting-duration",
        })),
      ],
      defaultMetric: "people-claiming-asylum",
      vizModes: ["absolute"],
    },
    {
      id: "p1-small-boats",
      title: "Detected small-boat and illegal-entry-route arrivals",
      short: "Detections",
      coverage: { start: 2018, end: 2026 },
      mapGeos: [],
      mapLevels: {
        nation: { available: false, reason: "National detection totals — not a stock map." },
        region: { available: false, reason: "No regional detection map. Detections are not a local population." },
        la: { available: false, reason: "No local-authority detection map." },
      },
      noMapReason: "These are national operational detection counts, not a map of an undetected population.",
      confidence: "operational",
      badges: ["DETECTIONS only", "Not a stock of people without permission", "Not visa overstays"],
      breaks: [{ year: 2018, label: "Small-boat detection series from 1 January 2018" }],
      sources: [
        source("ho-ier", "Home Office illegal entry routes summary, YE June 2026", "https://www.gov.uk/government/statistical-data-sets/immigration-system-statistics-data-tables"),
        source("ho-user", "HO irregular / illegal-entry statistics user guide", "https://www.gov.uk/government/publications/home-office-irregular-migration-to-the-uk-statistics-user-guide/home-office-irregular-migration-to-the-uk-statistics-user-guide"),
      ],
      notes: [
        "Each IER_01 row is a separate detection series. Small-boat detections are not the same as ‘recorded detections in the UK’ or inadequately documented air arrivals.",
        "These series count detected arrivals by recorded method of entry. They are not an estimate of total irregular presence, undetected entries, or visa overstays.",
        "The Home Office does not publish a stock of people in the UK without permission from this series.",
        "French preventions are a separate operational series and are not included.",
        "Provisional daily Channel figures can differ from these quality-assured annual totals.",
      ],
      terminology: [
        "Prefer: detected small-boat arrivals; detected arrivals via other illegal entry routes.",
        "Do not say: illegal immigrant population; total illegal immigration.",
      ],
      extras: {
        detectionGroups: {
          "small-boat": "Detected small-boat arrivals (not an illegal stock)",
          "other-detection": "Other recorded illegal-entry-route detections",
        },
      },
      metrics: Object.entries(boats).map(([name, series]) => ({
        id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/g, ""),
        label: name,
        unit: "detections",
        format: "count",
        series,
        group: detectionGroup(name),
      })),
      defaultMetric: "small-boat-arrivals",
      vizModes: ["absolute"],
    },
    {
      id: "p1-labour-housing",
      title: "Labour market and housing context",
      short: "Labour & housing",
      coverage: { start: 1997, end: 2025 },
      mapGeos: ["E", "W"],
      mapLevels: {
        nation: { available: true, note: "Employment rates are UK LFS. Affordability maps England & Wales." },
        region: { available: true, note: "House-price-to-earnings ratios for English ITL1 and Wales." },
        la: { available: false, reason: "The ingested affordability sheet (1c) is nations and regions only — no LA column set in this extract." },
      },
      confidence: "accredited",
      badges: ["Context, not causation", "LFS quality caveats", "Affordability ≠ migration impact"],
      breaks: [
        { year: 2020, label: "COVID LFS mode change" },
        { year: 2025, label: "EMP06 note on 2025 LFS estimates" },
      ],
      sources: [
        source("ons-emp06", "ONS EMP06 employment by country of birth and nationality", "https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/employmentandemployeetypes/datasets/employmentbycountryofbirthandnationalityemp06/current"),
        source("ons-aff", "ONS house-price-to-workplace-earnings ratio", "https://www.ons.gov.uk/peoplepopulationandcommunity/housing/datasets/ratioofhousepricetoworkplacebasedearningslowerquartileandmedian"),
      ],
      notes: [
        "Employment rates by country of birth and by nationality are LFS/APS-based and should not be read as a causal migration-impact layer.",
        "Country of birth and nationality are different EMP06 sheets. They are not interchangeable.",
        "Housing affordability is median price to workplace-based earnings. It is not a measure of the fiscal or demographic ‘effect’ of migration. Headline ASHE pay is not migrant-specific, so this extract does not invent a migrant wage series — only EMP06 employment rates.",
        "Oct–Dec quarters are plotted as the calendar year for the employment-rate series.",
      ],
      metrics: [
        { id: "emp-uk-born", label: "Employment rate, UK-born (Oct–Dec)", unit: "%", format: "percent", series: { UK: emp.rates["UK-born"] || [] } },
        { id: "emp-non-uk-born", label: "Employment rate, non-UK-born (Oct–Dec)", unit: "%", format: "percent", series: { UK: emp.rates["non-UK-born"] || [] } },
        { id: "emp-uk-nationality", label: "Employment rate, UK nationality (Oct–Dec)", unit: "%", format: "percent", series: { UK: emp.nationality["UK-nationality"] || [] } },
        { id: "emp-non-uk-nationality", label: "Employment rate, non-UK nationality (Oct–Dec)", unit: "%", format: "percent", series: { UK: emp.nationality["non-UK-nationality"] || [] } },
        { id: "affordability", label: "Median house-price-to-earnings ratio", unit: "ratio", format: "ratio", series: housing.ratio },
      ],
      defaultMetric: "emp-non-uk-born",
      mapMetric: "affordability",
      vizModes: ["absolute"],
    },
    {
      id: "p1-fiscal-notes",
      title: "Fiscal impact — contested evidence",
      short: "Fiscal (contested)",
      coverage: { start: 1995, end: 2025 },
      mapGeos: [],
      mapLevels: {
        nation: { available: false, reason: "Contested model results — not a mapped official series." },
        region: { available: false, reason: "No regional fiscal-impact official series." },
        la: { available: false, reason: "No local-authority fiscal-impact official series." },
      },
      noMapReason: "There is no official mapped ‘cost of migration’ series. This panel is methods and published model results, not a fact layer.",
      confidence: "modelled-contested",
      badges: ["Not a single cost", "Static ≠ dynamic", "Route- and assumption-specific"],
      breaks: [],
      sources: [
        source("mac-2025", "Migration Advisory Committee, The fiscal impact of immigration in the UK", "https://www.gov.uk/government/publications/the-fiscal-impact-of-immigration-in-the-uk"),
        source("obr-frs", "OBR Fiscal risks and sustainability", "https://obr.uk/frs/fiscal-risks-and-sustainability-july-2026/"),
        source("migobs", "Migration Observatory fiscal-impact briefing", "https://migrationobservatory.ox.ac.uk/resources/briefings/the-fiscal-impact-of-immigration-in-the-uk/"),
        source("df2014", "Dustmann & Frattini (2014), The Fiscal Effects of Immigration to the UK", "https://ideas.repec.org/a/wly/econjl/v124y2014i580pf593-f643.html", { license: "Journal / cite only" }),
      ],
      notes: [
        "There is no official mapped ‘cost of immigration’. The assumption controls filter published estimates — they do not compute a new true net figure.",
        "Static annual snapshots, lifetime NPVs, and OBR age-profile scenarios can differ in sign depending on the visa route, dependants, public-goods allocation, and time window.",
        "MAC Figure 10 values are the committee’s published static net estimates for specific 2022/23-style groups — not a UK-wide migrant-stock total.",
        "MAC Table 23 is lifetime cohort totals in £ million for the 2022/23 visa cohort. Do not add it to Dustmann–Frattini period billions.",
        "Employment and housing charts on this panel are context only. They are not causal proof of a fiscal effect.",
      ],
      extras: {
        methods: [
          { name: "OBR FRS / EFO", frame: "Age-specific tax and spend profiles applied to population projections with net-migration variants. Sensitive to the ONS long-run migration settle and to assumed earnings/length of stay. Usually a debt-path scenario, not a £ per migrant." },
          { name: "MAC 2025 lifetime / static", frame: "Cohort and visa-route model (Skilled Worker, Health & Care, dependants, Partner route). Discount rate (~3%) and lifetime assumptions drive NPV. Not the whole stock." },
          { name: "Dustmann–Frattini 2014", frame: "Static period accounting ~1995–2011/12, EEA vs non-EEA. Foundational in debate; not official statistics and not current. The 2013 discussion paper quotes different totals for the same window." },
          { name: "Migration Observatory briefing", frame: "Secondary synthesis (23 June 2026). Table 1 is the reason estimates disagree: children, public goods, recent vs all-resident, and year all move the sign." },
        ],
        assumptionAxes: fiscalCitations.assumptionAxes || [],
        citedEstimates: fiscalCitations.estimates || [],
        macStatic: mac.staticEstimates,
        macSensitivities: mac.sensitivities,
        macLifetime: mac.lifetimeCohorts,
        contextMetricIds: {
          labour: ["emp-uk-born", "emp-non-uk-born", "emp-uk-nationality", "emp-non-uk-nationality"],
          housing: ["affordability"],
        },
      },
      metrics: [],
      vizModes: ["panel"],
    },
  ];

  // Drop empty metrics
  for (const layer of layers) {
    layer.metrics = (layer.metrics || []).filter((m) => yearsOfSeries(m.series).length);
    layer.years = [...new Set(layer.metrics.flatMap((m) => yearsOfSeries(m.series)))].sort((a, b) => a - b);
    if (!layer.years.length && layer.extras?.pyramids) {
      layer.years = [...new Set(Object.keys(layer.extras.pyramids).map((k) => Number(k.split(":")[1])))];
    }
    if (!layer.years.length && layer.id === "p1-fiscal-notes") layer.years = [2014, 2024, 2025];
    if (layer.snapshotYears?.length) {
      layer.years = [...new Set([...layer.years, ...layer.snapshotYears])].sort((a, b) => a - b);
    }
    if (layer.defaultMetric && !layer.metrics.some((m) => m.id === layer.defaultMetric)) {
      layer.defaultMetric = layer.metrics[0]?.id || null;
    }
  }

  const catalog = {
    generated: new Date().toISOString(),
    title: "Migration — Phase 4 catalog",
    phase: 4,
    yearMin: 1940,
    yearMax: 2026,
    concordance: concordanceNotes(),
    nations: Object.values(NATIONS),
    regions: Object.entries(REGIONS).map(([id, name]) => ({ id, name, kind: "region" })),
    geographies: {
      nation: { id: "nation", label: "UK nations", file: "geo/uk-nations.geojson", source: "Natural Earth 50m admin-0 map subunits" },
      region: {
        id: "region",
        label: "ITL1 regions",
        file: "geo/uk-itl1.geojson",
        source: "ONS Open Geography, International Territorial Level 1 (January 2021) UK BUC",
        portal: "https://www.data.gov.uk/dataset/772cce9d-962b-477f-98bb-7f31dbe8b66a/international-territorial-level-1-january-2021-boundaries-uk-bgc",
        license: "OGL v3.0 / OS + ONS IPR",
      },
      la: {
        id: "la",
        label: "Local authorities (Dec 2021)",
        file: "geo/uk-lad.geojson",
        source: "ONS Open Geography, Local Authority Districts (December 2021) UK BUC",
        portal: "https://www.data.gov.uk/dataset/50fb9e41-01d4-4e12-b5a2-c9add02470a8/local-authority-districts-december-2021-boundaries-uk-buc",
        license: "OGL v3.0 / OS + ONS IPR",
      },
    },
    deepLink: {
      params: ["layer", "year", "geo", "metric", "year2"],
      geo: "nation | region | la | GSS or ITL1 code (E12… / E06… / W92… / TLC…)",
      example: "?layer=p1-cob-stock&year=2021&geo=region&metric=share-non-uk",
    },
    principles: [
      "No invented statistics.",
      "UK-born is not nationality and is not White British.",
      "Detected arrivals are not an irregular population stock.",
      "Fiscal estimates are methods and ranges, not one cost.",
    ],
    provenance: {
      dataAsOf: manifest?.generated || new Date().toISOString(),
      catalogBuilt: new Date().toISOString(),
      ingestWarnings: schemaIssues.filter((i) => i.level === "warn").map((i) => i.msg),
      ingestErrors: schemaIssues.filter((i) => i.level === "error").map((i) => i.msg),
      ogl: "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
      refresh: "npm run refresh",
      sourcesIndex: "data/sources.json",
      fileList: "data/SOURCES.md",
      files: (manifest?.files || []).map((f) => ({
        id: f.id,
        dest: f.dest,
        present: f.present,
        bytes: f.bytes,
        sha256: f.sha256,
        critical: f.critical,
        mtime: f.mtime,
      })),
    },
    layers,
  };

  finishSchemaOrExit();

  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(GEO_OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "catalog.json"), JSON.stringify(catalog));

  const nationsGeo = path.join(RAW, "geo/uk-nations.geojson");
  if (fs.existsSync(nationsGeo)) {
    fs.copyFileSync(nationsGeo, path.join(GEO_OUT, "uk-nations.geojson"));
  }

  const summary = layers.map((l) => ({
    id: l.id,
    years: `${l.years[0] ?? "—"}–${l.years[l.years.length - 1] ?? "—"}`,
    metrics: l.metrics.map((m) => `${m.id}:${yearsOfSeries(m.series).length}`),
  }));
  console.log(JSON.stringify(summary, null, 2));
  console.log("wrote", path.join(OUT, "catalog.json"), fs.statSync(path.join(OUT, "catalog.json")).size);
}

main();
