/**
 * Disease cases come from the Atlas. Activities are reusable engines.
 * Activity payloads (assembly maps, FISH assays) are linked, not copied into new disease records.
 */

import { canonicalCase, diseaseList, karyotypeActivityEnabled, labDiseases, splitBreakpointArms, teachingKaryotype } from "./atlas.js?v=20261006j";
import { seedFrom, shuffle } from "./util.js?v=20261006j";
import { piecesForExercise } from "./banding.js?v=20261024c";
import { placeSyntheticDemo, resolveProbes } from "./fish.js?v=20261006j";

export const HIDDEN_CASE_IDS = new Set([
  "trisomy21-47xx",
  "turner-45x",
  "klinefelter-47xxy",
  "criduchat-del5p",
  "cml-t922",
  "apl-t1517",
  "burkitt-t814",
  "assembly-del5p",
  "assembly-del4p",
  "assembly-der22",
  "assembly-der9",
  "assembly-der15",
  "assembly-der17",
  "assembly-der14",
  "assembly-der8",
  "fish-dualfusion-bcrabl",
  "fish-down-cep21",
  "fish-edwards-cep18",
  "fish-patau-cep13",
  "fish-turner-xy",
  "fish-klinefelter-xy",
  "fish-cri-del5p",
  "fish-wolf-del4p",
  "fish-apl-pml-rara",
  "fish-burkitt-igh-myc",
  "assembly-del22q11",
  "assembly-del7q1123",
  "assembly-del15q11",
  "assembly-del13q14",
  "assembly-der8-t821",
  "assembly-der21-t821",
  "assembly-inv16",
  "assembly-kmt2a-locus",
  "assembly-der2-t25",
  "assembly-der5-t25",
  "assembly-der11-t1122",
  "assembly-der22-t1122",
  "fish-digeorge-del",
  "fish-williams-del",
  "fish-pws-del",
  "fish-as-del",
  "fish-cll-13q",
  "fish-aml-runx1",
  "fish-aml-inv16",
  "fish-kmt2a-ba",
  "fish-alk-ba",
  "fish-ewing-ba",
  "iscn-mosaic-45x",
  "fish-enum-cep21",
  "fish-locus-9q34",
  "fish-breakapart-16q22",
]);

export const CASE_ALIASES = {
  "trisomy21-47xx": "down-syndrome",
  "turner-45x": "turner",
  "klinefelter-47xxy": "klinefelter",
  "criduchat-del5p": "cri-du-chat",
  "cml-t922": "cml",
  "apl-t1517": "apl",
  "burkitt-t814": "burkitt",
};

const NUMERICAL = new Set(["trisomy", "monosomy"]);

export function isStudentCatalogCase(entry) {
  return !HIDDEN_CASE_IDS.has(entry?.case_id);
}

export function structuralClass(item) {
  return item?.correct_classification || "";
}

export function isNumericalFinding(item) {
  return NUMERICAL.has(structuralClass(item));
}

function mapReady(maps, chromosome) {
  return Boolean(maps?.chromosomes?.[String(chromosome)]?.segments?.length);
}

function countsMatch(got, expected) {
  return Object.entries(expected || {}).every(([key, value]) => Number(got?.[key]) === Number(value));
}

const PIECE_CLASSES = new Set(["deletion", "translocation", "inversion", "duplication"]);

/**
 * Appropriateness follows the canonical teaching case only.
 * An alternate mechanism does not put the disease in another laboratory.
 * method_fit on that case overrides the derivation for a future disease.
 */
export function methodFit(disease) {
  const item = canonicalCase(disease);
  const declared = item?.method_fit || {};
  const derived = deriveMethodFit(item);
  return {
    karyotype: declared.karyotype || derived.karyotype,
    chromosome: declared.chromosome || derived.chromosome,
    fish: declared.fish || derived.fish,
  };
}

/** True when the canonical teaching case is appropriate for karyotyping or FISH. */
export function isSeenByMethod(disease, method) {
  if (method !== "karyotype" && method !== "fish") return true;
  return methodFit(disease)[method] === "appropriate";
}

function deriveMethodFit(item) {
  const cls = structuralClass(item);
  const visibility = item?.karyotype_visibility;
  const alteration = item?.generation?.structural_alteration;
  const visible = visibility === "clearly_visible" || visibility === "size_dependent";
  const numerical = cls === "trisomy" || cls === "monosomy";
  const piece = PIECE_CLASSES.has(cls) && Boolean(alteration) && alteration !== "none";
  const fusion = /[A-Za-z0-9]+::[A-Za-z0-9]+/.test(`${item?.genes || ""} ${item?.mechanism || ""} ${item?.case_title || ""}`);
  const locusDeletion = cls === "deletion" && Boolean(item?.primary_locus || item?.specific_region);
  const locusQuestion = item?.chromosome_activity === "locus";
  const explicitKaryotype = item?.default_karyotype_activity;
  return {
    karyotype: explicitKaryotype === false ? "inappropriate" : (explicitKaryotype === true || visible ? "appropriate" : "inappropriate"),
    chromosome: !numerical && (piece || locusDeletion || locusQuestion) ? "appropriate" : "inappropriate",
    fish: numerical || locusDeletion || fusion || locusQuestion || cls === "inversion" ? "appropriate" : "inappropriate",
  };
}

