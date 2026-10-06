# Architecture

The student workspace is a static web application. Educational content is JSON. Diagnoses, ISCN strings, chromosome inventories, FISH cutoffs, and assembly transforms are curated in data files. The engines do not invent them.

This program is for education only. It is not a clinical diagnostic system.

## Laboratories

Home offers three laboratories. They are separate workspaces, not a required sequence.

| Laboratory | Student activity |
| --- | --- |
| Chromosome Analysis | One chromosome: anatomy, G-band assembly, locus naming, structural comparison |
| Karyotype & ISCN | Whole-cell arrangement, abnormality class, ISCN, disease association |
| FISH Analysis | Probe localization, probe type, and nucleus scoring for the assay the case actually contains |

A case appears in a laboratory only when that activity can run. A chromosome map used to place a FISH probe is a data dependency (`assembly.role` of `dependency`), not a Chromosome Analysis exercise. An ISCN string stored on a single-chromosome exercise is not a whole-cell karyotype. Skill lists and Start new case both use `caseMatchesExercise` in `js/labs.js`.

Skills Practice is the generic technical set (normal karyotypes, chromosome 7, the paracentric inversion drill, enumeration and break-apart practice, probe localization). Disease-linked cases are hidden from those lists and open from the disease instead.

## Cases, Atlas, and disease pages

`data/diseases.json` is the disease library. Atlas browses chromosomes and diseases as reference. Cases lists each teaching disease once.

The disease page is one route, `#/disease/<id>`. A laboratory adds `/focus/<laboratory>` and shows only that method's activities. Cases and Atlas omit the focus, so the same page lists every method the disease can run.

`data/disease-activities.json` points a disease at assembly and FISH case files. It does not copy those payloads into the disease record.

Two different questions stay separate:

- Appropriateness (`methodFit` in `js/activities.js`) asks whether karyotype, chromosome analysis, or FISH is the right method for the canonical case.
- Availability asks whether the linked payload can actually run. A method can be appropriate and not yet built.

Complete Case is the integrated sequence. It may move across karyotype, chromosome analysis, and FISH when the disease has those activities. An individual activity stays in one laboratory.

## Instruction modes

Learn, Practice, and Assessment are chosen before a session and stored as `session.instructionMode`. The mode does not change during the session.

| Mode | Behavior |
| --- | --- |
| Learn | A short lesson precedes the scored step. Hints and explanatory feedback are available. The scored interaction does not leave the answer marked. |
| Practice | The question comes first. Hints advance one at a time. The student can correct a response. |
| Assessment | No hints and no answer-revealing demonstration. The first submitted response is kept. The explanation waits until the summary. |

Atlas does not use these modes.

## Layout

| Path | Role |
| --- | --- |
| `index.html` | Application shell |
| `css/app.css` | Laboratory worksheet appearance |
| `js/main.js` | Boot, data load, hash routing subscription |
| `js/ui.js` | Screens, disease pages, session workspace |
| `js/labs.js` | Laboratory definitions and playable-activity discovery |
| `js/activities.js` | Disease activity catalog, method fit, Complete Case plan |
| `js/pedagogy.js` | Learn, Practice, and Assessment lessons and hints |
| `js/store.js` | Session state |
| `js/karyotype.js` | Whole-cell placement and grading |
| `js/iscn.js` | Normalize, parse, and compare ISCN |
| `js/chromosomes.js` | Expand `chromosome_set`; draw schematic chromosomes |
| `js/banding.js`, `js/assembly-ui.js` | Single-chromosome assembly |
| `js/fish.js`, `js/fish-ui.js`, `js/fish-microscopy.js` | FISH assays and nucleus drawing |
| `js/atlas.js`, `js/atlas-ui.js` | Disease and chromosome reference |
| `js/cases.js` | Catalog and case loading |
| `js/scoring.js` | Skill summary |
| `data/catalog.json` | Index of case files |
| `data/cases/*.json` | Exercises |
| `data/diseases.json` | Teaching diseases |
| `data/disease-activities.json` | Links from a disease to assembly and FISH files |
| `data/chromosome-templates.json` | Schematic G-band drawings |
| `data/chromosome-maps.json` | Ordered band maps |
| `data/probes.json` | FISH probes |
| `data/schema.json` | Documented case fields |
| `assets/chromosomes/` | Optional images |

## Routing

Navigation is the URL hash.

| Hash | Screen |
| --- | --- |
| `#/` | Home |
| `#/lab/chromosome`, `#/lab/karyotype`, `#/lab/fish` | A laboratory, then an exercise, then a case |
| `#/disease/<id>` | Disease page, all applicable methods |
| `#/disease/<id>/focus/<laboratory>` | Same page, one laboratory |
| `#/disease/<id>/<activity>/<learn\|practice\|assessment>` | One activity |
| `#/atlas` | Chromosome and disease reference |
| `#/cases` | Disease list |
| `#/reference` | ISCN and band reference |
| `#/help` | How to use the laboratory |
| `#/instructor` | Case list for development |

`#/module/...` and `#/case/...` redirect into the current laboratory or disease routes.

## Grading

Karyotype grading compares chromosome identity with the numbered slot. Pixel position is ignored. ISCN comparison uses the normalized string against `expected_iscn` and accepted variants. Assembly grading checks band order. FISH grading uses the case's own normal and abnormal counts, probes, and interpretation. There is no universal signal cutoff in the engine.

Placeholder graphics stay labeled as demonstration assets.
