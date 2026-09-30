import React, { forwardRef, TextareaHTMLAttributes } from 'react';
import './Textarea.css';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  mono?: boolean;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, hint, mono = false, error, className = '', id, ...props }, ref) => {
    const textareaId = id || (label ? `textarea-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

    return (
      <div className={`textarea-wrapper ${error ? 'textarea-has-error' : ''} ${className}`}>
        {(label || hint) && (
          <div className="textarea-header">
            {label && <label htmlFor={textareaId} className="textarea-label">{label}</label>}
            {hint && <span className="textarea-hint">{hint}</span>}
          </div>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={`textarea-control ${mono ? 'font-mono' : ''}`}
          {...props}
        />
        {error && <span className="textarea-error-msg">{error}</span>}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
