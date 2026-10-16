import { Play } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import './MermaidBlock.css';

interface MermaidBlockProps {
  code: string;
}

type DiagramState =
  | { status: 'loading' }
  | { status: 'ready'; svg: string }
  | { status: 'error'; message: string };

let mermaidInitialized = false;

const renderMermaidSvg = async (code: string, elementId: string): Promise<string> => {
  const { default: mermaid } = await import('mermaid');
  if (!mermaidInitialized) {
    mermaid.initialize({ startOnLoad: false, theme: 'dark' });
    mermaidInitialized = true;
  }
  const { svg } = await mermaid.render(elementId, code);
  return svg;
};

export const MermaidBlock = ({ code }: MermaidBlockProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [diagram, setDiagram] = useState<DiagramState>({ status: 'loading' });
  const diagramId = `mermaid-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  const openDiagram = () => {
    setDiagram({ status: 'loading' });
    setIsOpen(true);
  };

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    renderMermaidSvg(code, diagramId)
      .then((svg) => {
        if (!cancelled) setDiagram({ status: 'ready', svg });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'No se pudo renderizar el diagrama.';
        setDiagram({ status: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, code, diagramId]);

  return (
    <div className="mermaid-block">
      <pre className="mermaid-source">
        <code>{code}</code>
      </pre>

      <div className="mermaid-actions">
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<Play size={14} />}
          onClick={openDiagram}
        >
          Ver gráfico
        </Button>
        <span className="mermaid-hint">Diagrama Mermaid</span>
      </div>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Diagrama"
        size="xl"
        className="mermaid-modal"
      >
        <div className="mermaid-canvas">
          {diagram.status === 'loading' && <p className="mermaid-status">Renderizando diagrama…</p>}
          {diagram.status === 'error' && (
            <Alert variant="error" title="Diagrama inválido">
              {diagram.message}
            </Alert>
          )}
          {diagram.status === 'ready' && (
            <div className="mermaid-svg" dangerouslySetInnerHTML={{ __html: diagram.svg }} />
          )}
        </div>
      </Modal>
    </div>
  );
};
