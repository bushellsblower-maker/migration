/**
 * Phase 7 explorer. Renders only values present in catalog.json.
 * Never interpolates missing years or places. Never invents geometries.
 */
const GSS_TO_ID = {
  E92000001: "E",
  W92000004: "W",
  S92000003: "S",
  N92000002: "NI",
  K02000001: "UK",
  K03000001: "GB",
  K04000001: "EW",
};

const ID_TO_GSS = {
  E: "E92000001",
  W: "W92000004",
  S: "S92000003",
  NI: "N92000002",
  UK: "K02000001",
  GB: "K03000001",
  EW: "K04000001",
};

const NATION_IDS = ["E", "W", "S", "NI"];
const NATION_NAMES = {
  E: "England",
  W: "Wales",
  S: "Scotland",
  NI: "Northern Ireland",
  UK: "United Kingdom",
  GB: "Great Britain",
  EW: "England and Wales",
};

const GEO_LEVELS = [
  { id: "nation", label: "Nations" },
  { id: "region", label: "ITL1 regions" },
  { id: "la", label: "Local authorities" },
];

const IDENTITY_MODES = [
  { id: "p1-cob-stock", label: "Country of birth", q: "Where was this person born?" },
  { id: "p1-nationality-stock", label: "Nationality", q: "What citizenship did they report?" },
  { id: "p1-ethnicity-census", label: "Ethnic group", q: "Which ethnic group did they identify with?" },
  { id: "p2-identity-compare", label: "Compare all three", q: "Same place and year; three different questions." },
];

const LAD_RE = /^[EW]0[6-9]|^S12|^N0[9]/;
const ITL_RE = /^TL[C-N]$/i;
const REGION_GSS_RE = /^E12/;

const TOURS = [
  {
    id: "1991",
    label: "1991",
    title: "1991 — first ethnicity question",
    layer: "p1-ethnicity-census",
    year: 2011,
    geo: "nation",
    metric: "pct-white",
    text: "The UK ethnicity question begins in 1991. This extract has no 1991 counts and does not invent a pre-1991 ethnicity map. The first published snapshot here is 2011 (E&W high-level White; Scotland Figure 5). Categories change again in 2021/22 — they are not one continuous series.",
  },
  {
    id: "2004",
    label: "2004",
    title: "2004 — APS country-of-birth stocks",
    layer: "p1-cob-stock",
    year: 2021,
    geo: "nation",
    metric: "share-non-uk",
    text: "The Annual Population Survey country-of-birth / nationality series is the modern household-survey stock from 2004. The downloaded workbook here is YE June 2021 only — 2004–2020 points are not invented. Census 2011/2021 (and Scotland 2022) remain the LA snapshots.",
  },
  {
    id: "2012",
    label: "2012",
    title: "2012 — admin-based LTIM",
    layer: "p1-ltim-net",
    year: 2012,
    geo: "nation",
    metric: "emig-admin",
    text: "Admin-based long-term international migration starts around YE June 2012. It is not the IPS-era line. Immigration, emigration and net are drawn separately; do not splice 1964–2015 onto 2012–.",
  },
  {
    id: "2021",
    label: "2021",
    title: "2021 — census stocks (Scotland 2022)",
    layer: "p1-cob-stock",
    year: 2021,
    geo: "nation",
    metric: "share-non-uk",
    text: "Census Day 2021 for E&W and NI; Scotland’s Census is 2022. Country of birth, nationality and ethnic group remain three different questions. Detections are still not an illegal-entry stock.",
  },
];

const PALETTES = {
  ink: ["#f0e6d2", "#c9a06a", "#8a5a28", "#5a3216", "#1f140c"],
  teal: ["#c5ddd8", "#5d9188", "#2f6b64", "#184843", "#0b2f2d"],
  diverging: ["#8a3d1c", "#c98962", "#eee6d6", "#6a9a8d", "#0f4c4a"],
  print: ["#c8c2b4", "#8d8778", "#534e44", "#3a362f", "#221f1b"],
};

const $ = (id) => document.getElementById(id);

const state = {
  catalog: null,
  geos: { nation: null, region: null, la: null },
  lookups: null,
  layerId: "p1-mye-total",
  metricId: null,
  viz: "absolute",
  palette: "teal",
  year: 2021,
  compareYear: null,
  compareGeo: null,
  geoLevel: "nation",
  playing: false,
  playTimer: null,
  map: null,
  geoLayer: null,
  selectedGeo: "UK",
  skipHistory: false,
  fiscal: { frame: "any", incidence: "any", publicGoods: "any", population: "any" },
  stories: { stories: [] },
};

function layer() {
  return state.catalog.layers.find((l) => l.id === state.layerId);
}

function metric() {
  const l = layer();
  return (l?.metrics || []).find((m) => m.id === state.metricId) || l?.metrics?.[0] || null;
}

function yearsOf(series) {
  const ys = new Set();
  for (const pts of Object.values(series || {})) {
    for (const p of pts) ys.add(p.year);
  }
  return [...ys].sort((a, b) => a - b);
}

function pointAt(series, geo, year) {
  const pts = series?.[geo];
  if (!pts) return null;
  return pts.find((p) => p.year === year) || null;
}

function valueAt(series, geo, year) {
  return pointAt(series, geo, year)?.value ?? null;
}

function aliasesFor(geoId) {
  const ids = [geoId];
  if (!geoId) return ids;
  if (GSS_TO_ID[geoId]) ids.push(GSS_TO_ID[geoId]);
  if (ID_TO_GSS[geoId]) ids.push(ID_TO_GSS[geoId]);
  const itl = state.lookups?.gssToItl1?.[geoId] || (ITL_RE.test(geoId) ? geoId.toUpperCase() : null);
  if (itl) ids.push(itl, state.lookups?.itl1ToGss?.[itl]);
  // Published E&W combined figure only — never an invented England-only or Wales-only split.
  if (geoId === "E" || geoId === "W" || geoId === "E92000001" || geoId === "W92000004" || geoId === "EW" || geoId === "K04000001") {
    ids.push("EW", "K04000001");
  }
  return [...new Set(ids.filter(Boolean))];
}

function extraValueForCode(l, m, geoId, year) {
  if (!l || !geoId) return { value: null, note: "" };
  const mid = m?.id;
  const cobLas = l.extras?.las || l.extras?.cobLas || [];
  const cobAps = l.extras?.apsLas || l.extras?.cobApsLas || [];
  const natAps = l.extras?.natApsLas || (l.id === "p1-nationality-stock" ? l.extras?.apsLas : []) || [];
  const ethLas = l.extras?.ethLas || (l.id === "p1-ethnicity-census" ? l.extras?.las : []) || [];

  if (l.id === "p1-cob-stock" || l.id === "p2-identity-compare") {
    if (mid === "share-non-uk" || l.id === "p2-identity-compare" && mid === "share-non-uk") {
      const census = cobLas.find((r) => r.code === geoId);
      if (year === 2011 || year === 2021) {
        const field = year === 2011 ? "y2011" : "y2021";
        if (census && census[field] != null) return { value: census[field], note: `census ${year} % non-UK-born (country of birth, E&W)` };
      }
      const ni = (l.extras?.niLas || l.extras?.niCobLas || []).find((r) => r.code === geoId);
      if (year === 2021 && ni?.shareNonUk != null) return { value: ni.shareNonUk, note: ni.note || "NISRA MS-A16 % non-UK-born (four UK countries only)" };
      const scot = (l.extras?.scotLas || []).find((r) => r.code === geoId);
      if (year === 2022 && scot?.shareNonUk != null) {
        return { value: scot.shareNonUk, note: "Scotland Census 2022 Area Overview % non-UK-born (four UK countries only; UV204 equivalent)" };
      }
      const aps = cobAps.find((r) => r.code === geoId);
      if (year === 2021 && aps?.shareNonUk != null) return { value: aps.shareNonUk, note: "APS YE Jun 2021 % non-UK-born (country of birth)" };
    }
    if (mid === "uk-born" || mid === "non-uk-born") {
      const aps = cobAps.find((r) => r.code === geoId);
      if (year === 2021 && aps) {
        const v = mid === "uk-born" ? aps.ukBorn : aps.nonUkBorn;
        if (v != null) return { value: v, note: "APS YE Jun 2021 (country of birth)" };
      }
    }
  }
  if (l.id === "p1-nationality-stock" || (l.id === "p2-identity-compare" && mid === "share-non-british")) {
    const aps = (l.id === "p1-nationality-stock" ? l.extras?.apsLas : natAps)?.find((r) => r.code === geoId);
    if (year === 2021 && aps) {
      if (mid === "british" && aps.british != null) return { value: aps.british, note: "APS YE Jun 2021 (nationality)" };
      if (mid === "non-british" && aps.nonBritish != null) return { value: aps.nonBritish, note: "APS YE Jun 2021 (nationality)" };
      if ((mid === "share-non-british" || !mid) && aps.shareNonBritish != null) {
        return { value: aps.shareNonBritish, note: "APS YE Jun 2021 % non-British nationality" };
      }
    }
  }
  if (l.id === "p1-ethnicity-census" || (l.id === "p2-identity-compare" && mid === "pct-white")) {
    const row = (l.id === "p1-ethnicity-census" ? l.extras?.las : ethLas)?.find((r) => r.code === geoId);
    if (year === 2021 && row?.pctWhite != null) return { value: row.pctWhite, note: "Census 2021 % White (high-level ethnic group, E&W)" };
    const niEth = (l.extras?.niLas || l.extras?.niEthLas || []).find((r) => r.code === geoId);
    if (year === 2021 && niEth?.pctWhite != null) {
      return { value: niEth.pctWhite, note: niEth.note || "NISRA MS-B01 % White (excludes Irish Traveller and Roma)" };
    }
    const scotEth = (l.extras?.scotLas || l.extras?.scotEthLas || []).find((r) => r.code === geoId && r.pctWhite != null);
    if (year === 2022 && scotEth?.pctWhite != null) {
      return { value: scotEth.pctWhite, note: "Scotland Census 2022 Area Overview White heading (includes Irish/Polish/Other White; UV201 equivalent)" };
    }
  }
  if (l.id === "p1-religion-census") {
    const row = l.extras?.las?.find((r) => r.code === geoId);
    if (year === 2021 && row) {
      const v = mid === "none" ? row.pctNone : mid === "muslim" ? row.pctMuslim : row.pctChristian;
      if (v != null) return { value: v, note: "Census 2021 religion % (E&W)" };
    }
    const niRel = (l.extras?.niLas || []).find((r) => r.code === geoId);
    if (year === 2021 && niRel) {
      const v = mid === "none" ? niRel.pctNone : mid === "muslim" ? niRel.pctMuslim : niRel.pctChristian;
      if (v != null) return { value: v, note: niRel.note || "NISRA MS-B19 current religion %" };
    }
    const scotRel = (l.extras?.scotLas || []).find((r) => r.code === geoId && (r.pctChristian != null || r.pctNone != null));
    if (year === 2022 && scotRel) {
      const v = mid === "none" ? scotRel.pctNone : mid === "muslim" ? scotRel.pctMuslim : scotRel.pctChristian;
      if (v != null) return { value: v, note: "Scotland Census 2022 Area Overview current religion (UV205 equivalent; not remapped onto E&W)" };
    }
  }
  return { value: null, note: "" };
}

function extraValue(l, m, geoId, year) {
  if (!l) return { value: null, note: "" };
  for (const id of aliasesFor(geoId)) {
    const hit = extraValueForCode(l, m, id, year);
    if (hit.value != null) return hit;
  }
  return { value: null, note: "" };
}

/** Honest fallback only when the published series is explicitly that grouping. */
function lookupValue(l, m, geoId, year) {
  if (!m && !l) return { value: null, note: "" };
  for (const id of aliasesFor(geoId)) {
    const direct = m ? valueAt(m.series, id, year) : null;
    if (direct != null) {
      const pt = pointAt(m.series, id, year);
      let note = pt?.note || "";
      if ((geoId === "E" || geoId === "E92000001") && (id === "EW" || id === "K04000001")) {
        note = note || "England & Wales combined figure — not an England-only published cell";
      }
      return { value: direct, note };
    }
  }
  return extraValue(l, m, geoId, year);
}

