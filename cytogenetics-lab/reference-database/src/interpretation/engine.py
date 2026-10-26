"""Read-only interpretation. Disease links come from stored rows only."""

import re

from interpretation.fish import describe_probe, probe_matches_event
from interpretation.geometry import geometry_for_event, line_visualization
from interpretation.registry import LIMITATIONS
from interpretation.parse import parse_iscn
from search.reference_database import (
    connect,
    disease_brief,
    get_fish_probes,
    name_key,
    normalize_iscn,
)

DISCLAIMER = LIMITATIONS["not_diagnosis"]


def _normalize_formula(text):
    parsed = parse_iscn(text)
    if not parsed["lines"]:
        return ""
    pieces = []
    for line in parsed["lines"]:
        body = re.sub(r"\[\d+\]$", "", line["raw"])
        parts = body.split(",")
        if len(parts) > 1:
            parts[1] = parts[1].upper()
        clone = f"[{line['clone_size']}]" if line.get("clone_size") else ""
        pieces.append(",".join(parts) + clone)
    prefix = f"{parsed['prefix']} " if parsed["prefix"] else ""
    return prefix + "/".join(pieces)


def _exact_records(connection, formulas):
    found = []
    seen = set()
    for formula in formulas:
        key = normalize_iscn(formula)
        rows = connection.execute(
            """SELECT original, normalized, record_class, source, disease_id, abnormality_id
               FROM iscn_records WHERE normalized = ?""",
            (key,),
        ).fetchall()
        for row in rows:
            marker = (row["normalized"], row["disease_id"])
            if marker in seen:
                continue
            seen.add(marker)
            disease = disease_brief(connection, row["disease_id"])
            found.append({
                "original": row["original"],
                "match_class": "exact",
                "record_class": row["record_class"],
                "source": row["source"],
                "disease": disease,
            })
    return found


def _band_records(connection, events):
    found = []
    seen = set()
    for item in events:
        if item["kind"] not in {"deletion", "duplication", "numerical"}:
            continue
        for band in item.get("bands") or []:
            rows = connection.execute(
                """SELECT abnormality_id, abnormality_type, bands, record_class, source, evidence_label
                   FROM abnormalities WHERE lower(bands) LIKE ? LIMIT 12""",
                (f"%{band.lower()}%",),
            ).fetchall()
            for row in rows:
                if row["abnormality_id"] in seen:
                    continue
                if item["kind"] == "deletion" and row["abnormality_type"] not in {"deletion", "aneuploidy"}:
                    continue
                if item["kind"] == "duplication" and row["abnormality_type"] != "duplication":
                    continue
                seen.add(row["abnormality_id"])
                links = connection.execute(
                    "SELECT disease_id, match_class, evidence_strength FROM associations WHERE abnormality_id = ?",
                    (row["abnormality_id"],),
                ).fetchall()
                diseases = []
                for link in links:
                    brief = disease_brief(connection, link["disease_id"])
                    if brief:
                        brief["association_class"] = "structural"
                        brief["evidence_strength"] = link["evidence_strength"]
                        diseases.append(brief)
                found.append({
                    "abnormality_id": row["abnormality_id"],
                    "abnormality_type": row["abnormality_type"],
                    "bands": row["bands"],
                    "record_class": row["record_class"],
                    "source": row["source"],
                    "match_class": "structural",
                    "evidence_label": row["evidence_label"],
                    "diseases": diseases[:6],
                })
    return found[:12]


