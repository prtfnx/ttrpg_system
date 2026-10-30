"""Borrowed-transaction receipt primitives; callers authorize and serialize first."""

import hashlib
import json
from copy import deepcopy
from dataclasses import dataclass

from database.models import SessionOperationReceipt


class OperationRejected(ValueError):
    def __init__(self, message: str, code: str = 'invalid_payload'):
        super().__init__(message)
        self.code = code


class OperationOutcomeUnknown(RuntimeError):
    """No outcome can yet be proved; retry only the same original intent."""


def bounded_json(value, limit: int) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False)
    if len(encoded.encode('utf-8')) > limit:
        raise OperationRejected('Operation data exceeds its size limit')
    return encoded


@dataclass(frozen=True)
class OperationIdentity:
    session_id: int
    actor_id: int
    domain: str
    operation_id: str
    request_hash: str

    @classmethod
    def create(cls, session_id: int, actor_id: int, domain: str, operation_id: str, payload: dict):
        if any(isinstance(item, bool) or not isinstance(item, int) or item <= 0 for item in (session_id, actor_id)):
            raise OperationRejected('Trusted positive session and actor identities are required')
        if not isinstance(domain, str) or not 1 <= len(domain) <= 32:
            raise OperationRejected('Invalid operation domain')
        if not isinstance(operation_id, str) or not operation_id.strip() or len(operation_id) > 128:
            raise OperationRejected('Original request identity is required (up to 128 characters)')
        digest = hashlib.sha256(bounded_json(payload, 8192).encode('utf-8')).hexdigest()
        return cls(session_id, actor_id, domain, operation_id, digest)


def find_receipt(db, identity: OperationIdentity) -> dict | None:
    receipt = db.query(SessionOperationReceipt).filter_by(session_id=identity.session_id,
        actor_id=identity.actor_id, domain=identity.domain, operation_id=identity.operation_id).one_or_none()
    if receipt is None:
        return None
    if receipt.request_hash != identity.request_hash:
        raise OperationRejected('Request identity was already used with different input', 'conflict')
    return deepcopy(receipt.result_json)


def stage_receipt(db, identity: OperationIdentity, result: dict) -> None:
    # The database's unique scope is the final competing-writer guard. Never
    # insert a receipt separately from its effect or commit this borrowed session.
    bounded_json(result, 32768)
    db.add(SessionOperationReceipt(session_id=identity.session_id, actor_id=identity.actor_id,
        domain=identity.domain, operation_id=identity.operation_id, request_hash=identity.request_hash,
        result_json=deepcopy(result)))
    db.flush()
