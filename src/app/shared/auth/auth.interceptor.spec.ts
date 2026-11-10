import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;
  const authStub: { token: string | null } = { token: null };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: authStub }
      ]
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => controller.verify());

  it('anexa o cabeçalho Authorization quando há token', () => {
    authStub.token = 'abc123';
    http.get('/api/ping').subscribe();
    const req = controller.expectOne('/api/ping');
    expect(req.request.headers.get('Authorization')).toBe('Bearer abc123');
    req.flush({});
  });

  it('não altera a requisição quando não há token', () => {
    authStub.token = null;
    http.get('/api/ping').subscribe();
    const req = controller.expectOne('/api/ping');
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({});
  });
});
