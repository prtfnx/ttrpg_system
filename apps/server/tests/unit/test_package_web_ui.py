"""Tests for cross-platform Render browser-asset packaging."""

from __future__ import annotations

import json

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
