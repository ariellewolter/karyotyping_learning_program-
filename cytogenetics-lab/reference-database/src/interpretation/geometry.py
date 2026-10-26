"""Schematic chromosome descriptions from supported events.

Bands name the segment. They are not converted into a physical length.
"""

from interpretation.registry import LIMITATIONS


def geometry_for_event(item):
    if not item.get("supported"):
        return {
            "drawable": False,
            "schematic": False,
            "shape": "not drawn",
            "basis": LIMITATIONS["schematic"],
            "note": item.get("reason") or "Unsupported notation is not drawn.",
        }
    kind = item["kind"]
    bands = item.get("bands") or []
    if kind == "numerical":
        change = "an extra copy" if item.get("delta", 0) > 0 else "a missing copy"
        return _drawn("copy number", f"Chromosome {item['chromosomes'][0]} is shown as {change}. The shape of each copy stays the normal schematic.")
    if kind == "deletion":
        span = _span(bands)
        return _drawn("shortened", f"The deleted segment {span} is removed. The chromosome is shorter by that band segment, not by a calculated physical length.")
    if kind == "duplication":
        span = _span(bands)
        return _drawn("duplicated segment", f"The segment {span} is drawn a second time on the same chromosome. Added length is the band segment, not a base-pair measurement.")
    if kind == "inversion":
        return _drawn("reversed segment", f"Bands {bands[0]} through {bands[1]} stay on the chromosome and are reversed. The chromosome is not shortened.")
    if kind == "translocation":
        return _drawn("two derivatives", f"Chromosomes {item['chromosomes'][0]} and {item['chromosomes'][1]} are each drawn as a derivative at the written breakpoints.")
    if kind == "derivative":
        return _drawn("one derivative", f"Chromosome {item['chromosomes'][0]} is drawn as the derivative. The partner is not drawn unless the formula also writes it.")
    if kind == "isochromosome":
        arm = item["arms"][0]
        return _drawn("isochromosome", f"Both arms are the {arm} arm. This replaces one copy of chromosome {item['chromosomes'][0]}.")
    if kind == "robertsonian":
        return _drawn("fused long arms", f"The long arms of chromosomes {item['chromosomes'][0]} and {item['chromosomes'][1]} are drawn as one chromosome. Each short arm is not given a length.")
    if kind == "ring":
        return _drawn("ring", f"Breakpoints {bands[0]} and {bands[1]} are joined. Material outside those bands is absent in the schematic.")
    return {
        "drawable": False,
        "schematic": False,
        "shape": "not drawn",
        "basis": LIMITATIONS["schematic"],
        "note": "This event has no schematic.",
    }


def _span(bands):
    if len(bands) == 1:
        return bands[0]
    return f"{bands[0]} to {bands[1]}"


def _drawn(shape, note):
    return {
        "drawable": True,
        "schematic": True,
        "shape": shape,
        "basis": LIMITATIONS["schematic"],
        "note": note,
    }


def line_visualization(line):
    if not line.get("supported") or not (line.get("sex") or {}).get("supported"):
        return False
    return all(geometry_for_event(item)["drawable"] for item in line.get("events") or [])
