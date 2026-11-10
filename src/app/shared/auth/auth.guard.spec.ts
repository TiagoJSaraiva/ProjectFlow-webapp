import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, provideRouter } from '@angular/router';
import { authGuard } from './auth.guard';
import { AuthService } from './auth.service';

describe('authGuard', () => {
  let router: Router;
  const authStub = { isAuthenticated: jasmine.createSpy('isAuthenticated') };

  beforeEach(() => {
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

  it('permite acesso quando há sessão', () => {
    authStub.isAuthenticated.and.returnValue(true);
    expect(run()).toBeTrue();
  });

  it('redireciona para /login quando não há sessão', () => {
    authStub.isAuthenticated.and.returnValue(false);
    const navigate = spyOn(router, 'navigate').and.resolveTo(true);
    expect(run()).toBeFalse();
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });
});
