/**
 * Markup for whole-karyotype analysis. Used by the Reference Library ISCN
 * Analysis view, the Chromosome Analysis workspace, and the optional
 * Analyze Karyotype panel in casework.
 */

import { escapeHtml } from "./util.js?v=20261025lib1";
import { stainHex } from "./ideogram.js?v=20261025ex1";
import { bandLinks, formatMb } from "./band-links.js";
import { downloadPNG, downloadSVG, safeFilename } from "./figure-export.js";
import { ORDER, imbalanceNotation } from "./karyotype-analysis.js";

const GAIN = "#2f8f5b";
const LOSS = "#c0392b";

function cloneHeading(clone, many) {
  const count = clone.countRange ? clone.countRange.join("~") : clone.count;
  const sex = clone.sex && !/^(idem|sl|sdl\d*)$/i.test(clone.sex) ? `,${clone.sex}` : "";
  const cells = clone.cloneSize != null ? ` · ${clone.cloneSize} cell${clone.cloneSize === 1 ? "" : "s"}${clone.composite ? " (composite)" : ""}` : "";
  const inherit = clone.reference ? ` · ${clone.reference.word} = abnormalities of clone ${clone.reference.clone + 1}` : "";
  return `${many ? `${escapeHtml(clone.label)}: ` : ""}${escapeHtml(`${count}${sex}`)}${escapeHtml(cells)}${escapeHtml(inherit)}`;
}

/** Genome-wide gain and loss plot for one clone, losses left in red, gains right in green. */
export function copyNumberPlotSVG(maps, clone, title = "") {
  const ids = ORDER.filter((id) => maps?.chromosomes?.[id]);
  const longest = Math.max(...ids.map((id) => maps.chromosomes[id].length_bp || 0), 1);
  const column = 38;
  const top = title ? 34 : 14;
  const height = 260;
  const width = ids.length * column + 16;
  const total = top + height + 26;
  const scale = (bp) => bp / longest * height;
  const parts = [];
  if (title) parts.push(`<text x="8" y="20" font-size="12" font-weight="600" fill="#17324f">${escapeHtml(title)}</text>`);
  ids.forEach((id, index) => {
    const cx = 8 + index * column + column / 2;
    const record = maps.chromosomes[id];
    const x = cx - 4;
    for (const segment of record.segments || []) {
      const y = top + scale(segment.start_bp);
      const h = Math.max(0.6, scale(segment.end_bp - segment.start_bp));
      const fill = segment.role === "centromere" ? "#8a6d9e" : stainHex(segment.stain);
      parts.push(`<rect x="${x}" y="${y.toFixed(2)}" width="8" height="${h.toFixed(2)}" fill="${fill}"><title>${escapeHtml(segment.label || segment.id)}</title></rect>`);
    }
    parts.push(`<rect x="${x}" y="${top}" width="8" height="${scale(record.length_bp).toFixed(2)}" fill="none" stroke="#5b6770" stroke-width="0.6" rx="3"/>`);
    parts.push(`<text x="${cx}" y="${top + height + 16}" font-size="10" text-anchor="middle" fill="#33424f">${id}</text>`);
    for (const run of (clone.imbalances || []).filter((item) => item.chromosome === id)) {
      const y1 = top + scale(run.startBp);
      const y2 = top + scale(run.endBp);
      const lines = Math.max(1, Math.ceil(Math.abs(run.delta)));
      for (let k = 0; k < lines; k += 1) {
        const offset = 7 + k * 3.5;
        const lx = run.delta > 0 ? cx + offset : cx - offset;
        parts.push(`<line x1="${lx}" y1="${y1.toFixed(2)}" x2="${lx}" y2="${Math.max(y1 + 1.5, y2).toFixed(2)}" stroke="${run.delta > 0 ? GAIN : LOSS}" stroke-width="2.2"${run.partial ? ` stroke-dasharray="2 2"` : ""}><title>${escapeHtml(run.description)}</title></line>`);
      }
    }
  });
  return `<svg class="cn-plot" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${total}" viewBox="0 0 ${width} ${total}" role="img" aria-label="Net gains and losses by chromosome">${parts.join("")}</svg>`;
}

