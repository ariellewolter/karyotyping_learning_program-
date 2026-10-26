"""Turn a supplied ISCN string into structured events.

The original string is kept. Unsupported tokens are listed and are not given a structure.
"""

import re

from interpretation.registry import ACROCENTRICS, BAND, CHROMOSOME, RECOGNIZED_UNSUPPORTED

BAND_RE = re.compile(BAND, re.I)
CHROM_RE = re.compile(f"^{CHROMOSOME}$", re.I)
SEX_RE = re.compile(r"^(?:X{1,4}Y{0,2}|Y{1,3})$", re.I)


def split_outside(text, separator):
    parts = []
    depth = 0
    start = 0
    for index, char in enumerate(text):
        if char == "(":
            depth += 1
        elif char == ")":
            depth = max(0, depth - 1)
        elif char == separator and depth == 0:
            parts.append(text[start:index])
            start = index + 1
    parts.append(text[start:])
    return [part for part in parts if part != ""]


def bands_in(text):
    if not text:
        return []
    if ";" in text:
        return [part for part in text.split(";") if part]
    return BAND_RE.findall(text)


def event(kind, token, supported, **fields):
    payload = {
        "token": token,
        "kind": kind,
        "type": fields.pop("type", kind),
        "chromosomes": fields.pop("chromosomes", []),
        "arms": fields.pop("arms", []),
        "bands": fields.pop("bands", []),
        "supported": supported,
        "reason": fields.pop("reason", ""),
    }
    payload.update(fields)
    return payload


def parse_structural(token):
    named = re.fullmatch(r"(add|mar|idic|dic|ins|trp|idem)(?:\(.*\))?", token, re.I)
    if named:
        key = named.group(1).lower()
        return event("unsupported", token, False, type=key, reason=RECOGNIZED_UNSUPPORTED[key])

    numerical = re.fullmatch(rf"([+-])({CHROMOSOME})", token, re.I)
    if numerical:
        chromosome = numerical.group(2).upper()
        gain = numerical.group(1) == "+"
        return event(
            "numerical", token, True,
            type="gain" if gain else "loss",
            chromosomes=[chromosome],
            delta=1 if gain else -1,
        )

    span = re.fullmatch(rf"(del|dup|inv)\(({CHROMOSOME})\)(?:\(([^)]*)\))?", token, re.I)
    if span:
        symbol, chromosome, raw_bands = span.group(1).lower(), span.group(2).upper(), span.group(3)
        found = bands_in(raw_bands or "")
        kind = {"del": "deletion", "dup": "duplication", "inv": "inversion"}[symbol]
        if symbol == "inv":
            supported = len(found) == 2
            reason = "" if supported else "An inversion needs two breakpoints before a segment is reversed."
        elif symbol in {"del", "dup"}:
            supported = len(found) in {1, 2}
            reason = "" if supported else f"A {kind} needs one or two bands before a segment is changed."
        else:
            supported, reason = False, ""
        arms = []
        for band in found:
            arm = re.match(r"([pq])", band, re.I)
            if arm:
                arms.append(arm.group(1).lower())
        return event(kind, token, supported, type=kind, chromosomes=[chromosome], arms=arms, bands=found, reason=reason)

    translocation = re.fullmatch(rf"t\(([^)]+)\)(?:\(([^)]*)\))?", token, re.I)
    if translocation:
        chromosomes = [part.upper() for part in translocation.group(1).split(";") if part]
        found = bands_in(translocation.group(2) or "")
        supported = len(chromosomes) == 2 and len(found) == 2 and all(CHROM_RE.match(item) for item in chromosomes)
        reason = "" if supported else "A reciprocal translocation is interpreted only with two chromosomes and two breakpoints."
        return event(
            "translocation", token, supported, type="translocation",
            chromosomes=chromosomes, bands=found, reason=reason,
        )

    derivative = re.fullmatch(rf"der\(({CHROMOSOME})\)(.+)", token, re.I)
    if derivative:
        chromosome = derivative.group(1).upper()
        rearrangement = parse_structural(derivative.group(2))
        supported = bool(rearrangement and rearrangement["kind"] == "translocation" and rearrangement["supported"])
        reason = "" if supported else "A derivative is interpreted only when the following t() has two chromosomes and two breakpoints."
        return event(
            "derivative", token, supported, type="derivative",
            chromosomes=[chromosome],
            bands=rearrangement["bands"] if rearrangement else [],
            rearrangement=rearrangement,
            reason=reason,
        )

    iso = re.fullmatch(rf"i\(({CHROMOSOME})\)\(([pq])10\)", token, re.I)
    if iso:
        arm = iso.group(2).lower()
        return event(
            "isochromosome", token, True, type="isochromosome",
            chromosomes=[iso.group(1).upper()], arms=[arm], bands=[f"{arm}10"],
        )

    robertsonian = re.fullmatch(rf"rob\(({CHROMOSOME});({CHROMOSOME})\)\(([pq]10);([pq]10)\)", token, re.I)
    if robertsonian:
        left, right = robertsonian.group(1).upper(), robertsonian.group(2).upper()
        arms = [robertsonian.group(3).lower()[0], robertsonian.group(4).lower()[0]]
        supported = left in ACROCENTRICS and right in ACROCENTRICS and arms == ["q", "q"]
        reason = "" if supported else "A Robertsonian fusion is interpreted for acrocentric long arms only."
        return event(
            "robertsonian", token, supported, type="robertsonian",
            chromosomes=[left, right], arms=arms, bands=["q10", "q10"], reason=reason,
        )

    ring = re.fullmatch(rf"r\(({CHROMOSOME})\)\(([^)]+)\)", token, re.I)
    if ring:
        found = bands_in(ring.group(2))
        supported = len(found) == 2
        return event(
            "ring", token, supported, type="ring",
            chromosomes=[ring.group(1).upper()], bands=found,
            reason="" if supported else "A ring is interpreted only with two breakpoints.",
        )

    return event("unknown", token, False, type="unknown", reason="This token is not in the supported-syntax registry.")


