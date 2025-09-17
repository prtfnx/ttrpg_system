import { useState, useEffect } from 'react';
import { TextSpriteCreator, type TextSpriteConfig } from './TextSpriteCreator';
import { updateTextSprite, deleteTextSprite } from './textSpriteUtils';

interface TextSpriteEditorProps {
  spriteId: string;
  initialConfig: Partial<TextSpriteConfig>;
  initialPosition: { x: number; y: number };
  layer: string;
  isOpen: boolean;
  onClose: () => void;
  onUpdated?: (spriteId: string) => void;
  onDeleted?: (spriteId: string) => void;
  onError?: (error: Error) => void;
}

export function TextSpriteEditor({
  spriteId,
  initialConfig,
  initialPosition,
  layer,
  isOpen,
  onClose,
  onUpdated,
  onDeleted,
  onError
}: TextSpriteEditorProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fill in default config values for any missing properties
  const getCompleteConfig = (partial: Partial<TextSpriteConfig>): TextSpriteConfig => ({
    text: partial.text || 'Sample Text',
    fontSize: partial.fontSize || 24,
    fontFamily: partial.fontFamily || 'Arial',
    fontWeight: partial.fontWeight || 'normal',
    color: partial.color || '#000000',
    backgroundColor: partial.backgroundColor || '#ffffff',
    hasBackground: partial.hasBackground || false,
    textAlign: partial.textAlign || 'left',
    opacity: partial.opacity || 1.0,
    rotation: partial.rotation || 0,
    borderWidth: partial.borderWidth || 1,
    borderColor: partial.borderColor || '#000000',
    hasBorder: partial.hasBorder || false,
    padding: partial.padding || 8,
    lineHeight: partial.lineHeight || 1.2,
    letterSpacing: partial.letterSpacing || 0,
    textShadow: partial.textShadow || false,
    shadowColor: partial.shadowColor || '#000000',
    shadowBlur: partial.shadowBlur || 2,
    shadowOffsetX: partial.shadowOffsetX || 1,
    shadowOffsetY: partial.shadowOffsetY || 1,
  });

  const handleUpdateSprite = async (
    config: TextSpriteConfig,
    position: { x: number; y: number }
  ) => {
    setIsUpdating(true);
    try {
      await updateTextSprite(spriteId, config, position, layer);
      onUpdated?.(spriteId);
      onClose();
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Failed to update text sprite');
      onError?.(err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteSprite = async () => {
    if (!confirm('Are you sure you want to delete this text sprite?')) {
      return;
    }

    setIsDeleting(true);
    try {
      deleteTextSprite(spriteId);
      onDeleted?.(spriteId);
      onClose();
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Failed to delete text sprite');
      onError?.(err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div>
      <TextSpriteCreator
        isOpen={isOpen}
        onClose={onClose}
        onCreateSprite={handleUpdateSprite}
        activeLayer={layer}
        initialPosition={initialPosition}
        // Pass the complete config by spreading initial values
        initialConfig={getCompleteConfig(initialConfig)}
        // Override the title and button text for editing mode
        title="Edit Text Sprite"
        createButtonText={isUpdating ? 'Updating...' : 'Update Text Sprite'}
        showDeleteButton={true}
        onDelete={handleDeleteSprite}
        isDeleting={isDeleting}
      />
    </div>
  );
}