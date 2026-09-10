"""Package the tracked WASM output and Vite build for the Python web service."""

from __future__ import annotations

import json
import shutil
import sys
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


def _validate_distribution(distribution: Path, manifest: Path) -> None:
    entries = json.loads(manifest.read_text(encoding="utf-8"))
    if not isinstance(entries, dict) or "index.html" not in entries:
        raise ValueError("Vite manifest does not contain the index.html entry")
    for entry in entries.values():
        for key in ("imports", "dynamicImports"):
            if any(name not in entries for name in entry.get(key, [])):
                raise ValueError(f"Vite manifest contains an unknown {key} entry")
        for name in [entry["file"], *entry.get("css", []), *entry.get("assets", [])]:
            asset = (distribution / name).resolve()
            if not asset.is_relative_to(distribution.resolve()) or not asset.is_file():
                raise ValueError(f"Vite manifest asset is missing or outside dist: {name}")


def _cleanup(directory: Path, parent: Path) -> None:
    # Only remove the uniquely named directories created by this deployment.
    if directory.resolve().parent != parent.resolve() or not directory.name.startswith((".ui-build-", ".ui-previous-")):
        raise ValueError(f"Refusing to remove unexpected deployment directory: {directory}")
    if directory.exists():
        try:
            shutil.rmtree(directory)
        except OSError as exc:
            print(f"WARNING: Could not clean up {directory}: {exc}", file=sys.stderr)


def package_web_ui(repository_root: Path) -> dict[str, int]:
    """Validate and stage browser assets, rolling back failed installations.

    Stop the local server before installing: the directory and template renames
    are individually atomic, but the complete installation is not a live swap.
    """
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
    _validate_distribution(distribution, manifest)

    static_parent.mkdir(parents=True, exist_ok=True)
    # mkdtemp uses mode 0700, which installs an owner-only ACL on Windows
    # (Python 3.11.10+). Renaming that directory into ui preserves the ACL and
    # locks out the developer/service account when a different account builds.
    # These are public assets: inherit the static parent's normal permissions.
    staging = static_parent / f".ui-build-{uuid.uuid4().hex}"
    staging.mkdir()
    staged_ui = staging / "ui"
    staged_templates = staging / "templates"
    previous_templates = staging / "previous-templates"
    previous_templates.mkdir()
    installed_ui = False
    preserve_staging = False
    changed_templates: list[tuple[Path, Path]] = []
    try:
        shutil.copytree(distribution, staged_ui)
        shutil.copytree(wasm_source, staged_ui / "wasm", dirs_exist_ok=True)
        (staged_ui / ".gitkeep").touch()
        _require_files(staged_ui / "wasm", REQUIRED_WASM_FILES, "Packaged WASM output")
        if not (staged_ui / "index.html").is_file():
            raise RuntimeError("Packaged UI has no index.html")

        outputs = generate_templates(staged_ui / ".vite" / "manifest.json", staged_templates)
        files = [path for path in staged_ui.rglob("*") if path.is_file()]
        result = {"files": len(files), "bytes": sum(path.stat().st_size for path in files)}
        templates.mkdir(parents=True, exist_ok=True)

        if static_target.exists():
            static_target.replace(previous_target)
        try:
            staged_ui.replace(static_target)
            installed_ui = True
            for output in outputs:
                target = templates / output.name
                backup = previous_templates / output.name
                if target.exists():
                    target.replace(backup)
                changed_templates.append((target, backup))
                output.replace(target)
        except Exception:
            try:
                for target, backup in reversed(changed_templates):
                    if backup.exists():
                        backup.replace(target)
                    else:
                        target.unlink(missing_ok=True)
                if installed_ui:
                    static_target.replace(staged_ui)
                if previous_target.exists():
                    previous_target.replace(static_target)
            except Exception as rollback_error:
                preserve_staging = True
                raise RuntimeError(
                    f"UI rollback failed; recovery files retained at {staging} and {previous_target}"
                ) from rollback_error
            raise
        _cleanup(previous_target, static_parent)
    finally:
        if not preserve_staging:
            _cleanup(staging, static_parent)
    return result


def main() -> int:
    repository_root = Path(__file__).resolve().parents[3]
    try:
        result = package_web_ui(repository_root)
    except Exception as exc:
        print(f"UI packaging failed: {exc}", file=sys.stderr)
        if isinstance(exc, PermissionError):
            print("Check the reported path's Windows permissions and stop processes holding build files open.", file=sys.stderr)
        return 1
    print(
        "UI packaging completed "
        f"({result['files']} files, {result['bytes']} bytes)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
