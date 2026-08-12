import clsx from 'clsx';
import { useState } from 'react';
import { Modal } from '@shared/components';
import styles from './TextSpriteModal.module.css';

interface TextSpriteModalProps {
  isOpen: boolean;
  position: { x: number; y: number } | null;
  onConfirm: (config: TextSpriteConfig) => void;
  onCancel: () => void;
}

export interface TextSpriteConfig {
  text: string;
  fontSize: number;
  color: string;
}

export function TextSpriteModal({ isOpen, position, onConfirm, onCancel }: TextSpriteModalProps) {
  const [text, setText] = useState('Sample Text');
  const [fontSize, setFontSize] = useState(24);
  const [color, setColor] = useState('#ffffff');

  if (!isOpen || !position) return null;

  const handleConfirm = () => {
    if (text.trim()) {
      onConfirm({ text: text.trim(), fontSize, color });
      // Reset for next use
      setText('Sample Text');
      setFontSize(24);
      setColor('#ffffff');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleConfirm();
    }
  };

  return (
    <Modal isOpen onClose={onCancel} title="Create Text Sprite">
      <form onSubmit={(e) => { e.preventDefault(); handleConfirm(); }}>
        <div className={styles.textSpriteContent}>
          <div className={styles.formGroup}>
            <label className={styles.controlLabel} htmlFor="text-content">Text Content:</label>
            <textarea
              id="text-content"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter your text..."
              autoFocus
              rows={3}
              maxLength={200}
              onKeyDown={handleKeyDown}
            />
            <div className={styles.charCount}>{text.length}/200</div>
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.controlLabel} htmlFor="font-size">Font Size:</label>
              <div className={styles.sliderContainer}>
                <input
                  className={styles.rangeInput}
                  type="range"
                  id="font-size"
                  min="12"
                  max="72"
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                />
                <span className={styles.sliderValue}>{fontSize}px</span>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.controlLabel} htmlFor="text-color">Color:</label>
              <div className={styles.colorPickerContainer}>
                <input
                  className={styles.colorInput}
                  type="color"
                  id="text-color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                />
                <span className={styles.colorValue}>{color.toUpperCase()}</span>
              </div>
            </div>
          </div>

          <div className={styles.previewSection}>
            <div className={styles.previewLabel}>Preview:</div>
            <div
              className={styles.textPreview}
              style={{
                fontSize: `${fontSize}px`,
                color
              }}
            >
              {text || 'Sample Text'}
            </div>
          </div>

          <div className={styles.infoBox}>
            <strong className={styles.infoBoxHighlight}>Note:</strong> Text sprites use the WebGL bitmap font renderer.
            <br />
            • Consolas monospace font
            • ASCII characters only (32-127)
            • Rendered directly in WebGL (no Canvas2D)
          </div>
        </div>

        <div className={styles.modalFooter}>
          <button type="button" className={clsx(styles.btn, styles.btnCancel)} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="submit"
            className={clsx(styles.btn, styles.btnConfirm, !text.trim() && styles.btnConfirmDisabled)}
            disabled={!text.trim()}
          >
            Create Text Sprite
          </button>
        </div>
      </form>
    </Modal>
  );
}
