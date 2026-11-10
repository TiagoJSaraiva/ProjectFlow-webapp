import { InjectionToken } from '@angular/core';
import { environment } from '../../environments/environment';

/** URL base da API (sem barra final). Definida em `src/environments`. */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => environment.apiUrl
});
