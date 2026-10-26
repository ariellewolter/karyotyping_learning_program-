#!/usr/bin/env python3
"""Build the local cytogenetics SQLite database from downloaded sources.

Import stays in this script. Runtime search reads the finished database.
"""

import gzip
import json
import re
import sqlite3
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / "data" / "sources"
NORMALIZED = ROOT / "data" / "normalized"
DB_PATH = ROOT / "data" / "cytogenetics.sqlite"
SCHEMA = ROOT / "schemas" / "schema.sql"
PROVENANCE = ROOT / "provenance"

DISEASE_TYPES = {
    "Disease or Syndrome": "disease",
    "Congenital Abnormality": "congenital abnormality",
    "Neoplastic Process": "neoplastic process",
    "Acquired Abnormality": "acquired abnormality",
    "Anatomical Abnormality": "anatomical abnormality",
}
NAME_PRIORITY = ["GTR", "NCI", "MSH", "ORDO", "HPO", "MONDO", "GeneReviews", "GHR", "MedGen", "NCBI"]
ALLOWED_NAMES = set(NAME_PRIORITY)
ALLOWED_DEFINITIONS = ALLOWED_NAMES
ALLOWED_IDS = {"OMIM", "MONDO", "HPO", "ORDO", "GTR", "NCI", "MSH", "GeneReviews", "GHR"}
TODAY = date.today().isoformat()


def name_key(value):
    text = re.sub(r"[^a-z0-9]+", " ", (value or "").lower())
    return re.sub(r"\s+", " ", text).strip()


def open_db():
    if DB_PATH.exists():
        DB_PATH.unlink()
    connection = sqlite3.connect(DB_PATH)
    connection.executescript(SCHEMA.read_text())
    return connection


def iter_rrf(path):
    raw = gzip.open(path, "rb").read().decode("utf-8", "replace")
    for chunk in raw.split("|\n"):
        chunk = chunk.strip("\r")
        if not chunk or chunk.startswith("#"):
            continue
        yield chunk.split("|")


def load_styles():
    styles = {}
    with gzip.open(SOURCES / "MGSTY.RRF.gz", "rt", errors="replace") as handle:
        next(handle)
        for line in handle:
            parts = line.rstrip("\n").split("|")
            if len(parts) < 4 or parts[3] not in DISEASE_TYPES:
                continue
            styles.setdefault(parts[0], set()).add(parts[3])
    return styles


def load_names(styles):
    grouped = {}
    with gzip.open(SOURCES / "MGCONSO.RRF.gz", "rt", errors="replace") as handle:
        next(handle)
        for line in handle:
            parts = line.rstrip("\n").split("|")
            if len(parts) < 13:
                continue
            cui, source, term_type, name, suppress = parts[0], parts[8], parts[9], parts[11], parts[12]
            if suppress != "N" or source not in ALLOWED_NAMES or cui not in styles:
                continue
            if term_type == "ACR" or len(name.strip()) < 4:
                continue
            grouped.setdefault(cui, []).append((source, name))
    return grouped


def load_definitions(kept):
    definitions = {}
    for fields in iter_rrf(SOURCES / "MGDEF.RRF.gz"):
        if len(fields) < 5:
            continue
        cui, source, definition = fields[0], fields[1], fields[4]
        if cui not in kept or source not in ALLOWED_DEFINITIONS or cui in definitions:
            continue
        text = re.sub(r"\s+", " ", definition).strip()
        definitions[cui] = text[:600]
    return definitions


def category_for(styles):
    for label in ("Neoplastic Process", "Congenital Abnormality", "Disease or Syndrome", "Acquired Abnormality", "Anatomical Abnormality"):
        if label in styles:
            return DISEASE_TYPES[label]
    return "disease"


def preferred_name(rows):
    for source in NAME_PRIORITY:
        for row_source, name in rows:
            if row_source == source:
                return name
    return rows[0][1]


