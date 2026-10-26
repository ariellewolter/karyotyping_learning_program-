/**
 * Shared drawing engine checks: band resolution, chromosome of origin,
 * band coordinates and links, and the Chromosome Analysis workspace markup.
 */
import { readFileSync } from "node:fs";
import { bindChromosomeMaps, drawnPieces, renderChromosome } from "../js/chromosomes.js?v=20261026p5";
import { bandInterval, bandLinks } from "../js/band-links.js";
import { originsOf } from "../js/ideogram.js?v=20261025ex1";
import { state } from "../js/store.js?v=20261006j";

const memory = new Map();
globalThis.sessionStorage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, String(value)) };

const maps = JSON.parse(readFileSync(new URL("../data/chromosome-maps.json", import.meta.url)));
bindChromosomeMaps(maps);
state.maps = maps;

const { chromosomeWorkspaceHTML, setWorkspaceFormula } = await import("../js/chromosome-workspace.js");

let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) failures += 1;
};
const weight = (pieces) => pieces.reduce((sum, piece) => sum + (piece.weight || 0), 0);
const bands = (pieces) => pieces.filter((piece) => piece.role !== "centromere").length;

for (const [identity, variant] of [["1", "normal"], ["9", "der(9)t(9;22)(q34;q11.2)"], ["22", "der(22)t(9;22)(q34;q11.2)"], ["5", "del(5)(p15.2)"], ["16", "inv(16)(p13.1q22)"]]) {
  const detailed = drawnPieces(identity, variant, "detailed");
  const at550 = drawnPieces(identity, variant, "550");
  const at400 = drawnPieces(identity, variant, "400");
  check(bands(at400) < bands(at550) && bands(at550) <= bands(detailed), `${variant === "normal" ? identity : variant}: ${bands(at400)} < ${bands(at550)} <= ${bands(detailed)} bands`);
  check(weight(at400) === weight(detailed) && weight(at550) === weight(detailed), `${variant === "normal" ? identity : variant}: merged length equals detailed length`);
  check(JSON.stringify(originsOf(at400)) === JSON.stringify(originsOf(detailed)), `${variant === "normal" ? identity : variant}: origins kept (${originsOf(detailed).join(", ")})`);
}

check(JSON.stringify(originsOf(drawnPieces("22", "der(22)t(9;22)(q34;q11.2)"))) === JSON.stringify(["22", "9"]), "der(22) carries chromosome 22 then chromosome 9 material");

const q34 = bandInterval(maps, "9q34");
check(q34 && q34.start < q34.end && q34.end <= maps.chromosomes["9"].length_bp, `9q34 interval ${q34?.start}-${q34?.end}`);
check(bandLinks(maps, "22q11.2").length === 3, "22q11.2 has UCSC, Ensembl, and NCBI links");
check(bandLinks(maps, "9q99").length === 0, "an unknown band has no links");

const origin = renderChromosome({ identity: "22", variant: "der(22)t(9;22)(q34;q11.2)" }, { colorMode: "origin", bandInfo: true, resolution: "550" });
check(/data-band="22q11\.2"/.test(origin) && /<title>/.test(origin), "band hover titles and data-band attributes are drawn");
const banding = renderChromosome({ identity: "22", variant: "normal" });
check(!/data-band=/.test(banding), "default rendering is unchanged");

const drawnCount = (html) => (html.match(/class="cw-chr/g) || []).length;
const examples = [
  ["46,XY,t(9;22)(q34;q11.2)", 46],
  ["46,XX,del(5)(p15.2)", 46],
  ["46,XY,inv(16)(p13.1q22)", 46],
  ["45,XX,rob(13;14)(q10;q10)", 45],
  ["46,XX,i(17)(q10)", 46],
  ["47,XY,+21", 47],
  ["45,X[10]/46,XX[20]", 45],
  ["inv(9)(p12q13)", 2],
  ["46,XY,add(7)(q22)", 46],
  ["not a formula", 0],
];
for (const [formula, expected] of examples) {
  setWorkspaceFormula(formula, { show: "all", resolution: "550", colorMode: "origin" });
  let html = "";
  try {
    html = chromosomeWorkspaceHTML();
  } catch (error) {
    check(false, `${formula}: ${error.message}`);
    continue;
  }
  check(drawnCount(html) === expected, `${formula}: ${drawnCount(html)} chromosomes drawn`);
}
setWorkspaceFormula("46,XY,trp(1)(q21q32)");
check(/Recorded but not drawn/.test(chromosomeWorkspaceHTML()), "trp() is listed as recorded but not drawn");
setWorkspaceFormula("46,XY,add(7)(q22)");
const added = chromosomeWorkspaceHTML();
check(!/Recorded but not drawn/.test(added) && /Material of unknown origin/.test(added), "add() is drawn with uncertain material");
setWorkspaceFormula("47,XX,+mar");
check(/aria-label="Chromosome mar/.test(chromosomeWorkspaceHTML()), "a marker gets its own karyogram slot");
setWorkspaceFormula("46,XY,t(9;22)(q34;q11.2)", { show: "altered" });
check(drawnCount(chromosomeWorkspaceHTML()) === 2, "Altered shows der(9) and der(22) only");
setWorkspaceFormula("46,XY,t(9;22)(q34;q11.2)", { show: "selected", sequence: "22, 9" });
const selected = chromosomeWorkspaceHTML();
check(drawnCount(selected) === 4 && selected.indexOf('aria-label="Chromosome 22') < selected.indexOf('aria-label="Chromosome 9'), "Selected draws 22 then 9");
check(/Drawing matches the band map/.test(selected) && /Segment origin and orientation/.test(selected), "selected derivative shows structure check and composition");
for (const resolution of ["400", "550", "detailed"]) {
  setWorkspaceFormula("46,XY,t(9;22)(q34;q11.2)", { show: "all", resolution });
  check(drawnCount(chromosomeWorkspaceHTML()) === 46, `${resolution} resolution renders`);
}

if (failures) {
  console.error(`${failures} drawing check(s) failed.`);
  process.exit(1);
}
console.log("Drawing checks passed.");