function mapValue(m, nationId, year) {
  return lookupValue(layer(), m, nationId, year).value;
}

function mapValueNote(m, nationId, year) {
  return lookupValue(layer(), m, nationId, year).note;
}

function usedMetric(l) {
  const selected = metric();
  if (selected) return selected;
  return (l.mapMetric && l.metrics.find((x) => x.id === l.mapMetric)) || null;
}

function geoName(id) {
  if (!id) return "";
  if (NATION_NAMES[id]) return NATION_NAMES[id];
  if (state.lookups?.itl1Names?.[id]) return state.lookups.itl1Names[id];
  const region = state.catalog?.regions?.find((r) => r.id === id);
  if (region) return region.name;
  for (const fc of Object.values(state.geos || {})) {
    const f = fc?.features?.find((x) => x.properties?.id === id || x.properties?.gss === id || x.properties?.itl === id);
    if (f) return f.properties.name;
  }
  return id;
}

function currentFeatures() {
  return state.geos[state.geoLevel]?.features || [];
}

function levelAvailable(l, level) {
  const spec = l?.mapLevels?.[level];
  if (!spec) return Boolean(l?.mapGeos?.length) && level === "nation";
  return spec.available !== false;
}

function encodeGeoParam() {
  if (!state.selectedGeo || state.selectedGeo === "UK") return state.geoLevel;
  if (state.geoLevel === "nation") {
    return NATION_IDS.includes(state.selectedGeo) || state.selectedGeo === "UK" || state.selectedGeo === "EW" || state.selectedGeo === "GB"
      ? state.selectedGeo
      : state.geoLevel;
  }
  if (state.geoLevel === "region") {
    return state.lookups?.gssToItl1?.[state.selectedGeo] || state.selectedGeo;
  }
  return state.selectedGeo;
}

function parseGeoParam(raw) {
  if (!raw) return { level: "nation", selected: "UK" };
  if (raw === "nation" || raw === "region" || raw === "la") return { level: raw, selected: raw === "nation" ? "UK" : null };
  if (ITL_RE.test(raw)) {
    const gss = state.lookups?.itl1ToGss?.[raw.toUpperCase()] || raw.toUpperCase();
    return { level: "region", selected: gss };
  }
  if (REGION_GSS_RE.test(raw)) return { level: "region", selected: raw };
  if (LAD_RE.test(raw)) return { level: "la", selected: raw };
  if (GSS_TO_ID[raw] || ID_TO_GSS[raw]) return { level: "nation", selected: GSS_TO_ID[raw] || raw };
  return { level: "nation", selected: "UK" };
}

function queryString() {
  const q = new URLSearchParams();
  q.set("layer", state.layerId);
  q.set("year", String(state.year));
  q.set("geo", encodeGeoParam());
  q.set("metric", state.metricId || "");
  if (state.compareYear) q.set("year2", String(state.compareYear));
  if (state.compareGeo) q.set("geo2", state.compareGeo);
  return `?${q.toString()}`;
}

function writeUrl() {
  if (state.skipHistory) return;
  const next = `${location.pathname}${queryString()}${location.hash || ""}`;
  const cur = `${location.pathname}${location.search}${location.hash || ""}`;
  if (cur !== next) history.replaceState(null, "", next);
}

function readUrlIntoState() {
  const q = new URLSearchParams(location.search);
  const layerId = q.get("layer");
  if (layerId && state.catalog.layers.some((l) => l.id === layerId)) state.layerId = layerId;
  const year = Number(q.get("year"));
  if (Number.isFinite(year) && year >= 1838 && year <= 2030) state.year = year;
  const year2 = Number(q.get("year2"));
  state.compareYear = Number.isFinite(year2) && year2 >= 1838 && year2 <= 2030 && year2 !== state.year ? year2 : null;
  const parsed = parseGeoParam(q.get("geo"));
  state.geoLevel = parsed.level;
  state.selectedGeo = parsed.selected || (parsed.level === "nation" ? "UK" : null);
  const metricId = q.get("metric");
  if (metricId) state.metricId = metricId;
  const geo2 = q.get("geo2");
  state.compareGeo = geo2 ? parseGeoParam(geo2).selected || geo2 : null;
}

function layerHasYear(l, year) {
  if (!l) return false;
  if (l.years?.includes(year)) return true;
  if (l.extras?.pyramids && Object.keys(l.extras.pyramids).some((k) => k.endsWith(`:${year}`))) return true;
  return false;
}

function nearestYear(l, year) {
  const years = l?.years || [];
  if (!years.length) return year;
  return years.reduce((best, y) => (Math.abs(y - year) < Math.abs(best - year) ? y : best), years[0]);
}

function formatCount(n) {
  if (n == null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)} million`;
  return `${sign}${Math.round(abs).toLocaleString("en-GB")}`;
}

function formatValue(m, n) {
  if (n == null || Number.isNaN(n)) return "—";
  if (!m) return String(n);
  if (m.format === "percent") return `${n.toFixed(Math.abs(n) >= 10 ? 1 : 2)}%`;
  if (m.format === "ratio") return n.toFixed(2);
  return formatCount(n);
}

function formatGbp(n) {
  if (n == null) return "—";
  const sign = n < 0 ? "−" : "";
  return `${sign}£${Math.abs(n).toLocaleString("en-GB")}`;
}

function formatFiscalValue(est) {
  if (est.headline) return est.headline;
  if (est.value == null) return "—";
  const abs = Math.abs(est.value);
  const sign = est.value < 0 ? "−" : "+";
  if (abs >= 1_000_000_000) return `${sign}£${(abs / 1_000_000_000).toFixed(abs >= 10_000_000_000 ? 0 : 1)} billion`;
  if (abs >= 1_000_000) return `${sign}£${Math.round(abs / 1_000_000)} million`;
  return `${sign}${formatGbp(est.value).replace(/^−/, "")}`;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hexRgb(hex) {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbHex([r, g, b]) {
  return `#${[r, g, b].map((x) => Math.round(x).toString(16).padStart(2, "0")).join("")}`;
}

function rampColor(stops, t) {
  const x = Math.min(1, Math.max(0, t));
  const pos = x * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(pos));
  const f = pos - i;
  const a = hexRgb(stops[i]);
  const b = hexRgb(stops[i + 1]);
  return rgbHex([lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)]);
}

function colorFor(value, min, max, paletteId, diverging) {
  if (value == null || min == null || max == null) return null;
  if (min === max) return rampColor(PALETTES[paletteId] || PALETTES.ink, 0.55);
  if (diverging) {
    const ext = Math.max(Math.abs(min), Math.abs(max)) || 1;
    const t = (value + ext) / (2 * ext);
    return rampColor(PALETTES[paletteId] || PALETTES.ink, t);
  }
  const t = (value - min) / (max - min);
  return rampColor(PALETTES[paletteId] || PALETTES.ink, t);
}

function geoIdFromFeature(feature) {
  const p = feature.properties || {};
  if (p.kind === "nation") return GSS_TO_ID[p.gss] || GSS_TO_ID[p.id] || p.id;
  // ITL1 / LAD: keep the official GSS (E12… / E06… / S12… / N09…) so catalog keys join.
  return p.gss || p.id || p.itl;
}

function sourceCite(l) {
  const s = l?.sources?.[0];
  if (!s) return "";
  return `<a href="${s.url}" target="_blank" rel="noopener">${s.name}</a>${s.license ? ` · ${s.license}` : ""}`;
}

function allSourcesHtml(l) {
  return `<ul>${(l.sources || [])
    .map((s) => `<li><a href="${s.url}" target="_blank" rel="noopener">${s.name}</a>${s.license ? ` <span class="cite">(${s.license})</span>` : ""}</li>`)
    .join("")}</ul>`;
}

function badgeClass(confidence) {
  if (confidence === "accredited") return "ok";
  if (confidence === "modelled-contested" || confidence === "operational" || confidence === "mixed") return "warn";
  return "mixed";
}

function fillSelect(el, options, selected) {
  el.innerHTML = options
    .map((o) => `<option value="${o.value}" ${o.value === selected ? "selected" : ""}>${o.label}</option>`)
    .join("");
}

function setLayer(id, keepYear = false, keepMetric = false) {
  state.layerId = id;
  const l = layer();
  if (!keepMetric || !l.metrics?.some((m) => m.id === state.metricId)) {
    state.metricId = l.defaultMetric || l.metrics[0]?.id || null;
  }
  const modes = l.vizModes?.length ? l.vizModes : ["absolute"];
  state.viz = modes.includes(state.viz) ? state.viz : modes[0];
  if (!keepYear) {
    const prefer = l.years.includes(2021) ? 2021 : l.years[l.years.length - 1];
    if (prefer != null) state.year = prefer;
  } else if (!layerHasYear(l, state.year) && l.years.length) {
    state.year = nearestYear(l, state.year);
  }
  if (!levelAvailable(l, state.geoLevel) && levelAvailable(l, "nation")) {
    // keep the user's level even if empty — honesty: dim + "no comparable data"
  }
  renderChrome();
  renderAll();
  resetUkView();
}

function setGeoLevel(level) {
  if (!GEO_LEVELS.some((g) => g.id === level)) return;
  state.geoLevel = level;
  if (level === "nation" && (!state.selectedGeo || LAD_RE.test(state.selectedGeo) || REGION_GSS_RE.test(state.selectedGeo))) {
    state.selectedGeo = "UK";
  }
  if (level === "region" && state.selectedGeo && !REGION_GSS_RE.test(state.selectedGeo) && !["W92000004", "S92000003", "N92000002", "W", "S", "NI"].includes(state.selectedGeo)) {
    if (state.lookups?.ladToItl?.[state.selectedGeo]) state.selectedGeo = state.lookups.ladToItl[state.selectedGeo];
    else state.selectedGeo = null;
  }
  if (level === "la" && state.selectedGeo && !LAD_RE.test(state.selectedGeo)) {
    state.selectedGeo = null;
  }
  if (state.compareGeo) {
    const parsed = parseGeoParam(state.compareGeo);
    if (parsed.level !== level) state.compareGeo = null;
  }
  bindGeoLayer();
  renderChrome();
  renderAll();
}

