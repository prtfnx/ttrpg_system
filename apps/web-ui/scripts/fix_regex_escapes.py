import re
from pathlib import Path

_SRC = Path(__file__).resolve().parent.parent / 'src'

def fix(path):
    content = open(path, encoding='utf-8').read()
    # In TS source: /error[\"']: [\"']([^\"']+)[\"']/i
    # The \" inside [] is useless in regex - remove the backslash
    # Bytes: \x5c\x22 -> \x22 (remove backslash before quote in character class)
    fixed = re.sub(r'/error\[\\\"\'\\]:', r"/error[\"']:", content)
    if fixed != content:
        content = fixed
        print(f"Pass 1 fixed")
    # Try a different approach - find and replace the entire regex lines
    lines = content.splitlines(keepends=True)
    changed = False
    for i, line in enumerate(lines):
        if 'errorMatch' in line and 'errorText.match' in line:
            # Check if it has useless escapes: \" inside character class
            # The pattern  [\\"']  should become  ["']
            new_line = line.replace('\\"', '"')
            # But only inside character classes - be careful not to break string delimiters
            # Since this is a regex literal /.../ the " doesn't need escaping
            if new_line != line:
                lines[i] = new_line
                changed = True
                print(f"Fixed line {i+1}: {repr(line.strip())} -> {repr(new_line.strip())}")
    if changed:
        open(path, 'w', encoding='utf-8').write(''.join(lines))
    else:
        print(f"No changes made to {path}")

fix(str(_SRC / 'features/auth/services/auth.service.ts'))

# Also fix RealTimeCombatSystem.test.tsx line 50: \/ is useless escape
test_path = str(_SRC / 'features/combat/__tests__/RealTimeCombatSystem.test.tsx')
content = open(test_path, encoding='utf-8').read()
lines = content.splitlines(keepends=True)
for i, line in enumerate(lines):
    if 'replace' in line and r'\/' in line and 'name.source' in line:
        print(f"Test line {i+1}: {repr(line.strip())}")
        # /[\/\\^$.*+?()[\]{}|]/ -> /[/\\^$.*+?()[\]{}|]/  (\/ is useless in regex)
        new_line = line.replace(r'[\/\\^$', r'[/\\^$')
        if new_line != line:
            lines[i] = new_line
            print(f"Fixed: {repr(new_line.strip())}")
            open(test_path, 'w', encoding='utf-8').write(''.join(lines))
