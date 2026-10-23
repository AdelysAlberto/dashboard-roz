export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface ViewportTransform {
  scale: number;
  x: number;
  y: number;
}

/** A diagram is never shown smaller than the scale that fits it in the viewport. */
export const MAX_SCALE = 4;

export const fitScaleFor = (content: Size, viewport: Size): number => {
  if (content.width <= 0 || content.height <= 0) return 1;
  if (viewport.width <= 0 || viewport.height <= 0) return 1;
  return Math.min(viewport.width / content.width, viewport.height / content.height, 1);
};

/**
 * Scale the drawing opens at: as wide as the box allows, never beyond its natural size. A
 * drawing taller than the box reads at full size and is panned; shrinking it to fit whole made
 * most diagrams in the corpus open at 30-60 %.
 */
export const baselineScaleFor = (content: Size, viewport: Size): number => {
  if (content.width <= 0 || content.height <= 0) return 1;
  if (viewport.width <= 0 || viewport.height <= 0) return 1;
  return Math.min(viewport.width / content.width, 1);
};

/** Keeps the drawing inside the viewport: centred while it fits, edge-locked once it does not. */
const clampAxis = (value: number, scaled: number, view: number): number => {
  if (scaled <= view) return (view - scaled) / 2;
  return Math.min(0, Math.max(view - scaled, value));
};

export const clampTransform = (
  content: Size,
  viewport: Size,
  transform: ViewportTransform
): ViewportTransform => ({
  scale: transform.scale,
  x: clampAxis(transform.x, content.width * transform.scale, viewport.width),
  y: clampAxis(transform.y, content.height * transform.scale, viewport.height),
});

export const fitTransform = (
  content: Size,
  viewport: Size,
  scale: number = fitScaleFor(content, viewport)
): ViewportTransform => clampTransform(content, viewport, { scale, x: 0, y: 0 });

export const baselineTransform = (content: Size, viewport: Size): ViewportTransform =>
  clampTransform(content, viewport, { scale: baselineScaleFor(content, viewport), x: 0, y: 0 });

/** Rescales keeping the point under `anchor` (viewport pixels) where it is. */
export const zoomAtPoint = (
  content: Size,
  viewport: Size,
  current: ViewportTransform,
  nextScale: number,
  anchor: Point
): ViewportTransform => {
  const floor = fitScaleFor(content, viewport);
  const scale = Math.min(Math.max(nextScale, floor), Math.max(floor, MAX_SCALE));
  if (current.scale <= 0) return fitTransform(content, viewport, scale);
  const ratio = scale / current.scale;
  return clampTransform(content, viewport, {
    scale,
    x: anchor.x - (anchor.x - current.x) * ratio,
    y: anchor.y - (anchor.y - current.y) * ratio,
  });
};
