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
