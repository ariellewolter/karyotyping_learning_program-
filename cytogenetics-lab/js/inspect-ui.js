/**
 * Shared chromosome inspection workstation.
 * Open from a karyotype, a chromosome exercise, or the atlas.
 */

import { state, patch } from "./store.js?v=20261006j";
import { escapeHtml } from "./util.js?v=20261025lib1";
import { chromosomeTraits, renderChromosome } from "./chromosomes.js?v=20261026p5";
import { hydrateCase } from "./cases.js?v=20261025ex1";
import { canonicalCase } from "./atlas.js?v=20261006j";
import { drawingDifference } from "./inspect-bench.js?v=20261025ex1";

export function openInspection(partial) {
  const chromosomes = partial.chromosomes || [];
  patch({
    inspect: {
      open: true,
      title: partial.title || "Chromosome inspection",
      chromosomes,
      leftId: partial.leftId || chromosomes[0]?.id || "",
      rightId: partial.rightId || chromosomes[1]?.id || chromosomes[0]?.id || "",
      reference: Boolean(partial.reference),
      zoom: partial.zoom || 1.35,
      labels: Boolean(partial.labels),
      highlight: partial.highlight !== false,
    },
  });
}

export function inspectDialogHTML() {
  const inspect = state.inspect;
  if (!inspect?.open || !inspect.chromosomes?.length) return "";
  const left = inspect.chromosomes.find((chromosome) => chromosome.id === inspect.leftId) || inspect.chromosomes[0];
  const rightSource = inspect.reference
    ? { id: `reference-${left.identity}`, identity: left.identity, variant: "normal" }
    : (inspect.chromosomes.find((chromosome) => chromosome.id === inspect.rightId) || left);
  const reading = drawingDifference(left, rightSource);
  const zoom = Number(inspect.zoom) || 1.35;
  const chromosomeOptions = (selectedId) => inspect.chromosomes
    .map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === selectedId ? "selected" : ""}>Chromosome ${escapeHtml(item.identity)}${item.homolog ? ` ${escapeHtml(item.homolog)}` : ""}</option>`)
    .join("");
  const picture = (chromosome, side) => {
    const markup = renderChromosome(chromosome, {
      scale: 0.72 * zoom,
      hideIdentity: true,
      realistic: true,
      texture: true,
      showLabels: Boolean(inspect.labels),
      bendSeed: chromosome.id,
      widthScale: 1.15,
    });
    const height = svgSize(markup, "height", 120);
    const cen = chromosomeTraits(chromosome).cen;
    return { markup, cenY: (cen == null ? 0.45 : cen) * height, mark: inspect.highlight && reading.shorter === side };
  };
  const drawnLeft = picture(left, "left");
  const drawnRight = picture(rightSource, "right");
  const align = Math.max(drawnLeft.cenY, drawnRight.cenY);
  const figure = (drawn, caption) => `<figure class="${drawn.mark ? "inspect-diff" : ""}" style="padding-top:${Math.max(0, align - drawn.cenY).toFixed(1)}px">${drawn.markup}<figcaption>${escapeHtml(caption)}</figcaption></figure>`;
  return `<dialog class="inspect-dialog" open aria-labelledby="inspect-title">
    <form method="dialog">
      <header class="inspect-head">
        <div><p class="eyebrow">Inspection workstation</p><h2 id="inspect-title">${escapeHtml(inspect.title)}</h2></div>
        <button type="button" class="btn" data-inspect-close>Close</button>
      </header>
      <p>Homologs are aligned at the centromere. Band positions come from the chromosome map. A highlighted drawing is only shorter. The highlight is not a diagnosis.</p>
      <div class="inspect-controls">
        <label>Left<select data-inspect-field="leftId">${chromosomeOptions(left.id)}</select></label>
        <label>Right<select data-inspect-field="rightId" ${inspect.reference ? "disabled" : ""}>${chromosomeOptions(inspect.rightId)}</select></label>
        <label class="check"><input type="checkbox" data-inspect-field="reference" ${inspect.reference ? "checked" : ""}> Reference ideogram</label>
        <label class="check"><input type="checkbox" data-inspect-field="labels" ${inspect.labels ? "checked" : ""}> Band labels</label>
        <label class="check"><input type="checkbox" data-inspect-field="highlight" ${inspect.highlight ? "checked" : ""}> Highlight a length difference</label>
        <label>Zoom <input type="range" min="0.8" max="2.2" step="0.05" value="${zoom}" data-inspect-field="zoom"></label>
      </div>
      <div class="inspect-pair">
        ${figure(drawnLeft, `Chromosome ${left.identity}`)}
        ${figure(drawnRight, inspect.reference ? `Reference ${left.identity}` : `Chromosome ${rightSource.identity}`)}
      </div>
      <ul class="comp-list">${reading.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>
    </form>
  </dialog>`;
}

export function bindInspect(root) {
  if (!root) return;
  root.querySelector("[data-inspect-close]")?.addEventListener("click", () => patch({ inspect: null }));
  root.querySelectorAll("[data-inspect-chromosome]").forEach((button) => {
    button.addEventListener("click", () => {
      const identity = button.getAttribute("data-inspect-chromosome");
      openInspection({
        title: `Chromosome ${identity}`,
        chromosomes: [
          { id: `atlas-${identity}-a`, identity, variant: "normal" },
          { id: `atlas-${identity}-b`, identity, variant: "normal" },
        ],
        leftId: `atlas-${identity}-a`,
        rightId: `atlas-${identity}-b`,
      });
    });
  });
  root.querySelectorAll("[data-inspect-disease]").forEach((button) => {
    button.addEventListener("click", () => {
      const disease = (state.diseases || []).find((item) => item.id === button.getAttribute("data-inspect-disease"));
      const item = canonicalCase(disease);
      const karyotype = item?.representative_teaching_karyotype || {};
      const hydrated = hydrateCase({
        case_id: `inspect-${disease?.id || "case"}`,
        chromosome_set: { sex: karyotype.sex, copy_number: karyotype.copy_number || {}, variants: karyotype.variants || {} },
      }, state.templates);
      const involved = new Set((karyotype.chromosomes_to_find || []).map(String));
      const preferred = hydrated.chromosomes.filter((chromosome) => involved.has(String(chromosome.identity)));
      const pair = preferred.length >= 1 ? preferred : hydrated.chromosomes;
      openInspection({
        title: disease?.disease_name || "Case chromosomes",
        chromosomes: hydrated.chromosomes,
        leftId: pair[0]?.id,
        rightId: pair[1]?.id || pair[0]?.id,
      });
    });
  });
  const inspect = state.inspect;
  if (!inspect?.open) return;
  root.querySelectorAll("[data-inspect-field]").forEach((field) => {
    field.addEventListener("change", () => updateInspect(field));
    if (field.getAttribute("data-inspect-field") === "zoom") field.addEventListener("input", () => updateInspect(field));
  });
}

function updateInspect(field) {
  const key = field.getAttribute("data-inspect-field");
  const current = state.inspect || {};
  let value = field.type === "checkbox" ? field.checked : field.value;
  if (key === "zoom") value = Number(value) || 1.35;
  patch({ inspect: { ...current, [key]: value } });
}

function svgSize(markup, name, fallback) {
  const match = String(markup).match(new RegExp(`${name}="([\\d.]+)"`));
  const value = match ? Number(match[1]) : fallback;
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
