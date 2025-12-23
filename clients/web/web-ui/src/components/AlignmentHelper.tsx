import { useEffect, useState } from 'react';
import { useGameStore } from '../store';
import { getSpriteCenter, getSpriteHeight, getSpriteWidth } from '../utils/spriteHelpers';
import styles from './AlignmentHelper.module.css';

interface AlignmentHelperProps {
  isActive: boolean;
}

interface AlignmentGuide {
  type: 'horizontal' | 'vertical';
  position: number;
  sprites: string[];
}

export function AlignmentHelper({ isActive }: AlignmentHelperProps) {
  const [, setGuides] = useState<AlignmentGuide[]>([]);
  const { sprites, selectedSprites } = useGameStore();

  useEffect(() => {
    if (!isActive || selectedSprites.length < 2) {
      setGuides([]);
      return;
    }

    // Generate alignment guides based on selected sprites
    const selectedSpriteObjects = sprites.filter(s => selectedSprites.includes(s.id));
    const newGuides: AlignmentGuide[] = [];

    // Collect unique X and Y positions
    const xPositions = new Map<number, string[]>();
    const yPositions = new Map<number, string[]>();

    selectedSpriteObjects.forEach(sprite => {
      const center = getSpriteCenter(sprite);

      // Group sprites by X position (vertical alignment)
      const existingX = Array.from(xPositions.keys()).find(x => Math.abs(x - center.x) < 5);
      if (existingX) {
        xPositions.get(existingX)?.push(sprite.id);
      } else {
        xPositions.set(center.x, [sprite.id]);
      }

      // Group sprites by Y position (horizontal alignment)
      const existingY = Array.from(yPositions.keys()).find(y => Math.abs(y - center.y) < 5);
      if (existingY) {
        yPositions.get(existingY)?.push(sprite.id);
      } else {
        yPositions.set(center.y, [sprite.id]);
      }
    });

    // Create guides for positions with multiple sprites
    xPositions.forEach((spriteIds, position) => {
      if (spriteIds.length > 1) {
        newGuides.push({
          type: 'vertical',
          position,
          sprites: spriteIds
        });
      }
    });

    yPositions.forEach((spriteIds, position) => {
      if (spriteIds.length > 1) {
        newGuides.push({
          type: 'horizontal',
          position,
          sprites: spriteIds
        });
      }
    });

    setGuides(newGuides);
  }, [isActive, selectedSprites, sprites]);

  const alignSprites = (type: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' | 'distribute-h' | 'distribute-v') => {
    if (selectedSprites.length < 2) return;

    const selectedSpriteObjects = sprites.filter(s => selectedSprites.includes(s.id));
    
    switch (type) {
      case 'left': {
        const leftMost = Math.min(...selectedSpriteObjects.map(s => s.x));
        selectedSpriteObjects.forEach(sprite => {
          if (window.gameAPI?.sendMessage) {
            window.gameAPI.sendMessage('sprite_update', {
              id: sprite.id,
              x: leftMost
            });
          }
        });
        break;
      }
      
      case 'center': {
        const centers = selectedSpriteObjects.map(s => getSpriteCenter(s).x);
        const avgCenter = centers.reduce((a, b) => a + b, 0) / centers.length;
        selectedSpriteObjects.forEach(sprite => {
          if (window.gameAPI?.sendMessage) {
            window.gameAPI.sendMessage('sprite_update', {
              id: sprite.id,
              x: avgCenter - getSpriteWidth(sprite) / 2
            });
          }
        });
        break;
      }
      
      case 'right': {
        const rightMost = Math.max(...selectedSpriteObjects.map(s => s.x + getSpriteWidth(s)));
        selectedSpriteObjects.forEach(sprite => {
          if (window.gameAPI?.sendMessage) {
            window.gameAPI.sendMessage('sprite_update', {
              id: sprite.id,
              x: rightMost - getSpriteWidth(sprite)
            });
          }
        });
        break;
      }
      
      case 'top': {
        const topMost = Math.min(...selectedSpriteObjects.map(s => s.y));
        selectedSpriteObjects.forEach(sprite => {
          if (window.gameAPI?.sendMessage) {
            window.gameAPI.sendMessage('sprite_update', {
              id: sprite.id,
              y: topMost
            });
          }
        });
        break;
      }
      
      case 'middle': {
        const centers = selectedSpriteObjects.map(s => getSpriteCenter(s).y);
        const avgCenter = centers.reduce((a, b) => a + b, 0) / centers.length;
        selectedSpriteObjects.forEach(sprite => {
          if (window.gameAPI?.sendMessage) {
            window.gameAPI.sendMessage('sprite_update', {
              id: sprite.id,
              y: avgCenter - getSpriteHeight(sprite) / 2
            });
          }
        });
        break;
      }
      
      case 'bottom': {
        const bottomMost = Math.max(...selectedSpriteObjects.map(s => s.y + getSpriteHeight(s)));
        selectedSpriteObjects.forEach(sprite => {
          if (window.gameAPI?.sendMessage) {
            window.gameAPI.sendMessage('sprite_update', {
              id: sprite.id,
              y: bottomMost - getSpriteHeight(sprite)
            });
          }
        });
        break;
      }
      
      case 'distribute-h': {
        const sorted = [...selectedSpriteObjects].sort((a, b) => a.x - b.x);
        if (sorted.length < 3) return;
        
        const leftMost = sorted[0].x;
        const rightMost = sorted[sorted.length - 1].x + getSpriteWidth(sorted[sorted.length - 1]);
        const totalSpace = rightMost - leftMost;
        const spriteWidth = sorted.reduce((sum, s) => sum + getSpriteWidth(s), 0);
        const spacing = (totalSpace - spriteWidth) / (sorted.length - 1);
        
        let currentX = leftMost;
        sorted.forEach(sprite => {
          if (window.gameAPI?.sendMessage) {
            window.gameAPI.sendMessage('sprite_update', {
              id: sprite.id,
              x: currentX
            });
          }
          currentX += getSpriteWidth(sprite) + spacing;
        });
        break;
      }
      
      case 'distribute-v': {
        const sorted = [...selectedSpriteObjects].sort((a, b) => a.y - b.y);
        if (sorted.length < 3) return;
        
        const topMost = sorted[0].y;
        const bottomMost = sorted[sorted.length - 1].y + getSpriteHeight(sorted[sorted.length - 1]);
        const totalSpace = bottomMost - topMost;
        const spriteHeight = sorted.reduce((sum, s) => sum + getSpriteHeight(s), 0);
        const spacing = (totalSpace - spriteHeight) / (sorted.length - 1);
        
        let currentY = topMost;
        sorted.forEach(sprite => {
          if (window.gameAPI?.sendMessage) {
            window.gameAPI.sendMessage('sprite_update', {
              id: sprite.id,
              y: currentY
            });
          }
          currentY += getSpriteHeight(sprite) + spacing;
        });
        break;
      }
    }
  };

  if (!isActive) return null;

  return (
    <div className={styles.alignmentHelper}>
      <div className={styles.alignmentControls}>
        <h4>Align Selected Sprites</h4>
        
        <div className={styles.alignmentGroup}>
          <label>Horizontal:</label>
          <div className={styles.buttonGroup}>
            <button className={styles.alignmentButton} onClick={() => alignSprites('left')} title="Align Left">⬅️</button>
            <button className={styles.alignmentButton} onClick={() => alignSprites('center')} title="Align Center">↔️</button>
            <button className={styles.alignmentButton} onClick={() => alignSprites('right')} title="Align Right">➡️</button>
          </div>
        </div>
        
        <div className={styles.alignmentGroup}>
          <label>Vertical:</label>
          <div className={styles.buttonGroup}>
            <button className={styles.alignmentButton} onClick={() => alignSprites('top')} title="Align Top">⬆️</button>
            <button className={styles.alignmentButton} onClick={() => alignSprites('middle')} title="Align Middle">↕️</button>
            <button className={styles.alignmentButton} onClick={() => alignSprites('bottom')} title="Align Bottom">⬇️</button>
          </div>
        </div>
        
        <div className={styles.alignmentGroup}>
          <label>Distribute:</label>
          <div className={styles.buttonGroup}>
            <button className={styles.alignmentButton} onClick={() => alignSprites('distribute-h')} title="Distribute Horizontally">📐</button>
            <button className={styles.alignmentButton} onClick={() => alignSprites('distribute-v')} title="Distribute Vertically">📏</button>
          </div>
        </div>
        
        <div className={styles.selectionInfo}>
          {selectedSprites.length} sprites selected
        </div>
      </div>
    </div>
  );
}
