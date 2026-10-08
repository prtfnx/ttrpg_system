import { useGameStore } from '@/store';
import { useOptionalProtocol } from '@app/providers';
import { canInteract } from '@features/session/types/roles';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { saveTextSprite, type TextSpriteCommand } from './textSpriteCommands';
import { DEFAULT_TEXT, parseTextSpriteMetadata, type TextSpriteDescriptor } from './textSpriteModel';
import styles from './TextSpriteTool.module.css';

interface TextSpriteToolProps {
  activeLayer: string;
  activeTool: string | null;
  onSpriteCreated?: (spriteId: string) => void;
  onError?: (error: Error) => void;
}

/** Text is a normal authoritative sprite, with a local, cancellable authoring form. */
export function TextSpriteTool({ activeLayer, activeTool, onSpriteCreated, onError }: TextSpriteToolProps) {
  const protocol = useOptionalProtocol()?.protocol ?? null;
  const activeTableId = useGameStore(state => state.activeTableId);
  const actorId = useGameStore(state => state.userId);
  const role = useGameStore(state => state.sessionRole);
  const selected = useGameStore(state => state.selectedSprites);
  const sprites = useGameStore(state => state.sprites);
  const canControl = useGameStore(state => state.canControlSprite);
  const [draft, setDraft] = useState<TextSpriteCommand | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setDraft(null);
    setSaving(false);
    setError(null);
  }, []);

  useEffect(() => {
    cancel();
    return () => abortRef.current?.abort();
  }, [activeTableId, activeTool, activeLayer, actorId, role, protocol, cancel]);

  const draftId = draft?.id;
  useEffect(() => { if (draftId) inputRef.current?.focus(); }, [draftId]);

  useEffect(() => {
    if (draft?.revision !== null && draft) {
      const target = sprites.find(sprite => sprite.id === draft.id && sprite.tableId === draft.tableId);
      if (!target || !canControl(target.id)) cancel();
    }
  }, [sprites, canControl, draft, cancel]);

  useEffect(() => {
    if (activeTool !== 'text' || !activeTableId || !canInteract(role)) return;
    const place = (event: Event) => {
      if (draft) return;
      const position = (event as CustomEvent<{ x: number; y: number }>).detail;
      if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return;
      if (!['map', 'tokens', 'dungeon_master'].includes(activeLayer)) {
        setError('Text sprites belong on Map, Tokens, or the DM layer, not an obstacle or lighting layer.');
        return;
      }
      setDraft({ id: crypto.randomUUID(), tableId: activeTableId, x: position.x, y: position.y,
        layer: activeLayer, descriptor: { ...DEFAULT_TEXT }, metadata: {}, revision: null });
      setError(null);
    };
    window.addEventListener('textSpriteClick', place);
    return () => window.removeEventListener('textSpriteClick', place);
  }, [activeLayer, activeTableId, activeTool, draft, role]);

  const selectedSprite = selected.length === 1 ? sprites.find(sprite => sprite.id === selected[0] && sprite.tableId === activeTableId) : null;
  const saved = parseTextSpriteMetadata(selectedSprite?.metadata);
  const canEdit = selectedSprite && saved && canInteract(role) && canControl(selectedSprite.id);
  const update = (changes: Partial<TextSpriteDescriptor>) => setDraft(current => current
    ? { ...current, descriptor: { ...current.descriptor, ...changes } } : null);

  const save = async () => {
    if (!draft || !protocol || saving) return;
    const abort = new AbortController();
    abortRef.current = abort;
    setSaving(true);
    setError(null);
    try {
      await saveTextSprite(protocol, draft, abort.signal);
      if (abort.signal.aborted || abortRef.current !== abort) return;
      if (draft.revision === null) onSpriteCreated?.(draft.id);
      cancel();
      useGameStore.getState().setActiveTool('select');
    } catch (cause) {
      if (abort.signal.aborted || abortRef.current !== abort) return;
      const failure = cause instanceof Error ? cause : new Error('Text could not be saved.');
      setError(failure.message);
      setSaving(false);
      onError?.(failure);
    }
  };

  const onEditorKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Escape') { event.stopPropagation(); cancel(); }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void save(); }
  };

  return (
    <section className={styles.editor} aria-label="Text sprite editor">
      {!draft && <>
        {activeTool === 'text' && <p>Click the table to place text. Text is saved after server confirmation.</p>}
        <button type="button" disabled={!canEdit || !protocol} onClick={() => {
          if (!selectedSprite || !saved) return;
          setDraft({ id: selectedSprite.id, tableId: selectedSprite.tableId, x: selectedSprite.x, y: selectedSprite.y,
            layer: selectedSprite.layer, descriptor: { ...saved.descriptor }, metadata: saved.metadata, revision: saved.revision });
          setError(null);
        }}>Edit selected text</button>
      </>}
      {error && <p role="alert">{error}</p>}
      {draft && <form aria-label="Text sprite settings" onSubmit={event => { event.preventDefault(); void save(); }}>
        <h5>{draft.revision === null ? 'Create text sprite' : 'Edit text sprite'}</h5>
        <fieldset disabled={saving} className={styles.fields}>
          <label>Text<textarea ref={inputRef} onKeyDown={onEditorKeyDown} aria-label="Text" placeholder="Type text..." value={draft.descriptor.text}
            rows={4} maxLength={4096} lang={draft.descriptor.language} dir={draft.descriptor.direction}
            onChange={event => update({ text: event.target.value })} /></label>
          <label>Size<input onKeyDown={onEditorKeyDown} aria-label="Text size" type="number" min={8} max={128}
            value={draft.descriptor.font_size} onChange={event => update({ font_size: Number(event.target.value) })} /></label>
          <label>Color<input onKeyDown={onEditorKeyDown} aria-label="Text color" type="color" value={draft.descriptor.color}
            onChange={event => update({ color: event.target.value })} /></label>
          <label>Typeface<select onKeyDown={onEditorKeyDown} aria-label="Typeface" value={draft.descriptor.font_family}
            onChange={event => update({ font_family: event.target.value as TextSpriteDescriptor['font_family'] })}>
            <option value="sans-serif">Sans serif</option><option value="serif">Serif</option><option value="monospace">Monospace</option>
          </select></label>
          <label><input onKeyDown={onEditorKeyDown} type="checkbox" checked={draft.descriptor.font_weight === 700}
            onChange={event => update({ font_weight: event.target.checked ? 700 : 400 })} />Bold</label>
          <label><input onKeyDown={onEditorKeyDown} type="checkbox" checked={draft.descriptor.font_style === 'italic'}
            onChange={event => update({ font_style: event.target.checked ? 'italic' : 'normal' })} />Italic</label>
          <label>Language<input onKeyDown={onEditorKeyDown} aria-label="Language" value={draft.descriptor.language} maxLength={35}
            placeholder="uk, en, ar" onChange={event => update({ language: event.target.value })} /></label>
          <label>Direction<select onKeyDown={onEditorKeyDown} aria-label="Text direction" value={draft.descriptor.direction}
            onChange={event => update({ direction: event.target.value as TextSpriteDescriptor['direction'] })}>
            <option value="auto">Automatic</option><option value="ltr">Left to right</option><option value="rtl">Right to left</option>
          </select></label>
        </fieldset>
        <div className={styles.actions}>
          <button type="submit" disabled={saving || !draft.descriptor.text.trim()}>{saving ? 'Saving…' : 'Save text'}</button>
          <button type="button" onClick={cancel}>Cancel</button>
          {error && draft.revision !== null && <button type="button" onClick={() => {
            protocol?.requestSpriteData(draft.id, draft.tableId); cancel();
          }}>Reload saved text (discard draft)</button>}
        </div>
      </form>}
    </section>
  );
}

export default TextSpriteTool;
