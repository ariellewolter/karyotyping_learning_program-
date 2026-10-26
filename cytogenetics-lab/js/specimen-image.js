/**
 * Demonstration specimen images for imported teaching cases.
 * Drawn from the curated karyotype or FISH nuclei already in the app.
 * These are teaching graphics, not microscope captures or patient specimens.
 */

import { chromosomeSetFromFormula, expandChromosomeSet, renderChromosome } from "./chromosomes.js?v=20261026p5";
import { nucleusSVG } from "./fish-microscopy.js?v=20261024e";

const IMAGE_LIMIT = 1200000;

/** Condensation range for one spread. All chromosomes in a cell share a stage. */
const SPREAD_CONDENSATION = [0.86, 1.14];
/** Per-chromosome differential condensation, small enough to keep relative length usable. */
const CHROMOSOME_CONDENSATION = 0.03;

export function presentationStyle(seed) {
  const random = seededRandom(hash(`spread:${seed}`));
  const [low, high] = SPREAD_CONDENSATION;
  return { condensation: low + random() * (high - low) };
}

function spreadPose(id, presentation) {
  if (!Number.isFinite(presentation)) return { own: 1, mirror: false, rot: (hash(id) % 41) - 20 };
  const random = seededRandom(hash(`${id}:${presentation}`));
  const own = 1 + (random() * 2 - 1) * CHROMOSOME_CONDENSATION;
  const mirror = random() < 0.5;
  return { own, mirror, rot: Math.round(random() * 360 - 180) };
}

/** Rotation of each chromosome in the spread, in degrees, keyed by chromosome id. */
export function spreadRotations(chromosomes, presentation) {
  return Object.fromEntries((chromosomes || []).map((chromosome) => [chromosome.id, spreadPose(chromosome.id, presentation).rot]));
}

/** One chromosome drawn exactly as it appears in the spread for this presentation, upright, at the given scale. */
export function spreadChromosomeSvg(chromosome, presentation, scale = 0.78) {
  const varied = Number.isFinite(presentation);
  const condensation = varied ? presentationStyle(presentation).condensation : 1;
  const pose = spreadPose(chromosome.id, varied ? presentation : NaN);
  return renderChromosome(chromosome, {
    scale: scale * condensation * pose.own,
    hideIdentity: true,
    realistic: true,
    texture: true,
    bendSeed: varied ? `${chromosome.id}:${presentation}` : chromosome.id,
    mirror: varied && pose.mirror,
    widthScale: varied ? Math.min(1.25, Math.max(1, 1 / condensation)) : 1,
  });
}

/**
 * options.presentation (a number) varies placement order, orientation, bend,
 * mirroring, and condensation. Band maps and relative band sizes are unchanged.
 * Without it the layout is the fixed demonstration layout.
 * options.interactive adds data-spread-id to each chromosome; options.badge(id) returns
 * { text, fill } or null; options.selected and options.placed are Sets of chromosome ids.
 */
export function metaphaseSvg(chromosomes, options = {}) {
  if (!chromosomes?.length) return "";
  const varied = Number.isFinite(options.presentation);
  const seed = varied ? options.presentation : 0;
  const condensation = varied ? presentationStyle(seed).condensation : 1;
  const scale = (options.scale || 0.78) * condensation;
  const drawn = chromosomes.map((chromosome) => {
    const pose = spreadPose(chromosome.id, varied ? seed : NaN);
    const svg = renderChromosome(chromosome, {
      scale: scale * pose.own,
      hideIdentity: true,
      realistic: true,
      texture: true,
      bendSeed: varied ? `${chromosome.id}:${seed}` : chromosome.id,
      mirror: varied && pose.mirror,
      widthScale: varied ? Math.min(1.25, Math.max(1, 1 / condensation)) : 1,
    });
    return {
      id: chromosome.id,
      identity: chromosome.identity,
      svg,
      width: numberAttr(svg, "width", 28),
      height: numberAttr(svg, "height", 80),
      rot: pose.rot,
    };
  });
  const order = varied ? shuffled(drawn, seededRandom(hash(`order:${seed}`))) : drawn;
  const layout = packMetaphase(order);
  if (options.onLayout) options.onLayout(layout);
  const label = "Generated demonstration metaphase — not a microscope capture";
  return `<svg xmlns="http://www.w3.org/2000/svg" class="metaphase-figure" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" role="img" aria-label="${label}">
    <defs><radialGradient id="metaphaseField" cx="42%" cy="46%" r="62%"><stop offset="0" stop-color="#2a3848"/><stop offset="1" stop-color="#0c1218"/></radialGradient></defs>
    <rect width="100%" height="100%" fill="url(#metaphaseField)"/>
    <ellipse cx="${layout.width / 2}" cy="${layout.height * 0.52}" rx="${layout.width * 0.46}" ry="${layout.height * 0.4}" fill="#18222c" opacity="0.72"/>
    ${layout.items.map((item) => spreadItem(item, options)).join("")}
    ${options.badge ? layout.items.map((item) => spreadBadge(item, options.badge(item.id))).join("") : ""}
  </svg>`;
}

