"""Character acceptance helpers shared by borrowed and receipt-owned callers."""
from typing import Any


class StagedCharacterUpdateRejected(ValueError):
    def __init__(self, result: dict[str, Any]):
        self.result = result
        super().__init__(str(result.get('error', 'Character update rejected')))
