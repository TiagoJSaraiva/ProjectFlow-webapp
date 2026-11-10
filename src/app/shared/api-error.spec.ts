import { HttpErrorResponse } from '@angular/common/http';
import { getApiErrorMessage } from './api-error';

function httpError(status: number, body: unknown): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: body, statusText: 'x', url: 'http://api.test/x' });
}

describe('getApiErrorMessage', () => {
  it('prefere o campo message do corpo JSON', () => {
    expect(getApiErrorMessage(httpError(422, { message: 'Nome do nó excede 35 caracteres' }), 'fb')).toBe(
      'Nome do nó excede 35 caracteres'
    );
  });

  it('aceita corpo em texto simples', () => {
    expect(getApiErrorMessage(httpError(400, 'Requisição inválida'), 'fb')).toBe('Requisição inválida');
  });

  it('usa texto padrão por status quando não há message', () => {
    expect(getApiErrorMessage(httpError(401, null), 'fb')).toContain('sessão');
    expect(getApiErrorMessage(httpError(403, {}), 'fb')).toContain('permissão');
    expect(getApiErrorMessage(httpError(404, {}), 'fb')).toContain('não foi encontrado');
  });

  it('informa falta de conexão quando status é 0', () => {
    expect(getApiErrorMessage(httpError(0, null), 'fb')).toContain('conectar ao servidor');
  });

  it('usa o fallback para erros sem informação, sem expor a mensagem técnica do HttpClient', () => {
    expect(getApiErrorMessage(httpError(500, null), 'Falha genérica')).toBe('Falha genérica');
  });

  it('usa a mensagem de um Error comum', () => {
    expect(getApiErrorMessage(new Error('boom'), 'fb')).toBe('boom');
  });
});
