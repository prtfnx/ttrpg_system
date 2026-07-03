import { useOptionalProtocol } from '@lib/api';
import { createMessage, MessageType, type MessageType as ProtocolMessageType } from '@lib/websocket';
import { useCallback } from 'react';

export type CombatCommandType = 'dash' | 'dodge' | 'disengage' | 'hide' | 'end_turn';

export interface CombatCommandPayload extends Record<string, unknown> {
  type: string;
  actor_id: string;
  [key: string]: unknown;
}

export interface CombatCommandBatch extends Record<string, unknown> {
  sequence_id: number;
  commands: CombatCommandPayload[];
}

export interface AttackCommandInput {
  actorId: string;
  targetId: string;
  tableId?: string;
  attackBonus?: number;
  damageFormula?: string;
  damageType?: string;
  attackType?: string;
  rangeFt?: number;
}

export interface SpellCommandInput {
  actorId: string;
  spellName: string;
  spellLevel: number;
  targetIds: string[];
  damageFormula?: string;
  saveAbility?: string;
  saveDc?: number;
  damageType?: string;
  requiresAttackRoll?: boolean;
  attackBonus?: number;
  isConcentration?: boolean;
}

export type DMOverrideType =
  | 'set_hp'
  | 'set_temp_hp'
  | 'apply_damage'
  | 'apply_healing'
  | 'grant_resource';

export type DMResourceType = 'action' | 'bonus_action' | 'reaction' | 'movement';

export interface DMOverrideInput {
  actorId: string;
  overrideType: DMOverrideType;
  value?: number;
  resource?: DMResourceType;
  damageType?: string;
}

export function useCombatCommands() {
  const protocolCtx = useOptionalProtocol();
  const protocol = protocolCtx?.protocol;

  const sendCommandBatch = useCallback((batch: CombatCommandBatch) => {
    protocol?.sendMessage(createMessage(MessageType.COMBAT_COMMAND, batch));
    return Boolean(protocol);
  }, [protocol]);

  const sendProtocolMessage = useCallback((type: ProtocolMessageType, data: Record<string, unknown> = {}) => {
    protocol?.sendMessage(createMessage(type, data));
    return Boolean(protocol);
  }, [protocol]);

  const sendCommand = useCallback((command: CombatCommandPayload, sequenceId = Date.now()) => (
    sendCommandBatch({
      sequence_id: sequenceId,
      commands: [command],
    })
  ), [sendCommandBatch]);

  const sendUtilityAction = useCallback((actorId: string, type: CombatCommandType) => (
    sendCommand({
      type,
      actor_id: actorId,
    })
  ), [sendCommand]);

  const endTurn = useCallback((actorId: string) => (
    sendUtilityAction(actorId, 'end_turn')
  ), [sendUtilityAction]);

  const sendAttack = useCallback((input: AttackCommandInput) => (
    sendCommand({
      type: 'attack',
      actor_id: input.actorId,
      target_id: input.targetId,
      table_id: input.tableId,
      attack_bonus: input.attackBonus ?? 0,
      damage_formula: input.damageFormula || '1d4',
      damage_type: input.damageType || 'bludgeoning',
      attack_type: input.attackType || 'melee',
      range_ft: input.rangeFt ?? 5,
    })
  ), [sendCommand]);

  const sendSpell = useCallback((input: SpellCommandInput) => (
    sendCommand({
      type: 'cast_spell',
      actor_id: input.actorId,
      spell_name: input.spellName,
      spell_level: input.spellLevel,
      target_ids: input.targetIds,
      damage_formula: input.damageFormula || '',
      save_ability: input.saveAbility || '',
      save_dc: input.saveDc ?? 0,
      damage_type: input.damageType || 'fire',
      requires_attack_roll: input.requiresAttackRoll ?? false,
      attack_bonus: input.attackBonus ?? 0,
      is_concentration: input.isConcentration ?? false,
    })
  ), [sendCommand]);

  const sendDMOverride = useCallback((input: DMOverrideInput) => (
    sendCommand({
      type: 'dm_override',
      actor_id: input.actorId,
      override_type: input.overrideType,
      value: input.value,
      resource: input.resource,
      damage_type: input.damageType || '',
    })
  ), [sendCommand]);

  const rollInitiative = useCallback((combatantId: string) => (
    sendProtocolMessage(MessageType.INITIATIVE_ROLL, { combatant_id: combatantId })
  ), [sendProtocolMessage]);

  const rollDeathSave = useCallback((combatantId: string) => (
    sendProtocolMessage(MessageType.DEATH_SAVE_ROLL, { combatant_id: combatantId })
  ), [sendProtocolMessage]);

  const skipTurn = useCallback((combatantId: string) => (
    sendProtocolMessage(MessageType.TURN_SKIP, { combatant_id: combatantId })
  ), [sendProtocolMessage]);

  const removeCombatant = useCallback((combatantId: string) => (
    sendProtocolMessage(MessageType.INITIATIVE_REMOVE, { combatant_id: combatantId })
  ), [sendProtocolMessage]);

  return {
    sendProtocolMessage,
    sendCommandBatch,
    sendCommand,
    sendUtilityAction,
    sendAttack,
    sendSpell,
    sendDMOverride,
    rollInitiative,
    rollDeathSave,
    skipTurn,
    removeCombatant,
    endTurn,
  };
}
