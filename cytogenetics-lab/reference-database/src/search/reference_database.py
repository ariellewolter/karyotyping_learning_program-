"""Read-only search over the local cytogenetics reference database.

A matching ISCN string is a database association. It is not a diagnosis.
"""

import json
import re
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DB_PATH = ROOT / "data" / "cytogenetics.sqlite"

DISCLAIMER = (
    "A match links a query to records in this database. "
    "It is not a clinical diagnosis, and an ISCN string alone does not establish a disease."
)


def connect():
    connection = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    return connection


def name_key(value):
    text = re.sub(r"[^a-z0-9]+", " ", (value or "").lower())
    return re.sub(r"\s+", " ", text).strip()


def normalize_iscn(value):
    parts = re.sub(r"\s+", "", (value or "").strip()).split(",")
    if len(parts) > 1:
        parts[1] = parts[1].upper()
    return ",".join(parts)


def empty(query, search_type):
    return {
        "query": query,
        "search_type": search_type,
        "match": "none",
        "disclaimer": DISCLAIMER,
        "results": [],
        "note": "No verified or educational record matched this query.",
    }


def disease_brief(connection, disease_id):
    row = connection.execute("SELECT * FROM diseases WHERE disease_id = ?", (disease_id,)).fetchone()
    if not row:
        return None
    return {
        "disease_id": row["disease_id"],
        "preferred_name": row["preferred_name"],
        "description": row["description"],
        "category": row["category"],
        "record_class": row["record_class"],
        "source": row["source"],
        "source_record": row["source_record"],
    }


def abnormalities_for(connection, disease_id, limit=20):
    rows = connection.execute(
        """SELECT a.*, s.association_type, s.evidence_source, s.evidence_strength, s.match_class
           FROM associations s
           JOIN abnormalities a ON a.abnormality_id = s.abnormality_id
           WHERE s.disease_id = ?
           ORDER BY CASE s.match_class WHEN 'educational' THEN 0 WHEN 'verified' THEN 1 ELSE 2 END
           LIMIT ?""",
        (disease_id, limit),
    ).fetchall()
    return [dict(row) for row in rows]


def iscn_for(connection, disease_id, limit=12):
    rows = connection.execute(
        """SELECT original, normalized, events_json, record_class, source, abnormality_id
           FROM iscn_records WHERE disease_id = ? LIMIT ?""",
        (disease_id, limit),
    ).fetchall()
    return [dict(row) for row in rows]


def fusions_for(connection, disease_id):
    rows = connection.execute(
        """SELECT f.symbol, f.rearrangement, f.record_class, f.source, d.match_class
           FROM fusion_diseases d
           JOIN gene_fusions f ON f.fusion_id = d.fusion_id
           WHERE d.disease_id = ?""",
        (disease_id,),
    ).fetchall()
    return [dict(row) for row in rows]


def find_disease(query, limit=25):
    key = name_key(query)
    if not key:
        return empty(query, "disease")
    connection = connect()
    exact = connection.execute(
        "SELECT disease_id, 'exact' AS how FROM diseases WHERE name_key = ?",
        (key,),
    ).fetchall()
    synonyms = connection.execute(
        """SELECT disease_id, 'synonym' AS how FROM disease_synonyms
           WHERE synonym_key = ? AND disease_id NOT IN (
             SELECT disease_id FROM diseases WHERE name_key = ?
           )""",
        (key, key),
    ).fetchall()
    seen = []
    how = {}
    for row in list(exact) + list(synonyms):
        if row["disease_id"] in how:
            continue
        how[row["disease_id"]] = row["how"]
        seen.append(row["disease_id"])
        if len(seen) >= limit:
            break
    results = []
    for disease_id in seen:
        item = disease_brief(connection, disease_id)
        item["match_class"] = how[disease_id]
        item["abnormalities"] = abnormalities_for(connection, disease_id)
        item["iscn_examples"] = iscn_for(connection, disease_id)
        item["fusions"] = fusions_for(connection, disease_id)
        results.append(item)
    connection.close()
    if not results:
        return empty(query, "disease")
    return {
        "query": query,
        "search_type": "disease",
        "match": "exact" if exact else "synonym",
        "disclaimer": DISCLAIMER,
        "results": results,
    }


