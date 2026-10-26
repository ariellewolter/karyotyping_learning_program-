/**
 * Ideogram, band annotations, and the printable case record.
 * Drawings illustrate the written formula. They are not a diagnostic report.
 */
import { escapeHtml } from "./util.js";
import { drawCrop } from "./crop-draw.js?v=20261026cs1";
import { ideogramSVG } from "./ideogram.js?v=20261024j";
import { CHROMOSOME_ORDER, WHOLE_CHROMOSOME_EFFECTS, genomeIssues, genomeSVG, issueBands, markBands, markLocation, resolveBand, segmentsFor } from "./case-ideogram.js?v=20261025gen2";

const EFFECTS = ["Gain of material", "Loss of material", "Gain of a whole chromosome", "Loss of a whole chromosome", "Deletion", "Duplication", "Breakpoint", "Inversion", "Translocation", "Isochromosome", "Structural change"];

export function caseReportMarkup() {
  return `<section class="patient-section case-ideogram" id="case-ideogram"><header><p class="eyebrow">After the sort</p><h3>Ideogram and band annotations</h3><p>Every chromosome is drawn to scale. Chromosomes named in your formula or marks are shown in red type. Select a chromosome or a band, then record what you see: a whole chromosome for a gain or loss, or a band range for a deletion or other structural change. Band names and positions are the stored GRCh38 cytobands.</p></header><div id="case-ideogram-body"></div></section>`;
}

const RANGE_HINTS = {
  Deletion: "Enter the missing segment. A terminal deletion runs to pter or qter (for example p15.2 to pter). An interstitial deletion has two bands (for example q21 to q31).",
  Duplication: "Enter the duplicated segment, from one band to another.",
  Inversion: "Enter the two breakpoints of the inverted segment.",
  Translocation: "Enter the breakpoint on this chromosome. Mark the partner chromosome separately.",
  Breakpoint: "Enter the band where the break is. Leave To blank for a single band.",
  Isochromosome: "Enter the centromere (cen) or the band at the break.",
};