def _fusion_records(connection, events):
    found = []
    rows = connection.execute("SELECT * FROM gene_fusions").fetchall()
    for item in events:
        if not item.get("supported") or item["kind"] not in {"translocation", "derivative"}:
            continue
        chromosomes = item.get("chromosomes") or []
        if item["kind"] == "derivative" and item.get("rearrangement"):
            chromosomes = item["rearrangement"].get("chromosomes") or []
        for row in rows:
            rearrangement = parse_iscn(row["rearrangement"])
            rearrangement_events = [event for line in rearrangement["lines"] for event in line["events"]]
            same = any(
                other.get("supported") and other["kind"] == "translocation"
                and set(other.get("chromosomes") or []) == set(chromosomes)
                and [band.lower() for band in other.get("bands") or []] == [band.lower() for band in item.get("bands") or []]
                for other in rearrangement_events
            )
            if not same:
                continue
            diseases = []
            for link in connection.execute(
                "SELECT disease_id, match_class FROM fusion_diseases WHERE fusion_id = ?",
                (row["fusion_id"],),
            ):
                brief = disease_brief(connection, link["disease_id"])
                if brief:
                    brief["association_class"] = link["match_class"]
                    diseases.append(brief)
            found.append({
                "symbol": row["symbol"],
                "record_class": row["record_class"],
                "match_class": "educational" if row["record_class"] == "educational" else "exact",
                "diseases": diseases,
            })
    return found


def _fish_for_events(connection, events, disease_ids):
    probes = []
    seen = set()
    for disease_id in disease_ids:
        for probe in get_fish_probes(disease_id, connection):
            if probe["probe_id"] in seen:
                continue
            if any(probe_matches_event(probe, item) for item in events):
                seen.add(probe["probe_id"])
                probes.append(describe_probe(probe, "The stored probe matches this parsed event."))
    if probes:
        return probes
    catalog = connection.execute("SELECT * FROM fish_probes").fetchall()
    for row in catalog:
        probe = dict(row)
        probe["targets"] = [dict(item) for item in connection.execute(
            "SELECT locus, gene, fluorophore FROM fish_targets WHERE probe_id = ? ORDER BY sort_order",
            (row["probe_id"],),
        )]
        probe["patterns"] = [dict(item) for item in connection.execute(
            "SELECT pattern_role, pattern, note FROM fish_patterns WHERE probe_id = ?",
            (row["probe_id"],),
        )]
        if any(probe_matches_event(probe, item) for item in events) and probe["probe_id"] not in seen:
            seen.add(probe["probe_id"])
            probes.append(describe_probe(probe, "This probe's targets match the parsed event. No disease was required for the match."))
    return probes


def interpret_iscn(text):
    parsed = parse_iscn(text)
    events = [item for line in parsed["lines"] for item in line["events"]]
    for item in events:
        item["geometry"] = geometry_for_event(item)
    visualization = (
        parsed["status"] == "complete"
        and bool(parsed["lines"])
        and all(line_visualization(line) for line in parsed["lines"])
        and parsed["prefix"] != "chi"
    )
    connection = None
    exact = []
    structural = []
    fusions = []
    probes = []
    try:
        connection = connect()
        formulas = [line["raw"] for line in parsed["lines"]]
        exact = _exact_records(connection, formulas)
        if parsed["status"] != "empty":
            structural = _band_records(connection, [item for item in events if item.get("supported")])
            fusions = _fusion_records(connection, events)
            disease_ids = [row["disease"]["disease_id"] for row in exact if row.get("disease")]
            probes = _fish_for_events(connection, events, disease_ids)
    except Exception as exc:
        parsed["database_error"] = str(exc)
    finally:
        if connection is not None:
            connection.close()
    association = "none"
    if exact:
        association = "exact"
    elif structural:
        association = "structural"
    levels = validation_levels(parsed, events, exact, structural)
    return {
        "query": text,
        "status": parsed["status"],
        "original": parsed["original"],
        "normalized": _normalize_formula(text) or parsed["normalized"],
        "prefix": parsed["prefix"],
        "mosaic": parsed["mosaic"],
        "reason": parsed["reason"],
        "lines": parsed["lines"],
        "visualization": visualization,
        "visualization_scope": "first cell line" if parsed["mosaic"] else "formula",
        "schematic_note": LIMITATIONS["schematic"],
        "associations": {
            "match": association,
            "exact": exact,
            "structural": structural,
            "note": "No stored disease record matched this formula." if association == "none" and parsed["status"] != "empty" else "",
        },
        "fusions": fusions,
        "fish_probes": probes,
        "validation": levels,
        "disclaimer": DISCLAIMER,
        "limitations": [LIMITATIONS["not_diagnosis"], LIMITATIONS["fish"], LIMITATIONS["schematic"]],
    }


