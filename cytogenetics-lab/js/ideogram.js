/** Large ideogram rendering from ordered cytogenetic segments. */

const STAIN = {
  0: "#f4eef8",
  1: "#c9c0d8",
  2: "#9a90b0",
  3: "#675d80",
  4: "#322b44",
  5: "#4a3a72",
  6: "#c4b093",
};

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
  const total = pieces.reduce((s, p) => s + (p.weight || 1), 0) || 1;
  const pad = 18;
  const usable = height - pad * 2;
  const cx = width / 2 + (highlightId ? 8 : 0);
  const barW = Math.min(54, width - (showRuler ? 48 : 28));
  const x = cx - barW / 2;
  let y = pad;
  const parts = [];
  let hlBox = null;
  parts.push(`<text x="${cx}" y="${pad - 4}" text-anchor="middle" class="ideo-pole">pter</text>`);
  for (const piece of pieces) {
    const h = Math.max(piece.weight <= 2 ? 11 : 14, (piece.weight / total) * usable);
    const isCen = piece.role === "centromere";
    const w = isCen ? barW * 0.55 : barW;
    const px = cx - w / 2;
    const fill = STAIN[piece.stain] ?? STAIN[2];
    const originHue = piece.translocated || piece.origin && piece.origin !== piece.chromosome ? "#6b3a2a" : fill;
    const hl = matchesHighlight(piece, highlightId);
    const sel = selectedId === piece.id;
    const rev = piece.orientation === "reverse";
    const lost = marks.missing?.includes(piece.id);
    const extra = marks.extra?.includes(piece.id);
    const inv = marks.inverted?.includes(piece.id);
    const xloc = marks.translocated?.includes(piece.id);
    const markStroke = lost ? "#8b2e2e" : extra || xloc ? "#6b3a2a" : inv ? "#1f4a56" : (hl || sel ? "#c9921a" : "#3a3450");
    if (hl) hlBox = { px, y, w, h };
    parts.push(`<g class="ideo-seg${hl ? " hl" : ""}${sel ? " sel" : ""}${lost ? " missing" : ""}${extra || xloc ? " extra" : ""}${inv ? " inverted" : ""}" data-seg="${escapeAttr(piece.id)}">
      <rect x="${px}" y="${y}" width="${w}" height="${h}" rx="${isCen ? 8 : 0}" fill="${isCen ? "#d8d3e6" : originHue}" stroke="${markStroke}" stroke-width="${lost || extra || xloc || inv || hl || sel ? 2.2 : 0.9}"/>
      ${rev ? `<path d="M${px + 4} ${y + h / 2} L${px + w - 4} ${y + 4} M${px + 4} ${y + h / 2} L${px + w - 4} ${y + h - 4}" stroke="#f6efe3" stroke-width="1.2" opacity="0.85"/>` : ""}
      ${showLabels ? `<text x="${x + barW + 8}" y="${y + h / 2 + 4}" class="ideo-lab${hl ? " hl" : ""}">${escapeXml(displayLabel(piece, showLabels))}</text>` : ""}
    </g>`);
    y += h;
  }
  if (hlBox) {
    const { px, y: hy, w, h } = hlBox;
    const mid = hy + h / 2;
    parts.push(`<rect class="ideo-hl-box" x="${px - 5}" y="${hy - 3}" width="${w + 10}" height="${h + 6}" rx="3"/>`);
    parts.push(`<polygon points="${px - 14},${mid} ${px - 5},${mid - 7} ${px - 5},${mid + 7}" fill="#c9921a"/>`);
    parts.push(`<text x="${px - 16}" y="${mid - 10}" text-anchor="end" class="ideo-hl-tag">name this</text>`);
  }
  parts.push(`<text x="${cx}" y="${height - 2}" text-anchor="middle" class="ideo-pole">qter</text>`);
  return `<svg class="ideo-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Demonstration ideogram">
    ${parts.join("")}
  </svg>`;
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
  const scaled = (piece.weight || 8) * 3.2;
  const h = piece.weight <= 2 ? Math.max(16, Math.min(22, scaled)) : Math.max(28, Math.min(72, scaled));
  const w = 78;
  const fill = STAIN[piece.stain] ?? STAIN[2];
  const isCen = piece.role === "centromere";
  const rev = piece.orientation === "reverse";
  const rx = connected ? (isCen ? 8 : 0) : (isCen ? 10 : 3);
  const moved = piece.translocated || (piece.origin && piece.origin !== piece.chromosome);
  const rectFill = isCen ? "#d8d3e6" : (moved ? "#6b3a2a" : fill);
  const lightText = darkFill(rectFill);
  return `<svg class="piece-svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">
    <rect x="8" y="${connected ? 0 : 2}" width="${isCen ? 40 : 62}" height="${connected ? h : h - 4}" rx="${rx}" fill="${rectFill}" stroke="#3a3450" stroke-width="1"/>
    ${rev ? `<path d="M14 ${h / 2} L62 6 M14 ${h / 2} L62 ${h - 6}" stroke="#f6efe3" stroke-width="1.1"/>` : ""}
    ${showLabels ? `<text x="${w / 2}" y="${h / 2 + 4}" text-anchor="middle" class="piece-lab${lightText ? " on-dark" : ""}">${escapeXml(displayLabel(piece, showLabels))}</text>` : ""}
  </svg>`;
}

function darkFill(hex) {
  const n = parseInt(String(hex || "").replace("#", ""), 16);
  if (Number.isNaN(n)) return false;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.55;
}

function displayLabel(piece, mode) {
  if (piece.role === "centromere") return "cen";
  if (mode === "region") return piece.parent_region || piece.label;
  return piece.label;
}

function escapeAttr(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function escapeXml(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
}
