import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormProvider, useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import FeatSelectionStep from '../FeatSelectionStep';

function Harness() {
  const form = useForm({
    defaultValues: {
      character_class: 'Fighter',
      subclass: '',
      level: 4,
      race: 'Human',
      ability_scores: {
        Strength: 14,
        Dexterity: 14,
        Constitution: 14,
        Intelligence: 12,
        Wisdom: 12,
        Charisma: 10,
      },
      feats: [],
      feat_choices: [],
    },
  });

  return (
    <FormProvider {...form}>
      <FeatSelectionStep onNext={vi.fn()} onBack={vi.fn()} />
    </FormProvider>
  );
}

describe('FeatSelectionStep', () => {
  it('exposes styled feat cards as keyboard-selectable controls', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const featChoice = screen.getByRole('button', { name: 'Take a Feat' });
    await user.click(featChoice);
    expect(featChoice).toHaveAttribute('aria-pressed', 'true');

    const alertFeat = screen.getAllByRole('button', { name: /Alert/ })[0];
    expect(alertFeat.className).toBeTruthy();
    expect(alertFeat).toHaveAttribute('aria-pressed', 'false');

    alertFeat.focus();
    await user.keyboard('{Enter}');
    expect(alertFeat).toHaveAttribute('aria-pressed', 'true');
  });
});
