export type StatusType =
  | 'pending'
  | 'in progress'
  | 'in_progress'
  | 'done'
  | 'blocked'
  | 'rejected'
  | 'deprecated'
  | 'none';

export interface DocItem {
  path: string;
  name: string;
  title: string;
  description?: string;
  module?: string;
  date?: string;
  status?: string;
  priority?: string;
  scope?: string;
  source?: string;
  parent: string;
  root: string;
  [key: string]: unknown;
}

export interface DocDetail {
  content: string;
  meta: DocItem;
}

export interface ValidationIssue {
  type: string;
  path: string;
  detail: string;
}

export interface ValidationResult {
  checked: number;
  counts: Record<string, number>;
  issues: ValidationIssue[];
}
