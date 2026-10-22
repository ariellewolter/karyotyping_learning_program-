/** Large ideogram rendering from ordered cytogenetic segments. */

export const STAIN = {
  0: "#fbf8ff",
  1: "#cfc4e2",
  2: "#8b7aad",
  3: "#514868",
  4: "#161222",
  5: "#2f4d86",
  6: "#c4a574",
};

const SHADE_NAMES = {
  0: "pale",
  1: "light",
  2: "medium",
  3: "dark",
  4: "solid",
  5: "variable",
  6: "stalk",
};

export function stainHex(stain) {
  return STAIN[stain] ?? STAIN[2];
}

export function relativeLuminance(hex) {
  const n = parseInt(String(hex || "").replace("#", ""), 16);
  if (Number.isNaN(n)) return 1;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export function stainLegendHTML(pieces) {
  const used = new Set();
  for (const piece of pieces || []) {
    for (const slice of bandSlices(piece)) used.add(slice.stain);
  }
  const shades = (used.size ? [...used] : [0, 1, 2, 3, 4]).filter((n) => SHADE_NAMES[n] != null).sort((a, b) => a - b);
  return `<p class="legend stain-legend" aria-label="G-band shades">${shades.map((n) => `<span><i class="swatch" style="background:${stainHex(n)}"></i>${SHADE_NAMES[n]}</span>`).join("")}</p>`;
}

export function ideogramSVG(pieces, options = {}) {
  const {
    width = 92,
    height = 520,
    showLabels = false,
    highlightId = null,
    showRuler = false,
    selectedId = null,
    marks = {},
  } = options;
  const list = pieces || [];
  const total = list.reduce((s, p) => s + (p.weight || 1), 0) || 1;
  const padTop = 18;
  const padBottom = 16;
  const usable = Math.max(80, height - padTop - padBottom);
  const heights = fitHeights(list, total, usable);
  const content = heights.reduce((s, h) => s + h, 0);
  let svgH = Math.max(height, padTop + content + padBottom);
  const cx = width / 2 + (highlightId ? 8 : 0);
  const barW = Math.min(54, width - (showRuler ? 48 : 28));
  const x = cx - barW / 2;
  let y = padTop;
  const parts = [];
  const seams = [];
  let hlBox = null;
  let labelCursor = padTop;
  parts.push(`<text x="${cx}" y="${padTop - 4}" text-anchor="middle" class="ideo-pole">pter</text>`);
  list.forEach((piece, index) => {
    const h = heights[index];
    const isCen = piece.role === "centromere";
    const w = isCen ? barW * 0.55 : barW;
    const px = cx - w / 2;
    const slices = bandSlices(piece);
    const moved = Boolean(piece.translocated || (piece.origin && piece.origin !== piece.chromosome));
    const hl = matchesHighlight(piece, highlightId);
    const sel = selectedId === piece.id;
    const rev = piece.orientation === "reverse";
    const lost = marks.missing?.includes(piece.id);
    const extra = marks.extra?.includes(piece.id);
    const inv = marks.inverted?.includes(piece.id);
    const xloc = marks.translocated?.includes(piece.id);
    const markStroke = lost ? "#8b2e2e" : extra || xloc ? "#6b3a2a" : inv ? "#1f4a56" : (hl || sel ? "#c9921a" : "#241c33");
    const markWidth = lost || extra || xloc || inv || hl || sel ? 2.2 : 1.15;
    if (hl) hlBox = { px, y, w, h };
    const sliceMarkup = paintSlices(slices, px, y, w, h, isCen);
    const stripe = moved ? `<rect x="${px}" y="${y}" width="4" height="${h}" fill="#6b3a2a"/>` : "";
    const wash = lost ? `<rect x="${px}" y="${y}" width="${w}" height="${h}" fill="#e8b4b4" opacity="0.4"/>` : "";
    let label = "";
    if (showLabels) {
      const prefer = y + Math.min(h / 2, 10) + 3;
      const ly = Math.max(prefer, labelCursor);
      labelCursor = ly + 12;
      const leader = Math.abs(ly - (y + h / 2)) > 7
        ? `<line x1="${px + w + 1}" y1="${y + h / 2}" x2="${x + barW + 6}" y2="${ly - 3}" stroke="#b7ad9a" stroke-width="0.6"/>`
        : "";
      label = `${leader}<text x="${x + barW + 8}" y="${ly}" class="ideo-lab${hl ? " hl" : ""}">${escapeXml(displayLabel(piece, showLabels))}</text>`;
    }
    parts.push(`<g class="ideo-seg${hl ? " hl" : ""}${sel ? " sel" : ""}${lost ? " missing" : ""}${extra || xloc ? " extra" : ""}${inv ? " inverted" : ""}" data-seg="${escapeAttr(piece.id)}">
      ${sliceMarkup}
      ${stripe}
      ${wash}
      <rect class="ideo-outline" x="${px}" y="${y}" width="${w}" height="${h}" rx="${isCen ? 7 : 0}" fill="none" stroke="${markStroke}" stroke-width="${markWidth}"/>
      ${rev ? `<path d="M${px + 4} ${y + h / 2} L${px + w - 4} ${y + 4} M${px + 4} ${y + h / 2} L${px + w - 4} ${y + h - 4}" stroke="#f6efe3" stroke-width="1.2" opacity="0.85"/>` : ""}
      ${label}
    </g>`);
    const next = list[index + 1];
    if (next) seams.push({ y: y + h, left: Math.min(px, cx - barW / 2), right: Math.max(px + w, cx + barW / 2), piece, next });
    y += h;
  });
  for (const seam of seams) {
    const top = edgeStain(seam.piece, "end");
    const bottom = edgeStain(seam.next, "start");
    const weight = boundaryWeight(seam.piece, seam.next);
    if (weight <= 0) continue;
    const color = ruleColor(stainHex(top), stainHex(bottom));
    parts.push(`<line x1="${seam.left}" y1="${seam.y}" x2="${seam.right}" y2="${seam.y}" stroke="${color}" stroke-width="${weight}"/>`);
  }
  if (hlBox) {
    const { px, y: hy, w, h } = hlBox;
    const mid = hy + h / 2;
    parts.push(`<rect class="ideo-hl-box" x="${px - 5}" y="${hy - 3}" width="${w + 10}" height="${h + 6}" rx="3"/>`);
    parts.push(`<polygon points="${px - 14},${mid} ${px - 5},${mid - 7} ${px - 5},${mid + 7}" fill="#c9921a"/>`);
    parts.push(`<text x="${px - 16}" y="${mid - 10}" text-anchor="end" class="ideo-hl-tag">name this</text>`);
  }
  const chromEnd = padTop + content;
  svgH = Math.max(svgH, chromEnd + padBottom, showLabels ? labelCursor + 8 : 0);
  parts.push(`<text x="${cx}" y="${chromEnd + 13}" text-anchor="middle" class="ideo-pole">qter</text>`);
  return `<svg class="ideo-svg" viewBox="0 0 ${width} ${svgH}" width="${width}" height="${svgH}" role="img" aria-label="Demonstration ideogram">
    ${parts.join("")}
  </svg>`;
}

function fitHeights(list, total, usable) {
  const natural = list.map((piece) => ((piece.weight || 1) / total) * usable);
  if (!natural.some((h) => h < 11)) return natural;
  const boosted = natural.map((h) => Math.max(11, h));
  const sum = boosted.reduce((s, h) => s + h, 0);
  if (sum <= usable) return boosted;
  const scale = usable / sum;
  return boosted.map((h) => h * scale);
}

function paintSlices(slices, x, y, w, h, isCen) {
  if (isCen) {
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="7" fill="#d8d3e6"/>`;
  }
  const sliceTotal = slices.reduce((s, slice) => s + slice.weight, 0) || 1;
  let sy = y;
  const marks = [];
  const body = slices.map((slice, index) => {
    const sh = (slice.weight / sliceTotal) * h;
    const fill = stainHex(slice.stain);
    const rect = `<rect x="${x}" y="${sy}" width="${w}" height="${Math.max(0.8, sh)}" fill="${fill}"/>`;
    const next = slices[index + 1];
    if (next && Math.abs(relativeLuminance(fill) - relativeLuminance(stainHex(next.stain))) < 0.2) {
      const yy = sy + sh;
      marks.push(`<line x1="${x}" y1="${yy}" x2="${x + w}" y2="${yy}" stroke="${ruleColor(fill, stainHex(next.stain))}" stroke-width="1.1"/>`);
    }
    sy += sh;
    return rect;
  }).join("");
  return body + marks.join("");
}

function bandSlices(piece) {
  const members = Array.isArray(piece.members) ? piece.members.filter((member) => member.role !== "centromere") : [];
  if (members.length > 1) {
    const ordered = piece.orientation === "reverse" ? [...members].reverse() : members;
    return ordered.map((member) => ({ stain: member.stain ?? 0, weight: Math.max(0.4, member.weight || 1) }));
  }
  return [{ stain: piece.stain ?? 0, weight: Math.max(0.4, piece.weight || 1) }];
}

function edgeStain(piece, which) {
  const slices = bandSlices(piece);
  const slice = which === "end" ? slices[slices.length - 1] : slices[0];
  return piece.role === "centromere" ? 0 : slice.stain;
}

function boundaryWeight(a, b) {
  if (!a || !b) return 0;
  if (a.role === "centromere" || b.role === "centromere") return 2.4;
  const regionA = `${a.chromosome || ""}${a.arm || ""}${a.region ?? ""}`;
  const regionB = `${b.chromosome || ""}${b.arm || ""}${b.region ?? ""}`;
  if (regionA !== regionB) return 2.5;
  if ((a.parent_region || a.id) !== (b.parent_region || b.id)) return 1.35;
  return 0.7;
}

function ruleColor(hexA, hexB) {
  return (relativeLuminance(hexA) + relativeLuminance(hexB)) / 2 > 0.55 ? "#241c33" : "#f6f1e8";
}

function matchesHighlight(piece, highlightId) {
  if (!highlightId) return false;
  const h = String(highlightId);
  if (piece.id === h || piece.label === h || piece.parent_region === h) return true;
  return (piece.members || []).some((m) => m.id === h || m.label === h || m.parent_region === h);
}

export function pieceChipSVG(piece, options = {}) {
  const showLabels = options.showLabels;
  const connected = options.connected;
  const isCen = piece.role === "centromere";
  const slices = isCen ? [{ stain: 0, weight: 1 }] : bandSlices(piece);
  const scaled = (piece.weight || 8) * 3.2;
  const base = isCen || piece.weight <= 2 ? Math.max(18, Math.min(24, scaled)) : Math.max(28, Math.min(72, scaled));
  const h = slices.length > 1 ? Math.max(base, Math.min(132, slices.length * 13)) : base;
  const w = 88;
  const rev = piece.orientation === "reverse";
  const rx = connected ? (isCen ? 8 : 0) : (isCen ? 10 : 3);
  const bodyW = isCen ? 48 : 72;
  const bodyX = isCen ? (w - bodyW) / 2 : 8;
  const bodyY = connected ? 0 : 2;
  const bodyH = connected ? h : h - 4;
  const moved = piece.translocated || (piece.origin && piece.origin !== piece.chromosome);
  const midFill = isCen ? "#d8d3e6" : sliceFillAt(slices, bodyH, bodyH / 2);
  const lightText = relativeLuminance(midFill) < 0.55;
  const join = connected
    ? `<line x1="${bodyX}" y1="0.6" x2="${bodyX + bodyW}" y2="0.6" stroke="#6d624c" stroke-width="1.4"/>`
    : "";
  return `<svg class="piece-svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">
    ${isCen
      ? `<rect x="${bodyX}" y="${bodyY}" width="${bodyW}" height="${bodyH}" rx="${rx}" fill="#d8d3e6"/>`
      : paintSlices(slices, bodyX, bodyY, bodyW, bodyH, false)}
    ${moved ? `<rect x="${bodyX}" y="${bodyY}" width="4" height="${bodyH}" fill="#6b3a2a"/>` : ""}
    <rect x="${bodyX}" y="${bodyY}" width="${bodyW}" height="${bodyH}" rx="${rx}" fill="none" stroke="#241c33" stroke-width="1"/>
    ${join}
    ${rev ? `<path d="M14 ${h / 2} L72 6 M14 ${h / 2} L72 ${h - 6}" stroke="#f6efe3" stroke-width="1.1"/>` : ""}
    ${showLabels ? `<text x="${w / 2}" y="${h / 2 + 4}" text-anchor="middle" font-size="11" class="piece-lab${lightText ? " on-dark" : ""}">${escapeXml(displayLabel(piece, showLabels))}</text>` : ""}
  </svg>`;
}

function sliceFillAt(slices, h, y) {
  const total = slices.reduce((s, slice) => s + slice.weight, 0) || 1;
  let acc = 0;
  for (const slice of slices) {
    acc += (slice.weight / total) * h;
    if (y <= acc) return stainHex(slice.stain);
  }
  return stainHex(slices[slices.length - 1]?.stain);
}

function displayLabel(piece, mode) {
  if (piece.role === "centromere" || piece.arm === "cen") return "cen";
  if (!mode) return "";
  return piece.label || piece.id || "";
}

function escapeAttr(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function escapeXml(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
}
