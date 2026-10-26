/**
 * Chromosome Analysis drawing workspace. A written ISCN formula is read by the
 * shared parser and drawn by the shared chromosome engine, so a chromosome looks
 * the same here as in a karyogram, a case, or the atlas.
 */

import { state } from "./store.js?v=20261006j";
import { escapeHtml } from "./util.js?v=20261025lib1";
import { chromosomeTraits, describeKaryogram, drawnModel, drawnPieces, inferPloidy, renderChromosome } from "./chromosomes.js?v=20261026p5";
import { exploreISCN } from "./iscn.js";
import { ideogramSVG, originHex, originLegendHTML, originsOf, stainLegendHTML } from "./ideogram.js?v=20261025ex1";
import { RESOLUTIONS } from "./banding.js?v=20261024c";
import { validateStructure } from "./structure-validation.js?v=20261025sv1";
import { bandInterval, bandLinks, formatMb } from "./band-links.js";
import { downloadPNG, downloadSVG, safeFilename } from "./figure-export.js";
import { analyzeFormula, imbalanceNotation, resolveClones } from "./karyotype-analysis.js?v=20261026p6";
import { copyNumberPlotSVG } from "./karyotype-analysis-view.js?v=20261026p6";
import { OPERATIONS, composeFormula, splitBand, tokenFor } from "./iscn-builder.js";
import { saveDrawReport } from "./my-case-reports.js?v=20261026p7";

const STORE_KEY = "cyto.chromosomeWorkspace";

/** Guided Draw walkthrough uses the same Down syndrome teaching formula as Casework. */
export const DRAW_GUIDED_FORMULA = "47,XX,+21";
export const DRAW_GUIDED_DISEASE = "Down syndrome";

const EXAMPLES = [
  DRAW_GUIDED_FORMULA,
  "47,XY,+21",
  "46,XY,t(9;22)(q34;q11.2)",
  "46,XX,del(5)(p15.2)",
  "46,XY,inv(16)(p13.1q22)",
  "45,XX,rob(13;14)(q10;q10)",
  "46,XX,i(17)(q10)",
  "46,XX,ins(5;2)(p14;q22q32)",
  "45,XY,dic(13;15)(q22;q24)",
  "46,XY,t(9;22;11)(q34;q11.2;q13)",
  "46,XX,der(1)t(1;3)(p32;q21)t(1;5)(q21;q13)",
  "46,XY,add(7)(q22)",
  "47,XX,+mar",
  "46,XY,der(22)(22pter->22q11.2::9q34->9qter)",
];

const DEFAULTS = {
  formula: DRAW_GUIDED_FORMULA,
  resolution: "550",
  colorMode: "origin",
  show: "all",
  sequence: "9, 22",
  line: 0,
  selected: -1,
  band: "",
  mode: "view",
  build: { sex: "XY", tokens: [], op: "t", picks: [], message: "" },
};

const SEX_OPTIONS = ["XY", "XX", "X", "XXY", "XXX", "XYY"];

const ROWS = [
  ["1", "2", "3", "4", "5"],
  ["6", "7", "8", "9", "10", "11", "12", "X"],
  ["13", "14", "15", "16", "17", "18"],
  ["19", "20", "21", "22", "Y", "MAR"],
];

const CHECK_STATUS = { validated: "Drawing matches the band map", failed: "Drawing differs from the band map", not_checked: "Not checked" };

let ws = loadState();

