/**
 * Laboratory categories and exercise types.
 * Session engines still use module ids (assembly, karyotype, fish, …).
 */

export const LABS = [
  {
    id: "chromosome",
    title: "Chromosome Analysis",
    kicker: "Single-chromosome work",
    summary: "Build a chromosome from G-band segments. Anatomy, banding, and structural maps stay on a single chromosome.",
    tone: "teal",
    defaultExercise: "chromosome_assembly",
    exercises: [
      { id: "chromosome_assembly", title: "Chromosome assembly", sessionModule: "assembly", summary: "Reconstruct a chromosome from ordered G-band segments, pter to qter." },
      { id: "anatomy", title: "Chromosome anatomy", sessionModule: "assembly", summary: "Identify pter, p arm, centromere, q arm, and qter. On abnormal maps, also name the rearrangement type and where it sits." },
      { id: "banding", title: "Banding & nomenclature", sessionModule: "assembly", summary: "Read hierarchical band addresses such as 7q22.1." },
      { id: "band_identification", title: "Band/locus identification", sessionModule: "assembly", summary: "Name a highlighted region, band, or sub-band." },
      { id: "structural_abnormalities", title: "Structural abnormalities", sessionModule: "assembly", summary: "Compare normal and rearranged maps: deletion, inversion, derivative chromosomes." },
    ],
  },
  {
    id: "karyotype",
    title: "Karyotype & ISCN",
    kicker: "Whole-cell analysis",
    summary: "Construct and interpret karyotypes, apply ISCN nomenclature, and connect findings to genetic conditions.",
    tone: "green",
    defaultExercise: "karyotype_construction",
    exercises: [
      { id: "karyotype_construction", title: "Karyotype construction", sessionModule: "karyotype", summary: "Arrange chromosomes into Denver groups using morphology and banding." },
      { id: "chromosome_identification", title: "Chromosome identification", sessionModule: "karyotype", summary: "Use length, centromere position, and banding to recognize chromosomes in the worksheet." },
      { id: "abnormality_identification", title: "Abnormality identification", sessionModule: "abnormality", summary: "Classify normal, numerical, and structural findings." },
      { id: "iscn_interpretation", title: "ISCN interpretation", sessionModule: "iscn_interpretation", summary: "Parse a written ISCN string into count, sex complement, and abnormalities." },
      { id: "iscn_construction", title: "ISCN construction", sessionModule: "iscn_construction", summary: "Write the nomenclature that matches the karyotype finding." },
      { id: "disease_association", title: "Disease association", sessionModule: "disease", summary: "Connect a cytogenetic finding with the teaching diagnosis." },
      { id: "integrated", title: "Integrated cases", sessionModule: "integrated", summary: "Unknown cases that may include karyotype, FISH, ISCN, and clinical correlation." },
    ],
  },
  {
    id: "fish",
    title: "FISH Analysis",
    kicker: "Molecular cytogenetics",
    summary: "Analyze fluorescence signals, probe strategies, and molecular cytogenetic abnormalities.",
    tone: "violet",
    defaultExercise: "dual-fusion",
    exercises: [
      { id: "probe-localization", title: "Probe localization", sessionModule: "fish", summary: "Place a FISH probe on the chromosome-band map." },
      { id: "probe-type", title: "Probe-type identification", sessionModule: "fish", summary: "Identify what a probe targets and what question it can answer." },
      { id: "interphase", title: "Interphase FISH", sessionModule: "fish", summary: "Score nuclei in a demonstration fluorescence field." },
      { id: "enumeration", title: "Enumeration FISH", sessionModule: "fish", summary: "Count copy-number signals across scorable nuclei." },
      { id: "break-apart", title: "Break-apart FISH", sessionModule: "fish", summary: "Distinguish intact (fusion) from rearranged (split) loci." },
      { id: "dual-fusion", title: "Dual-fusion FISH", sessionModule: "fish", summary: "Relate red, green, and fusion signals to a reciprocal translocation." },
      { id: "deletion", title: "Deletion / locus-specific FISH", sessionModule: "fish", summary: "Compare target and control probes for locus loss." },
      { id: "amplification", title: "Amplification / copy-number FISH", sessionModule: "fish", summary: "Calculate target-to-reference ratios from case rules." },
      { id: "metaphase", title: "Metaphase FISH", sessionModule: "fish", summary: "Connect fluorescent signals to chromosome identity and band." },
      { id: "quality", title: "Signal quality / artifacts", sessionModule: "fish", summary: "Decide whether a nucleus is scorable before interpretation." },
      { id: "integrated_fish", title: "Integrated FISH cases", sessionModule: "integrated", summary: "Cases that combine karyotype or assembly with FISH and ISCN." },
    ],
  },
];

