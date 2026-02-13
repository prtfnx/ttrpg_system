"""
Basic game rules and validation for TTRPG actions
"""
from typing import Dict, Any
import logging
import random

logger = logging.getLogger(__name__)

def validate_action(action: Dict[str, Any]) -> bool:
    """Validate incoming game action"""
    try:
        if not isinstance(action, dict):
            return False
        
        action_type = action.get("type")
        if not action_type:
            return False
        
        # Basic validation for different action types
        if action_type == "chat_message":
            return "message" in action.get("data", {})
        
        elif action_type == "dice_roll":
            data = action.get("data", {})
            return "dice_type" in data and "quantity" in data
        
        elif action_type == "move_token":
            data = action.get("data", {})
            return all(key in data for key in ["token_id", "x", "y"])
        
        elif action_type == "game_action":
            return "action" in action.get("data", {})
        
        # Legacy support
        if "move" in action or "roll" in action:
            return True
        
        # Default to allowing unknown actions for flexibility
        return True
        
    except Exception as e:
        logger.error(f"Error validating action: {e}")
        return False

def apply_action(action: Dict[str, Any]) -> Dict[str, Any]:
    """Apply game action and return result"""
    try:
        action_type = action.get("type")
        data = action.get("data", {})
        
        if action_type == "dice_roll":
            dice_type = data.get("dice_type", 20)  # Default d20
            quantity = data.get("quantity", 1)
            
            results = []
            for _ in range(quantity):
                results.append(random.randint(1, dice_type))
            
            return {
                "action_type": "dice_roll",
                "results": results,
                "total": sum(results),
                "dice_type": dice_type,
                "quantity": quantity
            }
        
        elif action_type == "move_token":
            return {
                "action_type": "move_token",
                "token_id": data.get("token_id"),
                "old_position": data.get("old_position", [0, 0]),
                "new_position": [data.get("x", 0), data.get("y", 0)]
            }
        
        elif action_type == "chat_message":
            return {
                "action_type": "chat_message",
                "message": data.get("message", ""),
                "processed": True
            }
        
        # Legacy support
        if action.get("roll"):
            return {"roll": random.randint(1, 20)}
        elif action.get("move"):
            return {"moved_to": action["move"]}
        
        # Default: return the action as-is
        return {
            "action_type": action_type,
            "data": data,
            "processed": True
        }
        
    except Exception as e:
        logger.error(f"Error applying action: {e}")
        return {
            "action_type": "error",
            "error": str(e)
        }
    return {} 