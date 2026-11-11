import { findFreePosition } from './node-placement';

describe('findFreePosition', () => {
  it('usa o centro quando não há nós por perto', () => {
    expect(findFreePosition({ x: 100, y: 100 }, [], 'RECTANGLE')).toEqual({ x: 100, y: 100 });
  });

  it('desce em cascata até sair de cima de um nó existente', () => {
    const existing = [{ x: 100, y: 100, type: 'RECTANGLE' as const }];
    const position = findFreePosition({ x: 100, y: 100 }, existing, 'RECTANGLE');
    expect(position.x).toBeGreaterThan(100);
    expect(position.y).toBeGreaterThan(100);
    // não sobrepõe o nó existente (200x120 + 200x120)
    expect(Math.abs(position.x - 100) >= 200 || Math.abs(position.y - 100) >= 120).toBeTrue();
  });

  it('vários nós criados no mesmo ponto nunca se sobrepõem', () => {
    const placed: { x: number; y: number; type: 'CIRCLE' }[] = [];
    for (let i = 0; i < 6; i += 1) {
      const p = findFreePosition({ x: 0, y: 0 }, placed, 'CIRCLE');
      expect(placed.some((n) => Math.abs(n.x - p.x) < 128 && Math.abs(n.y - p.y) < 128)).toBeFalse();
      placed.push({ ...p, type: 'CIRCLE' });
    }
  });
});
