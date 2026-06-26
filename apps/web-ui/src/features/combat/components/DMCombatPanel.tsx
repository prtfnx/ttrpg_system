import { useGameStore } from '@/store';
import type { Character, Sprite } from '@/types';
import { MessageType } from '@lib/websocket';
import { useMemo, useState } from 'react';
import { useCombatCommands } from '../hooks/useCombatCommands';
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
  if (!activeTableId) return [];

  const charactersById = new Map(characters.map((character) => [character.id, character]));
  const seenSpriteIds = new Set<string>();
  const options: LinkedTokenOption[] = [];

  for (const sprite of sprites as SpriteWithServerFields[]) {
    const tableId = stringId(sprite.tableId) || stringId(sprite.table_id);
    if (tableId !== activeTableId) continue;
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

function buildCombatantPayload(option: LinkedTokenOption): Record<string, unknown> {
  return {
    entity_id: option.spriteId,
    character_id: option.characterId,
    name: option.characterName,
    hp: option.hp,
    max_hp: option.maxHp,
    armor_class: option.ac,
    movement_speed: option.movementSpeed,
    controlled_by: option.controlledBy,
    is_npc: option.controlledBy.length === 0,
  };
}

function buildCombatStartData(activeTableId: string | null, options: LinkedTokenOption[]) {
  return {
    table_id: activeTableId ?? 'default',
    entity_ids: options.map((option) => option.spriteId),
    names: Object.fromEntries(options.map((option) => [option.spriteId, option.characterName])),
    combatants: options.map(buildCombatantPayload),
  };
}

function PreCombatSetup() {
  const { sendProtocolMessage } = useCombatCommands();
  const activeTableId = useGameStore((s) => s.activeTableId);
  const linkedTokenOptions = useLinkedTokenOptions();

  const startCombat = () =>
    sendProtocolMessage(MessageType.COMBAT_START, buildCombatStartData(activeTableId, linkedTokenOptions));
  const startEmptyCombat = () =>
    sendProtocolMessage(MessageType.COMBAT_START, { table_id: activeTableId ?? 'default' });

  return (
    <div className={styles.panel}>
      <p className={styles.noCombaText}>No active combat.</p>
      <div className={styles.rosterSummary}>
        <span>Current table linked tokens</span>
        <strong>{linkedTokenOptions.length}</strong>
      </div>
      {linkedTokenOptions.length > 0 && (
        <div className={styles.eligibleList}>
          {linkedTokenOptions.map((option) => (
            <span key={option.spriteId}>{option.characterName}</span>
          ))}
        </div>
      )}
      <div className={styles.setupActions}>
        <button
          className={styles.startBtn}
          onClick={startCombat}
          disabled={linkedTokenOptions.length === 0}
          title="Start combat and add linked token characters from the current table"
        >
          Start with Table Tokens ({linkedTokenOptions.length})
        </button>
        <button className={styles.secondaryBtn} onClick={startEmptyCombat}>
          Start Empty
        </button>
      </div>
    </div>
  );
}

export function DMCombatPanel() {
  const combat = useCombatStore((s) => s.combat);
  const activeTableId = useGameStore((s) => s.activeTableId);
  const { sendProtocolMessage } = useCombatCommands();
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
  const [combatantAddStatus, setCombatantAddStatus] = useState('');

  const combatantEntityIds = useMemo(
    () => new Set((combat?.combatants ?? []).map((combatant) => combatant.entity_id)),
    [combat?.combatants],
  );
  const missingLinkedTokenOptions = useMemo(
    () => linkedTokenOptions.filter((option) => !combatantEntityIds.has(option.spriteId)),
    [combatantEntityIds, linkedTokenOptions],
  );
  const linkedTokenBySpriteId = useMemo(
    () => new Map(linkedTokenOptions.map((option) => [option.spriteId, option])),
    [linkedTokenOptions],
  );
  const tableCombatantsAlreadyAdded = linkedTokenOptions.length - missingLinkedTokenOptions.length;

  if (!combat) return <PreCombatSetup />;

  const endCombat = () => {
    if (!confirm('End combat? This cannot be undone.')) return;
    sendProtocolMessage(MessageType.COMBAT_END, {});
  };

  const setHp = () => {
    if (!selectedId || !hpValue) return;
    sendProtocolMessage(MessageType.DM_SET_HP, { combatant_id: selectedId, hp: Number(hpValue) });
    setHpValue('');
  };

  const setTempHp = () => {
    if (!selectedId || !tempHpValue) return;
    sendProtocolMessage(MessageType.DM_SET_TEMP_HP, { combatant_id: selectedId, temp_hp: Number(tempHpValue) });
    setTempHpValue('');
  };

  const applyDamage = () => {
    if (!selectedId || !damageValue) return;
    sendProtocolMessage(MessageType.DM_APPLY_DAMAGE, { combatant_id: selectedId, amount: Number(damageValue) });
    setDamageValue('');
  };

  const addCondition = () => {
    if (!selectedId) return;
    sendProtocolMessage(MessageType.CONDITION_ADD, {
      combatant_id: selectedId,
      condition_type: conditionType,
      duration: Number(conditionDuration),
      source: 'dm',
    });
  };

  const setResistances = () => {
    if (!selectedId) return;
    const toList = (s: string) => s.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
    sendProtocolMessage(MessageType.DM_SET_RESISTANCES, {
      combatant_id: selectedId,
      resistances: toList(resistField),
      vulnerabilities: toList(vulnField),
      immunities: toList(immuneField),
    });
  };

  const setSurprised = (surprised: boolean) => {
    if (!surprisedIds.length) return;
    sendProtocolMessage(MessageType.DM_SET_SURPRISED, { combatant_ids: surprisedIds, surprised });
    setSurprisedIds([]);
  };

  const toggleSurprisedId = (id: string) =>
    setSurprisedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const addTableCombatants = () => {
    if (missingLinkedTokenOptions.length === 0) {
      setCombatantAddStatus('All current table linked tokens are already in combat.');
      return;
    }

    for (const option of missingLinkedTokenOptions) {
      sendProtocolMessage(MessageType.INITIATIVE_ADD, buildCombatantPayload(option));
    }
    setCombatantAddStatus(`Queued ${missingLinkedTokenOptions.length} table combatant${missingLinkedTokenOptions.length === 1 ? '' : 's'}.`);
  };

  const revertLast = () => sendProtocolMessage(MessageType.DM_REVERT_ACTION, {});

  return (
    <div className={styles.panel}>
      <div className={styles.combatControls}>
        <button
          className={styles.startBtn}
          onClick={addTableCombatants}
          disabled={missingLinkedTokenOptions.length === 0}
          title="Add linked token characters from the current table"
        >
          Add Missing ({missingLinkedTokenOptions.length})
        </button>
        <button className={styles.endBtn} onClick={endCombat}>End Combat</button>
        <button className={styles.revertBtn} onClick={revertLast} title="Revert last action">Revert</button>
      </div>

      <div className={styles.section}>
        <div className={styles.rosterSummary}>
          <span>Current table linked tokens</span>
          <strong>{linkedTokenOptions.length}</strong>
          <span>Already in combat</span>
          <strong>{tableCombatantsAlreadyAdded}</strong>
        </div>
        {missingLinkedTokenOptions.length > 0 ? (
          <div className={styles.eligibleList}>
            {missingLinkedTokenOptions.map((option) => (
              <span key={option.spriteId}>{option.characterName}</span>
            ))}
          </div>
        ) : (
          <p className={styles.hint}>No missing linked token characters on the current table.</p>
        )}
        {combatantAddStatus && <p className={styles.hint}>{combatantAddStatus}</p>}
      </div>

      <div className={styles.section}>
        <select
          className={styles.select}
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          <option value="">Select combatant</option>
          {combat.combatants.map((c) => (
            <option key={c.combatant_id} value={c.combatant_id}>
              {linkedTokenBySpriteId.get(c.entity_id)?.characterName ?? c.name}
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
        <label className={styles.label}>Surprise Round - mark surprised</label>
        <div className={styles.checkList}>
          {combat.combatants.map((c) => (
            <label key={c.combatant_id} className={styles.checkItem}>
              <input
                type="checkbox"
                checked={surprisedIds.includes(c.combatant_id)}
                onChange={() => toggleSurprisedId(c.combatant_id)}
              />
              {linkedTokenBySpriteId.get(c.entity_id)?.characterName ?? c.name}
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
            sendProtocolMessage(MessageType.DM_SET_TERRAIN, { table_id: activeTableId, mode: 'clear', cells: [] })
          }>Clear All</button>
        </div>
      </div>
    </div>
  );
}
