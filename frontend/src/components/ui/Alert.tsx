import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import React from 'react';
import './Alert.css';

export type AlertVariant = 'info' | 'success' | 'warning' | 'error';

export interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children: React.ReactNode;
  className?: string;
  icon?: boolean;
}

const icons = {
  info: <Info size={16} />,
  success: <CheckCircle2 size={16} />,
  warning: <AlertTriangle size={16} />,
  error: <AlertCircle size={16} />,
};

export const Alert: React.FC<AlertProps> = ({
  variant = 'info',
  title,
  children,
  className = '',
  icon = true,
}) => {
  return (
    <div className={`alert alert-${variant} ${className}`} role="alert">
      {icon && <div className="alert-icon">{icons[variant]}</div>}
      <div className="alert-content">
        {title && <h4 className="alert-title">{title}</h4>}
        <div className="alert-body">{children}</div>
      </div>
    </div>
  );
};
