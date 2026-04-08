import clsx from 'clsx';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './Modal.module.css';

/**
 * Use for destructive confirmations and authentication only.
 * For panels/inspectors use FloatingWindow.
 */

interface Props {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  closeOnEscape?: boolean;
  closeOnOverlayClick?: boolean;
  size?: 'small' | 'medium' | 'large' | 'fullscreen';
}

export function Modal({ isOpen, onClose, title, children, closeOnEscape = true, closeOnOverlayClick = true, size = 'medium' }: Props) {
  const [isAnimating, setIsAnimating] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<Element | null>(null);
  const hasOpenedRef = useRef(false);

  const restoreFocus = useCallback(() => {
    if (previousActiveElement.current instanceof HTMLElement) {
      previousActiveElement.current.focus();
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      hasOpenedRef.current = true;
      setIsAnimating(true);
      previousActiveElement.current = document.activeElement;
      document.body.style.overflow = 'hidden';
      const timer = setTimeout(() => {
        setIsAnimating(false);
        modalRef.current?.focus();
      }, 150);
      return () => clearTimeout(timer);
    } else if (hasOpenedRef.current) {
      setIsAnimating(true);
      document.body.style.overflow = '';
      restoreFocus();
      const timer = setTimeout(() => setIsAnimating(false), 150);
      return () => clearTimeout(timer);
    }
  }, [isOpen, restoreFocus]);

  useEffect(() => {
    if (!closeOnEscape) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    if (isOpen) document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeOnEscape, onClose]);

  useEffect(() => () => { document.body.style.overflow = ''; }, []);

  if (!isOpen && !isAnimating) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (closeOnOverlayClick && e.target === e.currentTarget) onClose();
  };

  const modalRoot = document.getElementById('modal-root') || document.body;
  return createPortal(
    <div
      className={clsx(styles.modalOverlay, isOpen ? styles.modalOpen : styles.modalClosing)}
      onClick={handleOverlayClick}
      role="presentation"
    >
      <div
        ref={modalRef}
        className={clsx(styles.modalContent, styles[size])}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
        tabIndex={-1}
      >
        {title && (
          <div className={styles.modalHeader}>
            <h2 id="modal-title" className={styles.modalTitle}>{title}</h2>
            <button type="button" className={styles.modalCloseButton} onClick={onClose} aria-label="Close modal">×</button>
          </div>
        )}
        <div className={styles.modalBody}>{children}</div>
      </div>
    </div>,
    modalRoot
  );
}
