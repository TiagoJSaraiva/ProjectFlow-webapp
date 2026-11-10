import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { API_BASE_URL } from '../api-config';
import { AuthService } from './auth.service';
import { authInterceptor } from './auth.interceptor';

const API = 'http://api.test';

describe('authInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;
  let router: Router;
  const authStub = { token: null as string | null, expireSession: jasmine.createSpy('expireSession') };

  beforeEach(() => {
    authStub.token = null;
    authStub.expireSession.calls.reset();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: API_BASE_URL, useValue: API },
        { provide: AuthService, useValue: authStub }
      ]
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
  });

  afterEach(() => controller.verify());

  it('anexa o cabeçalho Authorization quando há token', () => {
    authStub.token = 'abc123';
    http.get(`${API}/api/projects/1`).subscribe();
    const req = controller.expectOne(`${API}/api/projects/1`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer abc123');
    req.flush({});
  });

  it('não altera a requisição quando não há token', () => {
    http.get(`${API}/api/projects/1`).subscribe();
    const req = controller.expectOne(`${API}/api/projects/1`);
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({});
  });

  it('não envia o token para URLs fora da API', () => {
    authStub.token = 'abc123';
    http.get('https://outro.site/dados').subscribe();
    const req = controller.expectOne('https://outro.site/dados');
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({});
  });

  it('em 401 de rota protegida encerra a sessão e vai para o login', () => {
    authStub.token = 'expirado';
    let status = 0;
    http.get(`${API}/api/projects/1`).subscribe({ error: (e) => (status = e.status) });
    controller.expectOne(`${API}/api/projects/1`).flush({ message: 'Token expirado' }, { status: 401, statusText: 'Unauthorized' });

    expect(status).toBe(401);
    expect(authStub.expireSession).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('401 no login (credenciais erradas) não derruba a sessão', () => {
    authStub.token = 'abc';
    http.post(`${API}/api/auth/login`, {}).subscribe({ error: () => undefined });
    controller.expectOne(`${API}/api/auth/login`).flush({ message: 'Credenciais inválidas' }, { status: 401, statusText: 'Unauthorized' });
    expect(authStub.expireSession).not.toHaveBeenCalled();
  });

  it('401 sem token anexado não tenta encerrar sessão', () => {
    http.get(`${API}/api/projects/1`).subscribe({ error: () => undefined });
    controller.expectOne(`${API}/api/projects/1`).flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(authStub.expireSession).not.toHaveBeenCalled();
  });

  it('outros erros (500) passam sem encerrar a sessão', () => {
    authStub.token = 'abc';
    http.get(`${API}/api/projects/1`).subscribe({ error: () => undefined });
    controller.expectOne(`${API}/api/projects/1`).flush({}, { status: 500, statusText: 'Server Error' });
    expect(authStub.expireSession).not.toHaveBeenCalled();
  });
});
