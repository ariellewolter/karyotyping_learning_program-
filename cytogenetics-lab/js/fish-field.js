/**
 * Multi-nucleus FISH field. Every scorable nucleus is a rotated or mirrored copy of a
 * nucleus authored for this case and probe set, so no signal pattern is invented.
 * Excluded nuclei are built from the same copies: overlapping pairs, an equivocal
 * signal separation for the assay, and a damaged nucleus with a signal outside it.
 * Synthetic demonstration only.
 */

export const FIELD_QUALITY = [
  ["score", "Scorable"],
  ["overlap", "Exclude: overlapping nuclei"],
  ["equivocal", "Exclude: weak, diffuse, or equivocal signals"],
  ["damaged", "Exclude: damaged or truncated nucleus"],
];

/** Teaching rules for this exercise. Laboratories validate their own scoring criteria. */
export const FIELD_RULES = {
  common: "Score only intact nuclei that do not overlap a neighbor and whose signals are clear. A signal diameter is the width of one single-color spot.",
  "break-apart": "Red and green within one signal diameter are a fusion (intact locus). Two or more diameters apart are a split. Between one and two diameters is equivocal: exclude the nucleus.",
  "dual-fusion": "A fusion is a red and a green signal touching or overlapping. Separate signals lie two or more diameters apart. Between one and two diameters is equivocal: exclude the nucleus.",
  deletion: "Compare the target with the control in each nucleus. Two spots within one signal diameter are one split signal; count once. Diffuse or weak signals: exclude.",
  enumeration: "Two spots within one signal diameter are one split signal; count once. Diffuse or weak signals: exclude.",
  amplification: "Clustered target signals are counted by the case rule. Diffuse or weak signals: exclude.",
};

const SIGNAL_DIAMETER = 9.2;

function seededRandom(seed) {
  let value = seed >>> 0 || 1;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sameCounts(a, b) {
  if (!a || !b) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((key) => Number(a[key] || 0) === Number(b[key] || 0));
}

export function patternOf(spec, counts) {
  const cutoff = spec?.case_specific_cutoff;
  if (sameCounts(counts, cutoff?.abnormal_counts)) return "abnormal";
  if (sameCounts(counts, cutoff?.normal_counts)) return "normal";
  return "other";
}

/** A case can run the field when it states both patterns and authors at least one scorable nucleus of each kind it uses. */
export function fieldAvailable(spec) {
  const cutoff = spec?.case_specific_cutoff;
  if (spec?.specimen_type !== "interphase" || !cutoff?.normal_counts || !cutoff?.abnormal_counts) return false;
  return (spec.nuclei || []).some((nucleus) => nucleus?.scorable && (nucleus.expected_signals || []).length);
}

function transformNucleus(source, random, id) {
  const fixed = Boolean(source.overlap);
  const angle = fixed ? 0 : random() * Math.PI * 2;
  const mirror = !fixed && random() < 0.5 ? -1 : 1;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const shrink = 0.9;
  const signals = (source.expected_signals || []).map((signal, index) => {
    const dx = (signal.x - source.cx) * mirror * shrink;
    const dy = (signal.y - source.cy) * shrink;
    return { ...signal, id: `${id}-s${index}`, x: source.cx + dx * cos - dy * sin, y: source.cy + dx * sin + dy * cos };
  });
  return {
    ...source,
    nucleus_id: id,
    expected_signals: signals,
    overlap: source.overlap || null,
    fragment: source.fragment || null,
    background: [],
  };
}

export function equivocalCopy(nucleus, assay) {
  const signals = nucleus.expected_signals.map((signal) => ({ ...signal }));
  const gap = SIGNAL_DIAMETER * 1.5;
  if (assay === "break-apart") {
    const fusion = signals.findIndex((signal) => signal.type === "fusion");
    if (fusion < 0) return null;
    const { x, y } = signals[fusion];
    signals.splice(fusion, 1, { id: `${nucleus.nucleus_id}-er`, type: "red", x: x - gap / 2, y }, { id: `${nucleus.nucleus_id}-eg`, type: "green", x: x + gap / 2, y });
    return { ...nucleus, expected_signals: signals };
  }
  if (assay === "dual-fusion") {
    const red = signals.find((signal) => signal.type === "red");
    const green = signals.find((signal) => signal.type === "green");
    if (!red || !green) return null;
    green.x = red.x + gap;
    green.y = red.y;
    return { ...nucleus, expected_signals: signals };
  }
  return { ...nucleus, presentation: "ambiguous" };
}

function damagedCopy(nucleus) {
  const signals = nucleus.expected_signals.map((signal) => ({ ...signal }));
  if (signals.length) {
    signals[0].x = nucleus.cx + nucleus.rx * 1.22;
    signals[0].y = nucleus.cy - nucleus.ry * 0.1;
  }
  return { ...nucleus, presentation: "irregular", expected_signals: signals };
}

function overlapCopy(nucleus, partner) {
  const dx = nucleus.rx * 1.15;
  const extra = (partner.expected_signals || []).map((signal, index) => ({
    ...signal,
    id: `${nucleus.nucleus_id}-o${index}`,
    x: signal.x - partner.cx + nucleus.cx + dx,
    y: signal.y - partner.cy + nucleus.cy + 12,
  }));
  return {
    ...nucleus,
    overlap: { cx: nucleus.cx + dx, cy: nucleus.cy + 12, rx: partner.rx, ry: partner.ry },
    expected_signals: [...nucleus.expected_signals, ...extra],
  };
}

/**
 * spec.field_composition.abnormal_fraction fixes how many scored nuclei carry the abnormal pattern,
 * so constitutional and acquired cases differ. Without it the authored nuclei are cycled.
 */
function compositionSources(spec, scorable, target) {
  const fraction = Number(spec.field_composition?.abnormal_fraction);
  if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) return null;
  const abnormal = scorable.filter((nucleus) => patternOf(spec, nucleus.expected_counts) === "abnormal");
  const normal = scorable.filter((nucleus) => patternOf(spec, nucleus.expected_counts) === "normal");
  const abnormalCount = Math.round(target * fraction);
  if ((abnormalCount && !abnormal.length) || (abnormalCount < target && !normal.length)) return null;
  return [
    ...Array.from({ length: abnormalCount }, (_, index) => abnormal[index % abnormal.length]),
    ...Array.from({ length: target - abnormalCount }, (_, index) => normal[index % normal.length]),
  ];
}

