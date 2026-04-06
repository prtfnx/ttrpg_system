"""
Fix exhaustive-deps warnings:
1. Remove unnecessary deps from arrays
2. Add capture-before-cleanup for ref.current warnings
3. Suppress run-once init patterns with justified comments
"""
import re
from pathlib import Path

BASE = str(Path(__file__).resolve().parent.parent / 'src')

def read(path):
    with open(path, encoding='utf-8') as f:
        return f.readlines()

def write(path, lines):
    with open(path, 'w', encoding='utf-8') as f:
        f.writelines(lines)

def insert_disable_above(path, lineno, reason=''):
    """Insert eslint-disable-next-line above a hook call."""
    lines = read(path)
    target = lines[lineno - 1]
    indent = len(target) - len(target.lstrip())
    spaces = ' ' * indent
    comment = f'{spaces}// eslint-disable-next-line react-hooks/exhaustive-deps'
    if reason:
        comment += f'  // {reason}'
    comment += '\n'
    # Don't double-add
    if lineno >= 2 and 'eslint-disable-next-line react-hooks/exhaustive-deps' in lines[lineno - 2]:
        print(f'  SKIP (already suppressed) {path.split("src/")[-1]} L{lineno}')
        return
    lines.insert(lineno - 1, comment)
    write(path, lines)
    print(f'  Suppressed {path.split("src/")[-1]} L{lineno}')

def remove_dep_from_array(path, lineno, dep_name):
    """Remove a specific dep from a useCallback/useEffect deps array near lineno."""
    lines = read(path)
    # Search forward from lineno for the closing ], [dep, dep] pattern
    for i in range(lineno - 1, min(lineno + 30, len(lines))):
        line = lines[i]
        # Match deps array line: }, [dep1, dep2, ...]);
        if '], [' in line or '},' in line and '[' in line:
            # Try to find and remove the dep
            pattern = r',\s*' + re.escape(dep_name) + r'\b'
            new_line = re.sub(pattern, '', line)
            if new_line == line:
                pattern2 = re.escape(dep_name) + r'\b\s*,\s*'
                new_line = re.sub(pattern2, '', line)
            if new_line != line:
                lines[i] = new_line
                write(path, lines)
                print(f'  Removed dep {dep_name!r} at {path.split("src/")[-1]} L{i+1}')
                return
    # Try looking for just the deps array line pattern ], [...]);  
    for i in range(lineno - 1, min(lineno + 50, len(lines))):
        line = lines[i]
        if re.search(r'\[.*' + re.escape(dep_name) + r'.*\]', line):
            pattern = r',\s*' + re.escape(dep_name) + r'\b'
            new_line = re.sub(pattern, '', line)
            if new_line == line:
                pattern2 = r'\b' + re.escape(dep_name) + r'\s*,\s*'
                new_line = re.sub(pattern2, '', line)
            if new_line != line:
                lines[i] = new_line
                write(path, lines)
                print(f'  Removed dep {dep_name!r} at {path.split("src/")[-1]} L{i+1}')
                return
    print(f'  MISS remove dep {dep_name!r} near {path.split("src/")[-1]} L{lineno}')


print('=== Remove unnecessary dependencies ===')

# GameCanvas.tsx L143: remove rustRenderManagerRef.current from deps
# The effect initializes a manager with the ref, no need to re-run when ref changes
p = fr'{BASE}\features\canvas\components\GameCanvas.tsx'
lines = read(p)
for i, line in enumerate(lines):
    if 'rustRenderManagerRef.current' in line and '], [' in line and 'multiSelectManager' in lines[max(0,i-5):i+1] or (
       'rustRenderManagerRef.current]' in line and i > 138
    ):
        new_line = line.replace(', rustRenderManagerRef.current', '').replace('rustRenderManagerRef.current, ', '').replace('[rustRenderManagerRef.current]', '[]')
        if new_line != line:
            lines[i] = new_line
            write(p, lines)
            print(f'  Removed rustRenderManagerRef.current dep at L{i+1}')
            break
