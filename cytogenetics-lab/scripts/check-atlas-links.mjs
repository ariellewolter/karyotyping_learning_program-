/** Atlas "Seen by both" filter, disease-page jump links, and the routes they open. */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

globalThis.location = { hash: "#/" };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.fetch = async (url) => {
  const rel = String(url).replace(/^\.?\//, "").split("?")[0];
  const text = await readFile(path.join(root, rel), "utf8");
  return { ok: true, status: 200, json: async () => JSON.parse(text), text: async () => text };
};

const { loadActivityLinks, loadActivityPacks, loadCatalog, enrichCatalog, loadDiseases, loadMaps, loadProbes, loadTemplates } = await import("../js/cases.js?v=20261025ex1");
const { patch, state } = await import("../js/store.js?v=20261006j");
const { parseHash } = await import("../js/util.js?v=20261026seen5");
const { atlasBrowse } = await import("../js/atlas-ui.js?v=20261026seen3");
const { isSeenByMethod } = await import("../js/activities.js?v=20261026seen3");

const [catalogIndex, templates, maps, probes, diseases, activityLinks] = await Promise.all([
  loadCatalog(), loadTemplates(), loadMaps(), loadProbes(), loadDiseases(), loadActivityLinks(),
]);
const catalog = await enrichCatalog(catalogIndex);
const activityPacks = await loadActivityPacks(activityLinks, catalog);
patch({ catalog, templates, maps, probes, diseases, activityLinks, activityPacks });

const route = (hash) => { location.hash = hash; return parseHash(); };

// Routes
assert.equal(route("#/atlas/seen/both").method, "both");
assert.equal(route("#/atlas/disease/cml/both").method, "both");
assert.equal(route("#/atlas/chromosome/9/both").method, "both");
const draw = route(`#/lab/chromosome/draw/formula/${encodeURIComponent("46,XY,t(9;22)(q34;q11.2)")}`);
assert.equal(draw.exercise, "draw");
assert.equal(draw.caseId, null);
assert.equal(draw.formula, "46,XY,t(9;22)(q34;q11.2)");
const open = route("#/patients/fish/open/down-syndrome");
assert.deepEqual([open.name, open.lab, open.caseId, open.action, open.openDisease], ["patient", "fish", null, "list", "down-syndrome"]);

// Filter
const all = state.diseases.diseases;
const k = all.filter((d) => isSeenByMethod(d, "karyotype"));
const f = all.filter((d) => isSeenByMethod(d, "fish"));
const both = all.filter((d) => isSeenByMethod(d, "both"));
assert.ok(both.length > 0, "at least one disease is seen by both methods");
assert.ok(both.every((d) => k.includes(d) && f.includes(d)));
assert.equal(both.length, k.filter((d) => f.includes(d)).length);
const home = atlasBrowse(route("#/atlas/seen/both"));
assert.match(home, /Seen by Karyotyping and FISH/);
assert.match(home, /atlas-seen-link is-active" href="#\/atlas\/seen\/both"/);
for (const d of both) assert.ok(home.includes(`#/atlas/disease/${encodeURIComponent(d.id)}/both`), d.id);
for (const d of all.filter((x) => !both.includes(x))) assert.ok(!home.includes(`#/atlas/disease/${encodeURIComponent(d.id)}/both"`), d.id);

// Disease page jump links
const summary = [];
for (const d of all) {
  const html = atlasBrowse(route(`#/atlas/disease/${d.id}`));
  assert.match(html, /Open this disease in/, d.id);
  const on = (key) => new RegExp(`<a class="atlas-jump-link" id="atlas-jump-${key}"`).test(html);
  const off = (key) => new RegExp(`atlas-jump-link is-off" id="atlas-jump-${key}"`).test(html);
  for (const key of ["draw", "karyotype", "fish"]) assert.ok(on(key) !== off(key), `${d.id} ${key}`);
  summary.push(`${d.id.padEnd(34)} draw:${on("draw") ? "on " : "off"} kary:${on("karyotype") ? "on " : "off"} fish:${on("fish") ? "on " : "off"}${both.includes(d) ? "  [both]" : ""}`);
}

console.log(`karyotype ${k.length} · fish ${f.length} · both ${both.length} · total ${all.length}`);
console.log(summary.join("\n"));
console.log("check-atlas-links: ok");
