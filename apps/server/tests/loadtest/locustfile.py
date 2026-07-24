"""Locust load test for the authenticated game WebSocket protocol.

Run against a disposable session, never production:

    $env:LOAD_TEST_TOKEN = "<valid JWT>"
    $env:LOAD_TEST_SESSION = "<session code>"
    $env:LOAD_TEST_ORIGIN = "http://localhost:8000"
    locust -f apps/server/tests/loadtest/locustfile.py `
      --host http://localhost:8000

Optional mutation coverage requires a sprite controlled by every load-test
identity:

    $env:LOAD_TEST_TABLE = "<table id>"
    $env:LOAD_TEST_SPRITE = "<sprite id>"
"""

import json
import os
import random
import time
import uuid
from urllib.parse import urlsplit

import websocket  # type: ignore[import-missing-module-source]
from locust import User, between, events, task  # type: ignore[import-not-found]

TOKEN = os.getenv("LOAD_TEST_TOKEN", "")
SESSION = os.getenv("LOAD_TEST_SESSION", "")
ORIGIN = os.getenv("LOAD_TEST_ORIGIN", "")
TABLE_ID = os.getenv("LOAD_TEST_TABLE", "")
SPRITE_ID = os.getenv("LOAD_TEST_SPRITE", "")

if not TOKEN or not SESSION:
    raise RuntimeError("LOAD_TEST_TOKEN and LOAD_TEST_SESSION are required")


def _websocket_url(host: str, session_code: str) -> str:
    parsed = urlsplit(host)
    scheme = "wss" if parsed.scheme == "https" else "ws"
    return f"{scheme}://{parsed.netloc}/ws/game/{session_code}"


class GameWSUser(User):
    wait_time = between(0.5, 2.0)
    abstract = False

    def on_start(self):
        origin = ORIGIN or self.host
        self.ws = websocket.create_connection(
            _websocket_url(self.host, SESSION),
            cookie=f"token={TOKEN}",
            origin=origin,
            timeout=10,
        )
        welcome = json.loads(self.ws.recv())
        if welcome.get("type") != "welcome":
            raise RuntimeError(f"Expected welcome, got {welcome.get('type')}")

    def on_stop(self):
        if hasattr(self, "ws"):
            self.ws.close()

    def _send(self, msg_type: str, data: dict) -> dict:
        message_id = uuid.uuid4().hex
        payload = {
            "type": msg_type,
            "data": data,
            "timestamp": time.time(),
            "version": "0.1",
            "priority": 5,
            "message_id": message_id,
        }
        started = time.perf_counter()
        try:
            self.ws.send(json.dumps(payload))
            deadline = time.monotonic() + 10
            response_text = ""
            response = {}
            while time.monotonic() < deadline:
                response_text = self.ws.recv()
                response = json.loads(response_text)
                if (
                    response.get("correlation_id") == message_id
                    or (msg_type == "ping" and response.get("type") == "pong")
                ):
                    break
            else:
                raise TimeoutError(f"No correlated response for {msg_type}")

            events.request.fire(
                request_type="WS",
                name=msg_type,
                response_time=(time.perf_counter() - started) * 1000,
                response_length=len(response_text),
                exception=None,
                context={},
            )
            return response
        except Exception as exc:
            events.request.fire(
                request_type="WS",
                name=msg_type,
                response_time=(time.perf_counter() - started) * 1000,
                response_length=0,
                exception=exc,
                context={},
            )
            return {}

    @task(5)
    def ping(self):
        self._send("ping", {})

    @task(2)
    def list_tables(self):
        self._send("table_list_request", {})

    @task(1)
    def synchronize_measurements(self):
        if TABLE_ID:
            self._send("measurement_sync", {"table_id": TABLE_ID})
        else:
            self.ping()

    @task(1)
    def move_controlled_sprite(self):
        if not TABLE_ID or not SPRITE_ID:
            self.ping()
            return
        old_position = {
            "x": random.randint(0, 800),
            "y": random.randint(0, 600),
        }
        new_position = {
            "x": random.randint(0, 800),
            "y": random.randint(0, 600),
        }
        self._send("sprite_move", {
            "table_id": TABLE_ID,
            "sprite_id": SPRITE_ID,
            "from": old_position,
            "to": new_position,
            "action_id": uuid.uuid4().hex,
        })
