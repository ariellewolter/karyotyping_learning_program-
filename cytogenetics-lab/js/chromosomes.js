/**
 * Schematic G-banded chromosomes.
 * Templates come from data/chromosome-templates.json.
 * A pericentric inversion is drawn from the chromosome-map transform, not from a second band definition.
 * Never present these drawings as authentic clinical specimens.
 */

import { applyTransform, cloneSegments } from "./banding.js?v=20261006k";
import { relativeLuminance, stainHex } from "./ideogram.js?v=20261015a";

let boundMaps = null;
let clipSerial = 0;

export function bindChromosomeMaps(maps) {
  boundMaps = maps || null;
}

export function sexCopyNumber(sex) {
  const s = String(sex || "XY").toUpperCase();
  const x = (s.match(/X/g) || []).length;
  const y = (s.match(/Y/g) || []).length;
  return { X: x, Y: y };
}

export function expandChromosomeSet(caseData, templates) {
  if (Array.isArray(caseData.chromosome_images) && caseData.chromosome_images.length) {
    return caseData.chromosome_images.map((img, i) => ({
      id: img.id || `img-${i}`,
      identity: String(img.identity),
      homolog: img.homolog || "a",
      variant: img.variant || "normal",
      src: img.src || null,
      placeholder: img.placeholder !== false,
      template: templates.chromosomes[String(img.identity)],
    }));
  }

  const spec = caseData.chromosome_set || { sex: caseData.sex_chromosomes || "XY" };
  const sex = spec.sex || caseData.sex_chromosomes || "XY";
  const copies = { ...sexCopyNumber(sex) };
  for (let n = 1; n <= 22; n += 1) copies[String(n)] = 2;
  Object.assign(copies, spec.copy_number || {});

  const variants = spec.variants || {};
  const homologLabels = ["a", "b", "c", "d"];
  const out = [];

  const order = [...Array.from({ length: 22 }, (_, i) => String(i + 1)), "X", "Y"];
  for (const identity of order) {
    const n = copies[identity] || 0;
    for (let i = 0; i < n; i += 1) {
      const homolog = homologLabels[i] || String(i + 1);
      const key = `${identity}${homolog}`;
      const variant = variants[key] || "normal";
      const template = templates.chromosomes[identity];
      const structure = structuralRecord(identity, variant);
      out.push({
        id: `chr${key}`,
        identity,
        chromosomeNumber: identity,
        homolog,
        homologId: homolog,
        sexChromosomeType: identity === "X" || identity === "Y" ? identity : null,
        variant,
        abnormal: structure.abnormal,
        pArm: template?.p || [],
        centromere: template?.cen ?? null,
        qArm: template?.q || [],
        structuralChanges: structure.structuralChanges,
        sourceChromosomeSegments: structure.sourceChromosomeSegments,
        targetChromosomeSegments: structure.targetChromosomeSegments,
        src: null,
        placeholder: true,
        template,
      });
    }
  }
  return out;
}

export function expectedPositions(chromosomes) {
  const slots = {};
  for (const chr of chromosomes) {
    slots[chr.identity] = slots[chr.identity] || [];
    slots[chr.identity].push(chr.id);
  }
  return slots;
}

export function renderChromosome(chr, options = {}) {
  if (chr.src) {
    const alt = options.hideIdentity
      ? "Demonstration chromosome graphic"
      : `Chromosome ${chr.identity}${chr.placeholder ? " (demonstration graphic)" : ""}`;
    const rel = Number(chr.template?.relativeLength) || 8.44;
    const h = Math.max(28, Math.round((rel / 8.44) * 210 * (options.scale || 1)));
    return `<img class="chr-img" draggable="false" alt="${alt}" src="${escapeAttr(chr.src)}" style="height:${h}px;width:auto" />`;
  }
  if (!chr.template) {
    return `<div class="chr-missing" title="Missing template"></div>`;
  }
  return schematicSVG(chr, options);
}

