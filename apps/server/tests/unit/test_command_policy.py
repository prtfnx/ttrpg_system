"""The browser cannot silently omit a newly introduced mutation domain."""
import re
from pathlib import Path

from core_table.protocol import MessageType
from service.protocol.base import MUTATING_MESSAGE_TYPES


def test_browser_acknowledgement_policy_covers_every_server_mutation():
    source = (Path(__file__).resolve().parents[3] / "web-ui/src/lib/websocket/commandTracking.ts").read_text(encoding="utf-8")
    body = source.split("export const MUTATION_MESSAGES", 1)[1].split("]);", 1)[0]
    client_types = {getattr(MessageType, name) for name in re.findall(r"MessageType\.(\w+)", body)}
    # The transport batch tracks each member, never the outer envelope twice.
    assert client_types == MUTATING_MESSAGE_TYPES - {MessageType.BATCH_REQUEST}
