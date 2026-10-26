/**
 * Karyogram-to-ISCN construction. Bands picked on drawn chromosomes become
 * written ISCN tokens; the formula count is taken from the same karyogram
 * engine that draws it, and abnormalities are kept in ISCN writing order.
 */

import { describeKaryogram } from "./chromosomes.js?v=20261026p5";
import { exploreISCN } from "./iscn.js";
import { bandInterval } from "./band-links.js";
import { orderTokens } from "./karyotype-analysis.js";

export const OPERATIONS = [
  { id: "gain", label: "Extra chromosome (+)", picks: 1, hint: "Click any band of the chromosome that is gained." },
  { id: "loss", label: "Missing chromosome (−)", picks: 1, hint: "Click any band of the chromosome that is lost." },
  { id: "delT", label: "Terminal deletion", picks: 1, hint: "Click the breakpoint band. Material distal to it is lost." },
  { id: "delI", label: "Interstitial deletion", picks: 2, hint: "Click the two breakpoint bands on one chromosome." },
  { id: "dup", label: "Duplication", picks: 2, hint: "Click the two ends of the duplicated segment on one chromosome." },
  { id: "inv", label: "Inversion", picks: 2, hint: "Click the two breakpoint bands on one chromosome." },
  { id: "iso", label: "Isochromosome", picks: 1, hint: "Click any band on the arm that is duplicated." },
  { id: "ring", label: "Ring chromosome", picks: 2, hint: "Click one band on the short arm and one on the long arm." },
  { id: "t", label: "Balanced translocation", picks: 2, hint: "Click the breakpoint band on each of the two chromosomes." },
  { id: "der", label: "Unbalanced derivative", picks: 2, hint: "Click the breakpoint on the chromosome that keeps its centromere, then on the partner." },
  { id: "ins", label: "Insertion", picks: 3, hint: "Click the insertion site, then the two ends of the inserted segment in the order they are inserted." },
  { id: "dic", label: "Dicentric", picks: 2, hint: "Click the breakpoint band on each of the two chromosomes." },
  { id: "add", label: "Additional material (add)", picks: 1, hint: "Click the band where material of unknown origin is attached." },
  { id: "mar", label: "Marker chromosome (+mar)", picks: 0, hint: "Adds a marker of unknown origin." },
];

const RANK = (id) => (id === "X" ? -2 : id === "Y" ? -1 : Number(id));

/** Split a drawn band label into chromosome and band, e.g. "9q34.1" -> { chromosome: "9", band: "q34.1" }. */
export function splitBand(label) {
  const match = String(label || "").match(/^(\d{1,2}|X|Y)([pq][\d.]*)$/i);
  if (!match) return null;
  return { chromosome: match[1].toUpperCase(), band: match[2].toLowerCase(), label: `${match[1].toUpperCase()}${match[2].toLowerCase()}` };
}

function position(maps, pick) {
  return bandInterval(maps, pick.label)?.start ?? 0;
}

function pterFirst(maps, a, b) {
  return position(maps, a) <= position(maps, b) ? [a, b] : [b, a];
}

/** Build one ISCN token from an operation and its picked bands. Returns { token } or { error }. */
export function tokenFor(maps, op, picks) {
  const spec = OPERATIONS.find((item) => item.id === op);
  if (!spec) return { error: "Choose an operation." };
  if (picks.length < spec.picks) return { error: spec.hint };
  const parsed = picks.map((pick) => splitBand(pick.label || pick));
  if (parsed.some((pick) => !pick)) return { error: "Pick a named band." };
  const [a, b, c] = parsed;
  const same = (x, y) => x.chromosome === y.chromosome;
  switch (op) {
    case "gain": return { token: `+${a.chromosome}` };
    case "loss": return { token: `-${a.chromosome}` };
    case "delT": return { token: `del(${a.chromosome})(${a.band})` };
    case "add": return { token: `add(${a.chromosome})(${a.band})` };
    case "mar": return { token: "+mar" };
    case "iso": return { token: `i(${a.chromosome})(${a.band.startsWith("p") ? "p10" : "q10"})` };
    case "delI":
    case "dup":
    case "inv":
    case "ring": {
      if (!same(a, b)) return { error: "Both bands must be on the same chromosome." };
      if (a.band === b.band) return { error: "Pick two different bands." };
      if (op === "ring" && a.band[0] === b.band[0]) return { error: "A ring joins a short-arm break to a long-arm break. Pick one band on each arm." };
      const [first, second] = pterFirst(maps, a, b);
      const symbol = { delI: "del", dup: "dup", inv: "inv", ring: "r" }[op];
      return { token: `${symbol}(${a.chromosome})(${first.band}${second.band})` };
    }
    case "t":
    case "dic": {
      if (same(a, b)) return { error: "Pick bands on two different chromosomes." };
      const [low, high] = RANK(a.chromosome) <= RANK(b.chromosome) ? [a, b] : [b, a];
      return { token: `${op}(${low.chromosome};${high.chromosome})(${low.band};${high.band})` };
    }
    case "der": {
      if (same(a, b)) return { error: "Pick bands on two different chromosomes." };
      const [low, high] = RANK(a.chromosome) <= RANK(b.chromosome) ? [a, b] : [b, a];
      return { token: `der(${a.chromosome})t(${low.chromosome};${high.chromosome})(${low.band};${high.band})` };
    }
    case "ins": {
      if (!same(b, c)) return { error: "The two ends of the inserted segment must be on one chromosome." };
      if (b.band === c.band) return { error: "Pick two different bands for the inserted segment." };
      if (same(a, b)) return { token: `ins(${a.chromosome})(${a.band}${b.band}${c.band})` };
      return { token: `ins(${a.chromosome};${b.chromosome})(${a.band};${b.band}${c.band})` };
    }
    default: return { error: "This operation is not available." };
  }
}

/** Chromosome count implied by a sex complement and tokens, from the karyogram engine. */
export function impliedCount(sex, tokens) {
  const draft = ["46", sex, ...tokens].join(",");
  const line = exploreISCN(draft).lines?.[0];
  if (!line) return null;
  const numerical = tokens.filter((token) => /^[+-](\d{1,2}|X|Y)$/i.test(token)).reduce((sum, token) => sum + (token.startsWith("+") ? 1 : -1), 0);
  const expected = 44 + (String(sex).match(/[XY]/gi) || []).length + numerical;
  return describeKaryogram(line.sex, line.items, expected)?.drawnCount ?? null;
}

/** Full formula for a built karyotype: count from the drawing, abnormalities in ISCN order. */
export function composeFormula(sex, tokens) {
  const ordered = orderTokens(tokens);
  const count = impliedCount(sex, ordered) ?? 46;
  return [String(count), sex, ...ordered].join(",");
}
