import type { ReactNode } from 'react';
import { Component, createRef } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  closeOnEscape?: boolean;
  closeOnOverlayClick?: boolean;
  size?: 'small' | 'medium' | 'large' | 'fullscreen';
}

interface State {
  isAnimating: boolean;
}

export class Modal extends Component<Props, State> {
  private modalRef = createRef<HTMLDivElement>();
  private previousActiveElement: Element | null = null;

  state: State = {
    isAnimating: false
  };

  componentDidMount() {
    if (this.props.isOpen) {
      this.openModal();
    }
  }

  componentDidUpdate(prevProps: Props) {
    if (!prevProps.isOpen && this.props.isOpen) {
      this.openModal();
    } else if (prevProps.isOpen && !this.props.isOpen) {
      this.closeModal();
    }
  }

  componentWillUnmount() {
    this.restoreFocus();
    this.removeEventListeners();
  }

  private openModal = () => {
    this.setState({ isAnimating: true });
    this.previousActiveElement = document.activeElement;
    document.body.style.overflow = 'hidden';
    this.addEventListeners();
    
    // Focus the modal after animation
    setTimeout(() => {
      this.setState({ isAnimating: false });
      this.modalRef.current?.focus();
    }, 150);
  };

  private closeModal = () => {
    this.setState({ isAnimating: true });
    document.body.style.overflow = '';
    this.removeEventListeners();
    this.restoreFocus();
    
    setTimeout(() => {
      this.setState({ isAnimating: false });
    }, 150);
  };

  private restoreFocus = () => {
    if (this.previousActiveElement instanceof HTMLElement) {
      this.previousActiveElement.focus();
    }
  };

  private addEventListeners = () => {
    if (this.props.closeOnEscape !== false) {
      document.addEventListener('keydown', this.handleKeyDown);
    }
  };

  private removeEventListeners = () => {
    document.removeEventListener('keydown', this.handleKeyDown);
  };

  private handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.props.onClose();
    }
  };

  private handleOverlayClick = (event: React.MouseEvent) => {
    if (this.props.closeOnOverlayClick !== false && event.target === event.currentTarget) {
      this.props.onClose();
    }
  };

  private getSizeClass = () => {
    const { size = 'medium' } = this.props;
    switch (size) {
      case 'small': return 'modal-small';
      case 'large': return 'modal-large';
      case 'fullscreen': return 'modal-fullscreen';
      default: return 'modal-medium';
    }
  };

  render() {
    if (!this.props.isOpen && !this.state.isAnimating) {
      return null;
    }

    const modalContent = (
      <div 
        className={`modal-overlay ${this.props.isOpen ? 'modal-open' : 'modal-closing'}`}
        onClick={this.handleOverlayClick}
        role="presentation"
      >
        <div 
          ref={this.modalRef}
          className={`modal-content ${this.getSizeClass()}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby={this.props.title ? 'modal-title' : undefined}
          tabIndex={-1}
        >
          {this.props.title && (
            <div className="modal-header">
              <h2 id="modal-title" className="modal-title">
                {this.props.title}
              </h2>
              <button
                type="button"
                className="modal-close-button"
                onClick={this.props.onClose}
                aria-label="Close modal"
              >
                ×
              </button>
            </div>
          )}
          <div className="modal-body">
            {this.props.children}
          </div>
        </div>
      </div>
    );

    // Use portal to render modal at document root
    const modalRoot = document.getElementById('modal-root') || document.body;
    return createPortal(modalContent, modalRoot);
  }
}