function renderChrome() {
  const l = layer();
  const list = $("layer-list");
  list.innerHTML = state.catalog.layers
    .map((item) => {
      const cov = item.coverage ? `${item.coverage.start}–${item.coverage.end}` : "";
      const yrs = item.years?.length ? `${item.years[0]}–${item.years[item.years.length - 1]} in extract` : "no series";
      return `<button type="button" class="layer-btn ${item.id === state.layerId ? "active" : ""}" data-layer="${item.id}">
        <span class="l-title">${item.short || item.title}</span>
        <span class="l-meta">${cov} · ${yrs}</span>
      </button>`;
    })
    .join("");
  list.querySelectorAll(".layer-btn").forEach((btn) => {
    btn.addEventListener("click", () => setLayer(btn.dataset.layer));
  });

  const modes = (l.vizModes || ["absolute"]).map((v) => ({
    value: v,
    label:
      {
        absolute: "Absolute values",
        index: "Index (first year = 100)",
        share: "Shares / rates",
        composition: "Composition (census groups)",
        pyramid: "Age–sex pyramid",
        panel: "Cited estimates panel",
        compare: "Side-by-side identity",
      }[v] || v,
  }));
  fillSelect($("viz-mode"), modes, state.viz);
  const metrics = (l.metrics || []).map((m) => ({ value: m.id, label: m.label }));
  $("metric").disabled = !metrics.length;
  fillSelect($("metric"), metrics.length ? metrics : [{ value: "", label: "— no mapped series —" }], state.metricId || "");
  $("palette").value = state.palette;
  const ymin = state.catalog.yearMin || 1940;
  const ymax = state.catalog.yearMax || 2026;
  $("year").min = String(ymin);
  $("year").max = String(ymax);
  $("year").value = String(state.year);
  $("year-label").textContent = String(state.year);
  const ticks = $("year-ticks");
  if (ticks) {
    const marks = [ymin, 1964, 1991, 2012, 2021, ymax].filter((y, i, a) => a.indexOf(y) === i && y >= ymin && y <= ymax);
    ticks.innerHTML = marks.map((y) => `<span>${y}</span>`).join("");
  }
  renderCompareYearControl(l);
  renderCompareAreaControl();

  const geoBox = $("geo-levels");
  geoBox.innerHTML = GEO_LEVELS.map((g) => {
    const spec = l.mapLevels?.[g.id];
    const empty = spec && spec.available === false;
    return `<button type="button" data-geo="${g.id}" aria-pressed="${state.geoLevel === g.id}" ${empty ? `title="${spec.reason || "No comparable data"}"` : ""}>${g.label}${empty ? " · none" : ""}</button>`;
  }).join("");
  geoBox.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => setGeoLevel(btn.dataset.geo));
  });
  const spec = l.mapLevels?.[state.geoLevel];
  $("geo-level-note").textContent = spec?.reason || spec?.note || "";

  const ident = $("identity-modes");
  const box = $("identity-box");
  box.hidden = false;
  ident.innerHTML = IDENTITY_MODES.map(
    (m) => `<button type="button" data-identity="${m.id}" aria-pressed="${l.id === m.id}" title="${m.q}">${m.label}</button>`
  ).join("");
  ident.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => setLayer(btn.dataset.identity, true));
  });

  const fiscalBox = $("fiscal-box");
  if (fiscalBox) {
    fiscalBox.hidden = l.id !== "p1-fiscal-notes";
    if (l.id === "p1-fiscal-notes") renderFiscalAssumptions(l);
  }
}

function renderRefreshBadge() {
  const el = $("refresh-badge");
  if (!el) return;
  const r = state.refreshStatus || {};
  const h = state.sourceHealth || {};
  const failed = r.ok === false || h.ok === false;
  document.body.classList.toggle("refresh-failed", failed);
  if (failed) {
    const when = (r.lastFailure || h.lastFailure || "").toString().slice(0, 10);
    const href = r.workflowRun || r.workflow || h.workflow || "#sources";
    el.hidden = false;
    el.className = "site-badge fail";
    el.innerHTML = `Last refresh failed${when ? ` ${when}` : ""}. Showing last good catalog. <a href="${href}" style="color:inherit;text-decoration:underline">Details</a>`;
    return;
  }
  if (r.ok === true) {
    el.hidden = false;
    el.className = "site-badge ok";
    el.textContent = `Last refresh ok ${(r.lastSuccess || "").toString().slice(0, 10)}`;
    return;
  }
  el.hidden = false;
  el.className = "site-badge pending";
  el.textContent = "Scheduled refresh not yet recorded — catalog is the last ingest.";
}

function renderDataStamp() {
  const el = $("data-stamp");
  if (!el || !state.catalog) return;
  const p = state.catalog.provenance || {};
  const r = state.refreshStatus || {};
  const built = (p.catalogBuilt || state.catalog.generated || "").slice(0, 10);
  const asOf = (p.dataAsOf || state.catalog.generated || "").slice(0, 10);
  const lastOk = (r.lastSuccess || p.lastRefreshSuccess || "").slice(0, 10);
  const warn = p.ingestWarnings?.length ? ` · ${p.ingestWarnings.length} ingest warning(s)` : "";
  const fail =
    r.ok === false
      ? ` · <a href="${r.workflowRun || r.workflow || "#sources"}">last refresh failed</a> (catalog not overwritten)`
      : "";
  const refreshBit = lastOk ? ` · last successful refresh ${lastOk}` : " · scheduled refresh not yet recorded";
  el.innerHTML = `Data as of ${asOf || "unknown"} · catalog ${built || "—"}${refreshBit}${warn}${fail} · <a href="#sources">OGL attribution</a>`;
  renderRefreshBadge();
}

function renderCompareYearControl(l) {
  const host = $("compare-year-box");
  if (!host) return;
  const years = [...new Set(l?.years || [])].sort((a, b) => a - b);
  if (years.length < 2) {
    host.hidden = true;
    host.innerHTML = "";
    if (state.compareYear) state.compareYear = null;
    return;
  }
  host.hidden = false;
  const opts = [`<option value="">No comparison</option>`]
    .concat(years.filter((y) => y !== state.year).map((y) => `<option value="${y}" ${state.compareYear === y ? "selected" : ""}>${y}</option>`))
    .join("");
  host.innerHTML = `<label>Compare year<select id="compare-year">${opts}</select><span class="cite">Shows the same series at a second published year. Nothing is interpolated between them.</span></label>`;
  $("compare-year").addEventListener("change", (e) => {
    const v = Number(e.target.value);
    state.compareYear = Number.isFinite(v) ? v : null;
    renderChart();
    renderNotes();
    writeUrl();
  });
}

function areaOptionsForLevel() {
  const features = currentFeatures();
  if (state.geoLevel === "nation") {
    return [
      { id: "UK", name: "United Kingdom" },
      { id: "E", name: "England" },
      { id: "W", name: "Wales" },
      { id: "S", name: "Scotland" },
      { id: "NI", name: "Northern Ireland" },
    ];
  }
  return features
    .map((f) => ({ id: geoIdFromFeature(f), name: f.properties?.name || geoIdFromFeature(f) }))
    .filter((x) => x.id)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function renderCompareAreaControl() {
  const host = $("compare-area-box");
  if (!host) return;
  const opts = areaOptionsForLevel();
  const current = state.selectedGeo || (state.geoLevel === "nation" ? "UK" : "");
  const sel = (id, value) =>
    opts
      .map((o) => `<option value="${o.id}" ${o.id === value ? "selected" : ""}>${o.name}</option>`)
      .join("");
  host.innerHTML = `<label>Compare two areas
    <select id="compare-area-a">${sel("a", current)}</select>
    <select id="compare-area-b"><option value="">No second area</option>${sel("b", state.compareGeo)}</select>
    <span class="cite">Side-by-side published figures only. Shift-click the map to set the second area. Nothing is interpolated.</span>
  </label>`;
  $("compare-area-a")?.addEventListener("change", (e) => {
    state.selectedGeo = e.target.value || (state.geoLevel === "nation" ? "UK" : null);
    renderAll();
  });
  $("compare-area-b")?.addEventListener("change", (e) => {
    state.compareGeo = e.target.value || null;
    renderChart();
    renderNotes();
    renderMap();
    writeUrl();
  });
}

function renderFiscalAssumptions(l) {
  const host = $("fiscal-assumptions");
  if (!host) return;
  const axes = l.extras?.assumptionAxes || [];
  host.innerHTML = `<div class="fiscal-axes">${axes
    .map((axis) => {
      const opts = (axis.options || [])
        .map((o) => `<option value="${o.id}" ${state.fiscal[axis.id] === o.id ? "selected" : ""}>${o.label}</option>`)
        .join("");
      return `<label>${axis.label}<select data-axis="${axis.id}">${opts}</select><span class="cite">${axis.help || ""}</span></label>`;
    })
    .join("")}</div>`;
  host.querySelectorAll("select").forEach((sel) => {
    sel.addEventListener("change", () => {
      state.fiscal[sel.dataset.axis] = sel.value;
      renderChart();
    });
  });
}

function yearStatusText() {
  const l = layer();
  if (!layerHasYear(l, state.year)) {
    return { text: "No comparable data for this year in the downloaded extract.", dim: true };
  }
  const br = (l.breaks || []).find((b) => b.year === state.year);
  if (br) return { text: br.label, dim: false };
  const m = metric();
  const pt = m ? pointAt(m.series, Object.keys(m.series)[0], state.year) : null;
  if (pt?.flag === "wartime-definition") return { text: "Wartime population definition — not a usual-residence MYE.", dim: false };
  if (pt?.provisional) return { text: "Provisional point — subject to revision.", dim: false };
  if (pt?.revised) return { text: "Revised vintage.", dim: false };
  if (pt?.midYear) return { text: `${pt.period || "Year ending June"} — mid-year point, not a December calendar year.`, dim: false };
  return { text: l.coverage ? `Extract coverage ${l.coverage.start}–${l.coverage.end}` : "", dim: false };
}

function renderYearUi() {
  const st = yearStatusText();
  $("year-label").textContent = String(state.year);
  $("year-status").textContent = st.text;
  $("year").classList.toggle("dim", st.dim);
  $("play").setAttribute("aria-pressed", state.playing ? "true" : "false");
  $("play").textContent = state.playing ? "Pause" : "Play";
  const ticks = $("year-ticks");
  if (ticks) {
    const l = layer();
    const marks = [1940, 1964, 1991, 2012, 2026];
    for (const b of l?.breaks || []) {
      if (!marks.includes(b.year) && b.year >= 1940 && b.year <= 2026) marks.push(b.year);
    }
    marks.sort((a, b) => a - b);
    const breakYears = new Set((l?.breaks || []).map((b) => b.year));
    ticks.innerHTML = marks.map((y) => `<span class="${breakYears.has(y) ? "break-pin" : ""}" title="${(l?.breaks || []).find((b) => b.year === y)?.label || ""}">${y}${breakYears.has(y) ? " ▾" : ""}</span>`).join("");
  }
}

function mapDomain(m) {
  if (!m && !layer()) return { min: null, max: null, diverging: false };
  const l = layer();
  const vals = [];
  for (const f of currentFeatures()) {
    const id = geoIdFromFeature(f);
    const v = lookupValue(l, m, id, state.year).value;
    if (v != null) vals.push(v);
  }
  // Do not fall back to unmatched series keys — that painted a legend while England stayed blank.
  if (!vals.length) return { min: null, max: null, diverging: false };
  const diverging = state.palette === "diverging" || /net/i.test(m?.id) || /net/i.test(m?.label);
  return { min: Math.min(...vals), max: Math.max(...vals), diverging };
}

function styleFeature(feature) {
  const l = layer();
  const id = geoIdFromFeature(feature);
  const used = usedMetric(l);
  const hasYear = layerHasYear(l, state.year);
  const spec = l.mapLevels?.[state.geoLevel];
  const levelOk = !spec || spec.available !== false;
  const v = hasYear && levelOk ? lookupValue(l, used, id, state.year).value : null;
  const { min, max, diverging } = mapDomain(used);
  const fill = v == null ? "var" : colorFor(v, min, max, state.palette, diverging);
  const selected = aliasesFor(state.selectedGeo).includes(id) || state.selectedGeo === id;
  const compared = state.compareGeo && (aliasesFor(state.compareGeo).includes(id) || state.compareGeo === id);
  const la = state.geoLevel === "la";
  return {
    color: selected ? "#1c1917" : compared ? "#8a3d1c" : "#3a362f",
    weight: selected ? 2.2 : compared ? 2 : la ? 0.7 : 1.15,
    fillColor: v == null ? "#c5c0b4" : fill,
    fillOpacity: v == null ? 0.2 : 0.78,
    opacity: 1,
  };
}

function featureLabel(feature) {
  const id = geoIdFromFeature(feature);
  const name = feature.properties?.name || geoName(id) || id;
  const l = layer();
  const used = usedMetric(l);
  const found = lookupValue(l, used, id, state.year);
  const val = found.value == null ? "no comparable data" : formatValue(used, found.value);
  const question = IDENTITY_MODES.find((m) => m.id === l.id)?.q || used?.label || l.title;
  return `${name} · ${state.year}\n${question}\n${val}${found.note ? ` (${found.note})` : ""}`;
}

function updateReadout(geoId) {
  const el = $("map-readout");
  if (!el) return;
  const l = layer();
  const used = usedMetric(l);
  const features = currentFeatures();
  const pick = geoId || state.selectedGeo;
  const rows = [];
  if (state.geoLevel === "nation") {
    for (const id of NATION_IDS) {
      const v = used ? lookupValue(l, used, id, state.year).value : null;
      const mark = aliasesFor(pick).includes(id) ? "←" : "";
      rows.push(`${NATION_NAMES[id]}: ${used ? formatValue(used, v) : "—"} ${mark}`);
    }
  } else if (pick) {
    const found = lookupValue(l, used, pick, state.year);
    rows.push(`${geoName(pick)}: ${used ? formatValue(used, found.value) : "—"}`);
    if (found.note) rows.push(found.note);
  } else {
    const withVal = features.filter((f) => lookupValue(l, used, geoIdFromFeature(f), state.year).value != null).length;
    rows.push(`${withVal} of ${features.length} areas have a published figure at this level.`);
  }
  const title = used ? `${used.label} · ${state.year}` : l.title;
  const level = GEO_LEVELS.find((g) => g.id === state.geoLevel)?.label || state.geoLevel;
  let extra = "";
  if (l.id === "p2-identity-compare") {
    const place = pick || (state.geoLevel === "nation" ? "UK" : null);
    const cob = identityValue("p1-cob-stock", "share-non-uk", place || "UK", state.year);
    const nat = identityValue("p1-nationality-stock", "share-non-british", place || "UK", state.year);
    const eth = identityValue("p1-ethnicity-census", "pct-white", place || "EW", state.year);
    extra = `<div class="cite">Birthplace non-UK-born: ${formatValue(cob.format, cob.value)}</div>
      <div class="cite">Nationality non-British: ${formatValue(nat.format, nat.value)}</div>
      <div class="cite">Ethnic group White (high-level): ${formatValue(eth.format, eth.value)}</div>`;
  }
  el.innerHTML = `<strong>${title}</strong><div class="cite">${level}</div>${rows.map((r) => `<div>${r}</div>`).join("")}${extra}`;
}

function bannerText() {
  const l = layer();
  const spec = l.mapLevels?.[state.geoLevel];
  if (spec && spec.available === false) {
    return spec.reason || l.noMapReason || "No comparable data at this geography.";
  }
  if (l.noMapReason && spec?.available === false) return l.noMapReason;
  if (!layerHasYear(l, state.year)) {
    return l.noMapYearsOutside || "No comparable published figure for this year in the extract. The map is dimmed.";
  }
  const used = usedMetric(l);
  const n = currentFeatures().filter((f) => lookupValue(l, used, geoIdFromFeature(f), state.year).value != null).length;
  if (!n) {
    return spec?.note
      ? `${spec.note} No comparable data for ${state.year} at ${state.geoLevel} level.`
      : `No comparable data for ${state.year} at ${state.geoLevel} level. The map is dimmed.`;
  }
  if (l.id === "p1-cob-stock" && state.year === 2011 && state.geoLevel === "nation") {
    return "2011 nation totals are not in the APS extract. Switch to local authorities for the 2011 E&W census percentages.";
  }
  if ((l.id === "p1-ethnicity-census" || l.id === "p1-religion-census") && state.geoLevel === "nation") {
    return "Each nation uses its own published census heading. E&W White / Christian is not the same category as Scotland’s heading or NISRA MS-B01 / MS-B19. Switch to ITL1 or local authorities to colour East Midlands, Halton, and the other published areas. See concordance.";
  }
  if (l.id === "p1-age-sex") {
    return "Mid-2025 pyramids are E&W / English regions. Mid-2024 UK MYE2 covers Scotland and Northern Ireland. Country-of-birth-by-age tables are census snapshots, not MYE.";
  }
  if (l.id === "p2-identity-compare") {
    return "Map colour is the selected identity series only. The panel shows country of birth, nationality, and ethnic group as three different questions. Census national identity is listed separately — it is not citizenship.";
  }
  if (l.id === "p1-cob-stock" && state.year === 2022) {
    return state.geoLevel === "la"
      ? "2022 Scotland council colours are Census Area Overviews (UV204 equivalent). E&W and NI local authorities have no 2022 census country-of-birth stock."
      : "2022 is Scotland’s Census year (Figure 8). E&W and NI have no 2022 census country-of-birth stock in this extract.";
  }
  return spec?.note || "";
}

function renderLegend(min, max, unit, diverging) {
  const el = $("legend");
  const used = usedMetric(layer());
  const level = GEO_LEVELS.find((g) => g.id === state.geoLevel)?.label || state.geoLevel;
  if (min == null || max == null) {
    el.innerHTML = `<strong>Map</strong><div class="cite">No comparable data at ${level} for this year. The scale matches painted areas only.</div>`;
    return;
  }
  const stops = PALETTES[state.palette] || PALETTES.ink;
  el.innerHTML = `<strong>${used?.label || "Value"}</strong>
    <div class="legend-bar" style="background:linear-gradient(90deg, ${stops.join(",")})"></div>
    <div class="legend-scale"><span>${formatValue(used, min)}</span><span>${formatValue(used, max)}</span></div>
    <div class="cite">${unit || used?.unit || ""} · ${level}${diverging ? " · diverging around zero when used for net" : ""}</div>`;
}

function renderMap() {
  const l = layer();
  const banner = $("map-banner");
  const text = bannerText();
  banner.hidden = !text;
  banner.textContent = text;

  const used = usedMetric(l);
  const { min, max, diverging } = mapDomain(used);
  renderLegend(min, max, used?.unit, diverging);

  if (state.geoLayer) {
    state.geoLayer.setStyle((f) => styleFeature(f));
  }
  updateReadout(state.selectedGeo);
}

function geoAttribution() {
  if (state.geoLevel === "region") {
    return '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · ITL1: ONS Open Geography (Jan 2021 BUC) OGL';
  }
  if (state.geoLevel === "la") {
    return '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · LAD: ONS Open Geography (Dec 2021 BUC) OGL';
  }
  return '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · nation polygons: Natural Earth';
}

function bindMap() {
  state.map = L.map("map", {
    scrollWheelZoom: true,
    attributionControl: true,
    worldCopyJump: false,
    minZoom: 5,
    maxZoom: 12,
    maxBoundsViscosity: 0.85,
  });
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: geoAttribution(),
    maxZoom: 12,
  }).addTo(state.map);
  bindGeoLayer();
  setTimeout(() => {
    state.map.invalidateSize();
    resetUkView();
  }, 80);
}

