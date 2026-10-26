import { DENVER_GROUPS, GROUP_OF, escapeHtml } from "./util.js";
import { identityColour } from "./karyogram-bench.js?v=20261026cs1";
import { cropRotation, drawCrop } from "./crop-draw.js?v=20261026cs1";

const SHEET_ROWS = [
  ["1", "2", "3", "4", "5"],
  ["6", "7", "8", "9", "10", "11", "12"],
  ["13", "14", "15", "16", "17", "18"],
  ["19", "20", "21", "22", "X", "Y"],
];
const COPIES = ["A", "B", "C", "D"];
const KNOWN = /^(?:[1-9]|1\d|2[0-2]|X|Y)$/;

function validPiece(piece) {
  return piece && Number.isInteger(piece.imageIndex) && [piece.x, piece.y, piece.width, piece.height].every(Number.isFinite) && piece.width > 0 && piece.height > 0;
}

export function patientKaryogramMarkup(current) {
  if (!current.images?.some((image) => /^data:image\/(png|jpeg|webp);base64,/i.test(image.data || ""))) return "";
  const images = current.images.filter((image) => /^data:image\/(png|jpeg|webp);base64,/i.test(image.data || ""));
  const objectMode = images.some((image) => image.generated);
  const intro = objectMode
    ? "This metaphase was generated from the teaching karyotype and band map. It is a demonstration graphic, not a microscope capture. Chromosomes are already separated. Click one on the image or in the strip, place it on its number, and turn it short arm up. Each chromosome keeps its identity behind the picture. A chromosome sent to the wrong number goes back where it was, and the right number stays hidden."
    : "Chromosomes are cut from the image into the strip below the karyogram. Find chromosomes cuts them automatically by contrast; drag a box to cut one yourself. Place each cut on its number and turn it short arm up.";
  const status = objectMode
    ? "Click a chromosome on the image or in the strip, then place it on its number."
    : "Press Find chromosomes, or drag a box around one chromosome in the image.";
  const viewNote = objectMode
    ? "Scroll over the picture to zoom toward the pointer. Click a chromosome to select it. Hold Space and drag to move the view. Brightness and contrast leave the saved image unchanged."
    : "Scroll over the picture to zoom toward the pointer. Drag to outline one chromosome. Hold Space and drag to move the view. Brightness and contrast leave the saved image unchanged.";
  const viewportLabel = objectMode
    ? "Metaphase image. Scroll to zoom, click a chromosome to select it, hold Space and drag to move."
    : "Metaphase image. Scroll to zoom, drag to outline a chromosome, hold Space and drag to move.";
  const cutButtons = objectMode
    ? ""
    : `<button type="button" class="btn primary" data-kg-action="autocut">Find chromosomes</button><button type="button" class="btn" data-kg-action="recut" title="Delete the cuts that are not placed yet and find the chromosomes again">Redo cuts</button>`;
  const help = objectMode
    ? "Click a chromosome on the image or in the strip. Drag it to its number, or select it and type the number (or X, Y). A chromosome sent to the wrong number goes back. R rotates, F flips. Short arm up."
    : "Cut a chromosome by dragging a box around it on the image. Then drag it from the strip to its number, or select it and type the number (or X, Y). R rotates, F flips. Short arm up.";
  return `<section class="patient-section patient-karyogram" id="patient-karyogram" data-case-id="${escapeHtml(current.id)}"${objectMode ? ' data-object-mode="1"' : ""}><header class="karyogram-heading"><div><p class="eyebrow">Metaphase review</p><h3>Examine chromosomes and compare homologs</h3><p>${intro}</p></div><span class="karyogram-image-count">${images.length} metaphase image${images.length === 1 ? "" : "s"}</span></header><div class="karyogram-tools"><span id="karyogram-status" role="status" class="muted">${status}</span><div class="karyogram-view-tools"><label>Brightness <input id="karyogram-brightness" type="range" min="60" max="160" step="5" value="100"><output id="karyogram-brightness-value">100%</output></label><label>Contrast <input id="karyogram-contrast" type="range" min="60" max="180" step="5" value="100"><output id="karyogram-contrast-value">100%</output></label><button type="button" class="button" id="karyogram-view-reset">Reset view</button><button type="button" class="button" id="karyogram-fullscreen">Full screen</button><span class="karyogram-view-note">${viewNote}</span></div></div><div class="karyogram-workbench"><div class="karyogram-image-column"><div class="karyogram-image-frame"><div class="karyogram-image-viewport" tabindex="0" aria-label="${viewportLabel}"><div class="karyogram-image-sizer"><div class="karyogram-image-stage"><img id="karyogram-source-image" alt="${objectMode ? "Generated demonstration metaphase, not a clinical specimen" : "Uploaded metaphase image for manual chromosome selection"}"><div id="karyogram-selection" aria-hidden="true"></div><div id="karyogram-marks" class="karyogram-marks"></div></div></div></div><div class="karyogram-zoom-bar" role="group" aria-label="Zoom"><button type="button" id="karyogram-zoom-out" aria-label="Zoom out">−</button><input id="karyogram-zoom" type="range" min="100" max="400" step="1" value="100" aria-label="Zoom level" aria-valuemin="100" aria-valuemax="400" aria-valuenow="100"><output id="karyogram-zoom-value" for="karyogram-zoom">Fit</output><button type="button" id="karyogram-zoom-in" aria-label="Zoom in">+</button><button type="button" class="karyogram-zoom-fit" id="karyogram-zoom-fit">Fit</button></div></div><nav class="karyogram-gallery" aria-label="Metaphase image gallery">${images.map((image, index) => `<button type="button" class="karyogram-thumbnail${index === 0 ? " on" : ""}" data-karyogram-image="${index}" aria-pressed="${index === 0}" aria-label="View metaphase image ${index + 1}${image.name ? `: ${escapeHtml(image.name)}` : ""}"><img src="${escapeHtml(image.data)}" alt=""><span>${escapeHtml(image.name || `M${index + 1}`)}</span></button>`).join("")}</nav></div><aside class="karyogram-rail"><h4>${objectMode ? "Chromosomes on the spread" : "Cut chromosomes on the spread"}</h4><div class="kb-aids"><label><input type="checkbox" id="karyogram-numbers" checked> Numbers</label><label><input type="checkbox" id="karyogram-colour" checked> Colour</label></div><p class="muted">Badges on the image show the number you gave each chromosome. They are your labels, not an answer. A grey badge is not placed yet.</p><h4>Selected <span id="karyogram-piece-count"></span></h4><div id="karyogram-selected" class="karyogram-selected"></div></aside></div><section class="karyogram-board-section" aria-labelledby="karyogram-board-title"><h4 id="karyogram-board-title">Karyogram</h4><div class="kb-toolbar karyogram-toolbar" role="toolbar" aria-label="Karyogram tools"><span class="kb-count" id="karyogram-count"></span>${cutButtons}<button type="button" class="btn" data-kg-action="undo">Undo</button><button type="button" class="btn" data-kg-action="rotate">Rotate 90°</button><button type="button" class="btn" data-kg-action="flip">Flip</button><button type="button" class="btn" data-kg-action="bump">Return to strip</button><span class="kb-typed" id="karyogram-typed" aria-live="polite"></span><span class="kb-help">${help}</span></div><div id="karyogram-sheet" class="kb-sheet karyogram-sheet"></div><div class="kb-strip karyogram-strip" data-kg-slot="" aria-label="Chromosomes not yet placed"><div class="kb-strip-body" id="karyogram-strip"></div><span class="kb-left" id="karyogram-left"></span></div><p class="muted">An empty number means you have not placed a chromosome there. It does not mean the chromosome is missing.</p></section><section class="karyogram-compare"><h4>Compare copies</h4><p class="muted">Label each chromosome with a number and a copy letter. Every labeled copy appears here, including a third or fourth copy.</p><div id="karyogram-comparisons" class="karyogram-comparisons"><p class="muted">Your comparisons will appear here as you label chromosomes.</p></div></section><p class="muted karyogram-save-note">Placements and labels save with this case. The original image remains unchanged.</p><div id="karyogram-toast" class="karyogram-toast" hidden role="status" aria-live="polite"></div></section>`;
}

