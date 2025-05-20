class DnDItem:
    def __init__(self, name: str, description: str = "", weight: float = 0.0, value: int = 0, rarity: str = "Common"):
        self.name = name
        self.description = description
        self.weight = weight
        self.value = value
        self.rarity = rarity

    def __str__(self):
        return f"{self.name} ({self.rarity}): {self.description} [Weight: {self.weight} lbs, Value: {self.value} gp]"