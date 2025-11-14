import { useEffect, useState } from 'react';
import { TextSpriteEditor, type TextSpriteConfig } from './TextSpriteEditor';

interface TextSpriteToolProps {
  activeLayer: string;
  activeTool: string | null;
  onSpriteCreated?: (spriteId: string) => void;
  onError?: (error: Error) => void;
}

export function TextSpriteTool({ 
  activeLayer,
  activeTool,
  onSpriteCreated,
  onError 
}: TextSpriteToolProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [clickPosition, setClickPosition] = useState<{ x: number; y: number } | null>(null);

  // Listen for map clicks when text tool is active
  useEffect(() => {
    if (activeTool !== 'text') {
      // Clear state when tool is deactivated
      setIsEditing(false);
      setClickPosition(null);
      return;
    }

    const handleMapClick = (event: CustomEvent) => {
      const { x, y } = event.detail;
      console.log('[TextSpriteTool] Received textSpriteClick event at:', x, y);
      setClickPosition({ x, y });
      setIsEditing(true);
    };

    // Listen for custom event from Rust
    console.log('[TextSpriteTool] Registering textSpriteClick event listener');
    window.addEventListener('textSpriteClick' as any, handleMapClick);

    return () => {
      console.log('[TextSpriteTool] Removing textSpriteClick event listener');
      window.removeEventListener('textSpriteClick' as any, handleMapClick);
    };
  }, [activeTool]);

  const handleComplete = async (config: TextSpriteConfig) => {
    if (!clickPosition) {
      console.error('[TextSpriteTool] No click position available');
      return;
    }

    try {
      const rustManager = (window as any).rustRenderManager;
      if (!rustManager) {
        throw new Error('Rust render manager not available');
      }

      // Call Rust function to create text sprite
      // Note: bold is not supported by bitmap font atlas, so we ignore it for now
      const spriteId = rustManager.create_text_sprite(
        config.text,
        clickPosition.x,
        clickPosition.y,
        config.fontSize,
        config.color,
        activeLayer || 'tokens'
      );

      console.log('[TextSpriteTool] Successfully created text sprite:', spriteId);
      onSpriteCreated?.(spriteId);
      
      // Close editor and reset state
      setIsEditing(false);
      setClickPosition(null);
    } catch (error) {
      console.error('[TextSpriteTool] Error creating text sprite:', error);
      const err = error instanceof Error ? error : new Error('Unknown error');
      onError?.(err);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setClickPosition(null);
  };

  return (
    <TextSpriteEditor
      position={isEditing ? clickPosition : null}
      onComplete={handleComplete}
      onCancel={handleCancel}
    />
  );
}

export default TextSpriteTool;
