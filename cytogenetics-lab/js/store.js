import { resetKaryotype } from "./karyotype.js";
import { initAssembly } from "./banding.js?v=20261006j";
import { fishFlow, initFish } from "./fish.js?v=20261006j";
import { seedFrom } from "./util.js";

const listeners = new Set();

export const state = {
  catalog: null,
  templates: null,
  maps: null,
  probes: null,
  loadError: null,
  instructor: false,
  route: { name: "home" },
  session: null,
};

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notify() {
  listeners.forEach((fn) => fn(state));
}

export function patch(partial) {
  Object.assign(state, partial);
  notify();
}

export function patchSession(partial) {
  state.session = { ...state.session, ...partial };
  notify();
}

export function emptySkillScores() {
  return {
    chromosome_identification: null,
    karyotype_construction: null,
    abnormality_recognition: null,
    iscn_interpretation: null,
    iscn_construction: null,
    disease_association: null,
    chromosome_assembly: null,
    banding_nomenclature: null,
    fish_localization: null,
    fish_probe_type: null,
    fish_signals: null,
    fish_counts: null,
    fish_quality: null,
    fish_strategy: null,
    fish_interpretation: null,
  };
}

export function bandingFlow(caseData, exerciseId) {
  const a = caseData.assembly;
  if (!a) return [];
  if (exerciseId === "anatomy") return ["anatomy"];
  if (exerciseId === "banding" || exerciseId === "band_identification") {
    return a.nomenclature?.expected ? ["nomenclature"] : ["unavailable"];
  }
  if (exerciseId === "structural_abnormalities") {
    const steps = ["assemble"];
    if (a.transform && a.transform.type && a.transform.type !== "none") steps.push("comparison");
    return steps;
  }
  if (exerciseId === "chromosome_assembly") return ["assemble"];
  const steps = [];
  if (a.include_anatomy) steps.push("anatomy");
  steps.push("assemble");
  if (a.nomenclature) steps.push("nomenclature");
  if (a.transform && a.transform.type && a.transform.type !== "none") steps.push("comparison");
  return steps;
}

export function newSession({ caseData, chromosomes, module, integrated, maps, probes, exercise, atlas = null }) {
  let steps;
  if (module === "fish") {
    steps = fishFlow(caseData, exercise);
    const scopedSkill = exercise && exercise !== "integrated" && exercise !== "integrated_fish";
    if (!scopedSkill) {
      if (caseData.abnormality_category && caseData.abnormality_category !== "normal") steps.push("abnormality");
      if (caseData.expected_iscn) steps.push("iscn_construction");
      if (caseData.diagnosis && caseData.diagnosis_options) steps.push("disease");
    }
    if (!steps.length) steps.push("fish_scope");
    steps.push("summary");
  } else if (integrated) {
    steps = [...bandingFlow(caseData, exercise), ...integratedSteps(caseData)];
    const fishSteps = fishFlow(caseData);
    if (fishSteps.length) {
      const summaryAt = steps.indexOf("narrative");
      const insertAt = summaryAt >= 0 ? summaryAt : steps.length - 1;
      steps.splice(insertAt, 0, ...fishSteps);
    }
  } else if (module === "assembly") {
    steps = bandingFlow(caseData, exercise);
    const singleChromosome = ["chromosome_assembly", "anatomy", "banding", "band_identification", "structural_abnormalities"].includes(exercise);
    if (!singleChromosome) {
      if (caseData.abnormality_category && caseData.abnormality_category !== "normal") steps.push("abnormality");
      if (caseData.expected_iscn && caseData.abnormality_category !== "normal") steps.push("iscn_construction");
      if (caseData.diagnosis && caseData.diagnosis_options) steps.push("disease");
    }
    if (!steps.length) steps.push("assemble");
    steps.push("summary");
  } else if (caseData.activitySteps?.length) {
    steps = [...caseData.activitySteps];
    if (steps[steps.length - 1] !== "summary") steps.push("summary");
  } else {
    steps = [module, "summary"];
  }
  return {
    caseData,
    chromosomes,
    module,
    integrated: Boolean(integrated),
    steps,
    stepIndex: 0,
    karyotype: resetKaryotype(chromosomes || []),
    assembly: initAssembly(maps, caseData.assembly, seedFrom((caseData.case_id || "asm") + "-asm")),
    fish: initFish(caseData, probes, maps),
    hintIndex: 0,
    hintsUsed: 0,
    attempts: {
      karyotype: 0,
      abnormality: 0,
      iscn_construction: 0,
      iscn_interpretation: 0,
      disease: 0,
      assembly: 0,
      nomenclature: 0,
      comparison: 0,
      anatomy: 0,
      fish_scope: 0,
      fish_locus: 0,
      fish_type: 0,
      fish_strategy: 0,
      fish_interpret: 0,
    },
    answers: {
      category: "",
      types: [],
      iscn: "",
      interpretation: {
        chromosome_count: "",
        sex_chromosomes: "",
        numerical: "",
        structural: "",
        chromosomes_involved: "",
        arm: "",
        band: "",
      },
      diagnosis: "",
      narrative: "",
      anatomy: {},
    },
    instructionMode: null,
    stepAssembly: caseData.stepAssembly || {},
    stepTitles: caseData.stepTitles || {},
    scoreFocus: caseData.scoreFocus || "",
    strictAdvance: Boolean(caseData.strictAdvance),
    atlas,
    pedagogy: { hintLevel: {}, first: {} },
    feedback: {},
    scores: emptySkillScores(),
    startedAt: Date.now(),
    submitted: false,
  };
}

function integratedSteps(caseData) {
  const steps = [];
  if (caseData.chromosome_set || caseData.chromosome_images) {
    steps.push("metaphase", "karyotype");
  }
  if (caseData.abnormality_category) steps.push("abnormality");
  if (caseData.expected_iscn) steps.push("iscn_construction");
  if (caseData.diagnosis && caseData.diagnosis_options) steps.push("disease");
  steps.push("narrative", "summary");
  return steps;
}