def import_medgen(connection, log):
    styles = load_styles()
    names = load_names(styles)
    definitions = load_definitions(set(names))
    disease_rows = []
    synonym_rows = []
    for cui, rows in names.items():
        chosen = preferred_name(rows)
        disease_id = f"medgen:{cui}"
        disease_rows.append((
            disease_id, chosen, name_key(chosen), definitions.get(cui),
            category_for(styles[cui]), "verified", "NCBI MedGen", cui, TODAY,
        ))
        seen = {name_key(chosen)}
        for source, synonym in rows:
            key = name_key(synonym)
            if not key or key in seen:
                continue
            seen.add(key)
            synonym_rows.append((disease_id, synonym, key, source))
    connection.executemany(
        """INSERT INTO diseases
           (disease_id, preferred_name, name_key, description, category, record_class, source, source_record, retrieved)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        disease_rows,
    )
    connection.executemany(
        "INSERT INTO disease_synonyms (disease_id, synonym, synonym_key, source) VALUES (?, ?, ?, ?)",
        synonym_rows,
    )
    identifiers = []
    with gzip.open(SOURCES / "MedGenIDMappings.txt.gz", "rt", errors="replace") as handle:
        next(handle)
        for line in handle:
            parts = line.rstrip("\n").split("|")
            if len(parts) < 4 or parts[3] not in ALLOWED_IDS:
                continue
            disease_id = f"medgen:{parts[0]}"
            if parts[0] not in names:
                continue
            identifiers.append((disease_id, parts[3], parts[2]))
    connection.executemany(
        "INSERT INTO disease_identifiers (disease_id, system, code) VALUES (?, ?, ?)",
        identifiers,
    )
    log["medgen_diseases"] = len(disease_rows)
    log["medgen_synonyms"] = len(synonym_rows)
    log["medgen_identifiers"] = len(identifiers)
    return {row[1].lower(): row[0] for row in connection.execute("SELECT disease_id, preferred_name FROM diseases")}


def mondo_titles():
    titles = {}
    path = SOURCES / "mondo_titles.tsv"
    for line in path.read_text().splitlines():
        if "\t" not in line:
            continue
        code, title = line.split("\t", 1)
        titles[code.strip()] = title.strip()
    return titles


def parse_location(value):
    match = re.fullmatch(r"chr([^:]+):(\d+)-(\d+)", (value or "").strip())
    if not match:
        return None, None, None
    return match.group(1), int(match.group(2)), int(match.group(3))


def band_parts(band):
    chromosomes = []
    arms = []
    for piece in re.split(r"[-,]", band or ""):
        match = re.match(r"([0-9XY]+)([pq])?", piece.strip())
        if not match:
            continue
        chromosomes.append(match.group(1))
        if match.group(2):
            arms.append(match.group(2))
    return ",".join(dict.fromkeys(chromosomes)), ",".join(dict.fromkeys(arms))


def resolve_mondo(connection, mondo_id, titles, exact_names):
    existing = connection.execute(
        "SELECT disease_id FROM disease_identifiers WHERE system = 'MONDO' AND code = ?",
        (mondo_id,),
    ).fetchone()
    if existing:
        return existing[0]
    title = titles.get(mondo_id)
    if title and title.lower() in exact_names:
        return exact_names[title.lower()]
    disease_id = f"mondo:{mondo_id}"
    preferred = title or mondo_id
    connection.execute(
        """INSERT OR IGNORE INTO diseases
           (disease_id, preferred_name, name_key, description, category, record_class, source, source_record, retrieved)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (disease_id, preferred, name_key(preferred), None, "disease", "verified", "MONDO title via ClinGen", mondo_id, TODAY),
    )
    connection.execute(
        "INSERT INTO disease_identifiers (disease_id, system, code) VALUES (?, 'MONDO', ?)",
        (disease_id, mondo_id),
    )
    return disease_id


def add_dosage(connection, abnormality_id, kind, label, score, description, pmids, disease_id, source, source_record, band, location, genes):
    chrom, start, end = parse_location(location)
    chromosomes, arms = band_parts(band)
    connection.execute(
        """INSERT OR IGNORE INTO abnormalities
           (abnormality_id, abnormality_type, chromosomes, arms, bands, assembly, genomic_location,
            chrom, start_pos, end_pos, genes, iscn, record_class, source, source_record, evidence_label)
           VALUES (?, ?, ?, ?, ?, 'GRCh38', ?, ?, ?, ?, ?, NULL, 'verified', ?, ?, ?)""",
        (abnormality_id, kind, chromosomes, arms, band, location if start else None,
         chrom, start, end, genes, source, source_record, label),
    )
    if disease_id:
        connection.execute(
            """INSERT OR IGNORE INTO associations
               (disease_id, abnormality_id, association_type, evidence_source, evidence_strength, match_class)
               VALUES (?, ?, ?, ?, ?, 'verified')""",
            (disease_id, abnormality_id, kind, source, f"score {score}: {description}"),
        )
    for pmid in pmids:
        if pmid:
            connection.execute(
                "UPDATE abnormalities SET evidence_label = evidence_label || ? WHERE abnormality_id = ? AND evidence_label NOT LIKE ?",
                (f"; PMID {pmid}", abnormality_id, f"%PMID {pmid}%"),
            )


