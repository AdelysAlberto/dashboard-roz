import { SkillCategory, SkillItem } from '../types/skill';

export const CATEGORY_ORDER: SkillCategory[] = [
  'design',
  'ux',
  'frontend',
  'backend',
  'quality',
  'security',
  'writing',
  'product',
  'legal',
  'finance',
  'media',
  'meta',
  'other',
];

export function filterSkills(
  skills: SkillItem[],
  query: string,
  category: SkillCategory | 'all',
  source: string | 'all'
): SkillItem[] {
  const needle = query.trim().toLowerCase();
  return skills.filter((skill) => {
    if (category !== 'all' && skill.category !== category) return false;
    if (source !== 'all' && skill.source !== source) return false;
    if (!needle) return true;
    const haystack = [
      skill.name,
      skill.dir_name,
      skill.description,
      skill.tags.join(' '),
      skill.source,
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(needle);
  });
}

export function groupSkills(skills: SkillItem[]): Map<SkillCategory, SkillItem[]> {
  const grouped = new Map<SkillCategory, SkillItem[]>();
  for (const skill of skills) {
    const bucket = grouped.get(skill.category);
    if (bucket) bucket.push(skill);
    else grouped.set(skill.category, [skill]);
  }
  return grouped;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * While the analysis streams, the first lines are the machine contract
 * (`CATEGORY:` / `TAGS:` / `SUMMARY_ES:` …) closed by a `---` line. Showing that
 * to the user is noise: hide everything up to and including that separator.
 * Idempotent, so the persisted body (already parsed server-side) passes through.
 */
export function stripAnalysisHeader(raw: string): string {
  if (!/^\s*CATEGORY\s*:/i.test(raw)) return raw;
  const match = raw.match(/^---[ \t]*$/m);
  if (!match || match.index === undefined) return '';
  return raw.slice(match.index + match[0].length).replace(/^\n+/, '');
}
