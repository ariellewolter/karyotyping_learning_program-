"""Match stored probes to a parsed event. Patterns stay on the probe."""

import re

from interpretation.registry import LIMITATIONS

STRATEGY_LIMITS = {
    "dual-fusion": "This pattern is for this dual-fusion pair only. A different probe, or reversed fluorophores, changes the colors.",
    "break-apart": "Separation means the targeted locus is rearranged. The partner gene is not identified.",
    "deletion": "The abnormal pattern means one copy of this probe's target is absent. It does not name every deletion of the chromosome.",
    "enumeration": "The count is the number of signals for this centromeric target. It does not explain how the extra chromosome arose.",
}


def _chromosome(locus):
    match = re.match(r"([0-9]+|X|Y)", str(locus or ""), re.I)
    return match.group(1).upper() if match else ""


def _band(locus):
    match = re.search(r"([pq]\d+(?:\.\d+)?)", str(locus or ""), re.I)
    return match.group(1).lower() if match else ""


def _overlaps(written, target):
    if not written or not target:
        return False
    return written == target or written.startswith(target + ".") or target.startswith(written + ".")


def probe_matches_event(probe, event):
    if not event.get("supported"):
        return False
    targets = probe.get("targets") or []
    strategy = probe.get("strategy")
    if strategy == "enumeration" and event["kind"] == "numerical" and targets:
        return event["chromosomes"] == [_chromosome(targets[0].get("locus"))]
    if strategy == "deletion" and event["kind"] == "deletion" and targets:
        target = _band(targets[0].get("locus"))
        return any(_overlaps(str(band).lower(), target) for band in event.get("bands") or [])
    if strategy == "dual-fusion" and event["kind"] in {"translocation", "derivative"} and len(targets) >= 2:
        wanted = {_chromosome(targets[0].get("locus")), _chromosome(targets[1].get("locus"))}
        bands = [str(band).lower() for band in event.get("bands") or []]
        target_bands = [_band(item.get("locus")) for item in targets[:2]]
        chromosomes = set(event.get("chromosomes") or [])
        if event["kind"] == "derivative" and event.get("rearrangement"):
            chromosomes = set(event["rearrangement"].get("chromosomes") or [])
        return wanted <= chromosomes and all(any(_overlaps(band, target) for band in bands) for target in target_bands)
    if strategy == "break-apart" and event["kind"] in {"translocation", "derivative"} and targets:
        locus = targets[0]
        chromosomes = event.get("chromosomes") or []
        if event["kind"] == "derivative" and event.get("rearrangement"):
            chromosomes = event["rearrangement"].get("chromosomes") or []
        band_hit = any(_overlaps(str(band).lower(), _band(locus.get("locus"))) for band in event.get("bands") or [])
        return _chromosome(locus.get("locus")) in chromosomes and band_hit
    return False


def describe_probe(probe, match_basis):
    patterns = probe.get("patterns") or []
    return {
        "probe_id": probe.get("probe_id"),
        "probe_name": probe.get("probe_name"),
        "strategy": probe.get("strategy"),
        "record_class": probe.get("record_class"),
        "targets": probe.get("targets") or [],
        "normal_pattern": next((item.get("pattern") for item in patterns if item.get("pattern_role") == "normal"), None),
        "abnormal_patterns": [item.get("pattern") for item in patterns if item.get("pattern_role") != "normal"],
        "pattern_notes": [f"{item.get('pattern_role')}: {item.get('note')}" for item in patterns if item.get("note")],
        "match_basis": match_basis,
        "limitation": STRATEGY_LIMITS.get(probe.get("strategy"), LIMITATIONS["fish"]),
    }