export function laboratoryDiseases(library) {
  const visible = new Set(labDiseases(library).map((disease) => disease.id));
  return diseaseList(library).filter((disease) => {
    if (visible.has(disease.id)) return true;
    const item = canonicalCase(disease);
    return item?.role === "canonical" && item.method_fit && typeof item.method_fit === "object";
  });
}

export function fishReadiness(fish, probeCatalog) {
  const missing = [];
  if (!fish) return { ready: false, missing: ["FISH assay record"] };
  if (!fish.assay_type) missing.push("assay type");
  if (!fish.expected_interpretation) missing.push("interpretation key");
  if (!fish.probe_ids?.length) missing.push("probe definition");
  else if (probeCatalog) {
    const resolved = resolveProbes(probeCatalog, fish.probe_ids);
    if (resolved.length !== fish.probe_ids.length) missing.push("probe definition");
  }
  const abnormal = fish.case_specific_cutoff?.abnormal_counts;
  const normal = fish.case_specific_cutoff?.normal_counts;
  if (!normal || !Object.keys(normal).length) missing.push("expected normal pattern");
  if (!abnormal || !Object.keys(abnormal).length) missing.push("expected abnormal pattern");
  const scorable = (fish.nuclei || []).filter((nucleus) => nucleus.scorable);
  if (scorable.length < 2) missing.push("scorable nucleus data");
  else {
    if (abnormal && !scorable.some((nucleus) => countsMatch(nucleus.expected_counts, abnormal))) {
      missing.push("scorable nucleus matching the abnormal pattern");
    }
    if (normal && !scorable.some((nucleus) => countsMatch(nucleus.expected_counts, normal))) {
      missing.push("scorable nucleus matching the normal pattern");
    }
  }
  if (!(fish.nuclei || []).length) missing.push("scorable nucleus data");
  return { ready: missing.length === 0, missing };
}

function assemblyReadiness(spec, maps) {
  const missing = [];
  if (!spec?.chromosome) missing.push("focused chromosome");
  else if (!mapReady(maps, spec.chromosome)) missing.push(`chromosome ${spec.chromosome} map`);
  if (!spec?.transform?.type || spec.transform.type === "none") missing.push("structural transform");
  if (spec?.chromosome && mapReady(maps, spec.chromosome) && spec?.transform?.type && spec.transform.type !== "none") {
    const pieces = piecesForExercise(maps, spec);
    const centromeres = pieces.filter((piece) => piece.role === "centromere");
    if (!pieces.length || centromeres.length !== 1) missing.push("playable segment order");
    const normal = piecesForExercise(maps, { ...spec, transform: { type: "none" } });
    if (pieces.map((piece) => piece.id).join("|") === normal.map((piece) => piece.id).join("|")) {
      missing.push("transform does not change the chromosome");
    }
  }
  return { ready: missing.length === 0, missing };
}

function packAssembly(packs, caseId) {
  const row = packs?.[caseId];
  const spec = row?.assembly;
  if (!spec?.chromosome) return null;
  return spec;
}

export function linkedPayload(diseaseId, links, packs) {
  const link = links?.[diseaseId] || {};
  const assemblies = (link.assemblies || []).map((id) => packAssembly(packs, id)).filter(Boolean);
  const fish = link.fish ? packs?.[link.fish]?.fish || null : null;
  return { assemblies, fish };
}

/**
 * True when casework can open a drawn specimen for this disease and laboratory.
 * Atlas may list more diseases as theoretically seen by a method; casework needs a pack or formula.
 */
export function isCaseworkSpecimenReady(disease, method, links, packs, probes) {
  if (!disease || (method !== "karyotype" && method !== "fish")) return false;
  if (!isSeenByMethod(disease, method)) return false;
  if (method === "fish") {
    const fish = linkedPayload(disease.id, links, packs).fish;
    return fishReadiness(fish, probes).ready;
  }
  const item = canonicalCase(disease);
  if (item?.lab_level && item.lab_level !== "default") return false;
  if (item?.karyotype_visibility === "usually_not_visible") return false;
  if (item?.default_karyotype_activity === false) return false;
  const iscn = teachingKaryotype(item)?.iscn
    || (item?.example_notation || []).find((notation) => /^\d/.test(String(notation || "").trim()))
    || "";
  return Boolean(iscn) && karyotypeActivityEnabled(item);
}

