/**
 * Post-ingest checks for Phase 7. Reads public/data/catalog.json.
 * Fails if a committed extract parsed empty — never invents a substitute figure.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "data", "catalog.json"), "utf8"));

function layer(id) {
  const l = catalog.layers.find((x) => x.id === id);
  assert.ok(l, `missing layer ${id}`);
  return l;
}

const cob = layer("p1-cob-stock");
const eth = layer("p1-ethnicity-census");
const rel = layer("p1-religion-census");
const age = layer("p1-age-sex");

const scotCob = cob.extras?.scotLas || [];
assert.equal(scotCob.length, 32, "Scotland COB Area Overviews: 32 councils");
const edinburgh = scotCob.find((r) => r.code === "S12000036");
assert.ok(edinburgh, "City of Edinburgh COB extra");
assert.ok(edinburgh.shareNonUk > 10 && edinburgh.shareNonUk < 40, "Edinburgh non-UK share is a published residual, not invented");

const scotEth = eth.extras?.scotLas || [];
assert.equal(scotEth.length, 32, "Scotland ethnicity Area Overviews: 32 councils");
assert.ok(scotEth.find((r) => r.code === "S12000036")?.pctWhite > 70, "Edinburgh White heading present");

const scotRel = rel.extras?.scotLas || [];
assert.equal(scotRel.length, 32, "Scotland religion Area Overviews: 32 councils");
const ediRel = scotRel.find((r) => r.code === "S12000036");
assert.ok(ediRel?.pctChristian > 20, "Edinburgh Christian grouping present");
assert.ok(ediRel?.pctNone > 20, "Edinburgh no-religion present");

const cobAge = age.extras?.cobAge;
assert.ok(cobAge?.bands?.length >= 6, "RM011 E&W age × birthplace bands");
assert.equal(cobAge.sex, "persons", "RM011 is persons, not a sex split");
assert.match(String(cobAge.source || ""), /RM011/i);
const uk0 = cobAge.bands[0];
assert.ok(uk0.uk > 0 && uk0.nonUk > 0 && uk0.total >= uk0.uk + uk0.nonUk - 1, "RM011 UK/non-UK persons");

assert.ok(age.extras?.cobAgeE?.bands?.length >= 6, "RM011 England pack");
assert.ok(age.extras?.cobAgeW?.bands?.length >= 6, "RM011 Wales pack");

const cobAgeSex = age.extras?.cobAgeSex;
assert.ok(cobAgeSex?.female?.bands?.length >= 6, "CT21_0433 female bands");
assert.ok(cobAgeSex?.male?.bands?.length >= 6, "CT21_0433 male bands");
assert.ok(cobAgeSex?.persons?.bands?.length >= 6, "CT21_0433 persons bands");
assert.equal(cobAgeSex.female.sex, "female");
assert.equal(cobAgeSex.male.sex, "male");
assert.equal(cobAgeSex.geography, "EW");
const f0 = cobAgeSex.female.bands[0];
const m0 = cobAgeSex.male.bands[0];
assert.ok(f0.uk > 0 && f0.nonUk > 0, "CT21_0433 female UK/non-UK");
assert.ok(m0.uk > 0 && m0.nonUk > 0, "CT21_0433 male UK/non-UK");
assert.ok(Math.abs((f0.uk + m0.uk) - (cobAgeSex.persons.bands[0].uk || 0)) < 5, "CT21 female+male UK ≈ persons UK (disclosure-control slack)");

assert.equal(age.extras?.cobAgeScot?.source && /persons/i.test(age.extras.cobAgeScot.source), true, "Scotland cob×age stays persons");
assert.ok(!age.extras?.cobAgeScot?.female, "no invented Scotland sex split");
assert.ok(/persons/i.test(age.extras?.cobAgeNi?.source || ""), "NI cob×age stays persons");

const uv = catalog.phase6?.scotlandUvBulk || age.extras?.scotlandUvBulk;
assert.ok(uv, "Scotland UV bulk status recorded");
if (uv.downloadableWithoutLogin) {
  console.warn("UV bulk probe says public CSVs exist — ingest them before treating Area Overviews as the only council source");
} else {
  assert.ok(uv.blocker || uv.status === "blocked" || uv.status === "not-probed", "UV blocker documented when CSVs are not public");
}

assert.ok(catalog.provenance?.refreshSchedule, "refresh schedule recorded on catalog");
assert.ok(catalog.provenance?.checksums, "checksum pin path recorded");
assert.ok(fs.existsSync(path.join(ROOT, "public", "data", "refresh-status.json")), "refresh-status.json present");
assert.ok(fs.existsSync(path.join(ROOT, "data", "checksums.json")), "checksums.json present");
assert.ok(fs.existsSync(path.join(ROOT, "public", "data", "stories.json")), "stories pack present");
assert.equal(catalog.phase, 7, "catalog phase is 7");

const christian = rel.metrics.find((m) => m.id === "christian");
assert.ok(christian?.series?.E12000004?.some((p) => p.year === 2021), "East Midlands religion on series (ITL1 GSS)");
assert.ok(christian?.series?.E06000006?.some((p) => p.year === 2021), "Halton religion on series (LAD21 — not extras-only)");
assert.ok(christian?.series?.TLF?.some((p) => p.year === 2021), "East Midlands religion also keyed as ITL1 TLF");

await import("./check-choropleth-join.mjs");

console.log("check-catalog OK", {
  scotLas: scotCob.length,
  rm011Bands: cobAge.bands.length,
  rm011Sex: cobAge.sex,
  ct21Female: cobAgeSex.female.bands.length,
  uvBulk: uv.status,
});
