# Cytogenetics Laboratory — Architecture

The student application is a static web app. Curated JSON data supplies the cases, chromosome maps, probes, ISCN examples, scoring rules, and answer keys. The application is an educational tool, not a clinical diagnostic system.

## Product structure

Home presents two laboratories. Each has two destinations:

| Destination | Purpose |
| --- | --- |
| **Learn** | Guided skills and curated exercises. Each skill is one exercise. |
| **Casework** | A learner's own de-identified study material, with two entry options. *Explore a disease*: the learner picks a known disease; the specimen is drawn from its teaching record, and the curated ISCN, FISH result, and teaching notes stay hidden until submission. *Investigate an unknown*: a blinded specimen from the teaching catalog; answers stay hidden until submission or instructor release. A typed ISCN is drawn as written. Every case ends in one integrated case report (`js/case-submission.js`). Disease-linked practice stays in Learn. |

The home screen keeps these destinations visible within each lab and links to existing representative exercises. Learn presents skills as a staged path: chromosome foundations → karyotype building → ISCN, and probe target → signal quality → scoring → interpretation. Secondary exercises remain available within their stage. Disease-linked karyotype and FISH practice is listed in Learn. Casework holds only the learner's own cases. Adding a case continues through Add information → Review → Open workspace. A learner can start a saved case from the curated Disease Atlas; available ISCN, linked FISH teaching details, the catalog's citations, and a generated demonstration image are filled in automatically and provenance is retained in review, workspace, and backups. The image is drawn in the browser from the disease's teaching karyotype plus the GRCh38 band map, or from the linked FISH nuclei. This is a local curated import, not a live clinical database connection or a patient-record search; it does not fetch microscope images or patient-specific results.

| Laboratory | Scope |
| --- | --- |
| **Karyotyping Lab** | Chromosome anatomy and banding, whole-cell karyotypes, abnormalities, and ISCN. |
| **FISH Lab** | Probe strategy and localization, signal quality, nucleus scoring, and interpretation. |

Single-chromosome foundations are skills within the Karyotyping Lab; they are not a third top-level lab. Atlas is a reference library, not a second case workflow. Help explains navigation and limits.

## Learner routes

| Hash | Screen |
| --- | --- |
| `#/` | Home and lab selection |
| `#/lab/karyotype`, `#/lab/fish` | Lab Learn hub |
| `#/lab/<lab>/<exercise>/<case>/learn` | Curated exercise |
| `#/patients/<lab>` | Casework: the learner's own cases |
| `#/patients/<lab>/new` | Add a learner-owned case |
| `#/patients/<lab>/<id>/review` | Review saved source information |
| `#/patients/<lab>/<id>` | Learner's local observation workspace |
| `#/atlas` | Chromosome and disease reference |
| `#/reference`, `#/credits`, `#/help` | Reference library, credits, and help |

Legacy routes such as `#/module/...` and `#/case/...` are parsed and redirected to current lab or disease routes. Keep old bookmarks working when changing navigation.

## Case and data model

- `data/catalog.json` indexes the exercise files in `data/cases/`.
- `data/diseases.json` contains disease reference records and teaching cases.
- `data/disease-activities.json` links a disease to reusable assembly and FISH payloads; it does not duplicate those payloads.
- `data/chromosome-templates.json`, `data/chromosome-maps.json`, and `data/probes.json` provide shared reference data.
- `js/labs.js` owns lab/exercise definitions and maps legacy module names.
- `caseMatchesExercise` in `js/labs.js` is the gate for listing only playable exercises. Data dependencies such as a chromosome map for FISH are not standalone activities.
- `js/activities.js` separates method appropriateness from whether an exercise payload is actually available.
- Atlas provides disease/chromosome lookups and can launch the same underlying teaching activity; it should not become a parallel case implementation.
- `#/patients/...` cases are separate from curated teaching cases. Learner material and notes are stored in browser local storage and must remain manual observations, not automated diagnosis or image interpretation.

## Activity modes

The mode is selected before an exercise and remains fixed for that session:

| Mode | Learner support |
| --- | --- |
| Learn | A short lesson precedes the task, with explanatory feedback. |
| Practice | Starts with the question and offers progressive hints and correction. |
| Assessment | Withholds hints and answer-revealing feedback until the summary. |

The workspace should preserve a consistent frame across both labs while allowing each task to keep its specialized controls. Keep the current specimen/task prominent, make progress understandable, and keep history, references, and hints available without competing with the analysis area.

