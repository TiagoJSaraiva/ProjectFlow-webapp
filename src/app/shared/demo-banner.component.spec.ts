import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { LocalProjectRepository } from '../data/local-project-repository';
import { DEMO_MODE } from './api-config';
import { DemoBannerComponent } from './demo-banner.component';
import { UnsavedChangesBypass } from './navigation-bypass';

describe('DemoBannerComponent', () => {
  const notice = signal<string | null>(null);
  const repoStub = {
    restoreSamples: jasmine.createSpy('restoreSamples'),
    recoveryNotice: notice.asReadonly(),
    dismissRecoveryNotice: () => notice.set(null)
  };

  function create(demo: boolean) {
    repoStub.restoreSamples.calls.reset();
    notice.set(null);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: DEMO_MODE, useValue: demo },
        { provide: LocalProjectRepository, useValue: repoStub }
      ]
    });
    const fixture = TestBed.createComponent(DemoBannerComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('não aparece fora do modo demonstração', () => {
    const fixture = create(false);
    expect(fixture.nativeElement.querySelector('.demo-banner')).toBeNull();
  });

  it('mostra o aviso permanente no modo demonstração', () => {
    const fixture = create(true);
    expect(fixture.nativeElement.textContent).toContain('Modo demonstração — os dados ficam salvos neste navegador');
  });

  it('só restaura os exemplos após confirmação', async () => {
    const fixture = create(true);
    const root = fixture.nativeElement as HTMLElement;
    spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    spyOn(fixture.componentInstance as unknown as { reloadPage(): void }, 'reloadPage');

    root.querySelector<HTMLButtonElement>('.demo-banner button')!.click();
    fixture.detectChanges();
    expect(repoStub.restoreSamples).not.toHaveBeenCalled();
    expect(root.querySelector('[role="dialog"]')).not.toBeNull();

    // cancelar não restaura
    root.querySelector<HTMLButtonElement>('.secondary')!.click();
    fixture.detectChanges();
    expect(repoStub.restoreSamples).not.toHaveBeenCalled();
    expect(TestBed.inject(UnsavedChangesBypass).active).toBeFalse(); // cancelar não libera o guard
    expect(root.querySelector('[role="dialog"]')).toBeNull();

    // confirmar restaura
    root.querySelector<HTMLButtonElement>('.demo-banner button')!.click();
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.danger')!.click();
    await fixture.whenStable();
    expect(repoStub.restoreSamples).toHaveBeenCalledTimes(1);
    // a confirmação da restauração já basta: o guard do board não deve pedir outra
    expect(TestBed.inject(UnsavedChangesBypass).active).toBeTrue();
  });

  it('mostra o aviso de recuperação de dados e permite dispensá-lo', () => {
    const fixture = create(true);
    notice.set('Os dados salvos neste navegador não puderam ser lidos.');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('não puderam ser lidos');
    const dismiss = [...root.querySelectorAll('button')].find((b) => b.textContent?.includes('Entendi'))!;
    dismiss.click();
    fixture.detectChanges();
    expect(root.textContent).not.toContain('não puderam ser lidos');
  });
});
