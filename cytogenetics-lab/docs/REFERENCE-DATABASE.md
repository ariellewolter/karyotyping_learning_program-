# Reference database update

Written 2026-10-25. This note describes the standalone cytogenetics reference database added under `cytogenetics-lab/reference-database/`. The teaching cases, grading, and student workflows were left in place. The credits page names the files that were downloaded.

## What the teaching lab already was

The laboratory is a static site. `serve.py` serves it on port 8765. The browser loads case JSON through `js/cases.js`. Disease pages, ISCN drawing, chromosome maps, and FISH activities stay in that application. The reference database does not import those files, and the student pages do not call the new search functions.

## What was added

A separate directory holds the source files, a SQLite database, the import scripts, a read-only search API, and a small viewer.

```text
cytogenetics-lab/reference-database/
  data/sources/            downloaded MedGen, ClinGen, and Mondo files
  data/normalized/         educational examples written for this database
  data/cytogenetics.sqlite
  schemas/schema.sql
  scripts/build_database.py
  scripts/import_mitelman.py
  src/search/              Python search and a JavaScript facade
  src/adapters/server.py   viewer server, port 8770
  viewer/
  tests/test_search.py
  provenance/
```

SQLite is created with Python’s standard-library `sqlite3`. Node 20 on this machine has no built-in SQLite reader, so `reference-database.mjs` asks `query.py` for JSON. The viewer is a separate page at http://127.0.0.1:8770/.

Rebuild and check:

```bash
python3 reference-database/scripts/build_database.py
python3 -m unittest reference-database/tests/test_search.py
python3 reference-database/src/adapters/server.py
```

## What a search returns

The read-only functions are `findDisease`, `findISCN`, `findChromosome`, `findGene`, `findFusion`, `getDiseaseDetails`, `getAssociatedAbnormalities`, and `getFISHProbes`.

`match` is `exact`, `synonym`, `partial`, or `none`. `record_class` is `verified` or `educational`. An ISCN string with no stored record returns `none` and does not invent a disease. The response states that a match is not a clinical diagnosis.

The build on 2026-10-25 contains 54,776 MedGen disease records, 150,126 synonyms, 1,303 ClinGen dosage associations, 10 educational ISCN examples, and 7 educational FISH probe definitions. Each FISH pattern belongs to one probe configuration. The BCR/ABL1 educational dual-fusion example is normal `2R2G` and abnormal `1R1G2F`.

## Downloaded sources

Retrieved 2026-10-25. License limits are also in `reference-database/provenance/licenses.md`. The same citations are on the laboratory Credits page.

### NCBI MedGen

Directory: https://ftp.ncbi.nlm.nih.gov/pub/medgen/

Files: `MGCONSO.RRF.gz`, `NAMES.RRF.gz`, `MGSTY.RRF.gz`, `MGDEF.RRF.gz`, `MedGenIDMappings.txt.gz`, `MedGen_Sources.txt`, and `README.txt`. The MedGen README was last updated November 6, 2024. MedGen refreshes the data files weekly.

NLM-authored MedGen material is public-domain information from the National Library of Medicine: https://www.ncbi.nlm.nih.gov/medgen/

Names and definitions kept in the database come from the Genetic Testing Registry, NCI, MeSH, Orphanet, Mondo, HPO, GeneReviews, and MedlinePlus Genetics. SNOMED CT strings and OMIM narrative text were not copied. OMIM numbers and other external identifiers are stored as identifiers.

### ClinGen dosage sensitivity

Directory: https://ftp.clinicalgenome.org/

- `ClinGen_region_curation_list_GRCh38.tsv`, file date 28 Apr 2026: https://ftp.clinicalgenome.org/ClinGen_region_curation_list_GRCh38.tsv
- `ClinGen_gene_curation_list_GRCh38.tsv`, file date 25 Oct 2026: https://ftp.clinicalgenome.org/ClinGen_gene_curation_list_GRCh38.tsv
- Directory README, dated 18 March 2026

Genome assembly GRCh38, `GCF_000001405.36`. Scores, cytobands, and coordinates are stored as published. A coordinate is not turned into an ISCN formula.

Project pages: https://dosage.clinicalgenome.org/ and https://www.clinicalgenome.org/working-groups/dosage-sensitivity-curation/

### Mondo titles

`mondo_titles.tsv` from the ClinGen FTP directory: https://ftp.clinicalgenome.org/mondo_titles.tsv

