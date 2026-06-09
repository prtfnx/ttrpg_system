import { useGameStore } from '@/store';
import type { Character, Sprite } from '@/types';
import { ProtocolService } from '@lib/api';
import { createMessage, MessageType } from '@lib/websocket';
import { useMemo, useState } from 'react';
import { useCombatStore } from '../stores/combatStore';
import styles from './DMCombatPanel.module.css';

type SpriteWithServerFields = Sprite & {
  table_id?: string;
  character_id?: string;
  sprite_id?: string;
  entity_id?: string;
};

interface LinkedTokenOption {
  spriteId: string;
  characterId: string;
  characterName: string;
  hp: number;
  maxHp: number;
  ac: number;
  movementSpeed: number;
  controlledBy: string[];
}

function stringId(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function buildLinkedTokenOptions(
  sprites: Sprite[],
  characters: Character[],
  activeTableId: string | null,
): LinkedTokenOption[] {
  const charactersById = new Map(characters.map((character) => [character.id, character]));
  const seenSpriteIds = new Set<string>();
  const options: LinkedTokenOption[] = [];

  for (const sprite of sprites as SpriteWithServerFields[]) {
    const tableId = stringId(sprite.tableId) || stringId(sprite.table_id);
    if (activeTableId && tableId !== activeTableId) continue;
    if (sprite.layer !== 'tokens') continue;

    const characterId = stringId(sprite.characterId) || stringId(sprite.character_id);
    const character = charactersById.get(characterId);
    if (!character) continue;

    const spriteId = stringId(sprite.id) || stringId(sprite.sprite_id) || stringId(sprite.entity_id);
    if (!spriteId || seenSpriteIds.has(spriteId)) continue;

    const stats = character.data?.stats ?? {};
    const hp = numberOr(sprite.hp, numberOr(stats.hp, 0));
    const maxHp = numberOr(sprite.maxHp, numberOr(stats.maxHp, hp));

    seenSpriteIds.add(spriteId);
    options.push({
      spriteId,
      characterId,
      characterName: character.name,
      hp,
      maxHp,
      ac: numberOr(sprite.ac, numberOr(stats.ac, 10)),
      movementSpeed: numberOr(stats.speed, 30),
      controlledBy: Array.isArray(sprite.controlledBy) && sprite.controlledBy.length > 0
        ? sprite.controlledBy.map(String)
        : character.controlledBy.map(String),
    });
  }

  return options;
}

function useLinkedTokenOptions(): LinkedTokenOption[] {
  const activeTableId = useGameStore((s) => s.activeTableId);
  const sprites = useGameStore((s) => s.sprites);
  const characters = useGameStore((s) => s.characters);

  return useMemo(
    () => buildLinkedTokenOptions(sprites, characters, activeTableId),
    [activeTableId, characters, sprites],
  );
}

function PreCombatSetup() {
  const send = (type: MessageType, data: Record<string, unknown>) =>
    ProtocolService.getProtocol()?.sendMessage(createMessage(type, data));
  const activeTableId = useGameStore((s) => s.activeTableId);

  const startCombat = () => send(MessageType.COMBAT_START, { table_id: activeTableId ?? 'default' });

  return (
    <div className={styles.panel}>
      <p className={styles.noCombaText}>No active combat.</p>
      <button className={styles.startBtn} onClick={startCombat}>Start Combat</button>
    </div>
  );
}

export function DMCombatPanel() {
  const combat = useCombatStore((s) => s.combat);
  const activeTableId = useGameStore((s) => s.activeTableId);
  const linkedTokenOptions = useLinkedTokenOptions();
  const [selectedId, setSelectedId] = useState('');
  const [hpValue, setHpValue] = useState('');
  const [tempHpValue, setTempHpValue] = useState('');
  const [damageValue, setDamageValue] = useState('');
  const [conditionType, setConditionType] = useState('poisoned');
  const [conditionDuration, setConditionDuration] = useState('1');
  const [resistField, setResistField] = useState('');
  const [vulnField, setVulnField] = useState('');
  const [immuneField, setImmuneField] = useState('');
  const [surprisedIds, setSurprisedIds] = useState<string[]>([]);

  const combatantEntityIds = useMemo(
    () => new Set((combat?.combatants ?? []).map((combatant) => combatant.entity_id)),
    [combat?.combatants],
  );
  const missingLinkedTokenOptions = useMemo(
    () => linkedTokenOptions.filter((option) => !combatantEntityIds.has(option.spriteId)),
    [combatantEntityIds, linkedTokenOptions],
  );

  if (!combat) return <PreCombatSetup />;

  const send = (type: MessageType, data: Record<string, unknown>) =>
    ProtocolService.getProtocol()?.sendMessage(createMessage(type, data));

  const endCombat = () => {
    if (!confirm('End combat? This cannot be undone.')) return;
    send(MessageType.COMBAT_END, {});
  };

  const setHp = () => {
    if (!selectedId || !hpValue) return;
    send(MessageType.DM_SET_HP, { combatant_id: selectedId, hp: Number(hpValue) });
    setHpValue('');
  };

  const setTempHp = () => {
    if (!selectedId || !tempHpValue) return;
    send(MessageType.DM_SET_TEMP_HP, { combatant_id: selectedId, temp_hp: Number(tempHpValue) });
    setTempHpValue('');
  };

  const applyDamage = () => {
    if (!selectedId || !damageValue) return;
    send(MessageType.DM_APPLY_DAMAGE, { combatant_id: selectedId, amount: Number(damageValue) });
    setDamageValue('');
  };

  const addCondition = () => {
    if (!selectedId) return;
    send(MessageType.CONDITION_ADD, {
      combatant_id: selectedId,
      condition_type: conditionType,
      duration: Number(conditionDuration),
      source: 'dm',
    });
  };

  const setResistances = () => {
    if (!selectedId) return;
    const toList = (s: string) => s.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
    send(MessageType.DM_SET_RESISTANCES, {
      combatant_id: selectedId,
      resistances: toList(resistField),
      vulnerabilities: toList(vulnField),
      immunities: toList(immuneField),
    });
  };

  const setSurprised = (surprised: boolean) => {
    if (!surprisedIds.length) return;
    send(MessageType.DM_SET_SURPRISED, { combatant_ids: surprisedIds, surprised });
    setSurprisedIds([]);
  };

  const toggleSurprisedId = (id: string) =>
    setSurprisedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const addTableCombatants = () => {
    for (const option of missingLinkedTokenOptions) {
      send(MessageType.INITIATIVE_ADD, {
        entity_id: option.spriteId,
        character_id: option.characterId,
        name: option.characterName,
        hp: option.hp,
        max_hp: option.maxHp,
        armor_class: option.ac,
        movement_speed: option.movementSpeed,
        controlled_by: option.controlledBy,
      });
    }
  };

  const revertLast = () => send(MessageType.DM_REVERT_ACTION, {});

  return (
    <div className={styles.panel}>
      <div className={styles.combatControls}>
        <button
          className={styles.startBtn}
          onClick={addTableCombatants}
          disabled={missingLinkedTokenOptions.length === 0}
          title="Add linked token characters from the current table"
        >
          Add Table Combatants
        </button>
        <button className={styles.endBtn} onClick={endCombat}>End Combat</button>
        <button className={styles.revertBtn} onClick={revertLast} title="Revert last action">Revert</button>
      </div>

      <div className={styles.section}>
        <select
          className={styles.select}
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          <option value="">— Select combatant —</option>
          {combat.combatants.map((c) => (
            <option key={c.combatant_id} value={c.combatant_id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.section}>
        <label className={styles.label}>Set HP</label>
        <div className={styles.row}>
          <input
            className={styles.input}
            type="number"
            placeholder="HP"
            value={hpValue}
            onChange={(e) => setHpValue(e.target.value)}
          />
          <button className={styles.btn} onClick={setHp}>Set</button>
        </div>
      </div>

      <div className={styles.section}>
        <label className={styles.label}>Temp HP</label>
        <div className={styles.row}>
          <input
            className={styles.input}
            type="number"
            min="0"
            placeholder="Temp HP"
            value={tempHpValue}
            onChange={(e) => setTempHpValue(e.target.value)}
          />
          <button className={styles.btn} onClick={setTempHp}>Set</button>
        </div>
      </div>

      <div className={styles.section}>
        <label className={styles.label}>Apply Damage</label>
        <div className={styles.row}>
          <input
            className={styles.input}
            type="number"
            placeholder="Amount"
            value={damageValue}
            onChange={(e) => setDamageValue(e.target.value)}
          />
          <button className={styles.btn} onClick={applyDamage}>Apply</button>
        </div>
      </div>

      <div className={styles.section}>
        <label className={styles.label}>Add Condition</label>
        <div className={styles.row}>
          <select
            className={styles.select}
            value={conditionType}
            onChange={(e) => setConditionType(e.target.value)}
          >
            {['poisoned','blinded','stunned','paralyzed','charmed','frightened','grappled','prone','restrained','exhaustion','incapacitated','unconscious','concentration'].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <input
            className={styles.input}
            type="number"
            min="1"
            placeholder="Rounds"
            value={conditionDuration}
            onChange={(e) => setConditionDuration(e.target.value)}
          />
          <button className={styles.btn} onClick={addCondition}>Add</button>
        </div>
      </div>

      <div className={styles.section}>
        <label className={styles.label}>Resistances (comma-separated damage types)</label>
        <input className={styles.input} placeholder="fire, cold..." value={resistField} onChange={(e) => setResistField(e.target.value)} />
        <label className={styles.label}>Vulnerabilities</label>
        <input className={styles.input} placeholder="thunder..." value={vulnField} onChange={(e) => setVulnField(e.target.value)} />
        <label className={styles.label}>Immunities</label>
        <input className={styles.input} placeholder="poison..." value={immuneField} onChange={(e) => setImmuneField(e.target.value)} />
        <button className={styles.btn} onClick={setResistances}>Set</button>
      </div>

      <div className={styles.section}>
        <label className={styles.label}>Surprise Round — mark surprised</label>
        <div className={styles.checkList}>
          {combat.combatants.map((c) => (
            <label key={c.combatant_id} className={styles.checkItem}>
              <input
                type="checkbox"
                checked={surprisedIds.includes(c.combatant_id)}
                onChange={() => toggleSurprisedId(c.combatant_id)}
              />
              {c.name}
            </label>
          ))}
        </div>
        <div className={styles.row}>
          <button className={styles.btn} onClick={() => setSurprised(true)}>Set Surprised</button>
          <button className={styles.btn} onClick={() => setSurprised(false)}>Clear</button>
        </div>
      </div>

      {/* ── Difficult Terrain ── */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>Difficult Terrain</h4>
        <p className={styles.hint}>Mark cells as difficult terrain on the canvas, or clear all.</p>
        <div className={styles.row}>
          <button className={styles.btn} onClick={() =>
            ProtocolService.getProtocol()?.sendMessage(
              createMessage(MessageType.DM_SET_TERRAIN, { table_id: activeTableId, mode: 'clear', cells: [] })
            )
          }>Clear All</button>
        </div>
      </div>
    </div>
  );
}
