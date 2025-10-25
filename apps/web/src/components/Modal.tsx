import type { JSX, PropsWithChildren, ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  footer?: ReactNode;
  bodyClassName?: string;
}

const Modal = ({ open, onClose, title, footer, bodyClassName, children }: PropsWithChildren<ModalProps>): JSX.Element | null => {
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
        <header className="modal__header">
          {title ? (typeof title === 'string' ? <h2>{title}</h2> : title) : <span />}
          <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
  <div className={`modal__body${bodyClassName ? ` ${bodyClassName}` : ''}`}>{children}</div>
        {footer && <footer className="modal__footer">{footer}</footer>}
      </div>
    </div>
  );
};

export default Modal;
