"""
Batch fix no-unused-vars violations by prefixing with _ or removing assignments.
Uses targeted line-specific replacements.
"""
import re

BASE = r'C:\Users\fenix\Documents\code\ttrpg_system\apps\web-ui\src'

def read(path):
    with open(path, encoding='utf-8') as f:
        return f.readlines()

def write(path, lines):
    with open(path, 'w', encoding='utf-8') as f:
        f.writelines(lines)

def prefix_destructured(path, lineno, old_name, new_name=None):
    """Rename a destructured param or declared var on a specific line."""
    if new_name is None:
        new_name = f'_{old_name}'
    lines = read(path)
    line = lines[lineno - 1]
    # Only replace whole-word occurrences
    new_line = re.sub(r'\b' + re.escape(old_name) + r'\b', new_name, line)
    if new_line != line:
        lines[lineno - 1] = new_line
        write(path, lines)
        print(f'Fixed {path.split("src/")[-1]} L{lineno}: {old_name} -> {new_name}')
    else:
        print(f'MISS {path.split("src/")[-1]} L{lineno}: {old_name}')

def remove_import_or_unused(path, lineno, name):
    """Remove an unused import or standalone type declaration."""
    lines = read(path)
    line = lines[lineno - 1]
    if name in line:
        # If the line is just the declaration, comment it out or remove
        stripped = line.strip()
        if stripped.startswith('interface ') or stripped.startswith('type '):
            # Keep but suppress with eslint-disable on prior line
            lines.insert(lineno - 1, f'// eslint-disable-next-line @typescript-eslint/no-unused-vars\n')
            write(path, lines)
            print(f'Suppressed {path.split("src/")[-1]} L{lineno}: {name}')
        else:
            print(f'SKIP (complex) {path.split("src/")[-1]} L{lineno}: {name}')
    else:
        print(f'MISS {path.split("src/")[-1]} L{lineno}: {name}')

# ── LayerPanel.tsx: `style` destructured prop unused ──
p = fr'{BASE}\features\canvas\components\LayerPanel.tsx'
prefix_destructured(p, 60, 'style')

# ── LightingSystem.test.tsx: vi.fn mock params (lines 4-13) ──
p = fr'{BASE}\features\canvas\systems\LightingSystem\__tests__\LightingSystem.test.tsx'
lines = read(p)
changes = {
    4: [('id: string', '_id: string'), ('x: number', '_x: number'), ('y: number', '_y: number')],
    5: [('id: string', '_id: string')],
    6: [('id: string', '_id: string'), ('r: number', '_r: number'), ('g: number', '_g: number'), ('b: number', '_b: number'), ('a?: number', '_a?: number')],
    7: [('id: string', '_id: string'), ('intensity: number', '_intensity: number')],
    8: [('id: string', '_id: string'), ('radius: number', '_radius: number')],
    9: [('id: string', '_id: string'), ('enabled: boolean', '_enabled: boolean')],
    10: [('intensity: number', '_intensity: number')],
    13: [('id: string', '_id: string')],
}
for lineno, replacements in changes.items():
    line = lines[lineno - 1]
    for old, new in replacements:
        line = line.replace(old, new)
    if line != lines[lineno - 1]:
        lines[lineno - 1] = line
        print(f'Fixed LightingSystem.test.tsx L{lineno}')
write(p, lines)

# user assigned but unused in test files → _user
for (filepath, lineno) in [
    (fr'{BASE}\features\canvas\systems\LightingSystem\__tests__\LightingSystem.test.tsx', 203),
    (fr'{BASE}\features\canvas\systems\LightingSystem\__tests__\LightingSystem.test.tsx', 436),
    (fr'{BASE}\features\assets\__tests__\AssetManagementPerformance.test.tsx', 126),
    (fr'{BASE}\features\assets\__tests__\AssetManagementPerformance.test.tsx', 442),
]:
    lines = read(filepath)
    line = lines[lineno - 1]
    new_line = re.sub(r'\bconst user\b', 'const _user', line)
    if new_line != line:
        lines[lineno - 1] = new_line
        write(filepath, lines)
        print(f'Fixed user -> _user at L{lineno}')
    else:
        print(f'MISS user at {filepath.split("src/")[-1]} L{lineno}: {repr(line[:60])}')

# mockUserInfo assigned but unused
for (filepath, lineno) in [
    (fr'{BASE}\features\assets\__tests__\AssetManagementPerformance.test.tsx', 13),
    (fr'{BASE}\features\integration\__tests__\SystemsIntegration.test.tsx', 185),
]:
    lines = read(filepath)
    line = lines[lineno - 1]
    new_line = re.sub(r'\bconst mockUserInfo\b', 'const _mockUserInfo', line)
    if new_line != line:
        lines[lineno - 1] = new_line
        write(filepath, lines)
        print(f'Fixed mockUserInfo -> _mockUserInfo at {filepath.split("src/")[-1]} L{lineno}')
    else:
        print(f'MISS: {repr(line[:80])}')

# preloadedAssets
p = fr'{BASE}\features\assets\__tests__\AssetManagementPerformance.test.tsx'
lines = read(p)
line = lines[640 - 1]
new_line = re.sub(r'\bconst preloadedAssets\b', 'const _preloadedAssets', line)
if new_line != line:
    lines[640 - 1] = new_line
    write(p, lines)
    print('Fixed preloadedAssets')
else:
    print(f'MISS preloadedAssets: {repr(line[:80])}')

