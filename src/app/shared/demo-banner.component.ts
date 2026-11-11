import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { LocalProjectRepository } from '../data/local-project-repository';
import { DEMO_MODE } from './api-config';
import { DialogAction, DialogComponent } from './dialog.component';

/** Aviso permanente do modo demonstração, com a ação "Restaurar exemplos". */
@Component({
  selector: 'app-demo-banner',
  standalone: true,
  imports: [DialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (demoMode) {
      <div class="demo-banner" role="note">
        <span>Modo demonstração — os dados ficam salvos neste navegador.</span>
        <button type="button" (click)="confirmOpen.set(true)">Restaurar exemplos</button>
      </div>
      @if (confirmOpen()) {
        <app-dialog
          title="Restaurar exemplos?"
          message="Todos os projetos deste navegador serão substituídos pelos 2 projetos de exemplo. Esta ação não pode ser desfeita."
          [actions]="actions"
          (action)="onAction($event)"
          (dismissed)="confirmOpen.set(false)"
        />
      }
    }
  `,
  styles: `
    .demo-banner {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      gap: 0.5rem 1rem;
      padding: 6px 16px;
      font-size: 0.85rem;
      color: #ffd500;
      background: rgba(255, 213, 0, 0.08);
      border-bottom: 1px solid rgba(255, 213, 0, 0.3);
    }
    button {
      min-height: 32px;
      padding: 2px 12px;
      font: inherit;
      color: #ffd500;
      background: transparent;
      border: 1px solid rgba(255, 213, 0, 0.6);
      border-radius: 6px;
      cursor: pointer;
    }
    button:hover {
      background: rgba(255, 213, 0, 0.15);
    }
    button:focus-visible {
      outline: 3px solid #ffffff;
      outline-offset: 2px;
    }
  `
})
export class DemoBannerComponent {
  protected readonly demoMode = inject(DEMO_MODE);
  protected readonly confirmOpen = signal(false);
  protected readonly actions: DialogAction[] = [
    { value: 'restore', label: 'Restaurar', kind: 'danger' },
    { value: 'cancel', label: 'Cancelar', kind: 'secondary' }
  ];
  private readonly repository = inject(LocalProjectRepository);
  private readonly router = inject(Router);

  protected onAction(value: string): void {
    this.confirmOpen.set(false);
    if (value !== 'restore') {
      return;
    }
    this.repository.restoreSamples();
    void this.router.navigateByUrl('/').then(() => this.reloadPage());
  }

  /** Recarrega a página para que qualquer tela aberta releia os dados restaurados. */
  protected reloadPage(): void {
    window.location.reload();
  }
}
