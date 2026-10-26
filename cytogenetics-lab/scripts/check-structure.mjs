/**
 * Validate drawn del, dup, inv, and t() chromosomes against the GRCh38 band map.
 * Every fixture must validate, and microdeletions must be reported below
 * conventional resolution rather than exaggerated.
 */
import { readFileSync } from "node:fs";
import { bindChromosomeMaps } from "../js/chromosomes.js?v=20261026p5";
import { structureStatus, validateStructure } from "../js/structure-validation.js?v=20261025sv1";

const maps = JSON.parse(readFileSync(new URL("../data/chromosome-maps.json", import.meta.url)));
bindChromosomeMaps(maps);

const fixtures = [
  ["del(5)(p15.2)", "visible"],
  ["del(5)(p14)", "visible"],
  ["del(4)(p16.3)", "below"],
  ["del(22)(q11.21q11.21)", "below"],
  ["del(7)(q11.23q11.23)", "borderline"],
  ["del(13)(q14.2q14.3)", null],
  ["del(15)(q11.2q13)", null],
  ["del(9)(p21)", null],
  ["dup(17)(p11.2p11.2)", null],
  ["dup(8)(q24.21q24.22)", "borderline"],
  ["dup(1)(q21q23)", null],
  ["inv(16)(p13.1q22)", null],
  ["inv(9)(p12q13)", null],
  ["inv(7)(q11.2q21)", null],
  ["t(9;22)(q34;q11.2)", null],
  ["t(11;22)(q23;q11.2)", null],
  ["t(8;21)(q22;q22)", null],
  ["t(15;17)(q24;q21)", null],
  ["t(2;5)(p23;q35)", null],
  ["der(22)t(9;22)(q34;q11.2)", null],
];

let failures = 0;
for (const [token, level] of fixtures) {
  const results = validateStructure(maps, token);
  const status = structureStatus(results);
  const failed = results.flatMap((item) => item.checks.filter((check) => check.status === "fail").map((check) => `${item.token}: ${check.label} — ${check.detail}`));
  const levelOk = !level || results.every((item) => item.visibility?.level === level);
  if (status !== "validated" || !levelOk) {
    failures += 1;
    console.log(`FAIL ${token} (${status}${level ? `, expected ${level}, got ${results.map((item) => item.visibility?.level).join("/")}` : ""})`);
    failed.forEach((line) => console.log(`  ${line}`));
    results.filter((item) => item.note).forEach((item) => console.log(`  ${item.note}`));
  } else {
    console.log(`ok   ${token} · ${results.map((item) => `${item.kind} · ${item.visibility?.level}`).join(" | ")}`);
  }
}

const segments = (id) => maps.chromosomes[id].segments.map((segment) => ({ ...segment }));
const faulty = [
  ["dup(1)(q21q23)", "interleaved duplicate", "ordering", () => {
    const base = segments("1");
    const lo = base.findIndex((s) => s.label.startsWith("1q21"));
    const hi = base.map((s) => s.label.startsWith("1q23")).lastIndexOf(true);
    return base.flatMap((s, i) => (i >= lo && i <= hi ? [s, { ...s, id: `${s.id}dup` }] : [s]));
  }],
  ["del(5)(p14)", "exaggerated deletion", "length", () => segments("5").filter((s) => !(s.arm === "p" && (s.band >= 4 || s.region === 1 && s.band >= 3)))],
  ["inv(9)(p12q13)", "second centromere", "centromere", () => {
    const base = segments("9");
    const cen = base.find((s) => s.role === "centromere");
    return [...base, { ...cen }];
  }],
];
for (const [token, label, checkId, draw] of faulty) {
  const results = validateStructure(maps, token, { draw });
  const caught = results.some((item) => item.checks.some((check) => check.id === checkId && check.status === "fail"));
  if (!caught) {
    failures += 1;
    console.log(`FAIL ${label} for ${token} was not caught by the ${checkId} check`);
  } else {
    console.log(`ok   rejects ${label} for ${token}`);
  }
}

const unsupported = structureStatus(validateStructure(maps, "trp(1)(q21q32)"));
if (unsupported !== "not_checked") {
  failures += 1;
  console.log(`FAIL trp(1)(q21q32) should be not_checked, got ${unsupported}`);
}

if (failures) {
  console.log(`${failures} structure fixture${failures === 1 ? "" : "s"} failed.`);
  process.exit(1);
}
console.log(`All ${fixtures.length} structure fixtures validated.`);
