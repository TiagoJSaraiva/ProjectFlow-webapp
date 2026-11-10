import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { authGuard } from './auth.guard';
import { AuthService } from './auth.service';

describe('authGuard', () => {
  let router: Router;
  const authStub = {
    isAuthenticated: jasmine.createSpy('isAuthenticated'),
    currentSession: jasmine.createSpy('currentSession'),
    expireSession: jasmine.createSpy('expireSession')
  };

  beforeEach(() => {
    authStub.isAuthenticated.calls.reset();
    authStub.currentSession.calls.reset();
    authStub.expireSession.calls.reset();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AuthService, useValue: authStub }
      ]
    });
    router = TestBed.inject(Router);
  });

  function run() {
    return TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, { url: '/projects/1/board' } as RouterStateSnapshot)
    );
  }

  it('permite acesso quando há sessão válida', () => {
    authStub.isAuthenticated.and.returnValue(true);
    expect(run()).toBeTrue();
    expect(authStub.expireSession).not.toHaveBeenCalled();
  });

  it('redireciona para /login quando não há sessão', () => {
    authStub.isAuthenticated.and.returnValue(false);
    authStub.currentSession.and.returnValue(null);
    const result = run();
    expect(result instanceof UrlTree).toBeTrue();
    expect(router.serializeUrl(result as UrlTree)).toBe('/login');
    expect(authStub.expireSession).not.toHaveBeenCalled();
  });

  it('encerra a sessão com aviso quando o token salvo expirou', () => {
    authStub.isAuthenticated.and.returnValue(false);
    authStub.currentSession.and.returnValue({ token: 'velho' });
    const result = run();
    expect(authStub.expireSession).toHaveBeenCalled();
    expect(router.serializeUrl(result as UrlTree)).toBe('/login');
  });
});
