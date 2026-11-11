import { InjectionToken } from '@angular/core';
import { environment } from '../../environments/environment';

/** URL base da API (sem barra final). Definida em `src/environments`. */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => environment.apiUrl
});

/** Modo demonstração: sem login e sem servidor, dados salvos no navegador. */
export const DEMO_MODE = new InjectionToken<boolean>('DEMO_MODE', {
  providedIn: 'root',
  factory: () => environment.demoMode
});
