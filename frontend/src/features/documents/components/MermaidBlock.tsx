import { Maximize2, Play, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { useDiagramViewport } from '../hooks/useDiagramViewport';
import './MermaidBlock.css';

interface MermaidBlockProps {
  code: string;
}

type DiagramState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; svg: string; width: number; height: number }
  | { status: 'error'; message: string };

// Pele draws the diagram wide enough to be readable and the viewport scales it to fit, so the
// natural canvas does not depend on the modal's current width.
const RENDER_WIDTH = 1000;
const ZOOM_STEP = 1.25;

const EMPTY_CONTENT = { width: 0, height: 0 };

// Pele escapes diagram text and filters links and styles before it builds the SVG, and the
// markup is its own output, not the document's: it is inserted as-is, the documented usage.
const renderDiagram = async (code: string, idPrefix: string) => {
  const { renderAsync } = await import('pele/lazy');
  const { svg, width, height } = await renderAsync(code, {
    maxWidth: RENDER_WIDTH,
    responsive: false,
    idPrefix,
  });
  return { svg, width, height };
};

export const MermaidBlock = ({ code }: MermaidBlockProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [diagram, setDiagram] = useState<DiagramState>({ status: 'idle' });
  const diagramId = `diagram-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const content = diagram.status === 'ready' ? diagram : EMPTY_CONTENT;
  const { viewportRef, transform, zoomPercent, isZoomed, showsEverything, zoomBy, reset, fitAll, handlers } =
    useDiagramViewport(content, isOpen);

  const openDiagram = () => {
    setIsOpen(true);
    if (diagram.status === 'ready' || diagram.status === 'loading') return;
    setDiagram({ status: 'loading' });
    renderDiagram(code, diagramId)
      .then((result) => setDiagram({ status: 'ready', ...result }))
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'No se pudo renderizar el diagrama.';
        setDiagram({ status: 'error', message });
      });
  };

  // Escape first returns the drawing to its fit scale; only the next one closes the modal. The
  // listener runs in the capture phase on window so the modal never sees the first press.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !isZoomed) return;
      event.stopPropagation();
      reset();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen, isZoomed, reset]);

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
        closeOnBackdrop={false}
      >
        <div className="mermaid-canvas">
          {diagram.status === 'error' && (
            <>
              <Alert variant="error" title="Diagrama inválido">
                {diagram.message}
              </Alert>
              <p className="mermaid-hint">
                Revisa el bloque en el documento: los paréntesis y caracteres especiales dentro de una
                etiqueta necesitan comillas, y en las secuencias el punto y coma corta la línea.
              </p>
            </>
          )}

          {diagram.status !== 'error' && (
            <>
              <div className="mermaid-toolbar">
                <Button
                  variant="ghost"
                  size="xs"
                  aria-label="Alejar"
                  onClick={() => zoomBy(1 / ZOOM_STEP)}
                >
                  <ZoomOut size={15} />
                </Button>
                <span className="mermaid-zoom">{zoomPercent}%</span>
                <Button
                  variant="ghost"
                  size="xs"
                  aria-label="Acercar"
                  onClick={() => zoomBy(ZOOM_STEP)}
                >
                  <ZoomIn size={15} />
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  aria-label="Ver el diagrama completo"
                  title="Ver el diagrama completo"
                  onClick={fitAll}
                  disabled={showsEverything}
                >
                  <Maximize2 size={15} />
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  aria-label="Volver a la vista inicial"
                  title="Volver a la vista inicial"
                  onClick={reset}
                  disabled={!isZoomed}
                >
                  <RotateCcw size={15} />
                </Button>
                <span className="mermaid-hint">Rueda: zoom · Arrastra: mover · Doble clic: alternar</span>
              </div>

              <div
                className="mermaid-viewport"
                ref={viewportRef}
                tabIndex={0}
                role="group"
                aria-label="Diagrama interactivo"
                {...handlers}
              >
                {diagram.status === 'loading' && <p className="mermaid-status">Renderizando diagrama…</p>}
                {diagram.status === 'ready' && (
                  <div
                    className="mermaid-drawing"
                    style={{
                      width: `${diagram.width}px`,
                      height: `${diagram.height}px`,
                      transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
                    }}
                    dangerouslySetInnerHTML={{ __html: diagram.svg }}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
};