export function activityCatalog(disease, library, links, packs, maps, probes) {
  const item = canonicalCase(disease);
  const kt = teachingKaryotype(item);
  const { assemblies, fish } = linkedPayload(disease.id, links, packs);
  const fit = methodFit(disease);
  const karyotypeOn = karyotypeActivityEnabled(item) && fit.karyotype === "appropriate";
  const karyotypeOff = fit.karyotype !== "appropriate" || item?.default_karyotype_activity === false;
  const locusOnly = item?.chromosome_activity === "locus";
  const chromosomeFit = fit.chromosome === "appropriate" && !isNumericalFinding(item);
  const fishFit = fit.fish === "appropriate";
  const mappedAssemblies = chromosomeFit ? assemblies.filter((spec) => mapReady(maps, spec.chromosome)) : [];
  const playableAssemblies = mappedAssemblies.filter((spec) => assemblyReadiness(spec, maps).ready);
  const fishCheck = fishReadiness(fish, probes);
  const fishReady = fishFit && fishCheck.ready;
  const rows = [];

  const add = (id, label, status) => rows.push({ id, label, status });
  const karyotypeStatus = karyotypeOn ? "available" : (karyotypeOff ? "not_applicable" : "not_yet");
  const chromosomeStatus = (ready) => (ready ? "available" : (chromosomeFit ? "not_yet" : "not_applicable"));

  add("karyotype", "Compare and interpret", karyotypeStatus);
  add("chromosome_identification", "Identify affected chromosomes", karyotypeStatus);
  add("change", "Identify the change", karyotypeOn && item?.answers?.change && item?.answers?.place ? "available" : (karyotypeOff ? "not_applicable" : "not_yet"));
  add("anatomy", "Chromosome anatomy", chromosomeStatus(mappedAssemblies.some((spec) => spec.include_anatomy)));
  add("chromosome_assembly", "Chromosome assembly", locusOnly ? "not_applicable" : chromosomeStatus(playableAssemblies.length > 0));
  add("band_identification", "Band / locus", chromosomeStatus(mappedAssemblies.some((spec) => spec.nomenclature?.expected)));
  add("structural", "Structural abnormality", locusOnly ? "not_applicable" : chromosomeStatus(playableAssemblies.some((spec) => spec.transform && spec.transform.type && spec.transform.type !== "none")));
  add("abnormality", "Classify the abnormality", karyotypeOff ? "not_applicable" : (structuralClass(item) ? "available" : "not_yet"));
  add("fish", "FISH", !fishFit ? "not_applicable" : (fishCheck.ready ? "available" : "not_yet"));
  add("iscn_interpretation", "Interpret ISCN", karyotypeOff ? "not_applicable" : (kt?.iscn ? "available" : "not_yet"));
  add("iscn_construction", "Construct ISCN", karyotypeOff ? "not_applicable" : (kt?.iscn ? "available" : "not_yet"));
  add("disease_association", "Match the finding", karyotypeOff ? "not_applicable" : (disease?.disease_name ? "available" : "not_yet"));
  add("integrated", "Integrated case", (karyotypeOn || mappedAssemblies.length || fishReady) ? "available" : "not_yet");
  return rows;
}

export function availableActivities(disease, library, links, packs, maps, probes) {
  return activityCatalog(disease, library, links, packs, maps, probes).filter((row) => row.status === "available");
}

export const METHOD_FAMILIES = [
  {
    id: "karyotype",
    title: "Karyotyping Lab",
    activities: ["karyotype", "chromosome_identification", "change", "abnormality", "iscn_interpretation", "iscn_construction", "disease_association"],
  },
  {
    id: "chromosome",
    title: "Chromosome Analysis",
    activities: ["anatomy", "chromosome_assembly", "band_identification", "structural"],
  },
  {
    id: "fish",
    title: "FISH Lab",
    activities: ["fish"],
  },
  {
    id: "integrated",
    title: "Integrated case",
    activities: ["integrated"],
  },
];

export function familyActivities(disease, library, links, packs, maps, familyId, probes) {
  const family = METHOD_FAMILIES.find((item) => item.id === familyId);
  if (!family) return [];
  const available = availableActivities(disease, library, links, packs, maps, probes);
  return family.activities.map((id) => available.find((row) => row.id === id)).filter(Boolean);
}

/** Internal check only. The student chooser does not show these groups. */
export function karyotypeCaseGroups(diseases) {
  const whole = [];
  const rearranged = [];
  for (const disease of diseases || []) {
    if (isNumericalFinding(canonicalCase(disease))) whole.push(disease);
    else rearranged.push(disease);
  }
  return [
    {
      id: "whole",
      title: "Whole chromosome",
      lede: "An extra chromosome or a missing chromosome. The count changes.",
      diseases: whole,
    },
    {
      id: "rearrangement",
      title: "Rearrangement",
      lede: "Material is missing, reversed, or moved between chromosomes.",
      diseases: rearranged,
    },
  ].filter((group) => group.diseases.length);
}

export function diseasesForMethod(library, links, packs, maps, method, probes) {
  return laboratoryDiseases(library).filter((disease) => familyActivities(disease, library, links, packs, maps, method, probes).length);
}

/** Two laboratory periods. Guided cases are instructor examples, not independent selections. */
export const LAB_PERIODS = {
  karyotype: {
    number: 1,
    title: "Karyotyping and Chromosome Analysis",
    casework: "Karyotyping Casework",
    guidedDiseaseId: "down-syndrome",
  },
  fish: {
    number: 2,
    title: "FISH Analysis",
    casework: "FISH Casework",
    guidedDiseaseId: "down-syndrome",
  },
};

