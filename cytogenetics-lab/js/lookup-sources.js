/**
 * Sources for the casework lookup.
 * The Disease Atlas is local. OMIM is an optional live query for a title,
 * MIM number, cytogenetic location, and entry URL. Other catalogs are links.
 * Manufacturer probe pages are not copied into the lab.
 */

import { isCaseworkSpecimenReady, isSeenByMethod } from "./activities.js";
import { classifyQuery, formulasFromDisease, isWrittenFormula } from "./lookup-engine.js";
import { normalizeISCN } from "./iscn.js";

const OMIM_KEY = "cyto.omimApiKey";

export function readOmimApiKey() {
  try {
    return globalThis.localStorage?.getItem(OMIM_KEY)?.trim() || "";
  } catch {
    return "";
  }
}

export function saveOmimApiKey(value) {
  try {
    const key = String(value || "").trim();
    if (key) globalThis.localStorage?.setItem(OMIM_KEY, key);
    else globalThis.localStorage?.removeItem(OMIM_KEY);
  } catch {
    /* Storage can be unavailable in a private window. The lookup still links out. */
  }
}

function normalizeName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function nameScore(disease, text) {
  const query = normalizeName(text);
  if (!query || isWrittenFormula(text)) return 0;
  const name = normalizeName(disease.disease_name);
  const id = normalizeName(disease.id);
  if (query === name || query === id) return 100;
  if (name.startsWith(query) && query.length >= 3) return 80;
  const words = query.split(" ").filter((word) => word.length >= 3);
  if (words.length && words.every((word) => name.split(" ").includes(word))) return 70;
  if (query.length >= 5 && name.includes(query)) return 60;
  return 0;
}

function locusScore(disease, text) {
  const kind = classifyQuery(text);
  if (kind.kind !== "band") return 0;
  const band = kind.band.toLowerCase();
  const blob = (disease.cytogenetic_cases || []).flatMap((item) => [
    item.primary_locus,
    item.specific_region,
    item.representative_teaching_karyotype?.iscn,
    ...(item.example_notation || []),
  ]).filter(Boolean).join(" ").toLowerCase();
  return blob.includes(band) ? 75 : 0;
}

export function searchAtlas(library, text, {
  method = null,
  caseworkOnly = false,
  links = null,
  packs = null,
  probes = null,
} = {}) {
  const query = String(text || "").trim();
  if (!query) return [];
  const formula = isWrittenFormula(query) ? normalizeISCN(query) : "";
  const lab = method === "fish" || method === "karyotype" ? method : null;
  const hits = [];
  for (const disease of library?.diseases || []) {
    if (lab && !isSeenByMethod(disease, lab)) continue;
    if (caseworkOnly && lab && !isCaseworkSpecimenReady(disease, lab, links, packs, probes)) continue;
    let score = Math.max(nameScore(disease, query), locusScore(disease, query));
    if (formula && formulasFromDisease(disease).some((item) => item.normalized === formula)) score = Math.max(score, 90);
    if (score >= 60) hits.push({ disease, score });
  }
  hits.sort((a, b) => b.score - a.score || String(a.disease.disease_name).localeCompare(String(b.disease.disease_name)));
  return hits.slice(0, 8);
}

export function omimSearchUrl(text) {
  return `https://omim.org/search?search=${encodeURIComponent(String(text || "").trim())}`;
}

function omimEntry(row) {
  const entry = row?.entry || row || {};
  const mimNumber = entry.mimNumber || entry.mim_number || "";
  const title = entry.titles?.preferredTitle || entry.preferredTitle || "";
  const maps = [];
  if (entry.geneMap) maps.push(entry.geneMap);
  for (const item of entry.geneMapList || []) maps.push(item.geneMap || item);
  const cytoLocation = maps.map((item) => item?.cytoLocation).find(Boolean) || "";
  if (!mimNumber && !title) return null;
  return {
    mimNumber: String(mimNumber),
    title: String(title).slice(0, 240),
    cytoLocation: String(cytoLocation).slice(0, 80),
    url: mimNumber ? `https://omim.org/entry/${encodeURIComponent(mimNumber)}` : "",
  };
}

export async function searchOmim(text, { apiKey = "", fetchImpl = globalThis.fetch } = {}) {
  const query = String(text || "").trim();
  const searchUrl = omimSearchUrl(query);
  if (!query) return { status: "empty", searchUrl, entries: [] };
  if (!apiKey || typeof fetchImpl !== "function") return { status: "link", searchUrl, entries: [] };
  const endpoint = new URL("https://api.omim.org/api/entry/search");
  endpoint.searchParams.set("search", query);
  endpoint.searchParams.set("start", "0");
  endpoint.searchParams.set("limit", "5");
  endpoint.searchParams.set("include", "geneMap");
  endpoint.searchParams.set("format", "json");
  endpoint.searchParams.set("apiKey", apiKey);
  try {
    const response = await fetchImpl(endpoint);
    if (!response.ok) return { status: "unavailable", searchUrl, entries: [] };
    const body = await response.json();
    const list = body?.omim?.searchResponse?.entryList || [];
    const entries = list.map(omimEntry).filter(Boolean).slice(0, 5);
    return { status: entries.length ? "ok" : "empty", searchUrl, entries };
  } catch {
    return { status: "unavailable", searchUrl, entries: [] };
  }
}

export function referenceLinks({ query, chromosomes = [], abnormality = "" } = {}) {
  const links = [
    { catalog: "OMIM", label: "OMIM search", url: omimSearchUrl(query) },
    { catalog: "Atlas of Genetics", label: "Atlas of Genetics and Cytogenetics", url: "https://atlasgeneticsoncology.org/" },
    { catalog: "MetaSystems", label: "MetaSystems FISH probe list", url: "https://metasystems-probes.com/en/probes/" },
    { catalog: "CytoCell", label: "CytoCell chromosome search", url: "https://www.ogt.com/us/products/cytocell-fish/chromosome-search/" },
  ];
  if (abnormality) {
    links.splice(1, 0, {
      catalog: "Mitelman",
      label: `Mitelman cases for ${abnormality}`,
      url: "https://mitelmandatabase.isb-cgc.org/case_search",
    });
  } else {
    links.splice(1, 0, {
      catalog: "Mitelman",
      label: "Mitelman Database",
      url: "https://mitelmandatabase.isb-cgc.org/",
    });
  }
  const chromosome = chromosomes.find((item) => /^(?:[1-9]|1\d|2[0-2]|X|Y)$/.test(String(item)));
  if (chromosome) {
    links.push({
      catalog: "Abbott",
      label: `Vysis probes for chromosome ${chromosome}`,
      url: `https://www.molecular.abbott/int/en/chromosome-main/${String(chromosome).toLowerCase()}`,
    });
  }
  return links;
}
