from core_table.protocol import Message, MessageType
from database.database import SessionLocal
from service.character_rules import level_for_xp
from utils.logger import setup_logger
from utils.roles import is_dm

from ._protocol_base import _ProtocolBase

logger = setup_logger(__name__)


class _CharactersMixin(_ProtocolBase):
    """Handler methods for characters domain."""

    def _character_client_ids(
        self,
        session_id: int,
        character_id: str,
        exclude_client: str | None = None,
    ) -> list[str] | None:
        client_info = getattr(self.session_manager, 'client_info', None)
        if not isinstance(client_info, dict):
            return None
        from managers.character_manager import get_server_character_manager

        manager = get_server_character_manager()
        allowed = []
        for target_client_id, info in client_info.items():
            if target_client_id == exclude_client:
                continue
            user_id = info.get('user_id')
            if user_id is None:
                continue
            if manager.can_view_character(
                session_id,
                character_id,
                int(user_id),
                bypass_owner_check=is_dm(info.get('role')),
            ):
                allowed.append(target_client_id)
        return allowed

    async def _broadcast_character_event(
        self,
        message: Message,
        session_id: int,
        character_id: str,
        exclude_client: str | None = None,
        target_clients: list[str] | None = None,
    ) -> None:
        targets = target_clients
        if targets is None:
            targets = self._character_client_ids(session_id, character_id, exclude_client)
        if targets is None:
            await self.broadcast_to_session(message, exclude_client or '')
            return
        for target_client_id in targets:
            await self.send_to_client(message, target_client_id)

    def _draft_client_ids(
        self,
        session_id: int,
        draft_id: str,
        exclude_client: str | None = None,
    ) -> list[str]:
        client_info = getattr(self.session_manager, 'client_info', None)
        if not isinstance(client_info, dict):
            return []
        from managers.character_draft_manager import get_character_draft_manager

        manager = get_character_draft_manager()
        allowed = []
        for target_client_id, info in client_info.items():
            if target_client_id == exclude_client:
                continue
            user_id = info.get('user_id')
            if user_id is None:
                continue
            if manager.can_view_draft(
                session_id,
                draft_id,
                int(user_id),
                bypass_owner_check=is_dm(info.get('role')),
            ):
                allowed.append(target_client_id)
        return allowed

    async def _broadcast_draft_event(
        self,
        message: Message,
        session_id: int,
        draft_id: str,
        exclude_client: str | None = None,
    ) -> None:
        for target_client_id in self._draft_client_ids(
            session_id, draft_id, exclude_client
        ):
            await self.send_to_client(message, target_client_id)

    @staticmethod
    def _draft_error(message_type: MessageType, error: str, **extra) -> Message:
        return Message(message_type, {'success': False, 'error': error, **extra})

    async def handle_character_draft_create(self, msg: Message, client_id: str) -> Message:
        from managers.character_draft_manager import get_character_draft_manager

        session_id = self._get_session_id(msg)
        user_id = self._get_user_id(msg, client_id)
        data = msg.data or {}
        if not session_id or user_id is None or not isinstance(data.get('draft_data'), dict):
            return self._draft_error(
                MessageType.CHARACTER_DRAFT_CREATE_RESPONSE,
                'Authenticated session and draft_data are required',
            )
        result = get_character_draft_manager().create_draft(
            session_id, user_id, data['draft_data'], data.get('current_step', 0)
        )
        if not result.get('success'):
            return self._draft_error(
                MessageType.CHARACTER_DRAFT_CREATE_RESPONSE, result['error']
            )
        draft = result['draft']
        await self._broadcast_draft_event(
            Message(MessageType.CHARACTER_DRAFT_UPDATED, {
                'operation': 'created', 'draft': draft,
            }),
            session_id,
            draft['draft_id'],
            client_id,
        )
        return Message(MessageType.CHARACTER_DRAFT_CREATE_RESPONSE, {
            'success': True, 'draft': draft,
        })

    async def handle_character_draft_list(self, msg: Message, client_id: str) -> Message:
        from managers.character_draft_manager import get_character_draft_manager

        session_id = self._get_session_id(msg)
        user_id = self._get_user_id(msg, client_id)
        if not session_id or user_id is None:
            return self._draft_error(
                MessageType.CHARACTER_DRAFT_LIST_RESPONSE, 'Authenticated session is required'
            )
        result = get_character_draft_manager().list_drafts(
            session_id,
            user_id,
            bypass_owner_check=is_dm(self._get_client_role(client_id)),
        )
        if not result.get('success'):
            return self._draft_error(MessageType.CHARACTER_DRAFT_LIST_RESPONSE, result['error'])
        return Message(MessageType.CHARACTER_DRAFT_LIST_RESPONSE, {
            'success': True, 'drafts': result['drafts'],
        })

    async def handle_character_draft_load(self, msg: Message, client_id: str) -> Message:
        from managers.character_draft_manager import get_character_draft_manager

        session_id = self._get_session_id(msg)
        user_id = self._get_user_id(msg, client_id)
        draft_id = (msg.data or {}).get('draft_id')
        if not session_id or user_id is None or not draft_id:
            return self._draft_error(
                MessageType.CHARACTER_DRAFT_LOAD_RESPONSE, 'draft_id is required'
            )
        result = get_character_draft_manager().load_draft(
            session_id,
            str(draft_id),
            user_id,
            bypass_owner_check=is_dm(self._get_client_role(client_id)),
        )
        if not result.get('success'):
            return self._draft_error(MessageType.CHARACTER_DRAFT_LOAD_RESPONSE, result['error'])
        return Message(MessageType.CHARACTER_DRAFT_LOAD_RESPONSE, {
            'success': True, 'draft': result['draft'],
        })

    async def handle_character_draft_update(self, msg: Message, client_id: str) -> Message:
        from managers.character_draft_manager import get_character_draft_manager

        session_id = self._get_session_id(msg)
        user_id = self._get_user_id(msg, client_id)
        data = msg.data or {}
        if (
            not session_id or user_id is None or not data.get('draft_id')
            or not isinstance(data.get('draft_data'), dict)
            or not isinstance(data.get('expected_version'), int)
        ):
            return self._draft_error(
                MessageType.CHARACTER_DRAFT_UPDATE_RESPONSE,
                'draft_id, draft_data, and expected_version are required',
            )
        result = get_character_draft_manager().update_draft(
            session_id,
            str(data['draft_id']),
            user_id,
            data['draft_data'],
            data.get('current_step', 0),
            data['expected_version'],
        )
        if not result.get('success'):
            return self._draft_error(
                MessageType.CHARACTER_DRAFT_UPDATE_RESPONSE,
                result['error'],
                current_draft=result.get('current_draft'),
            )
        draft = result['draft']
        await self._broadcast_draft_event(
            Message(MessageType.CHARACTER_DRAFT_UPDATED, {
                'operation': 'updated', 'draft': draft,
            }),
            session_id,
            draft['draft_id'],
            client_id,
        )
        return Message(MessageType.CHARACTER_DRAFT_UPDATE_RESPONSE, {
            'success': True, 'draft': draft,
        })

    async def handle_character_draft_finalize(self, msg: Message, client_id: str) -> Message:
        from managers.character_draft_manager import get_character_draft_manager

        session_id = self._get_session_id(msg)
        user_id = self._get_user_id(msg, client_id)
        data = msg.data or {}
        if (
            not session_id or user_id is None or not data.get('draft_id')
            or not isinstance(data.get('character_data'), dict)
            or not isinstance(data.get('expected_version'), int)
        ):
            return self._draft_error(
                MessageType.CHARACTER_DRAFT_FINALIZE_RESPONSE,
                'draft_id, character_data, and expected_version are required',
            )
        result = get_character_draft_manager().finalize_draft(
            session_id,
            str(data['draft_id']),
            user_id,
            data['expected_version'],
            data['character_data'],
        )
        if not result.get('success'):
            return self._draft_error(
                MessageType.CHARACTER_DRAFT_FINALIZE_RESPONSE,
                result['error'],
                current_draft=result.get('current_draft'),
            )
        await self._broadcast_draft_event(
            Message(MessageType.CHARACTER_DRAFT_UPDATED, {
                'operation': 'converted',
                'draft_id': data['draft_id'],
                'character_id': result['character_id'],
            }),
            session_id,
            str(data['draft_id']),
            client_id,
        )
        await self._broadcast_character_event(
            Message(MessageType.CHARACTER_UPDATE, {
                'operation': 'create',
                'character_id': result['character_id'],
                'character_data': result['character_data'],
                'version': result['version'],
            }),
            session_id,
            result['character_id'],
            client_id,
        )
        return Message(MessageType.CHARACTER_DRAFT_FINALIZE_RESPONSE, result)

    async def handle_character_draft_abandon(self, msg: Message, client_id: str) -> Message:
        from managers.character_draft_manager import get_character_draft_manager

        session_id = self._get_session_id(msg)
        user_id = self._get_user_id(msg, client_id)
        data = msg.data or {}
        if (
            not session_id or user_id is None or not data.get('draft_id')
            or not isinstance(data.get('expected_version'), int)
        ):
            return self._draft_error(
                MessageType.CHARACTER_DRAFT_ABANDON_RESPONSE,
                'draft_id and expected_version are required',
            )
        result = get_character_draft_manager().abandon_draft(
            session_id, str(data['draft_id']), user_id, data['expected_version']
        )
        if not result.get('success'):
            return self._draft_error(
                MessageType.CHARACTER_DRAFT_ABANDON_RESPONSE, result['error']
            )
        await self._broadcast_draft_event(
            Message(MessageType.CHARACTER_DRAFT_UPDATED, {
                'operation': 'abandoned', 'draft_id': data['draft_id'],
            }),
            session_id,
            str(data['draft_id']),
            client_id,
        )
        return Message(MessageType.CHARACTER_DRAFT_ABANDON_RESPONSE, result)

    async def handle_character_save_request(self, msg: Message, client_id: str) -> Message:
        """Handle character save request"""
        logger.debug("Character save requested", extra={"event_name": "character.save.requested"})
        if not msg.data:
            return Message(MessageType.CHARACTER_SAVE_RESPONSE, {
                'success': False,
                'error': 'No character data provided'
            })

        character_data = msg.data.get('character_data')
        session_code = msg.data.get('session_code', 'unknown')
        user_id = self._get_user_id(msg, client_id) or 0

        if not character_data:
            return Message(MessageType.CHARACTER_SAVE_RESPONSE, {
                'success': False,
                'error': 'Character data is required'
            })

        # Get session_id from session_code
        session_id = self._get_session_id(msg)
        if not session_id:
            return Message(MessageType.CHARACTER_SAVE_RESPONSE, {
                'success': False,
                'error': f'Session {session_code} not found'
            })

        result = await self.actions.save_character(session_id, character_data, user_id)

        if result.success:
            resdata = result.data or {}
            character_id_saved = resdata.get('character_id')
            version_saved = resdata.get('version', 1)
            # Broadcast full character data so other clients can update their state
            char_for_broadcast = dict(character_data)
            char_for_broadcast['character_id'] = character_id_saved
            await self._broadcast_character_event(Message(MessageType.CHARACTER_UPDATE, {
                'operation': 'save',
                'character_id': character_id_saved,
                'character_data': char_for_broadcast,
                'version': version_saved,
            }), session_id, character_id_saved, client_id)

            return Message(MessageType.CHARACTER_SAVE_RESPONSE, {
                'success': True,
                'character_id': character_id_saved,
                'version': version_saved,
                'message': result.message
            })
        else:
            return Message(MessageType.CHARACTER_SAVE_RESPONSE, {
                'success': False,
                'error': result.message
            })

    async def handle_character_load_request(self, msg: Message, client_id: str) -> Message:
        """Handle character load request"""
        logger.debug("Character load requested", extra={"event_name": "character.load.requested"})
        if not msg.data:
            return Message(MessageType.CHARACTER_LOAD_RESPONSE, {
                'success': False,
                'error': 'No character ID provided'
            })

        character_id = msg.data.get('character_id')
        session_code = msg.data.get('session_code', 'unknown')
        user_id = self._get_user_id(msg, client_id) or 0

        if not character_id:
            return Message(MessageType.CHARACTER_LOAD_RESPONSE, {
                'success': False,
                'error': 'Character ID is required'
            })

        # Get session_id from session_code
        session_id = self._get_session_id(msg)
        if not session_id:
            return Message(MessageType.CHARACTER_LOAD_RESPONSE, {
                'success': False,
                'error': f'Session {session_code} not found'
            })

        result = await self.actions.load_character(
            session_id,
            character_id,
            user_id,
            bypass_owner_check=is_dm(self._get_client_role(client_id)),
        )

        if result.success:
            resdata = result.data or {}
            return Message(MessageType.CHARACTER_LOAD_RESPONSE, {
                'success': True,
                'character_data': resdata.get('character_data'),
                'message': result.message
            })
        else:
            return Message(MessageType.CHARACTER_LOAD_RESPONSE, {
                'success': False,
                'error': result.message
            })

    async def handle_character_list_request(self, msg: Message, client_id: str) -> Message:
        """Handle character list request"""
        logger.debug("Character list requested", extra={"event_name": "character.list.requested"})
        if not msg.data:
            return Message(MessageType.CHARACTER_LIST_RESPONSE, {
                'success': False,
                'error': 'No session data provided'
            })

        session_code = msg.data.get('session_code', 'unknown')
        user_id = self._get_user_id(msg, client_id) or 0

        # Get session_id from session_code
        session_id = self._get_session_id(msg)
        if not session_id:
            return Message(MessageType.CHARACTER_LIST_RESPONSE, {
                'success': False,
                'error': f'Session {session_code} not found'
            })

        role = self._get_client_role(client_id)
        result = await self.actions.list_characters(
            session_id, user_id, bypass_owner_check=is_dm(role)
        )

        if result.success:
            resdata = result.data or {}
            return Message(MessageType.CHARACTER_LIST_RESPONSE, {
                'success': True,
                'characters': resdata.get('characters', []),
                'session_code': session_code,
                'message': result.message
            })
        else:
            return Message(MessageType.CHARACTER_LIST_RESPONSE, {
                'success': False,
                'error': result.message
            })

    async def handle_character_delete_request(self, msg: Message, client_id: str) -> Message:
        """Handle character delete request"""
        logger.debug("Character delete requested", extra={"event_name": "character.delete.requested"})
        if not msg.data:
            return Message(MessageType.CHARACTER_DELETE_RESPONSE, {
                'success': False,
                'error': 'No character ID provided'
            })

        character_id = msg.data.get('character_id')
        session_code = msg.data.get('session_code', 'unknown')
        user_id = self._get_user_id(msg, client_id) or 0

        if not character_id:
            return Message(MessageType.CHARACTER_DELETE_RESPONSE, {
                'success': False,
                'error': 'Character ID is required'
            })

        # Get session_id from session_code
        session_id = self._get_session_id(msg)
        if not session_id:
            return Message(MessageType.CHARACTER_DELETE_RESPONSE, {
                'success': False,
                'error': f'Session {session_code} not found'
            })

        target_clients = self._character_client_ids(session_id, character_id, client_id)
        result = await self.actions.delete_character(
            session_id,
            character_id,
            user_id,
            bypass_owner_check=is_dm(self._get_client_role(client_id)),
        )

        if result.success:
            await self._broadcast_character_event(Message(MessageType.CHARACTER_UPDATE, {
                'operation': 'delete',
                'character_id': character_id,
            }), session_id, character_id, client_id, target_clients)

            return Message(MessageType.CHARACTER_DELETE_RESPONSE, {
                'success': True,
                'character_id': character_id,
                'message': result.message
            })
        else:
            return Message(MessageType.CHARACTER_DELETE_RESPONSE, {
                'success': False,
                'error': result.message
            })

    async def handle_character_update(self, msg: Message, client_id: str) -> Message:
        """Handle partial character updates (delta) with optimistic version checking"""
        logger.debug("Character update requested", extra={"event_name": "character.update.requested"})
        if not msg.data:
            return Message(MessageType.CHARACTER_UPDATE_RESPONSE, {'success': False, 'error': 'No data provided'})

        character_id = msg.data.get('character_id')
        updates = msg.data.get('updates') or msg.data.get('character_data')
        version = msg.data.get('version')
        user_id = self._get_user_id(msg, client_id) or 0
        session_id = self._get_session_id(msg)

        if not character_id or not updates:
            return Message(MessageType.CHARACTER_UPDATE_RESPONSE, {'success': False, 'error': 'character_id and updates are required'})

        if not session_id:
            return Message(MessageType.CHARACTER_UPDATE_RESPONSE, {'success': False, 'error': 'Session not found'})

        # Require specialized update method in ActionsCore (no fallback)
        try:
            if not hasattr(self.actions, 'update_character'):
                return Message(MessageType.CHARACTER_UPDATE_RESPONSE, {'success': False, 'error': 'Server does not support character delta updates'})

            result = await self.actions.update_character(
                session_id=session_id,
                character_id=character_id,
                updates=updates,
                user_id=user_id,
                expected_version=version,
                bypass_owner_check=is_dm(self._get_client_role(client_id)),
            )

            if result.success:
                # Sync character stats to linked tokens
                await self._sync_character_stats_to_tokens(session_id, character_id, updates)

                # Broadcast to session that character updated
                returned_version = None
                if isinstance(result.data, dict):
                    returned_version = result.data.get('version')

                broadcast = Message(MessageType.CHARACTER_UPDATE, {
                    'character_id': character_id,
                    'updates': updates,
                    'version': returned_version if returned_version is not None else version
                })
                await self._broadcast_character_event(
                    broadcast, session_id, character_id, client_id
                )

                return Message(MessageType.CHARACTER_UPDATE_RESPONSE, {'success': True, 'character_id': character_id, 'message': result.message if hasattr(result, 'message') else 'updated', 'version': returned_version})
            else:
                result_data = result.data if isinstance(result.data, dict) else {}
                return Message(MessageType.CHARACTER_UPDATE_RESPONSE, {
                    'success': False,
                    'error': result.message,
                    'character_id': character_id,
                    'current_version': result_data.get('current_version'),
                    'character_data': result_data.get('character_data'),
                })

        except Exception:
            logger.exception("Character update request failed")
            return Message(
                MessageType.CHARACTER_UPDATE_RESPONSE,
                {"success": False, "error": "Character update failed"},
            )

    async def handle_character_log_request(self, msg: Message, client_id: str) -> Message:
        """Return character action log entries."""
        if not msg.data:
            return Message(MessageType.CHARACTER_LOG_RESPONSE, {'success': False, 'error': 'No data'})
        character_id = msg.data.get('character_id')
        session_id = self._get_session_id(msg)
        user_id = self._get_user_id(msg, client_id) or 0
        limit = int(msg.data.get('limit', 50))
        if not character_id or not session_id:
            return Message(MessageType.CHARACTER_LOG_RESPONSE, {'success': False, 'error': 'character_id and session required'})
        result = await self.actions.get_character_log(
            session_id,
            character_id,
            user_id,
            limit,
            bypass_owner_check=is_dm(self._get_client_role(client_id)),
        )
        if result.success:
            return Message(MessageType.CHARACTER_LOG_RESPONSE, {
                'success': True, 'character_id': character_id,
                'logs': result.data.get('logs', [])
            })
        return Message(MessageType.CHARACTER_LOG_RESPONSE, {'success': False, 'error': result.message})

    async def handle_character_roll(self, msg: Message, client_id: str) -> Message:
        """Roll d20 server-side and broadcast result to session."""
        if not msg.data:
            return Message(MessageType.ERROR, {'error': 'No data'})
        session_id = self._get_session_id(msg)
        if not session_id:
            return Message(MessageType.ERROR, {'error': 'No active session'})
        user_id = self._get_user_id(msg, client_id) or 0
        d = msg.data
        # The client names the intent only. Modifier and roll mode are resolved
        # from the authorized canonical character sheet by ActionsCore.
        result = await self.actions.character_roll(
            session_id=session_id, user_id=user_id,
            character_id=d.get('character_id', ''),
            roll_type=d.get('roll_type', 'skill_check'),
            skill=d.get('skill', ''),
            modifier=0,
            advantage=False,
            disadvantage=False,
            bypass_owner_check=is_dm(self._get_client_role(client_id)),
        )
        if not result.success:
            return Message(MessageType.ERROR, {'error': result.message})
        chat_message = result.data.get('chat_message')
        if not isinstance(chat_message, dict):
            return Message(MessageType.ERROR, {'error': 'Persisted roll chat message is missing'})
        roll_data = {
            key: value
            for key, value in result.data.items()
            if key != 'chat_message'
        }
        # CHAT is durable history; CHARACTER_ROLL_RESULT drives live activity UI.
        await self.broadcast_to_session(
            Message(MessageType.CHAT, {'message': chat_message})
        )
        await self.broadcast_to_session(
            Message(MessageType.CHARACTER_ROLL_RESULT, roll_data)
        )
        return Message(MessageType.SUCCESS, {'message': 'Roll completed'})

    async def handle_xp_award(self, msg: Message, client_id: str) -> Message:
        """DM awards XP to a character. Checks for level-up automatically."""
        if not is_dm(self._get_client_role(client_id)):
            return Message(MessageType.XP_AWARD_RESPONSE, {'success': False, 'error': 'Only DMs can award XP'})
        if not msg.data:
            return Message(MessageType.XP_AWARD_RESPONSE, {'success': False, 'error': 'No data provided'})

        character_id = msg.data.get('character_id')
        try:
            amount = int(msg.data.get('amount', 0))
        except (TypeError, ValueError):
            amount = 0
        source = str(msg.data.get('source', 'other')).strip()[:50] or 'other'
        description = str(msg.data.get('description', '')).strip()[:300]
        session_id = self._get_session_id(msg)
        user_id = self._get_user_id(msg, client_id) or 0

        if not character_id or not 0 < amount <= 1_000_000:
            return Message(MessageType.XP_AWARD_RESPONSE, {'success': False, 'error': 'character_id and positive amount required'})
        if not session_id:
            return Message(MessageType.XP_AWARD_RESPONSE, {'success': False, 'error': 'Session not found'})

        from managers.character_manager import get_server_character_manager
        char_mgr = get_server_character_manager()

        load_result = char_mgr.load_character(
            session_id, character_id, user_id=user_id, bypass_owner_check=True
        )
        if not load_result.get('success'):
            return Message(MessageType.XP_AWARD_RESPONSE, {'success': False, 'error': load_result.get('error', 'Character not found')})

        char_data = load_result['character_data']
        inner = char_data.get('data', char_data)
        current_xp = int(inner.get('experience', inner.get('currentXP', 0)) or 0)
        new_xp = current_xp + amount

        old_level = level_for_xp(current_xp)
        new_level = level_for_xp(new_xp)
        leveled_up = new_level > old_level

        updates: dict = {}
        if 'data' in char_data:
            updates = {'data': {**inner, 'experience': new_xp}}
            if leveled_up:
                updates['data']['level'] = new_level
                updates['data']['pending_level_up'] = True
        else:
            updates = {**char_data, 'experience': new_xp}
            if leveled_up:
                updates['level'] = new_level
                updates['pending_level_up'] = True

        save_result = char_mgr.update_character(
            session_id,
            character_id,
            updates,
            user_id=user_id,
            expected_version=load_result.get('version'),
            bypass_owner_check=True,
        )
        if not save_result.get('success'):
            return Message(MessageType.XP_AWARD_RESPONSE, {'success': False, 'error': save_result.get('error', 'Save failed')})

        # Log the award
        from database.database import SessionLocal
        from database.models import CharacterLog
        try:
            with SessionLocal() as db:
                db.add(CharacterLog(
                    character_id=character_id, session_id=session_id,
                    action_type='xp_award',
                    description=f"+{amount} XP from {source}" + (f": {description}" if description else ""),
                    user_id=user_id,
                ))
                db.commit()
        except Exception as e:
            logger.warning(f"Failed to log XP award: {e}")

        resp_data = {
            'success': True, 'character_id': character_id,
            'amount': amount, 'new_xp': new_xp,
            'leveled_up': leveled_up, 'new_level': new_level if leveled_up else old_level,
            'version': save_result.get('version'),
            'character_data': save_result.get('character_data'),
        }
        await self._broadcast_character_event(
            Message(MessageType.XP_AWARD_RESPONSE, resp_data),
            session_id,
            character_id,
            client_id,
        )
        return Message(MessageType.XP_AWARD_RESPONSE, resp_data)

    async def handle_multiclass_request(self, msg: Message, client_id: str) -> Message:
        """Player or DM requests adding a new class (multiclassing)."""
        if not msg.data:
            return Message(MessageType.MULTICLASS_RESPONSE, {'success': False, 'error': 'No data provided'})

        character_id = msg.data.get('character_id')
        new_class = msg.data.get('new_class', '')
        session_id = self._get_session_id(msg)
        user_id = self._get_user_id(msg, client_id) or 0

        if not character_id or not new_class:
            return Message(MessageType.MULTICLASS_RESPONSE, {'success': False, 'error': 'character_id and new_class required'})
        if not session_id:
            return Message(MessageType.MULTICLASS_RESPONSE, {'success': False, 'error': 'Session not found'})

        from managers.character_manager import get_server_character_manager
        char_mgr = get_server_character_manager()

        is_dm_client = is_dm(self._get_client_role(client_id))
        load_result = char_mgr.load_character(
            session_id,
            character_id,
            user_id=user_id,
            bypass_owner_check=is_dm_client,
        )
        if not load_result.get('success'):
            return Message(MessageType.MULTICLASS_RESPONSE, {'success': False, 'error': load_result.get('error', 'Character not found')})

        char_data = load_result['character_data']
        valid, error = char_mgr.validate_multiclass(char_data, new_class)
        if not valid:
            return Message(MessageType.MULTICLASS_RESPONSE, {'success': False, 'error': error})

        inner = char_data.get('data', char_data)
        classes = list(inner.get('classes', []))
        classes.append({'name': new_class.lower(), 'level': 1})

        updates: dict = {}
        if 'data' in char_data:
            updates = {'data': {**inner, 'classes': classes}}
        else:
            updates = {**char_data, 'classes': classes}

        save_result = char_mgr.update_character(
            session_id,
            character_id,
            updates,
            user_id=user_id,
            expected_version=load_result.get('version'),
            bypass_owner_check=is_dm_client,
        )
        if not save_result.get('success'):
            return Message(MessageType.MULTICLASS_RESPONSE, {'success': False, 'error': save_result.get('error', 'Save failed')})

        resp_data = {
            'success': True,
            'character_id': character_id,
            'new_class': new_class,
            'classes': classes,
            'version': save_result.get('version'),
            'character_data': save_result.get('character_data'),
        }
        await self._broadcast_character_event(
            Message(MessageType.MULTICLASS_RESPONSE, resp_data),
            session_id,
            character_id,
            client_id,
        )
        return Message(MessageType.MULTICLASS_RESPONSE, resp_data)

    async def _sync_character_stats_to_tokens(self, session_id: int, character_id: str, updates: dict):
        """
        Sync character stat changes (HP, max HP, AC) to all tokens linked to this character.
        Called after character updates to keep token stats in sync.
        """
        try:
            nested_stats = (updates.get('data') or {}).get('stats') or {}
            root_stats = updates.get('stats') or {}
            source_stats = {**root_stats, **nested_stats, **updates}
            updated_stats = {}
            if 'hp' in source_stats:
                updated_stats['hp'] = source_stats['hp']
            if 'maxHp' in source_stats:
                updated_stats['max_hp'] = source_stats['maxHp']
            elif 'max_hp' in source_stats:
                updated_stats['max_hp'] = source_stats['max_hp']
            if 'ac' in source_stats:
                updated_stats['ac'] = source_stats['ac']

            if not updated_stats:
                return  # No stats to sync

            logger.debug(
                "Character stats synchronization started",
                extra={"event_name": "character.stats_sync.started"},
            )

            # Get all entities linked to this character
            db = SessionLocal()
            try:
                from database.models import Entity as DBEntity
                from database.models import VirtualTable as DBVirtualTable

                table_records = db.query(DBVirtualTable).filter(
                    DBVirtualTable.session_id == session_id
                ).all()

                if not table_records:
                    logger.debug(f"No table found for session {session_id}")
                    return

                table_by_id = {table.id: table for table in table_records}
                linked_entities = db.query(DBEntity).filter(
                    DBEntity.table_id.in_(table_by_id),
                    DBEntity.character_id == character_id
                ).all()

                if not linked_entities:
                    logger.debug(f"No tokens linked to character {character_id}")
                    return

                # Update each linked entity
                broadcasts = []
                for entity in linked_entities:
                    # Update database entity
                    for field, value in updated_stats.items():
                        setattr(entity, field, value)

                    table_record = table_by_id.get(entity.table_id)
                    table = self.table_manager.tables.get(
                        str(table_record.table_id) if table_record else ""
                    )
                    if table:
                        in_memory_entity = table.entities.get(entity.sprite_id)
                        if in_memory_entity:
                            for field, value in updated_stats.items():
                                setattr(in_memory_entity, field, value)

                    broadcasts.append((
                        entity.sprite_id,
                        table_record.table_id if table_record else None,
                    ))

                db.commit()
                logger.info(f"Synced stats from character {character_id} to {len(linked_entities)} token(s)")

                for sprite_id, table_id in broadcasts:
                    await self.broadcast_to_session(Message(MessageType.SPRITE_UPDATE, {
                        'sprite_id': sprite_id,
                        'table_id': table_id,
                        'updates': updated_stats,
                        'operation': 'update',
                        'source': 'character_sync',
                    }), '')

            finally:
                db.close()

        except Exception:
            logger.exception("Character-to-token synchronization failed")