export function bindPatientKaryogram(app, current) {
  const panel = app.querySelector("#patient-karyogram");
  if (!panel || panel.dataset.kgBound) return;
  panel.dataset.kgBound = "1";
  const images = current.images.filter((image) => /^data:image\/(png|jpeg|webp);base64,/i.test(image.data || ""));
  const source = panel.querySelector("#karyogram-source-image");
  const selection = panel.querySelector("#karyogram-selection");
  const stage = panel.querySelector(".karyogram-image-stage");
  const viewport = panel.querySelector(".karyogram-image-viewport");
  const frame = panel.querySelector(".karyogram-image-frame");
  const sizer = panel.querySelector(".karyogram-image-sizer");
  const zoom = panel.querySelector("#karyogram-zoom");
  const brightness = panel.querySelector("#karyogram-brightness");
  const contrast = panel.querySelector("#karyogram-contrast");
  const chromosomeLabels = [...Array(22)].map((_, index) => String(index + 1)).concat(["X", "Y"]);
  const objectMode = panel.dataset.objectMode === "1" || images.some((image) => image.generated);
  let start = null;
  let draft = null;
  let pan = null;
  let spaceDown = false;
  let pointerOver = false;
  let activeImageIndex = 0;
  let baseWidth = 0;
  let baseHeight = 0;
  let zoomPercent = 100;
  let layingOut = false;
  let pieces = Array.isArray(current.sortedChromosomes) ? current.sortedChromosomes.filter((piece) => validPiece(piece) && piece.imageIndex < images.length) : [];
  const synced = useObjectCuts(pieces, images);
  if (synced) {
    pieces = synced;
    current.sortedChromosomes = pieces;
    const allCases = JSON.parse(localStorage.getItem("cyto.patientCases") || "[]");
    localStorage.setItem("cyto.patientCases", JSON.stringify(allCases.map((item) => item.id === current.id ? { ...item, sortedChromosomes: pieces } : item)));
  }
  let selected = -1;
  let history = [];
  let typed = "";
  let typedTimer = null;
  let dragIndex = -1;
  let bounced = -1;
  const loaded = new Map();
  const imageFor = (index) => {
    if (!loaded.has(index)) loaded.set(index, new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = images[index]?.data || "";
    }));
    return loaded.get(index);
  };

  function canCut() {
    return !objectMode && !images[activeImageIndex]?.cuts?.length;
  }

  function hitPiece(at) {
    let best = -1;
    let bestArea = Infinity;
    pieces.forEach((piece, index) => {
      if (piece.imageIndex !== activeImageIndex) return;
      if (at.x < piece.x || at.y < piece.y || at.x > piece.x + piece.width || at.y > piece.y + piece.height) return;
      const area = piece.width * piece.height;
      if (area < bestArea) {
        bestArea = area;
        best = index;
      }
    });
    return best;
  }

  function fittedSize() {
    const naturalWidth = source.naturalWidth;
    const naturalHeight = source.naturalHeight;
    if (!naturalWidth || !naturalHeight || !viewport.clientWidth || !viewport.clientHeight) return null;
    const scale = Math.min(viewport.clientWidth / naturalWidth, viewport.clientHeight / naturalHeight);
    return { width: naturalWidth * scale, height: naturalHeight * scale };
  }

  function imageOrigin(width, height) {
    return {
      x: Math.max(0, (Math.max(viewport.clientWidth, width) - width) / 2),
      y: Math.max(0, (Math.max(viewport.clientHeight, height) - height) / 2)
    };
  }

  function paintViewReadout() {
    const fitted = zoomPercent <= 100;
    panel.querySelector("#karyogram-zoom-value").textContent = fitted ? "Fit" : `${zoomPercent}%`;
    zoom.value = String(zoomPercent);
    zoom.setAttribute("aria-valuenow", String(zoomPercent));
    zoom.setAttribute("aria-valuetext", fitted ? "Fit" : `${zoomPercent}%`);
    panel.querySelector("#karyogram-brightness-value").textContent = `${brightness.value}%`;
    panel.querySelector("#karyogram-contrast-value").textContent = `${contrast.value}%`;
  }

  function layoutImage() {
    if (!baseWidth || !baseHeight) return;
    const width = baseWidth * zoomPercent / 100;
    const height = baseHeight * zoomPercent / 100;
    sizer.style.setProperty("--stage-w", `${width}px`);
    sizer.style.setProperty("--stage-h", `${height}px`);
    source.style.filter = `brightness(${Number(brightness.value) / 100}) contrast(${Number(contrast.value) / 100})`;
    paintViewReadout();
  }

  function setZoom(nextPercent, anchor) {
    if (!baseWidth || !baseHeight) return;
    const prev = zoomPercent;
    const next = Math.max(100, Math.min(400, Math.round(nextPercent)));
    const rect = viewport.getBoundingClientRect();
    const ax = anchor?.x ?? rect.left + rect.width / 2;
    const ay = anchor?.y ?? rect.top + rect.height / 2;
    const prevWidth = baseWidth * prev / 100;
    const prevHeight = baseHeight * prev / 100;
    const origin = imageOrigin(prevWidth, prevHeight);
    const imageX = viewport.scrollLeft + (ax - rect.left) - origin.x;
    const imageY = viewport.scrollTop + (ay - rect.top) - origin.y;
    zoomPercent = next;
    layoutImage();
    const nextWidth = baseWidth * next / 100;
    const nextHeight = baseHeight * next / 100;
    const nextOrigin = imageOrigin(nextWidth, nextHeight);
    const ratio = prev ? next / prev : 1;
    viewport.scrollLeft = imageX * ratio - (ax - rect.left) + nextOrigin.x;
    viewport.scrollTop = imageY * ratio - (ay - rect.top) + nextOrigin.y;
  }

  function measureFit() {
    const fit = fittedSize();
    if (!fit || layingOut) return;
    if (Math.abs(fit.width - baseWidth) < 1 && Math.abs(fit.height - baseHeight) < 1) return;
    layingOut = true;
    const ratioX = viewport.scrollWidth ? viewport.scrollLeft / viewport.scrollWidth : 0;
    const ratioY = viewport.scrollHeight ? viewport.scrollTop / viewport.scrollHeight : 0;
    baseWidth = fit.width;
    baseHeight = fit.height;
    layoutImage();
    viewport.scrollLeft = ratioX * viewport.scrollWidth;
    viewport.scrollTop = ratioY * viewport.scrollHeight;
    layingOut = false;
  }

  function save(next, message = "Selections saved with this case.", { record = true } = {}) {
    if (record) history = [...history, pieces].slice(-40);
    pieces = next;
    if (selected >= pieces.length) selected = -1;
    current.sortedChromosomes = pieces;
    const allCases = JSON.parse(localStorage.getItem("cyto.patientCases") || "[]");
    localStorage.setItem("cyto.patientCases", JSON.stringify(allCases.map((item) => item.id === current.id ? { ...item, sortedChromosomes: pieces } : item)));
    panel.querySelector("#karyogram-status").textContent = message;
    paintPieces();
  }

  function badgeFill(piece) {
    return piece.chromosome && panel.querySelector("#karyogram-colour").checked ? identityColour(piece.chromosome) : "#5b6675";
  }

  function tile(index, width, height, where) {
    const piece = pieces[index];
    const label = piece.chromosome ? `Chromosome ${piece.chromosome}${piece.homolog ? `, copy ${piece.homolog}` : ""}` : `Cut chromosome ${index + 1}, not placed`;
    const turn = cropRotation(piece) ? `, turned ${cropRotation(piece)} degrees` : "";
    const badge = where === "strip" && panel.querySelector("#karyogram-numbers").checked ? `<span class="kb-badge" style="background:${badgeFill(piece)}">${index + 1}</span>` : "";
    return `<button type="button" class="chr-token kb-token${selected === index ? " selected" : ""}${bounced === index ? " bounced" : ""}" draggable="true" data-kg-piece="${index}" aria-pressed="${selected === index}" aria-label="${escapeHtml(label + turn)}">${badge}<canvas width="${width}" height="${height}" data-kg-canvas="${index}"></canvas></button>`;
  }

  function paintMarks() {
    const numbers = panel.querySelector("#karyogram-numbers").checked;
    panel.querySelector("#karyogram-marks").innerHTML = pieces.map((piece, index) => {
      if (piece.imageIndex !== activeImageIndex) return "";
      const label = `Chromosome ${index + 1}${piece.chromosome ? `, labeled ${escapeHtml(piece.chromosome)}` : ", not placed"}`;
      const text = numbers ? escapeHtml(piece.chromosome || "?") : "";
      return `<button type="button" class="karyogram-mark-box${selected === index ? " on" : ""}" style="left:${piece.x}%;top:${piece.y}%;width:${piece.width}%;height:${piece.height}%" data-kg-piece="${index}" aria-pressed="${selected === index}" aria-label="${label}"></button><span class="karyogram-mark${selected === index ? " on" : ""}${numbers ? "" : " dot"}" style="left:${piece.x + piece.width / 2}%;top:${piece.y + piece.height / 2}%;background:${badgeFill(piece)}" aria-hidden="true">${text}</span>`;
    }).join("");
  }

  function paintPieces() {
    const placed = pieces.filter((piece) => piece.chromosome).length;
    panel.querySelector("#karyogram-piece-count").textContent = pieces.length ? `(${pieces.length})` : "";
    panel.querySelector("#karyogram-count").textContent = `${placed}/${pieces.length}`;
    panel.querySelector("[data-kg-action=\"undo\"]").disabled = !history.length;
    ["rotate", "flip"].forEach((action) => { panel.querySelector(`[data-kg-action="${action}"]`).disabled = selected < 0; });
    panel.querySelector("[data-kg-action=\"bump\"]").disabled = !(selected >= 0 && pieces[selected]?.chromosome);
    const loose = pieces.map((piece, index) => ({ piece, index })).filter(({ piece }) => !piece.chromosome);
    panel.querySelector("#karyogram-strip").innerHTML = loose.map(({ index }) => tile(index, 70, 88, "strip")).join("") || `<p class="muted empty-pool">${pieces.length ? "Every chromosome is placed." : "No chromosomes on the strip yet."}</p>`;
    panel.querySelector("#karyogram-left").textContent = `${loose.length} left`;
    panel.querySelector("#karyogram-sheet").innerHTML = SHEET_ROWS.map((row) => `<div class="kb-row">${row.map((chromosome) => {
      const here = pieces.map((piece, index) => ({ piece, index })).filter(({ piece }) => piece.chromosome === chromosome)
        .sort((a, b) => COPIES.indexOf(a.piece.homolog) - COPIES.indexOf(b.piece.homolog));
      return `<div class="slot kb-slot" data-kg-slot="${chromosome}" tabindex="0" role="button" aria-label="${here.length ? `${here.length} placed in` : "Empty"} position ${chromosome}"><div class="slot-body">${here.map(({ index }) => tile(index, 46, 96, "sheet")).join("")}</div><p class="slot-num">${chromosome}</p></div>`;
    }).join("")}</div>`).join("");
    const piece = pieces[selected];
    panel.querySelector("#karyogram-selected").innerHTML = piece
      ? `<div class="karyogram-selected-card"><canvas width="140" height="200" data-kg-canvas="${selected}"></canvas><div><strong>Chromosome ${selected + 1}</strong><label>Chromosome<select data-piece-index="${selected}" data-piece-field="chromosome"><option value="">Not placed</option>${chromosomeLabels.map((name) => `<option value="${name}" ${piece.chromosome === name ? "selected" : ""}>${name}</option>`).join("")}</select></label><label>Copy<select data-piece-index="${selected}" data-piece-field="homolog"><option value="">None</option>${COPIES.map((name) => `<option value="${name}" ${piece.homolog === name ? "selected" : ""}>${name}</option>`).join("")}</select></label><small>${escapeHtml(images[piece.imageIndex]?.name || "Source image")}</small>${objectMode ? "" : `<button class="button" type="button" data-piece-remove="${selected}">Delete this cut</button>`}</div></div>`
      : `<p class="muted">Select a chromosome in the strip, the karyogram, or on the image.</p>`;
    const pairs = new Map();
    pieces.forEach((item, index) => {
      if (!item.chromosome || !item.homolog) return;
      const key = String(item.chromosome);
      if (!pairs.has(key)) pairs.set(key, {});
      pairs.get(key)[item.homolog] = index;
    });
    const comparisons = [...pairs.entries()].filter(([, homologs]) => COPIES.some((name) => homologs[name] != null));
    panel.querySelector("#karyogram-comparisons").innerHTML = comparisons.map(([chromosome, homologs]) => {
      const shown = COPIES.filter((name) => homologs[name] != null);
      return `<article class="karyogram-pair"><h5>Chromosome ${escapeHtml(chromosome)}</h5>${shown.map((name) => `<figure><canvas width="160" height="220" data-kg-canvas="${homologs[name]}" aria-label="Cut chromosome ${escapeHtml(chromosome)}, copy ${name}"></canvas><figcaption>Copy ${name}</figcaption></figure>`).join("")}</article>`;
    }).join("") || `<p class="muted">Place cut chromosomes on the karyogram to compare their copies here.</p>`;
    paintMarks();
    panel.querySelectorAll("canvas[data-kg-canvas]").forEach((canvas) => {
      const item = pieces[Number(canvas.dataset.kgCanvas)];
      if (!item) return;
      imageFor(item.imageIndex).then((image) => {
        if (image && canvas.isConnected) drawCrop(canvas.getContext("2d"), image, item, canvas.width, canvas.height, { pad: 4 });
      });
    });
  }

  function nextCopy(chromosome, except) {
    const used = new Set(pieces.filter((piece, index) => index !== except && piece.chromosome === chromosome).map((piece) => piece.homolog));
    return COPIES.find((name) => !used.has(name)) || "";
  }

  let toastTimer = null;

  function showToast(message, tone = "ok") {
    const toast = panel.querySelector("#karyogram-toast") || document.querySelector("#karyogram-toast");
    if (!toast) return;
    clearTimeout(toastTimer);
    toast.hidden = false;
    toast.dataset.tone = tone;
    toast.textContent = message;
    const status = panel.querySelector("#karyogram-status");
    if (status) status.textContent = message;
    toastTimer = window.setTimeout(() => { toast.hidden = true; }, 4200);
  }

  function placementHint(truth, attempted) {
    const truthGroup = GROUP_OF[String(truth)];
    const attemptGroup = GROUP_OF[String(attempted)];
    const denver = DENVER_GROUPS.find((group) => group.id === truthGroup);
    const shape = denver ? denver.subtitle.split("—")[0].trim().toLowerCase() : "its Denver group";
    if (truthGroup && attemptGroup && truthGroup !== attemptGroup) {
      return `Not ${attempted}. Check length and centromere position — this looks like ${shape} (group ${truthGroup}).`;
    }
    if (truthGroup) {
      return `Not ${attempted}. Stay in group ${truthGroup} and compare band pattern and arm ratio with the others there.`;
    }
    return `Not ${attempted}. Compare length, centromere position, and band pattern, then try again.`;
  }

  function place(index, chromosome, { advance = false } = {}) {
    const piece = pieces[index];
    if (!piece) return;
    if (!chromosome) {
      selected = index;
      save(pieces.map((item, i) => i === index ? { ...item, chromosome: "", homolog: "" } : item), `Chromosome ${index + 1} returned to the strip.`);
      return;
    }
    if (piece.chromosome === chromosome) return;
    const truth = knownTruth(piece, images);
    if (truth && chromosome !== truth) {
      bounced = index;
      showToast(placementHint(truth, chromosome), "wrong");
      paintPieces();
      window.setTimeout(() => { if (bounced === index) { bounced = -1; paintPieces(); } }, 700);
      return;
    }
    const homolog = nextCopy(chromosome, index);
    const next = pieces.map((item, i) => i === index ? { ...item, chromosome, homolog } : item);
    if (advance) {
      const loose = next.map((item, i) => ({ item, i })).filter(({ item }) => !item.chromosome);
      selected = (loose.find(({ i }) => i > index) || loose[0])?.i ?? -1;
    } else selected = index;
    save(next, homolog ? `Chromosome ${index + 1} placed at ${chromosome}, copy ${homolog}.` : `Chromosome ${index + 1} placed at ${chromosome}. Four copies are already there, so it has no copy letter.`);
    if (truth) showToast(homolog ? `Correct — placed at ${chromosome}, copy ${homolog}.` : `Correct — placed at ${chromosome}.`, "ok");
  }

  function turn(change) {
    if (selected < 0 || !pieces[selected]) return;
    const piece = pieces[selected];
    const next = change === "flip" ? { ...piece, flip: !piece.flip } : { ...piece, rot: (cropRotation(piece) + 90) % 360 };
    save(pieces.map((item, i) => i === selected ? next : item), change === "flip" ? "Flipped." : `Turned to ${next.rot} degrees.`);
  }

  function undo() {
    if (!history.length) return;
    const previous = history[history.length - 1];
    history = history.slice(0, -1);
    save(previous, "Undone.", { record: false });
  }

  function select(index) {
    selected = index;
    paintPieces();
  }

  function commitTyped() {
    clearTimeout(typedTimer);
    const value = typed;
    typed = "";
    panel.querySelector("#karyogram-typed").textContent = "";
    const number = Number(value);
    const target = selected >= 0 ? selected : pieces.findIndex((piece) => !piece.chromosome);
    if (target < 0) return;
    if (/^[XY]$/.test(value) || (number >= 1 && number <= 22)) place(target, /^[XY]$/.test(value) ? value : String(number), { advance: true });
  }

  const onKeys = (event) => {
    if (!panel.isConnected) { document.removeEventListener("keydown", onKeys); return; }
    const box = panel.getBoundingClientRect();
    if (!panel.offsetParent || box.bottom < 0 || box.top > window.innerHeight) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
    const key = event.key;
    if ((event.metaKey || event.ctrlKey) && key.toLowerCase() === "z") { event.preventDefault(); undo(); return; }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (/^[0-9]$/.test(key)) {
      event.preventDefault();
      clearTimeout(typedTimer);
      typed += key;
      panel.querySelector("#karyogram-typed").textContent = `Position ${typed}…`;
      if (typed.length >= 2 || Number(typed) >= 3) commitTyped();
      else if (Number(typed) === 0) { typed = ""; }
      else typedTimer = setTimeout(commitTyped, 700);
      return;
    }
    if (/^[xy]$/i.test(key)) { event.preventDefault(); typed = key.toUpperCase(); commitTyped(); return; }
    if (key === "Enter" && typed) { event.preventDefault(); commitTyped(); return; }
    if (/^r$/i.test(key)) { event.preventDefault(); turn("rotate"); return; }
    if (/^f$/i.test(key)) { event.preventDefault(); turn("flip"); return; }
    if ((key === "Delete" || key === "Backspace") && selected >= 0 && pieces[selected]?.chromosome) { event.preventDefault(); place(selected, ""); }
  };
  document.addEventListener("keydown", onKeys);

  function loadSource(imageIndex = activeImageIndex) {
    activeImageIndex = imageIndex;
    source.src = images[imageIndex]?.data || "";
    source.alt = images[imageIndex]?.generated ? "Generated demonstration metaphase, not a clinical specimen" : "Uploaded metaphase image for manual chromosome selection";
    panel.querySelector(".karyogram-image-stage")?.classList.toggle("is-select", !canCut());
    source.style.cursor = canCut() ? "crosshair" : "pointer";
    panel.querySelectorAll("[data-karyogram-image]").forEach((button, index) => {
      const active = index === imageIndex;
      button.classList.toggle("on", active);
      button.setAttribute("aria-pressed", String(active));
    });
    clearDraft();
    if (panel.querySelector("#karyogram-marks")) paintMarks();
  }

  function clearDraft() {
    start = null;
    draft = null;
    selection.style.display = "none";
    selection.style.left = "0";
    selection.style.top = "0";
    selection.style.width = "0";
    selection.style.height = "0";
  }

  function point(event) {
    const rect = source.getBoundingClientRect();
    return { x: Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100)), y: Math.max(0, Math.min(100, (event.clientY - rect.top) / rect.height * 100)) };
  }

  source.addEventListener("load", measureFit);
  const viewObserver = new ResizeObserver(() => {
    if (!panel.isConnected) { viewObserver.disconnect(); return; }
    measureFit();
  });
  viewObserver.observe(viewport);
  zoom.addEventListener("input", () => setZoom(Number(zoom.value)));
  panel.querySelector("#karyogram-zoom-in").addEventListener("click", () => setZoom(zoomPercent * 1.25));
  panel.querySelector("#karyogram-zoom-out").addEventListener("click", () => setZoom(zoomPercent / 1.25));
  panel.querySelector("#karyogram-zoom-fit").addEventListener("click", () => setZoom(100));
  panel.querySelectorAll("#karyogram-brightness, #karyogram-contrast").forEach((input) => input.addEventListener("input", layoutImage));
  frame.addEventListener("wheel", (event) => {
    if (!baseWidth) return;
    event.preventDefault();
    const intensity = Math.min(1.6, Math.abs(event.deltaY) / (event.deltaMode === 1 ? 1 : 100)) || 0.35;
    const factor = Math.pow(1.18, intensity);
    setZoom(event.deltaY > 0 ? zoomPercent / factor : zoomPercent * factor, { x: event.clientX, y: event.clientY });
  }, { passive: false });
  viewport.addEventListener("pointerenter", () => { pointerOver = true; });
  viewport.addEventListener("pointerleave", () => { pointerOver = false; });
  viewport.addEventListener("keydown", (event) => {
    if (event.key === "+" || event.key === "=") { event.preventDefault(); setZoom(zoomPercent * 1.25); }
    else if (event.key === "-" || event.key === "_") { event.preventDefault(); setZoom(zoomPercent / 1.25); }
    else if (event.key === "0") { event.preventDefault(); setZoom(100); }
  });
  const onSpaceDown = (event) => {
    if (!panel.isConnected) {
      window.removeEventListener("keydown", onSpaceDown);
      window.removeEventListener("keyup", onSpaceUp);
      return;
    }
    if (event.code !== "Space" || event.repeat || !pointerOver) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
    spaceDown = true;
    viewport.classList.add("is-pan");
    event.preventDefault();
  };
  const onSpaceUp = (event) => {
    if (!panel.isConnected) {
      window.removeEventListener("keydown", onSpaceDown);
      window.removeEventListener("keyup", onSpaceUp);
      return;
    }
    if (event.code !== "Space") return;
    spaceDown = false;
    if (!pan) viewport.classList.remove("is-pan");
  };
  window.addEventListener("keydown", onSpaceDown);
  window.addEventListener("keyup", onSpaceUp);
  panel.querySelector("#karyogram-view-reset").addEventListener("click", () => {
    brightness.value = "100";
    contrast.value = "100";
    setZoom(100);
  });
  const fullscreenButton = panel.querySelector("#karyogram-fullscreen");
  fullscreenButton.addEventListener("click", () => {
    if (!document.fullscreenElement) frame.requestFullscreen().catch(() => {
      panel.querySelector("#karyogram-status").textContent = "Full screen is not available in this browser.";
    });
    else document.exitFullscreen();
  });
  frame.addEventListener("fullscreenchange", () => {
    fullscreenButton.textContent = document.fullscreenElement === frame ? "Exit full screen" : "Full screen";
    measureFit();
  });
  source.addEventListener("pointerdown", (event) => {
    if (!source.complete || !source.naturalWidth) return;
    if (spaceDown || event.button === 1) {
      event.preventDefault();
      pan = { x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
      viewport.classList.add("is-pan", "is-panning");
      source.setPointerCapture(event.pointerId);
      return;
    }
    if (event.button !== 0) return;
    event.preventDefault();
    if (!canCut()) {
      const index = hitPiece(point(event));
      if (index >= 0) select(index);
      return;
    }
    if (pieces.length >= 50) return;
    source.setPointerCapture(event.pointerId);
    start = point(event);
    draft = { x: start.x, y: start.y, width: 0, height: 0 };
    selection.style.display = "block";
  });
  source.addEventListener("pointermove", (event) => {
    if (pan) {
      viewport.scrollLeft = pan.left - (event.clientX - pan.x);
      viewport.scrollTop = pan.top - (event.clientY - pan.y);
      return;
    }
    if (!start) return;
    const end = point(event);
    const rect = { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(start.x - end.x), height: Math.abs(start.y - end.y) };
    draft = rect;
    Object.assign(selection.style, { left: `${rect.x}%`, top: `${rect.y}%`, width: `${rect.width}%`, height: `${rect.height}%` });
  });
  source.addEventListener("pointerup", (event) => {
    if (pan) {
      pan = null;
      viewport.classList.remove("is-panning");
      if (!spaceDown) viewport.classList.remove("is-pan");
      if (source.hasPointerCapture(event.pointerId)) source.releasePointerCapture(event.pointerId);
      return;
    }
    if (!start || !draft) return;
    source.releasePointerCapture(event.pointerId);
    start = null;
    if (draft.width * source.naturalWidth / 100 < 8 || draft.height * source.naturalHeight / 100 < 8) {
      clearDraft();
      panel.querySelector("#karyogram-status").textContent = "Make a larger rectangle around one chromosome.";
      return;
    }
    const crop = { ...draft, imageIndex: activeImageIndex, chromosome: "", homolog: "" };
    clearDraft();
    selected = pieces.length;
    save([...pieces, crop], "Cut added to the strip. Drag it to its number, or type the number.");
  });
  panel.addEventListener("change", (event) => {
    const field = event.target.closest("[data-piece-field]");
    if (!field) return;
    const index = Number(field.dataset.pieceIndex);
    const key = field.dataset.pieceField;
    if (!pieces[index] || !["chromosome", "homolog"].includes(key)) return;
    if (key === "chromosome") { place(index, field.value); return; }
    const updated = pieces.map((piece, pieceIndex) => pieceIndex === index ? { ...piece, [key]: field.value } : piece);
    save(updated);
  });
  panel.addEventListener("click", (event) => {
    const thumbnail = event.target.closest("[data-karyogram-image]");
    if (thumbnail) {
      loadSource(Number(thumbnail.dataset.karyogramImage));
      return;
    }
    const remove = event.target.closest("[data-piece-remove]");
    if (remove) {
      selected = -1;
      save(pieces.filter((_, index) => index !== Number(remove.dataset.pieceRemove)), "Cut deleted.");
      return;
    }
    const action = event.target.closest("[data-kg-action]")?.dataset.kgAction;
    if (action === "autocut") { autoCut(activeImageIndex); return; }
    if (action === "recut") {
      const kept = pieces.filter((piece) => piece.chromosome || piece.imageIndex !== activeImageIndex);
      selected = -1;
      save(kept, "Cuts that were not placed were deleted.");
      autoCut(activeImageIndex);
      return;
    }
    if (action === "undo") { undo(); return; }
    if (action === "rotate" || action === "flip") { turn(action); return; }
    if (action === "bump") { if (selected >= 0) place(selected, ""); return; }
    const token = event.target.closest("[data-kg-piece]");
    if (token) { select(Number(token.dataset.kgPiece)); return; }
    const slot = event.target.closest("[data-kg-slot]");
    if (slot && selected >= 0 && slot.dataset.kgSlot) place(selected, slot.dataset.kgSlot);
  });
  panel.querySelectorAll("#karyogram-numbers, #karyogram-colour").forEach((input) => input.addEventListener("change", paintPieces));
  panel.addEventListener("dragstart", (event) => {
    const token = event.target.closest("[data-kg-piece]");
    if (!token) return;
    dragIndex = Number(token.dataset.kgPiece);
    event.dataTransfer.setData("text/plain", String(dragIndex));
    event.dataTransfer.effectAllowed = "move";
  });
  panel.addEventListener("dragover", (event) => {
    const zone = event.target.closest("[data-kg-slot]");
    if (!zone || dragIndex < 0) return;
    event.preventDefault();
    zone.classList.add("drag-over");
  });
  panel.addEventListener("dragleave", (event) => {
    const zone = event.target.closest("[data-kg-slot]");
    if (zone && !zone.contains(event.relatedTarget)) zone.classList.remove("drag-over");
  });
  panel.addEventListener("drop", (event) => {
    const zone = event.target.closest("[data-kg-slot]");
    if (!zone || dragIndex < 0) return;
    event.preventDefault();
    const index = dragIndex;
    dragIndex = -1;
    place(index, zone.dataset.kgSlot);
  });
  panel.addEventListener("dragend", () => {
    dragIndex = -1;
    panel.querySelectorAll(".drag-over").forEach((zone) => zone.classList.remove("drag-over"));
  });
  panel.addEventListener("keydown", (event) => {
    const slot = event.target.closest(".kb-slot[data-kg-slot]");
    if (slot && selected >= 0 && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      place(selected, slot.dataset.kgSlot);
    }
  });
  async function autoCut(imageIndex, { quiet = false } = {}) {
    const image = await imageFor(imageIndex);
    if (!image || !panel.isConnected) return;
    const recorded = Array.isArray(images[imageIndex]?.cuts) && images[imageIndex].cuts.length ? images[imageIndex].cuts : null;
    const found = (recorded || findChromosomes(image)).filter((box) => !pieces.some((piece) => piece.imageIndex === imageIndex && overlap(piece, box) > 0.3));
    const room = Math.max(0, 60 - pieces.length);
    const added = found.slice(0, room).map((box) => ({ x: box.x, y: box.y, width: box.width, height: box.height, imageIndex, chromosome: "", homolog: "", ...(KNOWN.test(String(box.truth || "")) ? { truth: String(box.truth) } : {}) }));
    if (!added.length) {
      if (!quiet) panel.querySelector("#karyogram-status").textContent = "No new chromosomes were found. Drag a box around any that were missed.";
      return;
    }
    selected = pieces.length;
    save([...pieces, ...added], `${added.length} chromosomes were cut from the image and put in the strip. Check each cut; drag a box to add any that were missed, and delete any that hold two chromosomes or debris.`);
  }

  loadSource();
  paintPieces();
  const autoKey = `cyto.autocut.${current.id}`;
  if (!pieces.length && images[0]?.generated && !localStorage.getItem(autoKey)) {
    localStorage.setItem(autoKey, "1");
    autoCut(0, { quiet: true });
  } else if (synced) {
    panel.querySelector("#karyogram-status").textContent = "Click a chromosome on the image or in the strip, then place it on its number.";
  }
}

