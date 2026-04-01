"""
Generate vite_assets.html and admin_assets.html from Vite's .vite/manifest.json.
Run after every web-ui build (automatically called by build_and_deploy.ps1).
"""
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
MANIFEST = REPO_ROOT / "apps" / "web-ui" / "dist" / ".vite" / "manifest.json"
TEMPLATES = REPO_ROOT / "apps" / "server" / "templates"
BASE = "/static/ui/"


def _collect_chunks(manifest: dict, key: str, visited: set) -> list[dict]:
    """BFS over the import graph, return all reachable chunk entries (deduped)."""
    chunks = []
    queue = list(manifest.get(key, {}).get("imports", []))
    while queue:
        imp = queue.pop(0)
        if imp in visited:
            continue
        visited.add(imp)
        chunk = manifest.get(imp)
        if not chunk:
            continue
        chunks.append(chunk)
        queue.extend(chunk.get("imports", []))
    return chunks


def _entry_tags(manifest: dict, key: str) -> list[str]:
    entry = manifest.get(key)
    if not entry:
        print(f"  WARNING: entry '{key}' not in manifest", file=sys.stderr)
        return []

    visited: set = set()
    chunks = _collect_chunks(manifest, key, visited)

    lines = []
    src = entry.get("file", "")
    if src.endswith(".js"):
        lines.append(f'<script type="module" crossorigin src="{BASE}{src}"></script>')

    # modulepreload + chunk CSS (must come before entry CSS so cascade order is right)
    for chunk in chunks:
        chunk_file = chunk.get("file", "")
        if chunk_file:
            lines.append(f'<link rel="modulepreload" crossorigin href="{BASE}{chunk_file}" />')
        for css in chunk.get("css", []):
            lines.append(f'<link rel="stylesheet" crossorigin href="{BASE}{css}" />')

    # Entry-level CSS last (highest specificity wins)
    for css in entry.get("css", []):
        lines.append(f'<link rel="stylesheet" crossorigin href="{BASE}{css}" />')

    return lines


def main():
    if not MANIFEST.exists():
        print(f"ERROR: {MANIFEST} not found. Run `pnpm build` in apps/web-ui first.")
        sys.exit(1)

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))

    # --- vite_assets.html (main app) ---
    icon = next((v["file"] for k, v in manifest.items() if "vite.svg" in k), None)
    main_lines = []
    if icon:
        main_lines.append(f'<link rel="icon" type="image/svg+xml" href="{BASE}{icon}" />')
    main_lines += _entry_tags(manifest, "index.html")
    out = TEMPLATES / "vite_assets.html"
    out.write_text("{# Auto-generated from Vite manifest #}\n" + "\n".join(main_lines) + "\n", encoding="utf-8")
    print(f"  Written: {out.relative_to(REPO_ROOT)}")

    # --- admin_assets.html (integration entry) ---
    admin_lines = _entry_tags(manifest, "src/integration.tsx")
    out = TEMPLATES / "admin_assets.html"
    out.write_text("{# Auto-generated admin assets #}\n" + "\n".join(admin_lines) + "\n", encoding="utf-8")
    print(f"  Written: {out.relative_to(REPO_ROOT)}")

    print("Done.")


if __name__ == "__main__":
    main()

