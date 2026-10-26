#!/usr/bin/env python3
"""Command-line read of the reference database. Prints one JSON object."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from search.reference_database import (  # noqa: E402
    find_chromosome,
    find_disease,
    find_fusion,
    find_gene,
    find_iscn,
    get_associated_abnormalities,
    get_disease_details,
    get_fish_probes,
    provenance,
    search,
)


def main():
    if len(sys.argv) < 2:
        raise SystemExit("usage: query.py search <type> <query> | details <id> | abnormalities <id> | fish <id> | provenance")
    command = sys.argv[1]
    if command == "search":
        payload = search(sys.argv[2], " ".join(sys.argv[3:]))
    elif command == "details":
        payload = get_disease_details(sys.argv[2])
    elif command == "abnormalities":
        payload = get_associated_abnormalities(sys.argv[2])
    elif command == "fish":
        payload = {"results": get_fish_probes(sys.argv[2])}
    elif command == "provenance":
        payload = provenance()
    else:
        raise SystemExit(f"unknown command {command}")
    json.dump(payload, sys.stdout)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
