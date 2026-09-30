import { create } from 'zustand';
import { ToastMessage } from '../types/common';

interface ToastState {
  toasts: ToastMessage[];
  addToast: (toast: Omit<ToastMessage, 'id'>) => void;
  removeToast: (id: string) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
  warning: (message: string, title?: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newToast: ToastMessage = { ...toast, id };
    set((state) => ({ toasts: [...state.toasts, newToast] }));

    const duration = toast.duration ?? (toast.type === 'error' ? 5000 : 3000);
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, duration);
  },
  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  success: (message, title) =>
    useToastStore.getState().addToast({ type: 'success', message, title }),
  error: (message, title) =>
    useToastStore.getState().addToast({ type: 'error', message, title }),
  info: (message, title) =>
    useToastStore.getState().addToast({ type: 'info', message, title }),
  warning: (message, title) =>
    useToastStore.getState().addToast({ type: 'warning', message, title }),
}));
