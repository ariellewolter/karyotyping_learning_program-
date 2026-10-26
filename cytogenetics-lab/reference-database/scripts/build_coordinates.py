"""Coordinates facet for the catalog source review.

Each disease's region is resolved from downloaded reference files only:
ClinGen region and gene curation lists (GRCh38) and the UCSC hg38 cytoband
ideogram. The regions per disease are listed by name below. The script
fails loudly if a name does not resolve, rather than inventing coordinates.
"""
import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / "data" / "sources"
CYTOBAND = ROOT.parent / "data" / "reference" / "hg38-cytoBandIdeo.txt"
OUT = ROOT / "data" / "review" / "coordinates.json"

CLINGEN_REGION_URL = "https://ftp.clinicalgenome.org/ClinGen_region_curation_list_GRCh38.tsv"
CLINGEN_GENE_URL = "https://ftp.clinicalgenome.org/ClinGen_gene_curation_list_GRCh38.tsv"
CYTOBAND_URL = "https://hgdownload.soe.ucsc.edu/goldenPath/hg38/database/cytoBandIdeo.txt.gz"

# region: ClinGen region-name pattern; gene: ClinGen gene symbol; band: cytoband span or whole chromosome.
# Fusion partners that ClinGen does not dosage-curate use the breakpoint bands written in the catalog ISCN.
TARGETS = {
    "down-syndrome": [("band", "chr21")],
    "edwards-syndrome": [("band", "chr18")],
    "patau-syndrome": [("band", "chr13")],
    "turner": [("band", "chrX")],
    "klinefelter": [("band", "chrX"), ("band", "chrY")],
    "triple-x": [("band", "chrX")],
    "xyy": [("band", "chrY")],
    "cri-du-chat": [("region", r"cri du chat|Cri-du-chat|5p15"), ("band", "5p15.33-p15.2")],
    "wolf-hirschhorn": [("region", r"Wolf-Hirschhorn"), ("band", "4p16.3")],
    "cml": [("band", "9q34"), ("band", "22q11.2")],
    "apl": [("band", "15q24.1"), ("band", "17q21.2")],
    "burkitt": [("band", "8q24"), ("band", "14q32"), ("band", "2p12"), ("band", "22q11")],
    "aml-runx1": [("band", "8q22"), ("band", "21q22")],
    "aml-inv16": [("band", "16p13.1"), ("band", "16q22")],
    "alk-alcl": [("band", "2p23"), ("band", "5q35")],
    "angelman": [("region", r"15q11\.2q13 recurrent \(PWS/AS\)"), ("gene", "UBE3A")],
    "prader-willi": [("region", r"15q11\.2q13 recurrent \(PWS/AS\)")],
    "digeorge": [("region", r"22q11\.2 recurrent \(DGS\) region \(proximal"), ("gene", "TBX1")],
    "williams": [("region", r"7q11\.23 recurrent \(Williams-Beuren|Williams"), ("gene", "ELN")],
    "cll-del13q": [("band", "13q14.2-q14.3")],
    "kmt2a": [("gene", "KMT2A"), ("band", "11q23")],
    "ewing": [("band", "11q24"), ("band", "22q12")],
    "del-1p36": [("region", r"1p36 terminal region")],
    "del-8p": [("band", "8p23.3-p23.1")],
    "del-9p": [("band", "9p24.3-p22.1")],
    "jacobsen": [("band", "11q23.3-q25")],
    "miller-dieker": [("region", r"17p13\.3 \(Miller-Dieker")],
    "smith-magenis": [("region", r"17p11\.2 recurrent \(SMS/PLS\)")],
    "wagr": [("region", r"11p13 \(WAGR"), ("gene", "WT1")],
}


def read_tsv(path):
    lines = [line for line in path.read_text().splitlines() if line.strip()]
    header_index = max(i for i, line in enumerate(lines) if line.startswith("#") and "\t" in line)
    header = [name.lstrip("#") for name in lines[header_index].split("\t")]
    return [dict(zip(header, line.split("\t"))) for line in lines[header_index + 1:] if not line.startswith("#")]


