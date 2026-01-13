import { fireEvent, render } from '@testing-library/react';
import { CharacterSheet } from '../CharacterSheetNew';

const makeCharacter = (inventory: any[] = []) => ({
  id: 'char1',
  name: 'Test Fighter',
  data: {
    inventory,
    attunedItems: [],
    abilityScores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    stats: { hp: 10, maxHp: 10, ac: 12, speed: 30, initiative: 2 },
    level: 3,
    class: 'Fighter',
    race: 'Human',
    features: [],
    skills: {},
    savingThrows: {},
    conditions: [],
    bio: ''
  }
});

describe('CharacterSheet equipment drag-drop', () => {
  it('adds equipment on drop', () => {
    const onSave = jest.fn();
    const { getByText, container } = render(
      <CharacterSheet character={makeCharacter()} onSave={onSave} />
    );
    fireEvent.click(getByText('Inventory'));
    const dropArea = container.querySelector('.inventoryTabContent');
    expect(dropArea).toBeTruthy();
    const item = { name: 'Sword of Testing', requiresAttunement: false };
    fireEvent.drop(dropArea!, {
      dataTransfer: {
        getData: () => JSON.stringify({ type: 'equipment', data: item })
      }
    });
    expect(onSave).toHaveBeenCalled();
  });
});