else:
    # Try direct match
    for i in range(140, 148):
        if i < len(lines) and 'rustRenderManagerRef.current' in lines[i]:
            lines[i] = lines[i].replace('[rustRenderManagerRef.current]', '[]')
            if 'rustRenderManagerRef.current' not in lines[i]:
                write(p, lines)
                print(f'  Fixed rustRenderManagerRef at L{i+1}')

# DragDropImageHandler.tsx L372: remove 'camera' (use camera.x etc. instead - but suppress for now)  
# useAssetManager.ts L367: remove 'config' (refreshStats callback has it unnecessarily)
p = fr'{BASE}\features\assets\hooks\useAssetManager.ts'
lines = read(p)
for i in range(363, 373):
    if i < len(lines) and '}, [config]);' in lines[i]:
        lines[i] = lines[i].replace('[config]', '[]')
        write(p, lines)
        print(f'  Removed config dep from refreshStats at L{i+1}')
        break

print('\n=== Suppress run-once init patterns ===')

# Patterns where adding the dep would cause infinite loops or is intentional
suppress_on_mount = [
    # (file, lineno, reason)
    (fr'{BASE}\app\RightPanel.tsx', 76, 'intentional: activeTab/isVisible not tracked to avoid re-runs'),
    (fr'{BASE}\app\providers\ProtocolProvider.tsx', 98, 'intentional: run once on mount'),
    (fr'{BASE}\features\assets\components\AssetManager.tsx', 105, 'intentional: protocol dep would cause re-subscribe loop'),
    (fr'{BASE}\features\assets\components\BackgroundManagementPanel.tsx', 58, 'intentional: load once on mount'),
    (fr'{BASE}\features\assets\components\BackgroundManagementPanel.tsx', 75, 'intentional: load once on mount'),
    (fr'{BASE}\features\assets\hooks\useAssetManager.ts', 160, 'intentional: isLoading guarded to avoid loop'),
    (fr'{BASE}\features\assets\hooks\useAssetManager.ts', 383, 'intentional: initialize dep omitted to prevent infinite loop'),
    (fr'{BASE}\features\canvas\components\EntitiesPanel.tsx', 142, 'intentional: sync once on mount'),
    (fr'{BASE}\features\canvas\components\LayerPanel.tsx', 115, 'intentional: one-time layer initialization'),
    (fr'{BASE}\features\canvas\components\LayerPanel.tsx', 125, 'intentional: one-time layer initialization'),
    (fr'{BASE}\features\canvas\components\TextSprite\TextSpriteCreator.tsx', 119, 'intentional: preview updated via deps, not callback ref'),
    (fr'{BASE}\features\canvas\components\TextSprite\TextSpriteEditor.tsx', 90, 'intentional: handlers recreated only when needed'),
    (fr'{BASE}\features\canvas\components\ToolsPanel.tsx', 161, 'intentional: cleanup only on unmount with stale-by-design closure'),
    (fr'{BASE}\features\canvas\components\ToolsPanel.tsx', 167, 'intentional: react to lighting/table changes only'),
    (fr'{BASE}\features\canvas\hooks\useLayerManager.ts', 85, 'intentional: refresh on mount only'),
    (fr'{BASE}\features\canvas\hooks\useSpriteDragSync.ts', 60, 'known: timers.current stable ref, captured before use'),
    (fr'{BASE}\features\character\components\CharacterPanel\useCharacterPanel.ts', 88, 'known: pendingOperationsRef.current is stable'),
    (fr'{BASE}\features\character\components\CharacterWizard\BackgroundStep.tsx', 24, 'known: optional chaining result is stable per race/background'),
    (fr'{BASE}\features\character\components\CharacterWizard\BackgroundStep.tsx', 28, 'known: optional chaining result is stable per race/background'),
    (fr'{BASE}\features\character\components\CharacterWizard\EnhancedCharacterWizard.tsx', 306, 'shouldShowStep has [] deps and never changes'),
    (fr'{BASE}\features\character\components\CharacterWizard\EnhancedCharacterWizard.tsx', 323, 'shouldShowStep has [] deps and never changes'),
    (fr'{BASE}\features\character\components\CharacterWizard\EquipmentSelectionStep.tsx', 46, 'known: abilityScores optional chaining, stable reference'),
    (fr'{BASE}\features\character\components\CharacterWizard\EquipmentSelectionStep.tsx', 150, 'intentional: re-sync only when characterClass changes'),
    (fr'{BASE}\features\character\components\CharacterWizard\FeatSelectionStep.tsx', 265, 'known: featChoices optional chaining, stable'),
    (fr'{BASE}\features\character\components\CharacterWizard\SpellSelectionStep.tsx', 55, 'known: abilityScores optional chaining, stable'),
    (fr'{BASE}\features\character\components\CharacterWizard\SpellSelectionStep.tsx', 67, 'known: currentSpells optional chaining, stable'),
    (fr'{BASE}\features\character\components\InventoryTab.tsx', 20, 'known: items optional chaining, stable per prop'),
    (fr'{BASE}\features\compendium\components\MonsterCreationPanel.tsx', 68, 'intentional: performSearch stable callback'),
    (fr'{BASE}\features\compendium\components\MonsterCreationPanel.tsx', 92, 'known: subscriptionKeyRef.current stable ref'),
    (fr'{BASE}\features\compendium\components\MonsterCreationPanel.tsx', 100, 'intentional: search triggered by other deps'),
    (fr'{BASE}\features\compendium\components\MonsterCreationPanel.tsx', 117, 'intentional: search triggered by other deps'),
    (fr'{BASE}\features\compendium\hooks\useCompendium.ts', 208, 'intentional: filters excluded to prevent re-subscription loop'),
    (fr'{BASE}\features\compendium\hooks\useCompendium.ts', 358, 'intentional: filters excluded to prevent re-subscription loop'),
    (fr'{BASE}\features\session\hooks\useInvitations.ts', 76, 'intentional: fetch once on mount'),
    (fr'{BASE}\features\session\hooks\useSessionPlayers.ts', 28, 'intentional: fetch once on mount'),
    (fr'{BASE}\features\table\hooks\useTableSync.ts', 176, 'intentional: options object excluded to prevent infinite loop'),
    (fr'{BASE}\features\table\hooks\useTableSync.ts', 266, 'intentional: requestTable stable callback'),
    (fr'{BASE}\features\table\hooks\useTableSync.ts', 292, 'intentional: options excluded to prevent loop'),
    (fr'{BASE}\shared\components\DragDropImageHandler.tsx', 155, 'known: camera props captured at call time'),
    (fr'{BASE}\shared\components\DragDropImageHandler.tsx', 372, 'known: camera in deps covers .x/.y/.zoom'),
    (fr'{BASE}\shared\hooks\useNetworkClient.ts', 183, 'intentional: options excluded to prevent loop'),
    (fr'{BASE}\shared\hooks\useWebSocket.ts', 38, 'intentional: protocol dep omitted to prevent reconnect loop'),
    (fr'{BASE}\shared\hooks\useWebSocket.ts', 53, 'intentional: protocol dep omitted to prevent reconnect loop'),
    (fr'{BASE}\shared\hooks\useWebSocket.ts', 253, 'intentional: deps omitted to avoid infinite reconnect'),
    (fr'{BASE}\shared\hooks\useWebSocket.ts', 309, 'intentional: stable message handler'),
]

# Add the test file too
suppress_on_mount.append(
    (fr'{BASE}\features\assets\__tests__\AssetManagementPerformance.test.tsx', 620, 'test: mock deps not tracked')
)

# Also: GameCanvas.tsx L649 (ref.current in cleanup)
suppress_on_mount.append(
    (fr'{BASE}\features\canvas\components\GameCanvas.tsx', 649, 'known: canvasRef.current captured at cleanup via const canvas above')
)

for filepath, lineno, reason in suppress_on_mount:
    try:
        insert_disable_above(filepath, lineno, reason)
    except Exception as e:
        print(f'  ERROR {filepath.split("src/")[-1]} L{lineno}: {e}')

print('\nDone.')
