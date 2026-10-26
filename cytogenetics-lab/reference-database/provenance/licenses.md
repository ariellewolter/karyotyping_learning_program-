# Source licenses and use limits

Retrieved 2026-10-25 for a local educational reference database.

## NCBI MedGen

Files: `NAMES.RRF.gz`, `MGSTY.RRF.gz`, `MGDEF.RRF.gz`, `MedGenIDMappings.txt.gz`, and the MedGen README.

NLM-authored MedGen material is public-domain information and may be copied with acknowledgment. MedGen also redistributes strings from other vocabularies.

This build keeps names and definitions from GTR, NCI, MeSH (`MSH`), Orphanet (`ORDO`), HPO, MONDO, GeneReviews, GHR, MedGen, and NCBI. It does not copy SNOMED CT strings or OMIM narrative. OMIM, MONDO, HPO, Orphanet, and other identifiers are stored as identifiers only.

Source: https://ftp.ncbi.nlm.nih.gov/pub/medgen/

## ClinGen dosage sensitivity

Files: `ClinGen_region_curation_list_GRCh38.tsv` (file date 28 Apr 2026) and `ClinGen_gene_curation_list_GRCh38.tsv` (file date 25 Oct 2026). Genome assembly GRCh38, `GCF_000001405.36`.

Scores, cytobands, coordinates, and MONDO identifiers are stored as published. An ISCN formula is not created from a coordinate.

Source: https://ftp.clinicalgenome.org/

## MONDO titles

`mondo_titles.tsv` supplies a display name when a ClinGen row cites a MONDO id that is not already a MedGen preferred name.

## Educational examples

`data/normalized/educational.json` is original teaching text. It is labeled `educational` in the database. It is not a copy of the teaching application, and it is not a manufacturer probe sheet.

## FISH manufacturer material

MetaSystems, CytoCell, and Abbott Molecular diagrams and catalog copy are not scraped or stored. The probe table is ready for a later, separately documented entry. Current probe rows are educational summaries, and each signal pattern belongs to one probe configuration.

## Mitelman Database

Not imported. The public site (https://mitelmandatabase.isb-cgc.org/) is a search interface. The ISB-CGC distribution is available through BigQuery and needs a Google Cloud project. No compressed bulk file, extracted size, or redistribution license suitable for a student desktop application was established. `scripts/import_mitelman.py` refuses to download data and writes nothing unless a person supplies a local file and an explicit local-use flag. Even then it does not load rows, because a permitted column mapping is not established.