def find_iscn(query):
    normalized = normalize_iscn(query)
    if not normalized:
        return empty(query, "iscn")
    connection = connect()
    rows = connection.execute(
        """SELECT r.original, r.normalized, r.events_json, r.record_class, r.source,
                  r.disease_id, r.abnormality_id
           FROM iscn_records r WHERE r.normalized = ?""",
        (normalized,),
    ).fetchall()
    results = []
    for row in rows:
        item = dict(row)
        item["match_class"] = "exact"
        item["disease"] = disease_brief(connection, row["disease_id"])
        item["events"] = json.loads(row["events_json"] or "[]")
        results.append(item)
    response = {
        "query": query,
        "normalized": normalized,
        "search_type": "iscn",
        "match": "exact" if results else "none",
        "disclaimer": DISCLAIMER,
        "results": results,
    }
    if not results:
        response["note"] = "No source-supported or educational ISCN record matched. No disease was inferred."
    connection.close()
    return response


def band_query(value):
    text = (value or "").strip().lower().replace("chromosome", "").replace("chr", "")
    match = re.fullmatch(r"([0-9]{1,2}|x|y)([pq][0-9]+(?:\.[0-9]+)?)?", text)
    if not match:
        return None
    return match.group(1).upper(), (match.group(1) + (match.group(2) or "")).upper()


def find_chromosome(query, limit=40):
    parsed = band_query(query)
    if not parsed:
        return empty(query, "chromosome")
    chrom, band = parsed
    connection = connect()
    rows = connection.execute(
        """SELECT * FROM abnormalities
           WHERE bands LIKE ? OR chromosomes = ? OR chromosomes LIKE ? OR chromosomes LIKE ? OR chromosomes LIKE ?""",
        (f"%{band}%", chrom, f"{chrom},%", f"%,{chrom},%", f"%,{chrom}"),
    ).fetchall()
    results = []
    for row in rows:
        bands = [item.strip().lower() for item in (row["bands"] or "").split(",") if item.strip()]
        chromosomes = [item.strip().upper() for item in (row["chromosomes"] or "").split(",") if item.strip()]
        band_key = band.lower()
        exact = band_key in bands
        prefix = any(item.startswith(band_key + ".") or band_key.startswith(item + ".") for item in bands)
        chromosome_only = not bands and chrom in chromosomes and band == chrom
        if not exact and not prefix and not chromosome_only and not (band == chrom and chrom in chromosomes):
            continue
        item = dict(row)
        item["match_class"] = "exact" if exact or chromosome_only else "partial"
        links = connection.execute(
            "SELECT disease_id, match_class, evidence_strength FROM associations WHERE abnormality_id = ?",
            (row["abnormality_id"],),
        ).fetchall()
        item["diseases"] = []
        for link in links:
            brief = disease_brief(connection, link["disease_id"])
            if brief:
                brief["association_class"] = link["match_class"]
                brief["evidence_strength"] = link["evidence_strength"]
                item["diseases"].append(brief)
        results.append(item)
    connection.close()
    if not results:
        payload = empty(query, "chromosome")
        payload["note"] = "No abnormality record matched this chromosome or band."
        return payload
    rank = {"exact": 0, "partial": 1}
    results.sort(key=lambda item: rank.get(item["match_class"], 2))
    results = results[:limit]
    return {
        "query": query,
        "search_type": "chromosome",
        "match": results[0]["match_class"],
        "disclaimer": DISCLAIMER,
        "results": results,
    }


