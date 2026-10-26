#!/usr/bin/env python3
"""Optional local Mitelman import. This script does not download or bundle Mitelman data.

The public Mitelman site is a search interface. The ISB-CGC copy is queried through
BigQuery and requires a Google Cloud project. No bulk file was found with permission
to redistribute the database inside a student desktop application.

Nothing is imported unless both a local file and --acknowledge-local-use are supplied.
"""

import argparse
import sys


def main():
    parser = argparse.ArgumentParser(description="Optional local Mitelman import")
    parser.add_argument("--file", help="User-supplied local file. Not downloaded by this script.")
    parser.add_argument("--acknowledge-local-use", action="store_true",
                        help="Confirm the file may be used on this machine.")
    args = parser.parse_args()
    print("Mitelman data is not bundled.")
    print("Downloadable redistributable dump: not identified.")
    print("Format: searchable website, plus BigQuery tables that require a cloud project.")
    print("Automated redistribution in this application: not permitted on the evidence available.")
    if not args.file or not args.acknowledge_local_use:
        print("No import performed. Provide a local file and --acknowledge-local-use to enable a future local load.")
        return 0
    print("A local file was supplied, but the column mapping for a permitted Mitelman extract is not established.")
    print("No rows were written.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
