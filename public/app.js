/**
 * Phase 2 explorer. Renders only values present in catalog.json.
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
  geoLevel: "nation",
  playing: false,
  playTimer: null,
  map: null,
  geoLayer: null,
  selectedGeo: "UK",
  skipHistory: false,
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
  if (GSS_TO_ID[geoId]) ids.push(GSS_TO_ID[geoId]);
  if (ID_TO_GSS[geoId]) ids.push(ID_TO_GSS[geoId]);
  const itl = state.lookups?.gssToItl1?.[geoId] || (ITL_RE.test(geoId) ? geoId.toUpperCase() : null);
  if (itl) ids.push(itl, state.lookups?.itl1ToGss?.[itl]);
  return [...new Set(ids.filter(Boolean))];
}

function extraValue(l, m, geoId, year) {
  if (!l || !LAD_RE.test(geoId)) return { value: null, note: "" };
  const mid = m?.id;
  const cobLas = l.extras?.las || l.extras?.cobLas || [];
  const cobAps = l.extras?.apsLas || l.extras?.cobApsLas || [];
  const natAps = l.extras?.natApsLas || (l.id === "p1-nationality-stock" ? l.extras?.apsLas : []) || [];
  const ethLas = l.extras?.ethLas || (l.id === "p1-ethnicity-census" ? l.extras?.las : []) || [];

  if (l.id === "p1-cob-stock" || l.id === "p2-identity-compare") {
    if (mid === "share-non-uk" || l.id === "p2-identity-compare" && mid === "share-non-uk") {
      const census = cobLas.find((r) => r.code === geoId);
      const field = year === 2011 ? "y2011" : "y2021";
      if (census && census[field] != null) return { value: census[field], note: `census ${year} % non-UK-born (country of birth, E&W)` };
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
    if (year === 2021 && row?.pctWhite != null) return { value: row.pctWhite, note: "Census 2021 % White (high-level ethnic group)" };
  }
  if (l.id === "p1-religion-census") {
    const row = l.extras?.las?.find((r) => r.code === geoId);
    if (year === 2021 && row) {
      const v = mid === "none" ? row.pctNone : mid === "muslim" ? row.pctMuslim : row.pctChristian;
      if (v != null) return { value: v, note: "Census 2021 religion %" };
    }
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
      return { value: direct, note: pt?.note || "" };
    }
  }
  if ((geoId === "E" || geoId === "W" || geoId === "E92000001" || geoId === "W92000004") && m && valueAt(m.series, "EW", year) != null) {
    return { value: valueAt(m.series, "EW", year), note: "England & Wales combined figure" };
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
  const parsed = parseGeoParam(q.get("geo"));
  state.geoLevel = parsed.level;
  state.selectedGeo = parsed.selected || (parsed.level === "nation" ? "UK" : null);
  const metricId = q.get("metric");
  if (metricId) state.metricId = metricId;
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
  if (value == null || min == null || max == null || min === max) return null;
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
  return GSS_TO_ID[p.gss] || GSS_TO_ID[p.id] || p.id;
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
        panel: "Methods panel",
        compare: "Side-by-side identity",
      }[v] || v,
  }));
  fillSelect($("viz-mode"), modes, state.viz);
  const metrics = (l.metrics || []).map((m) => ({ value: m.id, label: m.label }));
  $("metric").disabled = !metrics.length;
  fillSelect($("metric"), metrics.length ? metrics : [{ value: "", label: "— no mapped series —" }], state.metricId || "");
  $("palette").value = state.palette;
  $("year").value = String(state.year);
  $("year-label").textContent = String(state.year);

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
  const isIdentity = IDENTITY_MODES.some((m) => m.id === l.id);
  box.hidden = !isIdentity && !l.identity;
  ident.innerHTML = IDENTITY_MODES.map(
    (m) => `<button type="button" data-identity="${m.id}" aria-pressed="${l.id === m.id}" title="${m.q}">${m.label}</button>`
  ).join("");
  ident.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => setLayer(btn.dataset.identity, true));
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
  return { text: l.coverage ? `Extract coverage ${l.coverage.start}–${l.coverage.end}` : "", dim: false };
}

function renderYearUi() {
  const st = yearStatusText();
  $("year-label").textContent = String(state.year);
  $("year-status").textContent = st.text;
  $("year").classList.toggle("dim", st.dim);
  $("play").setAttribute("aria-pressed", state.playing ? "true" : "false");
  $("play").textContent = state.playing ? "Pause" : "Play";
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
  if (!vals.length && m) {
    for (const pts of Object.values(m.series || {})) {
      const p = pts.find((x) => x.year === state.year);
      if (p) vals.push(p.value);
    }
  }
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
  const la = state.geoLevel === "la";
  return {
    color: selected ? "#1c1917" : "#3a362f",
    weight: selected ? 2.2 : la ? 0.7 : 1.15,
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
    return "Choropleth uses the England & Wales published percentage on both England and Wales. Scotland and Northern Ireland are not in this extract.";
  }
  if (l.id === "p1-age-sex") {
    return "Pyramids are mid-2025 counts. Wales, Scotland and Northern Ireland are not separately pyramid-mapped from this file.";
  }
  if (l.id === "p2-identity-compare") {
    return "Map colour is the selected identity series only. The panel below shows country of birth, nationality, and ethnic group side by side for the same place.";
  }
  return spec?.note || "";
}

function renderLegend(min, max, unit, diverging) {
  const el = $("legend");
  if (min == null || max == null) {
    el.innerHTML = `<strong>Map</strong><div class="cite">No comparable data at this geography for this year.</div>`;
    return;
  }
  const stops = PALETTES[state.palette] || PALETTES.ink;
  const m = metric();
  el.innerHTML = `<strong>${m?.label || "Value"}</strong>
    <div class="legend-bar" style="background:linear-gradient(90deg, ${stops.join(",")})"></div>
    <div class="legend-scale"><span>${formatValue(m, min)}</span><span>${formatValue(m, max)}</span></div>
    <div class="cite">${unit || m?.unit || ""}${diverging ? " · diverging around zero when used for net" : ""}</div>`;
}

function renderMap() {
  const l = layer();
  const banner = $("map-banner");
  const text = bannerText();
  banner.hidden = !text;
  banner.textContent = text;

  const mapMetric = l.mapMetric ? l.metrics.find((x) => x.id === l.mapMetric) : metric();
  const { min, max, diverging } = mapDomain(mapMetric);
  renderLegend(min, max, mapMetric?.unit, diverging);

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
  state.map = L.map("map", { scrollWheelZoom: true, attributionControl: true }).setView([54.6, -2.4], 5.2);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: geoAttribution(),
    maxZoom: 12,
  }).addTo(state.map);
  bindGeoLayer();
  setTimeout(() => state.map.invalidateSize(), 80);
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
      lyr.on("click", () => {
        state.selectedGeo = geoIdFromFeature(feature);
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
  state.map.setView([54.6, -2.2], state.geoLevel === "la" ? 5.6 : 5.4);
}

function seriesForChart(l, m) {
  if (!m) return [];
  if (l.id === "p1-ltim-net") {
    return l.metrics.map((x) => ({
      id: x.id,
      label: x.label,
      format: x.format,
      unit: x.unit,
      points: x.series.UK || [],
      dash: /ips/.test(x.id),
      emphasize: x.id === m.id,
    }));
  }
  if (l.id === "p1-asylum" && m.id === (l.defaultMetric || "people-claiming-asylum")) {
    const ids = ["people-claiming-asylum", "grants-of-protection-or-other-leave", "refusals", "people-awaiting-an-initial-decision"];
    return l.metrics
      .filter((x) => ids.includes(x.id))
      .map((x) => ({ id: x.id, label: x.label, format: x.format, unit: x.unit, points: x.series.UK || [] }));
  }
  if (l.id === "p1-small-boats" && /small-boat/.test(m.id)) {
    return l.metrics.map((x) => ({
      id: x.id,
      label: x.label,
      format: x.format,
      unit: x.unit,
      points: x.series.UK || [],
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

  const pad = { l: 58, r: 16, t: series.length > 3 ? 36 : 18, b: 28 };
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
  const cards = [
    {
      title: "Country of birth",
      q: "Where was this person born?",
      not: "Not nationality. Not ethnic group. Not “native”.",
      hit: identityValue("p1-cob-stock", "share-non-uk", geoId || "UK", year),
      unit: "non-UK-born share",
    },
    {
      title: "Nationality",
      q: "What citizenship did they report?",
      not: "Not country of birth. A British national may be born abroad.",
      hit: identityValue("p1-nationality-stock", "share-non-british", geoId || "UK", year),
      unit: "non-British nationality share",
    },
    {
      title: "Ethnic group",
      q: "Which ethnic group did they identify with?",
      not: "Not UK-born. ‘White’ includes White British and Other White.",
      hit: identityValue("p1-ethnicity-census", "pct-white", geoId || "EW", year),
      unit: "White high-level share",
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
  return `<div>
    <p><strong>Three published questions, one place.</strong> These percentages are not interchangeable and must not be added or labelled “native”.</p>
    <div class="compare-grid">${cells}</div>
  </div>`;
}

function fiscalHtml(l) {
  const rows = l.extras?.macStatic || [];
  const sens = l.extras?.macSensitivities || [];
  const methods = l.extras?.methods || [];
  const table = rows.length
    ? `<table><caption>MAC Figure 10 — static net fiscal estimates, 2022/23 (model outputs, not a stock total)</caption>
        <thead><tr><th>Group in the MAC workbook</th><th>Net static estimate</th></tr></thead>
        <tbody>${rows.map((r) => `<tr><td>${r.label}</td><td class="num">${formatGbp(r.gbp)}</td></tr>`).join("")}</tbody>
      </table>`
    : "<p>Figure 10 could not be parsed from the downloaded workbook.</p>";
  let sensTable = "";
  if (sens.length) {
    const headers = [...new Set(sens.flatMap((s) => Object.keys(s.cells)))];
    sensTable = `<table><caption>MAC Table 11 — sensitivities on the static estimates (same workbook)</caption>
      <thead><tr><th>Scenario</th>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
      <tbody>${sens
        .map(
          (s) =>
            `<tr><td>${s.scenario}</td>${headers.map((h) => `<td class="num">${s.cells[h] != null ? formatGbp(s.cells[h]) : "—"}</td>`).join("")}</tr>`
        )
        .join("")}</tbody></table>`;
  }
  return `<div class="chart-html">
    <p><strong>This is not a map of “the cost of immigration”.</strong> Published models disagree in sign and scale once the visa route, dependants, public-goods allocation, and time window change.</p>
    <dl class="methods">${methods.map((m) => `<dt>${m.name}</dt><dd>${m.frame}</dd>`).join("")}</dl>
    ${table}
    ${sensTable}
    ${allSourcesHtml(l)}
  </div>`;
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
    return;
  }

  if (state.viz === "compare" || l.id === "p2-identity-compare") {
    canvas.hidden = true;
    html.hidden = false;
    html.innerHTML = identityCompareHtml();
    return;
  }

  if (state.viz === "pyramid" || l.id === "p1-age-sex") {
    const key =
      Object.keys(l.extras?.pyramids || {}).find((k) => k === `${state.selectedGeo}:${state.year}`) ||
      Object.keys(l.extras?.pyramids || {}).find((k) => k === `E:${state.year}`) ||
      Object.keys(l.extras?.pyramids || {}).find((k) => k === `EW:${state.year}`);
    const bands = key ? l.extras.pyramids[key] : null;
    const ok = drawPyramid(canvas, bands);
    if (!ok) {
      canvas.hidden = true;
      empty.hidden = false;
      empty.textContent = "No age–sex pyramid in this extract for the selected year or place.";
    } else {
      $("chart-title").textContent = `Age–sex pyramid · ${key.replace(":", " · ")}`;
    }
    return;
  }

  if (state.viz === "composition") {
    const pack = l.extras?.composition;
    const yearKey = String(state.year);
    const groups = pack?.EW?.[yearKey] || pack?.EW?.[state.year] || pack?.E?.[yearKey];
    const ok = drawComposition(canvas, groups);
    if (!ok) {
      canvas.hidden = true;
      empty.hidden = false;
      empty.textContent = "No high-level composition table for this census year in the extract.";
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
}

function areaRows(l) {
  const m = (l.mapMetric && l.metrics.find((x) => x.id === l.mapMetric)) || metric();
  const rows = [];
  if (m) {
    const geos = Object.keys(m.series);
    for (const g of geos) {
      const p = pointAt(m.series, g, state.year);
      if (!p) continue;
      const name = geoName(g) || g;
      rows.push({ code: g, name, value: p.value, note: p.flag || p.period || "" });
    }
  }
  const las = l.extras?.las || l.extras?.cobLas || [];
  const apsLas = l.extras?.apsLas || l.extras?.natApsLas || [];
  if (l.id === "p1-nationality-stock" && state.year === 2021) {
    for (const r of apsLas) {
      const value = m?.id === "british" ? r.british : m?.id === "non-british" ? r.nonBritish : r.shareNonBritish;
      if (value != null) rows.push({ code: r.code, name: r.name, value, note: "APS YE Jun 2021 nationality (not country of birth)" });
    }
  }
  if (las.length && (state.year === 2011 || state.year === 2021 || l.id === "p1-ethnicity-census" || l.id === "p1-religion-census" || l.id === "p2-identity-compare")) {
    for (const r of las) {
      let value = null;
      let note = "local authority";
      if (r.y2011 != null || r.y2021 != null) {
        value = state.year === 2011 ? r.y2011 : r.y2021;
        note = "census % non-UK-born (E&W)";
      } else if (r.pctWhite != null && (l.id === "p1-ethnicity-census")) {
        if (state.year !== 2021) continue;
        value = r.pctWhite;
        note = "2021 % White (high-level)";
      } else if (l.id === "p1-religion-census") {
        if (state.year !== 2021) continue;
        const mid = metric()?.id;
        value = mid === "none" ? r.pctNone : mid === "muslim" ? r.pctMuslim : r.pctChristian;
        note = "2021 census %";
      }
      if (value != null) rows.push({ code: r.code, name: r.name, value, note });
    }
  }
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

  $("tab-breaks").innerHTML = (l.breaks || []).length
    ? `<ul>${l.breaks.map((b) => `<li><strong>${b.year}</strong> — ${b.label}</li>`).join("")}</ul>`
    : "<p>No method-break markers recorded for this layer beyond the coverage window.</p>";

  $("tab-src").innerHTML = `${allSourcesHtml(l)}<p class="cite">Downloaded files and URLs: <a href="https://github.com/bushellsblower-maker/migration/blob/main/data/SOURCES.md">data/SOURCES.md</a>.</p>`;

  const rows = areaRows(l);
  if (!rows.length) {
    $("tab-data").innerHTML = "<p>No area rows for this year. National series remain on the chart where published.</p>";
    return;
  }
  const m = metric();
  const shown = rows.slice(0, 80);
  $("tab-data").innerHTML = `<table class="la-table">
    <caption>${rows.length} published rows${rows.length > 80 ? " (first 80 shown)" : ""}. Values are copied, not interpolated.</caption>
    <thead><tr><th>Area</th><th>Value</th><th>Note</th></tr></thead>
    <tbody>${shown
      .map((r) => `<tr><td>${r.name}<div class="cite">${r.code}</div></td><td class="num">${formatValue(m, r.value)}</td><td>${r.note || ""}</td></tr>`)
      .join("")}</tbody></table>`;
}

function renderSourcesPage() {
  const el = $("source-index");
  const rows = state.catalog.layers.map((l) => {
    const src = (l.sources || []).map((s) => `<a href="${s.url}" target="_blank" rel="noopener">${s.name}</a>`).join("<br>");
    const years = l.years?.length ? `${l.years[0]}–${l.years[l.years.length - 1]}` : "—";
    return `<tr><td>${l.title}<div class="cite">${l.id}</div></td><td>${years}</td><td>${l.confidence || ""}</td><td>${src}</td></tr>`;
  });
  el.innerHTML = `<table>
    <thead><tr><th>Layer</th><th>Years in extract</th><th>Confidence</th><th>Cited sources</th></tr></thead>
    <tbody>${rows.join("")}</tbody>
  </table>
  <p>Generated catalog: ${state.catalog.generated}. Principles: ${state.catalog.principles.join(" ")}</p>`;
}

function renderAll() {
  renderYearUi();
  renderMap();
  renderChart();
  renderNotes();
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
    if (next > 2025) next = 1940;
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
  $("btn-share").addEventListener("click", async () => {
    writeUrl();
    const url = location.href;
    try {
      await navigator.clipboard.writeText(url);
      $("btn-share").textContent = "Copied";
      setTimeout(() => {
        $("btn-share").textContent = "Copy link";
      }, 1600);
    } catch {
      window.prompt("Copy this link", url);
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
  window.addEventListener("resize", () => renderChart());
}

async function loadJson(url, label) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${label} missing — run npm run build`);
  return r.json();
}

async function main() {
  const [catalog, nation, region, la, lookups] = await Promise.all([
    loadJson("./data/catalog.json", "catalog.json"),
    loadJson("./geo/uk-nations.geojson", "uk-nations.geojson"),
    loadJson("./geo/uk-itl1.geojson", "uk-itl1.geojson"),
    loadJson("./geo/uk-lad.geojson", "uk-lad.geojson"),
    loadJson("./geo/lookups.json", "lookups.json"),
  ]);
  if (region.features?.length !== 12) throw new Error("ITL1 GeoJSON does not contain 12 official regions");
  if ((la.features?.length || 0) < 360) throw new Error("LAD GeoJSON is incomplete");
  state.catalog = catalog;
  state.geos = { nation, region, la };
  state.lookups = lookups;
  readUrlIntoState();
  bindUi();
  bindMap();
  setLayer(state.layerId, true, true);
  renderSourcesPage();
}

main().catch((err) => {
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<p class="empty" style="padding:16px">Explorer failed to load: ${String(err.message || err)}</p>`
  );
});
