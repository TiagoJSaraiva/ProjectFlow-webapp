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
});
