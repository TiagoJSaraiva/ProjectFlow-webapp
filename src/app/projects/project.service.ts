import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuthService } from '../shared/auth/auth.service';
import { CreateProjectPayload, Project } from './project.model';

type DateValue = string | number[] | LocalDateTimeLike | null | undefined;

interface LocalDateTimeLike {
  year?: number;
  monthValue?: number;
  month?: number;
  dayOfMonth?: number;
  day?: number;
  hour?: number;
  minute?: number;
  second?: number;
  nano?: number;
}

type ProjectApiResponse = Omit<Project, 'dataCriado' | 'ultimaAlteracao' | 'ultimoAcesso'> & {
  dataCriado?: DateValue;
  ultimaAlteracao?: DateValue;
  ultimoAcesso?: DateValue;
};

@Injectable({ providedIn: 'root' })
export class ProjectService {
  private readonly baseUrl = 'http://localhost:8080/api/projects';

  constructor(private readonly http: HttpClient, private readonly authService: AuthService) {}

  listByCurrentUser(): Observable<Project[]> {
    const session = this.authService.currentSession();
    if (!session) {
      throw new Error('Usuário não autenticado');
    }
    return this.http.get<ProjectApiResponse[]>(`${this.baseUrl}/user/${session.userId}`).pipe(
      map((projects) =>
        projects
          .map((project) => this.normalizeProjectDates(project))
          .sort((a, b) => this.compareByDate(a.dataCriado, b.dataCriado))
      )
    );
  }

  createProjectWithName(name: string): Observable<Project> {
    const session = this.authService.currentSession();
    if (!session) {
      throw new Error('Usuário não autenticado');
    }

    const payload: CreateProjectPayload = {
      nome: name,
      descricao: ''
    };

    return this.http
      .post<ProjectApiResponse>(`${this.baseUrl}/user/${session.userId}`, payload)
      .pipe(map((project) => this.normalizeProjectDates(project)));
  }

  private normalizeProjectDates(project: ProjectApiResponse): Project {
    return {
      ...project,
      dataCriado: this.resolveDateString(project.dataCriado),
      ultimaAlteracao: this.resolveDateString(project.ultimaAlteracao),
      ultimoAcesso: this.resolveDateString(project.ultimoAcesso),
      totalTarefas: project.totalTarefas ?? 0
    };
  }

  private resolveDateString(value: DateValue): string {
    if (!value) {
      return '';
    }

    if (typeof value === 'string') {
      const normalized = value.includes('T') ? value : value.replace(' ', 'T');
      const withTimezone = this.ensureTimezone(normalized);
      const parsed = new Date(withTimezone);
      return Number.isNaN(parsed.getTime()) ? withTimezone : parsed.toISOString();
    }

    if (Array.isArray(value)) {
      return this.fromArray(value);
    }

    const year = this.safeNumber(value.year);
    const month = this.safeNumber(value.monthValue ?? value.month);
    const day = this.safeNumber(value.dayOfMonth ?? value.day);
    const hour = this.safeNumber(value.hour) ?? 0;
    const minute = this.safeNumber(value.minute) ?? 0;
    const second = this.safeNumber(value.second) ?? 0;
    const nano = this.safeNumber(value.nano) ?? 0;
    const millisecond = Math.floor(nano / 1_000_000);

    if (year === undefined || month === undefined || day === undefined) {
      return '';
    }

    const timestamp = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
  }

  private compareByDate(a?: string, b?: string): number {
    const timeA = this.toTimeValue(a);
    const timeB = this.toTimeValue(b);
    return timeB - timeA;
  }

  private toTimeValue(value?: string): number {
    if (!value) {
      return 0;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
  }

  private safeNumber(value?: number): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }

  private ensureTimezone(value: string): string {
    const hasTimezone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value);
    return hasTimezone ? value : `${value}Z`;
  }

  private fromArray(parts: number[]): string {
    const [year, month, day, hour = 0, minute = 0, second = 0, nano = 0] = parts;

    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
      return '';
    }

    const millis = Math.floor((Number.isFinite(nano) ? nano : 0) / 1_000_000);
    const timestamp = Date.UTC(year, month - 1, day, hour, minute, second, millis);
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
  }
}