function shuffled(items, random) {
  const out = items.slice();
  for (let index = out.length - 1; index > 0; index -= 1) {
    const pick = Math.floor(random() * (index + 1));
    [out[index], out[pick]] = [out[pick], out[index]];
  }
  return out;
}

/**
 * Build a field of `size` nuclei. Scorable copies keep the authored mix of patterns.
 * Returns { nuclei: [{ ...nucleusSpec, key: { quality, pattern } }], rules }.
 */
export function buildField(spec, seed, size = 16) {
  if (!fieldAvailable(spec)) return null;
  const random = seededRandom(seed);
  const assay = spec.assay_type;
  const scorable = (spec.nuclei || []).filter((nucleus) => nucleus?.scorable && (nucleus.expected_signals || []).length);
  const authoredOverlap = (spec.nuclei || []).filter((nucleus) => nucleus && !nucleus.scorable && nucleus.artifact_type === "overlapping_nuclei" && nucleus.overlap);
  const normalSource = scorable.find((nucleus) => patternOf(spec, nucleus.expected_counts) === "normal") || scorable[0];
  const excluded = [];
  let serial = 0;
  const nextId = () => `f${(serial += 1)}`;

  for (let index = 0; index < 2; index += 1) {
    const id = nextId();
    const base = authoredOverlap[index % Math.max(1, authoredOverlap.length)];
    const nucleus = base
      ? transformNucleus(base, random, id)
      : overlapCopy(transformNucleus(scorable[index % scorable.length], random, id), scorable[(index + 1) % scorable.length]);
    excluded.push({ ...nucleus, key: { quality: "overlap", pattern: "" } });
  }
  const equivocal = equivocalCopy(transformNucleus(normalSource, random, nextId()), assay);
  if (equivocal) excluded.push({ ...equivocal, key: { quality: "equivocal", pattern: "" } });
  excluded.push({ ...damagedCopy(transformNucleus(scorable[0], random, nextId())), key: { quality: "damaged", pattern: "" } });

  const target = size - excluded.length;
  const sources = compositionSources(spec, scorable, target) || Array.from({ length: target }, (_, index) => scorable[index % scorable.length]);
  const scored = sources.map((source) => {
    const nucleus = transformNucleus(source, random, nextId());
    return { ...nucleus, key: { quality: "score", pattern: patternOf(spec, source.expected_counts) } };
  });
  return {
    nuclei: shuffled([...scored, ...excluded], random),
    rules: [FIELD_RULES.common, FIELD_RULES[assay]].filter(Boolean),
  };
}

/** Grade student decisions: { [nucleus_id]: { quality, pattern } }. */
export function gradeField(field, decisions = {}) {
  const rows = field.nuclei.map((nucleus) => {
    const student = decisions[nucleus.nucleus_id] || {};
    const qualityOk = student.quality === nucleus.key.quality;
    const patternOk = nucleus.key.quality !== "score" || student.pattern === nucleus.key.pattern;
    return { id: nucleus.nucleus_id, key: nucleus.key, student, qualityOk, patternOk, ok: qualityOk && patternOk, decided: Boolean(student.quality) };
  });
  const keyScored = rows.filter((row) => row.key.quality === "score");
  const studentScored = rows.filter((row) => row.student.quality === "score");
  const percent = (list, pick) => (list.length ? Math.round((list.filter((row) => pick(row) === "abnormal").length / list.length) * 100) : null);
  return {
    rows,
    decided: rows.filter((row) => row.decided).length,
    total: rows.length,
    correct: rows.filter((row) => row.ok).length,
    qualityCorrect: rows.filter((row) => row.qualityOk).length,
    patternCorrect: keyScored.filter((row) => row.patternOk).length,
    keyScorable: keyScored.length,
    studentScorable: studentScored.length,
    keyAbnormalPercent: percent(keyScored, (row) => row.key.pattern),
    studentAbnormalPercent: percent(studentScored, (row) => row.student.pattern),
  };
}
