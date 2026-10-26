"""Merge the per-group source review into the ISCN verification ledger.

Inputs: data/review/group-*.json (literature facets, one file per priority group)
and data/review/coordinates.json (ClinGen and UCSC coordinates).

Entry statuses after merge:
  not-iscn            explanatory prose in the catalog; never imported as ISCN
  needs-correction    the string does not follow current ISCN
  evidence-documented the association is source-supported and the string is valid;
                      awaiting human sign-off before it can be marked verified
  pending             a required facet has no documented source yet
A reviewer sets status "verified" and fills human_review. This script never does.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / "data" / "review"
LEDGER = ROOT / "data" / "normalized" / "iscn-verification.json"

PRIORITY = {
    "down-syndrome": 1, "edwards-syndrome": 1, "patau-syndrome": 1, "turner": 1, "klinefelter": 1, "triple-x": 1, "xyy": 1,
    "cri-du-chat": 2, "wolf-hirschhorn": 2,
    "cml": 3, "apl": 3, "burkitt": 3, "aml-runx1": 3, "alk-alcl": 3,
    "aml-inv16": 4,
    "angelman": 5, "prader-willi": 5, "digeorge": 5, "williams": 5, "cll-del13q": 5,
}
FACETS = ["association", "coordinates", "iscn_representation", "assay_applicability", "limitations"]
KEEP = {"verified", "rejected"}


def source_problems(source):
    return [field for field in ("citation", "url", "reviewed", "excerpt") if not str(source.get(field) or "").strip()]


def clean_facet(facet, problems, where):
    facet = dict(facet or {"status": "pending", "statement": "", "sources": []})
    kept = []
    for source in facet.get("sources") or []:
        missing = source_problems(source)
        if missing:
            problems.append(f"{where}: source dropped, missing {', '.join(missing)}")
        else:
            kept.append(source)
    facet["sources"] = kept
    if facet.get("status") == "supported" and not kept:
        facet["status"] = "pending"
        problems.append(f"{where}: marked supported without a usable source")
    return facet


def coordinates_facet(records):
    if not records:
        return {"status": "pending", "statement": "", "sources": []}
    return {
        "status": "supported",
        "statement": "; ".join(f"{item['name']} ({item['cytoband']}) at {item['grch38']} on GRCh38" for item in records),
        "sources": [dict(item["source"], reviewed="2026-10-25", supports=["coordinates"]) for item in records],
    }


def main():
    ledger = json.loads(LEDGER.read_text())
    coordinates = json.loads((REVIEW / "coordinates.json").read_text())["diseases"]
    problems = []
    diseases = {}
    strings = {}
    for path in sorted(REVIEW.glob("group-*.json")):
        group = json.loads(path.read_text())
        for item in group.get("diseases", []):
            disease_id = item["teaching_catalog_id"]
            facets = {name: clean_facet(item.get("facets", {}).get(name), problems, f"{disease_id}.{name}") for name in FACETS if name != "coordinates"}
            facets["coordinates"] = coordinates_facet(coordinates.get(disease_id))
            diseases[disease_id] = {
                "disease": item.get("disease"),
                "priority": PRIORITY.get(disease_id, 6),
                "review_group": group.get("group"),
                "reviewer": group.get("reviewer", "automated source search, pending human review"),
                "facets": {name: facets[name] for name in FACETS},
                "open_questions": item.get("open_questions", []),
            }
            for row in item.get("strings", []):
                strings[(disease_id, row.get("text", "").strip())] = row

    counts = {}
    for entry in ledger["entries"]:
        disease = diseases.get(entry["teaching_catalog_id"])
        row = strings.get((entry["teaching_catalog_id"], entry["iscn"].strip()))
        entry.setdefault("human_review", {"reviewer": "", "date": "", "decision": ""})
        if disease and row:
            association = disease["facets"]["association"]
            entry["kind"] = row.get("kind", "")
            entry["basis"] = row.get("basis", "")
            entry["notation_issue"] = row.get("notation_issue", "")
            entry["review_note"] = row.get("note", "")
            entry["association_status"] = association["status"]
            if association["status"] == "supported":
                first = association["sources"][0]
                entry["finding"] = association["statement"]
                entry["disease_in_source"] = disease["disease"]
                entry["limitations"] = disease["facets"]["limitations"].get("statement", "")
                entry["source"] = {"citation": first["citation"], "identifier": first.get("identifier", ""), "url": first["url"], "reviewed": first["reviewed"]}
            entry["exact_string_in_source"] = entry["basis"] == "exact_published" if entry["kind"] == "iscn" else None
            if entry["status"] not in KEEP:
                if entry["kind"] == "note":
                    entry["status"] = "not-iscn"
                elif entry["basis"] == "invalid_notation" or entry["notation_issue"]:
                    entry["status"] = "needs-correction"
                elif association["status"] == "supported" and entry["basis"] in ("exact_published", "educational_example"):
                    entry["status"] = "evidence-documented"
                else:
                    entry["status"] = "pending"
        elif entry["status"] not in KEEP:
            entry["status"] = "pending"
            if entry["teaching_catalog_id"] in diseases:
                problems.append(f"{entry['teaching_catalog_id']}: no review row for string {entry['iscn']!r}")
        counts[entry["status"]] = counts.get(entry["status"], 0) + 1

    ledger["diseases"] = dict(sorted(diseases.items(), key=lambda pair: (pair[1]["priority"], pair[0])))
    ledger["counts"] = counts
    ledger["review_problems"] = problems
    LEDGER.write_text(json.dumps(ledger, indent=2, ensure_ascii=False) + "\n")
    missing = sorted({entry["teaching_catalog_id"] for entry in ledger["entries"]} - set(diseases))
    print(f"{len(diseases)} diseases reviewed; missing: {missing}")
    print(f"entry statuses: {counts}")
    print(f"{len(problems)} review problems")
    for line in problems:
        print(f"  {line}")


if __name__ == "__main__":
    main()