function spreadItem(item, options) {
  const cx = (item.width / 2).toFixed(1);
  const cy = (item.height / 2).toFixed(1);
  const selected = options.selected?.has(item.id);
  const placed = options.placed?.has(item.id);
  const attrs = options.interactive ? ` class="spread-chr${selected ? " on" : ""}" data-action="bench-spread" data-id="${item.id}"` : "";
  const ring = selected ? `<rect x="-5" y="-5" width="${(item.width + 10).toFixed(1)}" height="${(item.height + 10).toFixed(1)}" rx="8" fill="none" stroke="#ffd166" stroke-width="3"/>` : "";
  return `<g transform="translate(${item.x.toFixed(1)} ${item.y.toFixed(1)}) rotate(${item.rot} ${cx} ${cy})"${attrs}${placed && !selected ? ' opacity="0.3"' : ""}>${ring}${item.svg}</g>`;
}

function spreadBadge(item, badge) {
  if (!badge) return "";
  const x = (item.x + item.width / 2).toFixed(1);
  const y = (item.y + item.height / 2).toFixed(1);
  const text = badge.text ? `<text x="${x}" y="${y}" dy="0.35em" text-anchor="middle" font-size="11" font-weight="700" font-family="Helvetica, Arial, sans-serif" fill="#fff">${badge.text}</text>` : "";
  return `<g pointer-events="none"><circle cx="${x}" cy="${y}" r="${badge.text ? 10 : 6}" fill="${badge.fill}" stroke="#fff" stroke-width="1.5"/>${text}</g>`;
}

export async function generatedMetaphaseFromFormula(text, templates) {
  const set = chromosomeSetFromFormula(text);
  if (!set) return null;
  const image = await generatedMetaphaseImage({ chromosome_set: set }, templates);
  if (!image) return null;
  return {
    ...image,
    formula: set.formula,
    mosaic: set.mosaic,
    note: set.mosaic ? "The metaphase shows the first written cell line." : "",
  };
}

export async function generatedMetaphaseImage(caseData, templates) {
  if (!templates?.chromosomes || !caseData?.chromosome_set?.sex) return null;
  const chromosomes = expandChromosomeSet(caseData, templates);
  let layout = null;
  const markup = metaphaseSvg(chromosomes, { onLayout: (value) => { layout = value; } });
  if (!markup) return null;
  const data = await rasterizeSvg(markup, numberAttr(markup, "width", 960), numberAttr(markup, "height", 700));
  return data ? { name: "Generated demonstration metaphase", data, generated: true, cuts: layoutCuts(layout) } : null;
}

/** Where each chromosome was drawn, as boxes in percent of the image, in reading order. No identities. */
function layoutCuts(layout) {
  if (!layout?.items?.length) return [];
  const pad = 3;
  const boxes = layout.items.map((item) => {
    const bounds = rotatedSize(item.width, item.height, item.rot || 0);
    const cx = item.x + item.width / 2;
    const cy = item.y + item.height / 2;
    const x0 = Math.max(0, cx - bounds.width / 2 - pad);
    const y0 = Math.max(0, cy - bounds.height / 2 - pad);
    const x1 = Math.min(layout.width, cx + bounds.width / 2 + pad);
    const y1 = Math.min(layout.height, cy + bounds.height / 2 + pad);
    const round = (value) => Math.round(value * 1000) / 1000;
    const truth = /^(?:[1-9]|1\d|2[0-2]|X|Y)$/.test(String(item.identity || "")) ? String(item.identity) : "";
    return { x: round(x0 / layout.width * 100), y: round(y0 / layout.height * 100), width: round((x1 - x0) / layout.width * 100), height: round((y1 - y0) / layout.height * 100), ...(truth ? { truth } : {}) };
  });
  const row = 100 / 12;
  return boxes.sort((a, b) => Math.floor(a.y / row) - Math.floor(b.y / row) || a.x - b.x);
}

