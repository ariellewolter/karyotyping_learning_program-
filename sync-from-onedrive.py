#!/usr/bin/env python3
"""Copy the current OneDrive cytogenetics-lab into this local folder, skipping online-only placeholders."""
import os, shutil
from pathlib import Path

SRC = Path("/Users/ariellewolter/Library/CloudStorage/OneDrive-OldDominionUniversity/2026/karyotyping programming/cytogenetics-lab")
DEST = Path(__file__).resolve().parent / "cytogenetics-lab"
UF_DATALESS = 0x40000000
SKIP_DIRS = {".git", "node_modules", "__pycache__", "lib", "es2015", "bin", "test", "dist"}

def is_dataless(path: Path) -> bool:
    try:
        flags = getattr(os.stat(path, follow_symlinks=False), "st_flags", 0)
    except OSError:
        return True
    return bool(flags & UF_DATALESS)

if not SRC.exists():
    raise SystemExit(f"OneDrive source not found: {SRC}")

copied, skipped = 0, 0
DEST.mkdir(parents=True, exist_ok=True)
for root, dirs, files in os.walk(SRC):
    dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
    rel = Path(root).relative_to(SRC)
    (DEST / rel).mkdir(parents=True, exist_ok=True)
    for name in files:
        if name == ".DS_Store" or "MacBook" in name or "conflict" in name:
            continue
        s = Path(root) / name
        if is_dataless(s):
            skipped += 1
            continue
        shutil.copy2(s, DEST / rel / name)
        copied += 1
print(f"Synced {copied} files from OneDrive ({skipped} cloud-only files skipped)")
print(DEST)
