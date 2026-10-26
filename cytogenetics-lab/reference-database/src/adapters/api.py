#!/usr/bin/env python3
"""One JSON response for a reference request. Used by the lab server and the desktop shell."""

import json
import sys
from pathlib import Path
from urllib.parse import parse_qs

SRC = Path(__file__).resolve().parents[1]
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from interpretation.coverage import build_coverage  # noqa: E402
from interpretation.engine import (  # noqa: E402
    capabilities_for,
    disease_record,
    interpret_iscn,
    load_teaching_index,
)
from search.reference_database import chromosome_counts, chromosome_diseases, get_fish_probes, search  # noqa: E402


def _query(raw):
    return {key: values[0] for key, values in parse_qs(raw or "").items()}


def _enrich(payload, teaching):
    results = []
    for row in payload.get("results") or []:
        if not row.get("disease_id"):
            results.append(row)
            continue
        examples = row.get("iscn_examples") or []
        interpretations = [interpret_iscn(item["original"]) for item in examples]
        probes = get_fish_probes(row["disease_id"])
        row = dict(row)
        row["fish_probes"] = probes
        row["capabilities"] = capabilities_for({**row, "fish_probes": probes}, interpretations, teaching)
        results.append(row)
    payload["results"] = results
    payload["available"] = True
    return payload


def respond(path, raw_query):
    params = _query(raw_query)
    try:
        teaching = load_teaching_index()
        if path.endswith("/status"):
            return {"available": True}
        if path.endswith("/chromosome-counts"):
            return {"available": True, **chromosome_counts()}
        if path.endswith("/chromosome"):
            return {"available": True, **chromosome_diseases(params.get("q", ""))}
        if path.endswith("/coverage"):
            return {"available": True, "coverage": build_coverage()}
        if path.endswith("/interpret"):
            report = interpret_iscn(params.get("q", ""))
            report["available"] = True
            return report
        if path.endswith("/disease"):
            return disease_record(params.get("id", ""), teaching)
        if path.endswith("/search"):
            payload = search(params.get("type", "disease"), params.get("q", ""))
            return _enrich(payload, teaching)
        return {"available": False, "reason": "Unknown reference request."}
    except Exception as exc:
        return {"available": False, "reason": f"Reference module is unavailable. {exc}"}


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "/api/reference/status"
    raw_query = sys.argv[2] if len(sys.argv) > 2 else ""
    json.dump(respond(path, raw_query), sys.stdout)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