function imbalanceTable(clone) {
  if (clone.status !== "ok") return `<p class="muted">${escapeHtml(clone.note)}</p>`;
  if (!clone.imbalances.length) {
    return `<p>No net gain or loss of mapped material.${clone.unresolved.length ? " Unresolved material is listed below." : " The written changes are balanced at band level."}</p>`;
  }
  const rows = clone.imbalances.map((run) => `<tr class="${run.delta > 0 ? "cn-gain" : "cn-loss"}${run.partial ? " cn-partial" : ""}${run.usual ? " cn-usual" : ""}"><td><code>${escapeHtml(imbalanceNotation(run))}</code></td><td>${escapeHtml(run.description)}</td><td>${escapeHtml(formatMb(run.startBp))}–${escapeHtml(formatMb(run.endBp))}</td><td>${run.usual ? "usual" : run.partial ? "partial" : `${run.copies} (expected ${run.expected})`}</td></tr>`).join("");
  return `<table class="case-table cn-table"><thead><tr><th>Net change</th><th>Meaning</th><th>GRCh38</th><th>Copies</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function uncertainList(clone) {
  const items = [
    ...clone.unresolved.map((item) => ({ ...item, label: "Unresolved material" })),
    ...clone.notCounted.map((item) => ({ ...item, label: "Not counted" })),
  ];
  if (!items.length) return "";
  return `<h5>Unresolved or uncertain</h5><ul class="ka-uncertain">${items.map((item) => `<li><code>${escapeHtml(item.token)}</code> <strong>${escapeHtml(item.label)}.</strong> ${escapeHtml(item.reason)}</li>`).join("")}</ul>`;
}

function breakpointTable(maps, clone) {
  if (!clone.breakpoints.length) return `<p class="muted">No breakpoints are written in this clone.</p>`;
  const rows = clone.breakpoints.map((row) => {
    const links = row.mapped ? bandLinks(maps, row.band).map((link) => `<a href="${escapeHtml(link.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.name)}</a>`).join(" · ") : "";
    const where = row.mapped ? `${formatMb(row.start)}–${formatMb(row.end)}` : row.centromeric ? "Centromere" : "Not on band map";
    return `<tr><td><code>${escapeHtml(row.band)}</code></td><td>${escapeHtml(row.chromosome)}</td><td>${escapeHtml(where)}</td><td><code>${escapeHtml(row.token)}</code></td><td>${links}</td></tr>`;
  }).join("");
  return `<table class="case-table"><thead><tr><th>Band</th><th>Chr</th><th>GRCh38</th><th>Written in</th><th>Browse</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function complexityBlock(clone) {
  const c = clone.complexity;
  const flags = [];
  if (c.complex) flags.push("Three or more abnormalities. Several classifications, for example ELN 2022 for AML, call this a complex karyotype.");
  if (c.monosomal) flags.push("Two or more autosomal monosomies, or one autosomal monosomy with a structural abnormality: the monosomal karyotype definition of Breems et al. (2008).");
  return `<dl class="ka-metrics"><div><dt>Abnormalities</dt><dd>${c.abnormalities}</dd></div><div><dt>Numerical</dt><dd>${c.numerical}</dd></div><div><dt>Structural</dt><dd>${c.structural}</dd></div><div><dt>Breakpoints</dt><dd>${c.breakpoints}</dd></div><div><dt>Chromosomes involved</dt><dd>${escapeHtml(c.chromosomesInvolved.join(", ") || "none")}</dd></div></dl>${flags.length ? `<ul class="ka-flags">${flags.map((flag) => `<li>${escapeHtml(flag)}</li>`).join("")}</ul>` : ""}`;
}

function comparisonTable(analysis) {
  const cmp = analysis.comparison;
  if (!cmp) return "";
  const rows = cmp.rows.map((row) => `<tr><td>${escapeHtml(row.label)}</td><td>${escapeHtml(row.relation)}${row.inheritedFrom != null ? ` of clone ${row.inheritedFrom + 1}` : ""}</td><td>${row.cells ?? "—"}${row.percent != null ? ` (${row.percent}%)` : ""}</td><td>${row.specific.length ? row.specific.map((token) => `<code>${escapeHtml(token)}</code>`).join(" ") : "—"}</td></tr>`).join("");
  return `<section class="ka-section"><h4>Clone comparison</h4><p>${cmp.shared.length ? `Shared by every abnormal clone: ${cmp.shared.map((token) => `<code>${escapeHtml(token)}</code>`).join(" ")}.` : "No abnormality is shared by every abnormal clone."}${cmp.totalCells ? ` ${cmp.totalCells} cells counted.` : ""}</p><table class="case-table"><thead><tr><th>Clone</th><th>Relation</th><th>Cells</th><th>Clone-specific</th></tr></thead><tbody>${rows}</tbody></table><p class="muted">idem, sl, and sdl are expanded to the abnormalities they stand for. A stemline is the first clone written; a sideline carries its changes plus more.</p></section>`;
}

/** Suggestions with a two-step confirm. Nothing changes until Confirm is pressed. */
export function suggestionsHTML(suggestions = [], { allowApply = true } = {}) {
  if (!suggestions.length) return `<section class="ka-section ka-suggestions"><h4>Formula checks</h4><p>No writing problems found in this formula. This checks consistency and ISCN order, not whether the formula matches a specimen.</p></section>`;
  const items = suggestions.map((item, index) => {
    if (item.kind === "note" || !allowApply) {
      return `<li class="ka-note">${escapeHtml(item.message)}${item.formula && !allowApply ? ` <span class="muted">Possible rewrite: <code>${escapeHtml(item.formula)}</code></span>` : ""}</li>`;
    }
    return `<li class="ka-fix"><p>${escapeHtml(item.message)}</p><p>Suggested: <code>${escapeHtml(item.formula)}</code></p><div class="ka-actions"><button type="button" class="button" data-ka-review="${index}">Use this suggestion…</button><span class="ka-confirm" data-ka-confirm-row="${index}" hidden>Replace the formula with the suggestion? <button type="button" class="button primary" data-ka-confirm="${index}">Confirm</button> <button type="button" class="button" data-ka-cancel="${index}">Cancel</button></span></div></li>`;
  }).join("");
  return `<section class="ka-section ka-suggestions"><h4>Formula checks</h4><p class="muted">Suggestions compare the formula with itself and with ISCN writing order. They do not use a stored answer. A suggestion is only applied after you confirm it.</p><ul>${items}</ul></section>`;
}

/** Full analysis markup. mode: "library" | "workspace" | "casework". */
export function analysisHTML(maps, analysis, { mode = "library", allowApply = true } = {}) {
  if (!analysis || analysis.status === "empty") return `<p class="muted">Enter a complete formula, for example 46,XX,t(9;22)(q34;q11.2)[10]/47,idem,+8[5].</p>`;
  if (analysis.status !== "ok") {
    return `${suggestionsHTML(analysis.suggestions || [], { allowApply })}<p>This text is not read as a complete karyotype. Start with the chromosome count and the sex complement, for example <code>46,XY,…</code>.</p>`;
  }
  const many = analysis.clones.length > 1;
  const clones = analysis.clones.map((clone) => {
    const plot = clone.status === "ok" ? copyNumberPlotSVG(maps, clone) : "";
    const countLine = clone.status === "ok"
      ? `<p class="ka-count">Chromosomes built from this clone: <strong>${clone.drawnCount}</strong>${clone.countRange ? ` (written range ${clone.countRange.join("~")})` : ` (written ${clone.count})`}. Baseline: normal ${escapeHtml(clone.baseline.label || "diploid")} ${escapeHtml(clone.baseline.sex)}.</p>`
      : "";
    return `<section class="ka-clone" data-ka-clone="${clone.index}"><h4>${cloneHeading(clone, many)}</h4>${countLine}<h5>Net gains and losses</h5>${imbalanceTable(clone)}${plot ? `<figure class="ka-plot">${plot}<figcaption>Losses left in red, gains right in green. A dashed line is a partial change inside a breakpoint band. <button type="button" class="button" data-ka-export="svg" data-ka-clone-export="${clone.index}">SVG</button> <button type="button" class="button" data-ka-export="png" data-ka-clone-export="${clone.index}">PNG</button></figcaption></figure>` : ""}${uncertainList(clone)}<h5>Breakpoints</h5>${breakpointTable(maps, clone)}<h5>Complexity</h5>${complexityBlock(clone)}${clone.annotations.length ? `<p class="muted">Annotations kept as written: ${clone.annotations.map((token) => `<code>${escapeHtml(token)}</code>`).join(" ")}.</p>` : ""}</section>`;
  }).join("");
  const scope = mode === "casework"
    ? "Calculated only from the formula you wrote. It does not compare your formula with the case answer."
    : "Calculated from the written formula on the GRCh38 band map, with the same engine that draws the chromosomes. It is a study aid, not a clinical interpretation.";
  return `<div class="ka-result">${suggestionsHTML(analysis.suggestions, { allowApply })}${comparisonTable(analysis)}${clones}<p class="muted">${escapeHtml(scope)}</p></div>`;
}

/**
 * Wire suggestion confirmation and figure export inside root.
 * onApply(formula) is called only after Confirm.
 */
export function bindAnalysis(root, { maps, analysis, onApply }) {
  if (!root) return;
  const toggle = (index, open) => {
    const row = root.querySelector(`[data-ka-confirm-row="${index}"]`);
    const review = root.querySelector(`[data-ka-review="${index}"]`);
    if (row) row.hidden = !open;
    if (review) review.hidden = open;
  };
  root.querySelectorAll("[data-ka-review]").forEach((button) => button.addEventListener("click", () => toggle(button.dataset.kaReview, true)));
  root.querySelectorAll("[data-ka-cancel]").forEach((button) => button.addEventListener("click", () => toggle(button.dataset.kaCancel, false)));
  root.querySelectorAll("[data-ka-confirm]").forEach((button) => button.addEventListener("click", () => {
    const suggestion = analysis?.suggestions?.[Number(button.dataset.kaConfirm)];
    if (suggestion?.formula && onApply) onApply(suggestion.formula);
  }));
  root.querySelectorAll("[data-ka-export]").forEach((button) => button.addEventListener("click", () => {
    const clone = analysis?.clones?.[Number(button.dataset.kaCloneExport)];
    if (!clone) return;
    const markup = copyNumberPlotSVG(maps, clone, `${analysis.raw}${analysis.clones.length > 1 ? ` — ${clone.label}` : ""}`);
    const name = safeFilename(`net-imbalance-${analysis.raw}-${clone.index + 1}`, button.dataset.kaExport);
    if (button.dataset.kaExport === "png") downloadPNG(markup, name);
    else downloadSVG(markup, name);
  }));
}
