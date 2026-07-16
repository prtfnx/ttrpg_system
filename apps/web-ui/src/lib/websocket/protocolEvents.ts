import type { CharacterDraft } from '@features/character/characterDraft';

type ProtocolRecord = Record<string, unknown> | undefined;

export type ProtocolEventMap = {
  'active-table-response': ProtocolRecord;
  'asset-delete-response': ProtocolRecord;
  'asset-downloaded': ProtocolRecord;
  'asset-hash-check': ProtocolRecord;
  'asset-list-updated': ProtocolRecord;
  'asset-uploaded': ProtocolRecord;
  'auth-status-changed': ProtocolRecord;
  'character-delete-response': ProtocolRecord;
  'character-draft-abandoned': ProtocolRecord;
  'character-draft-created': { success: boolean; draft?: CharacterDraft; error?: string };
  'character-draft-finalized': ProtocolRecord;
  'character-draft-list-updated': { success: boolean; drafts?: CharacterDraft[]; error?: string };
  'character-draft-loaded': { success: boolean; draft?: CharacterDraft; error?: string };
  'character-draft-saved': { success: boolean; draft?: CharacterDraft; current_draft?: CharacterDraft; error?: string };
  'character-draft-updated': ProtocolRecord;
  'character-deleted': { character_id: string };
  'character-list-updated': ProtocolRecord;
  'character-loaded': ProtocolRecord;
  'character-log-response': ProtocolRecord;
  'character-roll-result': ProtocolRecord;
  'character-saved': ProtocolRecord;
  'character-update-response': ProtocolRecord;
  'character-updated': ProtocolRecord;
  'compendium-sprite-added': ProtocolRecord;
  'compendium-sprite-removed': ProtocolRecord;
  'compendium-sprite-updated': ProtocolRecord;
  'connection-status-response': ProtocolRecord;
  'file-data-received': ProtocolRecord;
  'new-table-response': ProtocolRecord;
  'paint-stroke-created': ProtocolRecord;
  'paint-stroke-deleted': ProtocolRecord;
  'paint-strokes-cleared': ProtocolRecord;
  'player-action-response': ProtocolRecord;
  'player-action-update': ProtocolRecord;
  'player-ban-response': ProtocolRecord;
  'player-joined': ProtocolRecord;
  'player-kick-response': ProtocolRecord;
  'player-left': ProtocolRecord;
  'player-list-updated': ProtocolRecord;
  'player-role-changed': ProtocolRecord;
  'player-status-changed': ProtocolRecord;
  'protocol-connected': undefined;
  'protocol-error': ProtocolRecord;
  'protocol-send-message': { type: string; data: unknown };
  'protocol-success': ProtocolRecord;
  'protocol-test-received': ProtocolRecord;
  'show-toast': { message: string; type: 'info' | 'success' | 'warning' | 'error' };
  'sprite-action-confirmed': { actionId: unknown };
  'sprite-action-rejected': { actionId: unknown; reason: string };
  'sprite-created': ProtocolRecord;
  'sprite-data-received': ProtocolRecord;
  'sprite-drag-preview-remote': ProtocolRecord;
  'sprite-moved': ProtocolRecord;
  'sprite-removed': ProtocolRecord;
  'sprite-resize-preview-remote': ProtocolRecord;
  'sprite-response': ProtocolRecord;
  'sprite-rotate-preview-remote': ProtocolRecord;
  'sprite-rotated': ProtocolRecord;
  'sprite-scaled': ProtocolRecord;
  'sprite-updated': ProtocolRecord;
  'table-data-received': ProtocolRecord;
  'table-deleted': ProtocolRecord;
  'table-force-switch': { tableId: unknown };
  'table-list-updated': ProtocolRecord;
  'table-response': ProtocolRecord;
  'table-settings-changed': ProtocolRecord;
  'table-updated': ProtocolRecord;
};

export function emitProtocolEvent<K extends keyof ProtocolEventMap>(
  type: K,
  ...args: ProtocolEventMap[K] extends undefined ? [] : [detail: ProtocolEventMap[K]]
): void {
  if (args.length === 0) {
    window.dispatchEvent(new CustomEvent(type));
    return;
  }

  window.dispatchEvent(new CustomEvent(type, { detail: args[0] }));
}

export function onProtocolEvent<K extends keyof ProtocolEventMap>(
  type: K,
  handler: (detail: ProtocolEventMap[K]) => void
): () => void {
  const listener = (event: Event) => {
    handler((event as CustomEvent<ProtocolEventMap[K]>).detail);
  };
  window.addEventListener(type, listener);
  return () => window.removeEventListener(type, listener);
}
