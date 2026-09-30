import {
  AlertCircle,
  Calendar,
  Code2,
  FileText,
  Layers,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Tag,
  User,
  Zap,
} from 'lucide-react';
import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { DocItem } from '../../../types/document';
import './FrontmatterHeader.css';

interface FrontmatterHeaderProps {
  doc: DocItem;
  rawFrontmatter?: string | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const FrontmatterHeader: React.FC<FrontmatterHeaderProps> = ({
  doc,
  rawFrontmatter,
  onRefresh,
  isRefreshing,
}) => {
  const [showRawYaml, setShowRawYaml] = useState(false);

  // Collect all known and custom frontmatter metadata keys
  const rawMeta = (doc.raw_meta || {}) as Record<string, unknown>;

  const getMetaValue = (...keys: string[]): string | null => {
    for (const k of keys) {
      if (rawMeta[k] !== undefined && rawMeta[k] !== null && String(rawMeta[k]).trim()) {
        return String(rawMeta[k]);
      }
      if (doc[k] !== undefined && doc[k] !== null && String(doc[k]).trim()) {
        return String(doc[k]);
      }
    }
    return null;
  };

  const moduleVal = getMetaValue('module', 'modulo', 'area');
  const scopeVal = getMetaValue('scope', 'alcance');
  const priorityVal = getMetaValue('priority', 'prioridad', 'criticality', 'criticidad');
  const dateVal = getMetaValue('date', 'fecha', 'updated', 'created', 'last_updated');
  const sourceVal = getMetaValue('source', 'fuente', 'author', 'autor');
  const versionVal = getMetaValue('version', 'versión', 'ver');
  const statusVal = doc.status || getMetaValue('status', 'estado');

  // Any other custom frontmatter fields
  const standardKeys = new Set([
    'name', 'title', 'titulo', 'module', 'modulo', 'area', 'scope', 'alcance',
    'priority', 'prioridad', 'criticality', 'criticidad', 'date', 'fecha',
    'updated', 'created', 'last_updated', 'source', 'fuente', 'author', 'autor',
    'version', 'versión', 'ver', 'status', 'estado', 'description', 'descripcion',
    'summary', 'resumen', 'path', 'parent', 'root', 'has_frontmatter', 'raw_meta'
  ]);

  const customFields = Object.entries(rawMeta).filter(
    ([k, v]) => !standardKeys.has(k.toLowerCase()) && v !== undefined && v !== null && String(v).trim() !== ''
  );

  return (
    <div className="fm-header">
      {/* Title + Status */}
      <div className="fm-top">
        <div className="fm-title-group">
          <h1 className="fm-title">{doc.title || doc.name}</h1>
          <span className="fm-filename font-mono">{doc.name}</span>
        </div>
        <div className="fm-top-badges">
          {onRefresh && (
            <Button
              variant="ghost"
              size="xs"
              onClick={onRefresh}
              isLoading={isRefreshing}
              leftIcon={<RefreshCw size={13} />}
              title="Reload document from disk"
            >
              Refresh
            </Button>
          )}
          {statusVal && (
            <Badge variant={statusVal} size="md" dot>
              {statusVal}
            </Badge>
          )}
          {rawFrontmatter && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setShowRawYaml(!showRawYaml)}
              leftIcon={<Code2 size={13} />}
              title="Toggle raw YAML frontmatter"
            >
              {showRawYaml ? 'Hide YAML' : 'YAML'}
            </Button>
          )}
        </div>
      </div>

      {/* Frontmatter Metadata Chips Grid */}
      <div className="fm-fields">
        {moduleVal && (
          <div className="fm-chip">
            <span className="fm-chip-icon"><Layers size={13} /></span>
            <span className="fm-chip-label">Module:</span>
            <span className="fm-chip-value">{moduleVal}</span>
          </div>
        )}

        {scopeVal && (
          <div className="fm-chip">
            <span className="fm-chip-icon"><Tag size={13} /></span>
            <span className="fm-chip-label">Scope:</span>
            <span className="fm-chip-value">{scopeVal}</span>
          </div>
        )}

        {priorityVal && (
          <div className="fm-chip">
            <span className="fm-chip-icon"><ShieldAlert size={13} /></span>
            <span className="fm-chip-label">Criticality:</span>
            <span className="fm-chip-value">{priorityVal}</span>
          </div>
        )}

        {dateVal && (
          <div className="fm-chip">
            <span className="fm-chip-icon"><Calendar size={13} /></span>
            <span className="fm-chip-label">Date:</span>
            <span className="fm-chip-value">{dateVal}</span>
          </div>
        )}

        {versionVal && (
          <div className="fm-chip">
            <span className="fm-chip-icon"><Zap size={13} /></span>
            <span className="fm-chip-label">Version:</span>
            <span className="fm-chip-value">{versionVal}</span>
          </div>
        )}

        {sourceVal && (
          <div className="fm-chip">
            <span className="fm-chip-icon"><User size={13} /></span>
            <span className="fm-chip-label">Source:</span>
            <span className="fm-chip-value">{sourceVal}</span>
          </div>
        )}

        {customFields.map(([k, v]) => (
          <div key={k} className="fm-chip">
            <span className="fm-chip-icon"><Sparkles size={13} /></span>
            <span className="fm-chip-label">{k}:</span>
            <span className="fm-chip-value">{String(v)}</span>
          </div>
        ))}
      </div>

      {/* Raw YAML collapsible drawer */}
      {showRawYaml && rawFrontmatter && (
        <div className="fm-raw-yaml animate-fade-in">
          <div className="fm-raw-yaml-header">
            <Code2 size={12} />
            <span>YAML Frontmatter (raw)</span>
          </div>
          <pre className="font-mono">{rawFrontmatter}</pre>
        </div>
      )}

      {/* Description / Summary if present and not a raw metadata table */}
      {doc.description && !doc.description.startsWith('**Módulo:**') && !doc.description.startsWith('**') && (
        <div className="fm-description">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {doc.description}
          </ReactMarkdown>
        </div>
      )}

      {/* Filepath Bar */}
      <div className="fm-path">
        <FileText size={13} />
        <span className="font-mono">{doc.path}</span>
      </div>
    </div>
  );
};
