import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from '../shared/api-config';
import { AuthService } from '../shared/auth/auth.service';
import { SaveProjectDiagramPayload } from '../project-board/project-board.model';
import { HttpProjectRepository } from './http-project-repository';

const API = 'http://api.test';

describe('HttpProjectRepository', () => {
  let service: HttpProjectRepository;
  let http: HttpTestingController;
  const authStub = { currentSession: jasmine.createSpy('currentSession') };

  beforeEach(() => {
    authStub.currentSession.and.returnValue({ userId: 'user-1', token: 't', tipo: 'Bearer', nome: 'Ana', email: 'a@x.com' });
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: API },
        { provide: AuthService, useValue: authStub }
      ]
    });
    service = TestBed.inject(HttpProjectRepository);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lista os projetos do usuário logado, normalizando datas ISO e ordenando do mais recente', () => {
    let result: { id: string; dataCriado: string; totalTarefas: number }[] = [];
    service.list().subscribe((projects) => (result = projects));

    const req = http.expectOne(`${API}/api/projects/user/user-1`);
    expect(req.request.method).toBe('GET');
    req.flush([
      { id: 'a', nome: 'Antigo', dataCriado: '2025-01-01T10:00:00', ultimaAlteracao: '2025-01-02T10:00:00', ultimoAcesso: '2025-01-03T10:00:00' },
      { id: 'b', nome: 'Novo', dataCriado: '2025-12-04T18:30:00', ultimaAlteracao: null, ultimoAcesso: null, totalTarefas: 3 }
    ]);

    expect(result.map((p) => p.id)).toEqual(['b', 'a']);
    expect(result[0].dataCriado).toBe('2025-12-04T18:30:00.000Z');
    expect(result[0].totalTarefas).toBe(3);
    expect(result[1].totalTarefas).toBe(0);
  });

  it('mantém tolerância ao formato antigo de data em array', () => {
    let result: { dataCriado: string; ultimoAcesso: string }[] = [];
    service.list().subscribe((projects) => (result = projects));
    http.expectOne(`${API}/api/projects/user/user-1`).flush([
      { id: 'a', nome: 'P', dataCriado: [2025, 12, 4, 18, 30, 0, 0], ultimoAcesso: null }
    ]);
    expect(result[0].dataCriado).toBe('2025-12-04T18:30:00.000Z');
    expect(result[0].ultimoAcesso).toBe('');
  });

  it('cria projeto com nome e descrição vazia', () => {
    let created: { id: string; nome: string } | undefined;
    service.create('Projeto 1').subscribe((p) => (created = p));

    const req = http.expectOne(`${API}/api/projects/user/user-1`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ nome: 'Projeto 1', descricao: '' });
    req.flush({ id: 'new', nome: 'Projeto 1', dataCriado: '2025-12-04T18:30:00' });

    expect(created?.id).toBe('new');
  });

  it('falha (via Observable) quando não há usuário autenticado', () => {
    authStub.currentSession.and.returnValue(null);
    let message = '';
    service.list().subscribe({ error: (e: Error) => (message = e.message) });
    expect(message).toBe('Usuário não autenticado');
  });

  describe('diagramas', () => {
    const payload: SaveProjectDiagramPayload = {
      project: { name: 'N', description: 'D' },
      viewport: { zoom: 1, offsetX: 0, offsetY: 0, gridSize: 64 },
      nodes: [],
      connections: []
    };

    it('carrega o diagrama do projeto', () => {
      let name = '';
      service.loadDiagram('p1').subscribe((r) => (name = r.projectName));
      const req = http.expectOne(`${API}/api/projects/p1/diagram`);
      expect(req.request.method).toBe('GET');
      req.flush({ projectId: 'p1', projectName: 'Meu fluxo', projectDescription: '', viewport: {}, nodes: [], connections: [] });
      expect(name).toBe('Meu fluxo');
    });

    it('salva o diagrama com PUT e o payload completo', () => {
      service.saveDiagram('p1', payload).subscribe();
      const req = http.expectOne(`${API}/api/projects/p1/diagram`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual(payload);
      req.flush({});
    });

    it('propaga o erro do servidor ao salvar', () => {
      let status = 0;
      service.saveDiagram('p1', payload).subscribe({ error: (e) => (status = e.status) });
      http.expectOne(`${API}/api/projects/p1/diagram`).flush({ message: 'Nome muito longo' }, { status: 422, statusText: 'Unprocessable' });
      expect(status).toBe(422);
    });

    it('apaga o projeto com DELETE', () => {
      service.delete('p1').subscribe();
      const req = http.expectOne(`${API}/api/projects/p1`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });
  });
});
