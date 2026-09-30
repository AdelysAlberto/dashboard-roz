import React from 'react';
import { useModalStore } from '../../stores/useModalStore';
import { Button } from './Button';
import { Modal } from './Modal';

export const ConfirmModal: React.FC = () => {
  const activeModal = useModalStore((state) => state.activeModal);
  const confirmOptions = useModalStore((state) => state.confirmOptions);
  const closeModal = useModalStore((state) => state.closeModal);

  if (activeModal !== 'confirm' || !confirmOptions) return null;

  const handleConfirm = async () => {
    try {
      await confirmOptions.onConfirm();
    } finally {
      closeModal();
    }
  };

  const handleCancel = () => {
    confirmOptions.onCancel?.();
    closeModal();
  };

  return (
    <Modal
      isOpen={true}
      onClose={handleCancel}
      title={confirmOptions.title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={handleCancel}>
            {confirmOptions.cancelLabel || 'Cancel'}
          </Button>
          <Button
            variant={confirmOptions.isDanger ? 'danger' : 'primary'}
            onClick={handleConfirm}
          >
            {confirmOptions.confirmLabel || 'Confirm'}
          </Button>
        </>
      }
    >
      <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5, color: 'var(--text-muted)' }}>
        {confirmOptions.message}
      </div>
    </Modal>
  );
};
