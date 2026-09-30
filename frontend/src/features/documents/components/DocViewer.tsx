import { RefreshCw } from 'lucide-react';
import React, { useMemo } from 'react';
import rozSvg from '../../../assets/roz.svg';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { useDocSelectionStore } from '../../../stores/useDocSelectionStore';
import { useDocumentDetail } from '../hooks/useDocumentDetail';
import { FrontmatterHeader } from './FrontmatterHeader';
import { MarkdownRenderer } from './MarkdownRenderer';
import './DocViewer.css';

export const DocViewer: React.FC = () => {
  const selectedDoc = useDocSelectionStore((state) => state.selectedDoc);
  const { data, isLoading, isFetching, error, refetch } = useDocumentDetail(selectedDoc?.path ?? null);

  const { rawFrontmatter, bodyContent } = useMemo(() => {
    if (!data?.content) return { rawFrontmatter: null, bodyContent: '' };
    const m = data.content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
    if (m) {
      return {
        rawFrontmatter: m[1].trim(),
        bodyContent: data.content.slice(m[0].length),
      };
    }
    return { rawFrontmatter: null, bodyContent: data.content };
  }, [data?.content]);

  if (!selectedDoc) {
    return (
      <div className="viewer-empty animate-fade-in">
        <div className="viewer-empty-hero">
          <div className="roz-avatar-wrapper">
            <img src={rozSvg} alt="Roz - Monsters Inc." className="roz-avatar" />
          </div>
          <div className="ascii-logo">
            <pre>{`╔══════════════════════╗
║  roz  ::  md-tracker ║
╚══════════════════════╝`}</pre>
          </div>
        </div>
        <p className="viewer-empty-quote">
          “Siempre te estoy observando, Wazowski... siempre.”
        </p>
        <p className="viewer-empty-instruction">
          Selecciona un documento del sidebar para revisar el papeleo técnico.<br />
          O añade nuevas rutas de escaneo con <strong>Paths</strong> en la barra superior.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="viewer-loading-state">
        <div className="btn-spinner" style={{ width: '2rem', height: '2rem' }} />
        <p>Loading document content…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="viewer-error-state">
        <Alert variant="error" title="Could not load document">
          {error instanceof Error ? error.message : 'Unknown error reading file'}
        </Alert>
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<RefreshCw size={14} />}
          onClick={() => refetch()}
        >
          Retry
        </Button>
      </div>
    );
  }

  // Merge metadata from detail endpoint if available
  const docMeta = data.meta ? { ...selectedDoc, ...data.meta } : selectedDoc;

  return (
    <article className="doc-viewer-container animate-fade-in">
      <FrontmatterHeader
        doc={docMeta}
        rawFrontmatter={rawFrontmatter}
        onRefresh={() => refetch()}
        isRefreshing={isFetching}
      />
      <MarkdownRenderer content={bodyContent} />
    </article>
  );
};
