/**
 * Three proposal shapes for the casework lookup:
 * a written formula, an Atlas disease, and a name with no published formula.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildProposal } from "../js/lookup-engine.js";
import { searchAtlas } from "../js/lookup-sources.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));
const diseases = read("data/diseases.json");
const links = read("data/disease-activities.json");
const probes = read("data/probes.json");
const packs = {
  "fish-down-cep21": read("data/cases/fish-down-cep21.json"),
  "fish-dualfusion-bcrabl": read("data/cases/fish-dualfusion-bcrabl.json"),
};
const failures = [];

function check(label, ok) {
  if (!ok) failures.push(label);
}

function propose(query, library = diseases) {
  const atlasHits = searchAtlas(library, query);
  return buildProposal({
    query,
    atlasHits,
    omim: { status: "link", entries: [], searchUrl: "https://omim.org/" },
    links,
    packs,
    probes,
  });
}

const formula = propose("47,XX,+21");
check("formula is classified as a formula", formula.query.kind === "formula");
check("formula can be drawn", formula.status === "ready" && formula.selected?.ready === true);
check("formula keeps the written text", formula.selected?.normalized === "47,XX,+21");
check("formula pairs with the stored chromosome 21 assay", formula.fish.some((assay) => assay.caseId === "fish-down-cep21" && assay.pattern));

const down = propose("Down syndrome");
check("disease name finds the Atlas record", down.atlasHits.some((hit) => hit.id === "down-syndrome"));
check("disease proposal uses the canonical teaching formula", down.selected?.role === "canonical" && down.selected?.normalized === "47,XX,+21");
check("disease proposal does not invent an extra formula", down.formulas.every((item) => item.source === "atlas"));
check("disease proposal pairs the stored enumeration assay", down.fish.some((assay) => assay.caseId === "fish-down-cep21" && assay.preferred));

const translocation = propose("46,XY,t(9;22)(q34;q11.2)");
check("translocation formula is drawable", translocation.selected?.ready === true);
check("translocation pairs with the stored dual-fusion assay", translocation.fish.some((assay) => assay.caseId === "fish-dualfusion-bcrabl"));

const unsupported = propose("46,XX,trp(1)(q21q32)");
check("unsupported symbol is not drawn", unsupported.formulas[0]?.ready === false && unsupported.selected == null);

const emptyLibrary = {
  diseases: [{
    id: "no-formula",
    disease_name: "Example condition without a formula",
    cytogenetic_cases: [{ role: "canonical", primary_locus: "2q37", genes: "HDAC4" }],
  }],
};
const unnamed = buildProposal({
  query: "Example condition without a formula",
  atlasHits: searchAtlas(emptyLibrary, "Example condition without a formula"),
  omim: { status: "link", entries: [], searchUrl: "" },
  links: {},
  packs: {},
  probes: { probes: [] },
});
check("name without a formula stays a reference", unnamed.status === "reference");
check("name without a formula does not create an ISCN", unnamed.formulas.length === 0 && unnamed.selected == null);
check("name without a formula does not create a FISH pattern", unnamed.fish.length === 0);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("lookup engine checks passed");
