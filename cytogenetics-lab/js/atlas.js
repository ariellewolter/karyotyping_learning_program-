/** Disease definitions shared by the Atlas and the disease-driven lab. */

import { seedFrom, shuffle } from "./util.js";

export function diseaseList(library) {
  return library?.diseases || [];
}

export function diseaseById(library, id) {
  return diseaseList(library).find((d) => d.id === id) || null;
}

export function cytogeneticCases(disease) {
  return disease?.cytogenetic_cases || [];
}

export function canonicalCase(disease) {
  return cytogeneticCases(disease).find((c) => c.role === "canonical") || cytogeneticCases(disease)[0] || null;
}

export function asCase(record) {
  if (!record) return null;
  if (record.cytogenetic_cases) return canonicalCase(record);
  return record;
}

export function activeCase(atlas) {
  return atlas?.cytogeneticCase || canonicalCase(atlas?.disease);
}

function chromosomeIds(value) {
  return [].concat(value || []).map(String).filter((id) => /^(?:[1-9]|1\d|2[0-2]|X|Y)$/.test(id));
}

export function affectedChromosomes(disease) {
  const ids = new Set();
  for (const item of cytogeneticCases(disease)) {
    for (const id of chromosomeIds(item.primary_chromosome)) ids.add(id);
    for (const id of chromosomeIds(item.partner_chromosome)) ids.add(id);
  }
  return [...ids];
}

export function teachingKaryotype(record) {
  return asCase(record)?.representative_teaching_karyotype || null;
}

export function karyotypeActivityEnabled(record) {
  const item = asCase(record);
  if (!item || item.default_karyotype_activity === false) return false;
  const kt = item.representative_teaching_karyotype;
  const playable = Boolean(kt?.iscn) && Boolean(kt?.sex) && (kt.chromosomes_to_find || []).length > 0;
  if (item.default_karyotype_activity === true) return playable;
  const visible = item.karyotype_visibility === "clearly_visible" || item.karyotype_visibility === "size_dependent";
  return visible && playable;
}

export function labReady(disease) {
  const item = canonicalCase(disease);
  if (item?.role !== "canonical" || item?.lab_level !== "default") return false;
  if (karyotypeActivityEnabled(item)) return true;
  return item.default_karyotype_activity === false && Boolean(item.correct_classification);
}

export function labDiseases(library) {
  return diseaseList(library).filter(labReady);
}

export function diseasesForChromosome(library, chromosome) {
  const id = String(chromosome);
  return diseaseList(library).filter((d) => affectedChromosomes(d).includes(id));
}

export function regionText(record) {
  const item = asCase(record);
  return [item?.primary_locus, item?.specific_region].filter(Boolean).join(" — ") || "whole chromosome";
}

export function inspectExpectation(record) {
  const answers = asCase(record)?.answers || {};
  return { change: answers.change || "", place: answers.place || "" };
}

/** Two breakpoints on different arms, in breakpoint order. Same-arm exchanges stay on the single place control. */
export function splitBreakpointArms(record) {
  const points = asCase(record)?.generation?.breakpoints || [];
  const rows = [];
  points.forEach((point) => {
    const chromosome = String(point?.chromosome || "");
    const arm = point?.arm;
    if (!chromosome || (arm !== "p" && arm !== "q")) return;
    if (!rows.some((row) => row.chromosome === chromosome)) rows.push({ chromosome, arm });
  });
  if (rows.length < 2) return null;
  if (new Set(rows.map((row) => row.arm)).size < 2) return null;
  return rows;
}

export function optionLabel(library, group, id) {
  const row = (library?.[group] || []).find((item) => item.id === id);
  return row?.label || id || "";
}

export function diseaseCase(disease) {
  const item = canonicalCase(disease);
  const kt = item?.representative_teaching_karyotype;
  if (!kt?.iscn || !kt?.sex) {
    throw new Error(`${disease.disease_name} has no canonical teaching karyotype to build.`);
  }
  const altered = Object.values(kt.variants || {}).filter((variant) => variant && variant !== "normal");
  if (item.generation?.structural_alteration === "none" && altered.length) {
    throw new Error(`${disease.disease_name} is a whole-chromosome case. The canonical record must not change chromosome shape.`);
  }
  return {
    case_id: `atlas-${disease.id}-${item.id}`,
    title: item.case_title || disease.disease_name,
    case_type: item.kind || "constitutional",
    clinical_history: item.patient_case_label || "",
    chromosome_set: {
      sex: kt.sex,
      copy_number: kt.copy_number || {},
      variants: kt.variants || {},
    },
    expected_iscn: kt.iscn,
    diagnosis: disease.disease_name,
    explanation: item.final_interpretation || "",
    plain_language_interpretation: item.visual_change || "",
    placeholder_assets: true,
    educational_use_only: true,
    hints: [
      "Finish a group before judging a single pair. Homologs in the correct pair should be similar in length and centromere position.",
      "A structural change often makes one partner shorter or differently banded while the count stays 46.",
      "An extra or missing whole chromosome changes how many copies sit in that slot.",
    ],
  };
}

