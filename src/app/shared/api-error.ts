import { HttpErrorResponse } from '@angular/common/http';

const STATUS_MESSAGES: Record<number, string> = {
  401: 'Sua sessão expirou ou é inválida. Entre novamente.',
  403: 'Você não tem permissão para realizar esta ação.',
  404: 'O recurso solicitado não foi encontrado.'
};

/**
 * Extrai uma mensagem amigável de um erro de API. O servidor responde com JSON `{ message }`;
 * quando não há mensagem usa-se um texto padrão por status e, por fim, o fallback do chamador.
 */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.';
    }
    const fromBody = messageFromBody(error.error);
    return fromBody ?? STATUS_MESSAGES[error.status] ?? fallback;
  }

  if (typeof error === 'object' && error !== null && 'error' in error) {
    const fromBody = messageFromBody((error as { error?: unknown }).error);
    if (fromBody) {
      return fromBody;
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

function messageFromBody(body: unknown): string | null {
  if (typeof body === 'string' && body.trim()) {
    return body.trim();
  }
  if (body && typeof body === 'object') {
    const message = (body as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message.trim();
    }
  }
  return null;
}
