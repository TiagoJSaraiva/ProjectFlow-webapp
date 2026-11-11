import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** Barra de ferramentas do canvas: histórico, zoom e ajuda. Todos os botões têm rótulo acessível. */
@Component({
  selector: 'app-board-toolbar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar" role="toolbar" aria-label="Ferramentas do diagrama">
      <div class="group" role="group" aria-label="Histórico">
        <button type="button" [disabled]="!canUndo()" (click)="undo.emit()" aria-label="Desfazer (Ctrl+Z)" title="Desfazer (Ctrl+Z)">
          <span aria-hidden="true">↶</span><span class="label">Desfazer</span>
        </button>
        <button type="button" [disabled]="!canRedo()" (click)="redo.emit()" aria-label="Refazer (Ctrl+Y)" title="Refazer (Ctrl+Y)">
          <span aria-hidden="true">↷</span><span class="label">Refazer</span>
        </button>
      </div>
      <div class="group" role="group" aria-label="Zoom">
        <button type="button" (click)="zoomOut.emit()" aria-label="Diminuir zoom" title="Diminuir zoom"><span aria-hidden="true">−</span></button>
        <span class="zoom-value" aria-live="polite">{{ zoomPercent() }}%</span>
        <button type="button" (click)="zoomIn.emit()" aria-label="Aumentar zoom" title="Aumentar zoom"><span aria-hidden="true">+</span></button>
        <button type="button" (click)="fit.emit()" aria-label="Ajustar diagrama à tela" title="Ajustar à tela">
          <span aria-hidden="true">⤢</span><span class="label">Ajustar</span>
        </button>
      </div>
      <div class="group" role="group" aria-label="Arquivo">
        <ng-content />
      </div>
      <div class="group" role="group" aria-label="Ajuda">
        <button type="button" (click)="shortcuts.emit()" aria-label="Ver atalhos de teclado" title="Atalhos de teclado">
          <span aria-hidden="true">⌨</span><span class="label">Atalhos</span>
        </button>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem 1rem;
      padding: 0.5rem 1rem;
      background: rgba(5, 6, 9, 0.9);
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }
    .group {
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }
    button, ::ng-deep .group button {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      min-width: 40px;
      min-height: 40px;
      padding: 0 0.7rem;
      justify-content: center;
      font: inherit;
      font-size: 0.9rem;
      font-weight: 600;
      color: #f5f5f5;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 8px;
      cursor: pointer;
    }
    button:hover:not(:disabled) {
      border-color: #ffd500;
    }
    button:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    button:focus-visible {
      outline: 3px solid #ffffff;
      outline-offset: 2px;
    }
    .zoom-value {
      min-width: 3.2rem;
      text-align: center;
      font-size: 0.85rem;
      color: rgba(255, 255, 255, 0.75);
    }
    @media (max-width: 760px) {
      .label {
        display: none;
      }
      .toolbar {
        gap: 0.4rem 0.6rem;
        padding: 0.4rem 0.5rem;
      }
    }
  `
})
export class BoardToolbarComponent {
  readonly canUndo = input(false);
  readonly canRedo = input(false);
  readonly zoomPercent = input(100);
  readonly undo = output<void>();
  readonly redo = output<void>();
  readonly zoomIn = output<void>();
  readonly zoomOut = output<void>();
  readonly fit = output<void>();
  readonly shortcuts = output<void>();
}
