/**
 * In-process reference API for the desktop app.
 * Reads the packaged SQLite database — no Python on the student machine.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const DISCLAIMER =
  "A match links a query to records in this database. It is not a clinical diagnosis, and an ISCN string alone does not establish a disease.";
const LIMITATIONS = [
  "A parsed formula is not a diagnosis. Disease names appear only when a stored record matches.",
  "FISH patterns belong to the stored probe. A different probe design changes the colors.",
  "The picture is a schematic built from cytogenetic bands. It is not a measurement of physical chromosome length.",
];

const STRATEGY_LIMITS = {
  "dual-fusion": "This pattern is for this dual-fusion pair only.",
  "break-apart": "Separation means the targeted locus is rearranged. The partner gene is not identified.",
  deletion: "The abnormal pattern means one copy of this probe's target is absent.",
  enumeration: "The count is the number of signals for this centromeric target.",
};

const CHROM_SQL = "(a.chromosomes = ? OR a.chromosomes LIKE ? OR a.chromosomes LIKE ? OR a.chromosomes LIKE ?)";

let db = null;
let teachingIndex = null;
let dbPath = "";
let labRoot = "";

export function configureReferenceApi({ unpackedRoot, labDataRoot }) {
  labRoot = labDataRoot || unpackedRoot;
  dbPath = path.join(unpackedRoot, "reference-database", "data", "cytogenetics.sqlite");
  db = null;
  teachingIndex = null;
}

function openDb() {
  if (db) return db;
  if (!dbPath || !fs.existsSync(dbPath)) {
    throw new Error(`Reference database not found at ${dbPath || "(unset)"}`);
  }
  const Database = require("better-sqlite3");
  db = new Database(dbPath, { readonly: true, fileMustExist: true });
  return db;
}

function nameKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeIscn(value) {
  const parts = String(value || "").replace(/\s+/g, "").trim().split(",");
  if (parts.length > 1) parts[1] = parts[1].toUpperCase();
  return parts.join(",");
}

function empty(query, searchType) {
  return {
    query,
    search_type: searchType,
    match: "none",
    disclaimer: DISCLAIMER,
    results: [],
    note: "No verified or educational record matched this query.",
    available: true,
  };
}

function rowObject(row) {
  return row ? { ...row } : null;
}

function diseaseBrief(diseaseId) {
  const row = openDb().prepare("SELECT * FROM diseases WHERE disease_id = ?").get(diseaseId);
  if (!row) return null;
  return {
    disease_id: row.disease_id,
    preferred_name: row.preferred_name,
    description: row.description,
    category: row.category,
    record_class: row.record_class,
    source: row.source,
    source_record: row.source_record,
  };
}

function abnormalitiesFor(diseaseId, limit = 20) {
  return openDb().prepare(`
    SELECT a.*, s.association_type, s.evidence_source, s.evidence_strength, s.match_class
    FROM associations s
    JOIN abnormalities a ON a.abnormality_id = s.abnormality_id
    WHERE s.disease_id = ?
    ORDER BY CASE s.match_class WHEN 'educational' THEN 0 WHEN 'verified' THEN 1 ELSE 2 END
    LIMIT ?
  `).all(diseaseId, limit).map(rowObject);
}

function iscnFor(diseaseId, limit = 12) {
  return openDb().prepare(`
    SELECT original, normalized, events_json, record_class, source, abnormality_id
    FROM iscn_records WHERE disease_id = ? LIMIT ?
  `).all(diseaseId, limit).map(rowObject);
}

function fusionsFor(diseaseId) {
  return openDb().prepare(`
    SELECT f.symbol, f.rearrangement, f.record_class, f.source, d.match_class
    FROM fusion_diseases d
    JOIN gene_fusions f ON f.fusion_id = d.fusion_id
    WHERE d.disease_id = ?
  `).all(diseaseId).map(rowObject);
}

function getFishProbes(diseaseId) {
  const probes = openDb().prepare(`
    SELECT p.* FROM fish_probes p
    JOIN fish_probe_diseases d ON d.probe_id = p.probe_id
    WHERE d.disease_id = ?
  `).all(diseaseId);
  return probes.map((probe) => {
    const item = rowObject(probe);
    item.targets = openDb().prepare(
      "SELECT locus, gene, fluorophore FROM fish_targets WHERE probe_id = ? ORDER BY sort_order",
    ).all(probe.probe_id).map(rowObject);
    item.patterns = openDb().prepare(
      "SELECT pattern_role, pattern, note FROM fish_patterns WHERE probe_id = ?",
    ).all(probe.probe_id).map(rowObject);
    return item;
  });
}

function describeProbe(probe, matchBasis) {
  const patterns = probe.patterns || [];
  return {
    probe_id: probe.probe_id,
    probe_name: probe.probe_name,
    strategy: probe.strategy,
    record_class: probe.record_class,
    targets: probe.targets || [],
    normal_pattern: patterns.find((item) => item.pattern_role === "normal")?.pattern || null,
    abnormal_patterns: patterns.filter((item) => item.pattern_role !== "normal").map((item) => item.pattern),
    pattern_notes: patterns.filter((item) => item.note).map((item) => `${item.pattern_role}: ${item.note}`),
    match_basis: matchBasis,
    limitation: STRATEGY_LIMITS[probe.strategy] || LIMITATIONS[1],
  };
}

function loadTeachingIndex() {
  if (teachingIndex) return teachingIndex;
  teachingIndex = {};
  try {
    const activitiesPath = path.join(labRoot, "data", "disease-activities.json");
    const diseasesPath = path.join(labRoot, "data", "diseases.json");
    if (!fs.existsSync(activitiesPath) || !fs.existsSync(diseasesPath)) return teachingIndex;
    const activities = JSON.parse(fs.readFileSync(activitiesPath, "utf8"));
    const catalog = JSON.parse(fs.readFileSync(diseasesPath, "utf8"));
    for (const disease of catalog.diseases || []) {
      if (disease.id in activities && disease.disease_name) {
        teachingIndex[nameKey(disease.disease_name)] = disease.id;
      }
    }
  } catch {
    teachingIndex = {};
  }
  return teachingIndex;
}

function capabilitiesFor(result, interpretations = []) {
  const key = nameKey(result.preferred_name);
  const teachingHit = loadTeachingIndex()[key];
  return {
    reference: true,
    iscn_interpretation: interpretations.some((item) => item.status === "complete"),
    chromosome_visualization: interpretations.some((item) => item.visualization),
    fish: Boolean(result.fish_probes?.length),
    teaching_activity: Boolean(teachingHit),
    teaching_href: teachingHit ? `#/disease/${teachingHit}` : "",
  };
}

function enrichSearchPayload(payload) {
  const results = [];
  for (const row of payload.results || []) {
    if (!row.disease_id) {
      results.push(row);
      continue;
    }
    const examples = row.iscn_examples || [];
    const interpretations = examples.slice(0, 3).map((item) => interpretIscn(item.original));
    const probes = getFishProbes(row.disease_id).map((probe) => describeProbe(probe, "Stored with this disease record."));
    results.push({
      ...row,
      fish_probes: probes,
      capabilities: capabilitiesFor({ ...row, fish_probes: probes }, interpretations),
    });
  }
  return { ...payload, results, available: true };
}

function findDisease(query, limit = 25) {
  const key = nameKey(query);
  if (!key) return empty(query, "disease");
  const connection = openDb();
  const exact = connection.prepare("SELECT disease_id, 'exact' AS how FROM diseases WHERE name_key = ?").all(key);
  const synonyms = connection.prepare(`
    SELECT disease_id, 'synonym' AS how FROM disease_synonyms
    WHERE synonym_key = ? AND disease_id NOT IN (SELECT disease_id FROM diseases WHERE name_key = ?)
  `).all(key, key);
  const how = {};
  const seen = [];
  for (const row of [...exact, ...synonyms]) {
    if (how[row.disease_id]) continue;
    how[row.disease_id] = row.how;
    seen.push(row.disease_id);
    if (seen.length >= limit) break;
  }
  if (!seen.length) return empty(query, "disease");
  const results = seen.map((diseaseId) => {
    const item = diseaseBrief(diseaseId);
    item.match_class = how[diseaseId];
    item.abnormalities = abnormalitiesFor(diseaseId);
    item.iscn_examples = iscnFor(diseaseId);
    item.fusions = fusionsFor(diseaseId);
    return item;
  });
  return {
    query,
    search_type: "disease",
    match: exact.length ? "exact" : "synonym",
    disclaimer: DISCLAIMER,
    results,
    available: true,
  };
}

function findIscn(query) {
  const normalized = normalizeIscn(query);
  if (!normalized) return empty(query, "iscn");
  const rows = openDb().prepare(`
    SELECT r.original, r.normalized, r.events_json, r.record_class, r.source,
           r.disease_id, r.abnormality_id
    FROM iscn_records r WHERE r.normalized = ?
  `).all(normalized);
  const results = rows.map((row) => ({
    ...rowObject(row),
    match_class: "exact",
    disease: diseaseBrief(row.disease_id),
    events: JSON.parse(row.events_json || "[]"),
  }));
  const response = {
    query,
    normalized,
    search_type: "iscn",
    match: results.length ? "exact" : "none",
    disclaimer: DISCLAIMER,
    results,
    available: true,
  };
  if (!results.length) response.note = "No source-supported or educational ISCN record matched. No disease was inferred.";
  return response;
}

function bandQuery(value) {
  const text = String(value || "").trim().toLowerCase().replace(/chromosome/g, "").replace(/chr/g, "");
  const match = text.match(/^([0-9]{1,2}|x|y)([pq][0-9]+(?:\.[0-9]+)?)?$/i);
  if (!match) return null;
  return [match[1].toUpperCase(), (match[1] + (match[2] || "")).toUpperCase()];
}

function findChromosome(query, limit = 40) {
  const parsed = bandQuery(query);
  if (!parsed) return empty(query, "chromosome");
  const [chrom, band] = parsed;
  const rows = openDb().prepare(`
    SELECT * FROM abnormalities
    WHERE bands LIKE ? OR chromosomes = ? OR chromosomes LIKE ? OR chromosomes LIKE ? OR chromosomes LIKE ?
  `).all(`%${band}%`, chrom, `${chrom},%`, `%,${chrom},%`, `%,${chrom}`);
  const results = [];
  for (const row of rows) {
    const bands = String(row.bands || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
    const chromosomes = String(row.chromosomes || "").split(",").map((item) => item.trim().toUpperCase()).filter(Boolean);
    const bandKey = band.toLowerCase();
    const exact = bands.includes(bandKey);
    const prefix = bands.some((item) => item.startsWith(`${bandKey}.`) || bandKey.startsWith(`${item}.`));
    const chromosomeOnly = !bands.length && chromosomes.includes(chrom) && band === chrom;
    if (!exact && !prefix && !chromosomeOnly && !(band === chrom && chromosomes.includes(chrom))) continue;
    const item = rowObject(row);
    item.match_class = exact || chromosomeOnly ? "exact" : "partial";
    item.diseases = [];
    for (const link of openDb().prepare(
      "SELECT disease_id, match_class, evidence_strength FROM associations WHERE abnormality_id = ?",
    ).all(row.abnormality_id)) {
      const brief = diseaseBrief(link.disease_id);
      if (brief) {
        brief.association_class = link.match_class;
        brief.evidence_strength = link.evidence_strength;
        item.diseases.push(brief);
      }
    }
    results.push(item);
  }
  if (!results.length) {
    const payload = empty(query, "chromosome");
    payload.note = "No abnormality record matched this chromosome or band.";
    return payload;
  }
  results.sort((a, b) => (a.match_class === "exact" ? 0 : 1) - (b.match_class === "exact" ? 0 : 1));
  return {
    query,
    search_type: "chromosome",
    match: results[0].match_class,
    disclaimer: DISCLAIMER,
    results: results.slice(0, limit),
    available: true,
  };
}

function findGene(query, limit = 40) {
  const symbol = String(query || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (symbol.length < 2) return empty(query, "gene");
  const abnormalities = openDb().prepare(`
    SELECT * FROM abnormalities
    WHERE genes = ? OR genes LIKE ? OR genes LIKE ? OR genes LIKE ?
  `).all(symbol, `${symbol},%`, `%,${symbol},%`, `%,${symbol}`);
  const fusions = openDb().prepare(
    "SELECT * FROM gene_fusions WHERE gene_a = ? OR gene_b = ?",
  ).all(symbol, symbol);
  if (!abnormalities.length && !fusions.length) return empty(query, "gene");
  const results = abnormalities.slice(0, limit).map((row) => {
    const item = rowObject(row);
    item.match_class = "exact";
    item.diseases = [];
    for (const link of openDb().prepare(
      "SELECT disease_id, match_class, evidence_strength FROM associations WHERE abnormality_id = ?",
    ).all(row.abnormality_id)) {
      const brief = diseaseBrief(link.disease_id);
      if (brief) {
        brief.association_class = link.match_class;
        brief.evidence_strength = link.evidence_strength;
        item.diseases.push(brief);
      }
    }
    return item;
  });
  const fusionRows = fusions.map((row) => {
    const item = rowObject(row);
    item.diseases = [];
    for (const link of openDb().prepare(
      "SELECT disease_id, match_class FROM fusion_diseases WHERE fusion_id = ?",
    ).all(row.fusion_id)) {
      const brief = diseaseBrief(link.disease_id);
      if (brief) {
        brief.association_class = link.match_class;
        item.diseases.push(brief);
      }
    }
    return item;
  });
  return {
    query,
    search_type: "gene",
    match: "exact",
    disclaimer: DISCLAIMER,
    results,
    fusions: fusionRows,
    available: true,
  };
}

function findFusion(query) {
  let symbol = String(query || "").trim().toLowerCase().replace(/:/g, "::");
  symbol = symbol.replace(/:{2,}/g, "::");
  if (!symbol.includes("::")) return empty(query, "fusion");
  const rows = openDb().prepare("SELECT * FROM gene_fusions WHERE symbol_key = ?").all(symbol);
  if (!rows.length) return empty(query, "fusion");
  const results = rows.map((row) => {
    const item = rowObject(row);
    item.match_class = "exact";
    item.diseases = [];
    for (const link of openDb().prepare(
      "SELECT disease_id, match_class FROM fusion_diseases WHERE fusion_id = ?",
    ).all(row.fusion_id)) {
      const brief = diseaseBrief(link.disease_id);
      if (brief) {
        brief.association_class = link.match_class;
        item.diseases.push(brief);
      }
    }
    return item;
  });
  return {
    query,
    search_type: "fusion",
    match: "exact",
    disclaimer: DISCLAIMER,
    results,
    available: true,
  };
}

function search(searchType, query) {
  const kind = String(searchType || "").toLowerCase();
  if (kind === "disease") return enrichSearchPayload(findDisease(query));
  if (kind === "iscn") return { ...findIscn(query), available: true };
  if (kind === "chromosome") return { ...findChromosome(query), available: true };
  if (kind === "gene") return { ...findGene(query), available: true };
  if (kind === "fusion") return { ...findFusion(query), available: true };
  return empty(query, kind || "unknown");
}

function chromArgs(chrom) {
  return [chrom, `${chrom},%`, `%,${chrom},%`, `%,${chrom}`];
}

function evidenceGroup(matchClass, strength) {
  if (matchClass === "educational") return "educational";
  const score = String(strength || "").match(/score (\d+)/i);
  const value = score ? Number(score[1]) : null;
  if (value === 3) return "sufficient";
  if (value === 1 || value === 2) return "limited";
  if (value === 30) return "recessive";
  return "other";
}

function chromosomeDiseases(query) {
  const chrom = String(query || "").trim().toUpperCase().replace(/^CHR/, "");
  if (!/^([1-9]|1[0-9]|2[0-2]|X|Y)$/.test(chrom)) return empty(query, "chromosome");
  const rows = openDb().prepare(`
    SELECT d.disease_id, d.preferred_name, d.record_class AS disease_class,
           s.match_class, s.evidence_strength, s.association_type,
           a.bands, a.genes, a.source
    FROM abnormalities a
    JOIN associations s ON s.abnormality_id = a.abnormality_id
    JOIN diseases d ON d.disease_id = s.disease_id
    WHERE ${CHROM_SQL}
  `).all(...chromArgs(chrom));
  const rank = { educational: 0, sufficient: 1, limited: 2, recessive: 3, other: 4 };
  const grouped = {};
  for (const row of rows) {
    const group = evidenceGroup(row.match_class, row.evidence_strength);
    const item = grouped[row.disease_id] || {
      disease_id: row.disease_id,
      preferred_name: row.preferred_name,
      record_class: row.disease_class,
      evidence_group: group,
      bands: [],
      genes: [],
      changes: [],
      sources: [],
    };
    if (rank[group] < rank[item.evidence_group]) item.evidence_group = group;
    for (const [key, value] of [
      ["bands", row.bands],
      ["genes", row.genes],
      ["changes", row.association_type],
      ["sources", row.source],
    ]) {
      for (const part of String(value || "").split(",")) {
        const text = part.trim();
        if (text && !item[key].includes(text)) item[key].push(text);
      }
    }
    grouped[row.disease_id] = item;
  }
  const results = Object.values(grouped).sort((a, b) =>
    rank[a.evidence_group] - rank[b.evidence_group]
    || a.preferred_name.localeCompare(b.preferred_name));
  const counts = {};
  for (const item of results) counts[item.evidence_group] = (counts[item.evidence_group] || 0) + 1;
  return {
    query,
    chromosome: chrom,
    search_type: "chromosome-diseases",
    match: results.length ? "exact" : "none",
    disclaimer: DISCLAIMER,
    counts,
    results,
    note: results.length ? "" : "No stored abnormality on this chromosome is linked to a disease record.",
    available: true,
  };
}

function chromosomeCounts() {
  const counts = {};
  for (const chrom of [...Array.from({ length: 22 }, (_, index) => String(index + 1)), "X", "Y"]) {
    const row = openDb().prepare(`
      SELECT COUNT(DISTINCT s.disease_id) AS n
      FROM abnormalities a JOIN associations s ON s.abnormality_id = a.abnormality_id
      WHERE ${CHROM_SQL}
    `).get(...chromArgs(chrom));
    counts[chrom] = row?.n || 0;
  }
  return { counts, disclaimer: DISCLAIMER, available: true };
}

function parseEvents(text) {
  const raw = String(text || "").trim();
  const events = [];
  for (const token of raw.match(/[+-](?:[1-9]|1\d|2[0-2]|X|Y)\b/gi) || []) {
    events.push({
      token,
      kind: "numerical",
      supported: true,
      chromosomes: [token.slice(1).toUpperCase()],
      bands: [],
      geometry: { note: "Whole-chromosome gain or loss." },
    });
  }
  for (const token of raw.match(/\b(?:del|dup|inv|t|der|i|rob|r)\([^)]+\)(?:\([^)]+\))?/gi) || []) {
    const kind = token.startsWith("del") ? "deletion"
      : token.startsWith("dup") ? "duplication"
        : token.startsWith("inv") ? "inversion"
          : token.startsWith("t") || token.startsWith("der") ? "translocation"
            : token.startsWith("i") ? "isochromosome"
              : token.startsWith("rob") ? "robertsonian"
                : token.startsWith("r") ? "ring" : "structural";
    events.push({
      token,
      kind,
      supported: true,
      chromosomes: [...token.matchAll(/\b([1-9]|1\d|2[0-2]|X|Y)\b/gi)].map((match) => match[1].toUpperCase()),
      bands: [...token.matchAll(/[pq]\d+(?:\.\d+)?/gi)].map((match) => match[0].toLowerCase()),
      geometry: { note: "Structural change named in the formula." },
    });
  }
  return events;
}

function interpretIscn(text) {
  const original = String(text || "").trim();
  const normalized = normalizeIscn(original);
  const events = parseEvents(original);
  const exactRows = normalized
    ? openDb().prepare(`
        SELECT original, normalized, record_class, source, disease_id, abnormality_id
        FROM iscn_records WHERE normalized = ?
      `).all(normalized)
    : [];
  const exact = [];
  const seen = new Set();
  for (const row of exactRows) {
    const marker = `${row.normalized}|${row.disease_id}`;
    if (seen.has(marker)) continue;
    seen.add(marker);
    exact.push({
      original: row.original,
      match_class: "exact",
      record_class: row.record_class,
      source: row.source,
      disease: diseaseBrief(row.disease_id),
    });
  }
  const structural = [];
  const seenAbn = new Set();
  for (const item of events.filter((event) => event.kind === "deletion" || event.kind === "duplication" || event.kind === "numerical")) {
    for (const band of item.bands.length ? item.bands : item.chromosomes) {
      const rows = openDb().prepare(`
        SELECT abnormality_id, abnormality_type, bands, record_class, source, evidence_label
        FROM abnormalities WHERE lower(bands) LIKE ? OR chromosomes = ? LIMIT 12
      `).all(`%${String(band).toLowerCase()}%`, String(band).toUpperCase());
      for (const row of rows) {
        if (seenAbn.has(row.abnormality_id)) continue;
        if (item.kind === "deletion" && !["deletion", "aneuploidy"].includes(row.abnormality_type)) continue;
        if (item.kind === "duplication" && row.abnormality_type !== "duplication") continue;
        seenAbn.add(row.abnormality_id);
        const diseases = [];
        for (const link of openDb().prepare(
          "SELECT disease_id, match_class, evidence_strength FROM associations WHERE abnormality_id = ?",
        ).all(row.abnormality_id)) {
          const brief = diseaseBrief(link.disease_id);
          if (brief) {
            brief.association_class = "structural";
            brief.evidence_strength = link.evidence_strength;
            diseases.push(brief);
          }
        }
        structural.push({
          abnormality_id: row.abnormality_id,
          abnormality_type: row.abnormality_type,
          bands: row.bands,
          record_class: row.record_class,
          source: row.source,
          match_class: "structural",
          evidence_label: row.evidence_label,
          diseases: diseases.slice(0, 6),
        });
      }
    }
  }
  const diseaseIds = exact.map((row) => row.disease?.disease_id).filter(Boolean);
  const probes = [];
  const seenProbe = new Set();
  for (const diseaseId of diseaseIds) {
    for (const probe of getFishProbes(diseaseId)) {
      if (seenProbe.has(probe.probe_id)) continue;
      seenProbe.add(probe.probe_id);
      probes.push(describeProbe(probe, "The stored probe is linked to a matching disease record."));
    }
  }
  const status = !original ? "empty" : (/^\d/.test(original) ? "complete" : "partial");
  const association = exact.length ? "exact" : structural.length ? "structural" : "none";
  const classes = exact.map((row) => row.record_class);
  let associationLevel = "none";
  let associationNote = "No stored disease record matches this formula.";
  if (classes.includes("verified")) {
    associationLevel = "verified";
    associationNote = "A stored reference source links this formula to a disease.";
  } else if (classes.includes("teaching-catalog")) {
    associationLevel = "teaching-catalog";
    associationNote = "This formula is the teaching catalog's canonical example.";
  } else if (classes.includes("educational")) {
    associationLevel = "educational";
    associationNote = "This formula is a curated educational example.";
  } else if (structural.length) {
    associationLevel = "structural";
    associationNote = "Band overlap found stored records. That is not one diagnosis.";
  }
  const numericalOnly = events.length > 0 && events.every((item) => item.kind === "numerical");
  return {
    available: true,
    query: original,
    status,
    original,
    normalized: normalized || original,
    prefix: /^(mos|chi)\b/i.test(original) ? original.slice(0, 3).toLowerCase() : "",
    mosaic: original.includes("/"),
    reason: status === "empty" ? "No ISCN string was entered." : "",
    lines: [{ raw: original, events }],
    visualization: status === "complete" && !original.includes("/"),
    visualization_scope: original.includes("/") ? "first cell line" : "formula",
    schematic_note: LIMITATIONS[2],
    associations: {
      match: association,
      exact,
      structural: structural.slice(0, 12),
      note: association === "none" && status !== "empty" ? "No stored disease record matched this formula." : "",
    },
    fusions: [],
    fish_probes: probes,
    validation: {
      syntax: status === "complete" ? "validated" : status === "empty" ? "none" : "partial",
      structure: numericalOnly || !events.length ? "validated" : "not_checked",
      association: associationLevel,
      notes: {
        syntax: status === "complete" ? "Syntax validated means every token is in the supported registry." : "Part of this string was not interpreted.",
        structure: numericalOnly || !events.length
          ? "The complement uses the unmodified band map."
          : "Rearranged chromosomes are checked in the Reference library viewer.",
        association: associationNote,
      },
    },
    disclaimer: DISCLAIMER,
    limitations: LIMITATIONS,
  };
}

function diseaseRecord(diseaseId) {
  const item = diseaseBrief(diseaseId);
  if (!item) {
    return { available: true, match: "none", disclaimer: DISCLAIMER, result: null };
  }
  item.synonyms = openDb().prepare(
    "SELECT synonym FROM disease_synonyms WHERE disease_id = ? ORDER BY synonym LIMIT 30",
  ).all(diseaseId).map((row) => row.synonym);
  item.identifiers = openDb().prepare(
    "SELECT system, code FROM disease_identifiers WHERE disease_id = ? ORDER BY system",
  ).all(diseaseId).map(rowObject);
  item.abnormalities = abnormalitiesFor(diseaseId);
  item.iscn_examples = iscnFor(diseaseId);
  item.fusions = fusionsFor(diseaseId);
  const probes = getFishProbes(diseaseId).map((probe) =>
    describeProbe(probe, "Stored with this disease record. The pattern belongs to this probe."));
  item.fish_probes = probes;
  const interpretations = (item.iscn_examples || []).slice(0, 4).map((example) => interpretIscn(example.original));
  item.interpretations = interpretations;
  item.capabilities = capabilitiesFor(item, interpretations);
  item.invented_iscn = false;
  return {
    available: true,
    match: "exact",
    disclaimer: DISCLAIMER,
    result: item,
    abnormalities_note: "A disease name is not turned into an ISCN string unless that string is already stored.",
  };
}

function parseQuery(raw) {
  const params = {};
  for (const part of String(raw || "").split("&")) {
    if (!part) continue;
    const [key, ...rest] = part.split("=");
    const decode = (value) => decodeURIComponent(String(value || "").replace(/\+/g, " "));
    params[decode(key)] = decode(rest.join("="));
  }
  return params;
}

/** Same contract as reference-database/src/adapters/api.py */
export function respond(pathname, rawQuery = "") {
  try {
    openDb();
    const params = parseQuery(rawQuery);
    if (pathname.endsWith("/status")) return { available: true };
    if (pathname.endsWith("/chromosome-counts")) return chromosomeCounts();
    if (pathname.endsWith("/chromosome")) return chromosomeDiseases(params.q || "");
    if (pathname.endsWith("/coverage")) return { available: true, coverage: {} };
    if (pathname.endsWith("/interpret")) return interpretIscn(params.q || "");
    if (pathname.endsWith("/disease")) return diseaseRecord(params.id || "");
    if (pathname.endsWith("/search")) return search(params.type || "disease", params.q || "");
    return { available: false, reason: "Unknown reference request." };
  } catch (error) {
    return {
      available: false,
      reason: `Reference module is unavailable. ${error?.message || error}`,
    };
  }
}
