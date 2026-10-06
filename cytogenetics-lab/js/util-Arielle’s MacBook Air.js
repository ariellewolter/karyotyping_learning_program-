/** Shared helpers. Keep this file free of case content. */

export const AUTOSOMES = Array.from({ length: 22 }, (_, i) => String(i + 1));
export const SLOT_IDS = [...AUTOSOMES, "X", "Y"];

export const GROUPS = {
  A: ["1", "2", "3"],
  B: ["4", "5"],
  C: ["6", "7", "8", "9", "10", "11", "12", "X"],
  D: ["13", "14", "15"],
  E: ["16", "17", "18"],
  F: ["19", "20"],
  G: ["21", "22", "Y"],
};

export const GROUP_OF = Object.fromEntries(
  Object.entries(GROUPS).flatMap(([g, ids]) => ids.map((id) => [id, g]))
);

/** Sequential Denver/ISCN groups for karyotype construction. Slots are filtered per case. */
export const DENVER_GROUPS = [
  { id: "A", title: "Group A", subtitle: "Large metacentric chromosomes — 1, 2, and 3", candidates: ["1", "2", "3"] },
  { id: "B", title: "Group B", subtitle: "Large submetacentric chromosomes — 4 and 5", candidates: ["4", "5"] },
  { id: "C", title: "Group C", subtitle: "Medium submetacentric chromosomes — 6–12 and X when present", candidates: ["6", "7", "8", "9", "10", "11", "12", "X"] },
  { id: "D", title: "Group D", subtitle: "Medium acrocentric chromosomes — 13, 14, and 15", candidates: ["13", "14", "15"] },
  { id: "E", title: "Group E", subtitle: "Short chromosomes — 16, 17, and 18", candidates: ["16", "17", "18"] },
  { id: "F", title: "Group F", subtitle: "Short metacentric chromosomes — 19 and 20", candidates: ["19", "20"] },
  { id: "G", title: "Group G", subtitle: "Short acrocentric chromosomes — 21, 22, and Y when present", candidates: ["21", "22", "Y"] },
];

export const ABNORMALITY_TYPES = [
  "trisomy",
  "monosomy",
  "deletion",
  "duplication",
  "translocation",
  "reciprocal translocation",
  "Robertsonian translocation",
  "inversion",
  "ring chromosome",
  "isochromosome",
  "derivative chromosome",
  "marker chromosome",
  "mosaicism",
];

export const CATEGORIES = ["normal", "numerical", "structural"];

export const COUNT_OPTIONS = ["45", "46", "47", "48", "49", "45 and 46 (two cell lines)"];
export const SEX_OPTIONS = ["XX", "XY", "X", "XXY", "XYY", "XXX", "X and XX"];
export const NUMERICAL_OPTIONS = ["none", "trisomy", "monosomy", "mosaicism"];
export const STRUCTURAL_OPTIONS = [
  "none",
  ...ABNORMALITY_TYPES.filter((t) => !["trisomy", "monosomy", "mosaicism"].includes(t)),
];
export const ARM_OPTIONS = ["none", "p", "q", "p;q", "q;q", "p;p"];
export const COMPARE_ARM_OPTIONS = ["p", "q", "p and q"];
export const CHROM_WITH_NONE = [["none", "none"], ...SLOT_IDS];
export const REGION_OPTIONS = ["1", "2", "3", "4"];
export const BAND_DIGIT_OPTIONS = ["1", "2", "3", "4", "5", "6", "7", "8"];
export const SUBBAND_OPTIONS = ["1", "2", "3"];
export const SIGNAL_COUNT_OPTIONS = Array.from({ length: 9 }, (_, i) => String(i));
export const RATIO_COUNT_OPTIONS = Array.from({ length: 21 }, (_, i) => String(i));
export const BAND_DESIGNATIONS = [
  "11", "11.1", "11.2", "12", "13", "14", "15", "15.1", "15.2", "15.3",
  "21", "22", "22.1", "22.2", "22.3", "23", "24",
  "31", "32", "33", "34", "35", "36",
];

