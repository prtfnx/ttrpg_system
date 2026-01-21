"""
Script to extract <script> and <link> tags from Vite's index.html and update vite_assets.html for Jinja2 injection.
Also finds admin-*.js and admin-*.css files for admin panel.
Run this after every Vite build.
"""
import re
from pathlib import Path

VITE_INDEX = Path("server_host/static/ui/index.html")
VITE_ASSETS = Path("server_host/templates/vite_assets.html")
ADMIN_ASSETS = Path("server_host/templates/admin_assets.html")
STATIC_UI = Path("server_host/static/ui")

# Regex to match <script ...> and <link ...> tags
TAG_RE = re.compile(r"<(script|link)[^>]+>", re.IGNORECASE)

if not VITE_INDEX.exists():
    raise FileNotFoundError(f"Vite index.html not found: {VITE_INDEX.resolve()}")

with VITE_INDEX.open("r", encoding="utf-8") as f:
    html = f.read()


# Extract all <script> and <link> tags from the entire HTML (not just <head>)
all_tags = TAG_RE.finditer(html)

# Improved asset path rewriting for all Vite assets
asset_lines = []
for m in all_tags:
    tag = m.group(0)
    # Rewrite main-*.js, admin-*.js, main-*.css, integration-*.js, and all /assets/ paths
    tag = re.sub(r'"/main-', '"/static/ui/main-', tag)
    tag = re.sub(r'"/admin-', '"/static/ui/admin-', tag)
    tag = re.sub(r'"/integration-', '"/static/ui/integration-', tag)
    tag = re.sub(r'"/assets/', '"/static/ui/assets/', tag)
    tag = re.sub(r'href="/main-', 'href="/static/ui/main-', tag)
    tag = re.sub(r'href="/admin-', 'href="/static/ui/admin-', tag)
    tag = re.sub(r'href="/integration-', 'href="/static/ui/integration-', tag)
    tag = re.sub(r'href="/assets/', 'href="/static/ui/assets/', tag)
    # Ensure script tag is closed properly
    if tag.startswith('<script'):
        if not tag.endswith('>'):
            tag += '>'
        if not tag.endswith('</script>'):
            tag = tag.rstrip('>') + '></script>'
    elif tag.startswith('<link'):
        tag = tag.rstrip('>')
        if not tag.endswith('/'):
            tag += ' /'
        tag = tag.rstrip(' /') + ' />'
    asset_lines.append(tag)

# Write to vite_assets.html as a flat list of tags, one per line, no fragment
with VITE_ASSETS.open("w", encoding="utf-8") as f:
    f.write("{# Auto-generated from Vite index.html #}\n")
    for line in asset_lines:
        f.write(f"{line.strip()}\n")

print(f"Updated {VITE_ASSETS} with {len(asset_lines)} asset tags from {VITE_INDEX}")

# Find and generate admin assets
admin_js = list(STATIC_UI.glob("admin-*.js"))
admin_css = list(STATIC_UI.glob("assets/admin-*.css"))

admin_tags = []
if admin_css:
    for css_file in admin_css:
        rel_path = css_file.relative_to(STATIC_UI).as_posix()  # Use forward slashes
        admin_tags.append(f'<link rel="stylesheet" crossorigin href="/static/ui/{rel_path}" />')

if admin_js:
    for js_file in admin_js:
        rel_path = js_file.relative_to(STATIC_UI).as_posix()  # Use forward slashes
        admin_tags.append(f'<script type="module" crossorigin src="/static/ui/{rel_path}"></script>')

with ADMIN_ASSETS.open("w", encoding="utf-8") as f:
    f.write("{# Auto-generated admin assets #}\n")
    for line in admin_tags:
        f.write(f"{line}\n")

print(f"Updated {ADMIN_ASSETS} with {len(admin_tags)} admin asset tags")
