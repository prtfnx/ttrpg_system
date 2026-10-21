"""Bounded correlation for rejections before a domain handler can run."""
from core_table.protocol import Message, MessageType


def rejection_messages(request, error, *, code="invalid_payload"):
    def bounded(value):
        return value if isinstance(value, str) and 0 < len(value) <= 128 else None

    requests = []
    if isinstance(request, dict) and request.get("type") == "batch_request":
        data = request.get("data")
        members = data.get("messages") if isinstance(data, dict) else None
        if isinstance(members, list):
            requests.extend(item for item in members[:50] if isinstance(item, dict) and item.get("type") != "batch_request")
    requests.append(request)
    for item in requests:
        item = item if isinstance(item, dict) else {}
        payload = item.get("data")
        data = {"error": error, "code": code}
        if code == "outcome_unknown":
            data["resync_required"] = True
        if isinstance(payload, dict):
            for key in ("action_id", "operation_id", "table_id", "sprite_id"):
                value = bounded(payload.get(key))
                if value is not None:
                    data[key] = value
        causation = bounded(item.get("message_id"))
        yield Message(MessageType.ERROR, data, causation_id=causation,
                      correlation_id=bounded(item.get("correlation_id")) or causation)
