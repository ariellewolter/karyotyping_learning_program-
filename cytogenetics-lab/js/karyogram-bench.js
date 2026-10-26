/**
 * Whole-cell karyogram bench, modeled on a cut-and-arrange karyotyping workflow:
 * numbered places 1–22, X, Y; a filmstrip of chromosomes taken from the spread;
 * the generated spread as a reference; rotate, flip, undo, and keyboard assignment.
 * Orientation is stored per chromosome as { rot: 0 | 90 | 180 | 270, flip: boolean }.
 * A chromosome with no stored orientation takes its angle from the spread.
 */

import { SLOT_IDS } from "./util.js";
import { moveChromosome } from "./karyotype.js?v=20261025ex1";

export const BENCH_ROWS = [
  ["1", "2", "3", "4", "5"],
  ["6", "7", "8", "9", "10", "11", "12"],
  ["13", "14", "15", "16", "17", "18"],
  ["19", "20", "21", "22", "X", "Y"],
];

const HUES = ["#d64545", "#e07b39", "#c9a227", "#7cb342", "#2e9d5b", "#1fa39a", "#2a8fc7", "#3f6fd1", "#6a5acd", "#9b4dca", "#c2449a", "#d6456e",
  "#a0522d", "#5d8a3a", "#2b7a78", "#4361ee", "#7b2cbf", "#b5179e", "#e85d04", "#588157", "#0077b6", "#6d597a", "#9d0208", "#3a86ff"];

export function identityColour(identity) {
  const index = SLOT_IDS.indexOf(String(identity));
  return HUES[index >= 0 ? index : 0];
}

export function benchSlotAllowed(dest) {
  return dest === "pool" || SLOT_IDS.includes(String(dest));
}

export function orientationOf(kt, id, spreadRot = {}) {
  const stored = kt.orient?.[id];
  if (stored) return stored;
  const rot = Math.round((spreadRot[id] || 0) / 90) * 90;
  return { rot: ((rot % 360) + 360) % 360, flip: false };
}

export function isUpright(orientation) {
  return orientation.rot === 0;
}

/** Wraps a chromosome SVG so it draws at the given quarter turn and mirror. */
export function orientSvg(svg, { rot = 0, flip = false } = {}) {
  const width = attr(svg, "width", 28);
  const height = attr(svg, "height", 80);
  if (!rot && !flip) return svg;
  const sideways = rot === 90 || rot === 270;
  const outW = sideways ? height : width;
  const outH = sideways ? width : height;
  const turn = rot === 90 ? `translate(${outW} 0) rotate(90)`
    : rot === 180 ? `translate(${outW} ${outH}) rotate(180)`
      : rot === 270 ? `translate(0 ${outH}) rotate(270)` : "";
  const mirror = flip ? `translate(${width} 0) scale(-1 1)` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${outW}" height="${outH}" viewBox="0 0 ${outW} ${outH}" class="kb-oriented"><g transform="${turn}"><g transform="${mirror}">${svg}</g></g></svg>`;
}

