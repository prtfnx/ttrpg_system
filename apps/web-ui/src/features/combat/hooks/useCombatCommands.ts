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

export interface CombatantReferenceInput {
  entity_id: string;
  character_id?: string;
  name?: string;
}

export interface StartCombatInput {
  tableId: string;
  entityIds?: string[];
  names?: Record<string, string>;
  combatants?: CombatantReferenceInput[];
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
  | 'grant_resource'
  | 'add_condition'
  | 'remove_condition'
  | 'set_damage_traits'
  | 'set_surprised'
  | 'configure_ai'
  | 'restore_spell_slot';

export type DMResourceType = 'action' | 'bonus_action' | 'reaction' | 'movement';

export interface DMOverrideInput {
  actorId: string;
  overrideType: DMOverrideType;
  value?: number;
  resource?: DMResourceType;
  damageType?: string;
  conditionType?: string;
  duration?: number;
  source?: string;
  resistances?: string[];
  vulnerabilities?: string[];
  immunities?: string[];
  surprised?: boolean;
  aiEnabled?: boolean;
  aiBehavior?: string;
  slotLevel?: number;
}

function buildDMOverrideCommand(input: DMOverrideInput): CombatCommandPayload {
  return {
    type: 'dm_override',
    actor_id: input.actorId,
    override_type: input.overrideType,
    value: input.value,
    resource: input.resource,
    damage_type: input.damageType || '',
    condition_type: input.conditionType,
    duration: input.duration,
    source: input.source,
    resistances: input.resistances,
    vulnerabilities: input.vulnerabilities,
    immunities: input.immunities,
    surprised: input.surprised,
    ai_enabled: input.aiEnabled,
    ai_behavior: input.aiBehavior,
    slot_level: input.slotLevel,
  };
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

  const sendDMOverrides = useCallback((inputs: DMOverrideInput[]) => (
    inputs.length > 0 && sendCommandBatch({
      sequence_id: Date.now(),
      commands: inputs.map(buildDMOverrideCommand),
    })
  ), [sendCommandBatch]);

  const sendDMOverride = useCallback((input: DMOverrideInput) => (
    sendDMOverrides([input])
  ), [sendDMOverrides]);

  const rollInitiative = useCallback((combatantId: string) => (
    sendCommand({
      type: 'roll_initiative',
      actor_id: combatantId,
    })
  ), [sendCommand]);

  const setInitiative = useCallback((combatantId: string, initiative: number) => (
    sendCommand({
      type: 'set_initiative',
      actor_id: combatantId,
      initiative,
    })
  ), [sendCommand]);

  const rollDeathSave = useCallback((combatantId: string) => (
    sendCommand({
      type: 'roll_death_save',
      actor_id: combatantId,
    })
  ), [sendCommand]);

  const skipTurn = useCallback((combatantId: string) => (
    sendCommand({
      type: 'skip_turn',
      actor_id: combatantId,
    })
  ), [sendCommand]);

  const removeCombatant = useCallback((combatantId: string) => (
    sendCommand({
      type: 'remove_combatant',
      actor_id: combatantId,
    })
  ), [sendCommand]);

  const revertLastAction = useCallback(() => (
    sendCommand({
      type: 'revert_action',
      actor_id: '__dm__',
    })
  ), [sendCommand]);

  const startCombat = useCallback((input: StartCombatInput) => (
    sendCommand({
      type: 'start_combat',
      actor_id: '__dm__',
      table_id: input.tableId,
      entity_ids: input.entityIds ?? [],
      names: input.names ?? {},
      combatants: input.combatants ?? [],
    })
  ), [sendCommand]);

  const addCombatant = useCallback((input: CombatantReferenceInput) => (
    sendCommand({
      type: 'add_combatant',
      actor_id: '__dm__',
      entity_id: input.entity_id,
      character_id: input.character_id,
      name: input.name,
      combatants: [input],
    })
  ), [sendCommand]);

  const endCombat = useCallback(() => (
    sendCommand({
      type: 'end_combat',
      actor_id: '__dm__',
    })
  ), [sendCommand]);

  return {
    sendProtocolMessage,
    sendCommandBatch,
    sendCommand,
    sendUtilityAction,
    sendAttack,
    sendSpell,
    sendDMOverride,
    sendDMOverrides,
    rollInitiative,
    setInitiative,
    rollDeathSave,
    skipTurn,
    removeCombatant,
    revertLastAction,
    startCombat,
    addCombatant,
    endCombat,
    endTurn,
  };
}
