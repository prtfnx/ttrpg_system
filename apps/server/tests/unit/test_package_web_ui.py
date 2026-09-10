"""Tests for cross-platform Render browser-asset packaging."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from scripts.package_web_ui import package_web_ui


def _write_build(repository_root):
    distribution = repository_root / "apps" / "web-ui" / "dist"
    manifest_dir = distribution / ".vite"
    manifest_dir.mkdir(parents=True)
    (distribution / "index.html").write_text("<main></main>", encoding="utf-8")
    (distribution / "main-test.js").write_text("export {};", encoding="utf-8")
    (distribution / "main-test.css").write_text(":root {}", encoding="utf-8")
    (distribution / "vendor-test.js").write_text("export {};", encoding="utf-8")
    manifest = {
        "index.html": {
            "file": "main-test.js",
            "css": ["main-test.css"],
            "imports": ["vendor"],
            "isEntry": True,
        },
        "vendor": {"file": "vendor-test.js"},
    }
    (manifest_dir / "manifest.json").write_text(
        json.dumps(manifest),
        encoding="utf-8",
    )

    wasm = (
        repository_root
        / "apps"
        / "web-ui"
        / "src"
        / "lib"
        / "wasm"
        / "generated"
    )
    wasm.mkdir(parents=True)
    (wasm / "ttrpg_rust_core.js").write_text("export {};", encoding="utf-8")
    (wasm / "ttrpg_rust_core_bg.wasm").write_bytes(b"\0asm")


@pytest.mark.unit
def test_package_web_ui_installs_dist_wasm_and_template_fragments(tmp_path):
    _write_build(tmp_path)
    old_target = tmp_path / "apps" / "server" / "static" / "ui"
    old_target.mkdir(parents=True)
    (old_target / "obsolete.js").write_text("old", encoding="utf-8")

    result = package_web_ui(tmp_path)

    assert result["files"] >= 7
    assert not (old_target / "obsolete.js").exists()
    assert (old_target / "index.html").is_file()
    assert (old_target / "wasm" / "ttrpg_rust_core_bg.wasm").read_bytes() == b"\0asm"
    vite_assets = (
        tmp_path / "apps" / "server" / "templates" / "vite_assets.html"
    ).read_text(encoding="utf-8")
    assert "/static/ui/vendor-test.js" in vite_assets
    assert "/static/ui/main-test.js" in vite_assets
    assert "/static/ui/main-test.css" in vite_assets


@pytest.mark.unit
def test_package_web_ui_refuses_incomplete_build_without_replacing_target(tmp_path):
    target = tmp_path / "apps" / "server" / "static" / "ui"
    target.mkdir(parents=True)
    marker = target / "existing.js"
    marker.write_text("keep", encoding="utf-8")

    with pytest.raises(RuntimeError, match="Vite production output"):
        package_web_ui(tmp_path)

    assert marker.read_text(encoding="utf-8") == "keep"


@pytest.mark.unit
def test_package_web_ui_rejects_missing_chunk_before_touching_release(tmp_path):
    _write_build(tmp_path)
    package_web_ui(tmp_path)
    target = tmp_path / "apps/server/static/ui"
    templates = tmp_path / "apps/server/templates"
    before = (templates / "vite_assets.html").read_bytes()
    (tmp_path / "apps/web-ui/dist/vendor-test.js").unlink()

    with pytest.raises(ValueError, match="asset is missing"):
        package_web_ui(tmp_path)

    assert (target / "vendor-test.js").is_file()
    assert (templates / "vite_assets.html").read_bytes() == before


@pytest.mark.unit
@pytest.mark.parametrize("failure", ["copy", "ui_rename", "second_template"])
def test_package_web_ui_rolls_back_failed_install(tmp_path, monkeypatch, failure):
    import scripts.package_web_ui as packaging

    _write_build(tmp_path)
    package_web_ui(tmp_path)
    target = tmp_path / "apps/server/static/ui"
    templates = tmp_path / "apps/server/templates"
    (target / "old-marker").touch()
    (templates / "vite_assets.html").write_text("old main", encoding="utf-8")
    (templates / "admin_assets.html").write_text("old admin", encoding="utf-8")
    replace = Path.replace

    def fail_replace(source, destination):
        if ".ui-build-" in str(source) and (
            (failure == "ui_rename" and source.name == "ui")
            or (failure == "second_template" and source.parent.name == "templates" and source.name == "admin_assets.html")
        ):
            raise PermissionError("simulated locked destination")
        return replace(source, destination)

    def fail_copy(*args, **kwargs):
        raise PermissionError("simulated unreadable source")

    monkeypatch.setattr(Path, "replace", fail_replace)
    if failure == "copy":
        monkeypatch.setattr(packaging.shutil, "copytree", fail_copy)

    with pytest.raises(PermissionError, match="simulated"):
        package_web_ui(tmp_path)

    assert (target / "old-marker").exists()
    assert (templates / "vite_assets.html").read_text(encoding="utf-8") == "old main"
    assert (templates / "admin_assets.html").read_text(encoding="utf-8") == "old admin"
    assert not list(target.parent.glob(".ui-*"))


@pytest.mark.unit
def test_package_web_ui_creates_public_staging_with_normal_permissions(tmp_path, monkeypatch):
    _write_build(tmp_path)
    mkdir = Path.mkdir
    staging_modes = []

    def record_mkdir(path, mode=0o777, parents=False, exist_ok=False):
        if path.name.startswith(".ui-build-"):
            staging_modes.append(mode)
        return mkdir(path, mode=mode, parents=parents, exist_ok=exist_ok)

    monkeypatch.setattr(Path, "mkdir", record_mkdir)
    package_web_ui(tmp_path)
    assert staging_modes == [0o777]
    assert (tmp_path / "apps/server/static/ui/.vite/manifest.json").is_file()


@pytest.mark.unit
def test_package_web_ui_retains_backups_if_rollback_is_locked(tmp_path, monkeypatch):
    _write_build(tmp_path)
    package_web_ui(tmp_path)
    templates = tmp_path / "apps/server/templates"
    (templates / "vite_assets.html").write_text("old main", encoding="utf-8")
    replace = Path.replace

    def fail_replace(source, destination):
        if ".ui-build-" in str(source) and source.name == "admin_assets.html":
            raise PermissionError("template and its backup are locked")
        return replace(source, destination)

    monkeypatch.setattr(Path, "replace", fail_replace)
    with pytest.raises(RuntimeError, match="recovery files retained"):
        package_web_ui(tmp_path)

    static_parent = tmp_path / "apps/server/static"
    retained = list(static_parent.glob(".ui-build-*/previous-templates/vite_assets.html"))
    assert len(retained) == 1
    assert retained[0].read_text(encoding="utf-8") == "old main"
    assert len(list(static_parent.glob(".ui-previous-*/index.html"))) == 1
