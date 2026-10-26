/**
 * Schematic G-banded chromosomes.
 * Templates come from data/chromosome-templates.json.
 * A pericentric inversion is drawn from the chromosome-map transform, not from a second band definition.
 * Never present these drawings as authentic clinical specimens.
 */

import { applyTransform, attachFromMap, cloneSegments, piecesAtResolution } from "./banding.js?v=20261024c";
import { metaphaseChromosomeSVG, relativeLuminance, stainHex } from "./ideogram.js?v=20261025ex1";
import { exploreISCN, impliedDerivatives, segmentTransform } from "./iscn.js";
import { buildModel, isModelled, modelChromosomes, modelIdentity, modelRole } from "./derivative-model.js";

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

/**
 * Autosome copy number for the baseline karyotype. Taken from an ISCN ploidy
 * token such as <3n>, or inferred from the written chromosome count.
 */
export function inferPloidy(count, ploidyToken = "", countRange = null) {
  const match = String(ploidyToken || "").trim().match(/^(\d+)n/i);
  if (match) return Math.min(4, Math.max(1, Number(match[1])));
  const n = Number(countRange?.[1] ?? count);
  if (!Number.isFinite(n)) return 2;
  if (n >= 81) return 4;
  if (n >= 58) return 3;
  return 2;
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
  const homologLabels = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const out = [];

  const order = [...Array.from({ length: 22 }, (_, i) => String(i + 1)), "X", "Y"];
  if ((copies.mar || 0) > 0 || Object.keys(variants).some((key) => /^mar/i.test(key))) order.push("mar");
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
  const pieces = piecesAtResolution(piecesForChromosome(chr), options.resolution);
  if (pieces?.length) {
    return metaphaseChromosomeSVG(pieces, {
      colorMode: options.colorMode || "banding",
      bandInfo: Boolean(options.bandInfo),
      scale: options.scale || 1,
      widthScale: options.widthScale || 1,
      texture: Boolean(options.texture),
      realistic: Boolean(options.realistic),
      bendSeed: options.bendSeed || chr.id,
      mirror: Boolean(options.mirror),
      showLabels: Boolean(options.showLabels),
      referenceBp: boundMaps?.reference_bp,
    });
  }
  if (!chr.template) {
    return `<div class="chr-missing" title="Missing template"></div>`;
  }
  return schematicSVG(chr, options);
}