function escapeAttr(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function cloneArm(arm) {
  return (arm || []).map((pair) => [pair[0], pair[1]]);
}

function structuralRecord(identity, variant) {
  const v = String(variant || "normal");
  if (v === "normal") {
    return { abnormal: false, structuralChanges: [], sourceChromosomeSegments: [], targetChromosomeSegments: [] };
  }
  const deletion = v.match(/^del\(([^)]+)\)\(([pq])/);
  if (deletion) {
    const arm = deletion[2];
    return {
      abnormal: true,
      structuralChanges: [{ type: "deletion", chromosome: String(identity), arm, extent: "terminal" }],
      sourceChromosomeSegments: [{ chromosome: String(identity), arm, region: "distal", disposition: "missing" }],
      targetChromosomeSegments: [],
    };
  }
  const derivative = v.match(/^der\(([^)]+)\)t\(([^;]+);([^)]+)\)\(([pq][^;]*);([pq][^)]*)\)/);
  if (derivative) {
    const derId = derivative[1];
    const left = derivative[2];
    const right = derivative[3];
    const leftBand = derivative[4];
    const rightBand = derivative[5];
    const ownBand = String(derId) === String(left) ? leftBand : rightBand;
    const partner = String(derId) === String(left) ? right : left;
    const partnerBand = String(derId) === String(left) ? rightBand : leftBand;
    return {
      abnormal: true,
      structuralChanges: [{
        type: "reciprocal_translocation",
        derivative: `der(${derId})`,
        chromosomes: [left, right],
      }],
      sourceChromosomeSegments: [{
        chromosome: String(derId),
        arm: ownBand[0],
        region: ownBand,
        disposition: "moved",
      }],
      targetChromosomeSegments: [{
        chromosome: String(partner),
        arm: partnerBand[0],
        region: partnerBand,
        disposition: "received",
      }],
    };
  }
  return {
    abnormal: true,
    structuralChanges: [{ type: "unspecified", variant: v }],
    sourceChromosomeSegments: [],
    targetChromosomeSegments: [],
  };
}

function applyVariant(template, variant) {
  const t = {
    relativeLength: template.relativeLength,
    cen: template.cen,
    morphology: template.morphology,
    p: cloneArm(template.p),
    q: cloneArm(template.q),
  };
  const v = variant || "normal";
  if (v === "normal") return t;

  const deletion = String(v).match(/^del\([^)]+\)\(([pq])/);
  if (deletion) {
    if (deletion[1] === "p") {
      // Arm templates run centromere → telomere. Drop the distal bands, as on q.
      t.p = t.p.slice(0, Math.max(1, t.p.length - 2));
      t.cen = Math.min(0.18, t.cen * 0.55);
      t.relativeLength *= 0.88;
    } else {
      t.q = t.q.slice(0, Math.max(1, t.q.length - 2));
      t.relativeLength *= 0.86;
    }
    return t;
  }
  if (/der\(22\)t\(9;22\)/.test(v)) {
    t.q = [[3, 4], [4, 0], [3, 5], [2, 0]];
    t.relativeLength *= 0.78;
    t.cen = 0.28;
    t.morphology = "acrocentric";
    return t;
  }
  if (/der\(9\)t\(9;22\)/.test(v)) {
    t.q = [...t.q.slice(0, 5), [4, 4], [5, 0], [4, 2]];
    t.relativeLength *= 1.04;
    return t;
  }
  if (/der\(15\)t\(15;17\)/.test(v)) {
    t.q = [...t.q.slice(0, 4), [5, 3], [4, 0], [3, 4]];
    return t;
  }
  if (/der\(17\)t\(15;17\)/.test(v)) {
    t.q = [[4, 2], [5, 0], [6, 5], [4, 0]];
    t.relativeLength *= 1.08;
    return t;
  }
  if (/der\(8\)t\(8;14\)/.test(v)) {
    t.q = [...t.q.slice(0, 4), [5, 0], [4, 4]];
    return t;
  }
  if (/der\(14\)t\(8;14\)/.test(v)) {
    t.q = [[4, 4], [5, 0], [6, 3], [5, 0], [4, 2]];
    t.relativeLength *= 1.1;
    return t;
  }
  if (/der\(8\)t\(8;21\)/.test(v)) {
    t.q = [...t.q.slice(0, -2), [4, 2], [3, 0]];
    t.relativeLength *= 0.96;
    return t;
  }
  if (/der\(21\)t\(8;21\)/.test(v)) {
    t.q = [...t.q, [5, 3], [4, 0]];
    t.relativeLength *= 1.12;
    return t;
  }
  const inverted = pericentricSchematic(t, v);
  if (inverted) return inverted;
  if (/der\(2\)t\(2;5\)/.test(v)) {
    t.p = [[3, 0], [4, 2], ...t.p.slice(2)];
    return t;
  }
  if (/der\(5\)t\(2;5\)/.test(v)) {
    t.q = [...t.q.slice(0, -1), [5, 2], [4, 0]];
    return t;
  }
  if (/der\(11\)t\(11;22\)/.test(v)) {
    t.q = [...t.q.slice(0, -1), [4, 3], [3, 0]];
    return t;
  }
  if (/der\(22\)t\(11;22\)/.test(v)) {
    t.q = [...t.q, [5, 2], [4, 0]];
    t.relativeLength *= 1.08;
    return t;
  }
  return t;
}

