import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import React from 'react';
import { useToastStore } from '../../stores/useToastStore';
import './ToastContainer.css';

const icons = {
  info: <Info size={16} className="toast-icon-info" />,
  success: <CheckCircle2 size={16} className="toast-icon-success" />,
  warning: <AlertTriangle size={16} className="toast-icon-warning" />,
  error: <AlertCircle size={16} className="toast-icon-error" />,
};

export const ToastContainer: React.FC = () => {
  const toasts = useToastStore((state) => state.toasts);
  const removeToast = useToastStore((state) => state.removeToast);

  if (!toasts.length) return null;

  return (
    <div className="toast-portal">
      {toasts.map((t) => (
        <div key={t.id} className={`toast-card toast-${t.type}`} role="status">
          <div className="toast-icon-wrapper">{icons[t.type]}</div>
          <div className="toast-body">
            {t.title && <div className="toast-title">{t.title}</div>}
            <div className="toast-msg">{t.message}</div>
          </div>
          <button
            className="toast-close"
            onClick={() => removeToast(t.id)}
            aria-label="Close notification"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
};
