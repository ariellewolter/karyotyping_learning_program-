# Source review instructions

Review teaching-catalog diseases for an educational cytogenetics program. Each disease is reviewed as separate facets. A source that supports a disease association does not verify the exact ISCN string used in the teaching catalog.

## Hard rules

1. Cite only pages you fetched successfully in this session (WebFetch or a search result you opened). Never cite from memory.
2. Every source has a verbatim `excerpt` (at most 300 characters) copied from the fetched page. It must contain the claim it supports.
3. If you cannot fetch a supporting page, set that facet's status to `pending`. Do not guess.
4. Preferred sources, in order:
   - NCBI GeneReviews (ncbi.nlm.nih.gov/books/NBK…)
   - MedlinePlus Genetics (medlineplus.gov/genetics/condition/…)
   - NCI PDQ or NCI dictionaries (cancer.gov)
   - Atlas of Genetics and Cytogenetics in Oncology and Haematology (atlasgeneticsoncology.org)
   - PubMed abstracts of guidelines and classifications, such as the WHO 2022 haematolymphoid classification (PMID 35732831), the International Consensus Classification 2022 (PMID 35767897), and ACMG/ACGS guidance
   - ClinGen (clinicalgenome.org) and Orphanet (orpha.net)

   Avoid Wikipedia, blogs, and manufacturer probe pages. Do not copy manufacturer diagrams.
5. Do not edit any file except your own output file.

## Facets (per disease)

Each facet is `{ "status": "supported" | "pending" | "not_applicable", "statement": "<one sentence in your words>", "sources": [<source>, ...] }`.

- `association`: the source links the disease to the cytogenetic abnormality (for example, trisomy 21 and Down syndrome).
- `iscn_representation`: the source shows the abnormality written in ISCN (for example, `t(9;22)(q34;q11.2)` or `47,XX,+21`). Quote the notation as written in the source.
- `assay_applicability`: which assay the source says detects it (routine karyotype, FISH, chromosomal microarray, methylation, RT-PCR), and whether a routine karyotype can miss it.
- `limitations`: variants the source names, such as mosaicism, Robertsonian or other translocation forms, variant partners, cryptic or submicroscopic forms, and alternate breakpoints.

A source is `{ "citation": "<title, publisher or journal, year>", "identifier": "<PMID, NBK id, DOI, or stable URL id>", "url": "<fetched URL>", "reviewed": "2026-10-25", "excerpt": "<verbatim>", "supports": ["association", ...] }`.

## Strings (per catalog entry)

For each catalog string listed for your disease, give:

- `text`: the exact text as given to you.
- `kind`: `iscn` if it is an ISCN karyotype or notation. `note` if it is explanatory prose.
- `basis`, one of:
  - `exact_published`: the whole string appears verbatim in a fetched source. Name the source in `source_url`.
  - `educational_example`: a valid example consistent with a supported association and the notation a source shows, but not a published specimen.
  - `invalid_notation`: the string does not follow current ISCN (2020/2024). Explain why in `note`.
  - `not_applicable`: use for prose notes.
- `notation_issue`: an empty string, or a short ISCN problem. Examples: a mosaic written without cell counts in square brackets (ISCN requires, for example, `47,XX,+21[12]/46,XX[8]`); a deletion written without a breakpoint band; a band that is not in the current band nomenclature.
- `note`: short and specific.

## Output

Write one JSON file at the path you are given:

```json
{
  "group": "<name>",
  "reviewer": "automated source search, pending human review",
  "diseases": [
    {
      "teaching_catalog_id": "<id>",
      "disease": "<name>",
      "facets": { "association": {...}, "iscn_representation": {...}, "assay_applicability": {...}, "limitations": {...} },
      "strings": [ {...} ],
      "open_questions": ["<anything a human reviewer should check>"]
    }
  ]
}
```

Validate the file with `python3 -m json.tool <path>`. In your final message, give one line per disease with the facet statuses, plus any fetch failures.