/**
 * Replace every cut on a generated metaphase with the drawn chromosome boxes.
 * Older pixel-detection fragments are dropped, including halves that were already labeled.
 * A student label moves onto the matching whole chromosome when the box overlaps and the number matches.
 */
function useObjectCuts(pieces, images) {
  let next = pieces;
  let changed = false;
  images.forEach((image, imageIndex) => {
    const recorded = (image.cuts || []).filter((box) => box && [box.x, box.y, box.width, box.height].every(Number.isFinite) && box.width > 0 && box.height > 0 && KNOWN.test(String(box.truth || "")));
    if (!image.generated || !recorded.length) return;
    const onImage = next.filter((piece) => piece.imageIndex === imageIndex);
    const elsewhere = next.filter((piece) => piece.imageIndex !== imageIndex);
    const already = onImage.length === recorded.length
      && onImage.every((piece) => KNOWN.test(String(piece.truth || "")) && recorded.some((box) => String(box.truth) === String(piece.truth) && overlap(piece, box) > 0.7));
    if (already) return;
    const used = new Set();
    const rebuilt = recorded.map((box) => {
      let best = null;
      let bestScore = 0.35;
      onImage.forEach((piece, index) => {
        if (used.has(index)) return;
        const score = overlap(piece, box);
        if (score > bestScore) {
          bestScore = score;
          best = { piece, index };
        }
      });
      if (best) used.add(best.index);
      const prior = best?.piece;
      const truth = String(box.truth);
      const chromosome = prior?.chromosome && prior.chromosome === truth ? prior.chromosome : "";
      const homolog = chromosome ? prior.homolog || "" : "";
      return {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        imageIndex,
        truth,
        chromosome,
        homolog,
        ...([90, 180, 270].includes(prior?.rot) && chromosome ? { rot: prior.rot } : {}),
        ...(prior?.flip && chromosome ? { flip: true } : {}),
      };
    });
    next = [...elsewhere, ...rebuilt];
    changed = true;
  });
  return changed ? next : null;
}