/** Cases a student may investigate alone. The guided example is omitted. */
export function independentCaseworkDiseases(library, links, packs, maps, method, probes) {
  const guided = LAB_PERIODS[method]?.guidedDiseaseId || "";
  return diseasesForMethod(library, links, packs, maps, method, probes).filter((disease) => {
    if (disease.id === guided) return false;
    const fit = methodFit(disease);
    const item = canonicalCase(disease);
    if (method === "karyotype") {
      if (fit.karyotype !== "appropriate") return false;
      if (item?.karyotype_visibility === "usually_not_visible") return false;
      if (item?.default_karyotype_activity === false) return false;
      return true;
    }
    if (fit.fish !== "appropriate") return false;
    const fish = linkedPayload(disease.id, links, packs).fish;
    if (!fishReadiness(fish, probes).ready) return false;
    return Boolean((fish.nuclei || []).length || fish.case_specific_cutoff);
  });
}

export function methodAudit(disease, library, links, packs, maps, probes) {
  const rows = activityCatalog(disease, library, links, packs, maps, probes);
  const pick = (ids) => {
    const group = rows.filter((row) => ids.includes(row.id));
    if (!group.length || group.every((row) => row.status === "not_applicable")) return "NOT APPLICABLE";
    if (group.some((row) => row.status === "available")) return "AVAILABLE";
    return "INCOMPLETE";
  };
  const { assemblies, fish } = linkedPayload(disease.id, links, packs);
  return {
    fit: methodFit(disease),
    karyotype: pick(["karyotype"]),
    chromosome: pick(["anatomy", "chromosome_assembly", "band_identification", "structural"]),
    fish: pick(["fish"]),
    fishMissing: fishReadiness(fish, probes).missing,
    assemblyMissing: assemblies.flatMap((spec) => assemblyReadiness(spec, maps).missing),
  };
}

export function diseaseMenuPath(diseaseId, { focus = "", mode = "assigned" } = {}) {
  let path = `#/disease/${diseaseId}`;
  if (focus) path += `/focus/${focus}`;
  if (mode === "explore") path += "/explore";
  return path;
}

function focusLine(item) {
  const chromosomes = item?.primary_chromosome || [];
  const where = chromosomes.length > 1
    ? `Chromosomes ${chromosomes.join(" & ")}`
    : (chromosomes[0] ? `Chromosome ${chromosomes[0]}` : "");
  const what = item?.case_title || item?.abnormality_type || "";
  return [where, what].filter(Boolean).join(" · ");
}

function fishAssayLabel(disease, fish, probeCatalog) {
  if (!fish?.assay_type) return "";
  const item = canonicalCase(disease);
  const probes = resolveProbes(probeCatalog, fish.probe_ids);
  if (fish.assay_type === "enumeration") {
    const chromosomes = [...new Set(probes.map((probe) => String(probe.chromosome)))];
    if (chromosomes.includes("X") && chromosomes.includes("Y")) return "X/Y enumeration";
    if (chromosomes.length === 1) return `Chromosome ${chromosomes[0]} enumeration`;
    return "Chromosome enumeration";
  }
  if (fish.assay_type === "deletion") {
    const target = probes.find((probe) => /red/i.test(probe.fluorophore || "")) || probes[0];
    if (/does not assign a single patient breakpoint/i.test(target?.description || "")) {
      const arm = item?.primary_locus || "";
      return arm ? `Distal ${arm} deletion analysis` : "Deletion analysis";
    }
    return target?.target_locus ? `${target.target_locus} deletion analysis` : "Deletion analysis";
  }
  if (fish.assay_type === "dual-fusion") {
    const fusion = `${item?.genes || ""} ${item?.mechanism || ""} ${item?.case_title || ""}`.match(/[A-Za-z0-9]+::[A-Za-z0-9]+/);
    return fusion ? `${fusion[0]} dual-fusion` : "Dual-fusion";
  }
  if (fish.assay_type === "break-apart") {
    const locus = probes[0]?.target_locus;
    return locus ? `${locus} break-apart` : "Break-apart";
  }
  return "";
}

export function caseSubtitle(disease, method, links, packs, probes) {
  const item = canonicalCase(disease);
  if (method === "fish") return fishAssayLabel(disease, linkedPayload(disease.id, links, packs).fish, probes);
  return focusLine(item);
}

export function caseTeaching(disease, method, links, packs) {
  const { assemblies } = linkedPayload(disease.id, links, packs);
  if (method === "fish") return "";
  if (method === "chromosome") {
    const item = canonicalCase(disease);
    if (assemblies.some((spec) => spec.transform?.type === "deletion")) return deletionTeaching(item);
    if (assemblies.some((spec) => spec.transform?.type === "inversion")) return "Inversion — the segment reverses. Find the breakpoints on the band map.";
    if (assemblies.some((spec) => spec.transform?.type === "translocation_derivative")) return "Derivative chromosome — material moved. Find the breakpoints on the band map.";
    if (assemblies.some((spec) => spec.nomenclature?.expected)) return "Locus identification";
    return "";
  }
  if (method === "karyotype") return "Compare the chromosomes, characterize the change, and interpret the result";
  return "";
}

