"""Remove stale eslint-disable-next-line exhaustive-deps comments."""
import subprocess, json, os, sys
from pathlib import Path

WEB_UI = Path(__file__).resolve().parent.parent

result = subprocess.run(
    ['npx', 'eslint', 'src', '--format=json'],
    capture_output=True, text=True,
    cwd=str(WEB_UI)
)
data = json.loads(result.stdout)

stale_by_file = {}
for f in data:
    for m in f['messages']:
        if m['ruleId'] is None and 'exhaustive-deps' in m['message']:
            stale_by_file.setdefault(f['filePath'], []).append(m['line'])

for filepath, lines_to_remove in stale_by_file.items():
    with open(filepath, encoding='utf-8') as f:
        lines = f.readlines()
    removed = 0
    for lineno in sorted(lines_to_remove, reverse=True):
        idx = lineno - 1
        if idx < len(lines) and 'eslint-disable-next-line react-hooks/exhaustive-deps' in lines[idx]:
            lines.pop(idx)
            removed += 1
        else:
            actual = lines[idx][:60] if idx < len(lines) else 'OUT OF BOUNDS'
            print(f'MISS {os.path.basename(filepath)} L{lineno}: {actual!r}')
    if removed:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.writelines(lines)
        print(f'Removed {removed} stale comments from {os.path.basename(filepath)}')

print('Done')