These display names are used when a ClinGen row cites a Mondo identifier that is not already a MedGen preferred name. Mondo is the Mondo Disease Ontology: https://mondo.monarchinitiative.org/

## Sources that were not downloaded

The Mitelman Database (https://mitelmandatabase.isb-cgc.org/) was reviewed and not imported. The public site is a search page. The ISB-CGC copy is queried through BigQuery and needs a Google Cloud project. No redistributable bulk file with permission for a student desktop application was identified. `scripts/import_mitelman.py` does not download data and writes no rows.

Manufacturer probe diagrams from MetaSystems, CytoCell, and Abbott Molecular were not scraped or stored. The FISH rows in the database are short educational summaries written for this project.

## Checks

`tests/test_search.py` passed. In the viewer, “Down syndrome” opened MedGen `C0013080` with `47,XX,+21`, `47,XY,+21`, and the chromosome 21 enumeration probe. `47,XY,+21` was an educational exact match. `5p15.2` listed ClinGen dosage records and the cri-du-chat example. `BCR` listed `BCR::ABL1`. An unmatched formula returned no disease.

## Student library and interpretation

The laboratory page `#/library` searches this database through the existing server at `/api/reference/`. The interpretation engine is in `reference-database/src/interpretation/`. It parses supported ISCN into events, links only stored disease and FISH records, and tells the existing chromosome drawer when a schematic is allowed. The API is described in `reference-database/docs/INTERPRETATION-API.md`. Coverage counts are in `reference-database/docs/COVERAGE.md`.

Graded cases are unchanged. If the reference module cannot be loaded, the library says so and the rest of the laboratory still opens.

## Structural chromosome validation

`js/structure-validation.js` checks the drawn chromosome for `del`, `dup`, `inv`, and both derivatives of a two-break reciprocal `t()`. It builds the expected segment order from the GRCh38 band map and the written breakpoints, separately from the drawing code, and compares six things: chromosome and arm, breakpoint location, unaffected bands, segment order and orientation, relative length (within 0.5%), and a single centromere in the expected position. The library shows each check. A rearrangement counts as "Structure validated" only when every drawn chromosome passes.

Each event also gets a resolution note from the band span it covers. Below about 5 Mb, the note says a routine 400–550 band karyotype would usually look normal and FISH or microarray is needed. From 5 to 10 Mb, or when both breakpoints fall in one band, it says the change may be visible only at higher resolution. The drawing keeps true band proportions, so a microdeletion is not exaggerated. A structurally correct drawing is not always diagnostically informative.

`npm run check:structure` validates 20 fixtures. It also confirms that three deliberately faulty drawings are rejected: an interleaved duplication, an exaggerated deletion, and a second centromere. The checks found and fixed two drawing errors. Duplications were interleaved band by band instead of repeated in tandem. A partner p arm joined to a q-arm breakpoint was not reversed, as in der(2)t(2;5)(p23;q35).

## Metaphase presentations

Each session gets a random presentation seed. The metaphase view varies placement order, orientation, bend, mirroring, and condensation for the whole spread (0.86–1.14), with up to ±3% difference between chromosomes. Band maps and relative band sizes are unchanged. "Show another metaphase" draws a new spread for the same case.

## FISH field scoring

The FISH Lab exercise "FISH field scoring" shows 16 nuclei in one field. Scorable nuclei are rotated or mirrored copies of the nuclei authored for that case and probe set, in the authored mix of normal and abnormal patterns. Excluded nuclei are two overlapping pairs, one nucleus with an equivocal signal separation for the assay, and one damaged nucleus with a signal outside the membrane. The student decides whether each nucleus can be scored, then classifies the pattern. Feedback reports scorable decisions, patterns, the scorable fraction against the case minimum, and the percentage of abnormal nuclei. No percentage cutoff is invented. The exercise runs for every interphase case that states both a normal and an abnormal pattern (21 cases).

## ISCN source verification

`reference-database/data/normalized/iscn-verification.json` lists the 78 teaching-catalog strings: 66 imported as teaching-catalog records, and 12 that are also curated educational examples. All are `pending`. A reviewer marks an entry `verified` only after recording the source citation, a stable identifier, the review date, the disease and finding as the source states them, whether the source shows the exact string, and the limitations. The database build promotes only complete verified entries, and `tests/test_verification.py` rejects incomplete ones. `scripts/update_verification_ledger.py` adds new catalog strings without overwriting review work.
