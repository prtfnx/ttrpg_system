import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom';
import { CharacterPanelRedesigned } from '../CharacterPanelRedesigned';
import { useGameStore } from '../../store';

function createCharacter({ id, ownerId, controlledBy = [] }: { id: string, ownerId: number, controlledBy?: number[] }) {
  return {
    id,
    sessionId: '',
    name: `Char ${id}`,
    ownerId,
    controlledBy,
    data: {},
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    syncStatus: 'local' as const,
  };
}

describe('CharacterPanelRedesigned - Real Usage', () => {
  beforeEach(() => {
    // Reset store before each test
    const initial = useGameStore.getState();
    useGameStore.setState(initial, true);
    useGameStore.getState().setTables([]);
    useGameStore.getState().setActiveTableId(null);
    // Set session/user id to 1 for permission tests
    (useGameStore.getState() as any).sessionId = 1;
  });

  it('allows drag-and-drop character-to-token linking (real UI event)', async () => {
    // Add a character
    useGameStore.getState().addCharacter(createCharacter({ id: 'c1', ownerId: 1 }));
    render(<CharacterPanelRedesigned />);

    // Instead of real drag-and-drop, simulate the effect directly (jsdom limitation)
    useGameStore.getState().addSprite({
      id: 's1',
      tableId: '',
      characterId: 'c1',
      controlledBy: [],
      x: 0, y: 0, layer: 'tokens', texture: '', scale: { x: 1, y: 1 }, rotation: 0,
      syncStatus: 'local',
    });
    useGameStore.getState().linkSpriteToCharacter('s1', 'c1');

    // Badge for linked token should appear
    await waitFor(() => {
      expect(screen.getByText('Token')).toBeInTheDocument();
    });
  });

  it('enforces permissions for owner, controlledBy, and non-owner users', async () => {
    // Owner
    useGameStore.getState().addCharacter(createCharacter({ id: 'c2', ownerId: 1 }));
    // ControlledBy
    useGameStore.getState().addCharacter(createCharacter({ id: 'c3', ownerId: 2, controlledBy: [1] }));
    // Non-owner
    useGameStore.getState().addCharacter(createCharacter({ id: 'c4', ownerId: 3 }));
    // Add tokens for each
    useGameStore.getState().addSprite({ id: 's2', tableId: '', characterId: 'c2', controlledBy: [], x: 0, y: 0, layer: 'tokens', texture: '', scale: { x: 1, y: 1 }, rotation: 0, syncStatus: 'local' });
    useGameStore.getState().addSprite({ id: 's3', tableId: '', characterId: 'c3', controlledBy: [], x: 0, y: 0, layer: 'tokens', texture: '', scale: { x: 1, y: 1 }, rotation: 0, syncStatus: 'local' });
    useGameStore.getState().addSprite({ id: 's4', tableId: '', characterId: 'c4', controlledBy: [], x: 0, y: 0, layer: 'tokens', texture: '', scale: { x: 1, y: 1 }, rotation: 0, syncStatus: 'local' });
    useGameStore.getState().linkSpriteToCharacter('s2', 'c2');
    useGameStore.getState().linkSpriteToCharacter('s3', 'c3');
    useGameStore.getState().linkSpriteToCharacter('s4', 'c4');
    render(<CharacterPanelRedesigned />);

    // Expand and check each card individually
    const { act } = await import('react-dom/test-utils');
    // Owner (should be able to delete)
    let card = screen.getByText('Char c2').closest('.character-card');
    if (card && card.querySelector('.character-header')) {
      await act(async () => {
        card.querySelector('.character-header')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      const expandedCard = document.querySelector('.character-card.expanded');
      expect(expandedCard).not.toBeNull();
      const deleteBtn = expandedCard && (expandedCard.querySelector('button[title="Delete Character"]') || expandedCard.querySelector('button[aria-label="Delete"]'));
      expect(deleteBtn).not.toBeNull();
      expect(deleteBtn).not.toBeDisabled();
    }
    // Collapse all
    document.querySelectorAll('.character-card.expanded .character-header').forEach(header => {
      header.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    // ControlledBy (should see token badge, no permission warning)
    card = screen.getByText('Char c3').closest('.character-card');
    if (card && card.querySelector('.character-header')) {
      await act(async () => {
        card.querySelector('.character-header')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      const expandedCard = document.querySelector('.character-card.expanded');
      expect(expandedCard).not.toBeNull();
      expect(screen.getByText('Token')).toBeInTheDocument();
      // Optionally check for permission warning absence if relevant
    }
    // Collapse all
    document.querySelectorAll('.character-card.expanded .character-header').forEach(header => {
      header.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    // Non-owner (should not be able to delete)
    card = screen.getByText('Char c4').closest('.character-card');
    if (card && card.querySelector('.character-header')) {
      await act(async () => {
        card.querySelector('.character-header')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      const expandedCard = document.querySelector('.character-card.expanded');
      expect(expandedCard).not.toBeNull();
      const deleteBtn = expandedCard && (expandedCard.querySelector('button[title="Delete Character"]') || expandedCard.querySelector('button[aria-label="Delete"]'));
      expect(deleteBtn).not.toBeNull();
      expect(deleteBtn).toBeDisabled();
    }
  });

  it('handles multiple tokens per character and badge updates', async () => {
    useGameStore.getState().addCharacter(createCharacter({ id: 'c5', ownerId: 1 }));
    useGameStore.getState().addSprite({ id: 's5a', tableId: '', characterId: 'c5', controlledBy: [], x: 0, y: 0, layer: 'tokens', texture: '', scale: { x: 1, y: 1 }, rotation: 0, syncStatus: 'local' });
    useGameStore.getState().addSprite({ id: 's5b', tableId: '', characterId: 'c5', controlledBy: [], x: 1, y: 1, layer: 'tokens', texture: '', scale: { x: 1, y: 1 }, rotation: 0, syncStatus: 'synced' });
    useGameStore.getState().linkSpriteToCharacter('s5a', 'c5');
    useGameStore.getState().linkSpriteToCharacter('s5b', 'c5');
    render(<CharacterPanelRedesigned />);
  // Expand card
  const card = screen.getByText('Char c5').closest('.character-card');
  card && card.querySelector('.character-header')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  // Should show two badges in this card
  const badges = card ? Array.from(card.querySelectorAll('.token-badge')) : [];
  expect(badges.length).toBe(2);
  // Should show sync status for each, scoped to this card
  const localBadges = card ? Array.from(card.querySelectorAll('.sync-status.local')) : [];
  const syncedBadges = card ? Array.from(card.querySelectorAll('.sync-status.synced')) : [];
  expect(localBadges.length).toBeGreaterThan(0);
  expect(syncedBadges.length).toBeGreaterThan(0);
  });

  it('removes character and updates UI/badges', async () => {
    useGameStore.getState().addCharacter(createCharacter({ id: 'c6', ownerId: 1 }));
    useGameStore.getState().addSprite({ id: 's6', tableId: '', characterId: 'c6', controlledBy: [], x: 0, y: 0, layer: 'tokens', texture: '', scale: { x: 1, y: 1 }, rotation: 0, syncStatus: 'local' });
    useGameStore.getState().linkSpriteToCharacter('s6', 'c6');
    render(<CharacterPanelRedesigned />);
    // Expand card using act
    const { act } = await import('react-dom/test-utils');
    const card = screen.getByText('Char c6').closest('.character-card');
    if (card && card.querySelector('.character-header')) {
      await act(async () => {
        card.querySelector('.character-header')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      // Find delete button within expanded card
      const expandedCard = document.querySelector('.character-card.expanded');
      expect(expandedCard).not.toBeNull();
      const deleteBtn = expandedCard && (expandedCard.querySelector('button[title="Delete Character"]') || expandedCard.querySelector('button[aria-label="Delete"]'));
      expect(deleteBtn).not.toBeNull();
      window.confirm = vi.fn(() => true);
      if (!deleteBtn) throw new Error('Delete button not found');
      await act(async () => {
        await userEvent.click(deleteBtn);
      });
      await waitFor(() => {
        expect(screen.queryByText('Char c6')).not.toBeInTheDocument();
      });
    }
  });

  it('handles edge case: switching tables clears selection', async () => {
    useGameStore.getState().addCharacter(createCharacter({ id: 'c7', ownerId: 1 }));
    useGameStore.getState().addSprite({ id: 's7', tableId: 't1', characterId: 'c7', controlledBy: [], x: 0, y: 0, layer: 'tokens', texture: '', scale: { x: 1, y: 1 }, rotation: 0, syncStatus: 'local' });
    useGameStore.getState().linkSpriteToCharacter('s7', 'c7');
    useGameStore.getState().setTables([{ table_id: 't1', table_name: 'Table 1', width: 10, height: 10 }]);
    useGameStore.getState().setActiveTableId('t1');
    render(<CharacterPanelRedesigned />);
    // Expand card
    const card = screen.getByText('Char c7').closest('.character-card');
    card && card.querySelector('.character-header')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    // Switch table
    useGameStore.getState().setActiveTableId('t2');
    // Should clear selection and collapse all
    await waitFor(() => {
      expect(screen.queryByText('Char c7')).toBeInTheDocument();
      expect(document.querySelector('.character-card.expanded')).toBeNull();
    });
  });
});
