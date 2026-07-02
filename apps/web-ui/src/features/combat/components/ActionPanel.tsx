import { useGameStore } from '@/store';
import { isDM } from '@features/session/types/roles';
import { Eye, Footprints, Handshake, LogOut, Shield, Swords, Zap } from 'lucide-react';
import { useState } from 'react';
import type { CombatCommandType } from '../hooks/useCombatCommands';
import { useCombatCommands } from '../hooks/useCombatCommands';
import { useCombatStore } from '../stores/combatStore';
import { usePlanningStore } from '../stores/planningStore';
import styles from './ActionPanel.module.css';

interface ActionPanelProps {
  onSelectTarget?: (action: 'attack' | 'help') => void;
}

function plannedActionId(prefix: string): string {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}`;
}

export function ActionPanel({ onSelectTarget }: ActionPanelProps) {
  const combat = useCombatStore((s) => s.combat);
  const userId = useGameStore((s) => s.userId);
  const role = useGameStore((s) => s.sessionRole);
  const dmMode = isDM(role);
  const activeTableId = useGameStore((s) => s.activeTableId);
  const { sendAttack, sendSpell, sendUtilityAction } = useCombatCommands();
  const isPlanningMode = usePlanningStore((s) => s.isPlanningMode);
  const addAction = usePlanningStore((s) => s.addAction);
  const [targetId, setTargetId] = useState('');
  const [spellName, setSpellName] = useState('Magic Missile');
  const [spellLevel, setSpellLevel] = useState('1');
  const [spellDamage, setSpellDamage] = useState('1d4');

  if (!combat || combat.phase !== 'active') return null;

  const active = combat.combatants.filter((c) => !c.is_defeated);
  const current = active[combat.current_turn_index % Math.max(active.length, 1)];

  if (
    !current
    || (!dmMode && (userId === null || !current.controlled_by.includes(String(userId))))
  ) {
    return null;
  }

  const targets = active.filter((combatant) => combatant.combatant_id !== current.combatant_id);
  const selectedTargetId = targetId || targets[0]?.combatant_id || '';
  const availableSpellLevels = Object.entries(current.spell_slots ?? {})
    .filter(([, slots]) => Number(slots) > 0)
    .map(([level]) => level)
    .sort((a, b) => Number(a) - Number(b));
  const selectedSpellLevel = availableSpellLevels.includes(spellLevel)
    ? spellLevel
    : availableSpellLevels[0] ?? spellLevel;

  const sendCommand = (commandType: CombatCommandType) => {
    sendUtilityAction(current.combatant_id, commandType);
  };

  const attackTarget = () => {
    if (!selectedTargetId) return;
    onSelectTarget?.('attack');
    if (isPlanningMode) {
      const target = targets.find((combatant) => combatant.combatant_id === selectedTargetId);
      addAction({
        id: plannedActionId('attack'),
        action_type: 'attack',
        label: `Attack ${target?.name ?? 'target'}`,
        actor_id: current.combatant_id,
        table_id: activeTableId ?? combat.table_id,
        target_id: selectedTargetId,
        cost_type: 'action',
      });
      return;
    }
    sendAttack({
      actorId: current.combatant_id,
      targetId: selectedTargetId,
      tableId: activeTableId ?? combat.table_id,
    });
  };

  const castSpell = () => {
    if (!selectedTargetId || !selectedSpellLevel || !spellName.trim()) return;
    if (isPlanningMode) {
      addAction({
        id: plannedActionId('spell'),
        action_type: 'cast_spell',
        label: `Cast ${spellName.trim()}`,
        actor_id: current.combatant_id,
        target_ids: [selectedTargetId],
        spell_name: spellName.trim(),
        spell_level: Number(selectedSpellLevel),
        damage_formula: spellDamage.trim(),
        damage_type: 'fire',
        save_dc: current.spell_save_dc ?? 0,
        attack_bonus: current.spell_attack_bonus ?? 0,
        cost_type: 'action',
      });
      return;
    }
    sendSpell({
      actorId: current.combatant_id,
      spellName: spellName.trim(),
      spellLevel: Number(selectedSpellLevel),
      targetIds: [selectedTargetId],
      damageFormula: spellDamage.trim(),
    });
  };

  const noAction = !current.has_action;
  const noTarget = !selectedTargetId;

  return (
    <div className={styles.panel}>
      <div className={styles.title}>{dmMode ? 'Active Actor' : 'Your Turn'} - {current.name}</div>
      {targets.length > 0 && (
        <label className={styles.field}>
          <span>Target</span>
          <select
            className={styles.select}
            value={selectedTargetId}
            onChange={(event) => setTargetId(event.target.value)}
          >
            {targets.map((target) => (
              <option key={target.combatant_id} value={target.combatant_id}>{target.name}</option>
            ))}
          </select>
        </label>
      )}
      <div className={styles.grid}>
        <button
          className={styles.btn}
          disabled={noAction || noTarget}
          onClick={attackTarget}
          title="Attack (action)"
        >
          <Swords size={14} aria-hidden /> Attack
        </button>
        <button
          className={styles.btn}
          disabled={noAction}
          onClick={() => sendCommand('dash')}
          title="Dash: double movement (action)"
        >
          <Zap size={14} aria-hidden /> Dash
        </button>
        <button
          className={styles.btn}
          disabled={noAction}
          onClick={() => sendCommand('dodge')}
          title="Dodge: attackers have disadvantage (action)"
        >
          <Shield size={14} aria-hidden /> Dodge
        </button>
        <button
          className={styles.btn}
          disabled={noAction}
          onClick={() => sendCommand('disengage')}
          title="Disengage: move without provoking OAs (action)"
        >
          <Footprints size={14} aria-hidden /> Disengage
        </button>
        <button
          className={styles.btn}
          disabled={noAction}
          onClick={() => onSelectTarget?.('help')}
          title="Help: give ally advantage (action)"
        >
          <Handshake size={14} aria-hidden /> Help
        </button>
        <button
          className={styles.btn}
          disabled={noAction}
          onClick={() => sendCommand('hide')}
          title="Hide: Stealth check (action)"
        >
          <Eye size={14} aria-hidden /> Hide
        </button>
        <button
          className={[styles.btn, styles.btnEnd].join(' ')}
          onClick={() => sendCommand('end_turn')}
          title="End your turn"
        >
          <LogOut size={14} aria-hidden /> End Turn
        </button>
      </div>
      {availableSpellLevels.length > 0 && (
        <div className={styles.spellBox}>
          <label className={styles.field}>
            <span>Spell</span>
            <input
              className={styles.input}
              value={spellName}
              onChange={(event) => setSpellName(event.target.value)}
            />
          </label>
          <div className={styles.row}>
            <label className={styles.field}>
              <span>Slot</span>
              <select
                className={styles.select}
                value={selectedSpellLevel}
                onChange={(event) => setSpellLevel(event.target.value)}
              >
                {availableSpellLevels.map((level) => (
                  <option key={level} value={level}>L{level}</option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Damage</span>
              <input
                className={styles.input}
                value={spellDamage}
                onChange={(event) => setSpellDamage(event.target.value)}
              />
            </label>
          </div>
          <button
            className={styles.btn}
            disabled={noAction || noTarget || !spellName.trim()}
            onClick={castSpell}
            title="Cast spell (action)"
          >
            <Zap size={14} aria-hidden /> Cast Spell
          </button>
        </div>
      )}
    </div>
  );
}
