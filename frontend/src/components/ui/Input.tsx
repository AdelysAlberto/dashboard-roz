import React, { forwardRef, InputHTMLAttributes } from 'react';
import './Input.css';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightElement?: React.ReactNode;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, leftIcon, rightElement, error, className = '', id, ...props }, ref) => {
    const inputId = id || (label ? `input-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

    return (
      <div className={`input-wrapper ${error ? 'input-has-error' : ''} ${className}`}>
        {(label || hint) && (
          <div className="input-header">
            {label && <label htmlFor={inputId} className="input-label">{label}</label>}
            {hint && <span className="input-hint">{hint}</span>}
          </div>
        )}
        <div className="input-box">
          {leftIcon && <span className="input-icon-left">{leftIcon}</span>}
          <input ref={ref} id={inputId} className="input-control" {...props} />
          {rightElement && <div className="input-right-element">{rightElement}</div>}
        </div>
        {error && <span className="input-error-msg">{error}</span>}
      </div>
    );
  }
);

Input.displayName = 'Input';