def find_gene(query, limit=40):
    symbol = re.sub(r"[^A-Za-z0-9]", "", query or "").upper()
    if len(symbol) < 2:
        return empty(query, "gene")
    connection = connect()
    abnormalities = connection.execute(
        """SELECT * FROM abnormalities
           WHERE genes = ? OR genes LIKE ? OR genes LIKE ? OR genes LIKE ?""",
        (symbol, f"{symbol},%", f"%,{symbol},%", f"%,{symbol}"),
    ).fetchall()
    fusions = connection.execute(
        "SELECT * FROM gene_fusions WHERE gene_a = ? OR gene_b = ?",
        (symbol, symbol),
    ).fetchall()
    if not abnormalities and not fusions:
        connection.close()
        return empty(query, "gene")
    results = []
    for row in abnormalities[:limit]:
        item = dict(row)
        item["match_class"] = "exact"
        item["diseases"] = []
        for link in connection.execute(
            "SELECT disease_id, match_class, evidence_strength FROM associations WHERE abnormality_id = ?",
            (row["abnormality_id"],),
        ):
            brief = disease_brief(connection, link["disease_id"])
            if brief:
                brief["association_class"] = link["match_class"]
                brief["evidence_strength"] = link["evidence_strength"]
                item["diseases"].append(brief)
        results.append(item)
    fusion_rows = []
    for row in fusions:
        item = dict(row)
        item["diseases"] = []
        for link in connection.execute(
            "SELECT disease_id, match_class FROM fusion_diseases WHERE fusion_id = ?",
            (row["fusion_id"],),
        ):
            brief = disease_brief(connection, link["disease_id"])
            if brief:
                brief["association_class"] = link["match_class"]
                item["diseases"].append(brief)
        fusion_rows.append(item)
    connection.close()
    return {
        "query": query,
        "search_type": "gene",
        "match": "exact",
        "disclaimer": DISCLAIMER,
        "results": results,
        "fusions": fusion_rows,
    }


def find_fusion(query):
    symbol = (query or "").strip().lower().replace(":", "::")
    symbol = re.sub(r":{2,}", "::", symbol)
    if "::" not in symbol:
        return empty(query, "fusion")
    connection = connect()
    rows = connection.execute(
        "SELECT * FROM gene_fusions WHERE symbol_key = ?",
        (symbol,),
    ).fetchall()
    results = []
    for row in rows:
        item = dict(row)
        item["match_class"] = "exact"
        item["diseases"] = []
        for link in connection.execute(
            "SELECT disease_id, match_class FROM fusion_diseases WHERE fusion_id = ?",
            (row["fusion_id"],),
        ):
            brief = disease_brief(connection, link["disease_id"])
            if brief:
                brief["association_class"] = link["match_class"]
                item["diseases"].append(brief)
        results.append(item)
    connection.close()
    if not results:
        return empty(query, "fusion")
    return {
        "query": query,
        "search_type": "fusion",
        "match": "exact",
        "disclaimer": DISCLAIMER,
        "results": results,
    }


def get_disease_details(disease_id):
    connection = connect()
    item = disease_brief(connection, disease_id)
    if not item:
        connection.close()
        return {"match": "none", "disclaimer": DISCLAIMER, "result": None}
    item["synonyms"] = [
        row["synonym"] for row in connection.execute(
            "SELECT synonym FROM disease_synonyms WHERE disease_id = ? ORDER BY synonym LIMIT 30",
            (disease_id,),
        )
    ]
    item["identifiers"] = [dict(row) for row in connection.execute(
        "SELECT system, code FROM disease_identifiers WHERE disease_id = ? ORDER BY system",
        (disease_id,),
    )]
    item["abnormalities"] = abnormalities_for(connection, disease_id)
    item["iscn_examples"] = iscn_for(connection, disease_id)
    item["fusions"] = fusions_for(connection, disease_id)
    item["fish_probes"] = get_fish_probes(disease_id, connection)
    connection.close()
    return {"match": "exact", "disclaimer": DISCLAIMER, "result": item}


def get_associated_abnormalities(disease_id):
    connection = connect()
    rows = abnormalities_for(connection, disease_id, limit=100)
    connection.close()
    return {
        "disease_id": disease_id,
        "match": "exact" if rows else "none",
        "disclaimer": DISCLAIMER,
        "results": rows,
    }


def get_fish_probes(disease_id, connection=None):
    own = connection is None
    if own:
        connection = connect()
    probes = connection.execute(
        """SELECT p.* FROM fish_probes p
           JOIN fish_probe_diseases d ON d.probe_id = p.probe_id
           WHERE d.disease_id = ?""",
        (disease_id,),
    ).fetchall()
    results = []
    for probe in probes:
        item = dict(probe)
        item["targets"] = [dict(row) for row in connection.execute(
            "SELECT locus, gene, fluorophore FROM fish_targets WHERE probe_id = ? ORDER BY sort_order",
            (probe["probe_id"],),
        )]
        item["patterns"] = [dict(row) for row in connection.execute(
            "SELECT pattern_role, pattern, note FROM fish_patterns WHERE probe_id = ?",
            (probe["probe_id"],),
        )]
        results.append(item)
    if own:
        connection.close()
    return results