def validation_levels(parsed, events, exact, structural):
    """Three separate checks. One can pass while the others do not."""
    if parsed.get("status") == "empty":
        syntax = "none"
    elif parsed.get("status") == "complete":
        syntax = "validated"
    else:
        syntax = "partial"
    if syntax != "validated":
        structure = "unavailable"
        structure_note = "A chromosome diagram is not checked while part of the formula is unparsed."
    elif parsed.get("mosaic") or parsed.get("prefix") == "mos":
        structure = "not_checked"
        structure_note = "Mosaic formulas are parsed line by line. A diagram of the first cell line is not a check of every line."
    elif events and all(item.get("kind") == "numerical" for item in events):
        structure = "validated"
        structure_note = "The extra or missing chromosome uses the unmodified band map. No segment was rebuilt."
    elif not events:
        structure = "validated"
        structure_note = "A normal complement uses the unmodified band map."
    else:
        structure = "not_checked"
        structure_note = "The symbols parsed, but the rearranged chromosome has not been checked against the band map. A Robertsonian fusion, ring, inversion, deletion, duplication, or translocation diagram is not treated as validated."
    classes = [row.get("record_class") for row in exact]
    if "verified" in classes:
        association = "verified"
        association_note = "A stored reference source links this formula to a disease."
    elif "teaching-catalog" in classes:
        association = "teaching-catalog"
        association_note = "This formula is the teaching catalog's canonical example. It is not an external verified diagnosis."
    elif "educational" in classes:
        association = "educational"
        association_note = "This formula is a curated educational example, not a verified clinical diagnosis."
    elif structural:
        association = "structural"
        association_note = "Band overlap found more than one stored record. That is not one diagnosis."
    else:
        association = "none"
        association_note = "No stored disease record matches this formula."
    return {
        "syntax": syntax,
        "structure": structure,
        "association": association,
        "notes": {
            "syntax": "Syntax validated means every token is in the supported registry." if syntax == "validated" else "Part of this string was not interpreted.",
            "structure": structure_note,
            "association": association_note,
        },
    }


def disease_record(disease_id, teaching=None):
    from search.reference_database import get_disease_details

    details = get_disease_details(disease_id)
    if details.get("match") == "none":
        return {"available": True, "match": "none", "disclaimer": DISCLAIMER, "result": None}
    result = details["result"]
    examples = result.get("iscn_examples") or []
    interpretations = [interpret_iscn(item["original"]) for item in examples]
    probes = []
    for probe in result.get("fish_probes") or []:
        probes.append(describe_probe(probe, "Stored with this disease record. The pattern belongs to this probe."))
    result["fish_probes"] = probes
    result["interpretations"] = interpretations
    result["capabilities"] = capabilities_for(result, interpretations, teaching or {})
    result["invented_iscn"] = False
    return {"available": True, "match": "exact", "disclaimer": DISCLAIMER, "result": result, "abnormalities_note": LIMITATIONS["no_invented_iscn"]}


def capabilities_for(result, interpretations, teaching):
    key = name_key(result.get("preferred_name"))
    teaching_hit = teaching.get(key)
    return {
        "reference": True,
        "iscn_interpretation": any(item.get("status") == "complete" for item in interpretations),
        "chromosome_visualization": any(item.get("visualization") for item in interpretations),
        "fish": bool(result.get("fish_probes")),
        "teaching_activity": bool(teaching_hit),
        "teaching_href": f"#/disease/{teaching_hit}" if teaching_hit else "",
    }


def load_teaching_index():
    import json
    from pathlib import Path

    root = Path(__file__).resolve().parents[3]
    activities_path = root / "data" / "disease-activities.json"
    diseases_path = root / "data" / "diseases.json"
    if not activities_path.exists() or not diseases_path.exists():
        return {}
    activities = json.loads(activities_path.read_text())
    catalog = json.loads(diseases_path.read_text())
    index = {}
    for disease in catalog.get("diseases") or []:
        if disease.get("id") in activities and disease.get("disease_name"):
            index[name_key(disease["disease_name"])] = disease["id"]
    return index