function deletionTeaching(item) {
  const visibility = item?.karyotype_visibility;
  if (item?.default_karyotype_activity === false || visibility === "usually_not_visible") {
    return "Microdeletion — a routine karyotype can look normal. The band map and FISH show the missing region.";
  }
  if (visibility === "size_dependent") {
    return "Deletion size varies — a large one shortens one arm on the karyotype; a small one may need the band map or FISH.";
  }
  return "Visible deletion — one homolog is shorter. Compare the pair, then name the band.";
}

export const SKILL_PRACTICE = {
  chromosome: [
    { title: "Assemble each chromosome", summary: "Start with chromosome 1. Order its pieces from pter to qter, then continue to the next chromosome.", href: "#/lab/chromosome/chromosome_assembly/chromosome-sequence" },
    { title: "Chromosome 7 anatomy", summary: "Name pter, the arms, the centromere, and qter on a normal chromosome.", href: "#/lab/chromosome/anatomy/assembly-chr7-anatomy" },
    { title: "Chromosome 7 band assembly", summary: "Rebuild chromosome 7 from pter to qter using the stain pattern.", href: "#/lab/chromosome/chromosome_assembly/assembly-chr7-bands" },
    { title: "Chromosome 7 locus identification", summary: "Read the marked address 7q22.1: chromosome, arm, region, band, sub-band.", href: "#/lab/chromosome/band_identification/assembly-chr7-bands" },
    { title: "Paracentric inversion practice", summary: "After the normal chromosome, reverse one arm segment and name the change.", href: "#/lab/chromosome/structural_abnormalities/assembly-inv7" },
    { title: "Schematic deletion", summary: "Remove one long-arm band from chromosome 6 and compare it with the normal map.", href: "#/lab/chromosome/structural_abnormalities/assembly-del6q" },
  ],
  karyotype: [
    { title: "Normal male karyotype", summary: "Start here for this laboratory. Pair homologs into numbered boxes.", href: "#/lab/karyotype/karyotype_construction/normal-46xy" },
    { title: "Normal female karyotype", summary: "The same worksheet with two X chromosomes and no Y.", href: "#/lab/karyotype/karyotype_construction/normal-46xx" },
    { title: "Mosaic notation practice", summary: "Read two cell lines, a slash, and the cell counts in square brackets.", href: "#/lab/karyotype/iscn_interpretation/iscn-mosaic-plus8" },
  ],
  fish: [
    { title: "Chromosome 8 enumeration", summary: "Start here. Count two or three centromere signals and decide whether the nucleus is scorable.", href: "#/lab/fish/enumeration/fish-enum-cep8" },
    { title: "Educational break-apart", summary: "Score an educational flank pair at 7q22.1: together, or split. A split does not name a partner.", href: "#/lab/fish/break-apart/fish-breakapart-7q22" },
    { title: "Probe localization", summary: "Place a teaching probe at 7q22.1, the address from the chromosome 7 band lesson.", href: "#/lab/fish/probe-localization/fish-locus-7q22" },
    { title: "Signal quality", summary: "Reject a nucleus when its signals cannot be assigned to one cell.", href: "#/lab/fish/quality/fish-enum-cep8" },
  ],
};

function fishChain(fish) {
  if (!fish) return [];
  const steps = [];
  if (fish.include_strategy && fish.strategy_expected) steps.push("probe_strategy");
  if (fish.include_localization && fish.localization?.expected) steps.push("probe_locus");
  if (fish.include_probe_type && fish.probe_type_expected) steps.push("probe_type");
  if ((fish.nuclei || []).length) steps.push("fish_scope");
  if (fish.expected_interpretation) steps.push("fish_interpret");
  return steps;
}

/** Probe type restates strategy plus localization, so it is not a default disease step. The engine still grades it. */
function diseaseFishSteps(fish) {
  return placeSyntheticDemo(fishChain(fish)).filter((step) => step !== "probe_type");
}

function assemblyRounds(assemblies, { build, locus, compare, anatomy }) {
  const steps = [];
  const stepAssembly = {};
  const stepTitles = {};
  assemblies.forEach((spec, index) => {
    const suffix = index === 0 ? "" : `_${index + 1}`;
    const label = `chromosome ${spec.chromosome}`;
    if (anatomy && spec.include_anatomy) {
      const id = index === 0 ? "anatomy" : `anatomy_${index + 1}`;
      steps.push(id);
      stepAssembly[id] = spec;
      stepTitles[id] = `Anatomy of ${label}`;
    }
    if (build) {
      const id = `assemble${suffix}`;
      steps.push(id);
      stepAssembly[id] = spec;
      stepTitles[id] = `Assemble ${label}`;
    }
    if (locus && spec.nomenclature?.expected) {
      const id = `nomenclature${suffix}`;
      steps.push(id);
      stepAssembly[id] = spec;
      stepTitles[id] = `Locus on ${label}`;
    }
    if (compare && spec.transform && spec.transform.type && spec.transform.type !== "none") {
      const id = `comparison${suffix}`;
      steps.push(id);
      stepAssembly[id] = spec;
      stepTitles[id] = `Rearrangement of ${label}`;
    }
  });
  return { steps, stepAssembly, stepTitles };
}

