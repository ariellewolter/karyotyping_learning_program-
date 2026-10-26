# Cytogenetics reference database

A local, read-only reference database. It is separate from the teaching lab: it does not load teaching cases, grade student work, or add a page to the lab interface.

## How the teaching lab is organized

The lab in the parent `cytogenetics-lab` directory is a static site. `serve.py` serves it on port 8765, and the Electron package lists the lab HTML, CSS, JavaScript, and `data/` files. The browser loads JSON through `js/cases.js`. Disease pages, ISCN drawing, chromosome maps, and FISH activities live in that application and are not imported here.

## This module

SQLite is built with the Python standard library (`sqlite3` 3.50.4 on this machine). Node 20 has no built-in SQLite reader, so `src/search/reference-database.mjs` asks `query.py` for JSON. The viewer has its own server on port 8770.

```text
reference-database/
  data/sources/          downloaded MedGen and ClinGen files
  data/normalized/       educational examples written for this database
  data/cytogenetics.sqlite
  schemas/schema.sql
  scripts/               import and rebuild
  src/search/            read-only query API
  src/adapters/server.py viewer server
  viewer/                standalone search page
  tests/test_search.py
  provenance/            sources, licenses, import log
```

Rebuild after replacing a source file:

```bash
python3 scripts/build_database.py
python3 -m unittest tests/test_search.py
python3 src/adapters/server.py
```

Open http://127.0.0.1:8770/.

## What a search can say

`findDisease`, `findISCN`, `findChromosome`, `findGene`, and `findFusion` return a `match` of `exact`, `synonym`, `partial`, or `none`. Each row has a `record_class` of `verified` or `educational`.

An exact ISCN match is a stored association. The response says it is not a diagnosis. A formula with no stored record returns `match: "none"` and does not invent a disease.

ClinGen rows keep the GRCh38 coordinates and the published haploinsufficiency or triplosensitivity score. A cytoband does not become an ISCN string.

## Sources

MedGen names and definitions are limited to GTR, NCI, MeSH, Orphanet, HPO, MONDO, GeneReviews, GHR, MedGen, and NCBI. SNOMED CT strings and OMIM narrative are not copied. Identifiers from those systems are stored. See `provenance/licenses.md`.

The current build has 54,776 MedGen diseases, 150,126 synonyms, 1,303 ClinGen dosage associations, 10 educational ISCN examples, and 7 educational FISH probe definitions.

Mitelman is not bundled. `scripts/import_mitelman.py` explains the restriction and writes nothing.

## Read-only interface

These functions are for a later teaching-lab caller. Nothing in the student interface imports them.

```javascript
referenceDatabase.findDisease(query);
referenceDatabase.findISCN(query);
referenceDatabase.getDiseaseDetails(id);
referenceDatabase.getAssociatedAbnormalities(id);
referenceDatabase.getFISHProbes(id);
```

`findChromosome`, `findGene`, and `findFusion` are also exported. FISH patterns are stored on a probe, not on a disease.
