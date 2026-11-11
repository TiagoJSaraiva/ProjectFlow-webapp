import { canvasToWorld, clampZoom, zoomViewportAt } from './viewport-math';

describe('viewport-math', () => {
  const viewport = { zoom: 1, offsetX: 100, offsetY: 50, gridSize: 64 };

  it('limita o zoom entre 0,2 e 2,5', () => {
    expect(clampZoom(0.01)).toBe(0.2);
    expect(clampZoom(10)).toBe(2.5);
    expect(clampZoom(1.3)).toBe(1.3);
  });

  it('converte coordenadas do canvas para o diagrama', () => {
    expect(canvasToWorld({ ...viewport, zoom: 2 }, { x: 300, y: 150 })).toEqual({ x: 100, y: 50 });
  });

  it('mantém o ponto sob o ponteiro fixo ao aplicar zoom', () => {
    const pointer = { x: 400, y: 300 };
    const before = canvasToWorld(viewport, pointer);
    const zoomed = zoomViewportAt(viewport, pointer, 2);
    const after = canvasToWorld(zoomed, pointer);
    expect(zoomed.zoom).toBe(2);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });
});