def _evidence_group(match_class, strength):
    if match_class == "educational":
        return "educational"
    score = re.match(r"score (\d+)", strength or "")
    value = int(score.group(1)) if score else None
    if value == 3:
        return "sufficient"
    if value in (1, 2):
        return "limited"
    if value == 30:
        return "recessive"
    return "other"


CHROMOSOME_PATTERNS = "(a.chromosomes = ? OR a.chromosomes LIKE ? OR a.chromosomes LIKE ? OR a.chromosomes LIKE ?)"


def _chromosome_args(chrom):
    return (chrom, f"{chrom},%", f"%,{chrom},%", f"%,{chrom}")


def chromosome_diseases(query):
    """Diseases linked to stored abnormalities on one chromosome, grouped by evidence."""
    chrom = str(query or "").strip().upper().replace("CHR", "")
    if not re.fullmatch(r"[1-9]|1[0-9]|2[0-2]|X|Y", chrom):
        return empty(query, "chromosome")
    connection = connect()
    rows = connection.execute(
        f"""SELECT d.disease_id, d.preferred_name, d.record_class AS disease_class,
                   s.match_class, s.evidence_strength, s.association_type,
                   a.bands, a.genes, a.source
            FROM abnormalities a
            JOIN associations s ON s.abnormality_id = a.abnormality_id
            JOIN diseases d ON d.disease_id = s.disease_id
            WHERE {CHROMOSOME_PATTERNS}""",
        _chromosome_args(chrom),
    ).fetchall()
    connection.close()
    rank = {"educational": 0, "sufficient": 1, "limited": 2, "recessive": 3, "other": 4}
    grouped = {}
    for row in rows:
        group = _evidence_group(row["match_class"], row["evidence_strength"])
        item = grouped.setdefault(row["disease_id"], {
            "disease_id": row["disease_id"],
            "preferred_name": row["preferred_name"],
            "record_class": row["disease_class"],
            "evidence_group": group,
            "bands": [],
            "genes": [],
            "changes": [],
            "sources": [],
        })
        if rank[group] < rank[item["evidence_group"]]:
            item["evidence_group"] = group
        for key, value in (("bands", row["bands"]), ("genes", row["genes"]), ("changes", row["association_type"]), ("sources", row["source"])):
            for part in str(value or "").split(","):
                part = part.strip()
                if part and part not in item[key]:
                    item[key].append(part)
    results = sorted(grouped.values(), key=lambda item: (rank[item["evidence_group"]], item["preferred_name"].lower()))
    counts = {}
    for item in results:
        counts[item["evidence_group"]] = counts.get(item["evidence_group"], 0) + 1
    return {
        "query": query,
        "chromosome": chrom,
        "search_type": "chromosome-diseases",
        "match": "exact" if results else "none",
        "disclaimer": DISCLAIMER,
        "counts": counts,
        "results": results,
        "note": "" if results else "No stored abnormality on this chromosome is linked to a disease record.",
    }


def chromosome_counts():
    connection = connect()
    counts = {}
    for chrom in [str(n) for n in range(1, 23)] + ["X", "Y"]:
        row = connection.execute(
            f"""SELECT COUNT(DISTINCT s.disease_id) AS n
                FROM abnormalities a JOIN associations s ON s.abnormality_id = a.abnormality_id
                WHERE {CHROMOSOME_PATTERNS}""",
            _chromosome_args(chrom),
        ).fetchone()
        counts[chrom] = row["n"]
    connection.close()
    return {"counts": counts, "disclaimer": DISCLAIMER}


def provenance():
    connection = connect()
    rows = [dict(row) for row in connection.execute("SELECT * FROM source_meta ORDER BY source_id")]
    connection.close()
    return {"sources": rows, "disclaimer": DISCLAIMER}


def search(search_type, query):
    kind = (search_type or "").lower()
    if kind == "disease":
        return find_disease(query)
    if kind == "iscn":
        return find_iscn(query)
    if kind == "chromosome":
        return find_chromosome(query)
    if kind == "gene":
        return find_gene(query)
    if kind == "fusion":
        return find_fusion(query)
    return empty(query, kind or "unknown")