function knownTruth(piece, images) {
  if (KNOWN.test(String(piece.truth || ""))) return String(piece.truth);
  const cuts = images[piece.imageIndex]?.cuts || [];
  let best = "";
  let bestOverlap = 0.45;
  for (const box of cuts) {
    if (!KNOWN.test(String(box.truth || ""))) continue;
    const amount = overlap(piece, box);
    if (amount > bestOverlap) { bestOverlap = amount; best = String(box.truth); }
  }
  return best;
}

function overlap(a, b) {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  return (w * h) / Math.min(a.width * a.height, b.width * b.height);
}

/**
 * Finds chromosome-shaped objects by contrast with the background. Pieces split by dark bands
 * are joined only when they lie end to end along the same axis, so side-by-side neighbours stay apart.
 * Returns boxes in percent of the image, in reading order. It does not identify chromosomes.
 */
export function findChromosomes(image, { threshold = 45 } = {}) {
  const scale = Math.min(1, 900 / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);
  const total = width * height;
  const lum = new Uint8Array(total);
  const counts = new Uint32Array(256);
  for (let i = 0; i < total; i += 1) {
    const value = Math.round(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]);
    lum[i] = value;
    counts[value] += 1;
  }
  let seen = 0;
  let median = 0;
  for (; median < 256; median += 1) {
    seen += counts[median];
    if (seen >= total / 2) break;
  }
  const fore = new Uint8Array(total);
  for (let i = 0; i < total; i += 1) fore[i] = Math.abs(lum[i] - median) > threshold ? 1 : 0;
  const grown = new Uint8Array(total);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!fore[y * width + x]) continue;
      for (let dy = -1; dy <= 1; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = x + dx;
          if (xx >= 0 && xx < width) grown[yy * width + xx] = 1;
        }
      }
    }
  }
  const label = new Uint8Array(total);
  const stack = [];
  let groups = [];
  for (let start = 0; start < total; start += 1) {
    if (!grown[start] || label[start]) continue;
    const g = { n: 0, sx: 0, sy: 0, sxx: 0, syy: 0, sxy: 0, minX: width, minY: height, maxX: 0, maxY: 0 };
    label[start] = 1;
    stack.push(start);
    while (stack.length) {
      const index = stack.pop();
      const x = index % width;
      const y = (index - x) / width;
      g.n += 1; g.sx += x; g.sy += y; g.sxx += x * x; g.syy += y * y; g.sxy += x * y;
      if (x < g.minX) g.minX = x;
      if (x > g.maxX) g.maxX = x;
      if (y < g.minY) g.minY = y;
      if (y > g.maxY) g.maxY = y;
      if (x > 0 && grown[index - 1] && !label[index - 1]) { label[index - 1] = 1; stack.push(index - 1); }
      if (x < width - 1 && grown[index + 1] && !label[index + 1]) { label[index + 1] = 1; stack.push(index + 1); }
      if (y > 0 && grown[index - width] && !label[index - width]) { label[index - width] = 1; stack.push(index - width); }
      if (y < height - 1 && grown[index + width] && !label[index + width]) { label[index + width] = 1; stack.push(index + width); }
    }
    if (g.n >= 6) groups.push(shape(g));
  }
  const gapLimit = Math.max(6, Math.max(width, height) * 0.022);
  let merged = true;
  while (merged) {
    merged = false;
    groups.sort((a, b) => b.n - a.n);
    outer: for (let i = 0; i < groups.length; i += 1) {
      for (let j = i + 1; j < groups.length; j += 1) {
        const a = groups[i];
        const b = groups[j];
        if (!joinable(a, b, gapLimit)) continue;
        groups[i] = shape(add(a, b));
        groups.splice(j, 1);
        merged = true;
        break outer;
      }
    }
  }
  const boxes = [];
  for (const g of groups) {
    const boxW = g.maxX - g.minX + 1;
    const boxH = g.maxY - g.minY + 1;
    if (g.n < total * 0.00012 || g.n > total * 0.06 || Math.max(boxW, boxH) < 10) continue;
    if (boxW > width * 0.5 || boxH > height * 0.5) continue;
    const pad = 3;
    const x0 = Math.max(0, g.minX - pad);
    const y0 = Math.max(0, g.minY - pad);
    const x1 = Math.min(width, g.maxX + 1 + pad);
    const y1 = Math.min(height, g.maxY + 1 + pad);
    boxes.push({ x: x0 / width * 100, y: y0 / height * 100, width: (x1 - x0) / width * 100, height: (y1 - y0) / height * 100 });
  }
  const row = 100 / 12;
  return boxes.sort((a, b) => Math.floor(a.y / row) - Math.floor(b.y / row) || a.x - b.x);
}