function bindGeoLayer() {
  if (!state.map) return;
  if (state.geoLayer) {
    state.map.removeLayer(state.geoLayer);
    state.geoLayer = null;
  }
  const fc = state.geos[state.geoLevel];
  if (!fc) return;
  state.map.attributionControl?.setPrefix(false);
  state.geoLayer = L.geoJSON(fc, {
    style: (f) => styleFeature(f),
    onEachFeature: (feature, lyr) => {
      const refreshTip = () => featureLabel(feature);
      lyr.bindTooltip(refreshTip, { sticky: true, opacity: 0.95, className: "map-tip" });
      lyr.bindPopup(refreshTip);
      lyr.on("click", (ev) => {
        const id = geoIdFromFeature(feature);
        if (ev.originalEvent?.shiftKey) state.compareGeo = id;
        else state.selectedGeo = id;
        renderCompareAreaControl();
        renderMap();
        renderChart();
        renderNotes();
        writeUrl();
      });
      lyr.on("mouseover", () => {
        lyr.setStyle({ weight: 2.4 });
        updateReadout(geoIdFromFeature(feature));
      });
      lyr.on("mouseout", () => {
        state.geoLayer.setStyle((f) => styleFeature(f));
        updateReadout(state.selectedGeo);
      });
    },
  }).addTo(state.map);
  resetUkView();
}

/** Visible frame is UK + Ireland only — not a Europe/world basemap. Still zoomable. */
const UK_IRELAND_BOUNDS = [
  [49.85, -10.75],
  [60.95, 2.05],
];

function resetUkView() {
  if (!state.map) return;
  const bounds = L.latLngBounds(UK_IRELAND_BOUNDS);
  const padded = bounds.pad(0.03);
  state.map.setMaxBounds(padded.pad(0.18));
  state.map.fitBounds(padded, { animate: false, padding: [4, 4] });
  const z = state.map.getBoundsZoom(padded, false);
  if (Number.isFinite(z)) state.map.setMinZoom(Math.max(5, z - 0.4));
}

function seriesForChart(l, m) {
  if (!m) return [];
  if (l.id === "p1-ltim-net" || l.id === "p3-emigration") {
    const ids = l.extras?.flowTrio || l.metrics.map((x) => x.id);
    const pick = l.metrics.filter((x) => ids.includes(x.id));
    return pick.map((x) => ({
      id: x.id,
      label: x.label,
      format: x.format,
      unit: x.unit,
      points: x.series.UK || [],
      dash: /ips/.test(x.id),
      emphasize: x.id === m.id || x.flow === "emigration",
    }));
  }
  if (l.id === "p1-asylum") {
    const ids = l.extras?.throughputIds || [
      "people-claiming-asylum",
      "grants-of-protection-or-other-leave",
      "refusals",
      "people-awaiting-an-initial-decision",
    ];
    const core = l.metrics.filter((x) => ids.includes(x.id));
    if (core.length && (ids.includes(m.id) || m.group === "flow" || m.group === "stock")) {
      return core.map((x) => ({
        id: x.id,
        label: x.label,
        format: x.format,
        unit: x.unit,
        points: x.series.UK || [],
        emphasize: x.id === m.id,
      }));
    }
  }
  if (l.id === "p1-small-boats") {
    return l.metrics.map((x) => ({
      id: x.id,
      label: `${x.label}${x.group === "other-detection" ? " (other detections)" : ""}`,
      format: x.format,
      unit: x.unit,
      points: x.series.UK || [],
      dash: x.group === "other-detection",
      emphasize: x.id === m.id || x.group === "small-boat",
    }));
  }
  const geos = Object.keys(m.series);
  const prefer = [];
  for (const id of aliasesFor(state.selectedGeo)) {
    if (geos.includes(id) && !prefer.includes(id)) prefer.push(id);
  }
  for (const g of ["UK", "EW", "GB", "E", "W", "S", "NI", "E12000007"]) {
    if (geos.includes(g) && !prefer.includes(g)) prefer.push(g);
  }
  const take = prefer.slice(0, state.viz === "absolute" || state.viz === "share" ? 4 : 3);
  if (state.compareGeo) {
    for (const id of aliasesFor(state.compareGeo)) {
      if (geos.includes(id) && !take.includes(id)) {
        take.push(id);
        break;
      }
    }
  }
  if (!take.length) take.push(geos[0]);
  return take.filter(Boolean).map((g) => ({
    id: g,
    label: geoName(g) || g,
    format: m.format,
    unit: m.unit,
    points: m.series[g] || [],
  }));
}

function indexPoints(points) {
  const first = points.find((p) => p.value != null);
  if (!first || !first.value) return [];
  return points.map((p) => ({ ...p, value: (100 * p.value) / first.value, baseYear: first.year }));
}

