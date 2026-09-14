/**
 * Compact official ONS Open Geography GeoJSON for the explorer.
 * Does not invent polygons: only copies, rounds coordinates, and
 * attaches published GSS/ITL codes plus a LAD→ITL1 lookup from
 * ONS centroids tested against official ITL1 polygons.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAW = path.join(ROOT, "data", "raw", "geo");
const OUT = path.join(ROOT, "public", "geo");

const ITL1 = {
  TLC: { gss: "E12000001", name: "North East" },
  TLD: { gss: "E12000002", name: "North West" },
  TLE: { gss: "E12000003", name: "Yorkshire and The Humber" },
  TLF: { gss: "E12000004", name: "East Midlands" },
  TLG: { gss: "E12000005", name: "West Midlands" },
  TLH: { gss: "E12000006", name: "East of England" },
  TLI: { gss: "E12000007", name: "London" },
  TLJ: { gss: "E12000008", name: "South East" },
  TLK: { gss: "E12000009", name: "South West" },
  TLL: { gss: "W92000004", name: "Wales" },
  TLM: { gss: "S92000003", name: "Scotland" },
  TLN: { gss: "N92000002", name: "Northern Ireland" },
};

function roundCoord(n, dp = 4) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

function compactCoords(coords, dp) {
  if (typeof coords[0] === "number") {
    return [roundCoord(coords[0], dp), roundCoord(coords[1], dp)];
  }
  const out = [];
  let prev = null;
  for (const c of coords) {
    const next = compactCoords(c, dp);
    const key = typeof next[0] === "number" ? `${next[0]},${next[1]}` : null;
    if (key && key === prev) continue;
    if (key) prev = key;
    out.push(next);
  }
  return out;
}

function compactGeometry(geom, dp) {
  if (!geom) return geom;
  if (geom.type === "GeometryCollection") {
    return { type: "GeometryCollection", geometries: geom.geometries.map((g) => compactGeometry(g, dp)) };
  }
  return { type: geom.type, coordinates: compactCoords(geom.coordinates, dp) };
}

function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const denom = yj - yi || Number.EPSILON;
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / denom + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygon(x, y, geom) {
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  for (const poly of polys) {
    if (!poly?.[0] || !pointInRing(x, y, poly[0])) continue;
    let hole = false;
    for (const ring of poly.slice(1)) {
      if (pointInRing(x, y, ring)) hole = true;
    }
    if (!hole) return true;
  }
  return false;
}

function nearestFeature(x, y, features) {
  let best = null;
  let bestD = Infinity;
  for (const f of features) {
    const p = f.properties;
    const dx = (p.long ?? 0) - x;
    const dy = (p.lat ?? 0) - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = f;
    }
  }
  return best;
}

function writeGeo(name, collection) {
  fs.mkdirSync(OUT, { recursive: true });
  const dest = path.join(OUT, name);
  fs.writeFileSync(dest, JSON.stringify(collection));
  console.log("wrote", dest, fs.statSync(dest).size, "features", collection.features.length);
}

function main() {
  const itlRaw = JSON.parse(fs.readFileSync(path.join(RAW, "itl1-ons-buc.geojson"), "utf8"));
  const ladRaw = JSON.parse(fs.readFileSync(path.join(RAW, "lad-ons-buc.geojson"), "utf8"));
  if (itlRaw.type !== "FeatureCollection" || itlRaw.features?.length !== 12) {
    throw new Error(`ITL1 GeoJSON unexpected: ${itlRaw.type} n=${itlRaw.features?.length}`);
  }
  if (ladRaw.type !== "FeatureCollection" || (ladRaw.features?.length || 0) < 360) {
    throw new Error(`LAD GeoJSON unexpected: ${ladRaw.type} n=${ladRaw.features?.length}`);
  }

  const itl = {
    type: "FeatureCollection",
    name: "UK ITL1 January 2021 (ONS Open Geography BUC, WGS84)",
    features: itlRaw.features.map((f) => {
      const code = f.properties.ITL121CD;
      const meta = ITL1[code];
      if (!meta) throw new Error(`Unknown ITL1 code ${code}`);
      return {
        type: "Feature",
        properties: {
          id: meta.gss,
          gss: meta.gss,
          itl: code,
          name: meta.name,
          kind: "region",
          officialName: f.properties.ITL121NM,
          lat: f.properties.LAT,
          long: f.properties.LONG,
        },
        geometry: compactGeometry(f.geometry, 4),
      };
    }),
  };

  const lad = {
    type: "FeatureCollection",
    name: "UK local authority districts December 2021 (ONS Open Geography BUC, WGS84)",
    features: ladRaw.features.map((f) => ({
      type: "Feature",
      properties: {
        id: f.properties.LAD21CD,
        gss: f.properties.LAD21CD,
        name: f.properties.LAD21NM,
        kind: "la",
        lat: f.properties.LAT,
        long: f.properties.LONG,
      },
      geometry: compactGeometry(f.geometry, 4),
    })),
  };

  const ladToItl = {};
  const unmatched = [];
  for (const f of lad.features) {
    const code = f.properties.gss;
    let itlId = null;
    if (code.startsWith("W")) itlId = "W92000004";
    else if (code.startsWith("S")) itlId = "S92000003";
    else if (code.startsWith("N")) itlId = "N92000002";
    else {
      const x = f.properties.long;
      const y = f.properties.lat;
      const hit = itl.features.find((r) => pointInPolygon(x, y, r.geometry));
      itlId = hit?.properties.gss || nearestFeature(x, y, itl.features)?.properties.gss || null;
      if (!hit) unmatched.push(code);
    }
    if (itlId) ladToItl[code] = itlId;
  }

  const lookups = {
    generated: new Date().toISOString(),
    itl1ToGss: Object.fromEntries(Object.entries(ITL1).map(([itl, m]) => [itl, m.gss])),
    gssToItl1: Object.fromEntries(Object.entries(ITL1).map(([itl, m]) => [m.gss, itl])),
    itl1Names: Object.fromEntries(Object.entries(ITL1).map(([itl, m]) => [m.gss, m.name])),
    ladToItl,
    notes: [
      "ITL1 and LAD geometries are official ONS Open Geography BUC (ultra-generalised) polygons in WGS84.",
      "Coordinates are rounded to 4 decimal degrees for web size; vertices are not invented.",
      "English LAD→ITL1 uses the published ONS LAT/LONG centroid tested against official ITL1 polygons (nearest ITL1 if the centroid sits on water).",
      "Wales / Scotland / Northern Ireland LAs are assigned from GSS prefix to the matching ITL1 nation.",
    ],
    unmatchedCentroids: unmatched,
  };

  writeGeo("uk-itl1.geojson", itl);
  writeGeo("uk-lad.geojson", lad);
  fs.writeFileSync(path.join(OUT, "lookups.json"), JSON.stringify(lookups));
  console.log("lookups", Object.keys(ladToItl).length, "unmatched centroids", unmatched.length, unmatched.slice(0, 8));

  const nationsSrc = path.join(RAW, "uk-nations.geojson");
  if (fs.existsSync(nationsSrc)) {
    fs.copyFileSync(nationsSrc, path.join(OUT, "uk-nations.geojson"));
  }
}

main();
