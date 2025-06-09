from fastapi import WebSocket, WebSocketDisconnect
from service.game_session import GameSessionManager

manager = GameSessionManager()

@app.websocket("/ws/game/{room_id}")
async def game_ws(websocket: WebSocket, room_id: str):
    await websocket.accept()
    await manager.connect(room_id, websocket)

    try:
        while True:
            data = await websocket.receive_json()
            response = await manager.handle_action(room_id, websocket, data)
            if response:
                await websocket.send_json(response)
    except WebSocketDisconnect:
        await manager.disconnect(room_id, websocket)