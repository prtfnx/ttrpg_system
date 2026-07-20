"""Package the tracked WASM output and Vite build for the Python web service."""

from __future__ import annotations

import shutil
import sys
import tempfile
import uuid
from pathlib import Path

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from scripts.update_vite_assets import generate_templates  # noqa: E402

REQUIRED_WASM_FILES = {
    "ttrpg_rust_core.js",
    "ttrpg_rust_core_bg.wasm",
}


def _require_files(directory: Path, filenames: set[str], label: str) -> None:
    missing = sorted(
        filename for filename in filenames if not (directory / filename).is_file()
    )
    if missing:
        raise RuntimeError(f"{label} is incomplete; missing: {', '.join(missing)}")


def package_web_ui(repository_root: Path) -> dict[str, int]:
    """Stage and atomically install production browser assets."""
    repository_root = repository_root.resolve()
    web_root = repository_root / "apps" / "web-ui"
    server_root = repository_root / "apps" / "server"
    distribution = web_root / "dist"
    manifest = distribution / ".vite" / "manifest.json"
    wasm_source = web_root / "src" / "lib" / "wasm" / "generated"
    static_parent = server_root / "static"
    static_target = static_parent / "ui"
    templates = server_root / "templates"
    previous_target = static_parent / f".ui-previous-{uuid.uuid4().hex}"

    if not manifest.is_file() or not (distribution / "index.html").is_file():
        raise RuntimeError("Vite production output is missing or incomplete")
    _require_files(wasm_source, REQUIRED_WASM_FILES, "Tracked WASM output")

    static_parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=".ui-build-", dir=static_parent))
    try:
        shutil.copytree(distribution, staging, dirs_exist_ok=True)
        shutil.copytree(wasm_source, staging / "wasm", dirs_exist_ok=True)
        (staging / ".gitkeep").touch()
        _require_files(staging / "wasm", REQUIRED_WASM_FILES, "Packaged WASM output")
        if not (staging / "index.html").is_file():
            raise RuntimeError("Packaged UI has no index.html")

        generate_templates(manifest, templates)

        if static_target.exists():
            static_target.replace(previous_target)
        try:
            staging.replace(static_target)
        except Exception:
            if previous_target.exists():
                previous_target.replace(static_target)
            raise
        if previous_target.exists():
            shutil.rmtree(previous_target)
    finally:
        if staging.exists():
            shutil.rmtree(staging)

    files = [path for path in static_target.rglob("*") if path.is_file()]
    return {
        "files": len(files),
        "bytes": sum(path.stat().st_size for path in files),
    }


def main() -> int:
    repository_root = Path(__file__).resolve().parents[3]
    try:
        result = package_web_ui(repository_root)
    except Exception as exc:
        print(f"Render UI packaging failed: {exc}", file=sys.stderr)
        return 1
    print(
        "Render UI packaging completed "
        f"({result['files']} files, {result['bytes']} bytes)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
