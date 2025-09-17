import { useState } from 'react';
import { TextSpriteCreator, type TextSpriteConfig } from './TextSpriteCreator';
import { createTextSprite } from './textSpriteUtils';

interface TextSpriteToolProps {
  activeLayer: string;
  onSpriteCreated?: (spriteId: string) => void;
  onError?: (error: Error) => void;
}

export function TextSpriteTool({ 
  activeLayer, 
  onSpriteCreated,
  onError 
}: TextSpriteToolProps) {
  const [isCreatorOpen, setIsCreatorOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateSprite = async (
    config: TextSpriteConfig,
    position: { x: number; y: number }
  ) => {
    setIsCreating(true);
    try {
      await createTextSprite(
        config,
        position,
        activeLayer,
        (id) => {
          console.log('[TextSpriteTool] Successfully created text sprite:', id);
          onSpriteCreated?.(id);
        },
        (error) => {
          console.error('[TextSpriteTool] Error creating text sprite:', error);
          onError?.(error);
        }
      );
      
      setIsCreatorOpen(false);
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Unknown error');
      onError?.(err);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="tool-button text-sprite-button"
        onClick={() => setIsCreatorOpen(true)}
        disabled={isCreating}
        title="Create Text Sprite"
        style={{
          padding: '8px 16px',
          backgroundColor: '#3b82f6',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: isCreating ? 'wait' : 'pointer',
          fontSize: '14px',
          fontWeight: '500',
          opacity: isCreating ? 0.7 : 1
        }}
      >
        {isCreating ? 'Creating...' : '📝 Add Text'}
      </button>

      <TextSpriteCreator
        isOpen={isCreatorOpen}
        onClose={() => setIsCreatorOpen(false)}
        onCreateSprite={handleCreateSprite}
        activeLayer={activeLayer}
      />
    </>
  );
}

export default TextSpriteTool;