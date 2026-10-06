# Cytogenetics laboratory teaching platform

Interactive undergraduate/graduate laboratory instruction for chromosome analysis, human karyotyping, ISCN nomenclature, and FISH.

This program is for **education only**. It is not a clinical diagnostic system and must not be used to interpret patient specimens.

## Run locally

The case catalog is loaded as JSON, so the folder must be served over HTTP (opening `index.html` as a file will fail in most browsers).

```bash
python serve.py
```

Then open [http://127.0.0.1:8765](http://127.0.0.1:8765).

## Desktop app

The Electron shell serves the same laboratory files. From `cytogenetics-lab`:

```bash
npm install
npm run desktop
```

`npm run package` writes a Windows installer and a portable app to `dist/`.

## What students can do

Home opens three laboratories. Each one can be entered on its own.

1. **Chromosome Analysis** — build one chromosome from G-band segments, name anatomy and loci, and compare a structural rearrangement.
2. **Karyotype & ISCN** — arrange a whole-cell karyotype, classify the finding, and read or write ISCN.
3. **FISH Analysis** — place a probe or score nuclei for the assay that case actually contains.

**Cases** lists each teaching disease once. Opening a disease from a laboratory shows that laboratory's activities. Opening it from Cases or the Atlas shows every applicable method. **Complete case** is the integrated sequence and may cross methods. **Atlas** is the chromosome and disease reference.

Each activity can run as Learn, Practice, or Assessment. The mode is chosen before the session and stays fixed.

Skills Practice inside each laboratory is separate from the disease cases. A case is listed only when that activity can run.

## Adding a laboratory exercise

Do not edit application logic to add content.

1. Copy an existing file in `data/cases/` or follow `data/schema.json`.
2. Register the case in `data/catalog.json` (`case_id`, `path`, `title`, `difficulty`, `case_type`, `modules`).
3. Optional: supply microscopy images in `assets/chromosomes/<case_id>/` and list them in `chromosome_images` with `"placeholder": false` only for authentic images.

A compact `chromosome_set` is enough for schematic chromosomes:

```json
"chromosome_set": {
  "sex": "XX",
  "copy_number": { "21": 3 },
  "variants": { "5a": "del(5)(p15.2)" }
}
```

Difficulty (`introductory`, `intermediate`, `advanced`) and allowed abnormality options live on the case.

## Chromosome images

Schematic G-banded drawings are generated from `data/chromosome-templates.json`. The interface labels them as demonstration assets, not authentic clinical specimens.

To use laboratory images later, set `src` on each `chromosome_images` entry. Expected slot assignment is by chromosome identity, not pixel coordinates.

## Instructor / development

Open `#/instructor` to list cases. Architecture notes are in `docs/ARCHITECTURE.md`.

## Scientific source of answers

Expected ISCN strings, diagnoses, and explanations are curated in each case file. The program does not randomly generate abnormalities.