def dosage_kind(score, side):
    try:
        value = int(score)
    except ValueError:
        return None
    if value in (1, 2, 3):
        return "deletion" if side == "hi" else "duplication"
    if value == 30:
        return "autosomal recessive phenotype"
    return None


def import_clingen(connection, exact_names, log):
    titles = mondo_titles()
    region_date = "28 Apr 2026"
    gene_date = "25 Oct 2026"
    counts = {"regions": 0, "genes": 0, "associations": 0}

    def rows(path):
        for line in path.read_text().splitlines():
            if not line or line.startswith("#"):
                continue
            yield line.split("\t")

    for fields in rows(SOURCES / "ClinGen_region_curation_list_GRCh38.tsv"):
        if len(fields) < 23:
            continue
        isca, region_name, band, location = fields[0], fields[1], fields[2], fields[3]
        counts["regions"] += 1
        for side, offset, kind_name in (("hi", 4, "haploinsufficiency"), ("ts", 12, "triplosensitivity")):
            kind = dosage_kind(fields[offset], side)
            if not kind:
                continue
            mondo = fields[21] if side == "hi" else fields[22]
            disease_id = resolve_mondo(connection, mondo, titles, exact_names) if mondo else None
            pmids = [item for item in fields[offset + 2:offset + 8] if item]
            add_dosage(
                connection, f"clingen:{isca}:{side}", kind, f"{region_name}; {kind_name}",
                fields[offset], fields[offset + 1], pmids, disease_id,
                "ClinGen dosage sensitivity", isca, band, location, None,
            )
            counts["associations"] += 1

    for fields in rows(SOURCES / "ClinGen_gene_curation_list_GRCh38.tsv"):
        if len(fields) < 23:
            continue
        symbol, gene_id, band, location = fields[0], fields[1], fields[2], fields[3]
        counts["genes"] += 1
        for side, offset in (("hi", 4), ("ts", 12)):
            kind = dosage_kind(fields[offset], side)
            if not kind:
                continue
            mondo = fields[21] if side == "hi" else fields[22]
            disease_id = resolve_mondo(connection, mondo, titles, exact_names) if mondo else None
            pmids = [item for item in fields[offset + 2:offset + 8] if item]
            add_dosage(
                connection, f"clingen-gene:{symbol}:{side}", kind, f"{symbol} {side}",
                fields[offset], fields[offset + 1], pmids, disease_id,
                "ClinGen dosage sensitivity", gene_id, band, location, symbol,
            )
            counts["associations"] += 1
    log["clingen"] = counts
    log["clingen_region_file_date"] = region_date
    log["clingen_gene_file_date"] = gene_date


def ensure_educational_disease(connection, disease_name, exact_names):
    found = exact_names.get(disease_name.lower())
    if found:
        return found
    disease_id = f"educational:{name_key(disease_name).replace(' ', '-')}"
    connection.execute(
        """INSERT OR IGNORE INTO diseases
           (disease_id, preferred_name, name_key, description, category, record_class, source, source_record, retrieved)
           VALUES (?, ?, ?, ?, 'disease', 'educational', 'Educational example', ?, ?)""",
        (disease_id, disease_name, name_key(disease_name),
         "Curated educational example. No redistributable disease-source record was matched by this exact name.",
         disease_name, TODAY),
    )
    exact_names[disease_name.lower()] = disease_id
    return disease_id


def parse_events(formula):
    events = re.findall(r"(?:del|dup|inv|t|ins)\([^)]+\)(?:\([^)]+\))?", formula)
    events.extend(re.findall(r"(?<![A-Za-z])[+-](?:[0-9]+|[XY])\b", formula))
    return events