const LEGACY_MODULE = {
  karyotype: { lab: "karyotype", exercise: "karyotype_construction" },
  assembly: { lab: "chromosome", exercise: "chromosome_assembly" },
  fish: { lab: "fish", exercise: "interphase" },
  abnormality: { lab: "karyotype", exercise: "abnormality_identification" },
  iscn_interpretation: { lab: "karyotype", exercise: "iscn_interpretation" },
  iscn_construction: { lab: "karyotype", exercise: "iscn_construction" },
  disease: { lab: "karyotype", exercise: "disease_association" },
  integrated: { lab: "karyotype", exercise: "integrated" },
};

export function labById(id) {
  return LABS.find((l) => l.id === id) || LABS[0];
}

export function exerciseById(lab, exerciseId) {
  const list = lab?.exercises || [];
  return list.find((e) => e.id === exerciseId) || list.find((e) => e.id === lab?.defaultExercise) || list[0] || null;
}

export function mapLegacyModule(moduleId) {
  return LEGACY_MODULE[moduleId] || { lab: "karyotype", exercise: "karyotype_construction" };
}

export function sessionModuleFor(labId, exerciseId, caseEntry) {
  const ex = exerciseById(labById(labId), exerciseId);
  if (exerciseId === "integrated" || exerciseId === "integrated_fish") {
    if (caseEntry?.modules?.includes("integrated")) return "integrated";
  }
  return ex?.sessionModule || caseEntry?.modules?.[0] || "karyotype";
}

/**
 * Laboratory membership is a playable student activity, not a module tag,
 * an exercise name, or a shared biological field such as a band map or ISCN string.
 * `assembly.role: "dependency"` keeps map data available to another engine
 * without offering Chromosome Analysis.
 */

function declared(entry, exerciseId, moduleId) {
  const types = entry.exercise_types || [];
  const mods = entry.modules || [];
  return types.includes(exerciseId) || (moduleId ? mods.includes(moduleId) : false);
}

function assemblySpec(entry) {
  const spec = entry?.assembly;
  if (!spec?.chromosome || spec.role === "dependency") return null;
  return spec;
}

/** A single-chromosome exercise the assembly engine can run. A bare map stub is not one. */
function chromosomeExerciseSpec(entry) {
  const spec = assemblySpec(entry);
  if (!spec) return null;
  const structural = spec.transform?.type && spec.transform.type !== "none";
  if (spec.include_anatomy === true || spec.nomenclature?.expected || structural) return spec;
  return null;
}

function wholeCellKaryotype(entry) {
  if (entry?.chromosome_set?.sex) return true;
  return Array.isArray(entry?.chromosome_images) && entry.chromosome_images.length > 0;
}

/** ISCN or classification practice that is not a single-chromosome assembly exercise. */
function karyotypeNotation(entry) {
  if (wholeCellKaryotype(entry)) return true;
  if (chromosomeExerciseSpec(entry)) return false;
  return Boolean(entry?.expected_iscn || entry?.iscn_prompt);
}

