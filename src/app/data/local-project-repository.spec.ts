import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { DiagramNode, SaveProjectDiagramPayload } from '../project-board/project-board.model';
import { DEMO_MODE } from '../shared/api-config';
import { ORDER_PROJECT_ID, SIGNUP_PROJECT_ID } from './demo-seed';
import { HttpProjectRepository } from './http-project-repository';
import { DEMO_STORAGE, DEMO_STORAGE_KEY, KeyValueStorage, LocalProjectRepository } from './local-project-repository';
import { ProjectRepository } from './project-repository';
import { provideProjectRepository } from './project-repository.provider';

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key)
  };
}

function node(name: string): DiagramNode {
  return { id: 'n-' + name, type: 'RECTANGLE', name, description: '', x: 0, y: 0, rotation: 0 };
}

describe('LocalProjectRepository', () => {
  let repo: LocalProjectRepository;
  let storage: ReturnType<typeof memoryStorage>;

  beforeEach(() => {
    storage = memoryStorage();
    TestBed.configureTestingModule({ providers: [{ provide: DEMO_STORAGE, useValue: storage }] });
    repo = TestBed.inject(LocalProjectRepository);
  });

  it('cria 2 projetos de exemplo coerentes na primeira visita', async () => {
    const projects = await firstValueFrom(repo.list());
    expect(projects.map((p) => p.id).sort()).toEqual([ORDER_PROJECT_ID, SIGNUP_PROJECT_ID].sort());
    expect(projects.every((p) => p.totalTarefas === 6)).toBeTrue();

    const diagram = await firstValueFrom(repo.loadDiagram(SIGNUP_PROJECT_ID));
    const ids = new Set(diagram.nodes.map((n) => n.id));
    expect(diagram.connections.length).toBe(diagram.nodes.length - 1);
    expect(diagram.connections.every((c) => ids.has(c.fromNodeId) && ids.has(c.toNodeId))).toBeTrue();
    expect(diagram.nodes.every((n) => n.name.length <= 35)).toBeTrue();
  });

  it('não recria os exemplos se já existem dados', async () => {
    await firstValueFrom(repo.create('Meu projeto'));
    const projects = await firstValueFrom(repo.list());
    expect(projects.length).toBe(3);
  });

  it('cria, salva e recarrega um diagrama', async () => {
    const created = await firstValueFrom(repo.create('Novo'));
    const payload: SaveProjectDiagramPayload = {
      project: { name: 'Renomeado', description: 'Descrição' },
      viewport: { zoom: 2, offsetX: 5, offsetY: 6, gridSize: 64 },
      nodes: [node('A'), node('B')],
      connections: [{ id: 'c1', fromNodeId: 'n-A', toNodeId: 'n-B' }]
    };

    const saved = await firstValueFrom(repo.saveDiagram(created.id, payload));
    expect(saved.projectName).toBe('Renomeado');

    const loaded = await firstValueFrom(repo.loadDiagram(created.id));
    expect(loaded.nodes.length).toBe(2);
    expect(loaded.viewport.zoom).toBe(2);
    expect(loaded.projectDescription).toBe('Descrição');

    const listed = (await firstValueFrom(repo.list())).find((p) => p.id === created.id)!;
    expect(listed.nome).toBe('Renomeado');
    expect(listed.totalTarefas).toBe(2);
  });

  it('persiste entre instâncias (mesmo armazenamento)', async () => {
    const created = await firstValueFrom(repo.create('Persistente'));
    const again = TestBed.runInInjectionContext(() => new LocalProjectRepository());
    expect((await firstValueFrom(again.list())).some((p) => p.id === created.id)).toBeTrue();
  });

  it('rejeita nome de nó acima de 35 caracteres com 422 e mensagem clara', async () => {
    const created = await firstValueFrom(repo.create('X'));
    const payload: SaveProjectDiagramPayload = {
      project: { name: 'X', description: '' },
      viewport: { zoom: 1, offsetX: 0, offsetY: 0, gridSize: 64 },
      nodes: [node('a'.repeat(36))],
      connections: []
    };
    const error = await firstValueFrom(repo.saveDiagram(created.id, payload)).catch((e) => e);
    expect(error.status).toBe(422);
    expect(error.error.message).toContain('35');
  });

  it('grava o nome do projeto sem espaços nas pontas e rejeita nome em branco, como o servidor', async () => {
    const created = await firstValueFrom(repo.create('X'));
    const base = { viewport: { zoom: 1, offsetX: 0, offsetY: 0, gridSize: 64 }, nodes: [], connections: [] };
    const saved = await firstValueFrom(repo.saveDiagram(created.id, { ...base, project: { name: '  Meu projeto  ', description: '' } }));
    expect(saved.projectName).toBe('Meu projeto');
    expect((await firstValueFrom(repo.list())).find((p) => p.id === created.id)!.nome).toBe('Meu projeto');

    const error = await firstValueFrom(repo.saveDiagram(created.id, { ...base, project: { name: '   ', description: '' } })).catch((e) => e);
    expect(error.status).toBe(400);
  });

  it('devolve 404 para projeto inexistente', async () => {
    const error = await firstValueFrom(repo.loadDiagram('nao-existe')).catch((e) => e);
    expect(error.status).toBe(404);
  });

  it('apaga projeto e seu diagrama', async () => {
    await firstValueFrom(repo.delete(SIGNUP_PROJECT_ID));
    const projects = await firstValueFrom(repo.list());
    expect(projects.some((p) => p.id === SIGNUP_PROJECT_ID)).toBeFalse();
    const error = await firstValueFrom(repo.loadDiagram(SIGNUP_PROJECT_ID)).catch((e) => e);
    expect(error.status).toBe(404);
  });

  it('restaurar exemplos descarta alterações e projetos criados', async () => {
    await firstValueFrom(repo.create('Extra'));
    await firstValueFrom(repo.delete(ORDER_PROJECT_ID));

    repo.restoreSamples();

    const projects = await firstValueFrom(repo.list());
    expect(projects.map((p) => p.id).sort()).toEqual([ORDER_PROJECT_ID, SIGNUP_PROJECT_ID].sort());
  });

  it('recomeça com os exemplos quando os dados salvos estão corrompidos', async () => {
    storage.setItem(DEMO_STORAGE_KEY, '{quebrado');
    const projects = await firstValueFrom(repo.list());
    expect(projects.length).toBe(2);
  });

  it('informa erro claro quando o armazenamento está cheio', async () => {
    await firstValueFrom(repo.list());
    storage.setItem = () => {
      throw new DOMException('cheio', 'QuotaExceededError');
    };
    const error = await firstValueFrom(repo.create('Y')).catch((e) => e);
    expect(error.error.message).toContain('armazenamento');
  });
});

