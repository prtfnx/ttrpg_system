import type { Character } from '@/types';
import { ProtocolService } from '@lib/api';
import { showToast } from '@shared/utils';
import { Dices } from 'lucide-react';
import React from 'react';
import styles from '../CharacterPanel.module.css';

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
const ABILITY_LABEL: Record<string, string> = {
  str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA'
};

function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

function modStr(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

interface QuickActionsProps {
  character: Character;
  isConnected: boolean;
}

export const QuickActions: React.FC<QuickActionsProps> = ({ character, isConnected }) => {
  const abilities = (character.data?.abilityScores || character.data?.abilities || {}) as Record<string, number>;

  const roll = (ability: string) => {
    if (!isConnected || !ProtocolService.hasProtocol()) return;
    const score = abilities[ability] ?? 10;
    const mod = abilityMod(score);
    ProtocolService.getProtocol().rollAbilityCheck(character.id, ability, mod);
    showToast.success(`${ABILITY_LABEL[ability]} check (${modStr(mod)})`);
  };

  return (
    <div className={styles.quickActions}>
      <span className={styles.quickActionsLabel}>
        <Dices size={11} aria-hidden /> Quick Rolls
      </span>
      <div className={styles.quickActionBtns}>
        {ABILITIES.map(ab => {
          const score = abilities[ab] ?? 10;
          const mod = abilityMod(score);
          return (
            <button
              key={ab}
              type="button"
              className={styles.quickRollBtn}
              onClick={() => roll(ab)}
              disabled={!isConnected}
              title={`${ABILITY_LABEL[ab]} check (${modStr(mod)})`}
            >
              <span className={styles.quickRollAbility}>{ABILITY_LABEL[ab]}</span>
              <span className={styles.quickRollMod}>{modStr(mod)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
