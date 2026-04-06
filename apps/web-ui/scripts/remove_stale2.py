"""Remove stale eslint-disable-next-line exhaustive-deps comments by line number."""
import os

# From ESLint JSON output above - these are the STALE comment lines to remove
stale = {
    r'C:\Users\fenix\Documents\code\ttrpg_system\apps\web-ui\src\features\assets\components\BackgroundManagementPanel.tsx': [75],
    r'C:\Users\fenix\Documents\code\ttrpg_system\apps\web-ui\src\features\assets\hooks\useAssetManager.ts': [383],
    r'C:\Users\fenix\Documents\code\ttrpg_system\apps\web-ui\src\features\canvas\components\LayerPanel.tsx': [125],
    r'C:\Users\fenix\Documents\code\ttrpg_system\apps\web-ui\src\features\canvas\components\ToolsPanel.tsx': [167],
    r'C:\Users\fenix\Documents\code\ttrpg_system\apps\web-ui\src\features\character\components\CharacterWizard\BackgroundStep.tsx': [28],
    r'C:\Users\fenix\Documents\code\ttrpg_system\apps\web-ui\src\features\character\components\CharacterWizard\EnhancedCharacterWizard.tsx': [323],
    r'C:\Users\fenix\Documents\code\ttrpg_system\apps\web-ui\src\features\character\components\CharacterWizard\EquipmentSelectionStep.tsx': [150],
    r'C:\Users\fenix\Documents\code\ttrpg_system\apps\web-ui\src\features\character\components\CharacterWizard\SpellSelectionStep.tsx': [67],
    r'C:\Users\fenix\Documents\code\ttrpg_system\apps\web-ui\src\features\compendium\components\MonsterCreationPanel.tsx': [92, 101, 103, 120, 122],
    r'C:\Users\fenix\Documents\code\ttrpg_system\apps\web-ui\src\features\compendium\hooks\useCompendium.ts': [358],
    r'C:\Users\fenix\Documents\code\ttrpg_system\apps\web-ui\src\features\table\hooks\useTableSync.ts': [266, 293, 295],
    r'C:\Users\fenix\Documents\code\ttrpg_system\apps\web-ui\src\shared\components\DragDropImageHandler.tsx': [372],
    r'C:\Users\fenix\Documents\code\ttrpg_system\apps\web-ui\src\shared\hooks\useWebSocket.ts': [53, 254, 256, 312, 314],
}

for filepath, line_nums in stale.items():
    with open(filepath, encoding='utf-8') as f:
        lines = f.readlines()
    removed = 0
    for lineno in sorted(line_nums, reverse=True):
        idx = lineno - 1
        if idx < len(lines) and 'eslint-disable-next-line react-hooks/exhaustive-deps' in lines[idx]:
            lines.pop(idx)
            removed += 1
        else:
            actual = lines[idx].strip()[:60] if idx < len(lines) else 'OUT OF BOUNDS'
            print(f'MISS {os.path.basename(filepath)} L{lineno}: {actual!r}')
    if removed:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.writelines(lines)
        print(f'Removed {removed} stale from {os.path.basename(filepath)}')

print('Done')