export const SKILLS = [
  { id: "chromosome_identification", label: "Chromosome identification" },
  { id: "karyotype_construction", label: "Karyotype construction" },
  { id: "abnormality_recognition", label: "Abnormality recognition" },
  { id: "iscn_interpretation", label: "ISCN interpretation" },
  { id: "iscn_construction", label: "ISCN construction" },
  { id: "disease_association", label: "Disease association" },
  { id: "chromosome_assembly", label: "Chromosome assembly" },
  { id: "banding_nomenclature", label: "Band nomenclature" },
  { id: "fish_localization", label: "FISH probe localization" },
  { id: "fish_signals", label: "FISH signal identification" },
  { id: "fish_interpretation", label: "FISH interpretation" },
];

export const MODULES = [
  { id: "karyotype", title: "Karyotype construction", summary: "Identify chromosomes and arrange a standard 1–22 + X/Y worksheet." },
  { id: "assembly", title: "Chromosome assembly & banding", summary: "Build one chromosome from ordered bands, name loci, and interpret structural rearrangements." },
  { id: "fish", title: "FISH analysis", summary: "Locate probes on the chromosome map, inspect fluorescent signals, and interpret the cytogenetic pattern." },
  { id: "abnormality", title: "Abnormality identification", summary: "Classify normal, numerical, and structural findings from a completed karyotype." },
  { id: "iscn_interpretation", title: "ISCN interpretation", summary: "Parse a written ISCN result into count, sex complement, and abnormality components." },
  { id: "iscn_construction", title: "ISCN construction", summary: "Write the nomenclature for a described or constructed karyotype." },
  { id: "disease", title: "Disease association", summary: "Connect a cytogenetic finding with the associated educational diagnosis." },
  { id: "integrated", title: "Integrated unknown case", summary: "Work a case that may include karyotype, FISH, ISCN, and clinical correlation." },
];

export function $(sel, root = document) {
  return root.querySelector(sel);
}

export function $$ (sel, root = document) {
  return [...root.querySelectorAll(sel)];
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function selectField(id, label, value, options, blank = "Select…") {
  const items = (options || []).map((o) => {
    const v = Array.isArray(o) ? String(o[0]) : String(o);
    const lab = Array.isArray(o) ? String(o[1]) : String(o);
    return `<option value="${escapeHtml(v)}" ${String(value ?? "") === v ? "selected" : ""}>${escapeHtml(lab)}</option>`;
  }).join("");
  const blankOpt = blank == null ? "" : `<option value="">${escapeHtml(blank)}</option>`;
  return `<label class="stack">${escapeHtml(label)}<select id="${id}">${blankOpt}${items}</select></label>`;
}

export function splitPair(value) {
  const parts = String(value || "").split(";").map((s) => s.trim()).filter(Boolean);
  return { first: parts[0] || "", second: parts[1] || "" };
}

export function joinPair(first, second) {
  if (!first) return "";
  if (first === "none" || !second || second === "none") return first;
  return `${first};${second}`;
}

export function shuffle(items, seed = Date.now()) {
  const out = [...items];
  let s = seed >>> 0;
  for (let i = out.length - 1; i > 0; i -= 1) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function hashString(str) {
  let h = 2166136261;
  for (const ch of String(str)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function seedFrom(str) {
  return hashString(str);
}

export function titleCase(str) {
  return String(str || "")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

export function parseHash() {
  const raw = (location.hash || "#/").replace(/^#/, "");
  const parts = raw.split("/").filter(Boolean);
  if (parts[0] === "instructor") return { name: "instructor" };
  if (parts[0] === "reference") return { name: "reference" };
  if (parts[0] === "help") return { name: "help" };
  if (parts[0] === "cases") return { name: "cases" };
  if (parts[0] === "lab") {
    return {
      name: "lab",
      lab: parts[1] || "chromosome",
      exercise: parts[2] || null,
      caseId: parts[3] || null,
    };
  }
  if (parts[0] === "module") {
    return { name: "module", module: parts[1] || "karyotype", caseId: parts[2] || null };
  }
  if (parts[0] === "case") return { name: "case", caseId: parts[1] || null };
  return { name: "home" };
}

export function go(path) {
  location.hash = path.startsWith("#") ? path : `#${path}`;
}

export function difficultyRank(level) {
  return { introductory: 1, intermediate: 2, advanced: 3 }[level] || 0;
}
