import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  baselineTransform,
  clampTransform,
  fitScaleFor,
  fitTransform,
  zoomAtPoint,
  type Point,
  type Size,
  type ViewportTransform,
} from '../../../utils/diagramViewport';

const PAN_STEP = 48;
const KEY_STEP = 1.25;

interface GestureState {
  pointerId: number;
  x: number;
  y: number;
}

export interface DiagramViewport {
  viewportRef: RefObject<HTMLDivElement | null>;
  transform: ViewportTransform;
  /** Scale as a percentage of the drawing's natural size: 100 is one pixel per pixel. */
  zoomPercent: number;
  isZoomed: boolean;
  showsEverything: boolean;
  zoomBy: (factor: number) => void;
  /** Back to the view the diagram opened with. */
  reset: () => void;
  /** The whole drawing inside the box, however small that makes it. */
  fitAll: () => void;
  handlers: {
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onDoubleClick: (event: ReactMouseEvent<HTMLDivElement>) => void;
    onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  };
}

const anchorFrom = (element: HTMLElement, clientX: number, clientY: number): Point => {
  const rect = element.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
};

/**
 * Fit-and-centre viewport for a rendered SVG: wheel or buttons zoom at the pointer, dragging
 * pans, double click toggles. Panning is clamped so the drawing never leaves the box.
 *
 * The stored transform is `null` while the drawing rests at its opening scale, so a change of
 * viewport or drawing size re-fits it without an effect here.
 */
export const useDiagramViewport = (content: Size, active: boolean): DiagramViewport => {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<GestureState | null>(null);
  const [viewport, setViewport] = useState<Size>({ width: 0, height: 0 });
  const [zoom, setZoom] = useState<ViewportTransform | null>(null);

  const contentSize: Size = { width: content.width, height: content.height };
  const viewportSize: Size = { width: viewport.width, height: viewport.height };
  const resting = baselineTransform(contentSize, viewportSize);
  const transform = zoom ?? resting;
  const showsEverything = transform.scale <= fitScaleFor(contentSize, viewportSize) + 0.001;

  useEffect(() => {
    if (!active) return;
    const element = viewportRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      setViewport({ width: element.clientWidth, height: element.clientHeight });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [active]);

  const applyZoom = (factor: number, anchor: Point) => {
    setZoom((current) => {
      const from = current ?? resting;
      return zoomAtPoint(contentSize, viewportSize, from, from.scale * factor, anchor);
    });
  };

  const zoomBy = (factor: number) => applyZoom(factor, { x: viewport.width / 2, y: viewport.height / 2 });

  const reset = () => setZoom(null);

  const fitAll = () => setZoom(fitTransform(contentSize, viewportSize));

  const pan = (dx: number, dy: number) => {
    setZoom((current) => {
      const from = current ?? resting;
      return clampTransform(contentSize, viewportSize, { scale: from.scale, x: from.x + dx, y: from.y + dy });
    });
  };

  useEffect(() => {
    if (!active) return;
    const element = viewportRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      // The drawing owns the wheel: in a modal, scrolling the page under the diagram is not a
      // useful gesture and it fights the zoom.
      event.preventDefault();
      // A mouse notch is a hundred or more; a trackpad pinch sends many small deltas.
      const turn = Math.min(Math.max(-event.deltaY, -40), 40);
      const anchor = anchorFrom(element, event.clientX, event.clientY);
      const drawing: Size = { width: content.width, height: content.height };
      const box: Size = { width: viewport.width, height: viewport.height };
      setZoom((current) => {
        const from = current ?? baselineTransform(drawing, box);
        return zoomAtPoint(drawing, box, from, from.scale * Math.exp(turn * 0.004), anchor);
      });
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [active, content.width, content.height, viewport.width, viewport.height]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    pan(dx, dy);
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const onDoubleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (Math.abs(transform.scale - resting.scale) > 0.001) {
      reset();
      return;
    }
    applyZoom(2, anchorFrom(event.currentTarget, event.clientX, event.clientY));
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case '+':
      case '=':
        zoomBy(KEY_STEP);
        break;
      case '-':
        zoomBy(1 / KEY_STEP);
        break;
      case '0':
        reset();
        break;
      case 'ArrowLeft':
        pan(PAN_STEP, 0);
        break;
      case 'ArrowRight':
        pan(-PAN_STEP, 0);
        break;
      case 'ArrowUp':
        pan(0, PAN_STEP);
        break;
      case 'ArrowDown':
        pan(0, -PAN_STEP);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  return {
    viewportRef,
    transform,
    zoomPercent: Math.round(transform.scale * 100),
    isZoomed:
      Math.abs(transform.scale - resting.scale) > 0.001 ||
      Math.abs(transform.x - resting.x) > 0.5 ||
      Math.abs(transform.y - resting.y) > 0.5,
    showsEverything,
    zoomBy,
    reset,
    fitAll,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onDoubleClick,
      onKeyDown,
    },
  };
};
