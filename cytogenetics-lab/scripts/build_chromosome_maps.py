#!/usr/bin/env python3
"""Build chromosome-maps.json from the UCSC GRCh38 cytoBandIdeo table.

The table is stored at data/reference/hg38-cytoBandIdeo.txt.
Only primary chromosomes 1–22, X, and Y are written. Alternate and unplaced
sequences in that file are ignored. Band names and base-pair coordinates are
copied from the table. No bands are added.
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "reference" / "hg38-cytoBandIdeo.txt"
OUT = ROOT / "data" / "chromosome-maps.json"

STAIN = {
    "gneg": 0,
    "gpos25": 1,
    "gpos50": 2,
    "gpos75": 3,
    "gpos100": 4,
    "gvar": 5,
    "stalk": 6,
    "acen": 5,
}
PRIMARY = [str(n) for n in range(1, 23)] + ["X", "Y"]
BAND_RE = re.compile(r"^([pq])(\d)(\d)?(?:\.(\d+))?$")


def morphology(index, has_stalk):
    """Group label derived from the ideogram. A stalk band marks an acrocentric
    short arm. Otherwise the centromere midpoint fraction is used."""
    if has_stalk or index < 0.22:
        return "acrocentric"
    if index >= 0.44:
        return "metacentric"
    return "submetacentric"


def parse_name(name):
    match = BAND_RE.match(name)
    if not match:
        raise SystemExit(f"Unrecognized band name: {name}")
    arm, region, band, subband = match.groups()
    return {
        "arm": arm,
        "region": int(region),
        "band": int(band) if band is not None else None,
        "subband": int(subband) if subband is not None else None,
    }


def load_rows():
    grouped = {chrom: [] for chrom in PRIMARY}
    with SOURCE.open() as handle:
        for line in handle:
            chrom, start, end, name, stain = line.rstrip("\n").split("\t")
            if not chrom.startswith("chr"):
                continue
            ident = chrom[3:]
            if ident not in grouped:
                continue
            grouped[ident].append({
                "start": int(start),
                "end": int(end),
                "name": name,
                "stain": stain,
            })
    return grouped


def build_chromosome(ident, rows):
    if not rows:
        raise SystemExit(f"Chromosome {ident} has no ideogram rows")
    rows = sorted(rows, key=lambda row: row["start"])
    for index in range(1, len(rows)):
        if rows[index]["start"] != rows[index - 1]["end"]:
            raise SystemExit(f"Gap or overlap on chromosome {ident} at {rows[index]['name']}")
    acen = [row for row in rows if row["stain"] == "acen"]
    if len(acen) != 2:
        raise SystemExit(f"Chromosome {ident} has {len(acen)} centromere bands")
    if rows[rows.index(acen[1]) - 1] is not acen[0]:
        raise SystemExit(f"Centromere bands on chromosome {ident} are not adjacent")

    segments = []
    order = 0
    cen_start = acen[0]["start"]
    cen_end = acen[1]["end"]
    for row in rows:
        if row["stain"] == "acen":
            continue
        parsed = parse_name(row["name"])
        if parsed["arm"] == "p" and row["start"] >= cen_start:
            raise SystemExit(f"{ident}{row['name']} is on the wrong side of the centromere")
        if parsed["arm"] == "q" and row["end"] <= cen_end:
            raise SystemExit(f"{ident}{row['name']} is on the wrong side of the centromere")
        label = f"{ident}{row['name']}"
        parent_band = f"{ident}{parsed['arm']}{parsed['region']}"
        if parsed["band"] is not None:
            parent_band += str(parsed["band"])
        segment = {
            "id": label,
            "chromosome": ident,
            "arm": parsed["arm"],
            "region": parsed["region"],
            "band": parsed["band"],
            "subband": parsed["subband"],
            "label": label,
            "parent_band": parent_band,
            "parent_region": f"{ident}{parsed['arm']}{parsed['region']}",
            "role": "band",
            "stain": STAIN[row["stain"]],
            "gie_stain": row["stain"],
            "weight": row["end"] - row["start"],
            "start_bp": row["start"],
            "end_bp": row["end"],
            "orientation": "forward",
            "proximal_order": order,
            "start_boundary": order,
            "end_boundary": order + 1,
        }
        if row["stain"] == "stalk":
            segment["structure"] = "stalk"
        segments.append(segment)
        order += 1
        if row["end"] == cen_start:
            segments.append({
                "id": f"{ident}cen",
                "chromosome": ident,
                "arm": "cen",
                "region": None,
                "band": None,
                "subband": None,
                "label": "cen",
                "parent_band": f"{ident}cen",
                "parent_region": "cen",
                "role": "centromere",
                "structure": "centromere",
                "stain": 5,
                "gie_stain": "acen",
                "weight": cen_end - cen_start,
                "start_bp": cen_start,
                "end_bp": cen_end,
                "source_bands": [f"{ident}{acen[0]['name']}", f"{ident}{acen[1]['name']}"],
                "orientation": "forward",
                "proximal_order": order,
                "start_boundary": order,
                "end_boundary": order + 1,
            })
            order += 1

    length = rows[-1]["end"]
    if rows[0]["start"] != 0:
        raise SystemExit(f"Chromosome {ident} does not start at base 0")
    if segments[-1]["end_bp"] != length:
        raise SystemExit(f"Chromosome {ident} does not end on its last band")
    if sum(segment["role"] == "centromere" for segment in segments) != 1:
        raise SystemExit(f"Chromosome {ident} does not have one centromere segment")
    index = (cen_start + (cen_end - cen_start) / 2) / length
    has_stalk = any(row["stain"] == "stalk" for row in rows)
    return {
        "id": ident,
        "length_bp": length,
        "centromere_start_bp": cen_start,
        "centromere_end_bp": cen_end,
        "centromere_index": round(index, 4),
        "morphology": morphology(index, has_stalk),
        "segments": segments,
    }


def main():
    grouped = load_rows()
    chromosomes = {ident: build_chromosome(ident, grouped[ident]) for ident in PRIMARY}
    document = {
        "description": "G-band ideograms for human chromosomes 1–22, X, and Y. Coordinates and stain calls are the NCBI ideogram distributed by UCSC as cytoBandIdeo for GRCh38/hg38. Alternate contigs in that file are not included. The two acen intervals on each chromosome are stored as one centromere segment spanning their published coordinates.",
        "assembly": "GRCh38/hg38",
        "source": "UCSC Genome Browser cytoBandIdeo",
        "source_url": "https://hgdownload.soe.ucsc.edu/goldenPath/hg38/database/cytoBandIdeo.txt.gz",
        "source_file": "data/reference/hg38-cytoBandIdeo.txt",
        "resolution": "NCBI GRCh38 ideogram bands (862 bands across the 24 chromosome types)",
        "retrieved": "2026-10-24",
        "reference_bp": chromosomes["1"]["length_bp"],
        "stain_scale": {
            "0": "gneg",
            "1": "gpos25",
            "2": "gpos50",
            "3": "gpos75",
            "4": "gpos100",
            "5": "gvar/acen",
            "6": "stalk",
        },
        "chromosomes": chromosomes,
    }
    OUT.write_text(json.dumps(document, indent=2) + "\n")
    band_count = sum(len(item["segments"]) for item in chromosomes.values())
    print(f"wrote {OUT.name}: {len(chromosomes)} chromosomes, {band_count} segments")
    for ident in PRIMARY:
        item = chromosomes[ident]
        print(
            f"  {ident:>2}  {item['length_bp']:>12} bp  cen {item['centromere_index']:.3f}  "
            f"{item['morphology']:<14} segments {len(item['segments'])}"
        )


if __name__ == "__main__":
    main()
