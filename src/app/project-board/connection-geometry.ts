import { DEFAULT_RADIUS, DEFAULT_RECT } from './diagram-constants';
import { DiagramConnection, DiagramNode, DiagramPoint } from './project-board.model';

type NodeShape = Pick<DiagramNode, 'x' | 'y'> & Partial<Pick<DiagramNode, 'type' | 'width' | 'height' | 'radius'>>;

/** Ponto de dobra da conexão em "L": percorre primeiro o eixo de maior distância. */
export function computeBendPoint(source: Pick<DiagramNode, 'x' | 'y'>, target: Pick<DiagramNode, 'x' | 'y'>): DiagramPoint {
	const horizontalFirst = Math.abs(target.x - source.x) > Math.abs(target.y - source.y);
	return horizontalFirst ? { x: target.x, y: source.y } : { x: source.x, y: target.y };
}

/** Recalcula o ponto de dobra das conexões ligadas ao nó informado (use após mover o nó). */
export function recomputeBendPoints(
	connections: DiagramConnection[],
	nodes: DiagramNode[],
	movedNodeId: string
): DiagramConnection[] {
	const byId = new Map(nodes.map((node) => [node.id, node] as const));
	return connections.map((connection) => {
		if (connection.fromNodeId !== movedNodeId && connection.toNodeId !== movedNodeId) {
			return connection;
		}
		const from = byId.get(connection.fromNodeId);
		const to = byId.get(connection.toNodeId);
		return from && to ? { ...connection, bendPoint: computeBendPoint(from, to) } : connection;
	});
}

/** Metade da largura e da altura do nó (o círculo usa o raio nos dois eixos). */
export function nodeHalfExtents(node: NodeShape): { hw: number; hh: number } {
	if (node.type === 'CIRCLE') {
		const radius = node.radius ?? DEFAULT_RADIUS;
		return { hw: radius, hh: radius };
	}
	return { hw: (node.width ?? DEFAULT_RECT.width) / 2, hh: (node.height ?? DEFAULT_RECT.height) / 2 };
}

/** Caixa que contém todos os nós, ou `null` se não houver nenhum. */
export function nodesBounds(nodes: NodeShape[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
	if (!nodes.length) {
		return null;
	}
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const node of nodes) {
		const { hw, hh } = nodeHalfExtents(node);
		minX = Math.min(minX, node.x - hw);
		minY = Math.min(minY, node.y - hh);
		maxX = Math.max(maxX, node.x + hw);
		maxY = Math.max(maxY, node.y + hh);
	}
	return { minX, minY, maxX, maxY };
}

const sign = (value: number): number => (value > 0 ? 1 : value < 0 ? -1 : 0);

/**
 * Pontos da linha da conexão, do contorno do nó de origem ao contorno do nó de destino (a seta fica
 * na última ponta). O trajeto é em "L"; quando os nós estão quase alinhados e o "L" não cabe fora dos
 * nós, usa-se uma reta. Devolve `null` se os nós se sobrepõem a ponto de não haver linha visível.
 */
export function connectionPath(from: NodeShape, to: NodeShape): DiagramPoint[] | null {
	const bend = computeBendPoint(from, to);
	const d1 = { x: sign(bend.x - from.x), y: sign(bend.y - from.y) };
	const d2 = { x: sign(to.x - bend.x), y: sign(to.y - bend.y) };
	const len1 = Math.abs(bend.x - from.x) + Math.abs(bend.y - from.y);
	const len2 = Math.abs(to.x - bend.x) + Math.abs(to.y - bend.y);
	const a = nodeHalfExtents(from);
	const b = nodeHalfExtents(to);
	const off = (ext: { hw: number; hh: number }, dir: { x: number; y: number }) => (dir.x !== 0 ? ext.hw : ext.hh);

	if (len1 === 0 && len2 === 0) {
		return null;
	}
	// Direções efetivas quando um dos trechos tem comprimento zero (nós alinhados).
	const dirStart = len1 > 0 ? d1 : d2;
	const dirEnd = len2 > 0 ? d2 : d1;
	const startOff = off(a, dirStart);
	const endOff = off(b, dirEnd);

	const shortFirst = len1 > 0 && len1 <= startOff; // dobra dentro do nó de origem
	const shortLast = len2 > 0 && len2 <= endOff; // dobra dentro do nó de destino

	if (shortFirst && shortLast) {
		return null;
	}
	if (shortLast) {
		// segue só o primeiro trecho (na altura/coluna da origem) até a borda do destino
		const end = { x: to.x - d1.x * off(b, d1), y: to.y - d1.y * off(b, d1) };
		if (d1.x !== 0) {
			end.y = bend.y;
		} else {
			end.x = bend.x;
		}
		const start = { x: from.x + d1.x * off(a, d1), y: from.y + d1.y * off(a, d1) };
		return isForward(start, end, d1) ? [start, end] : null;
	}
	if (shortFirst) {
		const start = { x: from.x + d2.x * off(a, d2), y: from.y + d2.y * off(a, d2) };
		if (d2.x !== 0) {
			start.y = bend.y;
		} else {
			start.x = bend.x;
		}
		const end = { x: to.x - d2.x * off(b, d2), y: to.y - d2.y * off(b, d2) };
		return isForward(start, end, d2) ? [start, end] : null;
	}

	const start = { x: from.x + dirStart.x * startOff, y: from.y + dirStart.y * startOff };
	const end = { x: to.x - dirEnd.x * endOff, y: to.y - dirEnd.y * endOff };
	if (len1 === 0 || len2 === 0) {
		return isForward(start, end, len1 === 0 ? d2 : d1) ? [start, end] : null;
	}
	return [start, bend, end];
}

function isForward(start: DiagramPoint, end: DiagramPoint, dir: { x: number; y: number }): boolean {
	return (end.x - start.x) * dir.x + (end.y - start.y) * dir.y > 0;
}