function drawLineChart(canvas, series, breaks) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 900;
  const cssH = canvas.clientHeight || 240;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const pad = { l: 58, r: 16, t: series.length > 3 || (breaks || []).length ? 36 : 18, b: 28 };
  const all = series.flatMap((s) => s.points);
  if (!all.length) return false;
  const xs = all.map((p) => p.year);
  const ys = all.map((p) => p.value);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  let y0 = Math.min(0, ...ys);
  let y1 = Math.max(0, ...ys);
  if (y0 === y1) {
    y0 -= 1;
    y1 += 1;
  }
  const xAt = (year) => pad.l + ((year - x0) / (x1 - x0 || 1)) * (cssW - pad.l - pad.r);
  const yAt = (v) => cssH - pad.b - ((v - y0) / (y1 - y0)) * (cssH - pad.t - pad.b);

  ctx.strokeStyle = "#d4ccba";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.l, pad.t);
  ctx.lineTo(pad.l, cssH - pad.b);
  ctx.lineTo(cssW - pad.r, cssH - pad.b);
  ctx.stroke();

  ctx.fillStyle = "#6c6458";
  ctx.font = "11px IBM Plex Sans, system-ui, sans-serif";
  const ticks = 4;
  for (let i = 0; i <= ticks; i++) {
    const v = y0 + ((y1 - y0) * i) / ticks;
    const y = yAt(v);
    ctx.fillText(formatCount(v), 4, y + 3);
    ctx.strokeStyle = "rgba(212,204,186,0.6)";
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(cssW - pad.r, y);
    ctx.stroke();
  }
  ctx.fillText(String(x0), pad.l, cssH - 8);
  ctx.fillText(String(x1), cssW - pad.r - 28, cssH - 8);

  for (const br of breaks || []) {
    if (br.year < x0 || br.year > x1) continue;
    const x = xAt(br.year);
    ctx.save();
    ctx.strokeStyle = "#8a6910";
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x, pad.t);
    ctx.lineTo(x, cssH - pad.b);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#8a6910";
    ctx.beginPath();
    ctx.moveTo(x, pad.t - 1);
    ctx.lineTo(x - 4, pad.t - 8);
    ctx.lineTo(x + 4, pad.t - 8);
    ctx.closePath();
    ctx.fill();
    ctx.font = "9px IBM Plex Sans, system-ui, sans-serif";
    ctx.fillText(String(br.year), x + 5, pad.t - 2);
    ctx.restore();
  }

  const colors = ["#0f4c4a", "#8a3d1c", "#3d5a80", "#6b4f2a", "#5a3d6b", "#2f5d3a"];
  series.forEach((s, i) => {
    const pts = [...s.points].sort((a, b) => a.year - b.year);
    if (!pts.length) return;
    ctx.beginPath();
    ctx.strokeStyle = colors[i % colors.length];
    ctx.lineWidth = s.emphasize ? 2.8 : 1.7;
    ctx.setLineDash(s.dash ? [5, 4] : []);
    pts.forEach((p, idx) => {
      const x = xAt(p.year);
      const y = yAt(p.value);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
    pts.forEach((p) => {
      ctx.fillStyle = colors[i % colors.length];
      ctx.beginPath();
      ctx.arc(xAt(p.year), yAt(p.value), p.year === state.year ? 4.2 : 2.2, 0, Math.PI * 2);
      ctx.fill();
    });
  });

  const markerX = xAt(state.year);
  if (state.year >= x0 && state.year <= x1) {
    ctx.strokeStyle = "#1c1917";
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.moveTo(markerX, pad.t);
    ctx.lineTo(markerX, cssH - pad.b);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.font = "11px IBM Plex Sans, system-ui, sans-serif";
  series.forEach((s, i) => {
    ctx.fillStyle = colors[i % colors.length];
    const col = i % 3;
    const row = Math.floor(i / 3);
    ctx.fillText(s.label.slice(0, 36), pad.l + col * 210, 12 + row * 12);
  });
  return true;
}

function drawPyramid(canvas, bands) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 900;
  const cssH = canvas.clientHeight || 240;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  if (!bands?.length) return false;
  const pad = { l: 48, r: 16, t: 18, b: 20 };
  const mid = (cssW + pad.l - pad.r) / 2;
  const max = Math.max(...bands.flatMap((b) => [b.male, b.female]));
  const rowH = (cssH - pad.t - pad.b) / bands.length;
  bands.forEach((b, i) => {
    const y = pad.t + i * rowH;
    const wm = ((b.male || 0) / max) * (mid - pad.l - 8);
    const wf = ((b.female || 0) / max) * (cssW - mid - pad.r - 8);
    ctx.fillStyle = "#3d5a80";
    ctx.fillRect(mid - wm, y + 1, wm, rowH - 3);
    ctx.fillStyle = "#8a3d1c";
    ctx.fillRect(mid, y + 1, wf, rowH - 3);
    ctx.fillStyle = "#6c6458";
    ctx.font = "10px IBM Plex Sans, system-ui, sans-serif";
    ctx.fillText(b.band, 4, y + rowH * 0.7);
  });
  ctx.fillStyle = "#3d5a80";
  ctx.fillText("Male", pad.l, 12);
  ctx.fillStyle = "#8a3d1c";
  ctx.fillText("Female", cssW - 70, 12);
  return true;
}

function drawComposition(canvas, groups) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 900;
  const cssH = canvas.clientHeight || 240;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  const usable = (groups || []).filter((g) => g.pct != null);
  if (!usable.length) return false;
  const colors = ["#0f4c4a", "#3d5a80", "#8a3d1c", "#6b4f2a", "#5a3d6b", "#8a6910", "#2f5d3a", "#4a443a"];
  const pad = { l: 20, r: 20, t: 16, b: 28 };
  const barW = Math.min(64, (cssW - pad.l - pad.r) / usable.length - 8);
  usable.forEach((g, i) => {
    const h = (g.pct / 100) * (cssH - pad.t - pad.b);
    const x = pad.l + i * ((cssW - pad.l - pad.r) / usable.length);
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(x, cssH - pad.b - h, barW, h);
    ctx.fillStyle = "#6c6458";
    ctx.font = "10px IBM Plex Sans, system-ui, sans-serif";
    ctx.save();
    ctx.translate(x + barW / 2, cssH - 6);
    ctx.rotate(-0.4);
    ctx.fillText(g.group.slice(0, 18), -20, 0);
    ctx.restore();
    ctx.fillText(`${g.pct.toFixed(1)}%`, x, cssH - pad.b - h - 4);
  });
  return true;
}

function identityValue(layerId, metricId, geoId, year) {
  const l = state.catalog.layers.find((x) => x.id === layerId);
  if (!l) return { value: null, note: "layer missing", label: metricId };
  const m = l.metrics.find((x) => x.id === metricId) || l.metrics[0];
  const found = lookupValue(l, m, geoId, year);
  return { ...found, label: m?.label, format: m, layer: l };
}

function identityCompareHtml() {
  const geoId = state.selectedGeo || (state.geoLevel === "nation" ? "UK" : null);
  const year = state.year;
  const place = geoName(geoId) || (state.geoLevel === "la" ? "Select a local authority" : state.geoLevel === "region" ? "Select an ITL1 region" : "United Kingdom");
  const nation = aliasesFor(geoId || "UK").some((id) => id === "S" || id === "S92000003")
    ? "S"
    : aliasesFor(geoId || "UK").some((id) => id === "NI" || id === "N92000002")
      ? "NI"
      : aliasesFor(geoId || "UK").some((id) => id === "E" || id === "W" || id === "EW")
        ? "EW"
        : "UK";
  const cards = [
    {
      title: "Country of birth",
      q: "Where was this person born?",
      not: "Not nationality. Not ethnic group. Not “native”.",
      hit: identityValue("p1-cob-stock", "share-non-uk", geoId || "UK", year),
      unit: "non-UK-born share",
    },
    {
      title: "Nationality (citizenship)",
      q: "What citizenship did they report?",
      not: "APS Table 2.1. Not country of birth. A British national may be born abroad. Not census national identity.",
      hit: identityValue("p1-nationality-stock", "share-non-british", geoId || "UK", year),
      unit: "non-British nationality share",
    },
    {
      title: "Ethnic group",
      q: "Which ethnic group did they identify with?",
      not: "Not UK-born. White headings differ across E&W / Scotland / NI — see concordance.",
      hit: identityValue("p1-ethnicity-census", "pct-white", geoId || (nation === "UK" ? "EW" : nation), year),
      unit: "White share (census heading as published)",
    },
  ];
  const cells = cards
    .map((c) => {
      const val = c.hit.value == null ? "no comparable data" : formatValue(c.hit.format, c.hit.value);
      return `<article class="compare-card">
        <h3>${c.title}</h3>
        <p class="q">${c.q}</p>
        <div class="big">${val}</div>
        <p class="cite">${c.unit} · ${year} · ${place}</p>
        <p class="cite">${c.hit.note || c.not}</p>
      </article>`;
    })
    .join("");
  const cmp = state.compareYear
    ? `<div class="compare-grid year-compare">${cards
        .map((c) => {
          const hit2 = identityValue(
            c.title.startsWith("Country") ? "p1-cob-stock" : c.title.startsWith("Nationality") ? "p1-nationality-stock" : "p1-ethnicity-census",
            c.title.startsWith("Country") ? "share-non-uk" : c.title.startsWith("Nationality") ? "share-non-british" : "pct-white",
            geoId || (c.title.startsWith("Ethnic") && nation === "UK" ? "EW" : "UK"),
            state.compareYear
          );
          const a = c.hit.value;
          const b = hit2.value;
          const delta = a != null && b != null ? a - b : null;
          return `<article class="compare-card">
            <h3>${c.title} · ${state.compareYear} → ${year}</h3>
            <div class="big">${delta == null ? "no comparable pair" : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} pp`}</div>
            <p class="cite">${state.compareYear}: ${formatValue(c.hit.format, b)} → ${year}: ${formatValue(c.hit.format, a)}. Difference only where both years are published.</p>
          </article>`;
        })
        .join("")}</div>`
    : "";
  const l = state.catalog.layers.find((x) => x.id === "p2-identity-compare");
  const scotId = l?.extras?.scotIdentity?.S?.[year] || l?.extras?.scotIdentity?.S?.[String(year)];
  const niId = year === 2021 ? l?.extras?.niIdentity?.groups : null;
  const idBlock =
    (nation === "S" && scotId?.length) || (nation === "NI" && niId?.length)
      ? `<div class="identity-extra">
          <h3>Census national identity — not nationality</h3>
          <p class="cite">This is a feeling of attachment (Scotland Figure 9 / NISRA MS-B15). It is not APS citizenship and is not written onto the nationality layer.</p>
          <ul>${(nation === "S" ? scotId : niId).map((g) => `<li>${g.group}: ${g.pct.toFixed(1)}%</li>`).join("")}</ul>
        </div>`
      : "";
  const conc = (l?.extras?.concordance || state.catalog.concordance)?.items || [];
  const concHtml = conc.length
    ? `<details class="concordance"><summary>Concordance — why these percentages are not interchangeable</summary><ul>${conc
        .map((item) => `<li><strong>${item.theme}.</strong> ${item.text}</li>`)
        .join("")}</ul></details>`
    : "";
  return `<div>
    <p><strong>Three published questions, one place.</strong> These percentages are not interchangeable and must not be added or labelled “native”.</p>
    <div class="compare-grid">${cells}</div>
    ${cmp}
    ${idBlock}
    ${concHtml}
  </div>`;
}

function estimateMatches(est) {
  const f = state.fiscal || {};
  const axis = (key, value) => f[key] === "any" || !f[key] || f[key] === value;
  return axis("frame", est.frame) && axis("incidence", est.incidence) && axis("publicGoods", est.publicGoods) && axis("population", est.population);
}

function fiscalHtml(l) {
  const rows = l.extras?.macStatic || [];
  const sens = l.extras?.macSensitivities || [];
  const lifetime = l.extras?.macLifetime || [];
  const methods = l.extras?.methods || [];
  const cited = l.extras?.citedEstimates || [];
  const matching = cited.filter(estimateMatches);
  const cards = cited
    .map((est) => {
      const on = estimateMatches(est);
      const tags = [est.frame, est.incidence, est.publicGoods, est.population].filter(Boolean);
      return `<article class="estimate-card ${on ? "" : "dim"}" data-match="${on}">
        <h3>${est.producer}</h3>
        <p class="who">${est.title}</p>
        <div class="big">${formatFiscalValue(est)}</div>
        <p class="cite">${est.period || ""}${est.group ? ` · ${est.group}` : ""}</p>
        <div class="estimate-tags">${tags.map((t) => `<span class="badge">${t}</span>`).join("")}</div>
        <p class="cite">${est.methodNote || ""}</p>
        <p class="cite">Source: <a href="${est.url}" target="_blank" rel="noopener">${est.sourceId}</a>${est.via ? ` · via <a href="${est.viaUrl || est.url}" target="_blank" rel="noopener">cited table</a>` : ""} · ${est.license || ""}</p>
      </article>`;
    })
    .join("");
  const table = rows.length
    ? `<table><caption>MAC Figure 10 — static net fiscal estimates, 2022/23 (model outputs, not a stock total)</caption>
        <thead><tr><th>Group in the MAC workbook</th><th>Net static estimate</th></tr></thead>
        <tbody>${rows.map((r) => `<tr><td>${r.label}</td><td class="num">${formatGbp(r.gbp)}</td></tr>`).join("")}</tbody>
      </table>`
    : "<p>Figure 10 could not be parsed from the downloaded workbook.</p>";
  let sensTable = "";
  if (sens.length) {
    const headers = [...new Set(sens.flatMap((s) => Object.keys(s.cells)))];
    const f = state.fiscal || {};
    sensTable = `<table><caption>MAC Table 11 — sensitivities on the static estimates (same workbook). Highlighted rows match the public-goods / incidence filters.</caption>
      <thead><tr><th>Scenario</th>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
      <tbody>${sens
        .map((s) => {
          const hit =
            (f.publicGoods === "any" || !f.publicGoods || f.publicGoods === s.publicGoods) &&
            (f.incidence === "any" || !f.incidence || f.incidence === s.incidence) &&
            (f.frame === "any" || !f.frame || f.frame === "static");
          return `<tr class="${hit ? "" : "dim"}"><td>${s.scenario}</td>${headers
            .map((h) => `<td class="num">${s.cells[h] != null ? formatGbp(s.cells[h]) : "—"}</td>`)
            .join("")}</tr>`;
        })
        .join("")}</tbody></table>`;
  }
  const lifeTable = lifetime.length
    ? `<table><caption>MAC Table 23 — lifetime cohort totals, 2022/23 visa cohort (£ million). Not a whole-stock NPV and not comparable to Dustmann–Frattini period billions.</caption>
        <thead><tr><th>Group</th><th>Tax</th><th>Visa fees</th><th>Expenditure</th><th>Net</th></tr></thead>
        <tbody>${lifetime
          .map(
            (r) =>
              `<tr><td>${r.label}</td><td class="num">${r.taxGbpMillion ?? "—"}</td><td class="num">${r.visaFeesGbpMillion ?? "—"}</td><td class="num">${r.expenditureGbpMillion ?? "—"}</td><td class="num">${r.netGbpMillion ?? "—"}</td></tr>`
          )
          .join("")}</tbody></table>`
    : "";
  return `<div class="chart-html fiscal-panel">
    <p class="no-true-total"><strong>This panel does not produce a true net cost or benefit.</strong> ${matching.length} of ${cited.length} cited estimates match the current assumption filters. Dimmed cards are still the published figures — they are just out of scope for the filters. Nothing is averaged.</p>
    <div class="estimate-grid">${cards}</div>
    <dl class="methods">${methods.map((m) => `<dt>${m.name}</dt><dd>${m.frame}</dd>`).join("")}</dl>
    ${table}
    ${sensTable}
    ${lifeTable}
    <p class="context-note"><strong>Context, not causation.</strong> Employment by country of birth / nationality (ONS EMP06, Oct–Dec) and house-price-to-earnings ratios (ONS) are shown because they are the usual missing ingredients in a fiscal argument. They do not prove a fiscal effect.</p>
    <canvas id="fiscal-context" width="900" height="200"></canvas>
    ${allSourcesHtml(l)}
  </div>`;
}

function drawFiscalContext() {
  const canvas = $("fiscal-context");
  if (!canvas || !state.catalog) return;
  const labour = state.catalog.layers.find((x) => x.id === "p1-labour-housing");
  if (!labour) return;
  const series = ["emp-uk-born", "emp-non-uk-born", "emp-uk-nationality", "emp-non-uk-nationality"]
    .map((id) => labour.metrics.find((m) => m.id === id))
    .filter(Boolean)
    .map((m) => ({
      id: m.id,
      label: m.label.replace("Employment rate, ", "").replace(" (Oct–Dec)", ""),
      format: m.format,
      unit: m.unit,
      points: m.series.UK || [],
    }))
    .filter((s) => s.points.length);
  if (!series.length) return;
  drawLineChart(canvas, series, labour.breaks);
}

function cobAgeBandRows(pack, caption) {
  if (!pack?.bands?.length) return "";
  const sex = pack.sex && pack.sex !== "persons" ? ` · ${pack.sex}` : " · persons";
  const rows = pack.bands
    .map((b) => {
      const t = b.total || (b.uk || 0) + (b.nonUk || 0);
      const share = t ? (100 * (b.nonUk || 0)) / t : null;
      return `<tr><td>${b.band}</td><td class="num">${formatCount(b.uk)}</td><td class="num">${formatCount(b.nonUk)}</td><td class="num">${share == null ? "—" : `${share.toFixed(1)}%`}</td></tr>`;
    })
    .join("");
  return `<p class="cite">${pack.source || ""} · ${pack.geography || ""} · ${pack.year}${sex}. Not a MYE pyramid.</p>
    <table><caption>${caption}</caption>
    <thead><tr><th>Age</th><th>UK-born</th><th>Non-UK-born</th><th>Non-UK-born share</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

