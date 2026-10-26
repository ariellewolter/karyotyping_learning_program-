# Search and interpretation API

Read-only. The teaching pages call these routes on the same server that serves the laboratory. If the reference module cannot be loaded, each route returns `available: false` and the graded activities still open.

Desktop packaging calls the same adapter with `python3 reference-database/src/adapters/api.py <path> <query>`. Students do not start a second server. The desktop shell needs `python3` on the machine. Without it, the library reports that the module is unavailable.

## Routes

`GET /api/reference/status`

`GET /api/reference/search?type=disease|iscn|chromosome|gene|fusion&q=`

`GET /api/reference/disease?id=`

`GET /api/reference/interpret?q=`

`GET /api/reference/coverage`

`GET /api/reference/chromosome?q=1..22|X|Y` lists the diseases linked to stored abnormalities on one chromosome. Each disease appears once. Its `evidence_group` is the strongest it has: `educational`, `sufficient` (ClinGen score 3), `limited` (score 1 or 2), `recessive` (score 30), or `other`. The Atlas chromosome page uses this route.

`GET /api/reference/chromosome-counts` returns the number of distinct linked diseases for each chromosome. The Atlas index uses it.

## Interpretation

`interpret_iscn` keeps the original string and returns structured events. `status` is `complete`, `partial`, or `empty`.

`validation` reports three separate levels:

- `syntax`: `validated` when every token is in the registry, `partial` when a token is recognized but not interpreted, `none` when the query is empty.
- `structure`: `validated` for a normal complement or a numerical gain or loss, because those diagrams use the unmodified band map. `not_checked` for deletions, duplications, inversions, translocations, derivatives, rings, Robertsonian fusions, and mosaics. Parsing those symbols does not mean the rearranged chromosome was reconstructed correctly.
- `association`: `verified` only for an external source row, `teaching-catalog` for a canonical teaching formula, `educational` for a curated example, `structural` for band overlap, and `none` when no disease is stored. A normal `46,XX` or `46,XY` is not stored as a disease association.

A token is interpreted only when it is in `reference-database/src/interpretation/registry.py`. `add`, `mar`, `idic`, `dic`, `ins`, `trp`, `idem`, and `chi` are recognized and left without a chromosome structure. An unknown token is not given a guessed meaning.

`visualization` is true only when every cell line parsed completely and each supported event has a schematic. The picture is built from cytogenetic bands by the existing chromosome drawer. A mosaic picture uses the first cell line and says so.

`associations.match` is `exact`, `structural`, or `none`. Exact means a stored ISCN row. Structural means a band or dosage overlap and can name more than one condition. `none` means no disease was attached. A disease lookup returns only ISCN strings already stored on that record.

FISH patterns are returned only for a stored probe whose targets match the parsed event, or for probes already stored on a disease record. A translocation without both breakpoints does not receive a signal pattern.

## JavaScript

The laboratory page is `js/reference-library.js`. It does not import the grading engine. The Python functions live in `reference-database/src/interpretation/engine.py`: `interpret_iscn`, `disease_record`, and `capabilities_for`.