function structuralKeys(diseaseId, links, packs) {
  const ids = links?.[diseaseId]?.assemblies || [];
  const chromosomes = [];
  const arms = [];
  const bands = [];
  const add = (list, value) => {
    const text = String(value || "");
    if (text && !list.includes(text)) list.push(text);
  };
  ids.forEach((id) => {
    const pack = packs?.[id] || {};
    (pack.chromosomes_involved || []).forEach((value) => add(chromosomes, value));
    (pack.arms_involved || []).forEach((value) => add(arms, value));
    (pack.bands_involved || []).forEach((value) => add(bands, value));
  });
  return { chromosomes_involved: chromosomes, arms_involved: arms, bands_involved: bands };
}

export function planActivity(activityId, disease, links, packs) {
  const { assemblies, fish } = linkedPayload(disease.id, links, packs);
  const grading = structuralKeys(disease.id, links, packs);
  const empty = { steps: ["unavailable"], stepAssembly: {}, stepTitles: { unavailable: "Unavailable" }, assembly: null, fish: null, grading };
  if (activityId === "karyotype") return {
    steps: ["karyotype", "abnormality", "iscn_interpretation", "audit"],
    stepAssembly: {},
    stepTitles: {
      karyotype: "Identify the abnormal chromosome",
      abnormality: "Characterize the abnormality",
      iscn_interpretation: "Interpret the result",
      audit: "Check a proposed result",
    },
    assembly: assemblies[0] || null,
    fish: null,
    grading,
    scoreFocus: "karyotype_construction",
  };
  if (activityId === "chromosome_identification") return { steps: ["find"], stepAssembly: {}, stepTitles: { find: "Identify the affected chromosomes" }, assembly: null, fish: null, grading, scoreFocus: "chromosome_identification", autoPlace: true };
  if (activityId === "change") return { steps: ["inspect"], stepAssembly: {}, stepTitles: { inspect: "Identify the change" }, assembly: null, fish: null, grading, autoPlace: true };
  if (activityId === "abnormality") return { steps: ["abnormality"], stepAssembly: {}, stepTitles: { abnormality: "Classify the abnormality" }, assembly: null, fish: null, grading, autoPlace: true };
  if (activityId === "iscn_interpretation") return { steps: ["iscn_interpretation"], stepAssembly: {}, stepTitles: { iscn_interpretation: "Interpret ISCN" }, assembly: null, fish: null, grading, autoPlace: true };
  if (activityId === "iscn_construction") return { steps: ["iscn_construction"], stepAssembly: {}, stepTitles: { iscn_construction: "Construct ISCN" }, assembly: null, fish: null, grading, autoPlace: true };
  if (activityId === "disease_association") return { steps: ["disease"], stepAssembly: {}, stepTitles: { disease: "Match the finding" }, assembly: null, fish: null, grading, autoPlace: true };
  if (activityId === "anatomy") {
    const round = assemblyRounds(assemblies, { anatomy: true });
    return round.steps.length ? { ...round, assembly: assemblies[0], fish: null, grading, autoPlace: true } : empty;
  }
  if ((activityId === "chromosome_assembly" || activityId === "structural") && canonicalCase(disease)?.chromosome_activity === "locus") return empty;
  if (activityId === "chromosome_assembly") {
    const round = assemblyRounds(assemblies, { build: true });
    return round.steps.length ? { ...round, assembly: assemblies[0], fish: null, grading } : empty;
  }
  if (activityId === "band_identification") {
    const round = assemblyRounds(assemblies, { locus: true });
    return round.steps.length ? { ...round, assembly: assemblies[0], fish: null, grading, autoPlace: true } : empty;
  }
  if (activityId === "structural") {
    const round = assemblyRounds(assemblies, { compare: true });
    return round.steps.length ? { ...round, assembly: assemblies[0], fish: null, grading, autoPlace: true } : empty;
  }
  if (activityId === "fish") {
    const steps = diseaseFishSteps(fish);
    if (fish?.assay_type === "break-apart") steps.push("audit");
    return steps.length ? { steps, stepAssembly: {}, stepTitles: { audit: "Check a proposed interpretation" }, assembly: null, fish, grading, autoPlace: false } : empty;
  }
  if (activityId === "complete" && canonicalCase(disease)?.default_karyotype_activity === false) {
    const item = canonicalCase(disease);
    const locusOnly = item?.chromosome_activity === "locus";
    const asm = assemblyRounds(assemblies, locusOnly
      ? { anatomy: true, locus: true }
      : { anatomy: true, build: true, locus: true, compare: true });
    const steps = [
      ...asm.steps,
      ...placeSyntheticDemo(fishChain(fish).filter((step) => ["probe_strategy", "probe_locus", "fish_scope", "fish_interpret"].includes(step))),
      "disease",
    ];
    return {
      steps,
      stepAssembly: asm.stepAssembly,
      stepTitles: { disease: "Associate the disease", ...asm.stepTitles },
      assembly: assemblies[0] || null,
      fish,
      grading,
      autoPlace: false,
    };
  }
  if (activityId === "complete") {
    const item = canonicalCase(disease);
    const numerical = isNumericalFinding(item);
    const steps = ["karyotype", "find", "inspect", "abnormality"];
    const stepTitles = {
      karyotype: "Build the karyotype",
      find: "Identify the abnormal chromosome",
      inspect: "Characterize the change",
      abnormality: "Characterize the abnormality",
    };
    let stepAssembly = {};
    if (!numerical && assemblies.length) {
      const round = assemblyRounds(assemblies.slice(0, 2), { compare: true });
      steps.push(...round.steps);
      Object.assign(stepTitles, round.stepTitles);
      stepAssembly = round.stepAssembly;
    }
    steps.push(...placeSyntheticDemo(fishChain(fish).filter((step) => ["probe_strategy", "probe_locus", "fish_scope", "fish_interpret"].includes(step))));
    steps.push("iscn_construction", "disease");
    stepTitles.find = "Identify the abnormal chromosome";
    stepTitles.inspect = "Characterize the change";
    stepTitles.abnormality = "Characterize the abnormality";
    stepTitles.iscn_construction = "Write the ISCN";
    stepTitles.disease = "Explain possible associations";
    return { steps, stepAssembly, stepTitles, assembly: assemblies[0] || null, fish, grading, autoPlace: false };
  }
  if (activityId === "integrated") {
    const item = canonicalCase(disease);
    const karyotypeOn = karyotypeActivityEnabled(item);
    const locusOnly = item?.chromosome_activity === "locus";
    const asm = assemblyRounds(assemblies, locusOnly
      ? { anatomy: true, locus: true }
      : { anatomy: true, build: true, locus: true, compare: true });
    const structural = asm.steps.some((step) => step.replace(/_\d+$/, "") === "comparison");
    const fishSteps = placeSyntheticDemo(fishChain(fish).filter((step) => !structural || (step !== "probe_locus" && step !== "probe_type")));
    const steps = [...(karyotypeOn ? ["karyotype", "find", "inspect"] : []), ...asm.steps];
    if (!structural && karyotypeOn) steps.push("abnormality");
    steps.push(...fishSteps);
    if (karyotypeOn) steps.push("iscn_construction");
    steps.push("disease", "narrative");
    return {
      steps,
      stepAssembly: asm.stepAssembly,
      stepTitles: {
        karyotype: "Identify the abnormal chromosome",
        find: "Identify the affected chromosomes",
        inspect: "Identify the change",
        abnormality: "Characterize the abnormality",
        iscn_construction: "Construct ISCN",
        disease: "Associate the disease",
        narrative: "Written interpretation",
        ...asm.stepTitles,
      },
      assembly: assemblies[0] || null,
      fish,
      grading,
      scoreFocus: "karyotype_construction",
    };
  }
  return empty;
}

