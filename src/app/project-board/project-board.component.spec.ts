import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { ProjectRepository } from '../data/project-repository';
import { UnsavedChangesBypass } from '../shared/navigation-bypass';
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

  describe('restaurar exemplos com alterações pendentes', () => {
    it('com a restauração confirmada, o guard de saída não empilha outro diálogo', async () => {
      create();
      key(']');
      key('ArrowRight');
      expect(state().isDirty).toBeTrue();

      TestBed.inject(UnsavedChangesBypass).active = true; // definido pelo aviso da demo após a confirmação

      expect(await component.requestUnsavedExitPermission()).toBeTrue();
      expect(component.unsavedDialogOpen()).toBeFalse();
    });
  });

  describe('pequenos ajustes de edição', () => {
    it('zoom e ajustar à tela não marcam o projeto como alterado', () => {
      create();
      component.zoomBy(1.2);
      component.fitToContent();
      expect(state().isDirty).toBeFalse();
    });

    it('nós criados pelos botões não nascem sobrepostos', () => {
      create();
      component.addNodeAtCenter('RECTANGLE');
      component.addNodeAtCenter('RECTANGLE');
      component.addNodeAtCenter('CIRCLE');
      const added = state().nodes.slice(2);
      expect(added.length).toBe(3);
      for (let i = 0; i < added.length; i += 1) {
        for (let j = i + 1; j < added.length; j += 1) {
          const apart = Math.abs(added[i].x - added[j].x) >= 100 || Math.abs(added[i].y - added[j].y) >= 60;
          expect(apart).toBeTrue();
        }
      }
    });
  });

  describe('guard de saída com alterações pendentes', () => {
    function makeDirty() {
      create();
      key(']');
      key('ArrowRight');
    }

    it('sem alterações deixa sair sem diálogo', async () => {
      create();
      expect(await component.requestUnsavedExitPermission()).toBeTrue();
      expect(component.unsavedDialogOpen()).toBeFalse();
    });

    it('cancelar mantém o usuário no board', async () => {
      makeDirty();
      const result = component.requestUnsavedExitPermission();
      expect(component.unsavedDialogOpen()).toBeTrue();
      component.onUnsavedDialogAction('cancel');
      expect(await result).toBeFalse();
      expect(component.unsavedDialogOpen()).toBeFalse();
    });

    it('sair sem salvar libera a saída sem chamar o servidor', async () => {
      makeDirty();
      const result = component.requestUnsavedExitPermission();
      component.onUnsavedDialogAction('discard');
      expect(await result).toBeTrue();
      expect(repo.saveDiagram).not.toHaveBeenCalled();
    });

    it('salvar e sair salva e libera a saída', async () => {
      repo.saveDiagram.and.callFake((id: string, payload: SaveProjectDiagramPayload) => of(echo(id, payload)));
      makeDirty();
      const result = component.requestUnsavedExitPermission();
      component.onUnsavedDialogAction('save');
      expect(await result).toBeTrue();
      expect(repo.saveDiagram).toHaveBeenCalledTimes(1);
    });

    it('se salvar falhar, a saída é bloqueada', async () => {
      repo.saveDiagram.and.returnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
      makeDirty();
      const result = component.requestUnsavedExitPermission();
      component.onUnsavedDialogAction('save');
      expect(await result).toBeFalse();
      expect(state().isDirty).toBeTrue();
    });

    it('goBack com alterações abre o diálogo em vez de navegar', () => {
      makeDirty();
      component.goBack();
      expect(component.unsavedDialogOpen()).toBeTrue();
      expect(router.navigateByUrl).not.toHaveBeenCalled();
    });
  });

  describe('atalhos de teclado', () => {
    it('] seleciona, setas movem, Ctrl+Z desfaz e Ctrl+Y refaz', () => {
      create();
      key(']');
      expect(state().selectedNodeId).toBe('a');
      key('ArrowRight');
      key('ArrowRight', { shiftKey: true });
      expect(state().nodes[0].x).toBe(60);
      key('z', { ctrlKey: true });
      expect(state().nodes[0].x).toBe(0);
      key('y', { ctrlKey: true });
      expect(state().nodes[0].x).toBe(60);
      key('z', { ctrlKey: true });
      key('z', { ctrlKey: true, shiftKey: true });
      expect(state().nodes[0].x).toBe(60);
    });

    it('Delete exclui o nó selecionado e Ctrl+Z o traz de volta', () => {
      create();
      key(']');
      key('Delete');
      expect(state().nodes.map((n) => n.id)).toEqual(['b']);
      key('z', { ctrlKey: true });
      expect(state().nodes.length).toBe(2);
    });

    it('Esc cancela o modo de conexão e depois limpa a seleção', () => {
      create();
      key(']');
      key('c');
      expect(state().linkSourceId).toBe('a');
      key('Escape');
      expect(state().linkSourceId).toBeNull();
      expect(state().selectedNodeId).toBe('a');
      key('Escape');
      expect(state().selectedNodeId).toBeNull();
    });

    it('conecta com C + ] + Enter', () => {
      create();
      key(']'); // a
      key('c');
      key(']'); // b
      key('Enter');
      expect(state().connections.length).toBe(1);
      expect(state().connections[0].fromNodeId).toBe('a');
      expect(state().connections[0].toNodeId).toBe('b');
    });

    it('Ctrl+S salva só quando há alterações', () => {
      repo.saveDiagram.and.callFake((id: string, payload: SaveProjectDiagramPayload) => of(echo(id, payload)));
      create();
      key('s', { ctrlKey: true });
      expect(repo.saveDiagram).not.toHaveBeenCalled();
      key(']');
      key('ArrowDown');
      key('s', { ctrlKey: true });
      expect(repo.saveDiagram).toHaveBeenCalledTimes(1);
    });

    it('não captura teclas enquanto o usuário digita em um campo', () => {
      create();
      key(']');
      fixture.detectChanges();
      const input = root().querySelector('#node-title-input') as HTMLInputElement;
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(state().nodes.length).toBe(2);
      expect(state().nodes[0].x).toBe(0);
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

    it('a mensagem de salvo some quando há nova alteração ou desfazer, voltando a indicar "não salvo"', () => {
      repo.saveDiagram.and.callFake((id: string, payload: SaveProjectDiagramPayload) => of(echo(id, payload)));
      create();
      key(']');
      key('ArrowRight');
      component.onSave();
      expect(state().statusMessage).toBe('Diagrama salvo com sucesso.');
      key('z', { ctrlKey: true });
      fixture.detectChanges();
      expect(state().statusMessage).toBeNull();
      expect(root().querySelector('.status')!.textContent).toContain('Alterações não salvas');
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
