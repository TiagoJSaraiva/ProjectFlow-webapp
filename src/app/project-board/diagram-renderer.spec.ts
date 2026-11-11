import { DiagramRenderer, RendererEvents } from './diagram-renderer';
import { DiagramNode } from './project-board.model';

describe('DiagramRenderer', () => {
  let container: HTMLDivElement;
  let renderer: DiagramRenderer;

  const events: RendererEvents = {
    getViewport: () => ({ zoom: 1, offsetX: 0, offsetY: 0, gridSize: 64 }),
    nodeClick: () => undefined,
    nodeDragMove: () => undefined,
    nodeDragEnd: () => undefined,
    nodeResize: () => undefined,
    nodeResizeEnd: () => undefined,
    backgroundClick: () => undefined,
    viewportChange: () => undefined
  };

  const nodes: DiagramNode[] = [
    { id: 'a', type: 'RECTANGLE', name: 'Início', description: '', x: 0, y: 0, rotation: 0 },
    { id: 'b', type: 'CIRCLE', name: 'Fim', description: '', x: 400, y: 100, rotation: 0 }
  ];

  beforeEach(() => {
    container = document.createElement('div');
    container.style.width = '600px';
    container.style.height = '400px';
    document.body.appendChild(container);
    renderer = new DiagramRenderer(container, events);
  });

  afterEach(() => {
    renderer.destroy();
    container.remove();
  });

  it('exporta o diagrama inteiro como PNG', () => {
    const url = renderer.exportPng(nodes, [{ id: 'c', fromNodeId: 'a', toNodeId: 'b' }]);
    expect(url).toMatch(/^data:image\/png;base64,/);
    expect(url!.length).toBeGreaterThan(500);
  });

  it('não exporta PNG quando não há elementos', () => {
    expect(renderer.exportPng([], [])).toBeNull();
  });

  it('desenha nós e conexões sem erros, inclusive com alça de redimensionamento', () => {
    expect(() => {
      renderer.setViewport({ zoom: 0.8, offsetX: 10, offsetY: 10, gridSize: 64 });
      renderer.renderNodes(nodes, 'a');
      renderer.renderConnections(nodes, [{ id: 'c', fromNodeId: 'a', toNodeId: 'b' }]);
    }).not.toThrow();
  });

  describe('redimensionamento por alça', () => {
    function handleOf(): any {
      return (renderer as any).nodeGroup.findOne('.resize-handle');
    }

    it('arrastar a alça redimensiona e NÃO conta como mover o nó', () => {
      const spies = {
        ...events,
        nodeDragEnd: jasmine.createSpy('nodeDragEnd'),
        nodeDragMove: jasmine.createSpy('nodeDragMove'),
        nodeResize: jasmine.createSpy('nodeResize'),
        nodeResizeEnd: jasmine.createSpy('nodeResizeEnd')
      };
      renderer.destroy();
      renderer = new DiagramRenderer(container, spies);
      renderer.renderNodes(nodes, 'a');

      const handle = handleOf();
      handle.position({ x: 150, y: 90 });
      handle.fire('dragmove', {}, true);
      handle.fire('dragend', {}, true);

      expect(spies.nodeResize).toHaveBeenCalledWith('a', { width: 300, height: 180 });
      expect(spies.nodeResizeEnd).toHaveBeenCalledWith('a', { width: 300, height: 180 });
      expect(spies.nodeDragMove).not.toHaveBeenCalled();
      expect(spies.nodeDragEnd).not.toHaveBeenCalled();
    });

    it('respeita os tamanhos mínimos ao encolher', () => {
      const resize = jasmine.createSpy('nodeResizeEnd');
      renderer.destroy();
      renderer = new DiagramRenderer(container, { ...events, nodeResizeEnd: resize });
      renderer.renderNodes(nodes, 'a');
      const handle = handleOf();
      handle.position({ x: 5, y: 5 });
      handle.fire('dragend', {}, true);
      expect(resize).toHaveBeenCalledWith('a', { width: 80, height: 50 });

      renderer.renderNodes(nodes, 'b');
      const circleHandle = handleOf();
      circleHandle.position({ x: 3, y: 0 });
      circleHandle.fire('dragend', {}, true);
      expect(resize).toHaveBeenCalledWith('b', { radius: 32 });
    });
  });
});
