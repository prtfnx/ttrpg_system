# GUI Panels module

from .tools_panel import ToolsPanel
from .chat_panel import ChatPanel
from .entities_panel import EntitiesPanel
from .table_panel import TablePanel
from .debug_panel import DebugPanel
from .compendium_panel import CompendiumPanel
from .network_panel import NetworkPanel
from .layer_panel import LayerPanel
from .storage_panel import StoragePanel
from .character_sheet_panel import CharacterSheetPanel
from .journal_panel import JournalPanel


__all__ = [
    'ToolsPanel',
    'ChatPanel', 
    'EntitiesPanel',
    'TablePanel',
    'DebugPanel',
    'CompendiumPanel',
    'NetworkPanel',
    'LayerPanel',
    'StoragePanel',
    'CharacterSheetPanel',
    'JournalPanel'
]
