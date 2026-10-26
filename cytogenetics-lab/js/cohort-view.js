/**
 * Cohort Analysis markup: gain and loss frequency ideograms, recurrent
 * abnormalities, breakpoints, partner pairs, and complexity.
 */

import { escapeHtml } from "./util.js?v=20261025lib1";
import { stainHex } from "./ideogram.js?v=20261025ex1";
import { ORDER } from "./karyotype-analysis.js";
import { cohortCSV } from "./cohort-analysis.js";
import { downloadPNG, downloadSVG, safeFilename } from "./figure-export.js";

const GAIN = "#2f8f5b";
const LOSS = "#c0392b";

/** Frequency ideogram: bar length to the right is the share of cases with a gain, to the left with a loss. */
export function cohortPlotSVG(maps, cohort, title = "") {
  const ids = ORDER.filter((id) => maps?.chromosomes?.[id]);
  const longest = Math.max(...ids.map((id) => maps.chromosomes[id].length_bp || 0), 1);
  const column = 52;
  const reach = 20;
  const top = title ? 34 : 14;
  const height = 280;
  const width = ids.length * column + 16;
  const total = top + height + 40;
  const scale = (bp) => bp / longest * height;
  const n = Math.max(1, cohort.analyzed);
  const parts = [];
  if (title) parts.push(`<text x="8" y="20" font-size="12" font-weight="600" fill="#17324f">${escapeHtml(title)}</text>`);
  ids.forEach((id, index) => {
    const cx = 8 + index * column + column / 2;
    const record = maps.chromosomes[id];
    for (const row of cohort.bandFreq.get(id) || []) {
      const segment = row.segment;
      const y = top + scale(segment.start_bp);
      const h = Math.max(0.6, scale(segment.end_bp - segment.start_bp));
      const fill = segment.role === "centromere" ? "#8a6d9e" : stainHex(segment.stain);
      parts.push(`<rect x="${cx - 3}" y="${y.toFixed(2)}" width="6" height="${h.toFixed(2)}" fill="${fill}"/>`);
      const label = `${segment.label}: gain ${row.gain}/${cohort.analyzed}, loss ${row.loss}/${cohort.analyzed}`;
      if (row.gain) parts.push(`<rect x="${cx + 5}" y="${y.toFixed(2)}" width="${(row.gain / n * reach).toFixed(2)}" height="${h.toFixed(2)}" fill="${GAIN}"><title>${escapeHtml(label)}</title></rect>`);
      if (row.loss) parts.push(`<rect x="${(cx - 5 - row.loss / n * reach).toFixed(2)}" y="${y.toFixed(2)}" width="${(row.loss / n * reach).toFixed(2)}" height="${h.toFixed(2)}" fill="${LOSS}"><title>${escapeHtml(label)}</title></rect>`);
    }
    parts.push(`<rect x="${cx - 3}" y="${top}" width="6" height="${scale(record.length_bp).toFixed(2)}" fill="none" stroke="#5b6770" stroke-width="0.5" rx="2.5"/>`);
    parts.push(`<line x1="${cx + 5 + reach}" y1="${top}" x2="${cx + 5 + reach}" y2="${top + scale(record.length_bp)}" stroke="#dfe5ea" stroke-width="0.5" stroke-dasharray="2 2"/>`);
    parts.push(`<text x="${cx}" y="${top + height + 16}" font-size="10" text-anchor="middle" fill="#33424f">${id}</text>`);
  });
  parts.push(`<text x="8" y="${top + height + 34}" font-size="10" fill="#5b6770">Bars: share of ${cohort.analyzed} cases. Dashed guide = 100%. Loss left (red), gain right (green).</text>`);
  return `<svg class="cohort-plot" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${total}" viewBox="0 0 ${width} ${total}" role="img" aria-label="Gain and loss frequency by band">${parts.join("")}</svg>`;
}

function table(rows, columns, limit = 15) {
  if (!rows.length) return `<p class="muted">None in this cohort.</p>`;
  return `<table class="case-table"><thead><tr>${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}</tr></thead><tbody>${rows.slice(0, limit).map((row) => `<tr>${columns.map((column) => `<td>${column.cell(row)}</td>`).join("")}</tr>`).join("")}</tbody></table>${rows.length > limit ? `<p class="muted">${rows.length - limit} more not shown.</p>` : ""}`;
}

const pct = (row) => `${row.cases} (${row.percent.toFixed(0)}%)`;

