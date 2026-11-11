import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NEVER, of, throwError } from 'rxjs';
import { ProjectRepository } from '../data/project-repository';
import { Project } from '../projects/project.model';
import { LandingPageComponent } from './landing-page.component';

function project(id: string, nome: string): Project {
  return {
    id,
    nome,
    descricao: '',
    dataCriado: '2026-01-02T10:00:00.000Z',
    ultimaAlteracao: '2026-01-02T10:00:00.000Z',
    ultimoAcesso: '2026-01-02T10:00:00.000Z',
    usuarioId: 'u',
    usuarioNome: 'U',
    totalTarefas: 3
  };
}

describe('LandingPageComponent', () => {
  const repo = { list: jasmine.createSpy('list'), create: jasmine.createSpy('create') };

  function create() {
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: ProjectRepository, useValue: repo }] });
    const fixture = TestBed.createComponent(LandingPageComponent);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    repo.list.calls.reset();
    repo.create.calls.reset();
  });

  it('mostra o estado de carregamento enquanto a lista não chega', () => {
    repo.list.and.returnValue(NEVER);
    const fixture = create();
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain('Carregando projetos');
  });

  it('mostra o estado vazio quando não há projetos', () => {
    repo.list.and.returnValue(of([]));
    const fixture = create();
    expect(fixture.nativeElement.textContent).toContain('Nenhum projeto ainda.');
  });

  it('lista os projetos com seus dados', () => {
    repo.list.and.returnValue(of([project('1', 'Fluxo A'), project('2', 'Fluxo B')]));
    const fixture = create();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Fluxo A');
    expect(text).toContain('Fluxo B');
    expect(text).toContain('Total de tarefas: 3');
  });

  it('mostra erro com a mensagem da API e permite tentar novamente', () => {
    repo.list.and.returnValues(
      throwError(() => new HttpErrorResponse({ status: 500, error: { message: 'Banco indisponível' } })),
      of([project('1', 'Fluxo A')])
    );
    const fixture = create();
    const alert = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;
    expect(alert.textContent).toContain('Banco indisponível');

    (alert.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Fluxo A');
  });

  it('confirma a criação de um projeto', () => {
    repo.list.and.returnValues(of([]), of([project('9', 'Projeto 1')]));
    repo.create.and.returnValue(of(project('9', 'Projeto 1')));
    const fixture = create();
    (fixture.nativeElement.querySelector('.empty-state button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(repo.create).toHaveBeenCalledWith('Projeto 1');
    expect(fixture.nativeElement.querySelector('.success').textContent).toContain('Projeto 1');
  });
});
