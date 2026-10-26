/**
 * Interpret a disease name, band, or ISCN string into a casework proposal.
 * A formula is used only when the query or a Disease Atlas record already writes it.
 * FISH is attached only from a stored teaching assay whose probes match that record.
 */

import { analyzeFormula } from "./case-analysis.js";
import { exploreISCN, normalizeISCN } from "./iscn.js";

const FORMULA_RE = /^(?:mos\s+|chi\s+)?\d+\s*,/i;
const BAND_RE = /^(?:[1-9]|1\d|2[0-2]|X|Y)[pq]\d+(?:\.\d+)?$/i;
const CHROMOSOME_RE = /^(?:[1-9]|1\d|2[0-2]|x|y)$/i;
const GENERIC_PROBE_TOKENS = new Set(["cep", "lsi", "xl", "probe", "fish"]);

export function classifyQuery(text) {
  const raw = String(text || "").trim();
  if (!raw) return { kind: "empty", raw: "" };
  if (FORMULA_RE.test(raw)) return { kind: "formula", raw };
  const compact = raw.replace(/\s+/g, "");
  if (BAND_RE.test(compact)) return { kind: "band", raw, band: compact };
  return { kind: "disease", raw };
}

export function isWrittenFormula(text) {
  return FORMULA_RE.test(String(text || "").trim());
}

export function describeFormula(text, meta = {}) {
  const raw = String(text || "").trim();
  const report = exploreISCN(raw);
  const analysis = analyzeFormula(raw);
  const line = (report.lines || []).find((item) => item.sex);
  const structural = (line?.items || []).filter((item) => item.kind !== "numerical");
  const usable = report.status === "formula" || report.status === "mosaic";
  const ready = Boolean(line?.sex) && usable && structural.every((item) => item.drawn);
  return {
    text: report.raw || raw,
    normalized: normalizeISCN(raw),
    role: meta.role || "entered",
    source: meta.source || "query",
    diseaseId: meta.diseaseId || "",
    diseaseName: meta.diseaseName || "",
    caseName: meta.caseName || "",
    ready,
    mosaic: report.status === "mosaic",
    count: line?.count ?? null,
    sex: line?.sex || "",
    gains: analysis.gains || [],
    losses: analysis.losses || [],
    breakpoints: analysis.breakpoints || [],
    undrawn: structural.filter((item) => !item.drawn).map((item) => item.token),
  };
}

export function formulasFromDisease(disease) {
  const out = [];
  const seen = new Set();
  for (const item of disease?.cytogenetic_cases || []) {
    const teaching = item.representative_teaching_karyotype?.iscn || "";
    const rows = [];
    if (isWrittenFormula(teaching)) rows.push({ text: teaching, canonical: item.role === "canonical" });
    for (const notation of item.example_notation || []) {
      if (isWrittenFormula(notation)) rows.push({ text: notation, canonical: false });
    }
    for (const row of rows) {
      const described = describeFormula(row.text, {
        role: row.canonical ? "canonical" : "alternate",
        source: "atlas",
        diseaseId: disease.id || "",
        diseaseName: disease.disease_name || "",
        caseName: item.case_title || "",
      });
      if (!described.normalized || seen.has(described.normalized)) continue;
      seen.add(described.normalized);
      out.push(described);
    }
  }
  return out;
}

function bandKey(value) {
  const match = String(value || "").toLowerCase().match(/((?:[1-9]|1\d|2[0-2]|x|y)[pq]\d+(?:\.\d+)?)/);
  return match ? match[1] : "";
}

