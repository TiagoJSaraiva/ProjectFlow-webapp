import { MAX_ZOOM, MIN_ZOOM } from './diagram-constants';
import { DiagramPoint, DiagramViewport } from './project-board.model';

export function clampZoom(zoom: number): number {
	return Math.min(Math.max(zoom, MIN_ZOOM), MAX_ZOOM);
}

/** Converte um ponto relativo ao canvas (px) para coordenadas do diagrama. */
export function canvasToWorld(viewport: DiagramViewport, point: DiagramPoint): DiagramPoint {
	return {
		x: (point.x - viewport.offsetX) / viewport.zoom,
		y: (point.y - viewport.offsetY) / viewport.zoom
	};
}

/** Aplica um novo zoom mantendo o ponto do canvas `pointer` fixo na tela. */
export function zoomViewportAt(viewport: DiagramViewport, pointer: DiagramPoint, newZoom: number): DiagramViewport {
	const zoom = clampZoom(newZoom);
	const anchor = canvasToWorld(viewport, pointer);
	return {
		...viewport,
		zoom,
		offsetX: pointer.x - anchor.x * zoom,
		offsetY: pointer.y - anchor.y * zoom
	};
}

/** Viewport que enquadra `bounds` (coordenadas do diagrama) dentro de um canvas `size`, com margem. */
export function fitViewport(
	bounds: { minX: number; minY: number; maxX: number; maxY: number },
	size: { width: number; height: number },
	current: DiagramViewport,
	padding = 48
): DiagramViewport {
	const width = Math.max(bounds.maxX - bounds.minX, 1);
	const height = Math.max(bounds.maxY - bounds.minY, 1);
	const zoom = clampZoom(Math.min((size.width - padding * 2) / width, (size.height - padding * 2) / height));
	return {
		...current,
		zoom,
		offsetX: (size.width - width * zoom) / 2 - bounds.minX * zoom,
		offsetY: (size.height - height * zoom) / 2 - bounds.minY * zoom
	};
}
