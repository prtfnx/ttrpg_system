import clsx from 'clsx';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './Modal.module.css';

/**
 * Use for destructive confirmations and authentication only.
 * For panels/inspectors use FloatingWindow.
 */

interface Props {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  closeOnEscape?: boolean;
  closeOnOverlayClick?: boolean;
  size?: 'small' | 'medium' | 'large' | 'fullscreen';
}

export function Modal({ isOpen, onClose, title, children, closeOnEscape = true, closeOnOverlayClick = true, size = 'medium' }: Props) {
  const titleId = useId();
  const [isAnimating, setIsAnimating] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<Element | null>(null);
  const hasOpenedRef = useRef(false);
  const wasOpenRef = useRef(false);

  if (isOpen && !wasOpenRef.current) {
    previousActiveElement.current = document.activeElement;
  }
  wasOpenRef.current = isOpen;

  const restoreFocus = useCallback(() => {
    if (previousActiveElement.current instanceof HTMLElement) {
      previousActiveElement.current.focus();
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      hasOpenedRef.current = true;
      setIsAnimating(true);
      document.body.style.overflow = 'hidden';
      if (!modalRef.current?.contains(document.activeElement)) {
        modalRef.current?.focus();
      }
      const timer = setTimeout(() => {
        setIsAnimating(false);
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
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeOnEscape) {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key !== 'Tab') return;

      const focusable = Array.from(modalRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? []).filter((element) => element.getAttribute('aria-hidden') !== 'true');

      if (focusable.length === 0) {
        e.preventDefault();
        modalRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;

      if (e.shiftKey && (activeElement === first || !modalRef.current?.contains(activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (activeElement === last || !modalRef.current?.contains(activeElement))) {
        e.preventDefault();
        first.focus();
      }
    };
    if (isOpen) document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeOnEscape, onClose]);

  useEffect(() => () => {
    document.body.style.overflow = '';
    restoreFocus();
  }, [restoreFocus]);

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
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className={styles.modalHeader}>
          <h2 id={titleId} className={styles.modalTitle}>{title}</h2>
          <button type="button" className={styles.modalCloseButton} onClick={onClose} aria-label="Close modal">×</button>
        </div>
        <div className={styles.modalBody}>{children}</div>
      </div>
    </div>,
    modalRoot
  );
}
