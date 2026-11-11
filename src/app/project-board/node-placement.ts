import { nodeHalfExtents } from './connection-geometry';
import { DEFAULT_RADIUS, DEFAULT_RECT } from './diagram-constants';
import { DiagramNode, DiagramNodeType, DiagramPoint } from './project-board.model';

/**
 * Posição para um novo nó: parte de `center` e desce em cascata até não sobrepor nenhum nó existente
 * (com uma pequena folga). Se não achar espaço em 60 tentativas, usa a última posição testada.
 */
export function findFreePosition(
	center: DiagramPoint,
	existing: Pick<DiagramNode, 'x' | 'y' | 'type' | 'width' | 'height' | 'radius'>[],
	type: DiagramNodeType,
	step = 40
): DiagramPoint {
	const size = nodeHalfExtents(
		type === 'CIRCLE'
			? { x: 0, y: 0, type, radius: DEFAULT_RADIUS }
			: { x: 0, y: 0, type, width: DEFAULT_RECT.width, height: DEFAULT_RECT.height }
	);
	const margin = 8;
	let candidate = { ...center };
	for (let attempt = 0; attempt < 60; attempt += 1) {
		candidate = { x: center.x + attempt * step, y: center.y + attempt * step };
		const overlaps = existing.some((node) => {
			const other = nodeHalfExtents(node);
			return Math.abs(node.x - candidate.x) < other.hw + size.hw + margin && Math.abs(node.y - candidate.y) < other.hh + size.hh + margin;
		});
		if (!overlaps) {
			return candidate;
		}
	}
	return candidate;
}