function cobAgeTablesHtml(l) {
  const nation = aliasesFor(state.selectedGeo || "UK").find((id) => ["S", "NI", "E", "W", "EW", "UK"].includes(id));
  // Census cob×age tables are snapshots. Show them whenever the pack exists so E&W
  // RM011 persons is not hidden behind a MYE pyramid year (2024/2025).
  const showRm = Boolean(l.extras?.cobAge?.bands?.length) && (nation !== "S" && nation !== "NI");
  const showScot = Boolean(l.extras?.cobAgeScot?.bands?.length) && (nation === "S" || nation === "UK" || !nation);
  const showNi = Boolean(l.extras?.cobAgeNi?.bands?.length) && (nation === "NI" || nation === "UK" || !nation);
  const parts = [];
  if (showRm) {
    const pack =
      nation === "E" && l.extras?.cobAgeE?.bands?.length
        ? l.extras.cobAgeE
        : nation === "W" && l.extras?.cobAgeW?.bands?.length
          ? l.extras.cobAgeW
          : l.extras.cobAge;
    const where = pack.geography === "E" ? "England" : pack.geography === "W" ? "Wales" : "England &amp; Wales";
    parts.push(
      cobAgeBandRows(
        pack,
        `${where} Census 2021 RM011 — usual residents <em>by age, persons</em> (not a male/female split). UK-born = published ‘Europe: United Kingdom’.`
      )
    );
    const sex = l.extras?.cobAgeSex;
    if (sex?.female?.bands?.length && sex?.male?.bands?.length && (nation === "EW" || nation === "E" || nation === "W" || nation === "UK" || !nation)) {
      parts.push(
        `<p class="cite">Official E&amp;W sex split is CT21_0433 (England &amp; Wales as a whole, not local authorities). UK-born is the four UK country columns. Channel Islands / Isle of Man are not added. RM011 persons and CT21_0433 are not spliced.</p>`
      );
      parts.push(cobAgeBandRows(sex.female, "England &amp; Wales Census 2021 CT21_0433 — female usual residents by age and country of birth"));
      parts.push(cobAgeBandRows(sex.male, "England &amp; Wales Census 2021 CT21_0433 — male usual residents by age and country of birth"));
    } else if (!sex && (nation === "EW" || nation === "E" || nation === "W") ) {
      parts.push(`<p class="cite">No official RM011 sex dimension. CT21_0433 was not ingested — no male/female split is invented.</p>`);
    }
  }
  if (showScot) {
    parts.push(
      cobAgeBandRows(
        l.extras.cobAgeScot,
        "Scotland Census 2022 Figure 8 — persons by age and country of birth (Scotland + Rest of UK = UK-born; Overseas = non-UK-born)"
      )
    );
  }
  if (showNi) {
    parts.push(
      cobAgeBandRows(
        l.extras.cobAgeNi,
        "Northern Ireland Census 2021 MS-A31 — persons by broad age. UK-born = four UK countries only"
      )
    );
  }
  if (!showRm && l.extras?.cobAge == null && (nation === "EW" || nation === "E" || nation === "W") && state.year === 2021) {
    parts.push(
      `<p class="cite">ONS RM011 (E&amp;W age × country of birth, persons) was not retrieved. No E&amp;W birthplace pyramid is invented.</p>`
    );
  }
  return parts.join("");
}

function renderChart() {
  const l = layer();
  const m = metric();
  const canvas = $("chart");
  const html = $("chart-html");
  const empty = $("chart-empty");
  html.hidden = true;
  html.innerHTML = "";
  canvas.hidden = false;
  empty.hidden = true;

  const ctx0 = canvas.getContext("2d");
  ctx0.clearRect(0, 0, canvas.width, canvas.height);
  $("chart-title").textContent = l.title;
  $("chart-source").innerHTML = sourceCite(l);

  if (state.viz === "panel" || l.id === "p1-fiscal-notes") {
    canvas.hidden = true;
    html.hidden = false;
    html.innerHTML = fiscalHtml(l);
    drawFiscalContext();
    return;
  }

  if (state.viz === "compare" || l.id === "p2-identity-compare") {
    canvas.hidden = true;
    html.hidden = false;
    html.innerHTML = identityCompareHtml();
    return;
  }

  if (state.viz === "pyramid" || l.id === "p1-age-sex") {
    const nationKey = aliasesFor(state.selectedGeo || "UK").find((id) => ["UK", "EW", "E", "W", "S", "NI"].includes(id));
    const keys = Object.keys(l.extras?.pyramids || {});
    const key =
      keys.find((k) => k === `${state.selectedGeo}:${state.year}`) ||
      keys.find((k) => nationKey && k === `${nationKey}:${state.year}`) ||
      keys.find((k) => k === `EW:${state.year}`) ||
      keys.find((k) => k === `E:${state.year}`) ||
      keys.find((k) => k.endsWith(`:${state.year}`));
    const bands = key ? l.extras.pyramids[key] : null;
    const ok = drawPyramid(canvas, bands);
    if (!ok) {
      canvas.hidden = true;
      empty.hidden = false;
      empty.textContent = "No age–sex pyramid in this extract for the selected year or place.";
    } else {
      $("chart-title").textContent = `Age–sex pyramid · ${key.replace(":", " · ")}`;
    }
    const cobBlocks = cobAgeTablesHtml(l);
    if (cobBlocks) {
      html.hidden = false;
      html.innerHTML = cobBlocks;
    }
    return;
  }

  if (state.viz === "composition") {
    const pack = l.extras?.composition;
    const yearKey = String(state.year);
    const nationKey = aliasesFor(state.selectedGeo || "EW").find((id) => pack && pack[id]) || "EW";
    const groups = pack?.[nationKey]?.[yearKey] || pack?.[nationKey]?.[state.year] || pack?.EW?.[yearKey] || pack?.E?.[yearKey];
    const ok = drawComposition(canvas, groups);
    if (!ok) {
      canvas.hidden = true;
      empty.hidden = false;
      empty.textContent = "No high-level composition table for this census year in the extract.";
    } else {
      $("chart-title").textContent = `${l.short || l.title} composition · ${geoName(nationKey) || nationKey} · ${state.year}`;
      $("chart-source").innerHTML = `${sourceCite(l)} · groups as published for ${geoName(nationKey) || nationKey} — not remapped onto another nation’s heading.`;
    }
    return;
  }

  if (!m) {
    canvas.hidden = true;
    empty.hidden = false;
    return;
  }

  let series = seriesForChart(l, m);
  if (state.viz === "index") {
    series = series.map((s) => ({ ...s, points: indexPoints(s.points), label: `${s.label} (index)` }));
  }
  const ok = drawLineChart(canvas, series, l.breaks);
  if (!ok) {
    canvas.hidden = true;
    empty.hidden = false;
  }
  const compareBlock = twoAreaCompareHtml(l, m);
  if (compareBlock) {
    html.hidden = false;
    html.innerHTML = compareBlock;
  }
}

