import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { ProjectRepository } from '../data/project-repository';
import { ProjectBoardComponent } from './project-board.component';
import { ProjectDiagramResponse, SaveProjectDiagramPayload } from './project-board.model';

function diagram(overrides: Partial<ProjectDiagramResponse> = {}): ProjectDiagramResponse {
  return {
    projectId: 'p1',
    projectName: 'Meu projeto',
    projectDescription: '',
    viewport: { zoom: 1, offsetX: 0, offsetY: 0, gridSize: 64 },
    nodes: [
      { id: 'a', type: 'RECTANGLE', name: 'A', description: '', x: 0, y: 0, rotation: 0 },
      { id: 'b', type: 'CIRCLE', name: 'B', description: '', x: 400, y: 0, rotation: 0 }
    ],
    connections: [],
    ...overrides
  };
}

describe('ProjectBoardComponent', () => {
  const repo = {
    list: jasmine.createSpy('list'),
    create: jasmine.createSpy('create'),
    loadDiagram: jasmine.createSpy('loadDiagram'),
    saveDiagram: jasmine.createSpy('saveDiagram'),
    delete: jasmine.createSpy('delete')
  };
  let fixture: ComponentFixture<ProjectBoardComponent>;
  let component: ProjectBoardComponent;
  let router: Router;

  const root = () => fixture.nativeElement as HTMLElement;
  const state = () => component.state();
  const key = (k: string, extra: KeyboardEventInit = {}) => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...extra }));
    fixture.detectChanges();
  };
  /** Ecoa o payload enviado, como faz um servidor que persistiu tudo. */
  const echo = (id: string, payload: SaveProjectDiagramPayload): ProjectDiagramResponse => ({
    projectId: id,
    projectName: payload.project.name,
    projectDescription: payload.project.description,
    viewport: payload.viewport,
    nodes: payload.nodes,
    connections: payload.connections
  });

  function create(): void {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ProjectRepository, useValue: repo },
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: 'p1' })) } }
      ]
    });
    router = TestBed.inject(Router);
    spyOn(router, 'navigateByUrl').and.resolveTo(true);
    fixture = TestBed.createComponent(ProjectBoardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(() => {
    Object.values(repo).forEach((spy) => spy.calls.reset());
    repo.loadDiagram.and.returnValue(of(diagram()));
  });

  describe('apagar projeto', () => {
    it('depois de apagar com alterações pendentes não pede confirmação de saída', async () => {
      repo.delete.and.returnValue(of(undefined));
      create();
      component.updateNodeField('name', 'x'); // sem seleção: não altera
      key(']'); // seleciona A
      key('ArrowRight'); // altera => sujo
      expect(state().isDirty).toBeTrue();

      component.deleteProject();
      component.confirmDeleteProject();

      expect(repo.delete).toHaveBeenCalledWith('p1');
      expect(router.navigateByUrl).toHaveBeenCalledWith('/');
      expect(state().isDirty).toBeFalse();
      expect(await component.requestUnsavedExitPermission()).toBeTrue();
      expect(component.unsavedDialogOpen()).toBeFalse();
    });

    it('se apagar falhar, mantém as alterações e mostra o erro', () => {
      repo.delete.and.returnValue(throwError(() => new HttpErrorResponse({ status: 404, error: { message: 'Projeto não encontrado.' } })));
      create();
      key(']');
      key('ArrowRight');
      component.confirmDeleteProject();
      expect(state().isDirty).toBeTrue();
      expect(state().statusMessage).toBe('Projeto não encontrado.');
      expect(router.navigateByUrl).not.toHaveBeenCalled();
    });
  });

  // helpers usados pelos demais blocos (definidos nos commits seguintes)
  void Subject;
  void echo;
  void root;
});
