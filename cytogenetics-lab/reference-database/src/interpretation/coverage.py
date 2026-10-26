"""Counts for the coverage report. Teaching activities stay in the lab catalog."""

import json
from pathlib import Path

from interpretation.engine import interpret_iscn, load_teaching_index
from search.reference_database import connect

ROOT = Path(__file__).resolve().parents[2]


def build_coverage():
    connection = connect()
    diseases = connection.execute("SELECT COUNT(*) AS n FROM diseases").fetchone()["n"]
    verified_iscn = connection.execute(
        "SELECT COUNT(DISTINCT disease_id) AS n FROM iscn_records WHERE record_class = 'verified'"
    ).fetchone()["n"]
    educational_iscn = connection.execute(
        "SELECT COUNT(DISTINCT disease_id) AS n FROM iscn_records WHERE record_class = 'educational'"
    ).fetchone()["n"]
    teaching_iscn = connection.execute(
        "SELECT COUNT(DISTINCT disease_id) AS n FROM iscn_records WHERE record_class = 'teaching-catalog'"
    ).fetchone()["n"]
    iscn_rows = connection.execute(
        "SELECT DISTINCT disease_id, original FROM iscn_records"
    ).fetchall()
    visual_diseases = set()
    interpreted = 0
    for row in iscn_rows:
        report = interpret_iscn(row["original"])
        if report["status"] == "complete":
            interpreted += 1
        if report["visualization"]:
            visual_diseases.add(row["disease_id"])
    fish_diseases = connection.execute(
        "SELECT COUNT(DISTINCT disease_id) AS n FROM fish_probe_diseases"
    ).fetchone()["n"]
    fish_probes = connection.execute("SELECT COUNT(*) AS n FROM fish_probes").fetchone()["n"]
    connection.close()
    teaching = load_teaching_index()
    catalog_path = ROOT.parent / "data" / "diseases.json"
    teaching_records = 0
    if catalog_path.exists():
        teaching_records = len(json.loads(catalog_path.read_text()).get("diseases") or [])
    return {
        "disease_records": diseases,
        "diseases_with_verified_iscn": verified_iscn,
        "diseases_with_educational_iscn": educational_iscn,
        "diseases_with_teaching_catalog_iscn": teaching_iscn,
        "stored_iscn_strings_fully_interpreted": interpreted,
        "diseases_with_chromosome_visualization": len(visual_diseases),
        "fish_probe_definitions": fish_probes,
        "diseases_with_fish_assays": fish_diseases,
        "teaching_catalog_diseases": teaching_records,
        "complete_teaching_activities": len(teaching),
        "notes": [
            "Disease records are MedGen, Mondo, and educational rows in the reference database.",
            "Verified ISCN means an ISCN string stored from a reference source. Educational ISCN strings are labeled examples, not MedGen text.",
            "Chromosome visualization counts stored formulas the drawer can attempt. A schematic is not a structure-validated reconstruction unless the validation level says so.",
            "Teaching-catalog ISCN strings are the canonical examples already in the 29 laboratory diseases. They are not external verified diagnoses. Normal 46,XX and 46,XY were not stored as disease associations.",
            "Complete teaching activities are entries in the laboratory disease-activities catalog. They are not generated from the reference database.",
        ],
    }


def write_report(target=None):
    payload = build_coverage()
    lines = [
        "# Reference coverage",
        "",
        "These counts separate the reference database from the teaching catalog.",
        "",
        f"- Reference disease records: {payload['disease_records']}",
        f"- Diseases with a verified ISCN association: {payload['diseases_with_verified_iscn']}",
        f"- Diseases with an educational ISCN example: {payload['diseases_with_educational_iscn']}",
        f"- Diseases with a teaching-catalog ISCN string: {payload['diseases_with_teaching_catalog_iscn']}",
        f"- Stored ISCN strings the engine interprets completely: {payload['stored_iscn_strings_fully_interpreted']}",
        f"- Diseases with a schematic chromosome visualization: {payload['diseases_with_chromosome_visualization']}",
        f"- FISH probe definitions: {payload['fish_probe_definitions']}",
        f"- Diseases with a probe-specific FISH assay: {payload['diseases_with_fish_assays']}",
        f"- Teaching-catalog disease records: {payload['teaching_catalog_diseases']}",
        f"- Complete teaching activities: {payload['complete_teaching_activities']}",
        "",
    ]
    for note in payload["notes"]:
        lines.append(f"- {note}")
    lines.append("")
    text = "\n".join(lines)
    destination = target or (ROOT / "docs" / "COVERAGE.md")
    destination.parent.mkdir(exist_ok=True)
    destination.write_text(text)
    return payload