export function bindCaseReport(app, current, context, onSave) {
  const panel = app.querySelector("#case-ideogram");
  const body = app.querySelector("#case-ideogram-body");
  if (!panel || !body) return;
  const report = genomeIssues(context.formula, context.disease);
  let marks = Array.isArray(current.studentMarks) ? current.studentMarks.slice(0, 40) : [];
  const saved = current.ideogramView || {};
  const view = {
    chromosome: saved.chromosome || marks[0]?.chromosome || report.chromosomes[0] || "1",
    selectedBand: saved.selectedBand || "",
    effect: EFFECTS.includes(saved.effect) ? saved.effect : (report.issues.some((issue) => /whole/i.test(issue.effect)) ? "Gain of a whole chromosome" : "Deletion"),
    from: saved.from || "",
    to: saved.to || "",
    note: "",
    error: "",
  };

  const covered = (issue) => issueBands(context.maps, issue);
  const whole = (effect) => WHOLE_CHROMOSOME_EFFECTS.includes(effect);
  const localBand = (id, chromosome) => String(id).slice(String(chromosome).length);

  function chart() {
    const programmed = report.issues.map((issue) => ({
      location: issue.location,
      chromosome: issue.chromosome,
      effect: issue.effect,
      detail: issue.details.join(" "),
      source: issue.origins.join(", "),
    }));
    const yours = marks.map((mark) => ({
      id: mark.id,
      location: markLocation(mark),
      chromosome: mark.chromosome,
      effect: mark.effect,
      detail: mark.note || "Marked on the ideogram",
      source: "Your mark",
    }));
    return [...programmed, ...yours];
  }

  function persist(extra = {}) {
    const { chromosome, selectedBand, effect, from, to } = view;
    onSave({ studentMarks: marks, ideogramView: { chromosome, selectedBand, effect, from, to }, ...extra });
  }

  function readForm() {
    const form = body.querySelector("#case-mark-form");
    if (!form) return;
    view.effect = form.elements.effect.value;
    view.from = form.elements.from.value.trim();
    view.to = form.elements.to.value.trim();
    view.note = form.elements.note.value;
  }

  function selectBand(id, chromosome) {
    readForm();
    if (chromosome !== view.chromosome) { view.from = ""; view.to = ""; }
    view.chromosome = chromosome;
    view.selectedBand = id;
    view.error = "";
    if (!whole(view.effect)) {
      const band = localBand(id, chromosome);
      if (!view.from || view.to) { view.from = band; view.to = ""; } else view.to = band;
    }
    persist();
    paint();
  }

  function paint() {
    const read = new Set(report.issues.flatMap((issue) => covered(issue).map((band) => band.id)));
    const marked = new Set(marks.flatMap((mark) => markBands(context.maps, mark).map((band) => band.id)));
    const involved = new Set([...report.chromosomes, ...marks.map((mark) => String(mark.chromosome))]);
    const genome = genomeSVG(context.maps, { marked, read, involved, selected: view.chromosome, selectedBand: view.selectedBand, interactive: true });
    const segments = context.maps?.chromosomes?.[view.chromosome]?.segments || [];
    const detail = segments.length ? `<figure class="case-ideo"><figcaption>Chromosome ${escapeHtml(view.chromosome)}</figcaption>${ideogramSVG(segments, { width: 78, height: 340, barWidth: 26, highlightIds: [...marked, ...read], highlightTag: false, selectedId: view.selectedBand })}</figure>` : `<p class="muted">No band map for chromosome ${escapeHtml(view.chromosome)}.</p>`;
    const bandList = segmentsFor(context.maps, view.chromosome).map((segment) => {
      const effects = [
        ...report.issues.filter((issue) => covered(issue).some((band) => band.id === segment.id)).map((issue) => issue.effect),
        ...marks.filter((mark) => markBands(context.maps, mark).some((band) => band.id === segment.id)).map((mark) => `${mark.effect} (yours)`),
      ];
      return `<li><button type="button" data-band="${escapeHtml(segment.id)}" class="${view.selectedBand === segment.id ? "on" : ""}"><strong>${escapeHtml(segment.id)}</strong> ${escapeHtml(segment.gie_stain || "band")} · ${mb(segment.start_bp)}–${mb(segment.end_bp)} Mb${effects.length ? ` · ${escapeHtml(effects.join(", "))}` : ""}</button></li>`;
    }).join("");
    const issueList = report.issues.map((issue) => `<li><button type="button" data-issue="${escapeHtml(issue.key)}"><strong>${escapeHtml(issue.effect)}</strong> at ${escapeHtml(issue.location)} <span>${escapeHtml(issue.origins.join(", "))}</span></button></li>`).join("");
    const diseaseLines = context.disease
      ? [context.disease.name && `${context.disease.name}${context.disease.caseTitle ? ` · ${context.disease.caseTitle}` : ""}`, context.disease.interpretation, context.disease.notice].filter(Boolean)
      : [];
    const isWhole = whole(view.effect);
    body.innerHTML = `
      <div class="case-ideo-issues"><h4>Read from the formula</h4>${diseaseLines.length ? `<ul>${diseaseLines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>` : ""}${issueList ? `<ul class="case-issue-list">${issueList}</ul>` : `<p class="muted">No gain, loss, or breakpoint could be read from the saved formula.</p>`}<p class="muted">${report.formula ? `Formula used: ${escapeHtml(report.formula)}` : "Save an ISCN draft to see what it names. Your own marks do not need one."}</p></div>
      <div class="genome-view"><div class="genome-legend"><span class="key your"></span> Your marks <span class="key read"></span> Read from the formula <span class="key sel"></span> Selected chromosome</div><div class="genome-scroll">${genome || `<p class="muted">Chromosome maps are not available.</p>`}</div></div>
      <div class="case-ideo-layout"><div class="case-ideo-row">${detail}</div>
        <div><form id="case-mark-form" class="case-mark-form" novalidate>
          <div class="case-mark-grid"><label>Chromosome<select name="chromosome">${CHROMOSOME_ORDER.map((id) => `<option value="${id}" ${view.chromosome === id ? "selected" : ""}>${id}</option>`).join("")}</select></label>
          <label>Change<select name="effect">${EFFECTS.map((effect) => `<option ${view.effect === effect ? "selected" : ""}>${effect}</option>`).join("")}</select></label></div>
          <p class="muted mark-whole" ${isWhole ? "" : "hidden"}>The whole of chromosome ${escapeHtml(view.chromosome)} will be marked. Add one mark per extra or missing copy.</p>
          <div class="case-mark-grid mark-range" ${isWhole ? "hidden" : ""}><label>From band<input name="from" maxlength="12" value="${escapeHtml(view.from)}" placeholder="p15.2"></label><label>To band<input name="to" maxlength="12" value="${escapeHtml(view.to)}" placeholder="pter, qter, or blank"></label></div>
          <p class="muted mark-hint" ${isWhole ? "hidden" : ""}>${escapeHtml(RANGE_HINTS[view.effect] || "Enter a band, or a range from one band to another.")} Click bands on the ideogram to fill From, then To.</p>
          <label>Note<input name="note" maxlength="160" value="${escapeHtml(view.note)}" placeholder="What you see"></label>
          <button class="button" type="submit" ${marks.length >= 40 ? "disabled" : ""}>Add mark</button>
          <p class="mark-error" role="alert">${escapeHtml(view.error)}</p>
        </form>
        <h4>Bands on chromosome ${escapeHtml(view.chromosome)}</h4><ul class="band-annotations">${bandList || `<li class="muted">No bands stored.</li>`}</ul></div></div>
      <h4>Identified marks</h4>${marksTable(chart())}
      <p class="muted case-ideo-actions">Your marks save automatically and appear in the case report.</p>`;

    body.querySelectorAll(".genome-ideogram [data-seg]").forEach((node) => node.addEventListener("click", () => selectBand(node.dataset.seg, node.dataset.chromosome)));
    body.querySelectorAll(".genome-ideogram text[data-chromosome]").forEach((node) => node.addEventListener("click", () => {
      readForm();
      view.chromosome = node.dataset.chromosome;
      view.selectedBand = "";
      view.from = "";
      view.to = "";
      view.error = "";
      persist();
      paint();
    }));
    body.querySelectorAll(".case-ideo-row [data-seg], [data-band]").forEach((node) => node.addEventListener("click", (event) => {
      const id = event.currentTarget.dataset.band || event.currentTarget.dataset.seg;
      if (id) selectBand(id, view.chromosome);
    }));
    body.querySelectorAll("[data-issue]").forEach((button) => button.addEventListener("click", () => {
      const issue = report.issues.find((item) => item.key === button.dataset.issue);
      if (!issue) return;
      readForm();
      view.chromosome = issue.chromosome;
      view.selectedBand = covered(issue)[0]?.id || "";
      view.error = "";
      persist();
      paint();
    }));
    const form = body.querySelector("#case-mark-form");
    form.elements.chromosome.addEventListener("change", (event) => {
      readForm();
      view.chromosome = event.target.value;
      view.selectedBand = "";
      view.from = "";
      view.to = "";
      persist();
      paint();
    });
    form.elements.effect.addEventListener("change", (event) => {
      view.effect = event.target.value;
      const isWholeNow = whole(view.effect);
      form.querySelector(".mark-whole").hidden = !isWholeNow;
      form.querySelector(".mark-range").hidden = isWholeNow;
      const hint = form.querySelector(".mark-hint");
      hint.hidden = isWholeNow;
      hint.textContent = `${RANGE_HINTS[view.effect] || "Enter a band, or a range from one band to another."} Click bands on the ideogram to fill From, then To.`;
      persist();
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      readForm();
      if (marks.length >= 40) return;
      const chromosome = view.chromosome;
      const mark = { id: `mark-${Date.now()}`, chromosome, effect: view.effect, note: view.note.trim().slice(0, 160) };
      if (whole(view.effect)) {
        mark.whole = true;
      } else {
        const from = resolveBand(context.maps, chromosome, view.from);
        if (from.error) { view.error = `From: ${from.error}`; paint(); return; }
        const to = view.to ? resolveBand(context.maps, chromosome, view.to) : null;
        if (to?.error) { view.error = `To: ${to.error}`; paint(); return; }
        mark.from = from.label;
        if (to && to.label !== from.label) mark.to = to.label;
      }
      mark.location = markLocation(mark);
      if (marks.some((item) => markLocation(item) === mark.location && item.effect === mark.effect && !whole(mark.effect))) {
        view.error = "That mark is already in the table.";
        paint();
        return;
      }
      marks = [...marks, mark];
      view.from = "";
      view.to = "";
      view.note = "";
      view.error = "";
      persist();
      paint();
    });
    body.querySelectorAll("[data-remove-mark]").forEach((button) => button.addEventListener("click", () => {
      marks = marks.filter((mark) => mark.id !== button.dataset.removeMark);
      persist();
      paint();
    }));
  }

  paint();
}

function marksTable(rows) {
  if (!rows.length) return `<p class="muted">No marks yet. The chart fills from the formula, the imported disease, and bands you highlight.</p>`;
  return `<table class="event-table case-mark-table"><thead><tr><th>Location</th><th>Chromosome</th><th>Effect</th><th>What was identified</th><th>Source</th><th></th></tr></thead><tbody>${rows.map((row) => `<tr><td>${escapeHtml(row.location)}</td><td>${escapeHtml(row.chromosome)}</td><td>${escapeHtml(row.effect)}</td><td>${escapeHtml(row.detail)}</td><td>${escapeHtml(row.source)}</td><td>${row.source === "Your mark" ? `<button class="button" type="button" data-remove-mark="${escapeHtml(row.id || "")}">Remove</button>` : ""}</td></tr>`).join("")}</tbody></table>`;
}

function mb(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return (number / 1e6).toFixed(1);
}

export function sortedCrops(current) {
  const images = current.images || [];
  const pieces = (current.sortedChromosomes || []).filter((piece) => piece.chromosome && piece.homolog);
  return Promise.all(pieces.map((piece) => cropUrl(images[piece.imageIndex]?.data, piece).then((url) => url ? { url, chromosome: piece.chromosome, homolog: piece.homolog } : null))).then((items) => items.filter(Boolean));
}

function cropUrl(data, piece) {
  if (!data) return Promise.resolve("");
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 80;
      canvas.height = 120;
      drawCrop(canvas.getContext("2d"), image, piece, 80, 120, { pad: 4 });
      resolve(canvas.toDataURL("image/png"));
    };
    image.onerror = () => resolve("");
    image.src = data;
  });
}
