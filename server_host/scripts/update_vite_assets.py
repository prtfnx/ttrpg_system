"""
Script to extract <script> and <link> tags from Vite's index.html and update vite_assets.html for Jinja2 injection.
Run this after every Vite build.
"""
import re
from pathlib import Path

VITE_INDEX = Path("server_host/static/ui/index.html")
VITE_ASSETS = Path("server_host/templates/vite_assets.html")

# Regex to match <script ...> and <link ...> tags
TAG_RE = re.compile(r"<(script|link)[^>]+>", re.IGNORECASE)

if not VITE_INDEX.exists():
    raise FileNotFoundError(f"Vite index.html not found: {VITE_INDEX.resolve()}")

with VITE_INDEX.open("r", encoding="utf-8") as f:
    html = f.read()

# Extract all <script> and <link> tags in <head>
head = html.split("<head>", 1)[-1].split("</head>", 1)[0]
tags = TAG_RE.findall(head)

# Actually extract the full tags
full_tags = TAG_RE.findall(head)
all_tags = TAG_RE.finditer(head)

asset_lines = []
for m in all_tags:
    tag = m.group(0)
    tag = tag.replace('/main-', '/static/ui/main-').replace('/assets/', '/static/ui/assets/')
    if tag.startswith('<script'):
        # Ensure script tag is closed properly
        if not tag.endswith('>'):
            tag += '>'
        if not tag.endswith('</script>'):
            tag = tag.rstrip('>') + '></script>'
    elif tag.startswith('<link'):
        # Ensure link tag is self-closed, only one '>' at end
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