export function interpretationItems(item, kt) {
  const iscn = kt?.iscn || "";
  const count = (iscn.match(/^(\d+)/) || [])[1] || "";
  const cls = structuralClass(item);
  const numerical = cls === "trisomy" || cls === "monosomy" ? cls : "none";
  const structural = cls === "deletion" ? "deletion" : cls === "translocation" ? "reciprocal translocation" : cls === "inversion" ? "inversion" : "none";
  const chrs = kt?.chromosomes_to_find || [];
  const place = item?.answers?.place || "";
  const split = splitBreakpointArms(item);
  const orderedArms = split && chrs.length > 1
    ? chrs.map((chr) => split.find((row) => row.chromosome === String(chr))?.arm).filter(Boolean)
    : [];
  let arm = "none";
  if (orderedArms.length === chrs.length && chrs.length > 1) arm = orderedArms.join(";");
  else if (place === "both" || place === "p;q") arm = "p;q";
  else if (place === "q;q" || place === "p;p") arm = place;
  else if (place === "p" || place === "q") arm = chrs.length > 1 ? `${place};${place}` : place;
  let band = "none";
  const tail = iscn.match(/\(([^()]*)\)\s*$/);
  if (structural !== "none" && tail && !/^[pq]$/.test(tail[1])) band = tail[1];
  return {
    chromosome_count: count,
    sex_chromosomes: kt?.sex || "",
    numerical,
    structural,
    chromosomes_involved: chrs.join(";"),
    arm,
    band,
  };
}

