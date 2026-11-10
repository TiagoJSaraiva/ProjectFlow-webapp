import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from '../shared/api-config';
import { AuthService } from '../shared/auth/auth.service';
import { ProjectService } from './project.service';

const API = 'http://api.test';

describe('ProjectService', () => {
  let service: ProjectService;
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
    service = TestBed.inject(ProjectService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lista os projetos do usuário logado, normalizando datas ISO e ordenando do mais recente', () => {
    let result: { id: string; dataCriado: string; totalTarefas: number }[] = [];
    service.listByCurrentUser().subscribe((projects) => (result = projects));

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
    service.listByCurrentUser().subscribe((projects) => (result = projects));
    http.expectOne(`${API}/api/projects/user/user-1`).flush([
      { id: 'a', nome: 'P', dataCriado: [2025, 12, 4, 18, 30, 0, 0], ultimoAcesso: null }
    ]);
    expect(result[0].dataCriado).toBe('2025-12-04T18:30:00.000Z');
    expect(result[0].ultimoAcesso).toBe('');
  });

  it('cria projeto com nome e descrição vazia', () => {
    let created: { id: string; nome: string } | undefined;
    service.createProjectWithName('Projeto 1').subscribe((p) => (created = p));

    const req = http.expectOne(`${API}/api/projects/user/user-1`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ nome: 'Projeto 1', descricao: '' });
    req.flush({ id: 'new', nome: 'Projeto 1', dataCriado: '2025-12-04T18:30:00' });

    expect(created?.id).toBe('new');
  });

  it('falha quando não há usuário autenticado', () => {
    authStub.currentSession.and.returnValue(null);
    expect(() => service.listByCurrentUser()).toThrowError('Usuário não autenticado');
  });
});
