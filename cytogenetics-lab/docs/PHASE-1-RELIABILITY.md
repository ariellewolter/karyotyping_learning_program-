# Phase 1 reliability checkpoint — 2026-10-25

## Implemented

- FISH summaries distinguish completed, pending, incomplete and excluded nucleus records.
- Pattern percentages are withheld until all nucleus records are complete; excluded nuclei are not counted in the denominator.
- Nucleus completion uses a shared status calculation. Blank, negative, fractional and greater-than-99 counts do not complete a record; explicit zero does.
- Interpretation feedback explicitly distinguishes agreement with the curated answer from support in learner observations. This is not an automated interpretation of the learner's records.
- Backup restoration preserves the learner's ISCN draft, hidden teaching answer and answer-reveal state.
- Imports reject excessive case counts and unsupported or oversized images rather than silently dropping them and potentially invalidating crop/image associations.
- Focused karyotype summaries identify their worksheet as partial, not a complete constructed karyotype.

## Verified

- Live normal-46xy Learn workflow: all four matching sets, evidence gating, incorrect homolog rejection, correction, click placement, dragging from the chromosome graphic, progression and final summary.
- Live CEP21 Practice workflow: blank-entry rejection, five nucleus records, exclusion reason, revisiting/correcting earlier records, final-nucleus recording, submission, interpretation feedback and final performance summary.
- Isolated execution of the actual case save, export and import handlers: draft/observation round-trip, teaching-answer preservation, chromosome assignment preservation, retention of existing cases and atomic rejection of invalid image backups.
- Isolated import checks for FISH nucleus records and pattern tables.
- Existing disease/activity validation script passes. It now includes completion/percentage regression checks for five assay types and complete fixture records including exclusion reasons.
- JavaScript syntax checks and Git whitespace checks pass.

## Scope and remaining verification

- The save/backup checks used synthetic storage and mocked browser boundaries, not a real user file-picker round-trip. Existing user cases were not overwritten.
- Full live workflows were exercised for normal-46xy Learn and CEP21 Practice, not every disease, assay or assessment combination.
- Learning sessions remain distinct from saved patient-case records; this checkpoint does not introduce automatic resume after refreshing a learning exercise.
- Cross-browser, touch, keyboard-only and smaller-screen verification remain outstanding.
- This checkpoint does not deliver the later visual redesign, authentic specimen library, external case retrieval or scientific review.
