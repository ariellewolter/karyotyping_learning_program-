/**
 * Casework "Affected chromosomes" remake: pick a chromosome from the full set,
 * rebuild it by dragging bands (unused bands go to Lost), then optionally
 * make another. Student constructions are stored on the case; they are not graded.
 */
import { escapeHtml } from "./util.js?v=20261025lib1";
import { state } from "./store.js?v=20261006j";
import { CHROMOSOME_ORDER, initAssembly, shiftSelected } from "./banding.js?v=20261024c";
import { ideogramSVG, pieceChipSVG, stainLegendHTML } from "./ideogram.js?v=20261025ex1";

const WORK_KEY = "cyto.affectedWorkbench";

function pieceById(assembly, id) {
  return assembly.expected.find((piece) => piece.id === id);
}

function relocate(work, pieceId, dest, destIndex = null) {
  const tray = work.assembly.tray.filter((id) => id !== pieceId);
  const stack = work.assembly.stack.filter((id) => id !== pieceId);
  const lost = (work.lost || []).filter((id) => id !== pieceId);
  if (dest === "stack") {
    const next = [...stack];
    const index = destIndex == null || destIndex > next.length ? next.length : Math.max(0, destIndex);
    next.splice(index, 0, pieceId);
    return { ...work, lost, assembly: { ...work.assembly, tray, stack: next, selectedId: null } };
  }
  if (dest === "lost") {
    return { ...work, lost: [...lost, pieceId], assembly: { ...work.assembly, tray, stack, selectedId: null } };
  }
  return { ...work, lost, assembly: { ...work.assembly, tray: [...tray, pieceId], stack, selectedId: null } };
}

function readWorkbench() {
  try {
    return JSON.parse(sessionStorage.getItem(WORK_KEY) || "null");
  } catch {
    return null;
  }
}

function writeWorkbench(work) {
  try {
    if (work) sessionStorage.setItem(WORK_KEY, JSON.stringify(work));
    else sessionStorage.removeItem(WORK_KEY);
  } catch {
    /* storage unavailable */
  }
}

function startWorkbench(chromosome, seed = Date.now()) {
  const assembly = initAssembly(state.maps, {
    chromosome: String(chromosome),
    resolution: "region",
    transform: { type: "none" },
    reference_normal: true,
  }, seed);
  if (!assembly) return null;
  return { chromosome: String(chromosome), lost: [], assembly };
}

function pieceToken(assembly, id, stackIndex, zone) {
  const piece = pieceById(assembly, id);
  if (!piece) return "";
  const selected = assembly.selectedId === id ? " selected" : "";
  const connected = zone === "stack" ? " connected" : "";
  const label = piece.role === "centromere" ? "cen" : piece.label;
  return `<div class="piece-token${selected}${connected}" draggable="true" data-affected-piece="${escapeHtml(id)}" data-stack-index="${stackIndex ?? ""}" tabindex="0" role="button" aria-label="${escapeHtml(label)}">${pieceChipSVG(piece, { showLabels: true, connected: zone === "stack" })}</div>`;
}

function remakePreview(work) {
  const pieces = work.assembly.stack.map((id) => pieceById(work.assembly, id)).filter(Boolean);
  if (!pieces.length) return `<p class="muted drop-hint">Drop bands here<br/>pter at the top</p>`;
  return ideogramSVG(pieces, { width: 120, height: 420, showLabels: true, showRuler: false });
}

function galleryHTML(remakes) {
  if (!remakes.length) return "";
  return `<section class="affected-gallery" aria-label="Remade chromosomes">
    <h4>Your remakes</h4>
    <div class="affected-gallery-grid">${remakes.map((item) => {
      const pieces = (item.pieces || []).map((piece) => ({ ...piece }));
      const preview = pieces.length
        ? ideogramSVG(pieces, { width: 88, height: 280, showLabels: false, showRuler: false })
        : `<p class="muted">Empty</p>`;
      return `<figure class="affected-gallery-card" data-affected-open="${escapeHtml(item.chromosome)}">
        ${preview}
        <figcaption><strong>${escapeHtml(item.chromosome)}</strong>${item.lostCount ? `<span class="muted"> · ${item.lostCount} left unused</span>` : ""}</figcaption>
        <button type="button" class="btn" data-affected-redo="${escapeHtml(item.chromosome)}">Remake again</button>
      </figure>`;
    }).join("")}</div>
  </section>`;
}

