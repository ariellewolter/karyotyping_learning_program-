/**
 * Prefill for the guided karyotype walkthrough: assembled karyogram placements,
 * remade affected chromosomes, and ideogram identification marks.
 */
import { piecesForExercise } from "./banding.js?v=20261024c";
import { genomeIssues, markLocation } from "./case-ideogram.js?v=20261025gen2";

const KNOWN = /^(?:[1-9]|1\d|2[0-2]|X|Y)$/;
const COPIES = ["A", "B", "C", "D"];

/** Place every generated cut on its truth number with copy letters A, B, C… */
export function assembleSortedFromCuts(images = []) {
  const used = Object.create(null);
  const pieces = [];
  images.forEach((image, imageIndex) => {
    if (!image?.generated) return;
    (image.cuts || []).forEach((box) => {
      if (!box || ![box.x, box.y, box.width, box.height].every(Number.isFinite) || box.width <= 0 || box.height <= 0) return;
      const truth = String(box.truth || "");
      if (!KNOWN.test(truth)) return;
      const next = used[truth] || 0;
      if (next >= COPIES.length) return;
      used[truth] = next + 1;
      pieces.push({
        imageIndex,
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        truth,
        chromosome: truth,
        homolog: COPIES[next],
      });
    });
  });
  return pieces;
}

/** Chromosomes the guided example should remake (from ISCN issues or the disease record). */
export function guidedAffectedChromosomes(iscn, disease) {
  const fromFormula = genomeIssues(iscn, null).chromosomes || [];
  const fromDisease = [
    ...(disease?.correct_chromosome || []),
    ...(disease?.primary_chromosome || []),
    ...(canonicalChromosomes(disease) || []),
  ].map(String).filter((id) => KNOWN.test(id));
  return [...new Set([...fromFormula, ...fromDisease])];
}

function canonicalChromosomes(disease) {
  const item = disease?.representative_teaching_karyotype || disease;
  return item?.chromosomes || disease?.chromosomes || [];
}

/** Intact remake of each affected chromosome (extra free 21 is a complete 21). */
export function guidedAffectedRemakes(maps, chromosomes) {
  if (!maps) return [];
  return chromosomes.map((chromosome) => {
    const pieces = piecesForExercise(maps, {
      chromosome: String(chromosome),
      resolution: "region",
      transform: { type: "none" },
      reference_normal: true,
    }).map((piece) => ({
      id: piece.id,
      label: piece.label,
      chromosome: piece.chromosome,
      arm: piece.arm,
      role: piece.role,
      stain: piece.stain,
      weight: piece.weight,
      orientation: piece.orientation || "forward",
    }));
    return {
      chromosome: String(chromosome),
      stack: pieces.map((piece) => piece.id),
      lost: [],
      lostCount: 0,
      pieces,
      savedAt: new Date().toISOString(),
      guided: true,
    };
  }).filter((entry) => entry.pieces.length);
}

/** Ideogram marks that identify what the teaching ISCN names. */
export function guidedStudentMarks(iscn) {
  const { issues } = genomeIssues(iscn, null);
  return issues.map((issue, index) => {
    const whole = /whole chromosome/i.test(issue.location) || /whole chromosome/i.test(issue.effect);
    const mark = {
      id: `guided-mark-${issue.chromosome}-${index}`,
      chromosome: String(issue.chromosome),
      effect: issue.effect,
      note: issue.details?.join(" ") || issue.detail || String(iscn || ""),
      ...(whole ? { whole: true } : {}),
    };
    if (!whole && issue.location && !/whole/i.test(issue.location)) {
      const band = String(issue.location).replace(new RegExp(`^${issue.chromosome}`, "i"), "");
      if (/^[pq]\d/i.test(band)) mark.from = band.toLowerCase().replace(/^([pq])/, (_, arm) => arm);
    }
    mark.location = markLocation(mark);
    return mark;
  });
}

/**
 * Full visual packet for a guided karyotype case.
 * Pass existing fields to keep student edits; empty arrays are replaced.
 */
export function guidedKaryotypePacket({ images = [], iscn = "", maps = null, disease = null, existing = {} } = {}) {
  const sorted = Array.isArray(existing.sortedChromosomes) && existing.sortedChromosomes.some((piece) => piece?.chromosome && piece?.homolog)
    ? existing.sortedChromosomes
    : assembleSortedFromCuts(images);
  const remakes = Array.isArray(existing.affectedRemakes) && existing.affectedRemakes.length
    ? existing.affectedRemakes
    : guidedAffectedRemakes(maps, guidedAffectedChromosomes(iscn, disease));
  const marks = Array.isArray(existing.studentMarks) && existing.studentMarks.length
    ? existing.studentMarks
    : guidedStudentMarks(iscn);
  return {
    sortedChromosomes: sorted,
    affectedRemakes: remakes,
    studentMarks: marks,
  };
}

/** True when a guided karyotype case is missing the report visuals. */
export function guidedVisualsIncomplete(current) {
  if (!current || current.lab === "fish") return false;
  const placed = (current.sortedChromosomes || []).some((piece) => piece?.chromosome && piece?.homolog);
  const remade = Boolean(current.affectedRemakes?.length);
  const marked = Boolean(current.studentMarks?.length);
  return !placed || !remade || !marked;
}
