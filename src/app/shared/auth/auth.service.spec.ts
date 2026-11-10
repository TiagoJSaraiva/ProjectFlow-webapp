import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from '../api-config';
import { AuthService } from './auth.service';

const STORAGE_KEY = 'projectflow_auth_session';
const API = 'http://api.test';

describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;

  function setup(): void {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: API }
      ]
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  }

  beforeEach(() => localStorage.removeItem(STORAGE_KEY));
  afterEach(() => {
    http?.verify();
    localStorage.removeItem(STORAGE_KEY);
  });

  it('inicia sem sessão quando o armazenamento está vazio', () => {
    setup();
    expect(service.isAuthenticated()).toBeFalse();
    expect(service.token).toBeNull();
  });

  it('restaura a sessão salva no localStorage', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ token: 'abc', tipo: 'Bearer', userId: 'u1', nome: 'Ana', email: 'ana@x.com' })
    );
    setup();
    expect(service.isAuthenticated()).toBeTrue();
    expect(service.token).toBe('abc');
  });

  it('ignora e remove uma sessão corrompida', () => {
    localStorage.setItem(STORAGE_KEY, '{not-json');
    spyOn(console, 'warn');
    setup();
    expect(service.isAuthenticated()).toBeFalse();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('faz login na URL configurada e persiste a sessão', () => {
    setup();
    let result: unknown;
    service.login({ email: 'ana@x.com', senha: '123456' }).subscribe((s) => (result = s));

    const req = http.expectOne(`${API}/api/auth/login`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'ana@x.com', senha: '123456' });
    req.flush({ token: 'tok', userId: 'u1', nome: 'Ana', email: 'ana@x.com' });

    expect(result).toEqual({ token: 'tok', tipo: 'Bearer', userId: 'u1', nome: 'Ana', email: 'ana@x.com' });
    expect(service.token).toBe('tok');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).token).toBe('tok');
  });

  it('não cria sessão quando o login falha', () => {
    setup();
    service.login({ email: 'a@x.com', senha: 'errada' }).subscribe({ error: () => undefined });
    http.expectOne(`${API}/api/auth/login`).flush({ message: 'Credenciais inválidas' }, { status: 422, statusText: 'Unprocessable' });
    expect(service.isAuthenticated()).toBeFalse();
  });

  it('logout limpa a sessão em memória e no armazenamento', () => {
    setup();
    service.login({ email: 'a@x.com', senha: '1' }).subscribe();
    http.expectOne(`${API}/api/auth/login`).flush({ token: 't', userId: 'u', nome: 'N', email: 'a@x.com' });

    service.logout();

    expect(service.isAuthenticated()).toBeFalse();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('envia cadastro, recuperação, redefinição e verificação para os endpoints corretos', () => {
    setup();
    service.register({ nome: 'Ana', email: 'a@x.com', senha: '123456' }).subscribe();
    expect(http.expectOne(`${API}/api/auth/register`).request.method).toBe('POST');

    service.requestPasswordRecovery('a@x.com').subscribe();
    expect(http.expectOne(`${API}/api/auth/recover`).request.body).toEqual({ email: 'a@x.com' });

    service.resetPassword({ token: 't', novaSenha: 'nova123' }).subscribe();
    expect(http.expectOne(`${API}/api/auth/reset-password`).request.body).toEqual({ token: 't', novaSenha: 'nova123' });

    service.verifyEmail('t').subscribe();
    expect(http.expectOne(`${API}/api/auth/verify-email`).request.body).toEqual({ token: 't' });

    service.resendVerification('a@x.com').subscribe();
    expect(http.expectOne(`${API}/api/auth/resend-verification`).request.body).toEqual({ email: 'a@x.com' });
  });

  describe('getErrorMessage', () => {
    beforeEach(() => setup());

    it('usa o campo message do corpo JSON', () => {
      expect(service.getErrorMessage({ error: { message: 'Email já cadastrado' } }, 'fallback')).toBe('Email já cadastrado');
    });

    it('aceita corpo em texto', () => {
      expect(service.getErrorMessage({ error: 'Erro simples' }, 'fallback')).toBe('Erro simples');
    });

    it('usa o fallback quando não há mensagem', () => {
      expect(service.getErrorMessage({ error: {} }, 'fallback')).toBe('fallback');
      expect(service.getErrorMessage(null, 'fallback')).toBe('fallback');
    });
  });
});
