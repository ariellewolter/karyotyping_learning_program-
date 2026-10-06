/** Synthetic fluorescence-microscopy drawing. Never present as authentic clinical imaging. */

const COLORS = {
  dapi: "#3a5aa8",
  red: "#e24b4b",
  green: "#3dcc6d",
  fusion: "#f2d45c",
  split: "#f2d45c",
  uncertain: "#cfc8d8",
  artifact: "#9aa3b2",
};

export function channelVisible(active, signalType) {
  if (active === "merge" || active === "dapi") return true;
  if (active === "red") return signalType === "red" || signalType === "fusion";
  if (active === "green") return signalType === "green" || signalType === "fusion";
  return true;
}

export function nucleusSVG(spec, options = {}) {
  const {
    width = 400,
    height = 340,
    activeChannel = "merge",
    marks = [],
    selectedId = null,
    showLabels = false,
    demo = true,
  } = options;
  const parts = [];
  parts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="#07080d"/>`);
  if (demo) {
    parts.push(`<text x="12" y="18" fill="#e4eaf4" font-size="10" font-family="Helvetica, sans-serif">SYNTHETIC DEMONSTRATION — not clinical microscopy</text>`);
  }
  const showDapi = activeChannel === "dapi" || activeChannel === "merge";
  if (showDapi) {
    parts.push(dapiBody(spec, 0.55));
    if (spec.overlap) parts.push(dapiBody(spec.overlap, 0.42));
  } else {
    parts.push(dapiBody(spec, 0.12));
    if (spec.overlap) parts.push(dapiBody(spec.overlap, 0.1));
  }
  const signals = spec.expected_signals || [];
  for (const sig of signals) {
    if (!channelVisible(activeChannel, sig.type)) continue;
    parts.push(spot(sig.x, sig.y, sig.type, false, false));
    if (showLabels) {
      const label = sig.type === "red" ? "red only" : sig.type === "green" ? "green only" : sig.type;
      parts.push(`<text x="${sig.x + 10}" y="${sig.y + 4}" fill="#e8edf2" font-size="9" font-family="Helvetica, sans-serif">${label}</text>`);
    }
  }
  for (const mark of marks) {
    if (!channelVisible(activeChannel, mark.type)) continue;
    parts.push(spot(mark.x, mark.y, mark.type, mark.id === selectedId, false, true));
  }
  return `<svg class="fish-scope" viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="Demonstration fluorescence field">
    ${parts.join("")}
  </svg>`;
}

function dapiBody(n, opacity) {
  return `<ellipse cx="${n.cx}" cy="${n.cy}" rx="${n.rx}" ry="${n.ry}" fill="${COLORS.dapi}" fill-opacity="${opacity}" stroke="#9bb0e8" stroke-opacity="0.35" stroke-width="1.2"/>`;
}

function spot(x, y, type, selected, splitGlow, isMark) {
  const color = COLORS[type] || COLORS.uncertain;
  const r = type === "fusion" ? 8 : 6.5;
  const ring = selected ? `<circle cx="${x}" cy="${y}" r="${r + 5}" fill="none" stroke="#fff" stroke-width="1.4"/>` : "";
  const hatch = isMark ? "" : "";
  const fusion = type === "fusion"
    ? `<circle cx="${x - 2}" cy="${y}" r="${r - 1}" fill="${COLORS.red}" fill-opacity="0.85"/><circle cx="${x + 2}" cy="${y}" r="${r - 1}" fill="${COLORS.green}" fill-opacity="0.85"/>`
    : "";
  return `<g class="fish-spot" data-kind="${type}">
    <circle cx="${x}" cy="${y}" r="${r + 7}" fill="${color}" fill-opacity="0.18"/>
    ${fusion || `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" fill-opacity="0.95"/>`}
    ${hatch}${ring}
  </g>`;
}
