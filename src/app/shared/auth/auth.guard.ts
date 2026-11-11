import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { DEMO_MODE } from '../api-config';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = () => {
  if (inject(DEMO_MODE)) {
    return true; // modo demonstração: sem login
  }
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    return true;
  }

  // Havia sessão salva, mas o token expirou: limpa e avisa na tela de login.
  if (authService.currentSession()) {
    authService.expireSession();
  }

  return router.createUrlTree(['/login']);
};