def import_educational(connection, exact_names, log):
    payload = json.loads((NORMALIZED / "educational.json").read_text())
    for example in payload["examples"]:
        disease_id = ensure_educational_disease(connection, example["disease_name"], exact_names)
        abnormality_id = f"educational:{name_key(example['disease_name']).replace(' ', '-')}"
        connection.execute(
            """INSERT OR IGNORE INTO abnormalities
               (abnormality_id, abnormality_type, chromosomes, arms, bands, assembly, genomic_location,
                chrom, start_pos, end_pos, genes, iscn, record_class, source, source_record, evidence_label)
               VALUES (?, ?, ?, NULL, ?, NULL, NULL, NULL, NULL, NULL, ?, ?, 'educational', 'Educational example', ?, 'curated educational example')""",
            (abnormality_id, example["abnormality_type"], ",".join(example["chromosomes"]),
             ",".join(example["bands"]), ",".join(example["genes"]), example["iscn"][0], example["disease_name"]),
        )
        connection.execute(
            """INSERT OR IGNORE INTO associations
               (disease_id, abnormality_id, association_type, evidence_source, evidence_strength, match_class)
               VALUES (?, ?, ?, 'Educational example', 'curated teaching example', 'educational')""",
            (disease_id, abnormality_id, example["abnormality_type"]),
        )
        for formula in example["iscn"]:
            connection.execute(
                """INSERT INTO iscn_records
                   (original, normalized, events_json, abnormality_id, disease_id, record_class, source, source_record)
                   VALUES (?, ?, ?, ?, ?, 'educational', 'Educational example', ?)""",
                (formula, normalize_iscn(formula), json.dumps(parse_events(formula)),
                 abnormality_id, disease_id, example["disease_name"]),
            )
        fusion = example.get("fusion")
        if fusion:
            left, right = fusion.split("::")
            connection.execute(
                """INSERT OR IGNORE INTO gene_fusions
                   (fusion_id, gene_a, gene_b, symbol, symbol_key, rearrangement, record_class, source)
                   VALUES (?, ?, ?, ?, ?, ?, 'educational', 'Educational example')""",
                (f"educational:{fusion}", left, right, fusion, fusion.lower(), example["iscn"][0]),
            )
            connection.execute(
                "INSERT OR IGNORE INTO fusion_diseases (fusion_id, disease_id, match_class) VALUES (?, ?, 'educational')",
                (f"educational:{fusion}", disease_id),
            )
    for probe in payload["probes"]:
        disease_id = ensure_educational_disease(connection, probe["disease_name"], exact_names)
        connection.execute(
            """INSERT INTO fish_probes
               (probe_id, probe_name, strategy, reference_note, documentation, record_class, source)
               VALUES (?, ?, ?, ?, ?, 'educational', 'Educational example')""",
            (probe["probe_id"], probe["probe_name"], probe["strategy"],
             "Educational summary. Not copied from a manufacturer diagram.", probe["documentation"]),
        )
        for index, target in enumerate(probe["targets"]):
            connection.execute(
                "INSERT INTO fish_targets (probe_id, locus, gene, fluorophore, sort_order) VALUES (?, ?, ?, ?, ?)",
                (probe["probe_id"], target["locus"], target["gene"], target["fluorophore"], index),
            )
        for pattern in probe["patterns"]:
            connection.execute(
                "INSERT INTO fish_patterns (probe_id, pattern_role, pattern, note) VALUES (?, ?, ?, ?)",
                (probe["probe_id"], pattern["role"], pattern["pattern"], pattern["note"]),
            )
        connection.execute(
            "INSERT INTO fish_probe_diseases (probe_id, disease_id) VALUES (?, ?)",
            (probe["probe_id"], disease_id),
        )
    log["educational_examples"] = len(payload["examples"])
    log["educational_probes"] = len(payload["probes"])


def normalize_iscn(value):
    parts = re.sub(r"\s+", "", value.strip()).split(",")
    if len(parts) > 1:
        parts[1] = parts[1].upper()
    return ",".join(parts)


def import_teaching_catalog(connection, exact_names, log):
    catalog_path = ROOT.parent / "data" / "diseases.json"
    if not catalog_path.exists():
        log["teaching_catalog_iscn"] = 0
        return
    catalog = json.loads(catalog_path.read_text())
    added = 0
    for disease in catalog.get("diseases") or []:
        formulas = []
        for case in disease.get("cytogenetic_cases") or []:
            representative = (case.get("representative_teaching_karyotype") or {}).get("iscn")
            if representative:
                formulas.append(representative)
            formulas.extend(case.get("example_notation") or [])
        if not formulas:
            continue
        disease_id = ensure_educational_disease(connection, disease.get("disease_name") or disease["id"], exact_names)
        connection.execute(
            "UPDATE diseases SET record_class = 'teaching-catalog', source = 'Teaching catalog' WHERE disease_id = ? AND record_class = 'educational'",
            (disease_id,),
        )
        for formula in dict.fromkeys(formulas):
            normalized = normalize_iscn(formula)
            if normalized in {"46,XX", "46,XY"}:
                continue
            existing = connection.execute(
                "SELECT 1 FROM iscn_records WHERE normalized = ? AND disease_id = ?",
                (normalized, disease_id),
            ).fetchone()
            if existing:
                continue
            connection.execute(
                """INSERT INTO iscn_records
                   (original, normalized, events_json, abnormality_id, disease_id, record_class, source, source_record)
                   VALUES (?, ?, '[]', NULL, ?, 'teaching-catalog', 'Teaching catalog', ?)""",
                (formula, normalized, disease_id, disease.get("id")),
            )
            added += 1
    log["teaching_catalog_iscn"] = added


