export type SkillCategory =
  | 'design'
  | 'ux'
  | 'frontend'
  | 'backend'
  | 'quality'
  | 'security'
  | 'writing'
  | 'product'
  | 'legal'
  | 'finance'
  | 'media'
  | 'meta'
  | 'other';

export type CategorySource = 'manual' | 'analysis' | 'declared' | 'auto';

export interface SkillFile {
  path: string;
  size: number;
}

export interface SkillItem {
  id: string;
  name: string;
  dir_name: string;
  source: string;
  root: string;
  path: string;
  rel_path: string;
  description: string;
  summary: string;
  /** One-line Spanish rendering of the description, produced by the analysis. */
  summary_es: string;
  license: string;
  declared_category: string;
  auto_category: SkillCategory;
  category: SkillCategory;
  category_source: CategorySource;
  tags: string[];
  analysis: string;
  analyzed_at: string | null;
  analysis_stale: boolean;
  model: string;
  files: SkillFile[];
  file_count: number;
  bytes: number;
  line_count: number;
  content_hash: string;
}

export interface SkillGroup {
  category: SkillCategory;
  label: string;
  count: number;
}

export interface SkillRoot {
  label: string;
  path: string;
  exists: boolean;
  count: number;
}

export interface SkillsSnapshot {
  skills: SkillItem[];
  groups: SkillGroup[];
  roots: SkillRoot[];
  orphans: string[];
  llm: { configured: boolean; model: string };
}

export interface SkillDetail {
  skill: SkillItem;
  content: string;
  files: SkillFile[];
}

export type ChatRole = 'user' | 'assistant';

export interface SkillChatMessage {
  role: ChatRole;
  content: string;
}

export type SkillStreamDone = {
  cached?: boolean;
  analysis?: string;
  summary_es?: string;
  category?: string;
  tags?: string[];
};