describe('Modo demonstração (provider)', () => {
  let http: HttpTestingController;

  function setup(demo: boolean) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: DEMO_MODE, useValue: demo },
        { provide: DEMO_STORAGE, useValue: memoryStorage() },
        provideProjectRepository()
      ]
    });
    http = TestBed.inject(HttpTestingController);
    return TestBed.inject(ProjectRepository);
  }

  it('com demoMode ligado usa o repositório local e nunca chama a API', async () => {
    const repo = setup(true);
    expect(repo instanceof LocalProjectRepository).toBeTrue();

    const [first] = await firstValueFrom(repo.list());
    await firstValueFrom(repo.loadDiagram(first.id));
    const created = await firstValueFrom(repo.create('Teste'));
    await firstValueFrom(
      repo.saveDiagram(created.id, {
        project: { name: 'Teste', description: '' },
        viewport: { zoom: 1, offsetX: 0, offsetY: 0, gridSize: 64 },
        nodes: [],
        connections: []
      })
    );
    await firstValueFrom(repo.delete(created.id));

    http.expectNone(() => true);
    http.verify();
  });

  it('com demoMode desligado usa o repositório HTTP', () => {
    const repo = setup(false);
    expect(repo instanceof HttpProjectRepository).toBeTrue();
  });
});
