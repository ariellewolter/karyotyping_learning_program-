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

export function caseMatchesExercise(entry, labId, exerciseId) {
  if (!entry || !exerciseId) return false;
  const mods = entry.modules || [];
  const types = entry.exercise_types || [];
  const fish = entry.fish_exercises || [];
  const assemblyMap = mods.includes("assembly") && !mods.includes("karyotype");
  if (labId === "chromosome" && exerciseId === "anatomy") {
    if (!assemblyMap) return false;
    return types.includes("anatomy")
      || mods.includes("abnormality")
      || /anatomy|del|inv|der|abnormal/i.test(`${entry.case_id} ${entry.title}`);
  }
  if (labId === "chromosome" && mods.includes("karyotype")) return false;
  if (types.includes(exerciseId)) {
    if (labId === "chromosome") return assemblyMap;
    return true;
  }
  const table = {
    anatomy: () => false,
    chromosome_identification: () => mods.includes("karyotype"),
    chromosome_assembly: () => mods.includes("assembly") && !mods.includes("karyotype"),
    banding: () => mods.includes("assembly") && !mods.includes("karyotype"),
    band_identification: () => (mods.includes("assembly") && !mods.includes("karyotype")) || fish.includes("probe-localization"),
    structural_abnormalities: () => mods.includes("assembly") && !mods.includes("karyotype") && (mods.includes("abnormality") || /del|inv|der|abnormal/i.test(entry.case_id)),
    karyotype_construction: () => mods.includes("karyotype"),
    abnormality_identification: () => mods.includes("abnormality"),
    iscn_interpretation: () => mods.includes("iscn_interpretation"),
    iscn_construction: () => mods.includes("iscn_construction"),
    disease_association: () => mods.includes("disease"),
    integrated: () => mods.includes("integrated"),
    "probe-localization": () => fish.includes("probe-localization"),
    "probe-type": () => fish.includes("probe-type"),
    interphase: () => fish.includes("interphase") || (mods.includes("fish") && !fish.includes("metaphase")),
    enumeration: () => fish.includes("enumeration"),
    "break-apart": () => fish.includes("break-apart"),
    "dual-fusion": () => fish.includes("dual-fusion"),
    deletion: () => fish.includes("deletion"),
    amplification: () => fish.includes("amplification"),
    metaphase: () => fish.includes("metaphase"),
    quality: () => fish.includes("quality"),
    integrated_fish: () => mods.includes("fish") && mods.includes("integrated"),
  };
  return table[exerciseId] ? table[exerciseId]() : false;
}

export function casesForExercise(catalog, labId, exerciseId, difficulty = "all") {
  return (catalog?.cases || []).filter((c) => {
    if (difficulty !== "all" && c.difficulty !== difficulty) return false;
    return caseMatchesExercise(c, labId, exerciseId);
  });
}

export function labPath(labId, exerciseId, caseId) {
  let p = `#/lab/${labId}`;
  if (exerciseId) p += `/${exerciseId}`;
  if (caseId) p += `/${caseId}`;
  return p;
}