function chromosomeExercisePlayable(entry, exerciseId) {
  const spec = chromosomeExerciseSpec(entry);
  if (!spec) return false;
  if (exerciseId === "anatomy") return spec.include_anatomy === true;
  if (exerciseId === "banding" || exerciseId === "band_identification") return Boolean(spec.nomenclature?.expected);
  if (exerciseId === "chromosome_assembly") return true;
  if (exerciseId === "structural_abnormalities") return Boolean(spec.transform?.type && spec.transform.type !== "none");
  return false;
}

function karyotypeExercisePlayable(entry, exerciseId) {
  if (exerciseId === "karyotype_construction" || exerciseId === "chromosome_identification") {
    return wholeCellKaryotype(entry) && declared(entry, exerciseId, "karyotype");
  }
  if (!karyotypeNotation(entry)) return false;
  if (exerciseId === "abnormality_identification") {
    return declared(entry, exerciseId, "abnormality") && Boolean(entry.abnormality_category);
  }
  if (exerciseId === "iscn_interpretation" || exerciseId === "iscn_construction") {
    return declared(entry, exerciseId, exerciseId) && Boolean(entry.expected_iscn || entry.iscn_prompt);
  }
  if (exerciseId === "disease_association") {
    return declared(entry, exerciseId, "disease") && Boolean(entry.diagnosis) && (entry.diagnosis_options || []).length > 0;
  }
  if (exerciseId === "integrated") {
    return wholeCellKaryotype(entry) && declared(entry, exerciseId, "integrated");
  }
  return false;
}

function fishNuclei(entry) {
  return entry?.fish?.nuclei || [];
}

function fishExercisePlayable(entry, exerciseId) {
  const fish = entry?.fish;
  if (!fish?.assay_type) return false;
  const nuclei = fishNuclei(entry);
  const hasNuclei = nuclei.length > 0;
  const interpreted = hasNuclei && Boolean(fish.expected_interpretation);
  if (exerciseId === "probe-localization") return Boolean(fish.include_localization && fish.localization?.expected);
  if (exerciseId === "probe-type") {
    const expected = fish.probe_type_expected;
    return Boolean(fish.include_probe_type && expected && (expected.type || expected.target));
  }
  if (exerciseId === "enumeration") return fish.assay_type === "enumeration" && interpreted;
  if (exerciseId === "break-apart") return fish.assay_type === "break-apart" && interpreted;
  if (exerciseId === "dual-fusion") return fish.assay_type === "dual-fusion" && interpreted;
  if (exerciseId === "deletion") return fish.assay_type === "deletion" && interpreted;
  if (exerciseId === "amplification") return fish.assay_type === "amplification" && interpreted;
  if (exerciseId === "interphase") return hasNuclei && fish.specimen_type === "interphase";
  if (exerciseId === "metaphase") return hasNuclei && fish.specimen_type === "metaphase";
  if (exerciseId === "quality") return nuclei.some((nucleus) => nucleus && nucleus.scorable === false);
  if (exerciseId === "integrated_fish") {
    return declared(entry, exerciseId, "integrated")
      && (hasNuclei || Boolean(fish.include_localization && fish.localization?.expected));
  }
  return false;
}

export function caseMatchesExercise(entry, labId, exerciseId) {
  if (!entry || !exerciseId) return false;
  if (labId === "chromosome") return chromosomeExercisePlayable(entry, exerciseId);
  if (labId === "karyotype") return karyotypeExercisePlayable(entry, exerciseId);
  if (labId === "fish") return fishExercisePlayable(entry, exerciseId);
  return false;
}

export function casesForExercise(catalog, labId, exerciseId) {
  return (catalog?.cases || []).filter((c) => caseMatchesExercise(c, labId, exerciseId));
}

export function labPath(labId, exerciseId, caseId) {
  let p = `#/lab/${labId}`;
  if (exerciseId) p += `/${exerciseId}`;
  if (caseId) p += `/${caseId}`;
  return p;
}
