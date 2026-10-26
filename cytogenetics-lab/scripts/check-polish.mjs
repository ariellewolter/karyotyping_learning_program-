/**
 * Polish checks: markers in chromosome sets, idem expansion for drawing,
 * ploidy baselines, and Robertsonian usual short-arm losses.
 */
import { readFileSync } from "node:fs";
import { bindChromosomeMaps, chromosomeSetFromFormula, describeKaryogram, expandChromosomeSet, inferPloidy, renderChromosome } from "../js/chromosomes.js?v=20261026p5";
import { analyzeFormula, imbalanceNotation, resolveClones } from "../js/karyotype-analysis.js";
import { exploreISCN } from "../js/iscn.js";

const maps = JSON.parse(readFileSync(new URL("../data/chromosome-maps.json", import.meta.url)));
const templates = JSON.parse(readFileSync(new URL("../data/chromosome-templates.json", import.meta.url)));
bindChromosomeMaps(maps);

let failures = 0;
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok || !detail ? "" : `\n     ${detail}`}`);
  if (!ok) failures += 1;
};

check(inferPloidy(46) === 2 && inferPloidy(69) === 3 && inferPloidy(92) === 4, "ploidy from count");
check(inferPloidy(46, "3n") === 3 && inferPloidy(70, "3n") === 3, "ploidy from <3n> token");

const set = chromosomeSetFromFormula("47,XY,+mar");
check(set?.copy_number?.mar === 1, "chromosome set counts the marker", JSON.stringify(set?.copy_number));
check(set?.variants?.mara === "mar", "marker variant is stored", JSON.stringify(set?.variants));
const expanded = expandChromosomeSet({ chromosome_set: set }, templates);
check(expanded.some((chr) => chr.identity === "mar"), "expandChromosomeSet includes mar");
const marSvg = renderChromosome({ identity: "mar", variant: "mar" }, { scale: 0.4 });
check(marSvg.includes("<svg"), "a marker renders as SVG", marSvg.slice(0, 80));

const clones = resolveClones(exploreISCN("46,XX,t(9;22)(q34;q11.2)[10]/47,idem,+8[5]"));
check(clones[1].sex === "XX" && clones[1].items.some((item) => item.token === "t(9;22)(q34;q11.2)"), "idem expands for drawing");
const drawn = describeKaryogram(clones[1].sex, clones[1].items, clones[1].count);
check(drawn.drawnCount === 47 && drawn.chromosomes.some((chr) => /t\(9;22\)/.test(chr.variant)), "idem clone draws 47 with the translocation");

const idemSet = chromosomeSetFromFormula("46,XX,t(9;22)(q34;q11.2)[10]/47,idem,+8[5]");
check(idemSet.drawnCount === 46, "chromosomeSetFromFormula still prefers the stemline for a mosaic");
const onlyIdem = chromosomeSetFromFormula("47,idem,+8");
check(!onlyIdem, "a lone idem line without a stemline cannot be drawn alone");

const triploid = describeKaryogram("XXY", [], 69, { ploidy: 3 });
check(triploid.drawnCount === 69, "triploid baseline draws 69 chromosomes", String(triploid.drawnCount));
check(analyzeFormula(maps, "69,XXY,+21").clones[0].imbalances.map(imbalanceNotation).join() === "+21", "triploid +21 is a single gain");

const rob = analyzeFormula(maps, "45,XY,rob(14;21)(q10;q10)").clones[0];
check(rob.imbalances.every((run) => run.usual) && rob.imbalances.map(imbalanceNotation).join(" ") === "-14p(usual) -21p(usual)", "Robertsonian usual short arms", rob.imbalances.map(imbalanceNotation).join(" "));

console.log(failures ? `\n${failures} failure(s)` : "\nAll polish checks passed.");
process.exit(failures ? 1 : 0);
