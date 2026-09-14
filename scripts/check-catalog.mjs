/**
 * Post-ingest checks for Phase 5. Reads public/data/catalog.json.
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

assert.ok(catalog.provenance?.refreshSchedule, "refresh schedule recorded on catalog");
assert.ok(fs.existsSync(path.join(ROOT, "public", "data", "refresh-status.json")), "refresh-status.json present");

console.log("check-catalog OK", {
  scotLas: scotCob.length,
  rm011Bands: cobAge.bands.length,
  rm011Sex: cobAge.sex,
});
