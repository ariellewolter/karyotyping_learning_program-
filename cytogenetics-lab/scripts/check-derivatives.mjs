/**
 * General derivative model checks. Each written token must draw the segment
 * order ISCN describes, carry the right number of centromeres, mark unknown
 * material as uncertain, and give the karyogram the written chromosome count.
 */
import { readFileSync } from "node:fs";
import { bindChromosomeMaps, describeKaryogram, drawnSegments } from "../js/chromosomes.js?v=20261026p5";
import { validateStructure } from "../js/structure-validation.js?v=20261025sv1";
import { exploreISCN } from "../js/iscn.js";

const maps = JSON.parse(readFileSync(new URL("../data/chromosome-maps.json", import.meta.url)));
bindChromosomeMaps(maps);

let failures = 0;
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok || !detail ? "" : `\n     ${detail}`}`);
  if (!ok) failures += 1;
};

function runs(segments) {
  const out = [];
  for (const segment of segments || []) {
    const origin = segment.origin || segment.chromosome;
    const label = segment.role === "centromere" ? `${segment.chromosome}cen` : segment.label;
    const orientation = segment.orientation || "forward";
    const last = out[out.length - 1];
    if (last && last.origin === origin && last.orientation === orientation) last.to = label;
    else out.push({ origin, orientation, from: label, to: label });
  }
  return out.map((run) => `${run.from}>${run.to}${run.orientation === "reverse" ? "(r)" : ""}`).join(" | ");
}

const fixtures = [
  ["22", "der(22)(22pter->22q11.2::9q34->9qter)", "22p13>22q11.23 | 9q34.11>9q34.3", 1],
  ["22", "der(22)(22pter→22q11.2::9q34→9qter)", "22p13>22q11.23 | 9q34.11>9q34.3", 1],
  ["1", "del(1)(pter->q21:)", "1p36.33>1q21.3", 1],
  ["7", "add(7)(q22)", "7p22.3>7q22.3 | ?>?", 1],
  ["5", "der(5)ins(5;2)(p14;q22q32)", "5p15.33>5p14.1 | 2q32.3>2q22.1(r) | 5p14.3>5q35.3", 1],
  ["2", "der(2)ins(5;2)(p14;q22q32)", "2p25.3>2q37.3", 1],
  ["2", "ins(2)(p13q21q31)", "2p25.3>2p13.1 | 2q31.3>2q21.1(r) | 2p13.3>2q37.3", 1],
  ["13", "dic(13;15)(q22;q24)", "13p13>13q22.3 | 15q24.3>15p13(r)", 2],
  ["17", "idic(17)(p11.2)", "17q25.3>17p11.2(r) | 17p11.2>17q25.3", 2],
  ["9", "der(9)t(9;22;11)(q34;q11.2;q13)", "9p24.3>9q34.3 | 11q13.1>11q25", 1],
  ["22", "der(22)t(9;22;11)(q34;q11.2;q13)", "22p13>22q11.23 | 9q34.11>9q34.3", 1],
  ["11", "der(11)t(9;22;11)(q34;q11.2;q13)", "11p15.5>11q13.5 | 22q11.21>22q13.33", 1],
  ["1", "der(1)t(1;3)(p32;q21)t(1;5)(q21;q13)", "3q29>3q21.1(r) | 1p32.3>1q21.3 | 5q13.1>5q35.3", 1],
  ["7", "der(7)t(7;12)(q22;p13)del(7)(p15)", "7p14.3>7q22.3 | 12p13.1>12p13.33(r)", 1],
  ["1", "hsr(1)(p22)", "1p36.33>1p22.1 | hsr>hsr | 1p22.3>1q44", 1],
  ["mar", "mar", "?>?", 1],
];

for (const [identity, token, expected, centromeres] of fixtures) {
  const segments = drawnSegments(identity, token);
  const drawn = runs(segments);
  check(drawn === expected, `${token} draws ${expected}`, `drew ${drawn}`);
  const count = (segments || []).filter((segment) => segment.role === "centromere").length;
  check(count === centromeres, `${token} has ${centromeres} centromere${centromeres === 1 ? "" : "s"}`, `drew ${count}`);
  const results = validateStructure(maps, token);
  check(results.length && results.every((result) => result.status === "validated"), `${token} passes structure checks`, JSON.stringify(results.map((result) => [result.status, result.note, ...result.checks.filter((item) => item.status === "fail").map((item) => item.detail)])));
}

const weight = (segments) => segments.reduce((sum, segment) => sum + (segment.weight || 0), 0);
const normal5 = weight(drawnSegments("5", "normal"));
const inserted = weight(drawnSegments("5", "der(5)ins(5;2)(p14;q22q32)"));
const insertBp = weight(drawnSegments("2", "normal")) - weight(drawnSegments("2", "der(2)ins(5;2)(p14;q22q32)"));
check(Math.abs(inserted - normal5 - insertBp) < 1, "der(5) gains exactly the segment der(2) loses; 5p14 is split, not doubled");

check(drawnSegments("7", "add(7)(q22)").some((segment) => segment.role === "unknown" && segment.uncertain), "add() material is marked uncertain");
check(validateStructure(maps, "add(7)(q22)")[0].checks.some((item) => item.id === "uncertain"), "add() validation reports uncertain material");
check(drawnSegments("9", "der(9)t(9;22;11)(q34;q11.2)") === null || validateStructure(maps, "der(9)t(9;22;11)(q34;q11.2)")[0].status !== "validated", "a three-way t() with two bands is not drawn as valid");
check(drawnSegments("7", "add(7)(q99)") === null, "an unknown band is not drawn");
for (const token of ["i(17)(q10)", "r(18)(p11.2q22)", "rob(13;14)(q10;q10)"]) {
  check(validateStructure(maps, token)[0].status === "validated", `${token} passes the generic centromere and origin checks`);
}

const formulas = [
  ["47,XX,+mar", 47, ["mar"]],
  ["48,XY,+2mar", 48, ["mar", "mar"]],
  ["46,XX,ins(5;2)(p14;q22q32)", 46, ["2", "5"]],
  ["45,XY,dic(13;15)(q22;q24)", 45, ["13"]],
  ["46,XY,t(9;22;11)(q34;q11.2;q13)", 46, ["9", "11", "22"]],
  ["48,XY,+8,+der(22)t(9;22)(q34;q11.2)", 48, ["22"]],
  ["46,XX,der(1)t(1;3)(p32;q21)t(1;5)(q21;q13)", 46, ["1"]],
  ["46,XY,der(22)(22pter->22q11.2::9q34->9qter)", 46, ["22"]],
  ["46,XX,add(7)(q22),dmin,inc", 46, ["7"]],
];
for (const [formula, count, changed] of formulas) {
  const line = exploreISCN(formula).lines?.[0];
  const model = line && describeKaryogram(line.sex, line.items, line.count);
  const ids = (model?.chromosomes || []).filter((chromosome) => chromosome.variant !== "normal").map((chromosome) => chromosome.identity);
  check(model?.drawnCount === count && JSON.stringify(ids) === JSON.stringify(changed), `${formula}: ${count} chromosomes, changed ${changed.join(", ")}`, `drew ${model?.drawnCount}, changed ${ids.join(", ")}`);
}

const cancer = exploreISCN("45~48,XY,-7,+mar[cp10]");
check(cancer.status === "formula" && cancer.lines[0].count === 45 && cancer.lines[0].countRange?.[1] === 48 && cancer.lines[0].composite, "a count range and [cp10] composite clone are read");
const triploid = exploreISCN("69~72<3n>,XXY,+8");
check(triploid.lines?.[0]?.ploidy === "3n", "ploidy <3n> is read");
const held = exploreISCN("46,XX,add(7)(q22),dmin,inc").lines[0].items.filter((item) => !item.drawn).map((item) => item.token);
check(JSON.stringify(held) === JSON.stringify(["dmin", "inc"]), "dmin and inc are recorded, not drawn");

if (failures) {
  console.error(`${failures} derivative check(s) failed.`);
  process.exit(1);
}
console.log("Derivative model checks passed.");