function pericentricSchematic(template, variant) {
  const match = String(variant || "").match(/^inv\((\d+|X|Y)\)\(([pq][\d.]+)([pq][\d.]+)\)$/);
  if (!match) return null;
  const segments = boundMaps?.chromosomes?.[match[1]]?.segments;
  if (!segments?.length) return null;
  const from = `${match[1]}${match[2]}`;
  const to = `${match[1]}${match[3]}`;
  const transformed = applyTransform(cloneSegments(segments), { type: "inversion", from, to });
  const cenAt = transformed.findIndex((segment) => segment.role === "centromere");
  if (cenAt <= 0 || cenAt >= transformed.length - 1) return null;
  const band = (segment) => [segment.weight || 1, segment.stain || 0];
  const next = {
    ...template,
    p: transformed.slice(0, cenAt).reverse().map(band),
    q: transformed.slice(cenAt + 1).map(band),
    bandOrder: transformed.map((segment) => `${segment.id}${segment.orientation === "reverse" ? "~" : ""}`),
  };
  const pWeight = next.p.reduce((sum, pair) => sum + pair[0], 0);
  const qWeight = next.q.reduce((sum, pair) => sum + pair[0], 0);
  const all = pWeight + qWeight || 1;
  next.cen = pWeight / all;
  return next;
}

export function schematicForVariant(template, variant) {
  return applyVariant(template, variant);
}

function drawHeight(template, scale) {
  const length = Number(template.relativeLength) || 1;
  return Math.max(8, Math.round((length / 8.44) * 210 * scale));
}

function schematicSVG(chr, options) {
  const template = applyVariant(chr.template, chr.variant);
  const scale = options.scale || 1;
  const height = options.height || drawHeight(template, scale);
  const cw = Math.max(11, Math.round(13 * Math.min(scale, 2.3)));
  const gap = Math.max(3, Math.round(4 * Math.min(scale, 2)));
  const padX = Math.max(3, Math.round(3.2 * Math.min(scale, 2)));
  const padY = Math.max(8, Math.round(7 * Math.min(scale, 1.8)));
  const totalH = height;
  const pShare = Math.max(2, Math.min(totalH - 2, Math.round(totalH * template.cen)));
  const stalk = stalkWeight(template);
  const satPad = stalk ? Math.min(Math.max(0, pShare - 2), Math.max(3, Math.round(pShare * 0.45))) : 0;
  const pH = pShare - satPad;
  const qH = totalH - pShare;
  const cenY = padY + satPad + pH;
  const svgH = padY * 2 + totalH + 6;
  const leftX = padX;
  const rightX = padX + cw + gap;
  const svgW = rightX + cw + padX;
  const stroke = scale >= 1.6 ? 1.15 : 0.9;
  const left = chromatidPath(leftX, cenY, pH, qH, cw);
  const right = chromatidPath(rightX, cenY, pH, qH, cw);
  const bandsLeft = bandRects(leftX, cenY, pH, qH, cw, template);
  const bandsRight = bandRects(rightX, cenY, pH, qH, cw, template);
  const clipL = `chrL${clipSerial}`;
  const clipR = `chrR${clipSerial}`;
  clipSerial += 1;
  const stalkY = padY + satPad;
  const satR = Math.max(1.2, Math.min(satPad * 0.32, (1.5 + stalk * 0.28) * Math.min(scale, 1.6)));
  const satDx = Math.min(cw * 0.42, 5 * Math.min(scale, 1.8));
  const satCy = padY + Math.max(satR + 0.4, satPad * 0.46);
  const sat = stalk && satPad
    ? `<circle cx="${svgW / 2 - satDx}" cy="${satCy}" r="${satR}" fill="#d8d0e6" stroke="#3a3450" stroke-width="${stroke}"/>
       <circle cx="${svgW / 2 + satDx}" cy="${satCy}" r="${satR}" fill="#d8d0e6" stroke="#3a3450" stroke-width="${stroke}"/>
       <path d="M${svgW / 2 - satDx} ${satCy + satR * 0.55} L${leftX + cw / 2} ${stalkY}" stroke="#8a7a60" stroke-width="${stroke}"/>
       <path d="M${svgW / 2 + satDx} ${satCy + satR * 0.55} L${rightX + cw / 2} ${stalkY}" stroke="#8a7a60" stroke-width="${stroke}"/>`
    : "";

  return `<svg class="chr-svg" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" aria-hidden="true">
    <defs>
      <clipPath id="${clipL}"><path d="${left}"/></clipPath>
      <clipPath id="${clipR}"><path d="${right}"/></clipPath>
    </defs>
    <g>
      ${sat}
      <path d="${left}" fill="#f7f4fb" stroke="#241c33" stroke-width="${stroke}"/>
      <path d="${right}" fill="#f7f4fb" stroke="#241c33" stroke-width="${stroke}"/>
      <g clip-path="url(#${clipL})">${bandsLeft}</g>
      <g clip-path="url(#${clipR})">${bandsRight}</g>
      <ellipse cx="${svgW / 2}" cy="${cenY}" rx="${cw * 0.85}" ry="${Math.max(3, 2.6 * Math.min(scale, 1.8))}" fill="#d8d3e6" stroke="#3a3450" stroke-width="${stroke}"/>
    </g>
  </svg>`;
}

