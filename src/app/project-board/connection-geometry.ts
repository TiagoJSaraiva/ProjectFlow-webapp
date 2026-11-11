import { DiagramConnection, DiagramNode, DiagramPoint } from './project-board.model';

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