function bandsOverlap(left, right) {
  const a = bandKey(left);
  const b = bandKey(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  return longer.startsWith(shorter) && longer[shorter.length] === ".";
}

export function placesFromDisease(disease) {
  const chromosomes = new Set();
  const bands = new Set();
  const genes = [];
  for (const item of disease?.cytogenetic_cases || []) {
    const teaching = item.representative_teaching_karyotype?.iscn || "";
    const report = isWrittenFormula(teaching) ? exploreISCN(teaching) : null;
    const structural = (report?.lines || []).some((line) => (line.items || []).some((entry) => entry.kind !== "numerical"));
    if (!structural) {
      for (const chromosome of item.primary_chromosome || []) chromosomes.add(String(chromosome).toLowerCase());
      for (const chromosome of placesFromFormula(teaching).chromosomes) chromosomes.add(chromosome);
    }
    for (const band of placesFromFormula(teaching).bands) bands.add(band);
    for (const notation of item.example_notation || []) {
      for (const band of placesFromFormula(notation).bands) bands.add(band);
    }
    if (typeof item.genes === "string" && item.genes.trim()) genes.push(item.genes);
    const blob = [
      item.primary_locus,
      item.specific_region,
      teaching,
      ...(item.example_notation || []),
    ].filter(Boolean).join(" ");
    for (const match of blob.matchAll(/\b((?:[1-9]|1\d|2[0-2]|X|Y)[pq]\d+(?:\.\d+)?)\b/gi)) {
      bands.add(match[1].toLowerCase());
    }
  }
  return { chromosomes, bands, genes: genes.join(" ") };
}

export function placesFromFormula(text) {
  const chromosomes = new Set();
  const bands = new Set();
  const report = exploreISCN(text);
  for (const line of report.lines || []) {
    for (const item of line.items || []) {
      if (item.kind === "numerical") {
        for (const chromosome of item.chromosomes || []) chromosomes.add(String(chromosome).toLowerCase());
      }
      for (const band of item.breakpoints || []) {
        const key = bandKey(band);
        if (key) bands.add(key);
      }
    }
  }
  return { chromosomes, bands, genes: "" };
}

function mergePlaces(rows) {
  const chromosomes = new Set();
  const bands = new Set();
  const genes = [];
  for (const row of rows) {
    for (const chromosome of row?.chromosomes || []) chromosomes.add(chromosome);
    for (const band of row?.bands || []) bands.add(band);
    if (row?.genes) genes.push(row.genes);
  }
  return { chromosomes, bands, genes: genes.join(" ") };
}

function geneNames(probe) {
  return [probe?.probe_name, probe?.probe_id]
    .filter(Boolean)
    .join(" ")
    .split(/[^A-Za-z0-9]+/)
    .filter((token) => /[A-Za-z]/.test(token) && token.length >= 3 && !GENERIC_PROBE_TOKENS.has(token.toLowerCase()));
}

function probeMatches(probe, places) {
  if (!probe) return false;
  const locus = String(probe.target_locus || "");
  const chromosome = String(probe.chromosome || "").toLowerCase();
  const centromeric = probe.probe_type === "centromeric" || /cen/i.test(locus);
  if (centromeric) {
    return CHROMOSOME_RE.test(chromosome) && places.chromosomes.has(chromosome);
  }
  if ([...places.bands].some((band) => bandsOverlap(band, locus))) return true;
  const haystack = ` ${String(places.genes || "").toLowerCase()} `;
  return geneNames(probe).some((token) => {
    const needle = token.toLowerCase();
    return haystack.includes(` ${needle} `) || haystack.includes(`${needle}::`) || haystack.includes(`::${needle}`);
  });
}

function resolveProbes(probeCatalog, fish) {
  const list = probeCatalog?.probes || [];
  return (fish?.probe_ids || []).map((id) => list.find((probe) => probe.probe_id === id)).filter(Boolean);
}

function assayMatches(fish, probeCatalog, places) {
  const probes = resolveProbes(probeCatalog, fish);
  if (!probes.length || (!places.chromosomes.size && !places.bands.size && !places.genes)) return false;
  return probes.every((probe) => probeMatches(probe, places));
}

function fishPacks(links, packs) {
  const rows = [];
  const seen = new Set();
  for (const [diseaseId, link] of Object.entries(links || {})) {
    const caseId = link?.fish;
    if (!caseId || seen.has(caseId)) continue;
    const fish = packs?.[caseId]?.fish;
    if (!fish?.assay_type || !fish.probe_ids?.length) continue;
    seen.add(caseId);
    rows.push({ diseaseId, caseId, fish });
  }
  return rows;
}

function fishRecord(row, probeCatalog, preferred) {
  const probes = resolveProbes(probeCatalog, row.fish).map((probe) => ({
    name: probe.probe_name || probe.probe_id,
    locus: probe.target_locus || "",
    fluorophore: probe.fluorophore || "",
  }));
  return {
    caseId: row.caseId,
    diseaseId: row.diseaseId,
    assayType: row.fish.assay_type,
    specimenType: row.fish.specimen_type || "",
    pattern: row.fish.case_specific_cutoff?.pattern || "",
    normalPattern: row.fish.probe_type_expected?.normal_pattern || "",
    interpretation: row.fish.expected_interpretation || "",
    probes,
    preferred,
    stored: true,
  };
}

export function matchFishAssays({ atlasHits = [], formulas = [], links, packs, probes }) {
  const hitsById = new Map(atlasHits.map((hit) => [hit.disease?.id, hit.disease]));
  const queryFormulas = formulas.filter((formula) => formula.source === "query");
  const queryPlaces = mergePlaces(queryFormulas.map((formula) => placesFromFormula(formula.text)));
  const matched = [];
  for (const row of fishPacks(links, packs)) {
    const disease = hitsById.get(row.diseaseId);
    const places = disease
      ? mergePlaces([queryPlaces, placesFromDisease(disease)])
      : queryPlaces;
    if (!assayMatches(row.fish, probes, places)) continue;
    matched.push(fishRecord(row, probes, Boolean(disease)));
  }
  matched.sort((a, b) => Number(b.preferred) - Number(a.preferred) || a.assayType.localeCompare(b.assayType));
  return matched;
}

function abnormalityToken(formulas) {
  const structural = formulas.flatMap((formula) => formula.breakpoints.map((event) => event.token));
  return structural.find(Boolean) || "";
}

export function proposalChromosomes(formulas, atlasHits) {
  const found = new Set();
  for (const formula of formulas) {
    for (const event of [...formula.gains, ...formula.losses, ...formula.breakpoints]) {
      const chromosome = String(event.chromosome || "");
      if (CHROMOSOME_RE.test(chromosome)) found.add(chromosome.toUpperCase());
    }
  }
  for (const hit of atlasHits) {
    for (const chromosome of placesFromDisease(hit.disease).chromosomes) found.add(chromosome.toUpperCase());
  }
  return [...found];
}

/**
 * @param {object} spec
 * @param {string} spec.query
 * @param {{disease: object, score: number}[]} [spec.atlasHits]
 * @param {object} [spec.omim]
 * @param {object} [spec.links]
 * @param {object} [spec.packs]
 * @param {object} [spec.probes]
 * @param {object[]} [spec.referenceLinks]
 */
export function buildProposal(spec) {
  const query = classifyQuery(spec.query);
  const atlasHits = spec.atlasHits || [];
  const formulas = [];
  const seen = new Set();
  const add = (formula) => {
    if (!formula?.normalized || seen.has(`${formula.role}:${formula.normalized}`)) return;
    seen.add(`${formula.role}:${formula.normalized}`);
    formulas.push(formula);
  };
  if (query.kind === "formula") add(describeFormula(query.raw, { role: "entered", source: "query" }));
  for (const hit of atlasHits) {
    for (const formula of formulasFromDisease(hit.disease)) add(formula);
  }
  const canonical = formulas.filter((formula) => formula.role === "canonical" && formula.ready);
  const entered = formulas.find((formula) => formula.role === "entered" && formula.ready);
  const selected = canonical.length === 1 ? canonical[0] : (canonical.length === 0 ? entered || null : null);
  const anyReady = formulas.some((formula) => formula.ready);
  const fish = matchFishAssays({
    atlasHits,
    formulas,
    links: spec.links,
    packs: spec.packs,
    probes: spec.probes,
  });
  let status = "reference";
  if (query.kind === "empty") status = "empty";
  else if (anyReady) status = "ready";
  else if (query.kind === "formula" && formulas[0] && !formulas[0].ready && !atlasHits.length) status = "unsupported";
  return {
    query,
    status,
    formulas,
    selected,
    fish,
    atlasHits: atlasHits.map((hit) => ({
      id: hit.disease?.id || "",
      name: hit.disease?.disease_name || "",
      score: hit.score || 0,
    })),
    omim: spec.omim || { status: "link", entries: [], searchUrl: "" },
    links: spec.referenceLinks || [],
    chromosomes: proposalChromosomes(formulas, atlasHits),
    abnormality: abnormalityToken(formulas),
  };
}
