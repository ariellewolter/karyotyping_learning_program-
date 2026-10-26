"""Add teaching-catalog ISCN strings to the verification ledger.

Existing entries keep their review work. New strings start as "pending".
An entry becomes "verified" only by a reviewer filling in the source fields;
this script never changes a status.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from search.reference_database import normalize_iscn  # noqa: E402

CATALOG = ROOT.parent / "data" / "diseases.json"
LEDGER = ROOT / "data" / "normalized" / "iscn-verification.json"

RULES = [
    "Verify each string against an authoritative source: peer-reviewed literature, a curated database, a consensus guideline, or the ISCN itself.",
    "Record the exact source citation, a stable identifier (PMID, DOI, database accession, or ISCN edition and page), and the date reviewed.",
    "State whether the source shows this exact ISCN string or only the cytogenetic finding. Use exact_string_in_source true or false.",
    "Record the disease and the cytogenetic finding as the source states them, and any limitation: mosaicism, alternate breakpoints, variant partners, or cryptic rearrangements.",
    "Leave status pending until every required field is filled. Use rejected, with a note, when no authoritative source supports the association.",
    "Review each disease as separate facets: association, coordinates, ISCN representation, assay applicability, and limitations. A source for the association does not verify the exact teaching string.",
    "basis exact_published means the whole string appears verbatim in a cited source. basis educational_example means a valid example consistent with the cited association and notation, not a published specimen.",
    "Automated review sets evidence-documented at most. Only a named human reviewer sets verified, with human_review filled.",
]

REQUIRED_FOR_VERIFIED = ["finding", "disease_in_source", "limitations"]
REQUIRED_SOURCE = ["citation", "identifier", "reviewed"]
STATUSES = {"pending", "evidence-documented", "verified", "rejected", "needs-correction", "not-iscn"}


def blank_entry(disease, formula):
    return {
        "teaching_catalog_id": disease.get("id"),
        "disease": disease.get("disease_name"),
        "iscn": formula,
        "normalized": normalize_iscn(formula),
        "status": "pending",
        "finding": "",
        "disease_in_source": "",
        "exact_string_in_source": None,
        "limitations": "",
        "source": {"citation": "", "identifier": "", "url": "", "reviewed": ""},
        "reviewer_note": "",
    }


def catalog_formulas():
    catalog = json.loads(CATALOG.read_text())
    for disease in catalog.get("diseases") or []:
        formulas = []
        for case in disease.get("cytogenetic_cases") or []:
            representative = (case.get("representative_teaching_karyotype") or {}).get("iscn")
            if representative:
                formulas.append(representative)
            formulas.extend(case.get("example_notation") or [])
        for formula in dict.fromkeys(formulas):
            if normalize_iscn(formula) in {"46,XX", "46,XY"}:
                continue
            yield disease, formula


def entry_problems(entry):
    """Missing fields that keep an entry from counting as verified."""
    problems = [field for field in REQUIRED_FOR_VERIFIED if not str(entry.get(field) or "").strip()]
    problems += [f"source.{field}" for field in REQUIRED_SOURCE if not str((entry.get("source") or {}).get(field) or "").strip()]
    if entry.get("exact_string_in_source") not in (True, False):
        problems.append("exact_string_in_source")
    if entry.get("kind") != "iscn":
        problems.append("kind is not iscn")
    if entry.get("basis") not in ("exact_published", "educational_example"):
        problems.append("basis")
    if str(entry.get("notation_issue") or "").strip():
        problems.append("notation_issue unresolved")
    review = entry.get("human_review") or {}
    if not str(review.get("reviewer") or "").strip() or not str(review.get("date") or "").strip():
        problems.append("human_review")
    return problems


def main():
    existing = json.loads(LEDGER.read_text()) if LEDGER.exists() else {"entries": []}
    by_key = {(item["teaching_catalog_id"], item["normalized"]): item for item in existing.get("entries", [])}
    entries = []
    for disease, formula in catalog_formulas():
        key = (disease.get("id"), normalize_iscn(formula))
        entries.append(by_key.pop(key, None) or blank_entry(disease, formula))
    retired = list(by_key.values())
    counts = {}
    for item in entries:
        counts[item["status"]] = counts.get(item["status"], 0) + 1
    ledger = {
        "description": "Verification ledger for teaching-catalog ISCN strings. Only entries with status verified and every required field are imported as verified associations.",
        "rules": RULES,
        "required_for_verified": REQUIRED_FOR_VERIFIED + [f"source.{field}" for field in REQUIRED_SOURCE] + ["exact_string_in_source"],
        "counts": counts,
        "diseases": existing.get("diseases", {}),
        "review_problems": existing.get("review_problems", []),
        "entries": entries,
        "retired": retired,
    }
    LEDGER.write_text(json.dumps(ledger, indent=2, ensure_ascii=False) + "\n")
    print(f"{len(entries)} strings in the ledger: {counts}. {len(retired)} retired.")


if __name__ == "__main__":
    main()