function loadState() {
  try {
    return { ...DEFAULTS, ...JSON.parse(sessionStorage.getItem(STORE_KEY) || "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveState() {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(ws));
  } catch {
    /* storage unavailable */
  }
}

/** Load a formula into the workspace, as when another section opens it in Draw. */
export function setWorkspaceFormula(formula, options = {}) {
  ws = { ...ws, ...options, formula: String(formula || "").trim(), line: 0, selected: -1, band: "" };
  saveState();
}

const isAltered = (chromosome) => Boolean(chromosome?.variant && chromosome.variant !== "normal");

function chromosomesFor(line) {
  if (line.sex && !/^(IDEM|SL|SDL\d*)$/i.test(line.sex)) {
    const ploidy = inferPloidy(line.count, line.ploidy, line.countRange);
    return describeKaryogram(line.sex, line.items, line.count, { ploidy })?.chromosomes || [];
  }
  const out = [];
  for (const item of (line.items || []).filter((entry) => entry.drawn)) {
    const pieces = item.derivatives || [{ identity: item.identity, variant: item.variant || item.token }];
    for (const piece of pieces) out.push({ identity: piece.identity, variant: "normal" }, piece);
    if (item.partner) out.push({ identity: item.partner, variant: "normal" });
  }
  return out;
}

function readFormula(text) {
  const report = exploreISCN(text);
  if (report.status === "empty" || report.status === "unsupported") return { report, lines: [] };
  const clones = resolveClones(report);
  return {
    report,
    lines: clones.map((clone) => ({
      ...clone,
      label: clones.length > 1 ? clone.label : (report.lines[clone.index]?.label || ""),
      chromosomes: chromosomesFor(clone),
    })),
  };
}

function sequenceIds() {
  return [...new Set(String(ws.sequence || "").split(/[,\s]+/).map((id) => id.trim().toUpperCase()).filter(Boolean))];
}

function visibleGroups(chromosomes) {
  const indexed = chromosomes.map((chromosome, index) => ({ ...chromosome, index }));
  const pool = ws.show === "altered" ? indexed.filter(isAltered) : indexed;
  const group = (identity) => ({ identity: identity === "MAR" ? "mar" : identity, members: pool.filter((chromosome) => String(chromosome.identity).toUpperCase() === identity) });
  if (ws.show === "selected") {
    const groups = sequenceIds().map(group).filter((entry) => entry.members.length);
    const rows = [];
    for (let index = 0; index < groups.length; index += 8) rows.push(groups.slice(index, index + 8));
    return rows;
  }
  return ROWS.map((row) => row.map(group).filter((entry) => entry.members.length)).filter((row) => row.length);
}

function svgSize(markup, name) {
  return Number(String(markup).match(new RegExp(`^<svg\\b[^>]*\\b${name}="([\\d.]+)"`))?.[1]) || 0;
}

function place(markup, x, y) {
  return String(markup).replace(/^<svg\b/, `<svg x="${x.toFixed(1)}" y="${y.toFixed(1)}"`);
}

function drawOptions(scale) {
  return { scale, resolution: ws.resolution, colorMode: ws.colorMode, bandInfo: true, hideIdentity: true };
}

function karyogramFigure(rows, title) {
  const pad = 14;
  const titleH = title ? 20 : 0;
  const parts = [];
  if (title) parts.push(`<text x="${pad}" y="${pad + 10}" class="cw-title">${escapeHtml(title)}</text>`);
  let y = pad + titleH;
  let width = 0;
  for (const row of rows) {
    const drawn = row.map((group) => ({
      group,
      members: group.members.map((chromosome) => {
        const markup = renderChromosome(chromosome, drawOptions(0.62)).trim();
        const height = svgSize(markup, "height");
        return { chromosome, markup, width: svgSize(markup, "width"), height, cenY: (chromosomeTraits(chromosome).cen ?? 0.45) * height };
      }).filter((member) => member.markup.startsWith("<svg")),
    })).filter((entry) => entry.members.length);
    if (!drawn.length) continue;
    const above = Math.max(...drawn.flatMap((entry) => entry.members.map((member) => member.cenY)));
    const below = Math.max(...drawn.flatMap((entry) => entry.members.map((member) => member.height - member.cenY)));
    let x = pad;
    for (const { group, members } of drawn) {
      const start = x;
      for (const member of members) {
        const top = y + above - member.cenY;
        const chromosome = member.chromosome;
        const selected = chromosome.index === ws.selected;
        const label = `Chromosome ${chromosome.identity}${isAltered(chromosome) ? `, ${chromosome.variant}` : ""}`;
        parts.push(`<g class="cw-chr${selected ? " sel" : ""}${isAltered(chromosome) ? " changed" : ""}" data-index="${chromosome.index}" role="button" tabindex="0" aria-label="${escapeHtml(label)}"><title>${escapeHtml(label)}</title>${selected ? `<rect x="${(x - 3).toFixed(1)}" y="${(top - 3).toFixed(1)}" width="${(member.width + 6).toFixed(1)}" height="${(member.height + 6).toFixed(1)}" rx="4" fill="none" stroke="#c9921a" stroke-width="2"/>` : ""}${place(member.markup, x, top)}</g>`);
        x += member.width + 3;
      }
      const changed = members.some((member) => isAltered(member.chromosome));
      parts.push(`<text x="${((start + x - 3) / 2).toFixed(1)}" y="${(y + above + below + 14).toFixed(1)}" text-anchor="middle" class="cw-caption${changed ? " changed" : ""}">${escapeHtml(group.identity)}${changed ? " *" : ""}</text>`);
      x += 18;
    }
    width = Math.max(width, x);
    y += above + below + 34;
  }
  const svgW = Math.ceil(Math.max(width + pad, 200));
  const svgH = Math.ceil(y + pad - 14);
  return `<svg class="cw-karyogram" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" role="img" aria-label="${escapeHtml(title || "Karyogram")}">${parts.join("")}</svg>`;
}

function totalWeight(pieces) {
  return (pieces || []).reduce((sum, piece) => sum + (piece.weight || 0), 0);
}

function detailFigure(chromosome) {
  const normal = drawnPieces(chromosome.identity, "normal", ws.resolution) || [];
  const changed = isAltered(chromosome) ? drawnPieces(chromosome.identity, chromosome.variant, ws.resolution) || [] : null;
  const longest = Math.max(totalWeight(normal), totalWeight(changed), 1);
  const height = (pieces) => Math.round(80 + 400 * (totalWeight(pieces) / longest));
  const panels = normal.length ? [{ title: `Normal ${chromosome.identity}`, pieces: normal }] : [];
  if (changed) panels.push({ title: chromosome.variant, pieces: changed });
  const parts = [];
  let x = 10;
  let svgH = 0;
  for (const panel of panels) {
    const markup = ideogramSVG(panel.pieces, { width: 180, height: height(panel.pieces), showLabels: true, colorMode: ws.colorMode, bandInfo: true, selectedId: ws.band || null }).trim();
    parts.push(`<text x="${x + 6}" y="14" class="cw-caption">${escapeHtml(panel.title)}</text>`);
    parts.push(place(markup, x, 22));
    x += svgSize(markup, "width") + 24;
    svgH = Math.max(svgH, svgSize(markup, "height") + 30);
  }
  return `<svg class="cw-detail-figure" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x} ${svgH}" width="${x}" height="${svgH}" role="img" aria-label="Ideogram of chromosome ${escapeHtml(chromosome.identity)}">${parts.join("")}</svg>`;
}

function compositionRuns(chromosome) {
  const runs = [];
  for (const segment of drawnPieces(chromosome.identity, chromosome.variant, "detailed") || []) {
    const isCen = segment.role === "centromere";
    const origin = String(segment.origin || segment.chromosome || "");
    const orientation = segment.orientation || "forward";
    const last = runs[runs.length - 1];
    if (last && last.origin === origin && (isCen || last.orientation === orientation || !last.to)) {
      if (isCen) last.centromere = true;
      else {
        if (!last.from) last.from = segment.label;
        last.to = segment.label;
        last.orientation = orientation;
      }
      last.weight += segment.weight || 0;
      continue;
    }
    runs.push({ origin, orientation, from: isCen ? "" : segment.label, to: isCen ? "" : segment.label, centromere: isCen, weight: segment.weight || 0 });
  }
  return runs;
}

function itemFor(line, chromosome) {
  return (line?.items || []).find((item) => item.token === chromosome.variant || item.variant === chromosome.variant || item.derivatives?.some((piece) => piece.variant === chromosome.variant));
}

function linksHTML(label) {
  const links = bandLinks(state.maps, label);
  if (!links.length) return "";
  return `<span class="cw-links">${links.map((link) => `<a href="${escapeHtml(link.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.name)}</a>`).join("")}</span>`;
}

function bandRowHTML(label) {
  const interval = bandInterval(state.maps, label);
  const where = interval ? `chr${interval.chromosome}:${formatMb(interval.start)}–${formatMb(interval.end)}` : "Not in the band map";
  return `<li><code>${escapeHtml(label)}</code> <span class="muted">${escapeHtml(where)}</span> ${linksHTML(label)}</li>`;
}

function validationHTML(chromosome) {
  if (!isAltered(chromosome)) return "";
  const results = validateStructure(state.maps, chromosome.variant);
  const result = results.find((item) => item.token === chromosome.variant) || results[0];
  if (!result) return "";
  const checks = (result.checks || []).map((check) => `<li class="cw-check ${check.status}"><strong>${escapeHtml(check.label || check.id)}</strong> ${escapeHtml(check.detail || "")}</li>`).join("");
  const visibility = result.visibility?.note ? `<p class="cw-visibility ${escapeHtml(result.visibility.level || "")}">${escapeHtml(result.visibility.note)}</p>` : "";
  return `<h4>Structure check</h4><p class="cw-status ${escapeHtml(result.status)}">${escapeHtml(CHECK_STATUS[result.status] || result.status)}</p>${result.note ? `<p class="muted">${escapeHtml(result.note)}</p>` : ""}${checks ? `<ul class="cw-checks">${checks}</ul>` : ""}${visibility}`;
}

function detailHTML(line, chromosome) {
  if (!chromosome) return `<p class="muted">Select a chromosome in the drawing to see its breakpoints, segment origin, and structure checks.</p>`;
  const item = itemFor(line, chromosome);
  const runs = compositionRuns(chromosome);
  const composition = runs.map((run) => run.origin === "?"
    ? `<li><i class="swatch cw-unknown-swatch"></i>${run.from === "hsr" ? "hsr · homogeneously staining region" : "Material of unknown origin"} · length not known${run.centromere ? " · carries a centromere of unknown origin" : ""}</li>`
    : `<li><i class="swatch" style="background:${originHex(run.origin)}"></i>${escapeHtml(run.from || "cen")} → ${escapeHtml(run.to || "cen")} · chromosome ${escapeHtml(run.origin)} material · ${escapeHtml(formatMb(run.weight))}${run.orientation === "reverse" ? " · reversed" : ""}${run.centromere ? " · carries the centromere" : ""}</li>`).join("");
  const model = drawnModel(chromosome.identity, chromosome.variant);
  const centromeres = model ? `<p class="muted">${model.centromeres === 2 ? "Dicentric: two centromeres are drawn." : model.centromeres === 0 ? "Acentric: no centromere is drawn." : "One centromere."}</p>` : "";
  const breakpoints = item?.breakpoints?.length ? `<h4>Breakpoints</h4><ul class="cw-bands">${item.breakpoints.map(bandRowHTML).join("")}</ul>` : "";
  const band = ws.band ? `<h4>Selected band</h4><ul class="cw-bands">${bandRowHTML(ws.band)}</ul>` : `<p class="muted">Hover a band to read its name. Click a band to show its coordinates and genome-browser links.</p>`;
  return `<div class="cw-detail-grid">
    <div class="cw-figure cw-detail-picture">${detailFigure(chromosome)}</div>
    <div class="cw-detail-text">
      <h3>Chromosome ${escapeHtml(chromosome.identity)}${isAltered(chromosome) ? ` · <code>${escapeHtml(chromosome.variant)}</code>` : " · normal"}</h3>
      <div class="cw-actions"><button type="button" class="btn" data-cw-export="detail-svg">Export SVG</button><button type="button" class="btn" data-cw-export="detail-png">Export PNG</button></div>
      ${breakpoints}
      <h4>Segment origin and orientation</h4><ul class="cw-runs">${composition}</ul>${centromeres}
      ${band}
      ${validationHTML(chromosome)}
    </div>
  </div>`;
}

function radios(name, options, current) {
  return options.map(([value, label]) => `<label class="check"><input type="radio" name="${name}" value="${escapeHtml(value)}" ${current === value ? "checked" : ""}> ${escapeHtml(label)}</label>`).join("");
}

function unreadableHTML(report) {
  if (report.status === "empty") return `<p class="muted">Write a formula, then choose Draw.</p>`;
  return `<p class="muted">This text could not be read as a formula. Start with the count and sex complement, as in <code>46,XY,del(5)(p15.2)</code>, or write one change such as <code>inv(9)(p12q13)</code>.</p>`;
}

function buildState() {
  const build = { ...DEFAULTS.build, ...(ws.build || {}) };
  build.tokens = [...(build.tokens || [])];
  build.picks = [...(build.picks || [])];
  ws.build = build;
  return build;
}

/** Tokens and sex of a single-line formula, so Build can start from what is drawn. */
function tokensOf(formula) {
  const text = String(formula || "").trim();
  if (!text || text.includes("/")) return null;
  const fields = text.replace(/\[[^\]]*\]$/, "").split(",").map((field) => field.trim()).filter(Boolean);
  if (!/^\d+$/.test(fields[0] || "") || !/^[XY]+$/i.test(fields[1] || "")) return null;
  return { sex: fields[1].toUpperCase(), tokens: fields.slice(2) };
}

function recompose() {
  const build = buildState();
  ws.formula = composeFormula(build.sex, build.tokens);
  Object.assign(ws, { line: 0 });
}

function pickBand(label) {
  const build = buildState();
  const op = OPERATIONS.find((item) => item.id === build.op);
  if (!op || op.picks === 0) return;
  if (!splitBand(label)) {
    build.message = "That band has no name, so it cannot be a breakpoint. Pick a named band.";
    return;
  }
  build.picks.push(label);
  build.message = "";
  if (build.picks.length < op.picks) return;
  const result = tokenFor(state.maps, op.id, build.picks.map((pick) => ({ label: pick })));
  build.picks = [];
  if (result.error) { build.message = result.error; return; }
  build.tokens.push(result.token);
  build.message = `Added ${result.token}.`;
  recompose();
}

function builderHTML() {
  const build = buildState();
  const op = OPERATIONS.find((item) => item.id === build.op) || OPERATIONS[0];
  const steps = op.picks
    ? `<p class="cw-build-hint">${escapeHtml(op.hint)} ${build.picks.length ? `Picked: ${build.picks.map((pick) => `<code>${escapeHtml(pick)}</code>`).join(" ")} · ${op.picks - build.picks.length} to go.` : `${op.picks} band${op.picks === 1 ? "" : "s"} to pick.`}</p>`
    : `<p class="cw-build-hint">${escapeHtml(op.hint)} <button type="button" class="button" data-cw-build="add-marker">Add +mar</button></p>`;
  const tokens = build.tokens.length
    ? `<ol class="cw-build-tokens">${build.tokens.map((token, index) => `<li><code>${escapeHtml(token)}</code> <button type="button" class="link-button" data-cw-build="remove" data-token-index="${index}" aria-label="Remove ${escapeHtml(token)}">Remove</button></li>`).join("")}</ol>`
    : `<p class="muted">No changes yet. The karyogram below is normal.</p>`;
  return `<section class="cw-build" aria-label="Build a karyotype">
    <div class="cw-build-row">
      <label>Sex complement<select name="buildSex">${SEX_OPTIONS.map((sex) => `<option ${sex === build.sex ? "selected" : ""}>${sex}</option>`).join("")}</select></label>
      <label>Change<select name="buildOp">${OPERATIONS.map((item) => `<option value="${item.id}" ${item.id === op.id ? "selected" : ""}>${escapeHtml(item.label)}</option>`).join("")}</select></label>
      <button type="button" class="button" data-cw-build="clear-picks" ${build.picks.length ? "" : "disabled"}>Clear picks</button>
      <button type="button" class="button" data-cw-build="undo" ${build.tokens.length ? "" : "disabled"}>Undo</button>
      <button type="button" class="button" data-cw-build="reset">Start over</button>
    </div>
    ${steps}
    ${build.message ? `<p class="cw-build-message" role="status">${escapeHtml(build.message)}</p>` : ""}
    <h4>Written changes</h4>${tokens}
    <p class="cw-build-formula">Formula: <code>${escapeHtml(ws.formula)}</code></p>
    <p class="muted">Click bands on the karyogram or on the enlarged ideogram. The count is taken from the drawing and the changes are kept in ISCN order. Use Formula mode to edit the text directly.</p>
  </section>`;
}

function denverGroup(identity) {
  const id = String(identity || "").toUpperCase();
  if (id === "MAR") return "Markers";
  if (["1", "2", "3"].includes(id)) return "A";
  if (["4", "5"].includes(id)) return "B";
  if (["6", "7", "8", "9", "10", "11", "12", "X"].includes(id)) return "C";
  if (["13", "14", "15"].includes(id)) return "D";
  if (["16", "17", "18"].includes(id)) return "E";
  if (["19", "20"].includes(id)) return "F";
  if (["21", "22", "Y"].includes(id)) return "G";
  return "";
}

function compositionText(chromosome) {
  return compositionRuns(chromosome).map((run) => {
    if (run.origin === "?") return run.from === "hsr" ? "hsr (unknown origin)" : "unknown material";
    const span = run.from && run.to ? (run.from === run.to ? run.from : `${run.from}→${run.to}`) : "cen";
    return `${span} (${run.origin}${run.orientation === "reverse" ? ", rev" : ""}${run.centromere ? ", cen" : ""})`;
  }).join("; ");
}

function placementText(item) {
  if (item.kind === "numerical") {
    return String(item.token).startsWith("-")
      ? `Missing whole chromosome ${item.chromosomes?.[0] || ""}`
      : `Extra whole chromosome ${item.chromosomes?.[0] || ""}`;
  }
  if (item.breakpoints?.length) {
    return item.breakpoints.length === 1
      ? `Breakpoint at ${item.breakpoints[0]}`
      : `Breakpoints at ${item.breakpoints.join(", ")}`;
  }
  if (/mar/i.test(item.token)) return "Marker of unknown origin (no band placement)";
  return item.type || "Written change";
}

function affectedRows(line, chromosomes, clone) {
  const rows = [];
  const seen = new Set();
  for (const chromosome of chromosomes.filter(isAltered)) {
    const item = itemFor(line, chromosome) || clone?.items?.find((entry) => entry.variant === chromosome.variant || entry.token === chromosome.variant);
    const key = `${chromosome.identity}|${chromosome.variant}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      chromosome: chromosome.identity,
      group: denverGroup(chromosome.identity),
      token: chromosome.variant,
      type: item?.type || "structural change",
      placement: item ? placementText(item) : "Drawn rearrangement",
      composition: compositionText(chromosome),
      index: chromosome.index,
    });
  }
  for (const item of (line.items || []).filter((entry) => entry.kind === "numerical")) {
    const id = String(item.chromosomes?.[0] || item.token.replace(/^[+-]/, ""));
    const key = `num|${item.token}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      chromosome: id,
      group: denverGroup(id),
      token: item.token,
      type: item.type || "numerical",
      placement: placementText(item),
      composition: String(item.token).startsWith("-") ? "Absent from the karyogram" : "Additional normal copy",
      index: chromosomes.findIndex((chr) => chr.identity === id),
    });
  }
  for (const item of (clone?.unresolved || [])) {
    const key = `unres|${item.token}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      chromosome: /mar/i.test(item.token) ? "mar" : "—",
      group: /mar/i.test(item.token) ? "Markers" : "",
      token: item.token,
      type: "unresolved",
      placement: item.reason,
      composition: "Not assigned to mapped bands",
      index: -1,
    });
  }
  return rows;
}

function reportBodyHTML(analysis, clone, line, chromosomes, { plot = true } = {}) {
  if (!clone) return `<p class="muted">This formula could not be analysed.</p>`;
  const written = clone.countRange ? clone.countRange.join("~") : clone.count;
  const net = clone.status === "ok"
    ? (clone.imbalances.length
      ? `<table class="case-table cn-table"><thead><tr><th>Net change</th><th>Meaning</th><th>GRCh38</th></tr></thead><tbody>${clone.imbalances.map((run) => `<tr class="${run.delta > 0 ? "cn-gain" : "cn-loss"}${run.usual ? " cn-usual" : ""}${run.partial ? " cn-partial" : ""}"><td><code>${escapeHtml(imbalanceNotation(run))}</code></td><td>${escapeHtml(run.description)}</td><td>${escapeHtml(formatMb(run.startBp))}–${escapeHtml(formatMb(run.endBp))}</td></tr>`).join("")}</tbody></table>`
      : `<p>No net gain or loss of mapped material at band level.</p>`)
    : `<p>${escapeHtml(clone.note)}</p>`;
  const affected = affectedRows(line, chromosomes, clone);
  const affectedTable = affected.length
    ? `<table class="case-table cw-affected"><thead><tr><th>Chromosome</th><th>Group</th><th>Written change</th><th>Type</th><th>Placement</th><th>Composition</th></tr></thead><tbody>${affected.map((row) => `<tr${row.index >= 0 ? ` data-cw-jump="${row.index}"` : ""}><td><strong>${escapeHtml(row.chromosome)}</strong></td><td>${escapeHtml(row.group)}</td><td><code>${escapeHtml(row.token)}</code></td><td>${escapeHtml(row.type)}</td><td>${escapeHtml(row.placement)}</td><td>${escapeHtml(row.composition)}</td></tr>`).join("")}</tbody></table>`
    : `<p>No abnormal chromosomes are named in this formula.</p>`;
  const breakpoints = clone.breakpoints?.length
    ? `<table class="case-table"><thead><tr><th>Band</th><th>Chr</th><th>GRCh38</th><th>Written in</th><th>Browse</th></tr></thead><tbody>${clone.breakpoints.map((row) => {
      const links = row.mapped ? bandLinks(state.maps, row.band).map((link) => `<a href="${escapeHtml(link.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.name)}</a>`).join(" · ") : "";
      const where = row.mapped ? `${formatMb(row.start)}–${formatMb(row.end)}` : row.centromeric ? "Centromere" : "Not on band map";
      return `<tr><td><code>${escapeHtml(row.band)}</code></td><td>${escapeHtml(row.chromosome)}</td><td>${escapeHtml(where)}</td><td><code>${escapeHtml(row.token)}</code></td><td>${links}</td></tr>`;
    }).join("")}</tbody></table>`
    : `<p class="muted">No breakpoints are written.</p>`;
  const c = clone.complexity || {};
  const plotMarkup = plot && clone.status === "ok" ? `<figure class="ka-plot cw-report-plot">${copyNumberPlotSVG(state.maps, clone)}<figcaption>Losses left in red, gains right in green.</figcaption></figure>` : "";
  const suggestions = (analysis.suggestions || []).length
    ? `<ul class="cw-report-notes">${analysis.suggestions.map((item) => `<li>${escapeHtml(item.message)}${item.formula ? ` Suggested: <code>${escapeHtml(item.formula)}</code>` : ""}</li>`).join("")}</ul>`
    : `<p class="muted">No writing problems found in this formula.</p>`;
  return `
    <div class="cw-report-summary">
      <p><strong>Formula:</strong> <code>${escapeHtml(analysis.raw || ws.formula)}</code></p>
      <dl class="ka-metrics">
        <div><dt>Written count</dt><dd>${escapeHtml(String(written ?? "—"))}</dd></div>
        <div><dt>Drawn</dt><dd>${clone.drawnCount ?? chromosomes.length}</dd></div>
        <div><dt>Sex</dt><dd>${escapeHtml(clone.sex || "—")}</dd></div>
        <div><dt>Baseline</dt><dd>${escapeHtml(clone.baseline?.label || "diploid")}</dd></div>
        <div><dt>Abnormalities</dt><dd>${c.abnormalities ?? 0}</dd></div>
        <div><dt>Breakpoints</dt><dd>${c.breakpoints ?? 0}</dd></div>
        <div><dt>Chromosomes involved</dt><dd>${escapeHtml((c.chromosomesInvolved || []).join(", ") || "none")}</dd></div>
      </dl>
      ${c.complex ? `<p class="cw-report-flag">Complex karyotype (3 or more abnormalities).</p>` : ""}
      ${c.monosomal ? `<p class="cw-report-flag">Monosomal karyotype.</p>` : ""}
    </div>
    <h5>Affected chromosomes and placements</h5>
    ${affectedTable}
    <h5>Net gains and losses</h5>
    ${net}
    ${plotMarkup}
    <h5>Breakpoints</h5>
    ${breakpoints}
    <h5>Formula checks</h5>
    ${suggestions}`;
}

function formulaReportHTML(line, lineIndex, chromosomes) {
  if (!state.maps?.chromosomes || !line) return "";
  const analysis = analyzeFormula(state.maps, ws.formula);
  const clone = analysis.clones?.[lineIndex];
  return `<section class="cw-report" id="cw-formula-report" aria-label="Formula report">
    <header class="cw-report-head">
      <div>
        <h4>Formula report</h4>
        <p class="muted">The karyogram above stays as drawn. This report lists every affected chromosome, where the change sits, and the net copy-number result.</p>
      </div>
      <div class="cw-actions">
        <button type="button" class="button primary" data-cw-export-pdf>Export PDF</button>
        <button type="button" class="button" data-cw-save-report>Save to My Case Reports</button>
        <button type="button" class="button" data-cw-analysis>Open in ISCN Analysis</button>
      </div>
    </header>
    ${reportBodyHTML(analysis, clone, line, chromosomes)}
    <p class="muted" data-cw-save-status>Study aid from the written formula on the GRCh38 band map. Not a clinical report or a diagnosis. Saved reports appear under My Case Reports.</p>
  </section>`;
}

/** Printable HTML for the Draw formula report (Save as PDF from the print dialog). */
export function formulaReportPrintHTML({ formula, lineIndex = 0, karyogramSvg = "" } = {}) {
  const text = String(formula || "").trim();
  const { lines } = readFormula(text);
  const index = Math.min(Math.max(0, Number(lineIndex) || 0), Math.max(0, lines.length - 1));
  const line = lines[index];
  const chromosomes = line?.chromosomes || [];
  const analysis = analyzeFormula(state.maps, text);
  const clone = analysis.clones?.[index];
  const body = reportBodyHTML(analysis, clone, line || { items: [] }, chromosomes, { plot: true });
  const when = new Date().toLocaleString();
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Formula report — ${escapeHtml(text)}</title><style>
    body { font-family: Helvetica, Arial, sans-serif; color: #1c2430; margin: 24px; }
    h1 { font-size: 20px; margin: 4px 0 8px; } h2 { font-size: 14px; margin: 18px 0 6px; border-bottom: 1px solid #c5ced6; padding-bottom: 2px; }
    h5, h4 { font-size: 13px; margin: 14px 0 6px; }
    p, li, td, th, dd, dt { font-size: 11px; line-height: 1.4; }
    .note, .muted { color: #526576; font-size: 10px; }
    code { font-family: ui-monospace, Menlo, monospace; font-size: 11px; }
    table { width: 100%; border-collapse: collapse; margin: 6px 0 10px; } th, td { border-bottom: 1px solid #d7d2c8; text-align: left; padding: 4px 5px; vertical-align: top; }
    .ka-metrics { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0; padding: 0; }
    .ka-metrics div { border: 1px solid #e3e8ec; border-radius: 6px; padding: 4px 8px; min-width: 5.5rem; }
    .ka-metrics dt { margin: 0; color: #526576; font-size: 9px; text-transform: uppercase; letter-spacing: .03em; } .ka-metrics dd { margin: 0; font-weight: 600; font-size: 12px; }
    .cn-gain code { color: #2f8f5b; } .cn-loss code { color: #c0392b; } .cn-usual code { color: #6b7280; }
    .cw-report-flag { color: #9a3412; font-weight: 600; }
    .karyogram { margin: 10px 0 16px; overflow: hidden; } .karyogram svg { max-width: 100%; height: auto; }
    .ka-plot svg { max-width: 100%; height: auto; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @page { margin: 12mm; }
    @media print { body { margin: 0; } h2, h4, h5 { break-after: avoid; } tr, .ka-metrics, .karyogram, .ka-plot { break-inside: avoid; } }
  </style></head><body>
    <p class="note">Educational formula report from Chromosome Analysis. Not a clinical report and not a diagnosis.</p>
    <h1>Formula report</h1>
    <p class="note">Generated ${escapeHtml(when)} · GRCh38 band map</p>
    ${karyogramSvg ? `<h2>Karyogram</h2><div class="karyogram">${karyogramSvg}</div>` : ""}
    <h2>Interpretation of the written formula</h2>
    ${body}
  </body></html>`;
}

