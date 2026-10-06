"""Test-only entry point serving the current Vite build, without replacing local assets."""

import json
from pathlib import Path

from fastapi.staticfiles import StaticFiles
from jinja2 import ChoiceLoader, DictLoader
from main import app
from routers.game import templates
from scripts.update_vite_assets import _entry_tags
from starlette.routing import Mount

DIST = Path(__file__).resolve().parents[2] / "web-ui" / "dist"
manifest = json.loads((DIST / ".vite" / "manifest.json").read_text(encoding="utf-8"))
loaders = [DictLoader({"vite_assets.html": "\n".join(_entry_tags(manifest, "index.html"))})]
if templates.env.loader is not None:
    templates.env.loader = ChoiceLoader([*loaders, templates.env.loader])
else:
    templates.env.loader = ChoiceLoader(loaders)
app.router.routes.insert(0, Mount("/static/ui", app=StaticFiles(directory=DIST)))
