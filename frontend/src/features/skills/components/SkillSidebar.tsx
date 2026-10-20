import { ChevronDown, ChevronRight, Search, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Input } from '../../../components/ui/Input';
import { useSkillsStore } from '../../../stores/useSkillsStore';
import { SkillCategory, SkillGroup } from '../../../types/skill';
import { CATEGORY_ORDER, filterSkills, groupSkills } from '../../../utils/skills';
import { useSkills } from '../hooks/useSkills';
import './SkillSidebar.css';

const CATEGORY_ACCENT: Record<SkillCategory, string> = {
  design: '#f472b6',
  ux: '#c084fc',
  frontend: '#38bdf8',
  backend: '#34d399',
  quality: '#fbbf24',
  security: '#f87171',
  writing: '#a3e635',
  product: '#facc15',
  legal: '#94a3b8',
  finance: '#2dd4bf',
  media: '#fb923c',
  meta: '#60a5fa',
  other: '#64748b',
};

export function SkillSidebar() {
  const { data, isLoading } = useSkills();
  const query = useSkillsStore((state) => state.query);
  const setQuery = useSkillsStore((state) => state.setQuery);
  const category = useSkillsStore((state) => state.category);
  const setCategory = useSkillsStore((state) => state.setCategory);
  const source = useSkillsStore((state) => state.source);
  const setSource = useSkillsStore((state) => state.setSource);
  const selectedId = useSkillsStore((state) => state.selectedId);
  const select = useSkillsStore((state) => state.select);

  const [collapsed, setCollapsed] = useState<Set<SkillCategory>>(new Set());

  const skills = useMemo(() => data?.skills ?? [], [data]);
  const visible = useMemo(
    () => filterSkills(skills, query, category, source),
    [skills, query, category, source]
  );
  const grouped = useMemo(() => groupSkills(visible), [visible]);
  const labels = useMemo(() => {
    const map = new Map<SkillCategory, string>();
    (data?.groups ?? []).forEach((group: SkillGroup) => map.set(group.category, group.label));
    return map;
  }, [data]);

  const toggle = (key: SkillCategory) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <aside className="skill-sidebar">
      <div className="skill-sidebar-search">
        <Input
          placeholder="Search skills…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          leftIcon={<Search size={14} />}
          aria-label="Search skills"
        />
      </div>

      <div className="skill-source-row" role="group" aria-label="Filter by skill root">
        <button
          className={`skill-chip ${source === 'all' ? 'is-on' : ''}`}
          onClick={() => setSource('all')}
        >
          All
        </button>
        {(data?.roots ?? []).map((root) => (
          <button
            key={root.label}
            className={`skill-chip ${source === root.label ? 'is-on' : ''}`}
            onClick={() => setSource(root.label)}
            title={`${root.path} (${root.count} skills)`}
            disabled={!root.exists}
          >
            {root.label}
          </button>
        ))}
      </div>

      {category !== 'all' && (
        <button className="skill-active-filter" onClick={() => setCategory('all')}>
          <span style={{ color: CATEGORY_ACCENT[category] }}>●</span>
          {labels.get(category) ?? category}
          <span className="skill-active-clear">clear</span>
        </button>
      )}

      <div className="skill-list">
        {isLoading && <p className="skill-state">Scanning skill roots…</p>}
        {!isLoading && visible.length === 0 && (
          <p className="skill-state">
            No skill matches this filter.
            <button
              className="skill-state-reset"
              onClick={() => {
                setQuery('');
                setCategory('all');
                setSource('all');
              }}
            >
              Reset filters
            </button>
          </p>
        )}

        {CATEGORY_ORDER.filter((key) => grouped.has(key)).map((key) => {
          const items = grouped.get(key) ?? [];
          const isOpen = !collapsed.has(key);
          return (
            <section className="skill-group" key={key}>
              <div className="skill-group-head">
                <button
                  className="skill-group-toggle"
                  onClick={() => toggle(key)}
                  aria-expanded={isOpen}
                >
                  {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  <span className="skill-group-dot" style={{ background: CATEGORY_ACCENT[key] }} />
                  <span className="skill-group-label">{labels.get(key) ?? key}</span>
                  <span className="skill-group-count">{items.length}</span>
                </button>
                <button
                  className="skill-group-filter"
                  onClick={() => setCategory(key)}
                  title={`Filter to ${labels.get(key) ?? key}`}
                  aria-label={`Filter to ${labels.get(key) ?? key}`}
                >
                  only
                </button>
              </div>

              {isOpen && (
                <ul className="skill-rows">
                  {items.map((skill) => (
                    <li key={skill.id}>
                      <button
                        className={`skill-row ${selectedId === skill.id ? 'is-selected' : ''}`}
                        onClick={() => select(skill.id)}
                        title={skill.description}
                      >
                        <span className="skill-row-top">
                          <span className="skill-row-name">{skill.name}</span>
                          {skill.analyzed_at && (
                            <Sparkles size={11} className="skill-row-spark" aria-label="Analyzed" />
                          )}
                        </span>
                        <span className="skill-row-summary">{skill.summary_es || skill.summary}</span>
                        {source === 'all' && (
                          <span className="skill-row-source">{skill.source}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <footer className="skill-sidebar-footer">
        <span>
          {visible.length} / {skills.length} skills
        </span>
        {(data?.orphans.length ?? 0) > 0 && (
          <span className="skill-orphans" title="Index entries whose folder no longer exists">
            {data?.orphans.length} orphan
          </span>
        )}
      </footer>
    </aside>
  );
}
