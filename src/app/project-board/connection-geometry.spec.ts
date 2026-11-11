import { computeBendPoint, recomputeBendPoints } from './connection-geometry';
import { DiagramConnection, DiagramNode } from './project-board.model';

function node(id: string, x: number, y: number): DiagramNode {
  return { id, type: 'RECTANGLE', name: id, description: '', x, y, rotation: 0 };
}

describe('connection-geometry', () => {
  it('dobra no eixo horizontal primeiro quando a distância em x é maior', () => {
    expect(computeBendPoint({ x: 0, y: 0 }, { x: 300, y: 100 })).toEqual({ x: 300, y: 0 });
  });

  it('dobra no eixo vertical primeiro quando a distância em y é maior', () => {
    expect(computeBendPoint({ x: 0, y: 0 }, { x: 50, y: 200 })).toEqual({ x: 0, y: 200 });
  });

  it('recalcula só as conexões do nó movido', () => {
    const nodes = [node('a', 0, 0), node('b', 300, 100), node('c', 10, 10)];
    const connections: DiagramConnection[] = [
      { id: '1', fromNodeId: 'a', toNodeId: 'b', bendPoint: { x: 300, y: 0 } },
      { id: '2', fromNodeId: 'c', toNodeId: 'c', bendPoint: { x: 1, y: 1 } }
    ];
    const moved = nodes.map((n) => (n.id === 'b' ? { ...n, x: 20, y: 400 } : n));

    const result = recomputeBendPoints(connections, moved, 'b');

    expect(result[0].bendPoint).toEqual({ x: 0, y: 400 });
    expect(result[1]).toBe(connections[1]);
  });
});
