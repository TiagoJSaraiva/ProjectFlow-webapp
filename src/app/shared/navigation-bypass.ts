import { Injectable } from '@angular/core';

/**
 * Permite que uma ação já confirmada pelo usuário (ex.: "Restaurar exemplos") saia do board sem
 * empilhar o diálogo de "alterações não salvas".
 */
@Injectable({ providedIn: 'root' })
export class UnsavedChangesBypass {
  active = false;
}
