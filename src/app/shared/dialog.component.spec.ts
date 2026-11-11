import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DialogAction, DialogComponent } from './dialog.component';

@Component({
  standalone: true,
  imports: [DialogComponent],
  template: `<app-dialog title="Apagar?" message="Sem volta." [actions]="actions" (action)="last = $event" (dismissed)="dismissed = true" />`
})
class HostComponent {
  actions: DialogAction[] = [
    { value: 'yes', label: 'Sim', kind: 'danger' },
    { value: 'no', label: 'Não', kind: 'secondary' }
  ];
  last = '';
  dismissed = false;
}

describe('DialogComponent', () => {
  function create() {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('expõe semântica de diálogo modal rotulado', () => {
    const el = create().nativeElement as HTMLElement;
    const dialog = el.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const labelledBy = dialog.getAttribute('aria-labelledby')!;
    expect(el.querySelector('#' + labelledBy)!.textContent).toContain('Apagar?');
  });

  it('coloca o foco no primeiro botão e emite a ação escolhida', () => {
    const fixture = create();
    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll('button');
    expect(document.activeElement).toBe(buttons[0]);
    buttons[1].click();
    expect(fixture.componentInstance.last).toBe('no');
  });

  it('Esc fecha o diálogo (dismissed)', () => {
    const fixture = create();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(fixture.componentInstance.dismissed).toBeTrue();
  });

  it('Tab no último botão volta ao primeiro (foco preso)', () => {
    const fixture = create();
    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll('button');
    buttons[1].focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', cancelable: true }));
    expect(document.activeElement).toBe(buttons[0]);
  });
});
