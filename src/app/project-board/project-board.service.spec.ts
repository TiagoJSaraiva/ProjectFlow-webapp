import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from '../shared/api-config';
import { SaveProjectDiagramPayload } from './project-board.model';
import { ProjectBoardService } from './project-board.service';

const API = 'http://api.test';

const EMPTY_PAYLOAD: SaveProjectDiagramPayload = {
  project: { name: 'N', description: 'D' },
  viewport: { zoom: 1, offsetX: 0, offsetY: 0, gridSize: 64 },
  nodes: [],
  connections: []
};

describe('ProjectBoardService', () => {
  let service: ProjectBoardService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_BASE_URL, useValue: API }]
    });
    service = TestBed.inject(ProjectBoardService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('carrega o diagrama do projeto', () => {
    let name = '';
    service.loadDiagram('p1').subscribe((r) => (name = r.projectName));
    const req = http.expectOne(`${API}/api/projects/p1/diagram`);
    expect(req.request.method).toBe('GET');
    req.flush({ projectId: 'p1', projectName: 'Meu fluxo', projectDescription: '', viewport: {}, nodes: [], connections: [] });
    expect(name).toBe('Meu fluxo');
  });

  it('salva o diagrama com PUT e o payload completo', () => {
    service.saveDiagram('p1', EMPTY_PAYLOAD).subscribe();
    const req = http.expectOne(`${API}/api/projects/p1/diagram`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(EMPTY_PAYLOAD);
    req.flush({});
  });

  it('propaga o erro do servidor ao salvar', () => {
    let status = 0;
    service.saveDiagram('p1', EMPTY_PAYLOAD).subscribe({ error: (e) => (status = e.status) });
    http.expectOne(`${API}/api/projects/p1/diagram`).flush({ message: 'Nome muito longo' }, { status: 422, statusText: 'Unprocessable' });
    expect(status).toBe(422);
  });

  it('apaga o projeto com DELETE', () => {
    service.deleteProject('p1').subscribe();
    const req = http.expectOne(`${API}/api/projects/p1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });
});
