import { ChevronDown } from 'lucide-react';
import React, { forwardRef, SelectHTMLAttributes } from 'react';
import './Select.css';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options?: SelectOption[];
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, children, error, className = '', id, ...props }, ref) => {
    const selectId = id || (label ? `select-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

    return (
      <div className={`select-wrapper ${error ? 'select-has-error' : ''} ${className}`}>
        {label && <label htmlFor={selectId} className="select-label">{label}</label>}
        <div className="select-box">
          <select ref={ref} id={selectId} className="select-control" {...props}>
            {options
              ? options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))
              : children}
          </select>
          <ChevronDown className="select-arrow" size={14} />
        </div>
        {error && <span className="select-error-msg">{error}</span>}
      </div>
    );
  }
);

Select.displayName = 'Select';
