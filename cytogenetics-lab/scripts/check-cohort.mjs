/**
 * Cohort analysis and karyogram-to-ISCN builder checks.
 */
import { readFileSync } from "node:fs";
import { bindChromosomeMaps } from "../js/chromosomes.js?v=20261026p5";
import { analyzeCohort, parseCohortText, cohortGroups, cohortCSV } from "../js/cohort-analysis.js";
import { composeFormula, tokenFor } from "../js/iscn-builder.js";

const maps = JSON.parse(readFileSync(new URL("../data/chromosome-maps.json", import.meta.url)));
bindChromosomeMaps(maps);

let failures = 0;
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok || !detail ? "" : `\n     ${detail}`}`);
  if (!ok) failures += 1;
};

const TSV = `RefNo\tCaseNo\tMorph\tCloneNo\tCloneShort
1\t1\tAML\t1\t46,XY,t(8;21)(q22;q22)[10]
1\t1\tAML\t2\t45,X,-Y,t(8;21)(q22;q22)[5]
1\t2\tAML\t1\t47,XX,+8[20]
2\t1\tMDS\t1\t46,XX,del(5)(q13q33)[12]
2\t2\tMDS\t1\t45,XY,-7[10]
2\t3\tAML\t1\t45~47,XY,del(5)(q13q33),-7,+8,+mar[cp10]
`;
const parsed = parseCohortText(TSV);
check(parsed.format === "tsv" && parsed.column === "CloneShort", "TSV karyotype column detected");
check(parsed.records.length === 5, "Mitelman-style clones of one case are joined", String(parsed.records.length));
check(parsed.records[0].formula.includes("/"), "joined clones keep a slash", parsed.records[0].formula);
check(cohortGroups(parsed.records).map((g) => g.name).join() === "AML,MDS", "groups from Morph column");

const cohort = analyzeCohort(maps, parsed.records);
check(cohort.analyzed === 5 && cohort.unreadable.length === 0, "every TSV case is readable");
check(cohort.multiClone === 1, "one multi-clone case");
const abn = Object.fromEntries(cohort.abnormalities.map((row) => [row.key, row.cases]));
check(abn["-7"] === 2 && abn["+8"] === 2 && abn["del(5)(q13q33)"] === 2, "recurrent abnormalities", JSON.stringify(abn));
check(abn["t(8;21)(q22;q22)"] === 1 && abn["mar"] === 1, "structural and marker counts");
check(cohort.partners.some((row) => row.key === "8;21" && row.cases === 1), "partner chromosome pairs");
check(cohort.breakpointGroups.find((row) => row.key === "5q13")?.cases === 2, "breakpoints grouped to the band");
const chr = Object.fromEntries(cohort.chromosomeSummary.filter((row) => row.maxGain || row.maxLoss).map((row) => [row.id, row]));
check(chr["8"]?.maxGain === 2 && chr["7"]?.maxLoss === 2 && chr["5"]?.maxLoss === 2, "chromosome summary from band frequencies");
check(cohort.complexity.complex === 1 && cohort.complexity.monosomal === 1, "complexity tallies");
check(cohortCSV(cohort).split("\n")[0] === "chromosome,band,start_bp,end_bp,gain_cases,loss_cases,gain_percent,loss_percent", "CSV header");

const stem = analyzeCohort(maps, parsed.records, { clones: "stemline" });
check(!stem.abnormalities.some((row) => row.key === "-Y"), "stemline mode ignores sideline-only changes");

const lines = parseCohortText("46,XY,t(9;22)(q34;q11.2)\n# note\n47,XX,+21\nnonsense\n");
check(lines.format === "lines" && lines.records.length === 3, "one formula per line");
check(analyzeCohort(maps, lines.records).unreadable.map((row) => row.formula).join() === "nonsense", "unreadable lines are listed");

const token = (op, ...labels) => tokenFor(maps, op, labels.map((label) => ({ label })));
check(token("t", "22q11.2", "9q34").token === "t(9;22)(q34;q11.2)", "t() reorders chromosomes");
check(token("inv", "16q22", "16p13.1").token === "inv(16)(p13.1q22)", "inv() writes pter-first");
check(token("delI", "5q33", "5q13").token === "del(5)(q13q33)", "del() writes pter-first");
check(token("iso", "17q21").token === "i(17)(q10)", "isochromosome uses the arm's q10/p10");
check(token("ring", "13q34", "13p11.2").token === "r(13)(p11.2q34)", "ring joins p and q");
check(token("ins", "5p14", "2q32", "2q22").token === "ins(5;2)(p14;q32q22)", "insertion keeps pick order");
check(token("der", "22q11.2", "9q34").token === "der(22)t(9;22)(q34;q11.2)", "der keeps the first pick as owner");
check(token("dup", "1q21", "2q32").error, "dup requires one chromosome");
check(token("gain", "21q22").token === "+21", "whole-chromosome gain");
check(token("add", "7q22").token === "add(7)(q22)", "add()");
check(composeFormula("XY", ["+21", "t(9;22)(q34;q11.2)"]) === "47,XY,t(9;22)(q34;q11.2),+21", "builder count and ISCN order");
check(composeFormula("XY", ["dic(13;15)(q22;q24)", "+mar", "-7"]) === "45,XY,-7,dic(13;15)(q22;q24),+mar", "dicentric count and marker last");
check(composeFormula("XX", ["i(17)(q10)"]) === "46,XX,i(17)(q10)", "isochromosome keeps the count");

console.log(failures ? `\n${failures} failure(s)` : "\nAll cohort checks passed.");
process.exit(failures ? 1 : 0);
