import { HttpClient } from '@angular/common/http';
import { Injectable, computed, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';

export interface AuthCredentials {
  email: string;
  senha: string;
}

export interface AuthSession {
  token: string;
  tipo: string;
  userId: string;
  nome: string;
  email: string;
}

interface AuthResponse {
  token: string;
  tipo?: string;
  userId: string;
  nome: string;
  email: string;
}

export interface RegisterPayload {
  nome: string;
  email: string;
  senha: string;
}

export interface UserProfile {
  id: string;
  nome: string;
  email: string;
  dataCriado: string;
  emailVerificado: boolean;
  dataVerificado: string | null;
}

export interface PasswordRecoveryPayload {
  email: string;
}

export interface PasswordResetPayload {
  token: string;
  novaSenha: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly storageKey = 'projectflow_auth_session';
  private readonly apiUrl = 'http://localhost:8080/api/auth';
  private readonly session = signal<AuthSession | null>(this.restoreSession());
  readonly session$ = computed(() => this.session());

  constructor(private readonly http: HttpClient) {}

  login(credentials: AuthCredentials): Observable<AuthSession> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, credentials).pipe(
      map((response) => ({
        token: response.token,
        tipo: response.tipo ?? 'Bearer',
        userId: response.userId,
        nome: response.nome,
        email: response.email
      })),
      tap((session) => this.persistSession(session))
    );
  }

  register(payload: RegisterPayload): Observable<UserProfile> {
    return this.http.post<UserProfile>(`${this.apiUrl}/register`, payload);
  }

  requestPasswordRecovery(email: string): Observable<void> {
    const payload: PasswordRecoveryPayload = { email };
    return this.http.post<void>(`${this.apiUrl}/recover`, payload);
  }

  resetPassword(payload: PasswordResetPayload): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/reset-password`, payload);
  }

  verifyEmail(token: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/verify-email`, { token });
  }

  resendVerification(email: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/resend-verification`, { email });
  }

  logout(): void {
    this.session.set(null);
    if (this.isBrowser()) {
      localStorage.removeItem(this.storageKey);
    }
  }

  isAuthenticated(): boolean {
    return Boolean(this.session()?.token);
  }

  currentSession(): AuthSession | null {
    return this.session();
  }

  get token(): string | null {
    return this.session()?.token ?? null;
  }

  getErrorMessage(error: unknown, fallback: string): string {
    if (typeof error === 'object' && error !== null) {
      const responseError = (error as { error?: unknown }).error;

      if (typeof responseError === 'string' && responseError.trim()) {
        return responseError;
      }

      if (responseError && typeof responseError === 'object') {
        const message = (responseError as { message?: string }).message;
        if (message) {
          return message;
        }
      }
    }

    if (error instanceof Error && error.message) {
      return error.message;
    }

    return fallback;
  }

  private persistSession(session: AuthSession): void {
    this.session.set(session);
    if (this.isBrowser()) {
      localStorage.setItem(this.storageKey, JSON.stringify(session));
    }
  }

  private restoreSession(): AuthSession | null {
    if (!this.isBrowser()) {
      return null;
    }

    const stored = localStorage.getItem(this.storageKey);
    if (!stored) {
      return null;
    }

    try {
      return JSON.parse(stored) as AuthSession;
    } catch (error) {
      console.warn('Invalid auth session found in storage', error);
      localStorage.removeItem(this.storageKey);
      return null;
    }
  }

  private isBrowser(): boolean {
    return typeof window !== 'undefined';
  }
}