function add(a, b) {
  return {
    n: a.n + b.n, sx: a.sx + b.sx, sy: a.sy + b.sy, sxx: a.sxx + b.sxx, syy: a.syy + b.syy, sxy: a.sxy + b.sxy,
    minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY),
  };
}

/** Centroid, main axis, and rod length and width from pixel moments. */
function shape(g) {
  const cx = g.sx / g.n;
  const cy = g.sy / g.n;
  const vxx = g.sxx / g.n - cx * cx;
  const vyy = g.syy / g.n - cy * cy;
  const vxy = g.sxy / g.n - cx * cy;
  const spread = Math.sqrt(((vxx - vyy) / 2) ** 2 + vxy ** 2);
  const major = (vxx + vyy) / 2 + spread;
  const minor = Math.max(0, (vxx + vyy) / 2 - spread);
  const angle = 0.5 * Math.atan2(2 * vxy, vxx - vyy);
  const length = Math.sqrt(12 * major) || 1;
  const thick = Math.max(1, Math.sqrt(12 * minor));
  return { ...g, cx, cy, ux: Math.cos(angle), uy: Math.sin(angle), length, thick, rod: length / thick > 1.8 };
}

function joinable(a, b, gapLimit) {
  const axis = a.rod ? a : b.rod ? b : null;
  if (!axis) return false;
  if (a.rod && b.rod && Math.abs(a.ux * b.ux + a.uy * b.uy) < Math.cos(Math.PI / 12)) return false;
  const dx = b.cx - a.cx;
  const dy = b.cy - a.cy;
  const along = Math.abs(dx * axis.ux + dy * axis.uy);
  const across = Math.abs(-dx * axis.uy + dy * axis.ux);
  const thick = Math.max(a.thick, b.thick);
  if (across > thick * 0.6 + 1) return false;
  if (along - (a.length + b.length) / 2 > gapLimit) return false;
  const joined = shape(add(a, b));
  return joined.thick <= thick * 1.35 + 1;
}
