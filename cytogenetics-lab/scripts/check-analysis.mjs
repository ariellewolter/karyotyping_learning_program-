/**
 * Whole-karyotype analysis checks. Net imbalances come from the drawn
 * chromosomes, unknown material stays unresolved, idem and sl expand to the
 * stemline, and suggestions never change a formula on their own.
 */
import { readFileSync } from "node:fs";
import { bindChromosomeMaps } from "../js/chromosomes.js?v=20261026p5";
import { analyzeFormula, formulaSuggestions, imbalanceNotation } from "../js/karyotype-analysis.js";

const maps = JSON.parse(readFileSync(new URL("../data/chromosome-maps.json", import.meta.url)));
bindChromosomeMaps(maps);

let failures = 0;
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok || !detail ? "" : `\n     ${detail}`}`);
  if (!ok) failures += 1;
};
const net = (clone) => clone.imbalances.map(imbalanceNotation).join(" ") || "balanced";

const NET = [
  ["46,XY,t(9;22)(q34;q11.2)", "balanced"],
  ["46,XX,inv(16)(p13.1q22)", "balanced"],
  ["47,XX,+21", "+21"],
  ["45,X", "-X"],
  ["45,X,-Y", "-Y"],
  ["47,XXY", "+X"],
  ["46,XX,del(5)(q13q33)", "-5q13.1q33.3"],
  ["46,XX,i(17)(q10)", "-17p +17q"],
  ["46,XX,dup(1)(q21q32)", "+1q21.1q32.3"],
  ["46,XY,der(22)t(9;22)(q34;q11.2)", "+9q34.11q34.3(part) -22q11.21q11.23(part) -22q12.1q13.33"],
  ["46,XX,der(5)ins(5;2)(p14;q22q32)", "+2q22.1q22.3(part) +2q23.1q31.3 +2q32.1q32.3(part)"],
  ["45,XX,rob(13;14)(q10;q10)", "-13p(usual) -14p(usual)"],
  ["69,XXY", "balanced"],
  ["69,XXY,+21", "+21"],
  ["70,XXY,+8", "+8"],
  ["68,XXY,-7", "-7"],
];
for (const [formula, expected] of NET) {
  const clone = analyzeFormula(maps, formula).clones[0];
  check(net(clone) === expected, `net ${formula} = ${expected}`, net(clone));
}
check(analyzeFormula(maps, "69,XXY").clones[0].baseline.ploidy === 3, "69,XXY uses a triploid baseline");
check(analyzeFormula(maps, "69,XXY").clones[0].drawnCount === 69, "triploid drawing has 69 chromosomes");
check(analyzeFormula(maps, "45,XX,rob(13;14)(q10;q10)").clones[0].imbalances.every((run) => run.usual), "Robertsonian short-arm losses are marked usual");

const marker = analyzeFormula(maps, "47,XY,+8,+mar").clones[0];
check(net(marker) === "+8", "a marker adds no assigned material", net(marker));
check(marker.unresolved.some((item) => item.token === "+mar"), "a marker is listed as unresolved");
const added = analyzeFormula(maps, "46,XY,add(7)(q22)").clones[0];
check(added.unresolved.some((item) => /add/.test(item.token)), "add() keeps its unknown material unresolved");
check(added.imbalances.every((run) => run.delta < 0), "add() only counts the lost segment", net(added));

const clones = analyzeFormula(maps, "46,XX,t(9;22)(q34;q11.2)[10]/47,idem,+8[5]/48,sl,+8,+21[3]");
check(clones.clones.map(net).join(" / ") === "balanced / +8 / +8 +21", "idem and sl inherit the stemline", clones.clones.map(net).join(" / "));
check(clones.clones[1].sex === "XX", "idem inherits the sex complement");
check(clones.comparison.shared.join() === "t(9;22)(q34;q11.2)", "the shared abnormality is the stemline change");
check(clones.comparison.rows.map((row) => row.relation).join() === "stemline,sideline,sideline", "clone relations", clones.comparison.rows.map((row) => row.relation).join());
check(clones.comparison.rows[0].percent === 56, "clone percentage from cell counts");

const complex = analyzeFormula(maps, "45~48,XY,del(5)(q13q33),-7,+8,+mar[cp10]").clones[0];
check(complex.complexity.complex && complex.complexity.abnormalities === 4, "four abnormalities make a complex karyotype");
check(complex.complexity.monosomal, "-7 with a structural change is a monosomal karyotype");
check(!analyzeFormula(maps, "47,XY,+21").clones[0].complexity.complex, "one abnormality is not complex");

const bp = analyzeFormula(maps, "46,XY,t(9;22)(q34;q11.2)").clones[0].breakpoints;
check(bp.map((row) => row.band).join() === "9q34,22q11.2" && bp.every((row) => row.mapped && row.end > row.start), "breakpoint table has GRCh38 intervals");

const suggest = (formula) => formulaSuggestions(formula, analyzeFormula(maps, formula));
const fix = (formula, id) => suggest(formula).find((item) => item.id === id)?.formula;
check(fix("47,XY,+8,-7", "count") === "46,XY,+8,-7", "count suggestion follows the written abnormalities");
check(fix("46,XY,dic(13;15)(q22;q24)", "count") === "45,XY,dic(13;15)(q22;q24)", "a dicentric replaces two chromosomes");
check(fix("46,XY,t(22;9)(q11.2;q34)", "order") === "46,XY,t(9;22)(q34;q11.2)", "t() is rewritten lower chromosome first");
check(fix("47,XY,+21,add(1)(p36)", "order") === "47,XY,add(1)(p36),+21", "abnormalities in chromosome order");
check(fix("46,xy,+8,-7", "order") === "46,XY,-7,+8", "sex complement in capitals, numerical order");
check(fix("46, XY, t(9;22)(q34;q11.2)", "spaces") === "46,XY,t(9;22)(q34;q11.2)", "spaces removed");
check(fix("mos 47,XXY[10]/46,XY[20]", "spaces") == null, "the space after mos is kept");
check(fix("45~48,XY,del(5)(q13q33),-7,+8,+mar[cp10]", "count") == null, "a count range is not corrected");
check(suggest("46,XX,t(9;22)(q34;q11.2),inv(16)(p13.1q22)").filter((item) => item.kind === "fix").length === 0, "a well-written formula has no fix");
check(!suggest("46,XX,i(17)(q10)").some((item) => /q10/.test(item.message)), "q10 is a centromere, not an unknown band");
check(suggest("47,XY,+8,-7").every((item) => item.kind === "note" || item.formula !== "47,XY,+8,-7"), "a suggestion never returns the unchanged formula");

console.log(failures ? `\n${failures} failure(s)` : "\nAll analysis checks passed.");
process.exit(failures ? 1 : 0);