function pickerHTML(current) {
  const remakes = Array.isArray(current.affectedRemakes) ? current.affectedRemakes : [];
  const done = new Set(remakes.map((item) => String(item.chromosome)));
  return `<div class="affected-picker">
    <p class="muted">From the metaphase, choose every chromosome that looks changed. Remake one at a time by dragging its bands into order. Put material that is missing from the abnormal copy into <strong>Lost</strong>. When that chromosome is done, choose <strong>Make another</strong> if you need more.</p>
    <div class="affected-chr-grid" role="list">${CHROMOSOME_ORDER.map((id) => {
      const finished = done.has(id);
      return `<button type="button" class="affected-chr-pick${finished ? " is-done" : ""}" data-affected-pick="${id}" role="listitem" aria-label="Remake chromosome ${id}${finished ? ", already remade" : ""}">${escapeHtml(id)}${finished ? "<span aria-hidden=\"true\">✓</span>" : ""}</button>`;
    }).join("")}</div>
    ${galleryHTML(remakes)}
    ${remakes.length ? `<p class="affected-remake-actions"><button type="button" class="button primary" data-affected-another>Make another chromosome</button></p>` : ""}
  </div>`;
}

function builderHTML(work) {
  const a = work.assembly;
  const chr = work.chromosome;
  return `<div class="affected-builder" data-affected-building="${escapeHtml(chr)}">
    <header class="affected-builder-head">
      <div>
        <p class="eyebrow">Remaking</p>
        <h4>Chromosome ${escapeHtml(chr)}</h4>
        <p class="muted">Order bands from pter (top) through the centromere to qter. Leave out bands that are missing on the abnormal copy by dropping them into Lost.</p>
      </div>
      <button type="button" class="btn" data-affected-cancel>Cancel</button>
    </header>
    <div class="assembly-stage three affected-assembly">
      <div>
        <p class="group-label">Available bands (${a.tray.length})</p>
        <div class="piece-tray" data-affected-drop="tray">${a.tray.map((id) => pieceToken(a, id, null, "tray")).join("") || "<p class='muted'>All bands are placed or lost.</p>"}</div>
        <p class="group-label">Lost / unused (${(work.lost || []).length})</p>
        <div class="piece-tray affected-lost" data-affected-drop="lost">${(work.lost || []).map((id) => pieceToken(a, id, null, "lost")).join("") || "<p class='drop-hint'>Drop deleted or unused bands here</p>"}</div>
      </div>
      <div class="ideo-column assembled">
        <p class="group-label">Build chromosome ${escapeHtml(chr)}</p>
        <div class="stack-col drop-target" data-affected-drop="stack">
          <div class="pole">pter · p arm</div>
          ${a.stack.map((id, index) => pieceToken(a, id, index, "stack")).join("") || "<p class='drop-hint'>Drop bands here<br/>pter at the top</p>"}
          <div class="pole">q arm · qter</div>
        </div>
        <div class="piece-nav">
          <button type="button" class="btn" data-affected-nav="up">Move up</button>
          <button type="button" class="btn" data-affected-nav="down">Move down</button>
          <button type="button" class="btn" data-affected-nav="to-stack">Add</button>
          <button type="button" class="btn" data-affected-nav="to-tray">Return</button>
          <button type="button" class="btn" data-affected-nav="to-lost">To Lost</button>
        </div>
      </div>
      <aside class="asm-help">
        <h3>Preview</h3>
        <div class="affected-preview">${remakePreview(work)}</div>
        ${stainLegendHTML(a.expected)}
        <p class="muted">This remake is your construction from the metaphase. It is not checked against an answer key.</p>
        <div class="affected-remake-actions">
          <button type="button" class="button primary" data-affected-save ${a.stack.length ? "" : "disabled"}>Save this remake</button>
        </div>
      </aside>
    </div>
  </div>`;
}

export function affectedChromosomesTabMarkup(current) {
  const work = readWorkbench();
  const building = work?.chromosome && work?.assembly ? builderHTML(work) : pickerHTML(current);
  return `<section class="patient-section case-affected" id="case-affected">
    <h3>Remake affected chromosomes</h3>
    ${building}
  </section>`;
}

function persistRemake(current, work, saveCase) {
  const pieces = work.assembly.stack.map((id) => pieceById(work.assembly, id)).filter(Boolean)
    .map((piece) => ({
      id: piece.id,
      label: piece.label,
      chromosome: piece.chromosome,
      arm: piece.arm,
      role: piece.role,
      stain: piece.stain,
      weight: piece.weight,
      orientation: piece.orientation || "forward",
    }));
  const entry = {
    chromosome: work.chromosome,
    stack: [...work.assembly.stack],
    lost: [...(work.lost || [])],
    lostCount: (work.lost || []).length,
    pieces,
    savedAt: new Date().toISOString(),
  };
  const previous = Array.isArray(current.affectedRemakes) ? current.affectedRemakes : [];
  const remakes = [entry, ...previous.filter((item) => String(item.chromosome) !== String(entry.chromosome))];
  saveCase({ affectedRemakes: remakes });
  writeWorkbench(null);
}