function stalkWeight(template) {
  const stalk = (template.p || []).find((band) => band[1] === 6);
  return stalk ? stalk[0] : 0;
}

function chromatidPath(x, cenY, pH, qH, w) {
  const top = cenY - pH;
  const bot = cenY + qH;
  const r = Math.min(4.2, w / 2);
  return [
    `M ${x} ${top + r}`,
    `Q ${x} ${top} ${x + r} ${top}`,
    `L ${x + w - r} ${top}`,
    `Q ${x + w} ${top} ${x + w} ${top + r}`,
    `L ${x + w} ${cenY - 2}`,
    `L ${x + w - 1.4} ${cenY}`,
    `L ${x + w} ${cenY + 2}`,
    `L ${x + w} ${bot - r}`,
    `Q ${x + w} ${bot} ${x + w - r} ${bot}`,
    `L ${x + r} ${bot}`,
    `Q ${x} ${bot} ${x} ${bot - r}`,
    `L ${x} ${cenY + 2}`,
    `L ${x + 1.4} ${cenY}`,
    `L ${x} ${cenY - 2}`,
    "Z",
  ].join(" ");
}

function bandRects(x, cenY, pH, qH, w, template) {
  const parts = [];
  parts.push(armBands(x, cenY - pH, pH, w, template.p, true));
  parts.push(armBands(x, cenY, qH, w, template.q, false));
  return parts.join("");
}

function armBands(x, y0, armH, w, bands, upward) {
  const total = bands.reduce((s, b) => s + b[0], 0) || 1;
  let y = y0;
  let html = "";
  const seq = upward ? [...bands].reverse() : bands;
  const rows = seq.map(([weight, stain]) => {
    const fill = stainHex(stain);
    return { h: (weight / total) * armH, fill };
  });
  rows.forEach((row, index) => {
    html += `<rect x="${x}" y="${y}" width="${w}" height="${Math.max(0.8, row.h)}" fill="${row.fill}"/>`;
    const next = rows[index + 1];
    if (next && Math.abs(relativeLuminance(row.fill) - relativeLuminance(next.fill)) < 0.22) {
      const yy = y + row.h;
      const line = (relativeLuminance(row.fill) + relativeLuminance(next.fill)) / 2 > 0.55 ? "#241c33" : "#f6f1e8";
      html += `<line x1="${x}" y1="${yy}" x2="${x + w}" y2="${yy}" stroke="${line}" stroke-width="0.8"/>`;
    }
    y += row.h;
  });
  return html;
}

function hash(str) {
  let h = 2166136261;
  for (const ch of String(str)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function metaphaseLayout(chromosomes, width = 760, height = 420) {
  return chromosomes.map((chr, i) => {
    const seed = hash(chr.id + String(i));
    const x = 40 + (seed % Math.max(40, width - 80));
    const y = 30 + ((seed >>> 8) % Math.max(40, height - 90));
    const rot = ((seed >>> 16) % 50) - 25;
    return { ...chr, x, y, rot };
  });
}
