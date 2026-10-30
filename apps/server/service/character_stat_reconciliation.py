"""Bounded, read-only repair proposals with an exact optimistic precondition."""
from __future__ import annotations

import hashlib
import json
from typing import Any

from database.models import CombatEncounter, Entity, GamePlayer, GameSession, SessionCharacter, VirtualTable
from service.character_stat_normalization import normalize_character_stats
from sqlalchemy import or_
from utils.roles import is_dm

MAX_LINKED_TOKENS = 1000
MAX_REPORT_TOKENS = 50


def _merge_diff(before: Any, after: Any) -> Any:
    if not isinstance(after, dict):
        return after
    original = before if isinstance(before, dict) else {}
    result = {key: None for key in original if key not in after}
    for key, value in after.items():
        if key not in original or value != original[key]:
            result[key] = _merge_diff(original.get(key), value)
    return result


def inspect_stat_reconciliation(db, session_id: int, character_id: str, actor_id: int, *, lock_tokens=False) -> dict:
    """Caller serializes the live session; apply also holds session/source locks.

    A CLI/read caller can receive an immediately stale proposal. The digest is
    rechecked with row locks before any repair write, never used as authority.
    """
    game = db.query(GameSession).filter_by(id=session_id).one_or_none()
    membership = db.query(GamePlayer.role).filter_by(session_id=session_id, user_id=actor_id).scalar()
    if game is None or not (game.owner_id == actor_id or is_dm(membership)):
        raise ValueError("Session DM authority is required for stat reconciliation")
    source = db.query(SessionCharacter).filter_by(session_id=session_id, character_id=character_id,
        archived_at=None).one_or_none()
    if source is None:
        raise ValueError("Active character was not found in this session")
    query = db.query(Entity, VirtualTable.table_id).join(VirtualTable, Entity.table_id == VirtualTable.id).filter(
        VirtualTable.session_id == session_id, Entity.character_id == character_id).order_by(Entity.id)
    if lock_tokens:
        query = query.with_for_update(of=Entity)
    rows = query.limit(MAX_LINKED_TOKENS + 1).all()
    active_combat = db.query(CombatEncounter.encounter_id).filter(CombatEncounter.session_id == session_id,
        CombatEncounter.ended_at.is_(None), or_(CombatEncounter.phase != 'inactive', CombatEncounter.phase.is_(None))).first() is not None
    tokens = [{'sprite_id': entity.sprite_id, 'table_id': table_id,
               'hp': entity.hp, 'max_hp': entity.max_hp, 'ac': entity.ac} for entity, table_id in rows]
    fingerprint = hashlib.sha256(json.dumps([session_id, character_id, source.version, source.character_data,
        tokens, active_combat], sort_keys=True, ensure_ascii=False, allow_nan=False).encode('utf-8')).hexdigest()
    report = {'character_id': character_id, 'source_version': source.version, 'expected_digest': fingerprint,
              'status': 'blocked', 'blocked_reasons': [], 'linked_token_count': len(rows),
              'token_count_truncated': len(rows) > MAX_LINKED_TOKENS, 'token_mismatch_count': 0,
              'source_changes': False, 'token_changes': [], 'token_changes_truncated': False, '_updates': {}}
    reasons = []
    if active_combat:
        reasons.append('End active combat in this session before reconciling stats')
    if len(rows) > MAX_LINKED_TOKENS:
        reasons.append(f'Reconciliation supports at most {MAX_LINKED_TOKENS} linked tokens per character')
    try:
        before = json.loads(source.character_data)
        if not isinstance(before, dict):
            raise ValueError('Character source must be a JSON object')
        normalized = normalize_character_stats(before, character_id=character_id)
        stats = normalized.get('data', {}).get('stats') or {}
        values = {'hp': stats.get('hp'), 'max_hp': stats.get('maxHp'), 'ac': stats.get('ac')}
        changed = [{**token, 'expected': values} for token in tokens
                   if any(token[key] != value for key, value in values.items())]
        report.update(canonical_stats=values, source_changes=normalized != before, token_mismatch_count=len(changed),
            token_changes=changed[:MAX_REPORT_TOKENS], token_changes_truncated=len(changed) > MAX_REPORT_TOKENS)
        if not reasons:
            report['status'] = 'repairable' if changed or normalized != before else 'clean'
            updates = _merge_diff(before, normalized)
            # Include every projection field, including explicit clears, so a
            # projection-only repair uses the normal atomic source acceptance.
            updates.setdefault('data', {}).setdefault('stats', {}).update(
                {'hp': values['hp'], 'maxHp': values['max_hp'], 'ac': values['ac']})
            report['_updates'] = updates
    except (ValueError, TypeError) as exc:
        reasons.append(str(exc))
    report['blocked_reasons'] = reasons
    return report


def public_stat_report(report: dict) -> dict:
    return {key: value for key, value in report.items() if not key.startswith('_')}
