import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { Compass, RefreshCw, Sparkles, Square, Terminal } from 'lucide-react';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Select } from '../../../components/ui/Select';
import { MarkdownRenderer } from '../../documents/components/MarkdownRenderer';
import { api } from '../../../services/api';
import { queryKeys } from '../../../services/queryKeys';
import { useSkillsStore } from '../../../stores/useSkillsStore';
import { useToastStore } from '../../../stores/useToastStore';
import { formatBytes } from '../../../utils/skills';
import { useSkillAnalysis } from '../hooks/useSkillAnalysis';
import { useSkillDeepDive } from '../hooks/useSkillDeepDive';
import { useSkillDetail, useSkills } from '../hooks/useSkills';
import './SkillDetail.css';

export function SkillDetail() {
  const selectedId = useSkillsStore((state) => state.selectedId);
  const { data: snapshot } = useSkills();
  const { data, isLoading } = useSkillDetail(selectedId);
  const skill = data?.skill ?? snapshot?.skills.find((item) => item.id === selectedId) ?? null;

  const { text, isStreaming, error, start, stop } = useSkillAnalysis(
    selectedId,
    skill?.analysis ?? ''
  );
  const { start: deepDive } = useSkillDeepDive();
  const queryClient = useQueryClient();
  const toast = useToastStore();
  const [descOpen, setDescOpen] = useState(false);
  const [descOverflow, setDescOverflow] = useState(false);
  // Callback ref: measured once when the paragraph mounts, so the "show full" pill
  // only appears when the 3-line clamp actually hides something.
  const measureDesc = useCallback((node: HTMLParagraphElement | null) => {
    if (node) setDescOverflow(node.scrollHeight > node.clientHeight + 2);
  }, []);

  const retag = useMutation({
    mutationFn: (vars: { id: string; category: string }) =>
      api.setSkillTags({ id: vars.id, category: vars.category }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.skills });
      queryClient.invalidateQueries({ queryKey: queryKeys.skillDetail(selectedId) });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Could not change the category');
    },
  });

  if (!selectedId) {
    return (
      <div className="skill-detail skill-detail-empty">
        <Sparkles size={30} className="skill-empty-icon" />
        <h2>Pick a skill</h2>
        <p>
          Skills are the instructions your agents load on demand. Choose one on the left to read
          what it does, when to use it and what it saves you — or ask the model directly.
        </p>
      </div>
    );
  }

  if (!skill) {
    return (
      <div className="skill-detail skill-detail-empty">
        <p>{isLoading ? 'Loading skill…' : 'This skill is no longer on disk.'}</p>
      </div>
    );
  }

  const categoryOptions = (snapshot?.groups ?? []).map((group) => ({
    value: group.category,
    label: group.label,
  }));
  const llmReady = snapshot?.llm.configured ?? false;
  const hasAnalysis = text.trim().length > 0;

  return (
    <div className="skill-detail">
      <header className="skill-detail-head">
        <div className="skill-detail-title-row">
          <h2 className="skill-detail-name">{skill.name}</h2>
          <Select
            className="skill-detail-category"
            value={skill.category}
            options={categoryOptions}
            onChange={(event) => retag.mutate({ id: skill.id, category: event.target.value })}
            aria-label="Skill category"
            title={`Category (${skill.category_source})`}
          />
        </div>

        {skill.description && (
          <>
            <p
              ref={measureDesc}
              className={`skill-detail-desc ${descOpen ? 'is-open' : ''}`}
            >
              {skill.summary_es || skill.description}
            </p>
            {skill.summary_es ? (
              <button className="skill-detail-more" onClick={() => setDescOpen((prev) => !prev)}>
                {descOpen ? 'Hide declared description' : 'Declared description (EN)'}
              </button>
            ) : (
              descOverflow && (
                <button className="skill-detail-more" onClick={() => setDescOpen((prev) => !prev)}>
                  {descOpen ? 'Show less' : 'Show full description'}
                </button>
              )
            )}
            {skill.summary_es && descOpen && (
              <p className="skill-detail-declared">{skill.description}</p>
            )}
          </>
        )}

        <div className="skill-detail-meta font-mono">
          <span>{skill.source}</span>
          <span className="skill-detail-path" title={skill.path}>
            {skill.rel_path}
          </span>
          <span>
            {skill.line_count} lines · {skill.file_count} files · {formatBytes(skill.bytes)}
          </span>
          {skill.license && <span>{skill.license}</span>}
        </div>

        {skill.tags.length > 0 && (
          <div className="skill-detail-tags">
            {skill.tags.map((tag) => (
              <span className="skill-tag" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="skill-detail-actions">
          <Button
            variant="primary"
            size="sm"
            leftIcon={hasAnalysis ? <RefreshCw size={14} /> : <Sparkles size={14} />}
            isLoading={isStreaming && !hasAnalysis}
            disabled={!llmReady || isStreaming}
            onClick={() => start(hasAnalysis)}
            title={llmReady ? 'Explain this skill with the model' : 'Configure ROZ_LLM_* in .env'}
          >
            {hasAnalysis ? 'Re-analyze' : 'Explain this skill'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<Compass size={14} />}
            onClick={() => deepDive(skill.id, skill.name)}
            title="Run a pi agent with tools (web + filesystem) against this skill"
          >
            Deep dive with tools
          </Button>
          {isStreaming && (
            <Button variant="ghost" size="sm" leftIcon={<Square size={12} />} onClick={stop}>
              Stop
            </Button>
          )}
        </div>
      </header>

      <div className="skill-detail-body">
        {error && (
          <Alert variant="error" title="Model call failed">
            {error}
          </Alert>
        )}

        {skill.analysis_stale && !isStreaming && (
          <Alert variant="warning" title="Analysis is out of date">
            The SKILL.md changed after this explanation was generated. Re-analyze to refresh it.
          </Alert>
        )}

        <section className="skill-analysis">
          <div className="skill-section-head">
            <h3>What it does for you</h3>
            {skill.analyzed_at && (
              <span className="skill-section-note font-mono">
                {skill.model || 'model'} · {skill.analyzed_at.slice(0, 16).replace('T', ' ')}
              </span>
            )}
          </div>

          {hasAnalysis ? (
            <div className={`skill-analysis-text ${isStreaming ? 'is-streaming' : ''}`}>
              <MarkdownRenderer content={text} />
            </div>
          ) : (
            <p className="skill-analysis-empty">
              {isStreaming
                ? 'Reading the document…'
                : 'No explanation yet. Press “Explain this skill” to have the model translate this document into plain language.'}
            </p>
          )}
        </section>

        <details className="skill-fold">
          <summary>
            <Terminal size={13} /> Instructions · SKILL.md
          </summary>
          <div className="skill-fold-body">
            {data ? (
              <MarkdownRenderer content={data.content} />
            ) : (
              <p className="skill-analysis-empty">Loading…</p>
            )}
          </div>
        </details>

        <details className="skill-fold">
          <summary>
            <Compass size={13} /> Files · {skill.file_count}
          </summary>
          <ul className="skill-file-list font-mono">
            {skill.files.map((file) => (
              <li key={file.path}>
                <span>{file.path}</span>
                <span className="skill-file-size">{formatBytes(file.size)}</span>
              </li>
            ))}
            {skill.file_count > skill.files.length && (
              <li className="skill-file-more">
                + {skill.file_count - skill.files.length} more files
              </li>
            )}
          </ul>
        </details>
      </div>
    </div>
  );
}
