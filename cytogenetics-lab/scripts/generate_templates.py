#!/usr/bin/env python3
"""Write educational G-band schematics used to draw placeholder chromosomes."""
import json
from pathlib import Path

# Band weights along p (telomere → centromere) and q (centromere → telomere).
# Stain: 0 gneg, 1 gpos25, 2 gpos50, 3 gpos75, 4 gpos100, 5 gvar/hetero, 6 stalk
CHROMOSOMES = {
    "1": {
        "relativeLength": 8.44,
        "cen": 0.48,
        "morphology": "metacentric",
        "p": [[10, 0], [6, 3], [8, 0], [7, 4], [9, 0], [6, 3], [8, 0], [5, 2], [6, 0]],
        "q": [[8, 5], [7, 0], [9, 3], [6, 0], [8, 4], [7, 0], [6, 2], [8, 0], [7, 3], [6, 0], [5, 2], [6, 0]],
    },
    "2": {
        "relativeLength": 8.02,
        "cen": 0.39,
        "morphology": "submetacentric",
        "p": [[8, 0], [6, 3], [7, 0], [8, 4], [6, 0], [5, 2], [7, 0]],
        "q": [[6, 2], [8, 0], [7, 4], [8, 0], [6, 3], [9, 0], [7, 2], [8, 0], [6, 4], [7, 0], [5, 2], [6, 0]],
    },
    "3": {
        "relativeLength": 6.83,
        "cen": 0.47,
        "morphology": "metacentric",
        "p": [[8, 0], [7, 4], [8, 0], [6, 3], [7, 0], [5, 2], [6, 0]],
        "q": [[6, 2], [7, 0], [8, 4], [6, 0], [7, 3], [8, 0], [6, 2], [7, 0], [5, 4], [6, 0]],
    },
    "4": {
        "relativeLength": 6.30,
        "cen": 0.29,
        "morphology": "submetacentric",
        "p": [[8, 0], [11, 4], [5, 0], [4, 2], [4, 0]],
        "q": [[4, 0], [12, 4], [10, 0], [3, 1], [8, 0], [11, 4], [7, 0], [3, 1], [5, 0], [4, 0]],
    },
    "5": {
        "relativeLength": 6.08,
        "cen": 0.29,
        "morphology": "submetacentric",
        "p": [[9, 0], [4, 2], [6, 0], [11, 4], [4, 0]],
        "q": [[11, 4], [8, 0], [4, 1], [12, 0], [4, 2], [8, 0], [3, 1], [6, 0], [4, 1], [5, 0]],
    },
    "6": {
        "relativeLength": 5.90,
        "cen": 0.39,
        "morphology": "submetacentric",
        "p": [[8, 0], [12, 4], [6, 0], [3, 1], [4, 0]],
        "q": [[4, 1], [6, 0], [12, 4], [8, 0], [4, 1], [7, 0], [3, 2], [6, 0], [3, 1], [4, 0]],
    },
    "7": {
        "relativeLength": 5.36,
        "cen": 0.39,
        "morphology": "submetacentric",
        "p": [[7, 0], [5, 3], [8, 0], [4, 1], [4, 0]],
        "q": [[3, 1], [8, 0], [4, 2], [6, 0], [4, 3], [7, 0], [12, 4], [6, 0], [3, 1], [5, 0]],
    },
    "8": {
        "relativeLength": 4.93,
        "cen": 0.33,
        "morphology": "submetacentric",
        "p": [[8, 0], [6, 3], [5, 0], [3, 1]],
        "q": [[4, 1], [6, 0], [12, 4], [8, 0], [4, 2], [7, 0], [3, 3], [5, 0]],
    },
    "9": {
        "relativeLength": 4.80,
        "cen": 0.35,
        "morphology": "submetacentric",
        "p": [[8, 0], [8, 4], [5, 0], [3, 1]],
        "q": [[14, 5], [6, 0], [5, 3], [8, 0], [6, 4], [6, 0], [3, 1], [4, 0]],
    },
    "10": {
        "relativeLength": 4.59,
        "cen": 0.34,
        "morphology": "submetacentric",
        "p": [[6, 0], [7, 3], [5, 0], [3, 1]],
        "q": [[11, 4], [8, 0], [4, 1], [6, 0], [11, 4], [6, 0], [3, 1], [4, 0]],
    },
    "11": {
        "relativeLength": 4.61,
        "cen": 0.40,
        "morphology": "submetacentric",
        "p": [[7, 0], [9, 4], [5, 0], [3, 1]],
        "q": [[4, 1], [8, 0], [12, 4], [7, 0], [4, 2], [6, 0], [3, 1], [4, 0]],
    },
    "12": {
        "relativeLength": 4.47,
        "cen": 0.27,
        "morphology": "submetacentric",
        "p": [[6, 0], [7, 3], [4, 0]],
        "q": [[11, 4], [6, 0], [4, 1], [7, 0], [4, 2], [6, 0], [11, 4], [5, 0]],
    },
    "13": {
        "relativeLength": 3.74,
        "cen": 0.16,
        "morphology": "acrocentric",
        "p": [[3, 0], [6, 6], [3, 0]],
        "q": [[12, 4], [8, 0], [4, 1], [6, 0], [9, 4], [6, 0], [3, 1], [4, 0]],
    },
    "14": {
        "relativeLength": 3.56,
        "cen": 0.16,
        "morphology": "acrocentric",
        "p": [[3, 0], [4, 6], [2, 0]],
        "q": [[4, 0], [6, 1], [11, 4], [8, 0], [4, 2], [7, 0], [3, 1], [4, 0]],
    },
    "15": {
        "relativeLength": 3.46,
        "cen": 0.17,
        "morphology": "acrocentric",
        "p": [[2, 0], [5, 6], [3, 0]],
        "q": [[14, 5], [8, 0], [5, 3], [6, 0], [4, 1], [6, 0], [3, 2], [4, 0]],
    },
    "16": {
        "relativeLength": 3.36,
        "cen": 0.41,
        "morphology": "metacentric",
        "p": [[6, 0], [6, 3], [5, 0], [3, 1]],
        "q": [[13, 5], [5, 0], [5, 3], [5, 0], [3, 1], [4, 0]],
    },
    "17": {
        "relativeLength": 3.25,
        "cen": 0.32,
        "morphology": "submetacentric",
        "p": [[6, 0], [4, 2], [4, 0]],
        "q": [[4, 0], [5, 1], [11, 4], [6, 0], [4, 2], [5, 0]],
    },
    "18": {
        "relativeLength": 2.93,
        "cen": 0.26,
        "morphology": "submetacentric",
        "p": [[5, 0], [5, 3], [3, 0]],
        "q": [[11, 4], [6, 0], [4, 1], [6, 0], [11, 4], [4, 0]],
    },
    "19": {
        "relativeLength": 2.67,
        "cen": 0.48,
        "morphology": "metacentric",
        "p": [[6, 0], [3, 1], [5, 0]],
        "q": [[7, 5], [8, 0], [3, 1], [6, 0]],
    },
    "20": {
        "relativeLength": 2.56,
        "cen": 0.44,
        "morphology": "metacentric",
        "p": [[5, 0], [7, 4], [4, 0]],
        "q": [[4, 1], [6, 0], [9, 4], [5, 0]],
    },
    "21": {
        "relativeLength": 1.90,
        "cen": 0.19,
        "morphology": "acrocentric",
        "p": [[2, 0], [5, 6], [2, 0]],
        "q": [[12, 4], [5, 0], [3, 1], [4, 0]],
    },
    "22": {
        "relativeLength": 2.04,
        "cen": 0.20,
        "morphology": "acrocentric",
        "p": [[2, 0], [3, 6], [2, 0]],
        "q": [[9, 5], [6, 0], [5, 3], [5, 0]],
    },
    "X": {
        "relativeLength": 5.12,
        "cen": 0.40,
        "morphology": "submetacentric",
        "p": [[7, 0], [5, 3], [8, 0], [7, 4], [4, 0]],
        "q": [[4, 1], [7, 0], [12, 4], [6, 0], [4, 2], [7, 0], [3, 1], [4, 0]],
    },
    "Y": {
        "relativeLength": 2.15,
        "cen": 0.22,
        "morphology": "acrocentric",
        "p": [[5, 0], [3, 1], [3, 0]],
        "q": [[3, 0], [14, 5], [3, 0]],
    },
}

OUT = {
    "description": "Simplified G-band schematics for educational placeholder chromosomes. These are not authentic specimens and are not a substitute for ISCN 400-band ideograms.",
    "stain_scale": {
        "0": "gneg",
        "1": "gpos25",
        "2": "gpos50",
        "3": "gpos75",
        "4": "gpos100",
        "5": "gvar",
        "6": "stalk",
    },
    "chromosomes": CHROMOSOMES,
}

def main():
    dest = Path(__file__).resolve().parents[1] / "data" / "chromosome-templates.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(OUT, indent=2) + "\n")
    print(f"wrote {dest}")

if __name__ == "__main__":
    main()
