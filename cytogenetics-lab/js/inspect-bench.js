/**
 * Measurements for the shared chromosome inspection workstation.
 * A small difference is ordinary drawing variation. Nothing here names a diagnosis.
 */

import { chromosomeTraits } from "./chromosomes.js?v=20261026p5";

export function drawingDifference(left, right) {
  const first = chromosomeTraits(left);
  const second = chromosomeTraits(right);
  const lengthRatio = first.relativeLength > 0 && second.relativeLength > 0
    ? second.relativeLength / first.relativeLength
    : null;
  const cenDelta = first.cen != null && second.cen != null ? Math.abs(first.cen - second.cen) : null;
  const ordinary = lengthRatio != null && cenDelta != null
    && lengthRatio > 0.94 && lengthRatio < 1.06
    && cenDelta < 0.035;
  const notes = [];
  if (lengthRatio != null) {
    const percent = Math.round(lengthRatio * 100);
    notes.push(percent >= 97 && percent <= 103
      ? "Length is essentially the same in these two drawings."
      : `The second drawing is about ${percent}% as long as the first.`);
  } else notes.push("Relative length is not available for one of these drawings.");
  if (first.cen != null && second.cen != null) {
    notes.push(`Centromere, measured from the short-arm end: ${Math.round(first.cen * 100)}% and ${Math.round(second.cen * 100)}%.`);
  }
  notes.push(ordinary
    ? "A difference this small is ordinary variation in bend or condensation. It is not marked as an abnormality."
    : "These drawings differ by more than ordinary rendering variation. That difference is not named here.");
  const shorter = lengthRatio != null && (lengthRatio < 0.97 || lengthRatio > 1.03)
    ? (lengthRatio < 1 ? "right" : "left")
    : "";
  return { lengthRatio, cenDelta, ordinary, shorter, notes };
}
