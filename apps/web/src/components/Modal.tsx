import type { JSX, PropsWithChildren, ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  footer?: ReactNode;
  hideHeader?: boolean;
}

const Modal = ({ open, onClose, title, footer, hideHeader = false, children }: PropsWithChildren<ModalProps>): JSX.Element | null => {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className="modal"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        {!hideHeader ? (
          <header className="modal__header">
            {title ? (typeof title === 'string' ? <h2>{title}</h2> : title) : <span />}
            <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </header>
        ) : null}
        <div className="modal__content">{children}</div>
        {footer && <div className="modal__footer-actions">{footer}</div>}
      </div>
    </div>
  );
};

export default Modal;