function twoAreaCompareHtml(l, m) {
  if (!state.compareGeo || !m) return "";
  const a = state.selectedGeo || (state.geoLevel === "nation" ? "UK" : null);
  if (!a) return "";
  const year = state.year;
  const left = lookupValue(l, m, a, year);
  const right = lookupValue(l, m, state.compareGeo, year);
  const year2 = state.compareYear;
  const left2 = year2 ? lookupValue(l, m, a, year2) : null;
  const right2 = year2 ? lookupValue(l, m, state.compareGeo, year2) : null;
  return `<div class="area-compare">
    <article><h3>${geoName(a) || a} · ${year}</h3><p class="big">${formatValue(m, left.value)}</p><p class="cite">${left.note || m.label}</p>${year2 ? `<p class="cite">${year2}: ${formatValue(m, left2.value)}</p>` : ""}</article>
    <article><h3>${geoName(state.compareGeo) || state.compareGeo} · ${year}</h3><p class="big">${formatValue(m, right.value)}</p><p class="cite">${right.note || m.label}</p>${year2 ? `<p class="cite">${year2}: ${formatValue(m, right2.value)}</p>` : ""}</article>
  </div><p class="cite">Two published areas, same layer and year. Difference is not shown when either side is missing — nothing is interpolated.</p>`;
}

function countPainted(level, l, m) {
  const features = state.geos[level]?.features || [];
  return features.filter((f) => lookupValue(l, m, geoIdFromFeature(f), state.year).value != null).length;
}

function otherLevelHints(l, m) {
  const hints = [];
  for (const g of GEO_LEVELS) {
    if (g.id === state.geoLevel) continue;
    if (!levelAvailable(l, g.id)) continue;
    const n = countPainted(g.id, l, m);
    if (n) hints.push({ level: g.id, label: g.label, n });
  }
  return hints;
}

/** Rows on the Area Table = features on the current map, same lookup as the choropleth. */
function areaRows(l) {
  const m = usedMetric(l);
  const rows = [];
  for (const f of currentFeatures()) {
    const code = geoIdFromFeature(f);
    const found = lookupValue(l, m, code, state.year);
    rows.push({
      code,
      name: f.properties?.name || geoName(code) || code,
      value: found.value,
      note: found.value == null ? "no comparable data at this geography" : found.note,
    });
  }
  rows.sort((a, b) => {
    if (a.value == null && b.value != null) return 1;
    if (a.value != null && b.value == null) return -1;
    return String(a.name).localeCompare(String(b.name), "en-GB");
  });
  return rows;
}

function renderNotes() {
  const l = layer();
  const badges = [
    `<span class="badge ${badgeClass(l.confidence)}">${l.confidence || "unspecified"}</span>`,
    ...(l.badges || []).map((b) => `<span class="badge">${b}</span>`),
  ].join(" ");

  $("tab-def").innerHTML = `${badges}
    <p>${(l.definitions || []).join("</p><p>") || "See notes on the selected layer."}</p>
    ${(l.notes || []).length ? `<h3>How to read this layer</h3><ul>${l.notes.map((n) => `<li>${n}</li>`).join("")}</ul>` : ""}
    ${l.terminology ? `<h3>Wording</h3><ul>${l.terminology.map((t) => `<li>${t}</li>`).join("")}</ul>` : ""}`;

  const conc = (l.extras?.concordance || state.catalog.concordance)?.items || [];
  const concHtml = conc.length
    ? `<h3>Nation concordance</h3><ul>${conc.map((item) => `<li><strong>${item.theme}.</strong> ${item.text}</li>`).join("")}</ul>`
    : "";
  $("tab-breaks").innerHTML = `${
    (l.breaks || []).length
      ? `<ul>${l.breaks.map((b) => `<li><strong>${b.year}</strong> — ${b.label}</li>`).join("")}</ul>`
      : "<p>No method-break markers recorded for this layer beyond the coverage window.</p>"
  }${concHtml}`;

  $("tab-src").innerHTML = `${allSourcesHtml(l)}<p class="cite">Downloaded files and URLs: <a href="https://github.com/bushellsblower-maker/migration/blob/main/data/SOURCES.md">data/SOURCES.md</a>.</p>`;

  const rows = areaRows(l);
  const m = usedMetric(l);
  const painted = rows.filter((r) => r.value != null).length;
  const hints = otherLevelHints(l, m);
  const hintHtml = hints.length
    ? `<p class="cite other-geo-hint">${hints
        .map((h) => `<button type="button" class="linkish" data-jump-geo="${h.level}">${h.n} ${h.label.toLowerCase()}</button>`)
        .join(" · ")} also have a published figure this year. Switch geography to colour them — the table lists only the areas on the map.</p>`
    : "";
  if (!rows.length) {
    $("tab-data").innerHTML = `<p>No map features at this geography.</p>${hintHtml}`;
    return;
  }
  const shown = rows.slice(0, 80);
  $("tab-data").innerHTML = `<table class="la-table">
    <caption>${painted} of ${rows.length} areas on this ${GEO_LEVELS.find((g) => g.id === state.geoLevel)?.label || "map"} have a published figure. Same join and scale as the choropleth. Values are copied, not interpolated.${rows.length > 80 ? " First 80 shown." : ""}</caption>
    ${hintHtml}
    <thead><tr><th>Area</th><th>Value</th><th>Note</th></tr></thead>
    <tbody>${shown
      .map(
        (r) =>
          `<tr data-area="${r.code}" class="${r.value == null ? "dim" : ""}"><td><button type="button" class="linkish" data-select-area="${r.code}">${r.name}</button><div class="cite">${r.code}</div></td><td class="num">${formatValue(m, r.value)}</td><td>${r.note || ""}</td></tr>`
      )
      .join("")}</tbody></table>`;
  $("tab-data").querySelectorAll("[data-jump-geo]").forEach((btn) => {
    btn.addEventListener("click", () => setGeoLevel(btn.dataset.jumpGeo));
  });
  $("tab-data").querySelectorAll("[data-select-area]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.selectedGeo = btn.dataset.selectArea;
      renderMap();
      renderChart();
      writeUrl();
    });
  });
}

function applyTour(id) {
  const tour = TOURS.find((t) => t.id === id);
  if (!tour) return;
  const note = $("tour-note");
  if (note) {
    note.hidden = false;
    note.innerHTML = `<strong>${tour.title}</strong> ${tour.text}`;
  }
  state.geoLevel = tour.geo;
  state.selectedGeo = "UK";
  state.compareYear = null;
  state.year = tour.year;
  setLayer(tour.layer, true, false);
  if (tour.metric && layer().metrics?.some((m) => m.id === tour.metric)) state.metricId = tour.metric;
  renderChrome();
  bindGeoLayer();
  renderAll();
}

function renderTours() {
  const host = $("tour-list");
  if (!host) return;
  host.innerHTML = TOURS.map((t) => `<button type="button" data-tour="${t.id}">${t.label}</button>`).join("");
  host.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => applyTour(btn.dataset.tour));
  });
}

function applyStory(id) {
  const story = (state.stories?.stories || []).find((s) => s.id === id);
  if (!story) return;
  const note = $("story-note");
  if (note) {
    note.hidden = false;
    note.innerHTML = `<strong>${story.title}</strong>
      <p><em>Can say.</em> ${story.can}</p>
      <p><em>Cannot say.</em> ${story.cannot}</p>
      ${(story.breaks || []).length ? `<p class="cite">Method breaks: ${story.breaks.join(" · ")}</p>` : ""}`;
  }
  if (story.geo === "nation" || story.geo === "region" || story.geo === "la") {
    state.geoLevel = story.geo;
    state.selectedGeo = story.geo === "nation" ? "UK" : story.geo === "region" ? "E12000004" : "E06000006";
  } else if (story.geo) {
    const parsed = parseGeoParam(story.geo);
    state.geoLevel = parsed.level;
    state.selectedGeo = parsed.selected;
  }
  state.compareGeo = story.geo2 ? parseGeoParam(story.geo2).selected || story.geo2 : null;
  state.compareYear = null;
  state.year = story.year;
  setLayer(story.layer, true, false);
  if (story.metric && layer().metrics?.some((m) => m.id === story.metric)) state.metricId = story.metric;
  renderChrome();
  bindGeoLayer();
  renderAll();
}

function renderStories() {
  const host = $("story-list");
  if (!host) return;
  const pack = state.stories || {};
  const items = pack.stories || [];
  if (!items.length) {
    host.innerHTML = "";
    return;
  }
  host.innerHTML = items.map((s) => `<button type="button" data-story="${s.id}">${s.title}</button>`).join("");
  host.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => applyStory(btn.dataset.story));
  });
}

