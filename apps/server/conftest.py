"""
Root-level conftest: ensure apps/server and packages/core-table are on sys.path
before tests/conftest.py is loaded. Pytest loads rootdir conftest first.
"""
import sys
import os
from pathlib import Path

root = Path(__file__).parent  # apps/server/
core_table = root.parent.parent / "packages" / "core-table"

for p in (str(root), str(core_table)):
    if p not in sys.path:
        sys.path.insert(0, p)

# Force UTF-8 so emoji-containing log messages don't crash on CJK/Cyrillic terminals
os.environ.setdefault("PYTHONIOENCODING", "utf-8")
