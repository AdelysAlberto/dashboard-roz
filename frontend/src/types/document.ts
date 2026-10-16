export type StatusType =
  | 'pending'
  | 'in progress'
  | 'in_progress'
  | 'done'
  | 'blocked'
  | 'rejected'
  | 'deprecated'
  | 'manual'
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
  has_frontmatter?: boolean;
  /** Presente cuando el bloque YAML no parsea: su metadata se ignora y el estado sale de la tabla. */
  frontmatter_error?: string | null;
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
