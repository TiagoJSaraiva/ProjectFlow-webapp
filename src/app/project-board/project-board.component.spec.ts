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

  describe('salvar', () => {
    it('sucesso: fica limpo, mantém o histórico (desfazer) e a seleção', () => {
      repo.saveDiagram.and.callFake((id: string, payload: SaveProjectDiagramPayload) => of(echo(id, payload)));
      create();
      key(']');
      key('ArrowRight');
      expect(component.canUndo()).toBeTrue();

      component.onSave();

      expect(repo.saveDiagram).toHaveBeenCalledTimes(1);
      expect(state().isDirty).toBeFalse();
      expect(state().statusMessage).toBe('Diagrama salvo com sucesso.');
      expect(component.canUndo()).toBeTrue();
      expect(state().selectedNodeId).toBe('a');
    });

    it('falha: mostra a mensagem da API e continua sujo', () => {
      repo.saveDiagram.and.returnValue(throwError(() => new HttpErrorResponse({ status: 422, error: { message: 'Nome do nó acima de 35.' } })));
      create();
      key(']');
      key('ArrowRight');
      component.onSave();
      expect(state().isDirty).toBeTrue();
      expect(state().isSaving).toBeFalse();
      expect(state().statusMessage).toBe('Nome do nó acima de 35.');
      fixture.detectChanges();
      expect(root().querySelector('.status.error')).not.toBeNull();
    });

    it('nome com espaços nas pontas é enviado sem eles e confirmado normalmente', () => {
      repo.saveDiagram.and.callFake((id: string, payload: SaveProjectDiagramPayload) => of(echo(id, payload)));
      create();
      component.onProjectNameChange('  Meu projeto  ');
      component.onSave();

      expect(repo.saveDiagram.calls.mostRecent().args[1].project.name).toBe('Meu projeto');
      expect(state().isDirty).toBeFalse();
      expect(state().statusMessage).toBe('Diagrama salvo com sucesso.');
      expect(state().projectName).toBe('Meu projeto');
    });

    it('nome em branco não é enviado e mostra a mensagem junto ao campo', () => {
      create();
      component.setSidebarMode('project');
      component.onProjectNameChange('   ');
      fixture.detectChanges();
      expect(root().querySelector('#project-name-hint')?.textContent).toContain('obrigatório');

      component.onSave();
      expect(repo.saveDiagram).not.toHaveBeenCalled();
      expect(state().statusMessage).toContain('nome');
      expect(state().isDirty).toBeTrue();
    });

    it('edição feita durante o salvamento não é perdida nem dada como salva', () => {
      const pending = new Subject<ProjectDiagramResponse>();
      let sent!: SaveProjectDiagramPayload;
      repo.saveDiagram.and.callFake((_id: string, payload: SaveProjectDiagramPayload) => {
        sent = payload;
        return pending;
      });
      create();
      key(']');
      key('ArrowRight');
      component.onSave();
      expect(state().isSaving).toBeTrue();

      key('ArrowDown'); // edita enquanto o servidor ainda não respondeu
      const editedNodes = state().nodes;
      pending.next(echo('p1', sent));
      pending.complete();

      expect(state().isSaving).toBeFalse();
      expect(state().isDirty).toBeTrue();
      expect(state().nodes).toBe(editedNodes);
      expect(state().nodes[0].y).toBe(10);
    });
  });
});
