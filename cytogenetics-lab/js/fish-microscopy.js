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
let scopeSerial = 0;

export function channelVisible(active, signalType) {
  if (active === "merge") return true;
  if (active === "dapi") return false;
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
  const visualId = `fish-scope-${scopeSerial++}`;
  const parts = [];
  parts.push(`<defs>
    <radialGradient id="${visualId}-dapi" cx="48%" cy="44%" r="68%"><stop offset="0" stop-color="#6287ee" stop-opacity=".76"/><stop offset=".58" stop-color="#2c55b5" stop-opacity=".84"/><stop offset="1" stop-color="#15285f" stop-opacity=".72"/></radialGradient>
    <filter id="${visualId}-texture" x="-8%" y="-8%" width="116%" height="116%"><feTurbulence type="fractalNoise" baseFrequency=".11" numOctaves="2" seed="${scopeSerial % 17 + 1}" result="grain"/><feColorMatrix in="grain" type="saturate" values="0" result="grayGrain"/><feComponentTransfer in="grayGrain" result="softGrain"><feFuncA type="table" tableValues="0 .17"/></feComponentTransfer><feComposite in="softGrain" in2="SourceAlpha" operator="in" result="clippedGrain"/><feBlend in="SourceGraphic" in2="clippedGrain" mode="screen"/></filter>
    <filter id="${visualId}-glow" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="3.5"/></filter>
  </defs>`);
  parts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="#07080d"/>`);
  if (demo) {
    parts.push(`<text x="12" y="18" fill="#e4eaf4" font-size="10" font-family="Helvetica, sans-serif">SYNTHETIC DEMONSTRATION — not clinical microscopy</text>`);
  }
  const showDapi = activeChannel === "dapi" || activeChannel === "merge";
  const bodyOpacity = showDapi ? 0.55 : 0.12;
  parts.push(dapiBody(spec, bodyOpacity, visualId));
  if (spec.overlap) parts.push(dapiBody(spec.overlap, showDapi ? 0.42 : 0.1, visualId));
  if (spec.fragment) parts.push(dapiBody(spec.fragment, showDapi ? 0.4 : 0.1, visualId));
  for (const dust of spec.background || []) {
    parts.push(`<circle cx="${dust.x}" cy="${dust.y}" r="${dust.r || 3.5}" fill="${dust.color || COLORS.green}" fill-opacity="0.5"/>`);
  }
  const signals = spec.expected_signals || [];
  for (const sig of signals) {
    if (!channelVisible(activeChannel, sig.type)) continue;
    const shown = sig.type === "fusion" && (activeChannel === "red" || activeChannel === "green") ? activeChannel : sig.type;
    parts.push(spot(sig.x, sig.y, shown, false, false, false, spec.presentation, visualId));
    if (showLabels) {
      const label = sig.type === "red" ? "red only" : sig.type === "green" ? "green only" : sig.type;
      parts.push(`<text x="${sig.x + 10}" y="${sig.y + 4}" fill="#e8edf2" font-size="9" font-family="Helvetica, sans-serif">${label}</text>`);
    }
  }
  for (const mark of marks) {
    if (activeChannel !== "dapi" && !channelVisible(activeChannel, mark.type)) continue;
    parts.push(spot(mark.x, mark.y, mark.type, mark.id === selectedId, false, true, null, visualId));
  }
  return `<svg class="fish-scope" viewBox="0 0 ${width} ${height}" width="100%" overflow="hidden" role="img" aria-label="Demonstration fluorescence field">
    ${parts.join("")}
  </svg>`;
}

function dapiBody(n, opacity, visualId) {
  const paint = `fill="url(#${visualId}-dapi)" fill-opacity="${opacity}" stroke="#9bb0e8" stroke-opacity="0.45" stroke-width="1.2" filter="url(#${visualId}-texture)"`;
  if (n.presentation === "irregular") {
    const wobble = [1, 0.94, 0.82, 1.04, 0.76, 0.9, 1.08, 0.86, 0.72, 1.02, 0.9, 0.78, 1.06, 0.88, 0.96, 1];
    const pts = wobble.map((scale, i) => {
      const angle = (Math.PI * 2 * i) / wobble.length - Math.PI / 2;
      return {
        x: n.cx + Math.cos(angle) * n.rx * scale,
        y: n.cy + Math.sin(angle) * n.ry * scale,
      };
    });
    let d = "";
    pts.forEach((curr, i) => {
      const next = pts[(i + 1) % pts.length];
      const midX = ((curr.x + next.x) / 2).toFixed(1);
      const midY = ((curr.y + next.y) / 2).toFixed(1);
      d += i === 0
        ? `M ${midX} ${midY}`
        : ` Q ${curr.x.toFixed(1)} ${curr.y.toFixed(1)} ${midX} ${midY}`;
    });
    const first = pts[0];
    const second = pts[1];
    d += ` Q ${first.x.toFixed(1)} ${first.y.toFixed(1)} ${((first.x + second.x) / 2).toFixed(1)} ${((first.y + second.y) / 2).toFixed(1)} Z`;
    return `<path d="${d}" ${paint}/>`;
  }
  return `<ellipse cx="${n.cx}" cy="${n.cy}" rx="${n.rx}" ry="${n.ry}" ${paint}/>`;
}

function spot(x, y, type, selected, splitGlow, isMark, style, visualId) {
  const color = COLORS[type] || COLORS.uncertain;
  if (style === "ambiguous") {
    return `<g class="fish-spot" data-kind="${type}">
      <ellipse cx="${x}" cy="${y}" rx="24" ry="13" fill="${color}" fill-opacity="0.28" transform="rotate(-24 ${x} ${y})"/>
      <ellipse cx="${x + 12}" cy="${y + 7}" rx="16" ry="10" fill="${color}" fill-opacity="0.4"/>
    </g>`;
  }
  const faint = style === "weak";
  const r = faint ? 3.2 : (type === "fusion" ? 7 : 4.6);
  const ring = selected ? `<circle cx="${x}" cy="${y}" r="${r + 5}" fill="none" stroke="#fff" stroke-width="1.4"/>` : "";
  const fusion = !faint && type === "fusion"
    ? `<circle cx="${x - 2}" cy="${y}" r="${r - 1}" fill="${COLORS.red}" fill-opacity="0.85"/><circle cx="${x + 2}" cy="${y}" r="${r - 1}" fill="${COLORS.green}" fill-opacity="0.85"/>`
    : "";
  return `<g class="fish-spot" data-kind="${type}">
    <circle cx="${x}" cy="${y}" r="${r + (faint ? 3 : 7)}" fill="${color}" fill-opacity="${faint ? 0.08 : 0.18}" filter="url(#${visualId}-glow)"/>
    ${fusion || `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" fill-opacity="${faint ? 0.32 : 0.95}"/>`}
    ${ring}
  </g>`;
}