export async function generatedFishImages(fish) {
  const nuclei = (fish?.nuclei || []).filter((nucleus) => nucleus && (nucleus.expected_signals || nucleus.cx)).slice(0, 3);
  const images = [];
  for (let index = 0; index < nuclei.length; index += 1) {
    const width = 640;
    const height = 480;
    const svg = nucleusSVG(nuclei[index], { width, height, demo: true }).replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ');
    const data = await rasterizeSvg(svg, width, height);
    if (!data) continue;
    images.push({ name: `Generated demonstration field ${index + 1}`, data, generated: true });
  }
  return images;
}

function numberAttr(svg, name, fallback) {
  const match = String(svg).match(new RegExp(`${name}="([\\d.]+)"`));
  const value = match ? Number(match[1]) : fallback;
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function packMetaphase(items) {
  const placed = [];
  const gap = 10;
  items.forEach((item, index) => {
    const rot = item.rot ?? (hash(item.id) % 41) - 20;
    const bounds = rotatedSize(item.width, item.height, rot);
    let chosen = null;
    for (let step = 0; step < 90 && !chosen; step += 1) {
      const angle = index * 2.399963 + step * 0.62;
      const radius = 24 + step * 16;
      const cx = Math.cos(angle) * radius;
      const cy = Math.sin(angle) * radius * 0.76;
      const rect = { x: cx - bounds.width / 2, y: cy - bounds.height / 2, w: bounds.width, h: bounds.height };
      if (!placed.some((other) => overlaps(rect, other.rect, gap))) chosen = { rect, rot };
    }
    if (!chosen) {
      const x = placed.length * (bounds.width + gap);
      chosen = { rect: { x, y: 0, w: bounds.width, h: bounds.height }, rot };
    }
    placed.push({ ...chosen, item });
  });
  const minX = Math.min(...placed.map((item) => item.rect.x));
  const minY = Math.min(...placed.map((item) => item.rect.y));
  const maxX = Math.max(...placed.map((item) => item.rect.x + item.rect.w));
  const maxY = Math.max(...placed.map((item) => item.rect.y + item.rect.h));
  const padX = 20;
  const padTop = 18;
  return {
    width: Math.ceil(maxX - minX + padX * 2),
    height: Math.ceil(maxY - minY + padTop + 16),
    items: placed.map((item) => ({
      id: item.item.id,
      identity: item.item.identity,
      svg: item.item.svg,
      width: item.item.width,
      height: item.item.height,
      rot: item.rot,
      x: item.rect.x - minX + padX + (item.rect.w - item.item.width) / 2,
      y: item.rect.y - minY + padTop + (item.rect.h - item.item.height) / 2,
    })),
  };
}

function rotatedSize(width, height, degrees) {
  const rad = Math.abs(degrees) * Math.PI / 180;
  return {
    width: Math.abs(width * Math.cos(rad)) + Math.abs(height * Math.sin(rad)),
    height: Math.abs(width * Math.sin(rad)) + Math.abs(height * Math.cos(rad)),
  };
}

function overlaps(a, b, gap) {
  return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
}

function seededRandom(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(items, random) {
  const out = items.slice();
  for (let index = out.length - 1; index > 0; index -= 1) {
    const pick = Math.floor(random() * (index + 1));
    [out[index], out[pick]] = [out[pick], out[index]];
  }
  return out;
}

function hash(value) {
  let code = 2166136261;
  for (const char of String(value)) {
    code ^= char.charCodeAt(0);
    code = Math.imul(code, 16777619);
  }
  return code >>> 0;
}

function rasterizeSvg(markup, width, height) {
  return new Promise((resolve) => {
    const blob = new Blob([markup], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width));
      canvas.height = Math.max(1, Math.round(height));
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const png = canvas.toDataURL("image/png");
      resolve(png.length < IMAGE_LIMIT ? png : canvas.toDataURL("image/jpeg", 0.84));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    image.src = url;
  });
}