export function sameSet(got, expected) {
  const a = [...(got || [])].map(String).sort();
  const b = [...(expected || [])].map(String).sort();
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

export function gradeFind(atlas) {
  const targets = teachingKaryotype(activeCase(atlas))?.chromosomes_to_find || [];
  const found = atlas.found || [];
  if (!found.length) {
    return { ok: false, title: "Select a chromosome pair", body: "Click the pair that looks abnormal. The pair number is not announced if the choice is wrong." };
  }
  if (sameSet(found, targets)) {
    const names = targets.join(" and ");
    return {
      ok: true,
      title: targets.length > 1 ? "Those pairs are the ones to inspect." : `Pair ${names} is the one to inspect.`,
      body: "Open that chromosome next. The formal notation is still withheld.",
    };
  }
  const extra = found.filter((id) => !targets.includes(id));
  if (extra.length) {
    return { ok: false, title: "Look again", body: "At least one selected pair matches its expected partner. Compare length, centromere position, and band pattern within each pair." };
  }
  return { ok: false, title: "Not the whole finding", body: "A rearranged or aneuploid pair is still not selected. Keep comparing partners." };
}

export function gradeInspect(atlas, chromosomes = []) {
  const item = activeCase(atlas);
  const expected = inspectExpectation(item);
  const split = splitBreakpointArms(item);
  const changeOk = atlas.change === expected.change;
  const placeOk = split
    ? split.every((row) => atlas.arms?.[row.chromosome] === row.arm)
    : atlas.place === expected.place;
  const received = (chromosomes || []).flatMap((chr) => (
    (chr.targetChromosomeSegments || [])
      .filter((segment) => segment.disposition === "received")
      .map((segment) => ({ id: chr.id, from: segment.chromosome }))
  ));
  const segmentsOk = received.every((segment) => atlas.segmentSource?.[segment.id] === segment.from);
  if (changeOk && placeOk && !segmentsOk) {
    return { ok: false, title: "Name the source of the exchanged piece", body: "Each derivative chromosome is carrying material from its partner. Select where that piece came from." };
  }
  if (changeOk && placeOk && segmentsOk) {
    const arms = split ? split.map((row) => `chromosome ${row.chromosome} on the ${row.arm} arm`).join(", and ") : "";
    return {
      ok: true,
      title: "That matches the chromosome morphology.",
      body: split
        ? `The breakpoints are ${arms}. Name the abnormality class next.`
        : "Name the abnormality class next. The disease write-up stays hidden until the interpretation.",
    };
  }
  const armsChosen = split ? split.every((row) => atlas.arms?.[row.chromosome]) : Boolean(atlas.place);
  if (!atlas.change || !armsChosen) {
    return { ok: false, title: "Choose both parts", body: split
      ? "Say what changed, and name the breakpoint arm on each chromosome."
      : "Say what changed and whether it involves an arm or the whole chromosome." };
  }
  return { ok: false, title: "Not quite", body: "Compare the reference drawing with every homolog from the karyotype. Decide whether material is missing, duplicated, moved, or whether a whole chromosome is extra or absent." };
}

export function gradeIdentify(atlas, library) {
  if (!atlas.identify) {
    return { ok: false, title: "Choose a class", body: "The class should match what you saw: a whole chromosome extra or missing, or a structural change." };
  }
  const item = activeCase(atlas);
  if (atlas.identify === item?.correct_classification) {
    return { ok: true, title: "Class recorded.", body: item.final_interpretation || `${optionLabel(library, "identifies", atlas.identify)} matches this karyotype.` };
  }
  return { ok: false, title: "Class does not match the morphology", body: "Use the inspection you just made. A missing segment is not a trisomy, and an extra whole chromosome is not a translocation." };
}

export function notationChoices(library, disease) {
  const correct = teachingKaryotype(disease)?.iscn;
  const others = labDiseases(library)
    .filter((d) => d.id !== disease.id)
    .map((d) => teachingKaryotype(d)?.iscn)
    .filter((iscn) => iscn && iscn !== correct);
  const picked = shuffle([...new Set(others)], seedFrom(`${disease.id}-notation`)).slice(0, 3);
  return shuffle([correct, ...picked], seedFrom(`${disease.id}-notation-order`));
}

export function gradeInterpret(atlas) {
  if (!atlas.notation) {
    return { ok: false, title: "Choose a notation", body: "Pick the string that describes the count, sex complement, and the change you already identified." };
  }
  const item = activeCase(atlas);
  if (atlas.notation === teachingKaryotype(item)?.iscn) {
    return {
      ok: true,
      title: "Notation matches this patient's case.",
      body: `${item.final_interpretation || ""} ${item.mechanism || ""}`.trim(),
    };
  }
  return { ok: false, title: "That string describes a different finding", body: "Match the chromosome count, the sex complement, and the abnormality you named." };
}