def read_cytobands():
    rows = []
    for line in CYTOBAND.read_text().splitlines():
        chrom, start, end, name, stain = line.split("\t")[:5]
        if name:
            rows.append({"chrom": chrom, "start": int(start), "end": int(end), "band": f"{chrom[3:]}{name}", "stain": stain})
    return rows


def band_span(bands, spec):
    if re.fullmatch(r"chr[\dXY]+", spec):
        rows = [row for row in bands if row["chrom"] == spec]
        return rows and {"chrom": spec, "start": rows[0]["start"], "end": rows[-1]["end"], "label": f"chromosome {spec[3:]}"}
    match = re.fullmatch(r"(\d+|X|Y)([pq][\d.]+)(?:-([pq][\d.]+))?", spec)
    chrom = f"chr{match.group(1)}"
    labels = [f"{match.group(1)}{match.group(2)}", f"{match.group(1)}{match.group(3) or match.group(2)}"]
    hits = [row for row in bands if row["chrom"] == chrom and any(row["band"] == label or row["band"].startswith(label) for label in labels)]
    if not hits:
        return None
    return {"chrom": chrom, "start": min(row["start"] for row in hits), "end": max(row["end"] for row in hits), "label": spec}


def main():
    regions = [row for row in read_tsv(SOURCES / "ClinGen_region_curation_list_GRCh38.tsv") if "population region" not in row.get("ISCA Region Name", "")]
    genes = {row["Gene Symbol"]: row for row in read_tsv(SOURCES / "ClinGen_gene_curation_list_GRCh38.tsv")}
    bands = read_cytobands()
    out = {"description": "Coordinates facet built from downloaded ClinGen GRCh38 lists and the UCSC hg38 cytoband ideogram.", "diseases": {}, "unresolved": []}
    for disease, targets in TARGETS.items():
        resolved = []
        for kind, spec in targets:
            if kind == "region":
                hits = [row for row in regions if re.search(spec, row["ISCA Region Name"], re.I)]
                if not hits:
                    out["unresolved"].append({"disease": disease, "kind": kind, "spec": spec})
                    continue
                for row in hits[:2]:
                    resolved.append({
                        "kind": "ClinGen region", "name": row["ISCA Region Name"], "cytoband": row["cytoBand"], "grch38": row["Genomic Location"],
                        "haploinsufficiency_score": row.get("Haploinsufficiency Score", ""),
                        "source": {"citation": "ClinGen Dosage Sensitivity Curation, region list (GRCh38)", "identifier": row["ISCA ID"], "url": CLINGEN_REGION_URL,
                                   "excerpt": "\t".join([row["ISCA ID"], row["ISCA Region Name"], row["cytoBand"], row["Genomic Location"]])},
                    })
            elif kind == "gene":
                row = genes.get(spec)
                if not row:
                    out["unresolved"].append({"disease": disease, "kind": kind, "spec": spec})
                    continue
                resolved.append({
                    "kind": "ClinGen gene", "name": spec, "cytoband": row["cytoBand"], "grch38": row["Genomic Location"],
                    "source": {"citation": "ClinGen Dosage Sensitivity Curation, gene list (GRCh38)", "identifier": f"NCBI Gene {row['Gene ID']}", "url": CLINGEN_GENE_URL,
                               "excerpt": "\t".join([spec, row["Gene ID"], row["cytoBand"], row["Genomic Location"]])},
                })
            else:
                span = band_span(bands, spec)
                if not span:
                    out["unresolved"].append({"disease": disease, "kind": kind, "spec": spec})
                    continue
                resolved.append({
                    "kind": "cytoband span", "name": span["label"], "cytoband": span["label"], "grch38": f"{span['chrom']}:{span['start'] + 1}-{span['end']}",
                    "source": {"citation": "UCSC Genome Browser hg38 cytoBandIdeo", "identifier": "hg38 cytoBandIdeo", "url": CYTOBAND_URL,
                               "excerpt": f"{span['chrom']} {span['start']} {span['end']} {span['label']}"},
                })
        out["diseases"][disease] = resolved
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(f"{sum(len(v) for v in out['diseases'].values())} coordinate records; unresolved: {out['unresolved']}")


if __name__ == "__main__":
    main()
