import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { FormProvider, useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import { IdentityStep } from '../IdentityStep';

vi.mock('@features/character', () => ({
  ALL_TEMPLATES: [
    { id: 'tpl-pc', type: 'pc', name: 'Adventurer', data: { name: 'Aria', bio: 'A hero' } },
    { id: 'tpl-npc', type: 'npc', name: 'Goblin', data: { name: 'Grubb', bio: '' } },
  ],
}));

function Wrapper({ onNext = vi.fn(), onBack = vi.fn(), defaults = {} }) {
  const methods = useForm<{ name: string; bio?: string; image?: string; alignment?: string }>({
    defaultValues: { name: '', bio: '', image: '', alignment: '', ...defaults },
  });
  return (
    <FormProvider {...methods}>
      <IdentityStep onNext={onNext} onBack={onBack} />
    </FormProvider>
  );
}

describe('IdentityStep', () => {
  it('renders all main fields', () => {
    render(<Wrapper />);
    expect(screen.getByPlaceholderText('Enter character name...')).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Describe your character's backstory...")).toBeInTheDocument();
    expect(screen.getByText('— Choose alignment —')).toBeInTheDocument();
  });

  it('renders PC and NPC template options', () => {
    render(<Wrapper />);
    expect(screen.getByRole('option', { name: 'Adventurer' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Goblin' })).toBeInTheDocument();
  });

  it('shows portrait placeholder when no image', () => {
    render(<Wrapper />);
    expect(screen.getByText('No image')).toBeInTheDocument();
  });

  it('shows Upload Image button initially', () => {
    render(<Wrapper />);
    expect(screen.getByRole('button', { name: 'Upload Image' })).toBeInTheDocument();
  });

  it('renders alignment options', () => {
    render(<Wrapper />);
    const select = screen.getByDisplayValue('— Choose alignment —');
    expect(select).toBeInTheDocument();
  });

  it('shows Character Identity heading', () => {
    render(<Wrapper />);
    expect(screen.getByText('Character Identity')).toBeInTheDocument();
  });

  it('calls onNext when form submits with a name', async () => {
    const onNext = vi.fn();
    render(<Wrapper onNext={onNext} />);
    const input = screen.getByPlaceholderText('Enter character name...');
    fireEvent.change(input, { target: { value: 'Brynn' } });
    fireEvent.submit(input.closest('form')!);
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('does not call onNext when name is empty', () => {
    const onNext = vi.fn();
    render(<Wrapper onNext={onNext} />);
    fireEvent.submit(screen.getByPlaceholderText('Enter character name...').closest('form')!);
    expect(onNext).not.toHaveBeenCalled();
  });

  it('typing populates the bio textarea', () => {
    render(<Wrapper />);
    const bio = screen.getByPlaceholderText("Describe your character's backstory...");
    fireEvent.change(bio, { target: { value: 'A wandering mercenary' } });
    expect(bio).toHaveValue('A wandering mercenary');
  });
});