def sex_record(sex):
    value = sex.upper()
    if not SEX_RE.match(value):
        return {"written": value, "supported": False, "x": 0, "y": 0, "reason": "This sex-chromosome complement is not in the supported registry."}
    return {
        "written": value,
        "supported": True,
        "x": value.count("X"),
        "y": value.count("Y"),
        "reason": "",
    }


def expected_count(sex, events):
    if not sex["supported"]:
        return None
    total = 44 + sex["x"] + sex["y"]
    for item in events:
        if not item["supported"]:
            continue
        if item["kind"] == "numerical":
            total += item["delta"]
        elif item["kind"] == "robertsonian":
            total -= 1
    return total


def parse_line(line):
    clone = re.fullmatch(r"(.+)\[(\d+)\]", line)
    body = clone.group(1) if clone else line
    clone_size = int(clone.group(2)) if clone else None
    bits = split_outside(body, ",")
    if len(bits) < 2 or not bits[0].isdigit():
        return {
            "raw": line,
            "supported": False,
            "reason": "A cell line needs a chromosome count and a sex complement.",
            "count": None,
            "sex": None,
            "events": [],
            "clone_size": clone_size,
        }
    sex = sex_record(bits[1])
    events = [parse_structural(token) for token in bits[2:]]
    unsupported = [item for item in events if not item["supported"]]
    count = int(bits[0])
    expected = expected_count(sex, events)
    count_note = ""
    if expected is not None and unsupported == [] and count != expected:
        count_note = f"The written count is {count}. The supported events add up to {expected}."
    supported = sex["supported"] and not unsupported and not count_note
    return {
        "raw": line,
        "supported": supported,
        "reason": unsupported[0]["reason"] if unsupported else (sex["reason"] or count_note),
        "count": count,
        "count_expected": expected,
        "count_consistent": expected is None or count == expected or bool(unsupported),
        "sex": sex,
        "events": events,
        "clone_size": clone_size,
    }


def parse_iscn(text):
    original = str(text or "").strip()
    compact = re.sub(r"\s+", "", original)
    if not compact:
        return {"original": original, "normalized": "", "status": "empty", "prefix": "", "lines": [], "reason": "No ISCN string was entered."}
    prefix = ""
    if compact.lower().startswith("mos"):
        prefix = "mos"
        compact = compact[3:]
    elif compact.lower().startswith("chi"):
        prefix = "chi"
        compact = compact[3:]
    lines = [parse_line(part) for part in split_outside(compact, "/")]
    mosaic = len(lines) > 1
    partial = any(not line["supported"] for line in lines) or prefix == "chi"
    if not lines:
        status = "empty"
    elif partial:
        status = "partial"
    elif mosaic or prefix == "mos":
        status = "complete"
    else:
        status = "complete"
    reason = ""
    if prefix == "chi":
        reason = RECOGNIZED_UNSUPPORTED["chi"]
    elif partial:
        reason = next((line["reason"] for line in lines if line["reason"]), "Part of this string is outside the supported registry.")
    return {
        "original": original,
        "normalized": compact if not prefix else f"{prefix}{compact}",
        "status": status,
        "prefix": prefix,
        "mosaic": mosaic or prefix == "mos",
        "lines": lines,
        "reason": reason,
    }
