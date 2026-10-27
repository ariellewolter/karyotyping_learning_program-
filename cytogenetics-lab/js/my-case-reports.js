/**
 * My Case Reports: completed Draw and Casework items kept on this device,
 * with single or multi-select PDF export (one print dialog / one file).
 */
import { escapeHtml } from "./util.js?v=20261025lib1";
import { caseReportHTML, laboratoryLabel, metaphaseThumbs } from "./case-submission.js?v=20261026rep2";
import { sortedCrops } from "./case-report.js?v=20261026cs1";
import { state } from "./store.js?v=20261006j";
import { exportPrintablePDF } from "./print-export.js";

const STORE_KEY = "cyto.myCaseReports";
const MAX_ENTRIES = 80;

const KIND_LABEL = {
  draw: "Draw · formula report",
  karyotype: "Lab 1 · Karyotyping casework",
  fish: "Lab 2 · FISH casework",
};

function readStore() {
  try {
    const value = JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
    return Array.isArray(value) ? value.filter((item) => item && typeof item.id === "string") : [];
  } catch {
    return [];
  }
}

function writeStore(entries) {
  const trimmed = entries
    .slice()
    .sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || "")))
    .slice(0, MAX_ENTRIES);
  localStorage.setItem(STORE_KEY, JSON.stringify(trimmed));
  return trimmed;
}

function patientCases() {
  try {
    const value = JSON.parse(localStorage.getItem("cyto.patientCases") || "[]");
    return Array.isArray(value) ? value.filter((item) => item && typeof item.id === "string") : [];
  } catch {
    return [];
  }
}

function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function drawKey(formula) {
  return `draw:${String(formula || "").trim().toLowerCase()}`;
}

function caseworkKey(caseId) {
  return `case:${String(caseId || "")}`;
}

/** Upsert a Draw formula report into the portfolio. Persists across sessions. */
export function saveDrawReport({ formula, lineIndex = 0, title = "" } = {}) {
  const text = String(formula || "").trim();
  if (!text) return null;
  const key = drawKey(text);
  const entries = readStore();
  const existing = entries.find((item) => item.key === key);
  const entry = {
    id: existing?.id || newId("draw"),
    key,
    kind: "draw",
    lab: "draw",
    title: title || text,
    summary: text,
    formula: text,
    lineIndex: Number(lineIndex) || 0,
    savedAt: new Date().toISOString(),
    href: "#/lab/chromosome/draw",
  };
  writeStore([entry, ...entries.filter((item) => item.key !== key)]);
  return entry;
}

/** Upsert a submitted (or draft-exported) casework report. */
export function saveCaseworkReport(current, { draft = false } = {}) {
  if (!current?.id) return null;
  const submission = current.submission;
  if (!submission && !draft) return null;
  const key = caseworkKey(current.id);
  const entries = readStore();
  const existing = entries.find((item) => item.key === key);
  const lab = current.lab === "fish" ? "fish" : "karyotype";
  const label = current.label || submission?.caseLabel || "Untitled case";
  const entry = {
    id: existing?.id || newId(lab),
    key,
    kind: lab,
    lab,
    caseId: current.id,
    title: label,
    summary: [
      laboratoryLabel(lab),
      submission?.conclusions?.iscn || current.iscnDraft || "",
      draft && !submission ? "Draft" : "Submitted",
    ].filter(Boolean).join(" · "),
    draft: Boolean(draft && !submission),
    savedAt: submission?.submittedAt || new Date().toISOString(),
    href: `#/patients/${lab}/${encodeURIComponent(current.id)}/report`,
  };
  writeStore([entry, ...entries.filter((item) => item.key !== key)]);
  return entry;
}

/** Pull in any submitted patient cases that are not yet listed. */
function syncSubmittedCases(entries) {
  const known = new Set(entries.map((item) => item.key));
  const extras = [];
  for (const current of patientCases()) {
    if (!current.submission) continue;
    const key = caseworkKey(current.id);
    if (known.has(key)) continue;
    const lab = current.lab === "fish" ? "fish" : "karyotype";
    extras.push({
      id: newId(lab),
      key,
      kind: lab,
      lab,
      caseId: current.id,
      title: current.label || current.submission.caseLabel || "Untitled case",
      summary: [laboratoryLabel(lab), current.submission.conclusions?.iscn || current.iscnDraft || "", "Submitted"].filter(Boolean).join(" · "),
      draft: false,
      savedAt: current.submission.submittedAt || new Date().toISOString(),
      href: `#/patients/${lab}/${encodeURIComponent(current.id)}/report`,
    });
  }
  if (!extras.length) return entries;
  return writeStore([...extras, ...entries]);
}