/** Full cohort result. */
export function cohortHTML(maps, cohort, { title = "" } = {}) {
  if (!cohort.total) return `<p class="muted">No karyotypes in this selection.</p>`;
  const cx = cohort.complexity;
  const buckets = ["0", "1", "2", "3", "4", "5+"].map((label, index) => `<div><dt>${label}</dt><dd>${cx.buckets[index]}</dd></div>`).join("");
  const percent = (value) => (cohort.analyzed ? `${(value / cohort.analyzed * 100).toFixed(0)}%` : "—");
  const unreadable = cohort.unreadable.length
    ? `<details class="cohort-unreadable"><summary>${cohort.unreadable.length} karyotype${cohort.unreadable.length === 1 ? "" : "s"} could not be read</summary><ul>${cohort.unreadable.slice(0, 40).map((record) => `<li><span class="muted">${escapeHtml(record.id)}</span> <code>${escapeHtml(record.formula)}</code></li>`).join("")}</ul></details>`
    : "";
  return `<div class="ka-result cohort-result">
    <section class="ka-section"><h4>Cohort</h4><dl class="ka-metrics"><div><dt>Cases</dt><dd>${cohort.total}</dd></div><div><dt>Read</dt><dd>${cohort.analyzed}</dd></div><div><dt>More than one clone</dt><dd>${cohort.multiClone}</dd></div><div><dt>With unresolved material</dt><dd>${cohort.unresolvedCases}</dd></div><div><dt>Complex (3+)</dt><dd>${cx.complex} · ${percent(cx.complex)}</dd></div><div><dt>Monosomal</dt><dd>${cx.monosomal} · ${percent(cx.monosomal)}</dd></div></dl>${unreadable}<p class="muted">Each case counts once per feature. ${cohort.clones === "stemline" ? "Only the first clone of each case is used." : "A change counts when any clone of the case carries it."} Partial changes inside breakpoint bands and unresolved material are not counted in the frequency plot.</p></section>
    <section class="ka-section"><h4>Gain and loss frequency</h4><figure class="ka-plot">${cohortPlotSVG(maps, cohort)}<figcaption><button type="button" class="button" data-cohort-export="svg">SVG</button> <button type="button" class="button" data-cohort-export="png">PNG</button> <button type="button" class="button" data-cohort-export="csv">Band table (CSV)</button></figcaption></figure></section>
    <div class="cohort-tables">
      <section class="ka-section"><h4>Recurrent abnormalities</h4>${table(cohort.abnormalities, [
        { label: "Abnormality", cell: (row) => `<code>${escapeHtml(row.key)}</code>` },
        { label: "Kind", cell: (row) => escapeHtml(row.type || row.kind) },
        { label: "Cases", cell: pct },
      ])}</section>
      <section class="ka-section"><h4>Recurrent breakpoints</h4>${table(cohort.breakpointGroups, [
        { label: "Band", cell: (row) => `<code>${escapeHtml(row.key)}</code>` },
        { label: "Cases", cell: pct },
      ])}<p class="muted">Sub-bands are grouped to the band, so 11q23 and 11q23.3 count together.</p></section>
      <section class="ka-section"><h4>Rearrangement partners</h4>${table(cohort.partners, [
        { label: "Chromosomes", cell: (row) => escapeHtml(row.key) },
        { label: "Cases", cell: pct },
      ])}</section>
      <section class="ka-section"><h4>Abnormalities per case</h4><dl class="ka-metrics cohort-buckets">${buckets}</dl><p class="muted">Highest count in any clone of the case.</p></section>
    </div>
    ${title ? `<p class="muted">${escapeHtml(title)}</p>` : ""}
  </div>`;
}

function saveText(text, filename, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function bindCohort(root, { maps, cohort, name }) {
  root.querySelectorAll("[data-cohort-export]").forEach((button) => button.addEventListener("click", () => {
    const kind = button.dataset.cohortExport;
    const stem = `cohort-${name || "selection"}`;
    if (kind === "csv") { saveText(cohortCSV(cohort), safeFilename(stem, "csv"), "text/csv"); return; }
    const markup = cohortPlotSVG(maps, cohort, `${name || "Cohort"} · ${cohort.analyzed} cases`);
    if (kind === "png") downloadPNG(markup, safeFilename(stem, "png")).catch?.(() => {});
    else downloadSVG(markup, safeFilename(stem, "svg"));
  }));
}
