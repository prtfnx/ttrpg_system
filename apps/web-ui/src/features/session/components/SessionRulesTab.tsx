import { useGameStore } from '@/store';
import type { SessionRules } from '@features/combat/stores/sessionRulesStore';
import { useSessionRulesStore } from '@features/combat/stores/sessionRulesStore';
import { ProtocolService } from '@lib/api';
import { createMessage, MessageType } from '@lib/websocket';
import { isDM } from '../types/roles';

function Toggle({ label, field, draft, update }: {
  label: string;
  field: keyof SessionRules;
  draft: Partial<SessionRules>;
  update: (patch: Partial<SessionRules>) => void;
}) {
  const rules = useSessionRulesStore((s) => s.rules);
  const value = field in draft ? draft[field] : rules?.[field];
  return (
    <label className="rules-toggle">
      <input
        type="checkbox"
        checked={Boolean(value)}
        onChange={(e) => update({ [field]: e.target.checked } as Partial<SessionRules>)}
      />
      {label}
    </label>
  );
}

function NumberInput({ label, field, draft, update, min, max }: {
  label: string;
  field: keyof SessionRules;
  draft: Partial<SessionRules>;
  update: (patch: Partial<SessionRules>) => void;
  min?: number;
  max?: number;
}) {
  const rules = useSessionRulesStore((s) => s.rules);
  const value = field in draft ? draft[field] : rules?.[field];
  return (
    <label className="rules-input">
      {label}
      <input
        type="number"
        value={Number(value ?? 0)}
        min={min}
        max={max}
        onChange={(e) => update({ [field]: Number(e.target.value) } as Partial<SessionRules>)}
      />
    </label>
  );
}

function Select<T extends string>({ label, field, options, draft, update }: {
  label: string;
  field: keyof SessionRules;
  options: { value: T; label: string }[];
  draft: Partial<SessionRules>;
  update: (patch: Partial<SessionRules>) => void;
}) {
  const rules = useSessionRulesStore((s) => s.rules);
  const value = (field in draft ? draft[field] : rules?.[field]) as T;
  return (
    <label className="rules-input">
      {label}
      <select value={value ?? ''} onChange={(e) => update({ [field]: e.target.value as T } as Partial<SessionRules>)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function SessionRulesTab() {
  const isDirty = useSessionRulesStore((s) => s.isDirty);
  const draft = useSessionRulesStore((s) => s.draft);
  const update = useSessionRulesStore((s) => s.updateDraft);
  const reset = useSessionRulesStore((s) => s.resetDraft);
  const role = useGameStore((s) => s.sessionRole);

  const save = () => {
    const proto = ProtocolService.getProtocol();
    proto?.sendMessage(createMessage(MessageType.SESSION_RULES_UPDATE, { rules: draft }));
    reset();
  };

  return (
    <div className="session-rules-tab">
      <h3>Session Rules</h3>

      <section>
        <h4>Movement</h4>
        <NumberInput label="Speed (ft)" field="default_movement_speed" draft={draft} update={update} min={0} />
        <Toggle label="Walls block movement" field="walls_block_movement" draft={draft} update={update} />
        <Toggle label="Obstacles block movement" field="obstacles_block_movement" draft={draft} update={update} />
        <Toggle label="Enforce movement speed" field="enforce_movement_speed" draft={draft} update={update} />
        <Toggle label="Enforce line of sight" field="enforce_line_of_sight" draft={draft} update={update} />
        <Select
          label="Movement precision"
          field="movement_mode"
          options={[
            { value: 'cell', label: 'Cell-snapped (combat/explore)' },
            { value: 'free', label: 'Free pixel (free roam)' },
          ]}
          draft={draft}
          update={update}
        />
        <Select
          label="Server validation"
          field="server_validation_tier"
          options={[
            { value: 'trust_client', label: 'Trust client (fastest, no collision)' },
            { value: 'lightweight', label: 'Lightweight (segment check, no A*)' },
            { value: 'full', label: 'Full (server A* pathfinding)' },
          ]}
          draft={draft}
          update={update}
        />
      </section>

      <section>
        <h4>Turns &amp; Actions</h4>
        <NumberInput label="Actions per turn" field="actions_per_turn" draft={draft} update={update} min={0} />
        <NumberInput label="Bonus actions per turn" field="bonus_actions_per_turn" draft={draft} update={update} min={0} />
        <NumberInput label="Reactions per turn" field="reactions_per_turn" draft={draft} update={update} min={0} />
        <Toggle label="Allow players to end turn" field="allow_player_end_turn" draft={draft} update={update} />
      </section>

      <section>
        <h4>Combat</h4>
        <Toggle label="Death saving throws" field="death_saves_enabled" draft={draft} update={update} />
        <Toggle label="Massive damage rule" field="massive_damage_rule" draft={draft} update={update} />
        <Toggle label="Enforce spell slots" field="enforce_spell_slots" draft={draft} update={update} />
        <Toggle label="Enforce range" field="enforce_range" draft={draft} update={update} />
        <Toggle label="Enforce cover" field="enforce_cover" draft={draft} update={update} />
        <Toggle label="Enforce difficult terrain" field="enforce_difficult_terrain" draft={draft} update={update} />
        <Toggle label="Opportunity attacks" field="opportunity_attacks_enabled" draft={draft} update={update} />
        <NumberInput label="OA reaction timeout (sec)" field="opportunity_attack_timeout_sec" draft={draft} update={update} min={5} max={120} />
      </section>

      <section>
        <h4>NPC Visibility</h4>
        <Toggle label="Show NPC AC to players" field="show_npc_ac_to_players" draft={draft} update={update} />
        <Toggle label="Show NPC conditions" field="show_npc_conditions" draft={draft} update={update} />
      </section>

      {isDM(role) && (
        <div className="rules-actions">
          <button onClick={save} disabled={!isDirty}>Save Rules</button>
          <button onClick={reset} disabled={!isDirty}>Reset</button>
        </div>
      )}
    </div>
  );
}
