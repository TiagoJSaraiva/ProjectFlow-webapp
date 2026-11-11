import { Route } from '@angular/router';
import { buildRoutes } from './app.routes';

const AUTH_PATHS = ['login', 'register', 'recover', 'reset', 'verify-email'];
const find = (routes: Route[], path: string) => routes.find((route) => route.path === path)!;

describe('buildRoutes', () => {
  it('no modo demonstração redireciona as rotas de autenticação para a lista de projetos', () => {
    const routes = buildRoutes(true);
    for (const path of AUTH_PATHS) {
      expect(find(routes, path).redirectTo).toBe('');
      expect(find(routes, path).component).toBeUndefined();
    }
    expect(find(routes, '').component).toBeDefined();
  });

  it('com conta (demoMode desligado) mantém as telas de autenticação', () => {
    const routes = buildRoutes(false);
    for (const path of AUTH_PATHS) {
      expect(find(routes, path).component).toBeDefined();
      expect(find(routes, path).redirectTo).toBeUndefined();
    }
  });
});