function exportFormulaReportPDF(host) {
  const karyogramSvg = host.querySelector(".cw-karyogram")?.outerHTML || "";
  const html = formulaReportPrintHTML({ formula: ws.formula, lineIndex: ws.line, karyogramSvg });
  const frame = document.createElement("iframe");
  frame.setAttribute("title", "Formula report");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  frame.srcdoc = html;
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => frame.remove(), 1000);
  };
  document.body.append(frame);
}

/** Workspace markup. Render inside an element with id "chromosome-workspace". */
export function chromosomeWorkspaceHTML() {
  const { report, lines } = readFormula(ws.formula);
  const lineIndex = Math.min(Math.max(0, Number(ws.line) || 0), Math.max(0, lines.length - 1));
  const line = lines[lineIndex];
  const chromosomes = line?.chromosomes || [];
  if (!chromosomes[ws.selected]) ws.selected = chromosomes.findIndex(isAltered);
  const selected = chromosomes[ws.selected] ? { ...chromosomes[ws.selected], index: ws.selected } : null;
  const rows = visibleGroups(chromosomes);
  const figure = rows.length ? karyogramFigure(rows, ws.formula) : "";
  const shownIds = rows.flat().flatMap((group) => group.members);
  const origins = [...new Set(shownIds.flatMap((chromosome) => originsOf(drawnPieces(chromosome.identity, chromosome.variant, "detailed"))))];
  const legend = ws.colorMode === "origin" ? originLegendHTML(origins) : stainLegendHTML();
  const writtenCount = line?.countRange ? `${line.countRange[0]}–${line.countRange[1]}` : line?.count;
  const summary = line ? [
    line.label,
    line.count != null ? `${writtenCount} chromosomes written` : "",
    line.ploidy ? `${line.ploidy} ploidy` : "",
    line.sex ? `${line.sex} sex complement` : "",
    line.cloneSize != null ? `${line.cloneSize} cells${line.composite ? ", composite" : ""}` : "",
  ].filter(Boolean).join(" · ") : "";
  const drawnCount = line?.sex ? chromosomes.length : null;
  const inRange = line?.countRange ? drawnCount >= line.countRange[0] && drawnCount <= line.countRange[1] : drawnCount === line?.count;
  const mismatch = line && Number.isFinite(line.count) && drawnCount != null && !inRange && !line.ploidy
    ? `<p class="cw-warning">The written count is ${writtenCount}. The written symbols describe ${drawnCount} chromosomes. Check the count or the symbols.</p>`
    : "";
  const ploidy = line ? inferPloidy(line.count, line.ploidy, line.countRange) : 2;
  const ploidyNote = line && ploidy > 2
    ? `<p class="cw-warning">The formula is near-${ploidy === 3 ? "triploid" : "tetraploid"}. The drawing and the report both use a ${ploidy}n autosome baseline.</p>`
    : "";
  const held = (line?.items || []).filter((item) => !item.drawn && !(item.kind === "numerical" && line.sex));
  const heldList = held.length
    ? `<h4>Recorded but not drawn</h4><ul class="iscn-undrawn">${held.map((item) => `<li><code>${escapeHtml(item.token)}</code> <span>${escapeHtml(item.note)}</span></li>`).join("")}</ul>`
    : "";
  const empty = line && !figure ? `<p class="muted">${ws.show === "all" ? "Nothing in this formula can be drawn yet." : "No chromosome matches this filter."}</p>` : "";
  const mosaic = lines.length > 1
    ? `<label>Cell line<select name="line">${lines.map((item, index) => `<option value="${index}" ${index === lineIndex ? "selected" : ""}>${escapeHtml(item.label || `Cell line ${index + 1}`)}</option>`).join("")}</select></label>`
    : "";
  const building = ws.mode === "build";
  const modeSwitch = `<div class="cw-mode" role="radiogroup" aria-label="Workspace mode">${radios("mode", [["view", "Formula"], ["build", "Build"]], building ? "build" : "view")}</div>`;
  return `<section class="cw">
    ${modeSwitch}
    ${building ? builderHTML() : `<form class="cw-formula" data-cw-form>
      <label for="cw-formula">ISCN formula</label>
      <div class="cw-formula-row"><input id="cw-formula" name="formula" value="${escapeHtml(ws.formula)}" spellcheck="false" autocomplete="off"><button type="submit" class="button primary">Draw &amp; report</button></div>
      <p class="cw-examples">Examples ${EXAMPLES.map((example) => `<button type="button" class="cw-example" data-cw-example="${escapeHtml(example)}">${escapeHtml(example)}</button>`).join("")}</p>
    </form>`}
    <div class="cw-layout">
      <aside class="cw-controls" aria-label="Drawing controls">
        <fieldset><legend>Resolution</legend>${radios("resolution", RESOLUTIONS.map((item) => [item.id, item.label]), ws.resolution)}</fieldset>
        <fieldset><legend>Colour</legend>${radios("colorMode", [["origin", "By origin"], ["banding", "Banding"]], ws.colorMode)}</fieldset>
        <fieldset><legend>Show</legend>${radios("show", [["all", "All"], ["altered", "Altered"], ["selected", "Selected"]], ws.show)}
          <label class="cw-sequence">Chromosomes, in order<input name="sequence" value="${escapeHtml(ws.sequence)}" placeholder="9, 22" ${ws.show === "selected" ? "" : "disabled"}></label></fieldset>
        ${mosaic}
        <fieldset><legend>Export figure</legend><div class="cw-actions"><button type="button" class="btn" data-cw-export="karyogram-svg" ${figure ? "" : "disabled"}>SVG</button><button type="button" class="btn" data-cw-export="karyogram-png" ${figure ? "" : "disabled"}>PNG</button></div></fieldset>
        <p class="muted cw-note">400 and 550 merge the 850-level GRCh38 band map. Each merged band takes its main stain.</p>
      </aside>
      <div class="cw-stage">
        ${line ? `<p class="iscn-explore-components">${escapeHtml(summary)}</p>` : unreadableHTML(report)}
        ${figure ? legend : ""}
        ${figure ? `<div class="cw-figure cw-karyogram-wrap">${figure}</div>` : empty}
        ${mismatch}
        ${ploidyNote}
        ${heldList}
      </div>
    </div>
    ${line ? formulaReportHTML(line, lineIndex, chromosomes) : ""}
    <section class="cw-detail" aria-label="Selected chromosome">${line ? detailHTML(line, selected) : ""}</section>
    <p class="local-note">Schematic ideograms drawn from the written formula. They illustrate the notation and are not a specimen result.</p>
  </section>`;
}

