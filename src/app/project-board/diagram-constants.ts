export const DEFAULT_RECT = { width: 200, height: 120 };
export const DEFAULT_RADIUS = 64;
export const NODE_NAME_MAX_LENGTH = 35;
export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 2.5;
export const DEFAULT_VIEWPORT = { zoom: 1, offsetX: 0, offsetY: 0, gridSize: 64 };
export const MIN_RECT = { width: 80, height: 50 };
export const MAX_RECT = { width: 600, height: 400 };
export const MIN_RADIUS = 32;
export const MAX_RADIUS = 300;

/** Limita largura/altura/raio aos tamanhos permitidos para um nó. */
export function clampNodeSize(field: 'width' | 'height' | 'radius', value: number): number {
	const [min, max] =
		field === 'width' ? [MIN_RECT.width, MAX_RECT.width] : field === 'height' ? [MIN_RECT.height, MAX_RECT.height] : [MIN_RADIUS, MAX_RADIUS];
	return Math.round(Math.min(Math.max(value, min), max));
}