function attr(svg, name, fallback) {
  const match = String(svg).match(new RegExp(`${name}="([\\d.]+)"`));
  const value = match ? Number(match[1]) : fallback;
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function snapshot(kt) {
  return { pool: kt.pool, slots: kt.slots, orient: kt.orient || {} };
}

function withHistory(kt, next) {
  return { ...next, history: [...(kt.history || []), snapshot(kt)].slice(-60), future: [] };
}

/** Places a chromosome. With bounce, a chromosome dropped on the wrong number stays where it was. */
export function benchPlace(kt, chromosomes, id, dest, { bounce = false } = {}) {
  const chromosome = chromosomes.find((item) => item.id === id);
  if (!chromosome || !benchSlotAllowed(dest)) return { karyotype: kt, bounced: false };
  const from = kt.pool.includes(id) ? "pool" : Object.keys(kt.slots).find((slot) => (kt.slots[slot] || []).includes(id));
  if (from === String(dest)) return { karyotype: kt, bounced: false };
  if (bounce && dest !== "pool" && String(chromosome.identity) !== String(dest)) {
    return {
      karyotype: { ...kt, bounceId: id, benchNote: `Not position ${dest}. The chromosome went back where it was.` },
      bounced: true,
    };
  }
  const moved = moveChromosome(kt, id, dest);
  return { karyotype: withHistory(kt, { ...moved, bounceId: null, benchNote: "" }), bounced: false };
}

export function benchTurn(kt, id, spreadRot, change) {
  if (!id) return kt;
  const current = orientationOf(kt, id, spreadRot);
  const next = change === "flip"
    ? { ...current, flip: !current.flip }
    : { ...current, rot: (current.rot + (change === "left" ? 270 : 90)) % 360 };
  return withHistory(kt, { ...kt, orient: { ...(kt.orient || {}), [id]: next }, bounceId: null, benchNote: "" });
}

export function benchRecord(previous, next) {
  return withHistory(previous, next);
}

export function benchUndo(kt) {
  const history = kt.history || [];
  if (!history.length) return kt;
  const previous = history[history.length - 1];
  return { ...kt, ...previous, history: history.slice(0, -1), future: [...(kt.future || []), snapshot(kt)], selectedId: null, bounceId: null, benchNote: "" };
}

export function benchRedo(kt) {
  const future = kt.future || [];
  if (!future.length) return kt;
  const next = future[future.length - 1];
  return { ...kt, ...next, future: future.slice(0, -1), history: [...(kt.history || []), snapshot(kt)], selectedId: null, bounceId: null, benchNote: "" };
}

/** Identities of placed chromosomes that are not short arm up. */
export function sidewaysPlaced(kt, chromosomes, spreadRot) {
  const byId = Object.fromEntries(chromosomes.map((item) => [item.id, item]));
  const out = [];
  for (const [slot, ids] of Object.entries(kt.slots || {})) {
    for (const id of ids || []) {
      if (byId[id] && !isUpright(orientationOf(kt, id, spreadRot))) out.push(slot);
    }
  }
  return [...new Set(out)];
}

/**
 * ctx: { kt, chromosomes, trayIds, chromosomeSvg(id, scale), spreadSvg, spreadRot, aids: boolean }
 * aids is false in assessments: no number or colour badges, no arranged view, no bounce-back.
 */
export function benchMarkup(ctx) {
  const { kt, chromosomes, trayIds, chromosomeSvg, spreadSvg, spreadRot, aids } = ctx;
  const byId = Object.fromEntries(chromosomes.map((item) => [item.id, item]));
  const total = chromosomes.length;
  const placed = total - (kt.pool || []).length;
  const preview = aids && kt.preview;
  const badge = (id) => {
    if (!aids || (!kt.showNumbers && !kt.showColour)) return "";
    const identity = byId[id]?.identity;
    return `<span class="kb-badge${kt.showNumbers ? "" : " dot"}" style="background:${kt.showColour ? identityColour(identity) : "#3f4a59"}">${kt.showNumbers ? identity : ""}</span>`;
  };
  const token = (id, where, scale) => {
    const orientation = preview ? { rot: 0, flip: false } : orientationOf(kt, id, spreadRot);
    const art = orientSvg(chromosomeSvg(id, scale), orientation);
    if (preview) return `<div class="chr-token kb-token" role="img" aria-label="Chromosome ${byId[id]?.identity}">${art}</div>`;
    const selected = kt.selectedId === id;
    const sideways = orientation.rot === 90 || orientation.rot === 270;
    const position = where === "pool" ? `Unplaced chromosome ${trayIds.indexOf(id) + 1} of ${trayIds.length}` : `Chromosome in position ${where}`;
    const turn = orientation.rot ? `, turned ${orientation.rot} degrees` : "";
    return `<button type="button" class="chr-token interactive kb-token${selected ? " selected" : ""}${kt.bounceId === id ? " bounced" : ""}${sideways ? " sideways" : ""}" draggable="true" data-id="${id}" aria-pressed="${selected}" aria-label="${position}${turn}${selected ? ", selected" : ""}">${where === "pool" ? badge(id) : ""}${art}</button>`;
  };
  const arranged = preview ? Object.fromEntries(SLOT_IDS.map((slot) => [slot, chromosomes.filter((item) => String(item.identity) === slot).map((item) => item.id)])) : kt.slots;
  const liveMarks = kt.placementMarks && kt.lastGrade ? kt.lastGrade.slotResults || {} : {};
  const sheet = BENCH_ROWS.map((row) => `<div class="kb-row">${row.map((slot) => {
    const ids = arranged[slot] || [];
    const mark = liveMarks[slot];
    const state = mark && mark.placed > 0 ? (mark.ok ? " slot-ok" : " slot-flag") : "";
    const label = `${ids.length ? `${ids.length} chromosome${ids.length === 1 ? "" : "s"} in` : "Empty"} position ${slot}. Press Enter to place the selected chromosome here.`;
    return `<div class="slot kb-slot${state}"${preview ? "" : ` data-slot="${slot}" tabindex="0" role="button" aria-label="${label}"`}><div class="slot-body">${ids.map((id) => token(id, slot, 0.62)).join("")}</div><p class="slot-num">${slot}</p></div>`;
  }).join("")}</div>`).join("");
  const selected = kt.selectedId && byId[kt.selectedId] ? kt.selectedId : null;
  const toolbar = preview ? "" : `<div class="kb-toolbar" role="toolbar" aria-label="Karyogram tools">
      <span class="kb-count">${placed}/${total}</span>
      <button type="button" class="btn" data-action="bench-undo" ${(kt.history || []).length ? "" : "disabled"} title="Undo (Ctrl or Cmd+Z)">Undo</button>
      <button type="button" class="btn" data-action="bench-redo" ${(kt.future || []).length ? "" : "disabled"} title="Redo (Shift+Ctrl or Cmd+Z)">Redo</button>
      <button type="button" class="btn" data-action="bench-rotate" ${selected ? "" : "disabled"} title="Rotate 90° (R)">Rotate 90°</button>
      <button type="button" class="btn" data-action="bench-flip" ${selected ? "" : "disabled"} title="Flip (F)">Flip</button>
      <button type="button" class="btn" data-action="bench-bump" ${selected && !kt.pool.includes(selected) ? "" : "disabled"} title="Return to the filmstrip (Delete)">Return to strip</button>
      ${aids ? `<button type="button" class="btn" data-action="bench-arranged">Show arranged</button>` : ""}
      <span class="kb-typed" aria-live="polite"></span>
      <span class="kb-help">Click a chromosome, then its number, or drag it. Type a number (or X, Y) to place the selected chromosome. R rotates, F flips. Short arm up.</span>
    </div>`;
  const banner = preview ? `<div class="kb-banner"><p><strong>This is a correctly arranged karyotype.</strong> Take your time. Compare the pairs and notice each chromosome's size, banding, and where the centromere sits. When you are ready, unsort it and build it yourself.</p><button type="button" class="btn primary" data-action="bench-unsort">${kt.previewFrom === "work" ? "Back to my karyotype" : "Unsort and start building"}</button></div>` : "";
  const note = !preview && kt.benchNote ? `<p class="kb-note" role="status">${kt.benchNote}</p>` : "";
  const strip = preview ? "" : `<div class="kb-strip pool" data-slot="pool" aria-label="Chromosomes not yet placed">
      <div class="kb-strip-body">${trayIds.map((id) => token(id, "pool", 0.62)).join("") || `<p class="muted empty-pool">All placed. Check the karyotype or submit it.</p>`}</div>
      <span class="kb-left">${trayIds.length} left</span>
    </div>`;
  const compare = selected && !preview ? `<div class="kb-compare"><figure>${orientSvg(chromosomeSvg(selected, 0.95), orientationOf(kt, selected, spreadRot))}<figcaption>Selected</figcaption></figure><p class="muted">Outlined in yellow in the spread.</p></div>` : `<p class="muted">Select a chromosome to find it in the spread.</p>`;
  return `<div class="kb" data-bench>
    ${toolbar}${note}${banner}
    <div class="kb-main">
      <section class="kb-sheet karyotype-sheet" aria-label="Numbered karyogram">${sheet}</section>
      <aside class="kb-rail">
        <h4>Metaphase spread (reference)</h4>
        ${aids ? `<div class="kb-aids"><label><input type="checkbox" data-action="bench-numbers" ${kt.showNumbers ? "checked" : ""}> Numbers</label><label><input type="checkbox" data-action="bench-colour" ${kt.showColour ? "checked" : ""}> Colour</label></div><p class="muted kb-aid-note">Numbers and colour name each chromosome. Use them to learn, then turn them off.</p>` : ""}
        <div class="kb-spread">${spreadSvg}</div>
        <p class="muted">Generated demonstration spread, not a microscope capture. Click a chromosome in it to select it. Placed chromosomes fade.</p>
        <h4>Selected vs. spread</h4>
        ${compare}
      </aside>
    </div>
    ${strip}
  </div>`;
}
