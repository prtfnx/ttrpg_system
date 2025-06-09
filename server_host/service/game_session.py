from typing import Dict, List
from .rules import validate_action, apply_action
import asyncio

class GameSessionManager:
    def __init__(self):
        self.rooms: Dict[str, List] = {}

    async def connect(self, room_id: str, ws):
        self.rooms.setdefault(room_id, []).append(ws)

    async def disconnect(self, room_id: str, ws):
        self.rooms[room_id].remove(ws)

    async def handle_action(self, room_id: str, ws, action: dict):
        if not validate_action(action):
            return {"error": "Invalid action"}

        result = apply_action(action)

        # Рассылаем всем клиентам в комнате
        for client in self.rooms[room_id]:
            if client != ws:
                await client.send_json({"update": result})
        return {"status": "ok"}