export function listMyCaseReports() {
  return syncSubmittedCases(readStore());
}

export function removeMyCaseReport(id) {
  writeStore(readStore().filter((item) => item.id !== id));
}

function extractBody(html) {
  const match = String(html || "").match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return match ? match[1] : String(html || "");
}

function printShell(title, sections) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    body { font-family: Helvetica, Arial, sans-serif; color: #1c2430; margin: 24px; }
    h1 { font-size: 22px; margin: 4px 0 8px; } h2 { font-size: 15px; margin-top: 18px; border-bottom: 2px solid #1c2430; padding-bottom: 2px; }
    h3 { font-size: 13px; margin: 14px 0 4px; } h4, h5 { font-size: 12px; margin: 12px 0 4px; }
    p, li, td, th, dd, dt { font-size: 11px; line-height: 1.4; }
    .note, .muted { color: #526576; font-size: 10px; } .draft { color: #9a3412; font-weight: bold; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 6px; }
    th, td { border-bottom: 1px solid #d7d2c8; text-align: left; padding: 4px; vertical-align: top; }
    .block { white-space: pre-wrap; font-size: 12px; } code { font-family: ui-monospace, Menlo, monospace; font-size: 11px; }
    .ka-metrics { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0; padding: 0; }
    .ka-metrics div { border: 1px solid #e3e8ec; border-radius: 6px; padding: 4px 8px; min-width: 5.5rem; }
    .ka-metrics dt { margin: 0; color: #526576; font-size: 9px; text-transform: uppercase; letter-spacing: .03em; }
    .ka-metrics dd { margin: 0; font-weight: 600; font-size: 12px; }
    .cn-gain code { color: #2f8f5b; } .cn-loss code { color: #c0392b; } .cn-usual code { color: #6b7280; }
    .karyogram, .ka-plot, .genome { margin: 10px 0 14px; overflow: hidden; }
    .karyogram svg, .ka-plot svg, .genome svg, img, svg { max-width: 100%; height: auto; }
    .row { display: flex; flex-wrap: wrap; gap: 12px; align-items: end; }
    .pair span, .ideo-id figcaption span, .remake figcaption span { display: block; font-size: 10px; color: #526576; }
    img.crop { width: 48px; height: auto; background: #f4f4f2; }
    .remake { max-width: 200px; } .remake-why { font-size: 10px; line-height: 1.35; text-align: left; margin: 6px 0 0; }
    .remake-pair { display: flex; gap: 10px; align-items: end; border: 1px solid #d7d2c8; border-radius: 6px; padding: 6px; background: #fffefa; }
    .count-check { font-size: 12px; font-weight: 600; margin: 6px 0 10px; } .count-mismatch { color: #9a3412; font-weight: 700; }
    .karyogram-overview { display: grid; grid-template-columns: minmax(140px, 220px) 1fr; gap: 14px; align-items: start; margin: 8px 0 12px; }
    .metaphase-thumbs { display: flex; flex-direction: column; gap: 8px; } .metaphase-thumb img { width: 100%; height: auto; background: #f4f4f2; border: 1px solid #d7d2c8; }
    .assay-link { font-size: 12px; line-height: 1.4; }
    .iscn-karyogram { display: grid; gap: 6px; margin: 6px 0 10px; } .iscn-k-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: flex-end; }
    .iscn-k-group { padding: 4px 6px; border: 1px solid #d7d2c8; border-radius: 6px; background: #fffefa; }
    .iscn-k-group .group-label { margin: 0 0 2px; font-size: 9px; letter-spacing: .06em; text-transform: uppercase; color: #526576; }
    .iscn-k-slots { display: flex; flex-wrap: wrap; gap: 4px; align-items: flex-end; } .iscn-k-slot p { margin: 2px 0 0; text-align: center; font-size: 10px; }
    .iscn-k-body { display: flex; align-items: flex-end; justify-content: center; gap: 2px; } .iscn-k-changed { outline: 2px solid #6d5b94; outline-offset: 2px; border-radius: 4px; }
    .chr-svg, .chr-img { display: block; }
    .report-section { page-break-before: always; }
    .report-section:first-of-type { page-break-before: auto; }
    .report-banner { margin: 0 0 10px; padding-bottom: 6px; border-bottom: 1px solid #c5ced6; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @page { margin: 12mm; }
    @media print {
      body { margin: 0; }
      h2, h3, h4, h5 { break-after: avoid; }
      tr, figure, .row, .block, .ka-metrics, .karyogram, .ka-plot, .iscn-karyogram, .karyogram-overview, .remake-pair { break-inside: avoid; }
      .report-section { break-before: page; }
      .report-section:first-of-type { break-before: auto; }
    }
  </style></head><body>
    <p class="note">Educational portfolio from Cytogenetics Laboratory. Not a clinical report and not a diagnosis.</p>
    <h1>${escapeHtml(title)}</h1>
    <p class="note">Generated ${escapeHtml(new Date().toLocaleString())} · ${sections.length} ${sections.length === 1 ? "report" : "reports"}</p>
    ${sections.map((section, index) => `<section class="report-section"><header class="report-banner"><p class="note">Report ${index + 1} of ${sections.length} · ${escapeHtml(section.kindLabel)}</p><h2>${escapeHtml(section.title)}</h2></header>${section.body}</section>`).join("")}
  </body></html>`;
}

function openPrint(html, title = "My Case Reports") {
  const stem = String(title || "my-case-reports").replace(/[^\w.+-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "my-case-reports";
  return exportPrintablePDF(html, { title, defaultName: `${stem}.pdf` });
}

async function sectionForEntry(entry) {
  if (entry.kind === "draw") {
    const { formulaReportPrintHTML } = await import("./chromosome-workspace.js?v=20261026p6");
    const html = formulaReportPrintHTML({ formula: entry.formula, lineIndex: entry.lineIndex || 0 });
    return {
      title: entry.title || entry.formula || "Formula report",
      kindLabel: KIND_LABEL.draw,
      body: extractBody(html),
    };
  }
  const current = patientCases().find((item) => item.id === entry.caseId);
  if (!current) {
    return {
      title: entry.title || "Missing case",
      kindLabel: KIND_LABEL[entry.kind] || "Casework",
      body: `<p class="note">This case is no longer stored on this device. Open Casework and submit again to restore it.</p>`,
    };
  }
  const snapshot = current.submission || null;
  if (!snapshot) {
    return {
      title: entry.title || current.label || "Draft case",
      kindLabel: KIND_LABEL[entry.kind] || "Casework",
      body: `<p class="note">This case has not been submitted yet. Open the case report tab to submit or export a draft there.</p>`,
    };
  }
  const cropSource = { images: current.images, sortedChromosomes: snapshot.observations?.crops };
  const [crops, thumbs] = snapshot.lab === "fish"
    ? [[], []]
    : await Promise.all([sortedCrops(cropSource), metaphaseThumbs(current.images)]);
  const html = caseReportHTML(snapshot, { maps: state.maps, crops, thumbs, draft: false });
  return {
    title: entry.title || snapshot.caseLabel || "Case report",
    kindLabel: KIND_LABEL[entry.kind] || laboratoryLabel(snapshot.lab),
    body: extractBody(html),
  };
}

/** Export one or many portfolio entries as a single printable PDF. */
export async function exportMyCaseReportsPDF(entries) {
  const list = (entries || []).filter(Boolean);
  if (!list.length) return;
  const sections = [];
  for (const entry of list) sections.push(await sectionForEntry(entry));
  const title = list.length === 1 ? (list[0].title || "Case report") : `My Case Reports (${list.length})`;
  await openPrint(printShell(title, sections), title);
}

function formatWhen(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso || "";
  }
}

export function myCaseReportsHTML() {
  const entries = listMyCaseReports();
  const rows = entries.length
    ? entries.map((entry) => `<tr data-report-id="${escapeHtml(entry.id)}">
        <td><input type="checkbox" name="report" value="${escapeHtml(entry.id)}" aria-label="Select ${escapeHtml(entry.title)}"></td>
        <td><strong>${escapeHtml(entry.title)}</strong><div class="muted">${escapeHtml(KIND_LABEL[entry.kind] || entry.kind)}</div></td>
        <td>${escapeHtml(entry.summary || "")}</td>
        <td>${escapeHtml(formatWhen(entry.savedAt))}</td>
        <td class="mcr-row-actions">
          <button type="button" class="btn" data-mcr-open="${escapeHtml(entry.href || "")}">Open</button>
          <button type="button" class="button" data-mcr-export-one="${escapeHtml(entry.id)}">PDF</button>
          <button type="button" class="btn" data-mcr-remove="${escapeHtml(entry.id)}">Remove</button>
        </td>
      </tr>`).join("")
    : `<tr><td colspan="5"><p class="muted">No saved reports yet. Submit a Casework report, or on Draw use <strong>Save to My Case Reports</strong> (also saved when you export a formula PDF).</p></td></tr>`;
  return `<main class="picker lab-page mcr-page">
    <p class="crumb"><a href="#/">Home</a> / My Case Reports</p>
    <header class="lab-head">
      <p class="eyebrow">Saved on this device</p>
      <h2>My Case Reports</h2>
      <p class="lede">Select Draw formula reports and Casework you have finished. Export one PDF, or several together as a single file. Entries stay in this browser until you remove them.</p>
    </header>
    <section class="mcr" aria-label="Saved reports">
      <div class="mcr-toolbar">
        <div class="mcr-select">
          <button type="button" class="btn" data-mcr-select="all">Select all</button>
          <button type="button" class="btn" data-mcr-select="none">Clear</button>
          <span class="muted" data-mcr-count>0 selected</span>
        </div>
        <div class="mcr-actions">
          <button type="button" class="button primary" data-mcr-export-selected ${entries.length ? "" : "disabled"}>Export selected as one PDF</button>
        </div>
      </div>
      <div class="mcr-table-wrap">
        <table class="case-table mcr-table">
          <thead><tr><th scope="col">Select</th><th scope="col">Title</th><th scope="col">Summary</th><th scope="col">Saved</th><th scope="col">Actions</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="local-note">Stored only in this browser (localStorage). Clearing site data removes the list. Teaching answers are never included.</p>
    </section>
  </main>`;
}

function selectedEntries(host) {
  const ids = [...host.querySelectorAll('input[name="report"]:checked')].map((input) => input.value);
  const all = listMyCaseReports();
  return ids.map((id) => all.find((item) => item.id === id)).filter(Boolean);
}

function updateCount(host) {
  const n = host.querySelectorAll('input[name="report"]:checked').length;
  const label = host.querySelector("[data-mcr-count]");
  if (label) label.textContent = `${n} selected`;
  const exportBtn = host.querySelector("[data-mcr-export-selected]");
  if (exportBtn) exportBtn.disabled = n === 0;
}

function remountReports(root) {
  const page = root?.querySelector?.(".mcr-page") || root?.closest?.(".mcr-page");
  if (!page) return;
  const next = document.createElement("div");
  next.innerHTML = myCaseReportsHTML();
  const fresh = next.firstElementChild;
  page.replaceWith(fresh);
  bindMyCaseReports(document.getElementById("app"));
}

export function bindMyCaseReports(root) {
  const host = root?.querySelector?.(".mcr-page") || root;
  if (!host?.querySelector?.(".mcr")) return;
  host.addEventListener("change", (event) => {
    if (event.target.matches?.('input[name="report"]')) updateCount(host);
  });
  host.addEventListener("click", async (event) => {
    const select = event.target.closest("[data-mcr-select]");
    if (select) {
      const mode = select.getAttribute("data-mcr-select");
      host.querySelectorAll('input[name="report"]').forEach((input) => { input.checked = mode === "all"; });
      updateCount(host);
      return;
    }
    const open = event.target.closest("[data-mcr-open]");
    if (open) {
      const href = open.getAttribute("data-mcr-open");
      if (href) location.hash = href;
      return;
    }
    const remove = event.target.closest("[data-mcr-remove]");
    if (remove) {
      const id = remove.getAttribute("data-mcr-remove");
      if (!window.confirm("Remove this report from My Case Reports? The underlying casework on this device is not deleted.")) return;
      removeMyCaseReport(id);
      remountReports(host);
      return;
    }
    const one = event.target.closest("[data-mcr-export-one]");
    if (one) {
      const id = one.getAttribute("data-mcr-export-one");
      const entry = listMyCaseReports().find((item) => item.id === id);
      one.disabled = true;
      try { await exportMyCaseReportsPDF(entry ? [entry] : []); }
      finally { one.disabled = false; }
      return;
    }
    const many = event.target.closest("[data-mcr-export-selected]");
    if (many) {
      const picked = selectedEntries(host);
      if (!picked.length) return;
      many.disabled = true;
      try { await exportMyCaseReportsPDF(picked); }
      finally { updateCount(host); }
    }
  });
  updateCount(host);
}
