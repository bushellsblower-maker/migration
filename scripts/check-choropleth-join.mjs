/**
 * Assert catalog keys join official GeoJSON codes for census choropleths.
 * Fails if East Midlands / Halton-style rows exist but the map features would stay blank.
 * Never invents a substitute figure.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "data", "catalog.json"), "utf8"));
const lookups = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "geo", "lookups.json"), "utf8"));
const itl = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "geo", "uk-itl1.geojson"), "utf8"));
const lad = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "geo", "uk-lad.geojson"), "utf8"));

const GSS_TO_ID = {
  E92000001: "E",
  W92000004: "W",
  S92000003: "S",
  N92000002: "NI",
};
const ID_TO_GSS = Object.fromEntries(Object.entries(GSS_TO_ID).map(([k, v]) => [v, k]));
const ITL_RE = /^TL[C-N]$/i;

function layer(id) {
  const l = catalog.layers.find((x) => x.id === id);
  assert.ok(l, `missing layer ${id}`);
  return l;
}

function aliasesFor(geoId) {
  const ids = [geoId];
  if (GSS_TO_ID[geoId]) ids.push(GSS_TO_ID[geoId]);
  if (ID_TO_GSS[geoId]) ids.push(ID_TO_GSS[geoId]);
  const itlCode = lookups?.gssToItl1?.[geoId] || (ITL_RE.test(geoId) ? geoId.toUpperCase() : null);
  if (itlCode) ids.push(itlCode, lookups?.itl1ToGss?.[itlCode]);
  if (geoId === "E" || geoId === "W" || geoId === "E92000001" || geoId === "W92000004") ids.push("EW");
  return [...new Set(ids.filter(Boolean))];
}

function geoIdFromFeature(feature) {
  const p = feature.properties || {};
  if (p.kind === "nation") return GSS_TO_ID[p.gss] || p.id;
  return p.gss || p.id || p.itl;
}

function valueAt(series, geo, year) {
  return series?.[geo]?.find((p) => p.year === year)?.value ?? null;
}

function extraFor(l, m, geoId, year) {
  if (l.id === "p1-religion-census" && year === 2021) {
    const row = (l.extras?.las || []).find((r) => r.code === geoId);
    if (!row) return null;
    if (m.id === "none") return row.pctNone;
    if (m.id === "muslim") return row.pctMuslim;
    return row.pctChristian;
  }
  if (l.id === "p1-ethnicity-census" && year === 2021) {
    return (l.extras?.las || []).find((r) => r.code === geoId)?.pctWhite ?? null;
  }
  if (l.id === "p1-cob-stock" && (year === 2011 || year === 2021)) {
    const row = (l.extras?.las || l.extras?.cobLas || []).find((r) => r.code === geoId);
    if (!row) return null;
    return year === 2011 ? row.y2011 : row.y2021;
  }
  return null;
}

function lookup(l, m, geoId, year) {
  for (const id of aliasesFor(geoId)) {
    const v = valueAt(m.series, id, year);
    if (v != null) return v;
  }
  for (const id of aliasesFor(geoId)) {
    const v = extraFor(l, m, id, year);
    if (v != null) return v;
  }
  return null;
}

function joinRate(features, l, m, year) {
  let hit = 0;
  const misses = [];
  for (const f of features) {
    const id = geoIdFromFeature(f);
    const v = lookup(l, m, id, year);
    if (v != null) hit += 1;
    else if (/^E/.test(id || "")) misses.push({ id, name: f.properties?.name });
  }
  return { hit, n: features.length, misses };
}

const rel = layer("p1-religion-census");
const eth = layer("p1-ethnicity-census");
const cob = layer("p1-cob-stock");
const christian = rel.metrics.find((m) => m.id === "christian");
const white = eth.metrics.find((m) => m.id === "pct-white");
const nonUk = cob.metrics.find((m) => m.id === "share-non-uk");
assert.ok(christian && white && nonUk);

assert.ok(valueAt(christian.series, "E12000004", 2021) != null, "East Midlands E12000004 must be on religion.christian");
assert.ok(valueAt(christian.series, "E06000006", 2021) != null, "Halton E06000006 must be on religion.christian (not extras-only)");
assert.ok(valueAt(christian.series, "TLF", 2021) != null, "ITL1 TLF alias must join East Midlands");

const eastMidsFeat = itl.features.find((f) => f.properties.gss === "E12000004");
assert.ok(eastMidsFeat, "ITL1 GeoJSON has East Midlands");
assert.equal(geoIdFromFeature(eastMidsFeat), "E12000004");
assert.ok(lookup(rel, christian, geoIdFromFeature(eastMidsFeat), 2021) > 0, "East Midlands ITL1 feature joins religion");

const halton = lad.features.find((f) => f.properties.gss === "E06000006");
assert.ok(halton, "LAD GeoJSON has Halton");
assert.equal(geoIdFromFeature(halton), "E06000006");
assert.ok(lookup(rel, christian, geoIdFromFeature(halton), 2021) > 0, "Halton LAD feature joins religion");

const relItl = joinRate(itl.features, rel, christian, 2021);
assert.ok(relItl.hit >= 10, `religion ITL1 2021 should colour most regions, got ${relItl.hit}/${relItl.n}`);
assert.equal(relItl.misses.length, 0, `England ITL1 religion misses: ${JSON.stringify(relItl.misses)}`);

const relLad = joinRate(lad.features, rel, christian, 2021);
const engLad = lad.features.filter((f) => String(f.properties.gss || "").startsWith("E"));
const engHit = engLad.filter((f) => lookup(rel, christian, geoIdFromFeature(f), 2021) != null).length;
assert.ok(engHit >= 300, `England LAs should colour on religion 2021, got ${engHit}/${engLad.length}`);
assert.ok(relLad.hit >= 330, `religion LA 2021 join ${relLad.hit}/${relLad.n}`);

const ethItl = joinRate(itl.features, eth, white, 2021);
assert.ok(ethItl.hit >= 10, `ethnicity ITL1 2021 ${ethItl.hit}/${ethItl.n}`);
assert.ok(valueAt(white.series, "E06000006", 2021) != null, "Halton on ethnicity series");

const cobLadHit = engLad.filter((f) => lookup(cob, nonUk, geoIdFromFeature(f), 2021) != null).length;
assert.ok(cobLadHit >= 300, `COB 2021 England LAs ${cobLadHit}/${engLad.length}`);

console.log("check-choropleth-join OK", {
  religionItl: `${relItl.hit}/${relItl.n}`,
  religionLad: `${relLad.hit}/${relLad.n}`,
  englandReligionLas: `${engHit}/${engLad.length}`,
  eastMidlands: valueAt(christian.series, "E12000004", 2021),
  halton: valueAt(christian.series, "E06000006", 2021),
});