def import_verifications(connection, exact_names, log):
    """Promote ledger entries that a reviewer verified with a complete source record."""
    from update_verification_ledger import LEDGER, entry_problems

    log["verified_iscn"] = 0
    log["verification_pending"] = 0
    log["verification_incomplete"] = []
    if not LEDGER.exists():
        return
    for entry in json.loads(LEDGER.read_text()).get("entries", []):
        if entry.get("status") != "verified":
            log["verification_pending"] += entry.get("status") == "pending"
            continue
        problems = entry_problems(entry)
        if problems:
            log["verification_incomplete"].append({"iscn": entry.get("iscn"), "missing": problems})
            continue
        disease_id = ensure_educational_disease(connection, entry.get("disease") or entry["teaching_catalog_id"], exact_names)
        source = entry["source"]
        updated = connection.execute(
            "UPDATE iscn_records SET record_class = 'verified', source = ?, source_record = ? WHERE normalized = ? AND disease_id = ?",
            (source["citation"], source["identifier"], entry["normalized"], disease_id),
        ).rowcount
        log["verified_iscn"] += updated


def write_provenance(connection, log):
    PROVENANCE.mkdir(exist_ok=True)
    sources = [
        {
            "source_id": "medgen",
            "title": "NCBI MedGen",
            "url": "https://ftp.ncbi.nlm.nih.gov/pub/medgen/",
            "retrieved": TODAY,
            "file_date": "FTP files retrieved for this build; MedGen is refreshed weekly",
            "license_note": "NLM-authored MedGen content is public domain. SNOMED CT strings and OMIM narrative were not copied. External identifiers, including OMIM numbers, were stored.",
            "record_count": log["medgen_diseases"],
        },
        {
            "source_id": "clingen",
            "title": "ClinGen dosage sensitivity",
            "url": "https://ftp.clinicalgenome.org/",
            "retrieved": TODAY,
            "file_date": f"regions {log['clingen_region_file_date']}; genes {log['clingen_gene_file_date']}; assembly GRCh38 GCF_000001405.36",
            "license_note": "ClinGen curation lists are public resources. Evidence scores and coordinates are stored as published. ISCN was not generated for a region.",
            "record_count": log["clingen"]["associations"],
        },
        {
            "source_id": "educational",
            "title": "Educational examples",
            "url": None,
            "retrieved": TODAY,
            "file_date": TODAY,
            "license_note": "Original short teaching examples. Not copied from the teaching application or from manufacturer catalogs.",
            "record_count": log["educational_examples"],
        },
        {
            "source_id": "mitelman",
            "title": "Mitelman Database",
            "url": "https://mitelmandatabase.isb-cgc.org/",
            "retrieved": None,
            "file_date": None,
            "license_note": "Not bundled. No redistributable bulk download with permission for a student desktop application was identified.",
            "record_count": 0,
        },
    ]
    for source in sources:
        connection.execute(
            """INSERT INTO source_meta
               (source_id, title, url, retrieved, file_date, license_note, record_count)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (source["source_id"], source["title"], source["url"], source["retrieved"],
             source["file_date"], source["license_note"], source["record_count"]),
        )
    (PROVENANCE / "sources.json").write_text(json.dumps({"built": TODAY, "sources": sources}, indent=2) + "\n")
    (PROVENANCE / "import-log.json").write_text(json.dumps({"built": TODAY, **log}, indent=2) + "\n")


def main():
    connection = open_db()
    log = {}
    exact_names = import_medgen(connection, log)
    import_clingen(connection, exact_names, log)
    import_educational(connection, exact_names, log)
    import_teaching_catalog(connection, exact_names, log)
    import_verifications(connection, exact_names, log)
    write_provenance(connection, log)
    connection.commit()
    print(json.dumps(log, indent=2))
    print(f"database {DB_PATH}")


if __name__ == "__main__":
    main()
