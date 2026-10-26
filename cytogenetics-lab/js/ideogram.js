/** Large ideogram rendering from ordered cytogenetic segments. */

export const STAIN = {
  0: "#f7f7f5",
  1: "#d9d9d7",
  2: "#a2a2a0",
  3: "#595957",
  4: "#1f2020",
  5: "#7c8081",
  6: "#ccccca",
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

const ORIGIN_PALETTE = {
  1: "#c0392b", 2: "#d35400", 3: "#b7950b", 4: "#7d8c1e", 5: "#27ae60", 6: "#138d75",
  7: "#1f8fa6", 8: "#2471a3", 9: "#2e4fa8", 10: "#6c3fb0", 11: "#8e44ad", 12: "#a93276",
  13: "#c2185b", 14: "#9c5b2e", 15: "#5d6d1e", 16: "#1e8449", 17: "#117a65", 18: "#0e6880",
  19: "#1a5276", 20: "#4a3c8c", 21: "#7b3f8c", 22: "#b03a5b", X: "#a04000", Y: "#34495e",
};

/** Colour that identifies a chromosome of origin in origin-coloured drawings. */
export function originHex(chromosome) {
  return ORIGIN_PALETTE[String(chromosome || "").toUpperCase()] || "#7f8c8d";
}

function mixHex(a, b, amount) {
  const parse = (hex) => {
    const n = parseInt(String(hex).replace("#", ""), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const mix = (x, y) => Math.round(x + (y - x) * amount).toString(16).padStart(2, "0");
  return `#${mix(ar, br)}${mix(ag, bg)}${mix(ab, bb)}`;
}

const UNKNOWN_FILL = "#e9e3f1";
const HSR_FILL = "#bdb2d3";

function sliceFill(slice, style = {}) {
  if (slice.unknown) return slice.label === "hsr" ? HSR_FILL : UNKNOWN_FILL;
  const stain = stainHex(slice.stain);
  if (style.colorMode !== "origin") return stain;
  return mixHex(originHex(slice.origin), stain, 0.42);
}

function sliceTitle(slice) {
  const label = slice.label || "";
  if (!label) return "";
  if (slice.unknown) {
    return `<title>${slice.label === "hsr" ? "hsr · homogeneously staining region · length and content not known" : "Material of unknown origin · length not known"}</title>`;
  }
  const origin = slice.origin ? ` · chromosome ${slice.origin} material` : "";
  const reversed = slice.reversed ? " · reversed" : "";
  return `<title>${escapeXml(`${label}${origin}${reversed}`)}</title>`;
}

/** Legend for origin-coloured drawings. */
export function originLegendHTML(chromosomes) {
  const ids = [...new Set((chromosomes || []).map(String).filter(Boolean))];
  if (!ids.length) return "";
  return `<p class="legend origin-legend" aria-label="Chromosome of origin">${ids.map((id) => `<span><i class="swatch" style="background:${originHex(id)}"></i>${escapeXml(id)}</span>`).join("")}</p>`;
}

/** Chromosomes of origin present in a drawn piece list, in drawing order. */
export function originsOf(pieces) {
  return [...new Set((pieces || []).filter((piece) => piece.role !== "centromere").map((piece) => String(piece.origin || piece.chromosome || "")).filter(Boolean))];
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
    highlightIds = null,
    highlightTag = true,
    showRuler = false,
    selectedId = null,
    marks = {},
    barWidth = 54,
    colorMode = "banding",
    bandInfo = false,
  } = options;
  const style = { colorMode, bandInfo };
  const list = pieces || [];
  const total = list.reduce((s, p) => s + (p.weight || 1), 0) || 1;
  const padTop = 18;
  const padBottom = 16;
  const usable = Math.max(80, height - padTop - padBottom);
  const heights = fitHeights(list, total, usable);
  const content = heights.reduce((s, h) => s + h, 0);
  let svgH = Math.max(height, padTop + content + padBottom);
  const highlights = [highlightId, ...(highlightIds || [])].filter(Boolean);
  const cx = width / 2 + (highlights.length ? 8 : 0);
  const barW = Math.min(barWidth, width - (showRuler ? 48 : 28));
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
    const hl = highlights.some((id) => matchesHighlight(piece, id));
    const sel = selectedId === piece.id;
    const rev = piece.orientation === "reverse";
    const lost = marks.missing?.includes(piece.id);
    const extra = marks.extra?.includes(piece.id);
    const inv = marks.inverted?.includes(piece.id);
    const xloc = marks.translocated?.includes(piece.id);
    const markStroke = lost ? "#8b2e2e" : extra || xloc ? "#6b3a2a" : inv ? "#1f4a56" : (hl || sel ? "#c9921a" : "#241c33");
    const markWidth = lost || extra || xloc || inv || hl || sel ? 2.2 : 1.15;
    if (hl) hlBox = { px, y, w, h };
    const sliceMarkup = paintSlices(slices, px, y, w, h, isCen, style);
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
  if (hlBox && highlightTag && highlights.length === 1) {
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

function paintSlices(slices, x, y, w, h, isCen, style = {}) {
  if (isCen) {
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="7" fill="#d8d3e6"/>`;
  }
  const sliceTotal = slices.reduce((s, slice) => s + slice.weight, 0) || 1;
  let sy = y;
  const marks = [];
  const body = slices.map((slice, index) => {
    const sh = (slice.weight / sliceTotal) * h;
    const fill = sliceFill(slice, style);
    const info = style.bandInfo && slice.label;
    const rect = info
      ? `<rect x="${x}" y="${sy}" width="${w}" height="${Math.max(0.8, sh)}" fill="${fill}" data-band="${escapeAttr(slice.label)}">${sliceTitle(slice)}</rect>`
      : `<rect x="${x}" y="${sy}" width="${w}" height="${Math.max(0.8, sh)}" fill="${fill}"/>`;
    if (slice.unknown) {
      for (let dash = sy + 2.5; dash < sy + sh - 1; dash += 3.5) {
        marks.push(`<line x1="${x}" y1="${dash.toFixed(1)}" x2="${x + w}" y2="${dash.toFixed(1)}" stroke="#7a6a9c" stroke-width="0.7" stroke-dasharray="2 2"/>`);
      }
    }
    const next = slices[index + 1];
    const nextFill = next ? sliceFill(next, style) : "";
    if (next && Math.abs(relativeLuminance(fill) - relativeLuminance(nextFill)) < 0.2) {
      const yy = sy + sh;
      marks.push(`<line x1="${x}" y1="${yy}" x2="${x + w}" y2="${yy}" stroke="${ruleColor(fill, nextFill)}" stroke-width="1.1"/>`);
    }
    sy += sh;
    return rect;
  }).join("");
  return body + marks.join("");
}

function bandSlices(piece) {
  const members = !piece.collapsed && Array.isArray(piece.members) ? piece.members.filter((member) => member.role !== "centromere") : [];
  const reversed = piece.orientation === "reverse";
  if (members.length > 1) {
    const ordered = reversed ? [...members].reverse() : members;
    return ordered.map((member) => ({
      stain: member.stain ?? 0,
      weight: Math.max(0.4, member.weight || 1),
      label: member.label || member.id || "",
      origin: String(member.origin || member.chromosome || piece.origin || piece.chromosome || ""),
      reversed,
      unknown: member.role === "unknown",
    }));
  }
  return [{
    stain: piece.stain ?? 0,
    weight: Math.max(0.4, piece.weight || 1),
    label: piece.label || piece.id || "",
    origin: String(piece.origin || piece.chromosome || ""),
    reversed,
    unknown: piece.role === "unknown",
  }];
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

function coversLabel(query, label) {
  const q = String(query || "").replace(/\s+/g, "");
  const lab = String(label || "").replace(/\s+/g, "");
  if (!q || !lab) return false;
  if (q === lab) return true;
  if (!lab.startsWith(q)) return false;
  const extra = lab.slice(q.length);
  if (extra.startsWith(".")) return true;
  return q.includes(".") && /^\d+$/.test(extra);
}

function matchesHighlight(piece, highlightId) {
  if (!highlightId) return false;
  const h = String(highlightId);
  const values = [piece.id, piece.label, piece.parent_band, piece.parent_region];
  if (values.some((value) => value === h || coversLabel(h, value))) return true;
  return (piece.members || []).some((member) => (
    [member.id, member.label, member.parent_band, member.parent_region].some((value) => value === h || coversLabel(h, value))
  ));
}

export function pieceChipSVG(piece, options = {}) {
  const showLabels = options.showLabels;
  const connected = options.connected;
  const isCen = piece.role === "centromere";
  const slices = isCen ? [{ stain: 0, weight: 1 }] : bandSlices(piece);
  const units = displayUnits(piece.weight);
  const scaled = units * 6;
  const base = isCen || units <= 2 ? Math.max(18, Math.min(24, scaled)) : Math.max(22, Math.min(72, scaled));
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

function displayUnits(weight) {
  const value = Number(weight) || 1;
  if (value > 500) return value / 1e6;
  return value;
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

let figureSerial = 0;

/** Metaphase chromosome drawn from band coordinates. Height follows total segment weight. */
export function metaphaseChromosomeSVG(pieces, options = {}) {
  const list = pieces || [];
  if (options.realistic) return realisticMetaphaseSVG(list, options);
  const scale = options.scale || 1;
  const total = list.reduce((sum, piece) => sum + (piece.weight || 1), 0) || 1;
  const reference = options.referenceBp || total;
  const bodyH = Math.max(28, (total / reference) * 210 * scale);
  const widthScale = Math.max(1, Math.min(2, Number(options.widthScale) || 1));
  const cw = Math.max(7, Math.round(8 * Math.min(scale, 2.2) * widthScale));
  const gap = Math.max(2, Math.round(3 * Math.min(scale, 2) * widthScale));
  const padX = Math.max(2, Math.round(2 * Math.min(scale, 1.6)));
  const padY = 2;
  const cenAt = list.findIndex((piece) => piece.role === "centromere" || piece.arm === "cen");
  let before = 0;
  for (let index = 0; index < Math.max(0, cenAt); index += 1) before += list[index].weight || 0;
  const cenWeight = cenAt >= 0 ? (list[cenAt].weight || 0) : 0;
  const cenFrac = cenAt >= 0 ? (before + cenWeight / 2) / total : 0.45;
  const top = padY;
  const cenY = top + bodyH * cenFrac;
  const bot = top + bodyH;
  const leftWidth = options.texture ? cw * 0.94 : cw;
  const rightWidth = options.texture ? cw * 0.9 : cw;
  const leftX = padX + (cw - leftWidth) / 2;
  const rightX = padX + cw + gap + (cw - rightWidth) / 2;
  const svgW = rightX + rightWidth + padX + (options.showLabels ? 54 : 0);
  const svgH = bot + padY;
  const stroke = scale >= 1.6 ? 1.1 : 0.85;
  const left = chromatidPath(leftX, cenY, cenY - top, bot - cenY, leftWidth);
  const right = chromatidPath(rightX, cenY, cenY - top, bot - cenY, rightWidth);
  const serial = figureSerial;
  figureSerial += 1;
  const grainId = `chrGrain${serial}`;
  const shadeId = `chrShade${serial}`;
  let y = top;
  const bands = list.map((piece) => {
    const h = ((piece.weight || 1) / total) * bodyH;
    const row = { piece, y, h };
    y += h;
    return row;
  });
  const style = { colorMode: options.colorMode, bandInfo: options.bandInfo };
  const paint = (x, width, info) => bands.map((row) => {
    if (row.piece.role === "centromere") return "";
    return paintSlices(bandSlices(row.piece), x, row.y, width, row.h, false, { ...style, bandInfo: style.bandInfo && info });
  }).join("");
  const labels = options.showLabels ? bands.map((row) => {
    if (row.h < 9 || row.piece.role === "centromere") return "";
    return `<text x="${rightX + rightWidth + 4}" y="${row.y + Math.min(row.h, 11)}" class="ideo-lab">${escapeXml(displayLabel(row.piece, true))}</text>`;
  }).join("") : "";
  const midX = (leftX + leftWidth / 2 + rightX + rightWidth / 2) / 2;
  return `<svg class="chr-svg" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" role="img" aria-label="G-band ideogram">
    <defs>
      <clipPath id="chrL${serial}"><path d="${left}"/></clipPath>
      <clipPath id="chrR${serial}"><path d="${right}"/></clipPath>
      ${options.texture ? `<filter id="${grainId}" x="-20%" y="-5%" width="140%" height="110%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.34" numOctaves="3" seed="${serial % 19 + 1}" result="grain"/><feColorMatrix in="grain" type="saturate" values="0" result="grayGrain"/><feComponentTransfer in="grayGrain" result="softGrain"><feFuncA type="table" tableValues="0 0.18"/></feComponentTransfer><feBlend in="SourceGraphic" in2="softGrain" mode="multiply"/></filter><linearGradient id="${shadeId}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#111820" stop-opacity=".24"/><stop offset=".2" stop-color="#fff" stop-opacity=".12"/><stop offset=".52" stop-color="#fff" stop-opacity=".24"/><stop offset=".82" stop-color="#101820" stop-opacity=".12"/><stop offset="1" stop-color="#101820" stop-opacity=".28"/></linearGradient>` : ""}
    </defs>
    <path d="${left}" fill="#f7f4fb" stroke="#241c33" stroke-width="${stroke}"/>
    <path d="${right}" fill="#f7f4fb" stroke="#241c33" stroke-width="${stroke}"/>
    <g clip-path="url(#chrL${serial})"${options.texture ? ` filter="url(#${grainId})"` : ""}>${paint(leftX, leftWidth, true)}</g>
    <g clip-path="url(#chrR${serial})"${options.texture ? ` filter="url(#${grainId})"` : ""}>${paint(rightX, rightWidth, true)}</g>
    ${options.texture ? `<g clip-path="url(#chrL${serial})"><rect x="${leftX}" y="${top}" width="${leftWidth}" height="${bodyH}" fill="url(#${shadeId})"/></g><g clip-path="url(#chrR${serial})"><rect x="${rightX}" y="${top}" width="${rightWidth}" height="${bodyH}" fill="url(#${shadeId})"/></g>` : ""}
    <ellipse cx="${midX}" cy="${cenY}" rx="${cw * 0.92}" ry="${Math.max(2.2, 2.1 * Math.min(scale, 1.8))}" fill="#d8d3e6" stroke="#3a3450" stroke-width="${stroke}"/>
    ${extraCentromeres(bands, cenAt).map((y) => `<ellipse cx="${midX}" cy="${y}" rx="${cw * 0.92}" ry="${Math.max(2.2, 2.1 * Math.min(scale, 1.8))}" fill="#d8d3e6" stroke="#3a3450" stroke-width="${stroke}"/>`).join("")}
    ${labels}
  </svg>`;
}

function realisticMetaphaseSVG(list, options) {
  const scale = options.scale || 1;
  const total = list.reduce((sum, piece) => sum + (piece.weight || 1), 0) || 1;
  const reference = options.referenceBp || total;
  const bodyH = Math.max(36, (total / reference) * 220 * scale);
  const widthScale = Math.max(1, Math.min(2, Number(options.widthScale) || 1));
  const chromatidW = Math.max(4.2, 5.2 * Math.min(scale, 2) * widthScale);
  const gap = Math.max(1.1, 1.6 * Math.min(scale, 1.6));
  const bend = ((stableHash(options.bendSeed || list[0]?.id || "chr") % 15) - 7) * Math.min(scale, 1.6);
  const padX = Math.ceil(chromatidW + gap / 2 + Math.abs(bend) + 8);
  const padY = 4;
  const cenAt = list.findIndex((piece) => piece.role === "centromere" || piece.arm === "cen");
  let before = 0;
  for (let index = 0; index < Math.max(0, cenAt); index += 1) before += list[index].weight || 0;
  const cenWeight = cenAt >= 0 ? (list[cenAt].weight || 0) : 0;
  const cenFrac = cenAt >= 0 ? (before + cenWeight / 2) / total : 0.42;
  const top = padY;
  const cenY = top + bodyH * cenFrac;
  const mid = padX;
  const labelW = options.showLabels ? 58 : 0;
  const svgW = Math.ceil(padX * 2 + 4 + labelW);
  const svgH = Math.ceil(top + bodyH + padY);
  const serial = figureSerial;
  figureSerial += 1;
  const point = (y, side, cx, localBend, width) => {
    const t = (y - top) / bodyH;
    const curve = Math.sin(t * Math.PI) * localBend;
    const pinch = Math.exp(-(((y - cenY) / (7 * Math.min(scale, 1.8))) ** 2));
    const half = (width / 2) * (1 - 0.62 * pinch);
    return [cx + curve + side * half, y];
  };
  const samples = 12;
  const chromatidPath = (cx, localBend, width) => {
    const sidePoints = (side) => Array.from({ length: samples + 1 }, (_, index) => point(top + (bodyH * index) / samples, side, cx, localBend, width));
    return closedPath(sidePoints(-1), sidePoints(1));
  };
  const leftW = chromatidW * 0.94;
  const rightW = chromatidW * 1.05;
  const leftCx = mid - gap / 2 - leftW / 2;
  const rightCx = mid + gap / 2 + rightW / 2;
  const leftOutline = chromatidPath(leftCx, bend, leftW);
  const rightOutline = chromatidPath(rightCx, bend * 0.7, rightW);
  let y = top;
  const bands = list.map((piece) => {
    const h = ((piece.weight || 1) / total) * bodyH;
    const row = { piece, y, h };
    y += h;
    return row;
  });
  const stripsFor = (cx, localBend, width) => bands.map((row) => {
    if (row.piece.role === "centromere") return "";
    const slices = bandSlices(row.piece);
    const sliceTotal = slices.reduce((sum, slice) => sum + slice.weight, 0) || 1;
    let sy = row.y;
    return slices.map((slice) => {
      const sh = (slice.weight / sliceTotal) * row.h;
      const path = closedPath(
        [point(sy, -1, cx, localBend, width), point(sy + sh / 2, -1, cx, localBend, width), point(sy + sh, -1, cx, localBend, width)],
        [point(sy, 1, cx, localBend, width), point(sy + sh / 2, 1, cx, localBend, width), point(sy + sh, 1, cx, localBend, width)],
      );
      sy += sh;
      const fill = sliceFill(slice, options);
      return options.bandInfo && slice.label
        ? `<path d="${path}" fill="${fill}" data-band="${escapeAttr(slice.label)}">${sliceTitle(slice)}</path>`
        : `<path d="${path}" fill="${fill}"/>`;
    }).join("");
  }).join("");
  const labels = options.showLabels ? bands.map((row) => {
    if (row.h < 9 || row.piece.role === "centromere") return "";
    return `<text x="${rightCx + rightW / 2 + 8}" y="${row.y + Math.min(row.h, 11)}" class="ideo-lab">${escapeXml(displayLabel(row.piece, true))}</text>`;
  }).join("") : "";
  const stroke = scale >= 1.4 ? 1.1 : 0.75;
  const flip = options.mirror ? `transform="translate(${svgW - labelW} 0) scale(-1 1)"` : "";
  return `<svg class="chr-svg chr-realistic" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" role="img" aria-label="G-banded chromosome with two chromatids">
    <defs><filter id="chrGrain${serial}" x="-15%" y="-5%" width="130%" height="110%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="${serial % 19 + 1}" result="grain"/><feColorMatrix in="grain" type="saturate" values="0" result="grayGrain"/><feComponentTransfer in="grayGrain" result="softGrain"><feFuncA type="linear" slope="0.22"/></feComponentTransfer><feBlend in="SourceGraphic" in2="softGrain" mode="multiply"/></filter></defs>
    <g ${flip} filter="url(#chrGrain${serial})">${stripsFor(leftCx, bend, leftW)}${stripsFor(rightCx, bend * 0.7, rightW)}<path d="${leftOutline}" fill="none" stroke="#2c2c2a" stroke-width="${stroke}"/><path d="${rightOutline}" fill="none" stroke="#2c2c2a" stroke-width="${stroke}"/><ellipse cx="${mid}" cy="${cenY}" rx="${chromatidW * 0.55}" ry="${Math.max(1.8, 1.7 * Math.min(scale, 1.6))}" fill="#d5d3cf" stroke="#2c2c2a" stroke-width="${stroke}"/>${extraCentromeres(bands, cenAt).map((y) => `<ellipse cx="${mid}" cy="${y}" rx="${chromatidW * 0.55}" ry="${Math.max(1.8, 1.7 * Math.min(scale, 1.6))}" fill="#d5d3cf" stroke="#2c2c2a" stroke-width="${stroke}"/>`).join("")}</g>
    ${labels}
  </svg>`;
}

/** Vertical centres of every centromere after the primary one, as in a dicentric chromosome. */
function extraCentromeres(rows, primary) {
  return rows.filter((row, index) => index !== primary && row.piece.role === "centromere").map((row) => (row.y + row.h / 2).toFixed(2));
}

function closedPath(left, right) {
  const edge = [...left, ...[...right].reverse()];
  return `M ${edge.map((point) => `${point[0].toFixed(2)} ${point[1].toFixed(2)}`).join(" L ")} Z`;
}

function stableHash(value) {
  let code = 2166136261;
  for (const char of String(value)) {
    code ^= char.charCodeAt(0);
    code = Math.imul(code, 16777619);
  }
  return code >>> 0;
}

function chromatidPath(x, cenY, pH, qH, w) {
  const top = cenY - pH;
  const bot = cenY + qH;
  const r = Math.min(3.4, w / 2);
  return [
    `M ${x} ${top + r}`,
    `Q ${x} ${top} ${x + r} ${top}`,
    `Q ${x + w / 2} ${top - r * 0.2} ${x + w - r} ${top}`,
    `Q ${x + w} ${top} ${x + w} ${top + r}`,
    `L ${x + w} ${cenY - 4}`,
    `Q ${x + w} ${cenY - 1.3} ${x + w - 1.4} ${cenY}`,
    `Q ${x + w} ${cenY + 1.3} ${x + w} ${cenY + 4}`,
    `L ${x + w} ${bot - r}`,
    `Q ${x + w} ${bot} ${x + w - r} ${bot}`,
    `Q ${x + w / 2} ${bot + r * 0.2} ${x + r} ${bot}`,
    `Q ${x} ${bot} ${x} ${bot - r}`,
    `L ${x} ${cenY + 4}`,
    `Q ${x} ${cenY + 1.3} ${x + 1.4} ${cenY}`,
    `Q ${x} ${cenY - 1.3} ${x} ${cenY - 4}`,
    `L ${x} ${top + r}`,
    "Z",
  ].join(" ");
}