export function abnormalityRecord(item) {
  const cls = structuralClass(item);
  if (cls === "trisomy" || cls === "monosomy") return { category: "numerical", type: [cls] };
  if (cls === "deletion") return { category: "structural", type: ["deletion"] };
  if (cls === "translocation") return { category: "structural", type: ["translocation"] };
  if (!cls) return { category: "", type: [] };
  return { category: "structural", type: [cls] };
}

export function diseaseOptionList(library) {
  return labDiseases(library).map((disease) => disease.disease_name).filter(Boolean);
}

export function findingLabel(disease) {
  const item = canonicalCase(disease);
  const notation = teachingKaryotype(item)?.iscn || item?.example_notation?.[0] || "";
  const name = disease?.disease_name || "";
  const detail = String(item?.student_should_notice || item?.visual_change || "")
    .split(name).join("")
    .replace(/\s{2,}/g, " ")
    .trim();
  return [notation, detail].filter(Boolean).join(" — ");
}

export function findingChoices(disease, library) {
  const item = canonicalCase(disease);
  const chromosomes = new Set([].concat(item?.primary_chromosome || [], item?.partner_chromosome || []).map(String));
  const numerical = isNumericalFinding(item);
  const sexCase = chromosomes.has("X") || chromosomes.has("Y");
  const others = labDiseases(library).filter((row) => row.id !== disease?.id);
  const ranked = others.map((row) => {
    const other = canonicalCase(row);
    const involved = [].concat(other?.primary_chromosome || [], other?.partner_chromosome || []).map(String);
    let score = 0;
    if (structuralClass(other) && structuralClass(other) === structuralClass(item)) score += 3;
    if (involved.some((id) => chromosomes.has(id))) score += 2;
    if (numerical && isNumericalFinding(other)) score += 2;
    if (sexCase && involved.some((id) => id === "X" || id === "Y")) score += 4;
    if (other?.kind && other.kind === item?.kind) score += 1;
    return { row, score };
  }).sort((a, b) => b.score - a.score || a.row.id.localeCompare(b.row.id));
  const choices = [disease, ...ranked.slice(0, 4).map((entry) => entry.row)]
    .filter(Boolean)
    .map((row) => ({ id: row.id, label: findingLabel(row) }));
  return shuffle(choices, seedFrom(`${disease?.id || "case"}-finding`));
}

export function buildDiseaseCase(disease, library, plan, mode) {
  const item = canonicalCase(disease);
  const kt = item?.representative_teaching_karyotype || {};
  const abnormal = abnormalityRecord(item);
  const assigned = mode === "assigned";
  return {
    case_id: `atlas-${disease.id}-${item?.id || "case"}`,
    title: assigned ? "Assigned case" : (disease.disease_name || item?.case_title || "Disease case"),
    case_type: item?.kind || "constitutional",
    clinical_history: assigned
      ? (item?.assigned_context || `Assigned case. ${item?.kind === "acquired" ? "Acquired cytogenetics." : "Constitutional cytogenetics."} Identify the chromosome finding from the activity. The condition is named only at the interpretation step.`)
      : (item?.patient_case_label || ""),
    unknown_prompt: assigned ? "The diagnosis is withheld until the disease step." : "",
    origin_context: assigned ? (item?.assigned_origin_context || "") : "",
    chromosome_set: {
      sex: kt.sex,
      copy_number: kt.copy_number || {},
      variants: kt.variants || {},
    },
    chromosome_count: Number((kt.iscn || "").match(/^(\d+)/)?.[1]) || undefined,
    sex_chromosomes: kt.sex || "",
    expected_iscn: kt.iscn || "",
    accepted_iscn_variants: kt.iscn ? [kt.iscn] : [],
    iscn_prompt: kt.iscn || "",
    plain_language_interpretation: item?.final_interpretation || "",
    explanation: item?.final_interpretation || "",
    interpretation_items: interpretationItems(item, kt),
    abnormality_category: abnormal.category,
    abnormality_type: abnormal.type,
    chromosomes_involved: plan.grading?.chromosomes_involved?.length ? plan.grading.chromosomes_involved : (kt.chromosomes_to_find || []),
    arms_involved: plan.grading?.arms_involved || [],
    bands_involved: plan.grading?.bands_involved || [],
    diagnosis: disease.disease_name,
    diagnosis_options: diseaseOptionList(library),
    assembly: plan.assembly || null,
    fish: plan.fish || null,
    activitySteps: plan.steps,
    stepAssembly: plan.stepAssembly,
    stepTitles: plan.stepTitles,
    scoreFocus: plan.scoreFocus || "",
    strictAdvance: true,
    returnHref: `#/disease/${disease.id}${assigned ? "" : "/explore"}`,
    hints: [
      "Start by comparing the chromosomes in front of you. A full karyotype is available when you want to arrange the whole cell.",
      "Compare each chromosome with its partner: length, centromere position, and band pattern. A small difference in the drawing can be ordinary variation.",
      "The formal name of the condition comes after the cytogenetic finding, not before it.",
    ],
    placeholder_assets: true,
    educational_use_only: true,
    disease_id: disease.id,
    canonical_case_id: item?.id || "",
  };
}