export function bindAffectedRemakes(app, current, { saveCase, refresh }) {
  const host = app?.querySelector("#case-affected");
  if (!host) return;

  const render = () => {
    host.outerHTML = affectedChromosomesTabMarkup(current);
    bindAffectedRemakes(app, current, { saveCase, refresh });
  };

  const withWork = (mutate) => {
    const work = readWorkbench();
    if (!work?.assembly) return;
    writeWorkbench(mutate(work));
    const panel = app.querySelector("#case-affected");
    if (panel) {
      panel.outerHTML = affectedChromosomesTabMarkup(current);
      bindAffectedRemakes(app, current, { saveCase, refresh });
    }
  };

  host.addEventListener("click", (event) => {
    const pick = event.target.closest("[data-affected-pick], [data-affected-redo]");
    if (pick) {
      const chromosome = pick.getAttribute("data-affected-pick") || pick.getAttribute("data-affected-redo");
      const work = startWorkbench(chromosome);
      if (!work) {
        window.alert("This chromosome could not be loaded from the band map.");
        return;
      }
      writeWorkbench(work);
      render();
      return;
    }
    if (event.target.closest("[data-affected-another]")) {
      writeWorkbench(null);
      render();
      host.querySelector(".affected-chr-grid")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      return;
    }
    if (event.target.closest("[data-affected-cancel]")) {
      writeWorkbench(null);
      render();
      return;
    }
    if (event.target.closest("[data-affected-save]")) {
      const work = readWorkbench();
      if (!work?.assembly?.stack?.length) return;
      persistRemake(current, work, saveCase);
      refresh();
      return;
    }
    const nav = event.target.closest("[data-affected-nav]");
    if (nav) {
      const action = nav.getAttribute("data-affected-nav");
      withWork((work) => {
        let next = work;
        const id = work.assembly.selectedId;
        if (action === "up") next = { ...work, assembly: shiftSelected(work.assembly, -1) };
        else if (action === "down") next = { ...work, assembly: shiftSelected(work.assembly, 1) };
        else if (action === "to-stack" && id) next = relocate(work, id, "stack");
        else if (action === "to-tray" && id) next = relocate(work, id, "tray");
        else if (action === "to-lost" && id) next = relocate(work, id, "lost");
        return next;
      });
      return;
    }
    const token = event.target.closest("[data-affected-piece]");
    if (token) {
      const id = token.getAttribute("data-affected-piece");
      withWork((work) => ({
        ...work,
        assembly: { ...work.assembly, selectedId: work.assembly.selectedId === id ? null : id },
      }));
    }
  });

  let dragId = null;
  host.addEventListener("dragstart", (event) => {
    const token = event.target.closest("[data-affected-piece]");
    if (!token) return;
    dragId = token.getAttribute("data-affected-piece");
    token.classList.add("dragging");
    event.dataTransfer.setData("text/plain", dragId);
    event.dataTransfer.effectAllowed = "move";
  });
  host.addEventListener("dragend", () => {
    host.querySelectorAll(".dragging, .drag-over").forEach((el) => el.classList.remove("dragging", "drag-over"));
    dragId = null;
  });
  host.addEventListener("dragover", (event) => {
    const zone = event.target.closest("[data-affected-drop]");
    if (!zone) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    zone.classList.add("drag-over");
  });
  host.addEventListener("dragleave", (event) => {
    const zone = event.target.closest("[data-affected-drop]");
    if (zone && !zone.contains(event.relatedTarget)) zone.classList.remove("drag-over");
  });
  host.addEventListener("drop", (event) => {
    const zone = event.target.closest("[data-affected-drop]");
    if (!zone) return;
    event.preventDefault();
    zone.classList.remove("drag-over");
    const id = dragId || event.dataTransfer.getData("text/plain");
    if (!id) return;
    const dest = zone.getAttribute("data-affected-drop");
    const onPiece = event.target.closest("[data-affected-piece]");
    const index = dest === "stack" && onPiece && onPiece.hasAttribute("data-stack-index")
      ? Number(onPiece.getAttribute("data-stack-index"))
      : null;
    withWork((work) => relocate(work, id, dest, Number.isFinite(index) ? index : null));
  });
}