FISH nucleus scoring prioritizes the scorable decision and assay-specific aggregate counts. Individual signal marking remains available as a focused annotation activity and is required only when an assay explicitly sets `require_signal_annotations`; it should not duplicate every count by default.

Karyotype cases may set `learning_focus_slots` to teach homolog comparison with a representative subset in Learn mode. Practice and Assessment retain the full chromosome set unless the case itself defines involved chromosomes, so guided pair work does not replace whole-cell analysis.

## Code map

| Path | Responsibility |
| --- | --- |
| `index.html`, `css/app.css` | App shell and visual system |
| `js/main.js`, `js/util.js`, `js/store.js` | Boot, routing helpers, and session state |
| `js/ui.js` | Home, lab hubs, casework, patient case flows, disease pages, and shared activity workspace |
| `js/labs.js`, `js/activities.js`, `js/pedagogy.js` | Lab discovery, case planning, lessons and hints |
| `js/karyotype.js`, `js/iscn.js`, `js/scoring.js` | Karyotype interactions, supported ISCN processing, and session scoring |
| `js/chromosomes.js`, `js/banding.js`, `js/ideogram.js`, `js/assembly-ui.js` | Schematic chromosome rendering, maps, and single-chromosome exercises |
| `js/fish.js`, `js/fish-ui.js`, `js/fish-microscopy.js` | FISH assay state, learner controls, and synthetic teaching graphics |
| `js/atlas.js`, `js/atlas-ui.js` | Reference catalog and linked teaching activities |
| `js/cases.js` | Load and hydrate catalog data |
| `js/patient-karyogram.js` | Manual cropping and assignment of learner-supplied or generated chromosome images |
| `js/specimen-image.js` | Draws a demonstration metaphase or FISH field when a teaching case is imported; also the numbered, selectable reference spread used by the karyogram bench |
| `js/karyogram-bench.js` | Whole-cell karyogram bench: numbered places 1–22, X, Y, a filmstrip of chromosomes cut from the spread, rotate/flip, undo/redo, keyboard assignment. Learning aids (arranged preview, number and colour badges, bounce-back of wrong drops) are off in assessments |
| `js/case-submission.js` | Casework stages, the submission snapshot, and the integrated case report (PDF and JSON). The report is built from learner entries only and never includes the curated answer |

## Scientific and product limits

- Schematic chromosomes and synthetic fluorescence are teaching graphics, not authentic microscopy.
- Patient-case image markers, chromosome crops/assignments, and FISH counts are manual learner annotations. The program does not recognize chromosomes, detect signals, or determine diagnoses.
- ISCN summaries and grading apply only to explicitly supported forms and curated answer keys; unsupported input must not be guessed or normalized into a clinical claim.
- The casework lookup classifies a disease name, a band, or an ISCN string. It draws a karyotype only from a formula already written in the query or in a Disease Atlas record. It attaches FISH only from a stored teaching assay whose probe loci match that record. OMIM, when an API key is saved in the browser, contributes a title, MIM number, cytogenetic location, and entry link. Those fields are not written into `data/diseases.json`. Mitelman, the Atlas of Genetics, and the MetaSystems, CytoCell, and Vysis probe catalogs stay outbound links. The lookup does not author an ISCN or a signal pattern, and it does not copy manufacturer diagrams.
- FISH interpretation follows the case's recorded assay and scoring rules. There is no universal cutoff in the engine.
- Preserve the source finding and source image separately from learner observations.
- Casework never reveals a curated answer on submission. Submitting freezes the learner's work and generates the PDF; the answer stays hidden. Only the guided walkthrough shows a teaching answer, and only with the instructor flag on. The instructor flag is a display setting, not access control: answer keys ship with the case data and sit in browser storage, so the application cannot keep graded answers confidential.
- Casework stages are informational. A stage can be recorded, not yet recorded, or optional; missing-field warnings never block export and never judge an interpretation.

## Validation

Run JavaScript syntax checks for edited modules and `node scripts/check-disease-activities.mjs` after data/model changes. Run `node scripts/check-casework-reports.mjs` after casework or report changes: it submits numerical, deletion, translocation, FISH enumeration, break-apart, and dual-fusion cases with deliberate student mistakes and checks that each report keeps the learner's entries and contains no curated answer. The activity audit checks the coverage and readiness of linked teaching activities; when it fails on incomplete case data, report that separately from UI validation and repair only the relevant record or audit assumption.
