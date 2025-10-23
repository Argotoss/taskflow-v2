import type { JSX, PropsWithChildren } from 'react';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

const SettingsModal = ({ open, onClose, children }: PropsWithChildren<SettingsModalProps>): JSX.Element | null => {
  if (!open) {
    return null;
  }

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="modal"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <header className="modal__header">
          <h2>Account & Workspace</h2>
          <button
            type="button"
            className="modal__close"
            onClick={onClose}
            aria-label="Close settings"
          >
            ×
          </button>
        </header>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  );
};

export default SettingsModal;
