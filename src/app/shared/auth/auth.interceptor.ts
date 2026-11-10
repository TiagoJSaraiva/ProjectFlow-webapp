import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { API_BASE_URL } from '../api-config';
import { AuthService } from './auth.service';

/**
 * Anexa o token Bearer às chamadas da API e, ao receber 401 de uma rota protegida
 * (token expirado ou inválido), encerra a sessão e leva o usuário ao login com aviso.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const apiPrefix = `${inject(API_BASE_URL)}/api/`;
  const isApiCall = req.url.startsWith(apiPrefix);
  const isAuthEndpoint = req.url.startsWith(`${apiPrefix}auth/`);
  const token = authService.token;

  const outgoing =
    token && isApiCall ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(outgoing).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401 && token && isApiCall && !isAuthEndpoint) {
        authService.expireSession();
        void router.navigate(['/login']);
      }
      return throwError(() => error);
    })
  );
};