function refresh(host) {
  saveState();
  host.innerHTML = chromosomeWorkspaceHTML();
}

function exportFigure(host, kind) {
  const selector = kind.startsWith("detail") ? ".cw-detail-figure" : ".cw-karyogram";
  const svg = host.querySelector(selector);
  if (!svg) return;
  const markup = svg.outerHTML;
  const stem = kind.startsWith("detail") ? `${ws.formula}_chr${host.querySelector(".cw-detail h3")?.textContent?.match(/Chromosome (\S+)/)?.[1] || ""}` : ws.formula;
  if (kind.endsWith("svg")) downloadSVG(markup, safeFilename(stem, "svg"));
  else downloadPNG(markup, safeFilename(stem, "png")).catch(() => {});
}

/** Load a written formula and redraw. Used by the Down syndrome guided walkthrough. */
export function applyWorkspaceFormula(root, formula) {
  const host = root?.querySelector("#chromosome-workspace");
  if (!host) return false;
  const text = String(formula || "").trim();
  if (!text) return false;
  ws = { ...ws, formula: text, mode: "view", line: 0, selected: -1, band: "" };
  saveDrawReport({ formula: text, lineIndex: 0 });
  refresh(host);
  return true;
}

export function bindChromosomeWorkspace(root) {
  const host = root?.querySelector("#chromosome-workspace");
  if (!host) return;
  host.addEventListener("submit", (event) => {
    if (!event.target.matches("[data-cw-form]")) return;
    event.preventDefault();
    ws.formula = event.target.querySelector("[name=formula]").value.trim();
    Object.assign(ws, { line: 0, selected: -1, band: "" });
    if (ws.formula) saveDrawReport({ formula: ws.formula, lineIndex: 0 });
    refresh(host);
  });
  host.addEventListener("change", (event) => {
    const { name, value } = event.target;
    if (name === "mode") {
      ws.mode = value === "build" ? "build" : "view";
      if (ws.mode === "build") {
        const parsed = tokensOf(ws.formula);
        ws.build = { ...buildState(), ...(parsed || { sex: buildState().sex, tokens: [] }), picks: [], message: parsed ? "Started from the drawn formula." : "This formula has more than one clone or no sex complement, so Build starts from a normal karyotype." };
        recompose();
      }
      Object.assign(ws, { selected: -1, band: "" });
      refresh(host);
      return;
    }
    if (name === "buildSex" || name === "buildOp") {
      const build = buildState();
      if (name === "buildSex") { build.sex = value; recompose(); }
      else { build.op = value; build.picks = []; build.message = ""; }
      refresh(host);
      return;
    }
    if (!["resolution", "colorMode", "show", "line", "sequence"].includes(name)) return;
    ws[name] = name === "line" ? Number(value) || 0 : value;
    if (name === "line") Object.assign(ws, { selected: -1, band: "" });
    refresh(host);
  });
  host.addEventListener("click", (event) => {
    const example = event.target.closest("[data-cw-example]");
    if (example) {
      Object.assign(ws, { formula: example.getAttribute("data-cw-example"), line: 0, selected: -1, band: "" });
      refresh(host);
      return;
    }
    if (event.target.closest("[data-cw-analysis]")) {
      try { sessionStorage.setItem("cyto.libraryAnalysis", ws.formula); } catch { /* storage unavailable */ }
      location.hash = "#/library/analysis";
      return;
    }
    if (event.target.closest("[data-cw-export-pdf]")) {
      saveDrawReport({ formula: ws.formula, lineIndex: ws.line });
      exportFormulaReportPDF(host);
      return;
    }
    if (event.target.closest("[data-cw-save-report]")) {
      const saved = saveDrawReport({ formula: ws.formula, lineIndex: ws.line });
      const status = host.querySelector("[data-cw-save-status]");
      if (status) status.textContent = saved ? "Saved to My Case Reports on this device." : "Nothing to save.";
      else window.alert(saved ? "Saved to My Case Reports on this device." : "Nothing to save.");
      return;
    }
    const jump = event.target.closest("[data-cw-jump]");
    if (jump) {
      ws.selected = Number(jump.getAttribute("data-cw-jump"));
      ws.band = "";
      refresh(host);
      host.querySelector(`.cw-chr[data-index="${ws.selected}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      return;
    }
    const exportButton = event.target.closest("[data-cw-export]");
    if (exportButton) {
      exportFigure(host, exportButton.getAttribute("data-cw-export"));
      return;
    }
    const buildAction = event.target.closest("[data-cw-build]");
    if (buildAction) {
      const build = buildState();
      const action = buildAction.getAttribute("data-cw-build");
      if (action === "clear-picks") build.picks = [];
      if (action === "undo") build.tokens.pop();
      if (action === "reset") Object.assign(build, { tokens: [], picks: [] });
      if (action === "remove") build.tokens.splice(Number(buildAction.getAttribute("data-token-index")), 1);
      if (action === "add-marker") build.tokens.push("+mar");
      build.message = "";
      recompose();
      refresh(host);
      return;
    }
    const band = event.target.closest("[data-band]")?.getAttribute("data-band") || "";
    if (ws.mode === "build" && band && event.target.closest(".cw-karyogram, .cw-detail-figure")) {
      pickBand(band);
      const picked = event.target.closest(".cw-chr");
      if (picked) ws.selected = Number(picked.getAttribute("data-index"));
      ws.band = band;
      refresh(host);
      return;
    }
    const chromosome = event.target.closest(".cw-chr");
    if (chromosome) {
      ws.selected = Number(chromosome.getAttribute("data-index"));
      ws.band = band;
      refresh(host);
      return;
    }
    if (band && event.target.closest(".cw-detail-figure")) {
      ws.band = band;
      refresh(host);
    }
  });
  host.addEventListener("keydown", (event) => {
    const chromosome = event.target.closest?.(".cw-chr");
    if (!chromosome || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    ws.selected = Number(chromosome.getAttribute("data-index"));
    ws.band = "";
    refresh(host);
    host.querySelector(`.cw-chr[data-index="${ws.selected}"]`)?.focus();
  });
}
