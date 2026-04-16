"""
Locust WebSocket load test for TTRPG game server.

Usage:
    locust -f apps/server/tests/loadtest/locustfile.py --host http://localhost:8000

Requires a running server with at least one session. Set env vars:
    LOAD_TEST_TOKEN    – valid JWT token
    LOAD_TEST_SESSION  – session code to join
"""
import json
import os
import time
import uuid

from locust import User, task, between, events  # type: ignore[import-not-found]
import websocket  # type: ignore[import-missing-module-source]


WS_PATH = "/ws/game/"
TOKEN = os.getenv("LOAD_TEST_TOKEN", "dev-token")
SESSION = os.getenv("LOAD_TEST_SESSION", "LOADTEST")


class GameWSUser(User):
    wait_time = between(0.2, 1.0)
    abstract = False

    def on_start(self):
        host = self.host.replace("http://", "ws://").replace("https://", "wss://")
        url = f"{host}{WS_PATH}{SESSION}?token={TOKEN}"
        self.ws = websocket.create_connection(url, timeout=10)
        # consume welcome
        welcome = self.ws.recv()
        data = json.loads(welcome)
        assert data.get("type") == "welcome", f"Expected welcome, got {data.get('type')}"
        self.client_id = str(uuid.uuid4())

    def on_stop(self):
        if hasattr(self, "ws"):
            self.ws.close()

    def _send(self, msg_type, data):
        payload = {
            "type": msg_type,
            "data": data,
            "client_id": self.client_id,
            "timestamp": time.time(),
            "version": "0.1",
            "priority": 5,
        }
        start = time.perf_counter()
        try:
            self.ws.send(json.dumps(payload))
            resp = self.ws.recv()
            elapsed = (time.perf_counter() - start) * 1000
            events.request.fire(
                request_type="WS",
                name=msg_type,
                response_time=elapsed,
                response_length=len(resp),
                exception=None,
                context={},
            )
        except Exception as e:
            elapsed = (time.perf_counter() - start) * 1000
            events.request.fire(
                request_type="WS",
                name=msg_type,
                response_time=elapsed,
                response_length=0,
                exception=e,
                context={},
            )

    @task(5)
    def move_sprite(self):
        import random
        self._send("sprite_move", {
            "table_id": "table_1",
            "sprite_id": f"sprite_{random.randint(1, 20)}",
            "from": {"x": random.randint(0, 800), "y": random.randint(0, 600)},
            "to": {"x": random.randint(0, 800), "y": random.randint(0, 600)},
        })

    @task(1)
    def ping(self):
        self._send("ping", {})
