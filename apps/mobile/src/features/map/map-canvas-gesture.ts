export interface MapViewportTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export function panMapViewport(
  viewport: MapViewportTransform,
  deltaX: number,
  deltaY: number
): MapViewportTransform {
  return {
    ...viewport,
    offsetX: viewport.offsetX + deltaX,
    offsetY: viewport.offsetY + deltaY
  };
}

export function zoomMapViewport(
  viewport: MapViewportTransform,
  factor: number,
  focalX: number,
  focalY: number,
  width: number,
  height: number
): MapViewportTransform {
  const scale = Math.min(4, Math.max(1, viewport.scale * factor));
  const ratio = scale / viewport.scale;
  const centerX = width / 2;
  const centerY = height / 2;
  return {
    scale,
    offsetX: focalX - centerX - (focalX - centerX - viewport.offsetX) * ratio,
    offsetY: focalY - centerY - (focalY - centerY - viewport.offsetY) * ratio
  };
}