# initialIcon
p = fr'{BASE}\features\canvas\components\__tests__\LayerPanel.test.tsx'
lines = read(p)
line = lines[214 - 1]
new_line = re.sub(r'\bconst initialIcon\b', 'const _initialIcon', line)
if new_line != line:
    lines[214 - 1] = new_line
    write(p, lines)
    print('Fixed initialIcon')

# consoleSpy
p = fr'{BASE}\features\canvas\hooks\__tests__\useLayerManager.test.ts'
lines = read(p)
line = lines[103 - 1]
new_line = re.sub(r'\bconst consoleSpy\b', 'const _consoleSpy', line)
if new_line != line:
    lines[103 - 1] = new_line
    write(p, lines)
    print('Fixed consoleSpy')

# setValueSpy
p = fr'{BASE}\features\character\components\CharacterWizard\__tests__\TemplateSelectionStep.test.tsx'
lines = read(p)
line = lines[435 - 1]
new_line = re.sub(r'\bconst setValueSpy\b', 'const _setValueSpy', line)
if new_line != line:
    lines[435 - 1] = new_line
    write(p, lines)
    print('Fixed setValueSpy')

# RightPanel.test.tsx: name destructured param L287
p = fr'{BASE}\features\layout\components\RightPanel\__tests__\RightPanel.test.tsx'
lines = read(p)
line = lines[287 - 1]
# { name, pattern } -> { name: _name, pattern }  - but actually we want to just alias it
# Simpler: { name: _name, pattern }
new_line = line.replace('{ name, pattern }', '{ name: _name, pattern }')
if new_line != line:
    lines[287 - 1] = new_line
    write(p, lines)
    print('Fixed RightPanel name param')
else:
    print(f'MISS name: {repr(line[:80])}')

# chatTab L334
lines = read(p)
line = lines[334 - 1]
new_line = re.sub(r'\bconst chatTab\b', 'const _chatTab', line)
if new_line != line:
    lines[334 - 1] = new_line
    write(p, lines)
    print('Fixed chatTab')
else:
    print(f'MISS chatTab: {repr(line[:80])}')

# roleSelect InvitationManager.test.tsx L469
p = fr'{BASE}\features\session\components\Invitations\__tests__\InvitationManager.test.tsx'
lines = read(p)
line = lines[469 - 1]
new_line = re.sub(r'\bconst roleSelect\b', 'const _roleSelect', line)
if new_line != line:
    lines[469 - 1] = new_line
    write(p, lines)
    print('Fixed roleSelect')

# SessionManagementPanel.test.tsx L47 onRoleChange, onRemove; L257 rerender
p = fr'{BASE}\features\session\components\__tests__\SessionManagementPanel.test.tsx'
lines = read(p)
line47 = lines[47 - 1]
new47 = line47.replace('onRoleChange,', '_onRoleChange,').replace('onRemove,', '_onRemove,')
if new47 != line47:
    lines[47 - 1] = new47
    print('Fixed onRoleChange, onRemove')
line257 = lines[257 - 1]
new257 = re.sub(r'\bconst \{ rerender \}', 'const { rerender: _rerender }', line257)
if new257 != line257:
    lines[257 - 1] = new257
    print('Fixed rerender L257')
write(p, lines)

# characterProtocol.test.ts: getCharacterForSprite declared but unused
p = fr'{BASE}\shared\protocol\__tests__\characterProtocol.test.ts'
lines = read(p)
for lineno in [3, 38]:
    line = lines[lineno - 1]
    new_line = line.replace('getCharacterForSprite', '_getCharacterForSprite')
    if new_line != line:
        lines[lineno - 1] = new_line
        print(f'Fixed getCharacterForSprite L{lineno}')
    else:
        print(f'MISS getCharacterForSprite L{lineno}: {repr(line[:80])}')
write(p, lines)

# ProtocolService.test.ts: MockWebClientProtocol interface unused L19
p = fr'{BASE}\shared\services\__tests__\ProtocolService.test.ts'
lines = read(p)
# Add eslint-disable before line 19
line = lines[19 - 1]
if 'interface MockWebClientProtocol' in line:
    lines.insert(18, '// eslint-disable-next-line @typescript-eslint/no-unused-vars\n')
    write(p, lines)
    print('Fixed MockWebClientProtocol (disabled)')
else:
    print(f'MISS MockWebClientProtocol L19: {repr(line[:80])}')

# WebSocketService.test.ts: data L34 (function param), connectionAttempt L187
p = fr'{BASE}\shared\services\__tests__\WebSocketService.test.ts'
lines = read(p)
line34 = lines[34 - 1]
new34 = re.sub(r'\bdata: string\b', '_data: string', line34)
if new34 != line34:
    lines[34 - 1] = new34
    print('Fixed data param L34')
line187 = lines[187 - 1]
new187 = re.sub(r'\blet connectionAttempt\b', 'let _connectionAttempt', line187)
if new187 != line187:
    lines[187 - 1] = new187
    print('Fixed connectionAttempt L187')
write(p, lines)

# UIComponentTests.test.tsx: validationMessages L145
p = fr'{BASE}\test\__tests__\UIComponentTests.test.tsx'
lines = read(p)
line145 = lines[145 - 1]
new145 = re.sub(r'\bconst validationMessages\b', 'const _validationMessages', line145)
if new145 != line145:
    lines[145 - 1] = new145
    print('Fixed validationMessages L145')
# Check line 168
line168 = lines[168 - 1]
print(f'L168: {repr(line168[:80])}')
write(p, lines)

print('\nDone.')
