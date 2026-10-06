import { expectedPositions, expandChromosomeSet } from "./chromosomes.js?v=20261006j";
import { shuffle, seedFrom } from "./util.js?v=20261006j";

export const CACHE = "20261006j";

export async function loadJSON(path) {
  const url = path.includes("?") ? path : `${path}?v=${CACHE}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Unable to load ${path} (${res.status})`);
  return res.json();
}

export async function loadCatalog() {
  return loadJSON("data/catalog.json");
}

/** Attach each case file so laboratory discovery can test playable payloads. */
export async function enrichCatalog(catalog) {
  const cases = await Promise.all((catalog?.cases || []).map(async (entry) => {
    const data = await loadJSON(entry.path);
    return { ...entry, ...data };
  }));
  return { ...catalog, cases };
}

export async function loadTemplates() {
  return loadJSON("data/chromosome-templates.json");
}

export async function loadMaps() {
  return loadJSON("data/chromosome-maps.json");
}

export async function loadProbes() {
  return loadJSON("data/probes.json");
}

export async function loadDiseases() {
  return loadJSON("data/diseases.json");
}

export async function loadActivityLinks() {
  return loadJSON("data/disease-activities.json");
}

export async function loadActivityPacks(links, catalog) {
  const ids = new Set();
  Object.values(links || {}).forEach((row) => {
    (row.assemblies || []).forEach((id) => ids.add(id));
    if (row.fish) ids.add(row.fish);
  });
  const packs = {};
  for (const id of ids) {
    const full = await loadCase(id, catalog);
    packs[id] = {
      assembly: full.assembly || null,
      fish: full.fish || null,
      chromosomes_involved: full.chromosomes_involved || [],
      arms_involved: full.arms_involved || [],
      bands_involved: full.bands_involved || [],
    };
  }
  return packs;
}

export async function loadCase(entryOrId, catalog) {
  const entry = typeof entryOrId === "string"
    ? catalog.cases.find((c) => c.case_id === entryOrId)
    : entryOrId;
  if (!entry) throw new Error(`Unknown case: ${entryOrId}`);
  if (entry.clinical_history) return entry;
  const data = await loadJSON(entry.path);
  return { ...entry, ...data };
}

export function hydrateCase(caseData, templates) {
  if ((caseData.assembly || caseData.fish) && !caseData.chromosome_set && !caseData.chromosome_images) {
    return { ...caseData, chromosomes: [], expected_chromosome_positions: {} };
  }
  const chromosomes = shuffle(
    expandChromosomeSet(caseData, templates),
    seedFrom(caseData.case_id + "-tray")
  );
  const positions = caseData.expected_chromosome_positions || expectedPositions(chromosomes);
  return { ...caseData, chromosomes, expected_chromosome_positions: positions };
}

