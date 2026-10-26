/**
 * GRCh38 coordinates and external genome-browser links for a written band.
 * Coordinates come from data/chromosome-maps.json.
 */

import { labelCovers, parseBandLabel } from "./banding.js?v=20261024c";

/** Base-pair interval covered by a band name and all of its subdivisions, or null. */
export function bandInterval(maps, label) {
  const parsed = parseBandLabel(label);
  if (!parsed?.chromosome) return null;
  const segments = maps?.chromosomes?.[parsed.chromosome]?.segments || [];
  const covered = segments.filter((segment) => segment.role !== "centromere" && labelCovers(parsed.label, segment.label || segment.id));
  if (!covered.length) return null;
  return {
    chromosome: parsed.chromosome,
    label: parsed.label,
    start: Math.min(...covered.map((segment) => segment.start_bp)),
    end: Math.max(...covered.map((segment) => segment.end_bp)),
    assembly: maps?.assembly || "GRCh38",
  };
}

/** Links to UCSC, Ensembl, and NCBI for a band name. Empty when the band is not in the map. */
export function bandLinks(maps, label) {
  const interval = bandInterval(maps, label);
  if (!interval) return [];
  const { chromosome, start, end } = interval;
  const from = start + 1;
  return [
    { name: "UCSC", href: `https://genome.ucsc.edu/cgi-bin/hgTracks?db=hg38&position=chr${chromosome}:${from}-${end}` },
    { name: "Ensembl", href: `https://www.ensembl.org/Homo_sapiens/Location/View?r=${chromosome}:${from}-${end}` },
    { name: "NCBI", href: `https://www.ncbi.nlm.nih.gov/genome/gdv/browser/genome/?id=GCF_000001405.40&chr=${chromosome}&from=${from}&to=${end}` },
  ];
}

export function formatMb(bp) {
  return `${(Number(bp) / 1e6).toFixed(2)} Mb`;
}
