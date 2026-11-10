import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = () => {
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
