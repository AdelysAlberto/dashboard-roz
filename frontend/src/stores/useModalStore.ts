import { create } from 'zustand';

export type ModalType = 'paths' | 'validate' | 'confirm' | null;

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDanger?: boolean;
  onConfirm: () => void | Promise<unknown>;
  onCancel?: () => void;
}

interface ModalState {
  activeModal: ModalType;
  confirmOptions: ConfirmOptions | null;
  openModal: (type: ModalType) => void;
  openConfirm: (options: ConfirmOptions) => void;
  closeModal: () => void;
}

export const useModalStore = create<ModalState>((set) => ({
  activeModal: null,
  confirmOptions: null,
  openModal: (activeModal) => set({ activeModal, confirmOptions: null }),
  openConfirm: (confirmOptions) => set({ activeModal: 'confirm', confirmOptions }),
  closeModal: () => set({ activeModal: null, confirmOptions: null }),
}));
