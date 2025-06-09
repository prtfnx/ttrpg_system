def validate_action(action: dict) -> bool:

    return "move" in action or "roll" in action

def apply_action(action: dict) -> dict:

    if action.get("roll"):
        from random import randint
        return {"roll": randint(1, 20)}
    elif action.get("move"):
        return {"moved_to": action["move"]}
    return {} 