function exportViewCsv() {
  const l = layer();
  const m = usedMetric(l);
  const rows = areaRows(l);
  const lines = [["area_code", "area_name", "year", "layer", "metric", "value", "note"].join(",")];
  const push = (code, name, value, note) => {
    const esc = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    lines.push([esc(code), esc(name), state.year, esc(l.id), esc(m?.id || ""), value ?? "", esc(note || "")].join(","));
  };
  if (rows.length) {
    for (const r of rows) push(r.code, r.name, r.value, r.note);
  } else if (m) {
    for (const [geo, pts] of Object.entries(m.series || {})) {
      const p = pts.find((x) => x.year === state.year);
      if (p) push(geo, geoName(geo) || geo, p.value, p.note || "");
    }
  }
  if (lines.length < 2) {
    window.alert("No published rows for this year and layer — nothing to export.");
    return;
  }
  const blob = new Blob([`${lines.join("\n")}\n`], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `migration-${l.id}-${state.year}-${state.geoLevel}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportChartPng() {
  const canvas = $("chart");
  if (!canvas || canvas.hidden) {
    window.alert("No chart canvas for this view. Composition / pyramid HTML tables can be exported as CSV.");
    return;
  }
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = `migration-${state.layerId}-${state.year}-chart.png`;
  a.click();
}

function renderSourcesPage() {
  const el = $("source-index");
  const rows = state.catalog.layers.map((l) => {
    const src = (l.sources || []).map((s) => `<a href="${s.url}" target="_blank" rel="noopener">${s.name}</a>`).join("<br>");
    const years = l.years?.length ? `${l.years[0]}–${l.years[l.years.length - 1]}` : "—";
    return `<tr><td>${l.title}<div class="cite">${l.id}</div></td><td>${years}</td><td>${l.confidence || ""}</td><td>${src}</td></tr>`;
  });
  const p = state.catalog.provenance || {};
  const files = (p.files || [])
    .map(
      (f) =>
        `<tr><td>${f.id}<div class="cite">${f.dest}</div></td><td>${f.present ? "present" : "missing"}</td><td>${f.critical ? "critical" : "optional"}</td><td class="cite">${f.sha256 ? f.sha256.slice(0, 12) : "—"}</td></tr>`
    )
    .join("");
  const refresh = state.refreshStatus || {};
  const lastOk = refresh.lastSuccess || p.lastRefreshSuccess;
  const lastFail = refresh.lastFailure;
  el.innerHTML = `<p><strong>Data as of</strong> (source files in the last ingest) ${(p.dataAsOf || state.catalog.generated || "").slice(0, 19)}. <strong>Catalog built</strong> ${(p.catalogBuilt || state.catalog.generated || "").slice(0, 19)}. <strong>Last successful refresh</strong> ${lastOk ? String(lastOk).slice(0, 19) : "not yet recorded"}${refresh.ok === false ? `. <strong>Last refresh failed</strong> ${lastFail ? String(lastFail).slice(0, 19) : ""} — the catalog was not overwritten.` : ""}. Scheduled run: <a href="${refresh.workflow || "https://github.com/bushellsblower-maker/migration/actions/workflows/refresh.yml"}">refresh.yml</a>. Local: <code>npm run refresh</code>. Schema breaks fail ingest unless <code>MIG_ALLOW_PARTIAL=1</code>.</p>
  <p>Most official files: <a href="${p.ogl || "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/"}">Open Government Licence v3.0</a>.</p>
  <table>
    <thead><tr><th>Layer</th><th>Years in extract</th><th>Confidence</th><th>Cited sources</th></tr></thead>
    <tbody>${rows.join("")}</tbody>
  </table>
  ${
    files
      ? `<h3>Downloaded extracts (provenance)</h3><table><thead><tr><th>Source</th><th>Status</th><th>Role</th><th>SHA-256</th></tr></thead><tbody>${files}</tbody></table>`
      : ""
  }
  ${sourceHealthHtml()}
  ${phase6GapsHtml()}
  <p>Generated catalog: ${state.catalog.generated}. Principles: ${(state.catalog.principles || []).join(" ")}</p>`;
}

function sourceHealthHtml() {
  const h = state.sourceHealth || {};
  const feeds = h.feeds || [];
  if (!feeds.length) {
    return `<h3>Source health</h3><p class="cite">No source-health.json yet. Run <code>npm run refresh</code> or <code>npm run health</code>.</p>`;
  }
  const rows = feeds
    .filter((f) => f.critical || f.status !== "ok")
    .map((f) => {
      const cls = f.status === "missing" || f.status === "hash-changed" ? "health-fail" : f.status === "ok" ? "health-ok" : "";
      return `<tr><td>${f.id}<div class="cite">${f.dest}</div></td><td class="${cls}">${f.status}</td><td>${f.lastOk ? String(f.lastOk).slice(0, 19) : "—"}</td><td>${f.lastFail ? String(f.lastFail).slice(0, 19) : "—"}</td><td class="cite">${f.hashMatch == null ? "unpinned" : f.hashMatch ? "match" : "changed"}</td></tr>`;
    })
    .join("");
  const uv = h.uvBulk || {};
  return `<h3>Source health</h3>
    <p>Last attempt ${h.lastAttempt ? String(h.lastAttempt).slice(0, 19) : "—"}. Last OK ${h.lastSuccess ? String(h.lastSuccess).slice(0, 19) : "not recorded"}. Last fail ${h.lastFailure ? String(h.lastFailure).slice(0, 19) : "none"}. Critical missing: ${h.missingCritical ?? 0}. Hash changes vs pin: ${h.hashMismatches ?? 0}.</p>
    <p class="cite">Scotland UV bulk: <strong>${uv.status || "unknown"}</strong>${uv.blocker ? ` — ${uv.blocker}` : ""}</p>
    <table><thead><tr><th>Feed</th><th>Status</th><th>Last OK</th><th>Last fail</th><th>Checksum</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="cite">Full list: <a href="./data/source-health.json">public/data/source-health.json</a>. Pins: <code>data/checksums.json</code>.</p>`;
}

function phase6GapsHtml() {
  const g = state.catalog.phase6 || {};
  const p7 = state.catalog.phase7 || {};
  const row = (label, obj) =>
    `<tr><td>${label}</td><td>${obj?.status || "—"}</td><td>${obj?.source || obj?.blocker || obj?.note || ""}</td></tr>`;
  return `<h3>Phase 6–7 — available vs blocked</h3>
    <table><thead><tr><th>Item</th><th>Status</th><th>Note</th></tr></thead><tbody>
    ${row("Scotland UV201/UV204/UV205 bulk", g.scotlandUvBulk)}
    ${row("E&W age × birthplace sex split", g.ewCobAgeSex)}
    ${row("Scotland age × birthplace sex split", g.scotlandCobAgeSex)}
    ${row("NI age × birthplace sex split", g.niCobAgeSex)}
    ${row("Religion / census choropleth join", p7.choroplethJoin || { status: "fixed", note: "LA/ITL1 keys match GeoJSON" })}
    </tbody></table>
    <p class="cite">Phase 7 re-probed UV bulk and Scotland/NI static sex × age × birthplace tables. Still blocked or not published as static files — no counts invented. Narrative pack: <a href="./data/stories.json">stories.json</a>.</p>`;

function printOnePager() {
  const l = layer();
  const m = usedMetric(l);
  const place = state.selectedGeo || (state.geoLevel === "nation" ? "UK" : state.geoLevel);
  const found = m ? lookupValue(l, m, place, state.year) : { value: null, note: "" };
  const compare = state.compareGeo && m ? lookupValue(l, m, state.compareGeo, state.year) : null;
  const rows = areaRows(l).filter((r) => r.value != null).slice(0, 24);
  const share = `${location.origin}${location.pathname}${queryString()}`;
  const sheet = $("print-sheet");
  if (!sheet) {
    window.print();
    return;
  }
  sheet.hidden = false;
  const srcRows = (l.sources || [])
    .map((s) => `<li><a href="${s.url}">${s.name}</a>${s.license ? ` (${s.license})` : ""}</li>`)
    .join("");
  sheet.innerHTML = `<h2>Migration one-pager</h2>
    <p class="cite">Evidence-led extract — published figures only. Deep link: ${share}</p>
    <p><strong>${l.title}</strong> · ${state.year}${state.compareYear ? ` vs ${state.compareYear}` : ""} · ${GEO_LEVELS.find((g) => g.id === state.geoLevel)?.label || ""} · ${geoName(place) || place}</p>
    <p class="big">${m ? `${m.label}: ${formatValue(m, found.value)}` : "No mapped series"}</p>
    <p class="cite">${found.note || ""}</p>
    ${
      compare
        ? `<table><thead><tr><th>Area</th><th>${state.year}</th>${state.compareYear ? `<th>${state.compareYear}</th>` : ""}</tr></thead>
      <tbody>
        <tr><td>${geoName(place) || place}</td><td>${formatValue(m, found.value)}</td>${state.compareYear ? `<td>${formatValue(m, lookupValue(l, m, place, state.compareYear).value)}</td>` : ""}</tr>
        <tr><td>${geoName(state.compareGeo)}</td><td>${formatValue(m, compare.value)}</td>${state.compareYear ? `<td>${formatValue(m, lookupValue(l, m, state.compareGeo, state.compareYear).value)}</td>` : ""}</tr>
      </tbody></table>`
        : ""
    }
    ${
      rows.length
        ? `<h3>Areas on this map (${GEO_LEVELS.find((g) => g.id === state.geoLevel)?.label})</h3>
      <table><thead><tr><th>Area</th><th>Code</th><th>Value</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${r.name}</td><td>${r.code}</td><td>${formatValue(m, r.value)}</td></tr>`).join("")}</tbody></table>`
        : ""
    }
    <h3>How to read</h3>
    <ul>${(l.notes || []).slice(0, 5).map((n) => `<li>${n}</li>`).join("")}</ul>
    ${(l.breaks || []).length ? `<h3>Method-break years</h3><ul>${l.breaks.map((b) => `<li>${b.year} — ${b.label}</li>`).join("")}</ul>` : ""}
    <h3>Sources</h3>
    <ul>${srcRows || "<li>See data/SOURCES.md</li>"}</ul>
    <p class="cite">Open Government Licence v3.0 for most official files. Printed from catalog rows only. Nothing interpolated. Detections are not an illegal-entry stock. No single net fiscal cost. No pre-1991 ethnicity or pre-2001 religion continuous map.</p>`;
  window.print();
}

function renderAll() {
  renderYearUi();
  renderMap();
  renderChart();
  renderNotes();
  renderDataStamp();
  writeUrl();
}

function togglePlay() {
  if (state.playing) {
    state.playing = false;
    clearInterval(state.playTimer);
    state.playTimer = null;
    renderYearUi();
    return;
  }
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  state.playing = true;
  renderYearUi();
  state.playTimer = setInterval(() => {
    let next = state.year + 1;
    const yMin = state.catalog?.yearMin || 1940;
    const yMax = state.catalog?.yearMax || 2026;
    if (next > yMax) next = yMin;
    state.year = next;
    $("year").value = String(state.year);
    renderAll();
  }, 380);
}

function bindUi() {
  $("palette").addEventListener("change", (e) => {
    state.palette = e.target.value;
    renderMap();
  });
  $("viz-mode").addEventListener("change", (e) => {
    state.viz = e.target.value;
    renderChart();
    writeUrl();
  });
  $("metric").addEventListener("change", (e) => {
    state.metricId = e.target.value;
    renderAll();
  });
  $("year").addEventListener("input", (e) => {
    state.year = Number(e.target.value);
    renderAll();
  });
  $("play").addEventListener("click", togglePlay);
  $("btn-export-csv")?.addEventListener("click", exportViewCsv);
  $("btn-export-png")?.addEventListener("click", exportChartPng);
  $("btn-export-csv-chart")?.addEventListener("click", exportViewCsv);
  $("btn-export-png-chart")?.addEventListener("click", exportChartPng);
  $("btn-print")?.addEventListener("click", printOnePager);
  renderTours();
  renderStories();
  $("btn-share").addEventListener("click", async () => {
    writeUrl();
    const url = `${location.origin}${location.pathname}${queryString()}${location.hash || ""}`;
    const label = state.compareGeo
      ? `Copied two-area link (${geoName(state.selectedGeo) || state.selectedGeo} · ${geoName(state.compareGeo)})`
      : "Copied";
    try {
      await navigator.clipboard.writeText(url);
      $("btn-share").textContent = label;
      setTimeout(() => {
        $("btn-share").textContent = "Copy link";
      }, 2200);
    } catch {
      window.prompt("Copy this restore link (includes geo2 when two areas are selected)", url);
    }
  });
  window.addEventListener("popstate", () => {
    state.skipHistory = true;
    readUrlIntoState();
    bindGeoLayer();
    renderChrome();
    renderAll();
    state.skipHistory = false;
  });
  document.querySelectorAll(".tabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tabs button").forEach((b) => b.setAttribute("aria-selected", b === btn ? "true" : "false"));
      ["def", "breaks", "src", "data"].forEach((id) => {
        $(`tab-${id}`).hidden = id !== btn.dataset.tab;
      });
    });
  });
  const layersBtn = $("btn-layers");
  const notesBtn = $("btn-notes");
  layersBtn.addEventListener("click", () => {
    const open = $("layer-rail").classList.toggle("open");
    layersBtn.setAttribute("aria-expanded", open ? "true" : "false");
    $("notes-rail").classList.remove("open");
    notesBtn.setAttribute("aria-expanded", "false");
  });
  notesBtn.addEventListener("click", () => {
    const open = $("notes-rail").classList.toggle("open");
    notesBtn.setAttribute("aria-expanded", open ? "true" : "false");
    $("layer-rail").classList.remove("open");
    layersBtn.setAttribute("aria-expanded", "false");
  });
  window.addEventListener("resize", () => {
    renderChart();
    if (state.map) state.map.invalidateSize();
  });
}

async function loadJson(url, label) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${label} missing — run npm run build`);
  return r.json();
}

async function main() {
  const [catalog, nation, region, la, lookups, refreshStatus, sourceHealth, stories] = await Promise.all([
    loadJson("./data/catalog.json", "catalog.json"),
    loadJson("./geo/uk-nations.geojson", "uk-nations.geojson"),
    loadJson("./geo/uk-itl1.geojson", "uk-itl1.geojson"),
    loadJson("./geo/uk-lad.geojson", "uk-lad.geojson"),
    loadJson("./geo/lookups.json", "lookups.json"),
    fetch("./data/refresh-status.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
    fetch("./data/source-health.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
    fetch("./data/stories.json").then((r) => (r.ok ? r.json() : { stories: [] })).catch(() => ({ stories: [] })),
  ]);
  state.refreshStatus = refreshStatus || {};
  state.sourceHealth = sourceHealth || {};
  state.stories = stories || { stories: [] };
  if (region.features?.length !== 12) throw new Error("ITL1 GeoJSON does not contain 12 official regions");
  if ((la.features?.length || 0) < 360) throw new Error("LAD GeoJSON is incomplete");
  state.catalog = catalog;
  state.geos = { nation, region, la };
  state.lookups = lookups;
  readUrlIntoState();
  bindUi();
  bindMap();
  setLayer(state.layerId, true, true);
  renderDataStamp();
  renderSourcesPage();
}

main().catch((err) => {
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<p class="empty" style="padding:16px">Explorer failed to load: ${String(err.message || err)}</p>`
  );
});
