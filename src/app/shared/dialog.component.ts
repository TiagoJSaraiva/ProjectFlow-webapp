import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  input,
  output,
  viewChild
} from '@angular/core';

export interface DialogAction {
  /** Valor emitido em `action` quando o botão é acionado. */
  value: string;
  label: string;
  kind?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}

let nextDialogId = 0;

/**
 * Diálogo modal acessível: `role="dialog"`, `aria-modal`, foco inicial no primeiro botão,
 * foco preso dentro do diálogo, fecha com Esc (emite `dismissed`) e devolve o foco ao elemento anterior.
 */
@Component({
  selector: 'app-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="overlay" (click)="onOverlayClick($event)">
      <div
        #card
        class="card"
        role="dialog"
        aria-modal="true"
        [attr.aria-labelledby]="titleId"
        [attr.aria-describedby]="messageId"
      >
        <h2 [id]="titleId">{{ title() }}</h2>
        @if (message()) {
          <p [id]="messageId">{{ message() }}</p>
        }
        <div class="actions" [class.stacked]="stacked()">
          @for (item of actions(); track item.value) {
            <button type="button" [class]="item.kind ?? 'secondary'" [disabled]="item.disabled" (click)="action.emit(item.value)">
              {{ item.label }}
            </button>
          }
        </div>
      </div>
    </div>
  `,
  styles: `
    .overlay {
      position: fixed;
      inset: 0;
      z-index: 50;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      background: rgba(2, 2, 3, 0.85);
      backdrop-filter: blur(6px);
    }
    .card {
      width: min(440px, 100%);
      max-height: 100%;
      overflow: auto;
      padding: 2rem;
      text-align: center;
      color: #f5f5f5;
      background: linear-gradient(145deg, rgba(9, 10, 15, 0.98), rgba(5, 6, 10, 0.98));
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.55);
    }
    h2 {
      margin: 0 0 0.75rem;
      font-size: 1.4rem;
    }
    p {
      margin: 0 0 1.5rem;
      color: rgba(255, 255, 255, 0.75);
      line-height: 1.4;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      justify-content: center;
    }
    .actions.stacked {
      flex-direction: column;
    }
    button {
      flex: 1;
      min-width: 140px;
      min-height: 44px;
      padding: 0.5rem 1.2rem;
      font: inherit;
      font-weight: 600;
      border-radius: 12px;
      border: 1px solid transparent;
      cursor: pointer;
    }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    button:focus-visible {
      outline: 3px solid #ffffff;
      outline-offset: 2px;
    }
    .primary {
      background: #ffd500;
      color: #000;
    }
    .secondary {
      background: rgba(255, 255, 255, 0.08);
      color: #f5f5f5;
      border-color: rgba(255, 255, 255, 0.2);
    }
    .danger {
      background: transparent;
      color: #ff8a80;
      border-color: rgba(255, 138, 128, 0.6);
    }
  `
})
export class DialogComponent implements AfterViewInit, OnDestroy {
  readonly title = input.required<string>();
  readonly message = input<string>('');
  readonly actions = input<DialogAction[]>([]);
  readonly stacked = input(false);
  /** Valor emitido por Esc/clique no fundo costuma ser tratado como "cancelar" pelo chamador. */
  readonly dismissed = output<void>();
  readonly action = output<string>();

  protected readonly titleId = `app-dialog-title-${nextDialogId}`;
  protected readonly messageId = `app-dialog-message-${nextDialogId++}`;
  private readonly card = viewChild.required<ElementRef<HTMLElement>>('card');
  private previouslyFocused: HTMLElement | null = null;

  ngAfterViewInit(): void {
    this.previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.focusables()[0]?.focus();
  }

  ngOnDestroy(): void {
    this.previouslyFocused?.focus?.();
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.dismissed.emit();
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }
    const items = this.focusables();
    if (!items.length) {
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    } else if (!this.card().nativeElement.contains(active)) {
      event.preventDefault();
      first.focus();
    }
  }

  protected onOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.dismissed.emit();
    }
  }

  private focusables(): HTMLElement[] {
    return Array.from(this.card().nativeElement.querySelectorAll<HTMLElement>('button:not([disabled])'));
  }
}
