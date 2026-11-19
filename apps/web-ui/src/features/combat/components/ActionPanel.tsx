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
  const { sendAttack, sendSpell, sendUtilityAction } = useCombatCommands();
  const isPlanningMode = usePlanningStore((s) => s.isPlanningMode);
  const addAction = usePlanningStore((s) => s.addAction);
  const [targetId, setTargetId] = useState('');
  const [attackId, setAttackId] = useState('');
  const [spellId, setSpellId] = useState('');
  const [manualMode, setManualMode] = useState(false);
  const [spellName, setSpellName] = useState('Manual damage');
  const [spellLevel, setSpellLevel] = useState('1');
  const [spellDamage, setSpellDamage] = useState('1d4');
  const [damageType, setDamageType] = useState('bludgeoning');
  const [rangeFt, setRangeFt] = useState(5);
  const [attackBonus, setAttackBonus] = useState(0);

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
  const selectedTargetId = targets.some((target) => target.combatant_id === targetId)
    ? targetId : targets[0]?.combatant_id || '';
  const manual = dmMode && manualMode;
  const attacks = (current.available_actions ?? []).filter((action) => action.kind === 'attack');
  const spells = (current.available_actions ?? []).filter((action) => action.kind === 'spell');
  const attack = attacks.find((action) => action.action_id === attackId) ?? attacks[0];
  const spell = spells.find((action) => action.action_id === spellId) ?? spells[0];
  const spellHasSlot = spell && (spell.spell_level === 0 || Number(current.spell_slots?.[spell.spell_level]) > 0);
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
    if (!selectedTargetId || (!manual && !attack)) return;
    onSelectTarget?.('attack');
    if (isPlanningMode) {
      const target = targets.find((combatant) => combatant.combatant_id === selectedTargetId);
      addAction({
        id: plannedActionId('attack'),
        action_type: 'attack',
        label: `Attack ${target?.name ?? 'target'}`,
        actor_id: current.combatant_id,
        table_id: combat.table_id,
        action_id: manual ? undefined : attack?.action_id,
        manual,
        ...(manual ? { damage_formula: spellDamage.trim(), damage_type: damageType, range_ft: rangeFt, attack_bonus: attackBonus } : {}),
        target_id: selectedTargetId,
        cost_type: 'action',
      });
      return;
    }
    sendAttack({
      actorId: current.combatant_id,
      targetId: selectedTargetId,
      tableId: combat.table_id,
      actionId: manual ? undefined : attack?.action_id,
      manual,
      damageFormula: spellDamage.trim(), damageType, rangeFt, attackBonus,
    });
  };

  const castSpell = () => {
    if (!selectedTargetId || (manual ? !selectedSpellLevel || !spellName.trim() : !spellHasSlot)) return;
    const name = manual ? spellName.trim() : spell!.name;
    if (isPlanningMode) {
      addAction({
        id: plannedActionId('spell'),
        action_type: 'cast_spell',
        label: `Cast ${name}`,
        table_id: combat.table_id,
        action_id: manual ? undefined : spell?.action_id,
        manual,
        effect: manual ? 'automatic' : undefined,
        actor_id: current.combatant_id,
        target_ids: [selectedTargetId],
        spell_name: name,
        spell_level: manual ? Number(selectedSpellLevel) : spell?.spell_level,
        ...(manual ? { damage_formula: spellDamage.trim(), damage_type: damageType, range_ft: rangeFt } : {}),
        cost_type: 'action',
      });
      return;
    }
    sendSpell({
      actorId: current.combatant_id,
      actionId: manual ? undefined : spell?.action_id,
      manual,
      effect: manual ? 'automatic' : undefined,
      tableId: combat.table_id,
      spellName: name,
      spellLevel: Number(selectedSpellLevel),
      targetIds: [selectedTargetId],
      damageFormula: spellDamage.trim(),
      damageType, rangeFt,
    });
  };

  const noAction = !current.has_action || current.hp === 0;
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
      {dmMode && (
        <label className={styles.field}>
          <input type="checkbox" checked={manual} onChange={(event) => setManualMode(event.target.checked)} />
          Manual damage (DM)
        </label>
      )}
      {manual && <div className={styles.spellBox}>
        <label className={styles.field}>
          <span>Damage formula</span>
          <input className={styles.input} value={spellDamage} onChange={(event) => setSpellDamage(event.target.value)} />
        </label>
        <label className={styles.field}>
          <span>Damage type</span>
          <select className={styles.select} value={damageType} onChange={(event) => setDamageType(event.target.value)}>
            {['acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder'].map((type) => <option key={type}>{type}</option>)}
          </select>
        </label>
        <label className={styles.field}>
          <span>Range (ft)</span>
          <input className={styles.input} type="number" min="1" max="100000" value={rangeFt} onChange={(event) => setRangeFt(Number(event.target.value))} />
        </label>
        <label className={styles.field}>
          <span>Attack bonus</span>
          <input className={styles.input} type="number" min="-100" max="100" value={attackBonus} onChange={(event) => setAttackBonus(Number(event.target.value))} />
        </label>
      </div>}
      {!manual && attacks.length > 0 && (
        <label className={styles.field}>
          <span>Attack definition</span>
          <select className={styles.select} value={attack?.action_id} onChange={(event) => setAttackId(event.target.value)}>
            {attacks.map((action) => <option key={action.action_id} value={action.action_id}>{action.name}</option>)}
          </select>
        </label>
      )}
      {!manual && (!attacks.length || !spells.length) && (
        <p>Missing attacks or spells require DM manual resolution. Other effects use DM Overrides.</p>
      )}
      <div className={styles.grid}>
        <button
          className={styles.btn}
          disabled={noAction || noTarget || (!manual && !attack)}
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
      {(manual ? availableSpellLevels.length > 0 : spells.length > 0) && (
        <div className={styles.spellBox}>
          <label className={styles.field}>
            <span>Spell</span>
            {manual ? <input
              className={styles.input}
              value={spellName}
              onChange={(event) => setSpellName(event.target.value)}
            /> : <select className={styles.select} value={spell?.action_id} onChange={(event) => setSpellId(event.target.value)}>
              {spells.map((action) => <option key={action.action_id} value={action.action_id}>{action.name} (L{action.spell_level})</option>)}
            </select>}
          </label>
          {manual && <div className={styles.row}>
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

          </div>}
          <button
            className={styles.btn}
            disabled={noAction || noTarget || (manual ? !spellName.trim() : !spellHasSlot)}
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
