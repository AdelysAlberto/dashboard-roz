import React from 'react';
import './Badge.css';

export type BadgeVariant =
  | 'active'
  | 'pending'
  | 'in progress'
  | 'in_progress'
  | 'in-progress'
  | 'done'
  | 'blocked'
  | 'rejected'
  | 'deprecated'
  | 'manual'
  | 'none'
  | 'info'
  | 'purple'
  | 'amber'
  | 'neutral';

export type BadgeSize = 'xs' | 'sm' | 'md';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant | string;
  size?: BadgeSize;
  className?: string;
  dot?: boolean;
  title?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  size = 'sm',
  className = '',
  dot = false,
  title,
}) => {
  const normalizedVariant = String(variant).toLowerCase().trim().replace(/[\s_]+/g, '-');
  return (
    <span className={`badge badge-${normalizedVariant} badge-${size} ${className}`} title={title}>
      {dot && <span className="badge-dot" />}
      {children}
    </span>
  );
};
