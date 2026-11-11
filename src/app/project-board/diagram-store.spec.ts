import { TestBed } from '@angular/core/testing';
import { DiagramStore } from './diagram-store';
import { ProjectDiagramResponse } from './project-board.model';

const RESPONSE: ProjectDiagramResponse = {
  projectId: 'p1',
  projectName: 'Fluxo',
  projectDescription: 'Desc',
  viewport: { zoom: 1, offsetX: 0, offsetY: 0, gridSize: 64 },
  nodes: [
    { id: 'a', type: 'RECTANGLE', name: 'A', description: '', x: 0, y: 0, rotation: 0 },
    { id: 'b', type: 'CIRCLE', name: 'B'.repeat(50), description: '', x: 300, y: 100, rotation: 0 }
  ],
  connections: [{ id: 'c1', fromNodeId: 'a', toNodeId: 'b', bendPoint: { x: 300, y: 0 } }]
};

describe('DiagramStore', () => {
  let store: DiagramStore;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [DiagramStore] });
    store = TestBed.inject(DiagramStore);
    store.hydrate(RESPONSE, true, null);
  });

  it('hidrata o estado, limitando o nome dos nós a 35 caracteres', () => {
    expect(store.state().projectName).toBe('Fluxo');
    expect(store.nodes().length).toBe(2);
    expect(store.nodes()[1].name.length).toBe(35);
    expect(store.state().isDirty).toBeFalse();
    expect(store.state().isLoading).toBeFalse();
  });

  it('adiciona nó selecionado e marca como alterado', () => {
    const node = store.addNode('RECTANGLE', { x: 10, y: 20 });
    expect(store.nodes().length).toBe(3);
    expect(store.state().selectedNodeId).toBe(node.id);
    expect(store.state().isDirty).toBeTrue();
    expect(node.width).toBe(200);
  });

  it('mover um nó recalcula o ponto de dobra das conexões ligadas', () => {
    store.moveNode('b', 20, 400);
    expect(store.connections()[0].bendPoint).toEqual({ x: 0, y: 400 });
    expect(store.state().isDirty).toBeTrue();
  });

  it('excluir um nó remove suas conexões e limpa a seleção', () => {
    store.selectNode('a');
    store.deleteNode('a');
    expect(store.nodes().map((n) => n.id)).toEqual(['b']);
    expect(store.connections()).toEqual([]);
    expect(store.state().selectedNodeId).toBeNull();
  });

  it('cria conexão a partir do nó de origem e ignora laço no mesmo nó', () => {
    store.deleteConnection('c1');
    store.startLink('b');
    store.completeConnection('b');
    expect(store.connections().length).toBe(0);

    store.completeConnection('a');
    expect(store.connections().length).toBe(1);
    expect(store.connections()[0].fromNodeId).toBe('b');
    expect(store.connections()[0].toNodeId).toBe('a');
    expect(store.state().linkSourceId).toBeNull();
  });

  it('limita o nome editado a 35 caracteres', () => {
    store.selectNode('a');
    store.updateSelectedNodeField('name', 'x'.repeat(60));
    expect(store.selectedNode()!.name.length).toBe(35);
  });

  it('mensagem de erro de status só aparece como erro quando marcada', () => {
    store.setStatus('Salvo', false);
    expect(store.isErrorStatus()).toBeFalse();
    store.setStatus('Falhou', true);
    expect(store.isErrorStatus()).toBeTrue();
  });

  it('monta o payload de salvamento', () => {
    store.setProjectName('Novo nome');
    const payload = store.buildPayload();
    expect(payload.project).toEqual({ name: 'Novo nome', description: 'Desc' });
    expect(payload.nodes.length).toBe(2);
  });

  describe('desfazer / refazer', () => {
    it('não há nada para desfazer logo após carregar', () => {
      expect(store.canUndo()).toBeFalse();
      expect(store.canRedo()).toBeFalse();
    });

    it('desfaz e refaz a criação de um nó', () => {
      store.addNode('CIRCLE', { x: 0, y: 0 });
      expect(store.nodes().length).toBe(3);
      store.undo();
      expect(store.nodes().length).toBe(2);
      expect(store.canRedo()).toBeTrue();
      store.redo();
      expect(store.nodes().length).toBe(3);
    });

    it('desfaz mover (posição e dobra das conexões voltam)', () => {
      store.moveNode('b', 20, 400);
      store.undo();
      expect(store.nodes()[1].x).toBe(300);
      expect(store.connections()[0].bendPoint).toEqual({ x: 300, y: 0 });
    });

    it('agrupa a digitação do título em um único passo de desfazer', () => {
      store.selectNode('a');
      store.updateSelectedNodeField('name', 'N');
      store.updateSelectedNodeField('name', 'No');
      store.updateSelectedNodeField('name', 'Nov');
      expect(store.selectedNode()!.name).toBe('Nov');
      store.undo();
      expect(store.nodes()[0].name).toBe('A');
      expect(store.canUndo()).toBeFalse();
    });

    it('desfaz conectar e excluir', () => {
      store.startLink('b');
      store.completeConnection('a');
      expect(store.connections().length).toBe(2);
      store.undo();
      expect(store.connections().length).toBe(1);

      store.deleteNode('a');
      expect(store.nodes().length).toBe(1);
      store.undo();
      expect(store.nodes().length).toBe(2);
      expect(store.connections().length).toBe(1);
    });

    it('uma nova alteração depois de desfazer descarta o refazer', () => {
      store.addNode('RECTANGLE', { x: 0, y: 0 });
      store.undo();
      store.addNode('CIRCLE', { x: 5, y: 5 });
      expect(store.canRedo()).toBeFalse();
    });

    it('desfazer remove a seleção de um nó que deixou de existir', () => {
      const node = store.addNode('RECTANGLE', { x: 0, y: 0 });
      expect(store.state().selectedNodeId).toBe(node.id);
      store.undo();
      expect(store.state().selectedNodeId).toBeNull();
    });

    it('setas movem o nó selecionado e agrupam em um passo', () => {
      store.selectNode('a');
      store.moveSelectedBy(10, 0);
      store.moveSelectedBy(10, 0);
      expect(store.nodes()[0].x).toBe(20);
      store.undo();
      expect(store.nodes()[0].x).toBe(0);
    });

    it('recarregar o projeto limpa o histórico', () => {
      store.addNode('RECTANGLE', { x: 0, y: 0 });
      store.hydrate(RESPONSE, true, null);
      expect(store.canUndo()).toBeFalse();
    });

    it('navega entre nós com selectAdjacent', () => {
      store.selectAdjacent(1);
      expect(store.state().selectedNodeId).toBe('a');
      store.selectAdjacent(1);
      expect(store.state().selectedNodeId).toBe('b');
      store.selectAdjacent(1);
      expect(store.state().selectedNodeId).toBe('a');
      store.selectAdjacent(-1);
      expect(store.state().selectedNodeId).toBe('b');
    });
  });

  describe('redimensionar', () => {
    it('redimensiona retângulo e círculo respeitando os limites e permite desfazer', () => {
      store.resizeNode('a', { width: 400, height: 10 });
      expect(store.nodes()[0].width).toBe(400);
      expect(store.nodes()[0].height).toBe(50); // mínimo
      store.resizeNode('b', { radius: 9999 });
      expect(store.nodes()[1].radius).toBe(300); // máximo
      store.undo();
      store.undo();
      expect(store.nodes()[0].width).toBeUndefined();
    });

    it('campos numéricos da barra lateral são limitados e ignoram valores inválidos', () => {
      store.selectNode('a');
      store.updateSelectedNodeField('width', 5000);
      expect(store.nodes()[0].width).toBe(600);
      store.updateSelectedNodeField('width', NaN);
      expect(store.nodes()[0].width).toBe(600);
    });
  });

  describe('substituir diagrama (importação)', () => {
    it('troca nós, conexões e viewport, marca como alterado e pode ser desfeito', () => {
      store.replaceDiagram({
        nodes: [{ id: 'z', type: 'CIRCLE', name: 'Z', description: '', x: 0, y: 0, rotation: 0 }],
        connections: [],
        viewport: { zoom: 2, offsetX: 1, offsetY: 2, gridSize: 64 }
      });
      expect(store.nodes().map((n) => n.id)).toEqual(['z']);
      expect(store.viewport().zoom).toBe(2);
      expect(store.state().isDirty).toBeTrue();
      store.undo();
      expect(store.nodes().length).toBe(2);
      expect(store.connections().length).toBe(1);
    });
  });

  it('não cria conexão duplicada entre o mesmo par de nós na mesma direção', () => {
    store.startLink('a');
    store.completeConnection('b'); // já existe a -> b
    expect(store.connections().length).toBe(1);
    expect(store.state().linkSourceId).toBeNull();
    expect(store.state().statusMessage).toContain('Já existe uma conexão');
    expect(store.canUndo()).toBeFalse();

    store.startLink('b');
    store.completeConnection('a'); // direção oposta é permitida
    expect(store.connections().length).toBe(2);
  });
});