function escapeAttr(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
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

export function chromosomeTraits(chr) {
  const pieces = piecesForChromosome(chr);
  if (pieces?.length) {
    const total = pieces.reduce((sum, piece) => sum + (piece.weight || 0), 0) || 1;
    const cenAt = pieces.findIndex((piece) => piece.role === "centromere" || piece.arm === "cen");
    let before = 0;
    for (let index = 0; index < Math.max(0, cenAt); index += 1) before += pieces[index].weight || 0;
    const cenWeight = cenAt >= 0 ? (pieces[cenAt].weight || 0) : 0;
    return {
      cen: cenAt >= 0 ? (before + cenWeight / 2) / total : null,
      relativeLength: total,
    };
  }
  if (!chr?.template) return { cen: null, relativeLength: 0 };
  return {
    cen: Number(chr.template.cen),
    relativeLength: Number(chr.template.relativeLength) || 0,
  };
}

function resolveAttach(attach) {
  if (attach.arm === "p") {
    const segments = boundMaps?.chromosomes?.[String(attach.chromosome)]?.segments || [];
    const pter = segments.find((segment) => segment.arm === "p");
    return { ...attach, from: pter?.id || attach.band, to: attach.band };
  }
  return { ...attach, from: attach.band };
}

function piecesForChromosome(chr) {
  const identity = String(chr?.identity || "");
  const variant = String(chr?.variant || "normal");
  if (variant !== "normal" && isModelled(variant)) return buildModel(boundMaps, variant, identity)?.segments || null;
  const record = boundMaps?.chromosomes?.[identity];
  if (!record?.segments?.length) return null;
  const base = cloneSegments(record.segments);
  const spec = segmentTransform(chr.variant);
  if (!spec) return base;
  if (spec.type === "robertsonian" && spec.partner) {
    const partner = cloneSegments(boundMaps?.chromosomes?.[String(spec.partner)]?.segments || []);
    if (!partner.length) return base;
    return applyTransform(base, { type: "robertsonian", attach_segments: partner });
  }
  if (spec.attach_from) {
    const attach = resolveAttach(spec.attach_from);
    const segments = attachFromMap(boundMaps, attach.chromosome, attach.from, attach.to, attach.orientation);
    return applyTransform(base, { ...spec, attach_segments: segments });
  }
  return applyTransform(base, spec);
}

/** Map segments in drawing order for one chromosome variant, or null without a band map. */
export function drawnSegments(identity, variant = "normal") {
  return piecesForChromosome({ identity, variant });
}

/** Model details (centromeres, origins, uncertain material) for a modelled variant, or null. */
export function drawnModel(identity, variant) {
  return isModelled(variant) ? buildModel(boundMaps, variant, identity) : null;
}

/** Drawn segments at a display resolution ("400", "550", or "detailed"). */
export function drawnPieces(identity, variant = "normal", resolution = "detailed") {
  return piecesAtResolution(piecesForChromosome({ identity, variant }), resolution);
}

export function schematicForVariant(template) {
  return template;
}

const KARYOGRAM_ORDER = [...Array.from({ length: 22 }, (_, i) => String(i + 1)), "X", "Y"];

function karyogramTotal(copies, additions) {
  return Object.values(copies).reduce((sum, count) => sum + count, 0) + additions.length;
}

/**
 * Chromosomes implied by one cell line. A written count chooses whether a
 * symbol replaces a homolog or adds a chromosome. The source string is not rewritten.
 * options.ploidy sets the autosome baseline (2 diploid, 3 triploid, 4 tetraploid).
 */
export function describeKaryogram(sex, items, writtenCount = null, options = {}) {
  const complement = String(sex || "");
  if (!complement) return null;
  const ploidy = Math.max(1, Math.min(4, Number(options.ploidy) || 2));
  const copies = { ...sexCopyNumber(complement) };
  for (let n = 1; n <= 22; n += 1) copies[String(n)] = copies[String(n)] || ploidy;
  const replacements = {};
  const additions = [];
  for (const item of items || []) {
    if (item?.kind !== "numerical") continue;
    const identity = String(item.chromosomes?.[0] || "");
    if (!/^([1-9]|1\d|2[0-2]|X|Y)$/.test(identity)) continue;
    const delta = String(item.token || "").startsWith("-") ? -1 : 1;
    copies[identity] = Math.max(0, (copies[identity] || 0) + delta);
  }
  for (const item of items || []) {
    if (!item || item.kind === "numerical" || item.kind === "annotation") continue;
    const variant = String(item.variant || item.token || "");
    const copiesWritten = Math.max(1, Number(item.copies) || 1);
    const derivatives = impliedDerivatives(variant);
    if (derivatives?.length >= 2) {
      for (const piece of derivatives) {
        if (item.gain) additions.push({ identity: piece.identity, variant: piece.variant });
        else (replacements[piece.identity] = replacements[piece.identity] || []).push(piece.variant);
      }
      continue;
    }
    const modelled = isModelled(variant);
    const spec = modelled ? null : segmentTransform(variant);
    if (!spec && !modelled) continue;
    const role = modelled ? modelRole(variant) : spec.type === "robertsonian" ? "dicentric" : "replace";
    const identity = modelled ? modelIdentity(variant) : String(item.chromosomes?.[0] || "");
    if (!identity) continue;
    if (item.gain || role === "marker") {
      for (let copy = 0; copy < copiesWritten; copy += 1) additions.push({ identity, variant });
      continue;
    }
    if (role === "dicentric") {
      const [left, right] = modelled ? modelChromosomes(variant) : spec.chromosomes;
      copies[left] = Math.max(0, (copies[left] || 0) - 1);
      copies[right] = Math.max(0, (copies[right] || 0) - 1);
      additions.push({ identity: left, variant });
      continue;
    }
    const now = karyogramTotal(copies, additions);
    const target = Number.isFinite(writtenCount) ? writtenCount : null;
    const add = target == null
      ? spec?.type === "isochromosome"
      : Math.abs(now + 1 - target) < Math.abs(now - target);
    if (add) additions.push({ identity, variant });
    else (replacements[identity] = replacements[identity] || []).push(variant);
  }
  const chromosomes = [];
  for (const identity of KARYOGRAM_ORDER) {
    const queue = [...(replacements[identity] || [])];
    let remaining = copies[identity] || 0;
    while (remaining > 0 && queue.length) {
      chromosomes.push({ identity, variant: queue.shift() });
      remaining -= 1;
    }
    while (remaining > 0) {
      chromosomes.push({ identity, variant: "normal" });
      remaining -= 1;
    }
    while (queue.length) chromosomes.push({ identity, variant: queue.shift() });
  }
  chromosomes.push(...additions);
  return { chromosomes, drawnCount: chromosomes.length };
}

/**
 * Chromosome set for one written cell line. The first cell line with a sex
 * complement is used. The source formula is not rewritten.
 */
const CLONE_REF = /^(IDEM|SL|SDL\d*)$/i;

/** Expand idem / sl / sdl so a later clone carries the stemline abnormalities. */
function expandCloneLines(report) {
  const resolved = [];
  (report?.lines || []).forEach((line, index) => {
    const sex = String(line.sex || "");
    const refToken = CLONE_REF.test(sex)
      ? sex
      : (line.items || []).find((item) => item.kind === "annotation" && CLONE_REF.test(item.token))?.token;
    const match = String(refToken || "").match(CLONE_REF);
    let base = null;
    if (match && index > 0) {
      const word = match[1].toUpperCase();
      const n = match[1].match(/^SDL(\d*)$/i)?.[1];
      const target = word.startsWith("SDL") && n ? Number(n) : word === "SDL" ? Math.max(0, index - 1) : 0;
      base = resolved[Math.min(target, resolved.length - 1)];
    }
    const own = (line.items || []).filter((item) => !(item.kind === "annotation" && CLONE_REF.test(item.token)));
    resolved.push({
      ...line,
      sex: base && (!sex || CLONE_REF.test(sex)) ? base.sex : sex,
      items: [...(base ? base.items : []), ...own],
    });
  });
  return resolved;
}

export function chromosomeSetFromFormula(text) {
  const report = exploreISCN(String(text || "").trim());
  if (!report || report.status === "empty" || report.status === "unsupported") return null;
  const line = expandCloneLines(report).find((item) => item.sex && !CLONE_REF.test(item.sex));
  if (!line?.sex) return null;
  const ploidy = inferPloidy(line.count, line.ploidy, line.countRange);
  const model = describeKaryogram(line.sex, line.items, line.count, { ploidy });
  if (!model?.chromosomes?.length) return null;
  const homologs = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const seen = {};
  const variants = {};
  for (const chromosome of model.chromosomes) {
    const identity = String(chromosome.identity);
    const index = seen[identity] || 0;
    seen[identity] = index + 1;
    if (chromosome.variant && chromosome.variant !== "normal") {
      const label = homologs[index] || String(index + 1);
      variants[`${identity}${label}`] = chromosome.variant;
    }
  }
  const copy_number = {};
  for (const identity of KARYOGRAM_ORDER) copy_number[identity] = seen[identity] || 0;
  if (seen.mar) copy_number.mar = seen.mar;
  return {
    sex: line.sex,
    copy_number,
    variants,
    formula: report.raw,
    mosaic: report.status === "mosaic",
    writtenCount: line.count,
    drawnCount: model.drawnCount,
    ploidy,
  };
}

function drawHeight(template, scale) {
  const length = Number(template.relativeLength) || 1;
  return Math.max(8, Math.round((length / 8.44) * 210 * scale));
}

function schematicSVG(chr, options) {
  const template = chr.template;
  const scale = options.scale || 1;
  const height = options.height || drawHeight(template, scale);
  const widthScale = Math.max(1, Math.min(2, Number(options.widthScale) || 1));
  const cw = Math.max(11, Math.round(13 * Math.min(scale, 2.3) * widthScale));
  const gap = Math.max(3, Math.round(4 * Math.min(scale, 2) * widthScale));
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
