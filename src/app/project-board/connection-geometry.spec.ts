import { computeBendPoint, connectionPath, nodeHalfExtents, nodesBounds, recomputeBendPoints } from './connection-geometry';
import { DiagramConnection, DiagramNode } from './project-board.model';

function node(id: string, x: number, y: number, extra: Partial<DiagramNode> = {}): DiagramNode {
  return { id, type: 'RECTANGLE', name: id, description: '', x, y, rotation: 0, ...extra };
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

  describe('nodeHalfExtents / nodesBounds', () => {
    it('usa largura/altura do retângulo e o raio do círculo', () => {
      expect(nodeHalfExtents(node('r', 0, 0, { width: 100, height: 40 }))).toEqual({ hw: 50, hh: 20 });
      expect(nodeHalfExtents(node('c', 0, 0, { type: 'CIRCLE', radius: 30 }))).toEqual({ hw: 30, hh: 30 });
      expect(nodeHalfExtents(node('d', 0, 0))).toEqual({ hw: 100, hh: 60 });
    });

    it('calcula a caixa que contém todos os nós', () => {
      const bounds = nodesBounds([node('a', 0, 0), node('b', 300, 200, { type: 'CIRCLE', radius: 64 })]);
      expect(bounds).toEqual({ minX: -100, minY: -60, maxX: 364, maxY: 264 });
      expect(nodesBounds([])).toBeNull();
    });
  });

  describe('connectionPath', () => {
    it('liga as bordas em "L" e termina na borda do destino (onde fica a seta)', () => {
      const path = connectionPath(node('a', 0, 0), node('b', 300, 200))!;
      // horizontal primeiro: sai pela direita de a (x=100), dobra em (300,0), chega por cima de b (y=140)
      expect(path).toEqual([
        { x: 100, y: 0 },
        { x: 300, y: 0 },
        { x: 300, y: 140 }
      ]);
    });

    it('usa o raio do círculo como borda', () => {
      const path = connectionPath(node('a', 0, 0, { type: 'CIRCLE', radius: 64 }), node('b', 400, 0))!;
      expect(path[0]).toEqual({ x: 64, y: 0 });
      expect(path[path.length - 1]).toEqual({ x: 300, y: 0 });
    });

    it('nós alinhados formam uma reta de duas pontas', () => {
      const path = connectionPath(node('a', 0, 0), node('b', 0, 300))!;
      expect(path).toEqual([
        { x: 0, y: 60 },
        { x: 0, y: 240 }
      ]);
    });

    it('quase alinhados: o "L" não cabe fora dos nós, então usa reta', () => {
      const path = connectionPath(node('a', 0, 0), node('b', 400, 30))!;
      expect(path.length).toBe(2);
      expect(path[0].y).toBe(path[1].y);
      expect(path[1].x).toBe(300);
    });

    it('nós sobrepostos não têm linha', () => {
      expect(connectionPath(node('a', 0, 0), node('b', 0, 0))).toBeNull();
      expect(connectionPath(node('a', 0, 0), node('b', 20, 10))).toBeNull();
    });
  });
});
