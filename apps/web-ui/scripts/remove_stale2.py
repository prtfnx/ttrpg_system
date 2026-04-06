"""Remove stale eslint-disable-next-line exhaustive-deps comments by line number."""
import os
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / 'src'

# From ESLint JSON output above - these are the STALE comment lines to remove
stale = {
    str(SRC / 'features/assets/components/BackgroundManagementPanel.tsx'): [75],
    str(SRC / 'features/assets/hooks/useAssetManager.ts'): [383],
    str(SRC / 'features/canvas/components/LayerPanel.tsx'): [125],
    str(SRC / 'features/canvas/components/ToolsPanel.tsx'): [167],
    str(SRC / 'features/character/components/CharacterWizard/BackgroundStep.tsx'): [28],
    str(SRC / 'features/character/components/CharacterWizard/EnhancedCharacterWizard.tsx'): [323],
    str(SRC / 'features/character/components/CharacterWizard/EquipmentSelectionStep.tsx'): [150],
    str(SRC / 'features/character/components/CharacterWizard/SpellSelectionStep.tsx'): [67],
    str(SRC / 'features/compendium/components/MonsterCreationPanel.tsx'): [92, 101, 103, 120, 122],
    str(SRC / 'features/compendium/hooks/useCompendium.ts'): [358],
    str(SRC / 'features/table/hooks/useTableSync.ts'): [266, 293, 295],
    str(SRC / 'shared/components/DragDropImageHandler.tsx'): [372],
    str(SRC / 'shared/hooks/useWebSocket.ts'): [53, 254, 256, 312, 314],
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
